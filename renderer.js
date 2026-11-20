'use strict';

/* Desktop UI and media acquisition. Entirely local/offline HTML; the IPC
 * bridge performs all HTTPS requests and keeps account tokens hidden.
 */
(() => {
  const $ = id => document.getElementById(id);
  const FORM = $('setupPanel');
  let profile = null, capture = null, stopped = false;
  let state = {};
  let recent = '';
  let finishingRequest = false;
  let meterInterval = null, clockInterval = null;
  let activeSystemAnalyser = null, activeMicAnalyser = null;
  const BRIDGE = window.fileo;
  const HOST = 'https://file-o.com';

  function setStatus(text, error = false, target = 'status') {
    const output = $(target);
    output.textContent = String(text || '');
    output.classList.toggle('error', error);
  }
  function permissionError(kind, message, autoOpenSettings = false) {
    const err = Error(message);
    err.permissionKind = kind;
    err.autoOpenSettings = autoOpenSettings;
    return err;
  }
  let permissionKind = 'system';
  function hideAudioPermissions() {
    const box = $('audioPermissionPanel');
    if (box) box.hidden = true;
  }
  function showAudioPermissions(kind) {
    if (BRIDGE.platform !== 'darwin') return;
    permissionKind = kind === 'microphone' ? 'microphone' : 'system';
    const mic = permissionKind === 'microphone';
    $('audioPermissionTitle').textContent = mic
      ? 'Разрешите доступ к микрофону'
      : 'Разрешите запись звука компьютера';
    $('audioPermissionText').textContent = mic
      ? 'macOS не разрешила записывать ваш голос. Откройте настройки и включите FILE-O Meet в разделе «Микрофон».'
      : 'macOS не выдала системную аудиодорожку. Разрешите FILE-O Meet записывать системный звук, затем попробуйте снова.';
    $('audioPermissionStatus').textContent = '';
    $('audioPermissionPanel').hidden = false;
  }
  function startState(connected) {
    $('pairPanel').hidden = connected;
    $('meetingPanel').hidden = !connected;
  }
  function updateValidation() {
    $('start').disabled = Boolean(capture?.active) ||
      !$('consent').checked ||
      (!$('systemSound').checked && !$('microphone').checked);
  }
  function toggleButton(button, running) {
    button.disabled = Boolean(running);
    button.setAttribute('aria-busy', String(Boolean(running)));
  }
  function prettyClock(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    return (h ? String(h).padStart(2, '0') + ':' : '') +
      String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' +
      String(s % 60).padStart(2, '0');
  }
  function stopMeters() {
    if (meterInterval) clearInterval(meterInterval);
    meterInterval = null;
    activeSystemAnalyser = null;
    activeMicAnalyser = null;
    $('systemLevel').style.width = '0%';
    $('microphoneLevel').style.width = '0%';
  }
  function setMeterLevel(element, analyser) {
    if (!analyser) {
      element.style.width = '0%';
      return 0;
    }
    const audio = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(audio);
    let sum = 0;
    for (const sample of audio) {
      const amplitude = (sample - 128) / 128;
      sum += amplitude * amplitude;
    }
    const rms = Math.sqrt(sum / audio.length);
    const width = Math.max(0, Math.min(100, 350 * rms));
    element.style.width = width.toFixed(1) + '%';
    return width;
  }
  function beginMeters() {
    stopMeters();
    meterInterval = setInterval(() => {
      const level1 = setMeterLevel($('systemLevel'), activeSystemAnalyser);
      const level2 = setMeterLevel($('microphoneLevel'), activeMicAnalyser);
      const strength = Math.min(1, Math.max(level1, level2) / 60);
      document.querySelectorAll('.wave-bars span').forEach((bar, i) => {
        const variant = (Math.sin(i * 1.3 + performance.now() / 270) + 1) / 2;
        bar.style.height = (13 + 83 * variant * strength) + '%';
      });
    }, 240);
  }
  function showPanel(mode) {
    FORM.hidden = mode !== 'setup';
    $('livePanel').hidden = mode !== 'live';
    $('processingPanel').hidden = mode !== 'processing';
    $('recordIndicator').hidden = mode !== 'live';
  }
  function showRecording(name) {
    showPanel('live');
    $('liveTitle').textContent = name || 'Рабочая встреча';
    $('liveState').textContent = 'Идёт запись звука и распознавание речи';
    $('highlight').disabled = false;
    $('stop').disabled = false;
    $('highlight').classList.remove('active');
    $('highlightText').textContent = 'Выделить важный момент';
    const placeholder = document.createElement('div');
    placeholder.className = 'transcript-placeholder';
    placeholder.textContent = 'После обработки первого фрагмента здесь появится текст разговора.';
    $('transcript').replaceChildren(placeholder);
    recent = '';
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(() => {
      if (!capture?.active) return;
      const diff = (performance.now() - capture.startedAt) / 1000;
      $('clock').textContent = prettyClock(diff);
      if (diff > 12 * 3600) stopCapture();
    }, 500);
  }
  function showProcessing(line) {
    showPanel('processing');
    $('processingText').textContent = line ||
      'Звук отправлен. FILE-O собирает расшифровку и протокол.';
    $('viewReport').hidden = !state.reportJobId;
    $('newMeeting').hidden = true;
    if (clockInterval) clearInterval(clockInterval);
    stopMeters();
  }
  function showDone(message) {
    showPanel('processing');
    $('processingTitle').textContent = state.state === 'error' ?
      'Не удалось завершить обработку' : 'Протокол готов';
    $('processingText').textContent = message ||
      'Все результаты доступны в личном кабинете FILE-O.';
    $('viewReport').hidden = !state.reportJobId;
    $('newMeeting').hidden = false;
  }
  function renderLiveTranscript(lines) {
    const target = $('transcript');
    if (!Array.isArray(lines) || !lines.length) return;
    const fragment = document.createDocumentFragment();
    for (const line of lines.slice(-110)) {
      if (!line || typeof line.text !== 'string') continue;
      const row = document.createElement('div');
      row.className = 'live-transcript-row';
      const label = document.createElement('span');
      label.className = 'live-transcript-time';
      label.textContent = prettyClock(line.start);
      const text = document.createElement('p');
      text.textContent = line.text;
      row.append(label,text);
      fragment.append(row);
    }
    target.replaceChildren(fragment);
    target.scrollTop = target.scrollHeight;
  }
  function applyUpdate(message) {
    if (!message) return;
    state = { ...state, ...message };
    const strip = $('connectionState');
    if (strip) {
      const mode = state.recording || capture?.active ? 'recording' :
        ['uploading','processing'].includes(state.state) ? 'processing' :
        state.state === 'error' ? 'error' : 'ready';
      const labels = {
        recording: 'Идёт запись', processing: 'Обработка записи',
        error: 'Требуется проверка', ready: 'Готово к работе'
      };
      strip.className = 'strip-status ' + mode;
      strip.lastChild.textContent = ' ' + labels[mode];
    }
    const active = Boolean(state.recording || capture?.active);
    $('recordIndicator').hidden = !active;
    if (Number.isFinite(state.processed)) $('processedCount').textContent = state.processed;
    if (Number.isFinite(state.received)) {
      $('receivedCount').textContent = state.received;
      $('fragmentCount').textContent = 'Фрагментов: ' +
        String(state.processed || 0) + ' из ' + String(state.received);
    }
    if (state.markerMessage) {
      $('highlightNotice').hidden = false;
      $('highlightNotice').textContent = state.markerMessage;
    }
    $('highlight').classList.toggle('active', Boolean(state.markerActive));
    $('highlightText').textContent = state.markerActive ?
      'Завершить важный момент' :
      'Выделить важный момент' + (state.markerCount ? ' · ' + state.markerCount : '');
    const text = String(state.recent || '');
    if (Array.isArray(state.liveSegments) && state.liveSegments.length) {
      const key = state.liveSegments.length + ':' +
        String(state.liveSegments[state.liveSegments.length-1]?.text || '').slice(-35);
      if (recent !== key) {
        recent = key;
        renderLiveTranscript(state.liveSegments);
      }
    } else if (text && text !== recent) {
      recent = text;
      $('transcript').textContent = text;
      $('transcript').scrollTop = $('transcript').scrollHeight;
    }
    if (state.state === 'done') {
      showDone('Полная расшифровка, конспект, решения и задачи сохранены.');
    } else if (state.state === 'error') {
      showDone(state.error || 'Не удалось обработать запись.');
    } else if (state.state === 'uploading' || state.state === 'processing') {
      showProcessing(state.line);
    } else if (active) {
      showPanel('live');
    }
    if (state.error && (state.state === 'recording' || state.state === 'uploading')) {
      setStatus(state.error, true);
    } else if (state.line && state.state !== 'done') {
      setStatus(state.line);
    }
  }
  async function getProfile() {
    const value = await BRIDGE.profile();
    if (!value.connected) {
      profile = null;
      startState(false);
      return;
    }
    profile = value;
    $('accountEmail').textContent = value.email || 'FILE-O';
    $('accountPlan').textContent = value.plan + ' · ' + value.model;
    startState(true);
  }
  function stopLocalStreams() {
    if (!capture) return;
    if (capture.systemStream) capture.systemStream.getTracks().forEach(track => track.stop());
    if (capture.micStream) capture.micStream.getTracks().forEach(track => track.stop());
    if (capture.ctx) capture.ctx.close().catch(() => {});
    capture.systemStream = capture.micStream = capture.ctx = null;
    stopMeters();
  }
  function mimeType() {
    for (const value of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported(value)) {
        return { actual: value, send: value.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm' };
      }
    }
    throw Error('Данная версия системы не поддерживает запись аудио в формате WebM или MP4.');
  }
  async function beginCapture() {
    const system = $('systemSound').checked;
    const mic = $('microphone').checked;
    if (!system && !mic) throw Error('Выберите хотя бы один источник звука.');
    const title = $('subject').value.trim();
    const count = $('participants').value.trim();
    if (title.length < 3 || title.length > 120) {
      throw Error('Введите тему встречи длиной от 3 до 120 символов.');
    }
    if (count && (!/^(?:[1-9]|[1-9][0-9]|100)$/.test(count))) {
      throw Error('Количество участников должно быть от 1 до 100.');
    }
    if (!$('consent').checked) throw Error('Подтвердите уведомление участников.');
    if (!window.isSecureContext || !navigator.mediaDevices) {
      throw Error('Операционная система запретила доступ к записи звука.');
    }
    const mime = mimeType();
    const draft = {
      active: false, stopping: false, startedAt: 0, nextSeq: 0,
      recorder: null, systemStream: null, micStream: null, ctx: null,
      pending: new Set(), mime, title, id: null
    };
    capture = draft;
    let serverStarted = false;
    try {
      // Must be called FIRST, directly in the user's Start click: macOS uses
      // a native picker and needs transient user activation.
      if (system) {
        // On macOS, getDisplayMedia triggers the native system picker and
        // the one-time permission prompt on first use. Do not replace it
        // with a custom silent desktopCapturer source selection.
        try {
          draft.systemStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true, video: { width: 320, height: 180, frameRate: 2 }
          });
        } catch (error) {
          if (BRIDGE.platform === 'darwin' &&
              ['NotAllowedError','PermissionDeniedError','AbortError'].includes(error?.name)) {
            throw permissionError('system',
              'Запись звука компьютера не разрешена. Разрешите доступ в macOS или повторите выбор источника.');
          }
          throw error;
        }
        const track = draft.systemStream.getAudioTracks()[0];
        if (!track || track.readyState !== 'live') {
          throw permissionError('system',
            'macOS не предоставила рабочую аудиодорожку. Разрешите запись системного звука и повторите попытку.',
            BRIDGE.platform === 'darwin');
        }
      }
      if (mic) {
        const allowed = await BRIDGE.microphonePermission();
        if (!allowed) {
          throw permissionError('microphone',
            'Доступ к микрофону не разрешён. Откройте настройки macOS и разрешите FILE-O Meet использовать микрофон.');
        }
        try {
          draft.micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
          });
        } catch (error) {
          if (BRIDGE.platform === 'darwin' &&
              ['NotAllowedError','PermissionDeniedError'].includes(error?.name)) {
            throw permissionError('microphone',
              'macOS не разрешила использовать микрофон. Включите доступ в настройках.');
          }
          throw error;
        }
        if (!draft.micStream.getAudioTracks().some(track => track.readyState === 'live')) {
          throw permissionError('microphone',
            'Микрофон не предоставил рабочую аудиодорожку.');
        }
      }
      draft.ctx = new AudioContext({ latencyHint: 'interactive' });
      const mix = draft.ctx.createMediaStreamDestination();
      if (draft.systemStream) {
        const source = draft.ctx.createMediaStreamSource(draft.systemStream);
        const analyser = draft.ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        source.connect(mix);
        activeSystemAnalyser = analyser;
      }
      if (draft.micStream) {
        const source = draft.ctx.createMediaStreamSource(draft.micStream);
        const analyser = draft.ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        source.connect(mix);
        activeMicAnalyser = analyser;
      }
      await draft.ctx.resume();
      if (draft.ctx.state !== 'running') throw Error('Не удалось активировать аудиосистему.');
      draft.mixed = mix.stream;
      const response = await BRIDGE.start({
        title, participant_count: count ? Number(count) : null,
        participants_informed: true, microphone: mic
      });
      serverStarted = true;
      draft.id = response.id;
      draft.startedAt = performance.now();
      draft.active = true;
      beginMeters();
      showRecording(title);
      window.dispatchEvent(new CustomEvent('fileo:record-started'));
      startRecorder(draft);
      draft.systemStream?.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (draft.active) {
            setStatus('Системная аудиодорожка отключилась. Завершаем встречу.', true);
            stopCapture();
          }
        });
      });
      setStatus('Запись идёт. Можно закрыть окно и оставить приложение в трее.');
    } catch (error) {
      if (serverStarted) {
        // No chunk was recorded. The server will safely close the empty job.
        try { await BRIDGE.stop(); } catch (_) {}
      }
      stopLocalStreams();
      capture = null;
      stopMeters();
      throw error;
    }
  }
  function startRecorder(draft) {
    if (draft !== capture || !draft.active || draft.stopping) return;
    const currentSeq = draft.nextSeq++;
    const offsetMs = Math.round(performance.now() - draft.startedAt);
    const pieces = [];
    const recorder = new MediaRecorder(draft.mixed, {
      mimeType: draft.mime.actual, audioBitsPerSecond: 64000
    });
    draft.recorder = recorder;
    recorder.addEventListener('dataavailable', event => {
      if (event.data?.size) pieces.push(event.data);
    });
    recorder.addEventListener('error', () => {
      setStatus('Ошибка кодирования звука. Запись будет остановлена.', true);
      stopCapture();
    });
    recorder.addEventListener('stop', () => {
      // A new recorder creates a self-contained WebM/MP4, not partial WebM slices.
      if (draft.active && !draft.stopping) startRecorder(draft);
      const blob = new Blob(pieces, { type: draft.mime.send });
      const write = async () => {
        if (!blob.size) return;
        const data = await blob.arrayBuffer();
        await BRIDGE.queueChunk({
          sequence: currentSeq, offsetMs, mime: draft.mime.send, data
        });
      };
      const task = write().catch(error => {
        setStatus('Не удалось сохранить аудиофрагмент: ' + error.message, true);
        if (draft.active) stopCapture();
        draft.writeFailed = true;
      }).finally(() => {
        draft.pending.delete(task);
        if (draft.stopping) finalizeStop(draft);
      });
      draft.pending.add(task);
      if (draft.stopping) finalizeStop(draft);
    });
    recorder.start();
    draft.timer = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, 25000);
  }
  async function finalizeStop(draft) {
    if (draft !== capture || !draft.stopping || draft.finishing ||
        draft.recorder?.state === 'recording' || draft.pending.size) {
      return;
    }
    draft.finishing = true;
    stopLocalStreams();
    if (draft.writeFailed) {
      setStatus('Часть аудиозаписи не сохранилась. Проверьте свободное место на диске.', true);
    }
    try {
      await BRIDGE.stop();
      stopped = true;
      capture = null;
      showProcessing('Передаём оставшиеся фрагменты на FILE-O. ' +
        'После обработки появится готовый протокол.');
    } catch (error) {
      setStatus('Ошибка завершения: ' + error.message, true);
    }
  }
  async function stopCapture() {
    const draft = capture;
    if (!draft || draft.stopping) return;
    draft.stopping = true;
    draft.active = false;
    if (draft.timer) clearTimeout(draft.timer);
    toggleButton($('stop'), true);
    $('highlight').disabled = true;
    $('liveState').textContent = 'Сохраняем последнюю часть записи…';
    if (draft.recorder?.state === 'recording') {
      draft.recorder.stop();
    } else {
      await finalizeStop(draft);
    }
  }
  async function highlight() {
    if (!capture?.active) return;
    const button = $('highlight');
    toggleButton(button, true);
    try {
      const result = await BRIDGE.highlight();
      button.classList.toggle('active', Boolean(result.active));
      $('highlightText').textContent = result.active ?
        'Завершить важный момент' : 'Выделить важный момент';
      $('highlightNotice').hidden = false;
      $('highlightNotice').textContent = result.active ?
        'Момент начат: добавлены предыдущие 20 секунд. Нажмите ещё раз для завершения.' :
        'Момент сохранён. Отдельный анализ появится в протоколе.';
    } catch (error) {
      setStatus('Ошибка выделения: ' + error.message, true);
    } finally { toggleButton(button, false); }
  }
  async function restoreUI() {
    await getProfile();
    const previous = await BRIDGE.getState();
    state = previous;
    if (previous.session || ['uploading', 'processing'].includes(previous.state)) {
      showProcessing(previous.line);
      $('processedCount').textContent = String(previous.processed || 0);
      $('receivedCount').textContent = String(previous.received || 0);
    } else if (previous.state === 'done' || previous.state === 'error') {
      showDone(previous.line);
    } else { showPanel('setup'); }
    if (previous.recent) recent = previous.recent;
    applyUpdate(previous);
    updateValidation();
  }
  $('pair').addEventListener('click', async () => {
    const code = $('pairCode').value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) {
      setStatus('Введите десятисимвольный код из FILE-O.', true, 'pairNotice');
      return;
    }
    toggleButton($('pair'), true);
    try {
      const info = await BRIDGE.pair(code);
      $('pairCode').value = '';
      $('accountEmail').textContent = info.email;
      $('accountPlan').textContent = info.plan + ' · ' + info.model;
      await getProfile();
      showPanel('setup');
      window.dispatchEvent(new CustomEvent('fileo:connected'));
      setStatus('Аккаунт подключён.');
    } catch (error) {
      setStatus(error.message, true, 'pairNotice');
    } finally { toggleButton($('pair'), false); }
  });
  $('pairCode').addEventListener('keydown', event => {
    if (event.key === 'Enter') $('pair').click();
  });
  $('getCode').addEventListener('click', () => BRIDGE.open(HOST + '/meeting#connect'));
  $('disconnect').addEventListener('click', async () => {
    if (capture?.active) {
      setStatus('Сначала завершите текущую запись.', true);
      return;
    }
    try { await BRIDGE.disconnect(); await getProfile(); showPanel('setup');
      window.dispatchEvent(new CustomEvent('fileo:disconnected')); }
    catch (error) { setStatus(error.message, true); }
  });
  for (const id of ['consent', 'systemSound', 'microphone']) {
    $(id).addEventListener('change', updateValidation);
  }
  async function openRecordingSettings(kind) {
    const result = await BRIDGE.openRecordingSettings(kind);
    if (!result?.opened) {
      $('audioPermissionStatus').textContent =
        'Не удалось открыть настройки автоматически. Откройте «Системные настройки → Конфиденциальность и безопасность» вручную.';
      return false;
    }
    $('audioPermissionStatus').textContent =
      'Настройки macOS открыты. Разрешите доступ FILE-O Meet, затем вернитесь сюда. При необходимости перезапустите приложение.';
    return true;
  }
  $('openAudioSettings').addEventListener('click', async () => {
    const button = $('openAudioSettings');
    toggleButton(button, true);
    try { await openRecordingSettings(permissionKind); }
    catch (_) {
      $('audioPermissionStatus').textContent =
        'Не удалось открыть настройки macOS. Откройте их вручную через меню Apple.';
    } finally { toggleButton(button, false); }
  });
  $('retryAudioPermission').addEventListener('click', () => {
    if (!$('start').disabled) $('start').click();
  });
  $('restartAfterPermission').addEventListener('click', async () => {
    const button = $('restartAfterPermission');
    toggleButton(button, true);
    $('audioPermissionStatus').textContent = 'Перезапускаем FILE-O Meet с обновлёнными разрешениями…';
    try {
      await BRIDGE.restartForPermissions();
    } catch (error) {
      $('audioPermissionStatus').textContent =
        error.message || 'Не удалось перезапустить приложение.';
      toggleButton(button, false);
    }
  });
  $('start').addEventListener('click', async () => {
    hideAudioPermissions();
    toggleButton($('start'), true);
    try { await beginCapture(); }
    catch (error) {
      setStatus(error.message, true);
      if (error.permissionKind && BRIDGE.platform === 'darwin') {
        showAudioPermissions(error.permissionKind);
        // A dead audio track means macOS silently refused CoreAudio Tap.
        // Open the correct privacy pane automatically once, without ever
        // modifying permissions or starting recording behind the user's back.
        if (error.autoOpenSettings) {
          try { await openRecordingSettings(error.permissionKind); }
          catch (_) {
            $('audioPermissionStatus').textContent =
              'Откройте настройки macOS кнопкой выше.';
          }
        }
      }
    }
    finally { toggleButton($('start'), false); updateValidation(); }
  });
  $('stop').addEventListener('click', stopCapture);
  $('highlight').addEventListener('click', highlight);
  BRIDGE.onStopRequest(() => { if (capture?.active) stopCapture(); });
  BRIDGE.onUpdate(applyUpdate);
  $('openCabinet').addEventListener('click', () => BRIDGE.open(HOST + '/account?section=telemost'));
  $('openLibrary').addEventListener('click', () => BRIDGE.open(HOST + '/account?section=telemost'));
  // Mac App Store builds do not direct users to an external purchase page.
  if (BRIDGE.isMacAppStore) $('openPricing').remove();
  else $('openPricing').addEventListener('click', () => BRIDGE.open(HOST + '/pricing'));
  $('help').addEventListener('click', () => BRIDGE.open(HOST + '/meeting'));
  $('viewReport').addEventListener('click', () => {
    const id = state.completedMeetingId || state.meetingId;
    if (id) BRIDGE.open(HOST + '/account?section=telemost&meeting=' + encodeURIComponent(id));
  });
  $('newMeeting').addEventListener('click', async () => {
    try {
      const latest = await BRIDGE.getState();
      if (latest.session) {
        setStatus('Предыдущее задание ещё завершается. Проверьте статус и повторите.', true);
        return;
      }
      state = { state: 'idle', recording: false, busy: false };
      $('newMeeting').hidden = true;
      $('consent').checked = false;
      $('highlightNotice').hidden = true;
      $('highlightText').textContent = 'Выделить важный момент';
      showPanel('setup');
      updateValidation();
      setStatus('Можно записать новую встречу.');
    } catch (error) {
      setStatus(error.message || 'Не удалось начать новую встречу.', true);
    }
  });
  restoreUI().catch(error => setStatus('Не удалось загрузить аккаунт: ' + error.message, true));
})();
