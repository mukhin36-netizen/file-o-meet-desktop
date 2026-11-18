'use strict';

/* FILE-O Meeting Desktop — application and durable upload coordinator.
 * Never loads remote content inside Electron, never records without an
 * explicit Start click, and stores pending audio encrypted per session.
 */
const {
  app, BrowserWindow, ipcMain, shell, session, desktopCapturer,
  safeStorage, nativeImage, Tray, Menu, Notification, clipboard, screen,
  powerSaveBlocker, systemPreferences, net, dialog
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HOST = 'https://file-o.com';
const VERSION = '0.6.2';
const CHUNK_MAX = 6 * 1024 * 1024;
const MAX_CAPTURE_MS = 12 * 3600 * 1000;
const API_TIMEOUT_MS = 30000;
const STATUS_INTERVAL_MS = 5500;
const RETRY_INTERVAL_MS = 6500;

let window = null, tray = null, token = null;
let queueState = null, sessionKey = null, draining = false;
let restoreInProgress = false, lastSeen = -1;
let statusTimer = null, retryTimer = null, blockerId = null;
let lastInfo = { recording: false, busy: false, state: 'idle', line: 'Подключите аккаунт FILE-O' };
let quitting = false;

const safePath = (...segments) => path.join(app.getPath('userData'), ...segments);
const sessionFilename = () => safePath('session-state.json');
const credentialsFilename = () => safePath('connection.json');
const queueFolder = () => safePath('pending-audio');

function logError(context, error) {
  // Never log tokens, incoming speech or raw provider response bodies.
  console.error('[FILE-O]', context, error?.name || 'Error');
}
function ensurePrivateFolder(folder) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(folder, 0o700); } catch (_) {}
}
function writePrivate(file, buffer) {
  ensurePrivateFolder(path.dirname(file));
  const tmp = file + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, buffer, { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch (_) {}
}
function writeJson(file, data) {
  writePrivate(file, Buffer.from(JSON.stringify(data), 'utf8'));
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}
function encryptedString(clear) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw Error('Недоступно безопасное хранилище системы. Повторите запуск после входа в учётную запись Windows или macOS.');
  }
  return safeStorage.encryptString(clear).toString('base64');
}
function decryptedString(cipher) {
  if (!cipher || typeof cipher !== 'string') return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(cipher, 'base64')); }
  catch (_) { return null; }
}
function loadCredentials() {
  const content = readJson(credentialsFilename());
  token = decryptedString(content?.encryptedToken) || null;
  return Boolean(token);
}
function persistToken(value) {
  if (!/^fom1_[A-Za-z0-9_-]{25,80}$/.test(value)) {
    throw Error('Сервер вернул некорректный ключ подключения.');
  }
  writeJson(credentialsFilename(), { encryptedToken: encryptedString(value), version: 1 });
  token = value;
}
function clearCredentials() {
  token = null;
  try { fs.rmSync(credentialsFilename(), { force: true }); } catch (_) {}
}
function generateSessionKey() {
  const secret = crypto.randomBytes(32);
  return { raw: secret, encrypted: encryptedString(secret.toString('base64')) };
}
function recoverSessionState() {
  const content = readJson(sessionFilename());
  if (!content || !/^[A-Za-z0-9_-]{15,55}$/.test(content.meetingId || '')) {
    return;
  }
  const plaintext = decryptedString(content.encryptedKey);
  if (!plaintext) {
    lastInfo = { ...lastInfo, state: 'interrupted',
      error: 'Не удалось восстановить шифрование аудиофрагментов. Проверьте системное хранилище.' };
    return;
  }
  const key = Buffer.from(plaintext, 'base64');
  if (key.length !== 32) return;
  sessionKey = key;
  queueState = content;
  // Never start recording after process restart without an explicit click.
  queueState.recording = false;
  queueState.finishRequested = true;
  queueState.recovering = true;
  writeJson(sessionFilename(), queueState);
  lastSeen = -1;
  lastInfo = { ...lastInfo, busy: true, recording: false, state: 'uploading',
    line: 'Восстанавливаем отправку записи после перезапуска…',
    meetingId: queueState.meetingId };
}
function encryptAudio(clear) {
  if (!sessionKey || sessionKey.length !== 32) throw Error('Сеанс шифрования не открыт.');
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce);
  const body = Buffer.concat([cipher.update(clear), cipher.final()]);
  return Buffer.concat([Buffer.from('FOM1'), nonce, cipher.getAuthTag(), body]);
}
function decryptAudio(payload) {
  if (!sessionKey || sessionKey.length !== 32) throw Error('Нет ключа аудио.');
  if (payload.length < 32 || payload.subarray(0, 4).toString('ascii') !== 'FOM1') {
    throw Error('Повреждён локальный аудиофрагмент.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey,
    payload.subarray(4, 16));
  decipher.setAuthTag(payload.subarray(16, 32));
  return Buffer.concat([decipher.update(payload.subarray(32)), decipher.final()]);
}
function sendToUI(update) {
  lastInfo = { ...lastInfo, ...update };
  try { if (window && !window.isDestroyed()) window.webContents.send('meeting:update', lastInfo); }
  catch (_) {}
  updateTray();
}
function recordStarted() {
  if (blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
  }
}
function recordEnded() {
  if (blockerId !== null) {
    try { powerSaveBlocker.stop(blockerId); } catch (_) {}
    blockerId = null;
  }
}
function notify(message) {
  try {
    if (Notification.isSupported()) new Notification({
      title: 'FILE-O Meeting', body: message, icon: path.join(__dirname, 'assets', 'fileo.png')
    }).show();
  } catch (_) {}
}
function closeSessionStorage() {
  const id = queueState?.meetingId;
  queueState = null;
  sessionKey = null;
  lastSeen = -1;
  try { fs.rmSync(sessionFilename(), { force: true }); } catch (_) {}
  if (id) {
    try { fs.rmSync(path.join(queueFolder(), id), { recursive: true, force: true }); }
    catch (_) {}
  }
  recordEnded();
}
function stopTimers() {
  for (const timer of [statusTimer, retryTimer]) if (timer) clearInterval(timer);
  statusTimer = retryTimer = null;
}
function startTimers() {
  stopTimers();
  retryTimer = setInterval(() => drainPending().catch(err => logError('upload', err)), RETRY_INTERVAL_MS);
  statusTimer = setInterval(() => pollMeeting().catch(err => logError('status', err)), STATUS_INTERVAL_MS);
}
function validRemoteUrl(url) {
  try {
    const parsed = new URL(url);
    if (process.mas === true && parsed.pathname.startsWith('/pricing')) return false;
    return parsed.origin === HOST && /^\/(account|meeting|pricing|utility\/speech-to-text)/.test(parsed.pathname);
  } catch (_) { return false; }
}
function openExternal(url) {
  if (!validRemoteUrl(url)) throw Error('Недопустимый адрес.');
  return shell.openExternal(url);
}
async function request(relative, method = 'GET', payload = null, extra = {}, requireAuth = true) {
  if (!relative.startsWith('/api/meeting/') || relative.includes('..') || relative.includes('://')) {
    throw Error('Недопустимый метод запроса.');
  }
  if (requireAuth && !token) throw Error('Сначала подключите аккаунт.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const headers = {
      'X-Fileo-Meeting': '1',
      'Cache-Control': 'no-store',
      ...(requireAuth ? { 'Authorization': 'Bearer ' + token } : {}),
      ...extra
    };
    const body = payload === null ? undefined : Buffer.isBuffer(payload) ?
      payload : JSON.stringify(payload);
    if (body && !Buffer.isBuffer(body)) headers['Content-Type'] = 'application/json';
    const response = await net.fetch(HOST + relative, {
      method, headers, body, credentials: 'omit', cache: 'no-store', signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {}
    if (!response.ok) {
      const err = new Error(typeof data.detail === 'string' ? data.detail :
        response.status === 401 ? 'Срок подключения истёк. Получите новый код на FILE-O.' :
        response.status >= 500 ? 'Сервер FILE-O временно недоступен. Повторим отправку.' :
        'Не удалось выполнить операцию.');
      err.httpStatus = response.status;
      throw err;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw Error('Сервер не ответил вовремя. Сохранённые фрагменты будут отправлены повторно.');
    }
    throw error;
  } finally { clearTimeout(timer); }
}
async function claimAccount(code) {
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) {
    throw Error('Введите десятисимвольный код со страницы FILE-O.');
  }
  const reply = await request('/api/meeting/pair', 'POST', { code }, {}, false);
  persistToken(reply.token);
  const result = await request('/api/meeting/profile');
  sendToUI({ connected: true, email: result.email, plan: result.plan,
    model: result.model, line: 'Аккаунт подключён. Выберите источник звука.' });
  return { email: result.email, plan: result.plan, model: result.model };
}
async function disconnect() {
  if (queueState) throw Error('Сначала завершите текущую запись и отправку.');
  if (token) {
    try { await request('/api/meeting/disconnect', 'POST', {}); } catch (_) {}
  }
  clearCredentials();
  sendToUI({ connected: false, email: null, model: null, line: 'Аккаунт отключён.' });
  return { ok: true };
}
async function getProfile() {
  if (!token) return { connected: false };
  try {
    const info = await request('/api/meeting/profile');
    return { connected: true, ...info };
  } catch (error) {
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      clearCredentials();
      return { connected: false };
    }
    throw error;
  }
}
async function startMeeting(args) {
  if (queueState) throw Error('Предыдущая запись ещё отправляется. Дождитесь окончания.');
  const title = String(args?.title || '').trim();
  if (title.length < 3 || title.length > 120) throw Error('Тема встречи: от 3 до 120 символов.');
  if (args?.participants_informed !== true) throw Error('Подтвердите уведомление участников.');
  const count = args?.participant_count;
  if (count !== null && count !== undefined &&
      (!Number.isInteger(count) || count < 1 || count > 100)) {
    throw Error('Количество участников: от 1 до 100.');
  }
  // Key creation happens first: fail before creating a server meeting if OS vault is unavailable.
  const generated = generateSessionKey();
  const reply = await request('/api/meeting/sessions', 'POST', {
    title, participants_informed: true, microphone: !!args?.microphone,
    participant_count: count ?? null
  });
  sessionKey = generated.raw;
  queueState = {
    version: 1, meetingId: reply.id, title,
    encryptedKey: generated.encrypted, nextSequence: 0, offsets: {},
    started: Date.now(), finishRequested: false,
    recovering: false, recording: true, alreadyFinished: false
  };
  writeJson(sessionFilename(), queueState);
  ensurePrivateFolder(path.join(queueFolder(), queueState.meetingId));
  lastSeen = -1;
  recordStarted();
  startTimers();
  sendToUI({ recording: true, busy: false, state: 'recording',
    meetingId: reply.id, line: 'Запись идёт. Фрагменты защищённо отправляются в FILE-O.',
    model: reply.model, title, started: queueState.started,
    received: 0, processed: 0, recent: '', liveSegments: [],
    reportJobId: null, completedMeetingId: null,
    markerActive: false, markerCount: 0, markerMessage: '', error: '' });
  return { id: reply.id, model: reply.model, fragment_seconds: reply.fragment_seconds };
}
function chunkFilename(meetingId, sequence) {
  return path.join(queueFolder(), meetingId, String(sequence).padStart(6, '0') + '.bin');
}
async function queueChunk(args) {
  if (!queueState || queueState.finishRequested || !queueState.recording) {
    throw Error('Запись уже остановлена.');
  }
  const sequence = args?.sequence;
  const offset = args?.offsetMs;
  const data = args?.data;
  const mime = args?.mime;
  if (!Number.isInteger(sequence) || sequence !== queueState.nextSequence || sequence > 2500) {
    throw Error('Нарушен порядок записи аудиофрагментов.');
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_CAPTURE_MS + 300000) {
    throw Error('Неверное время аудиофрагмента.');
  }
  if (!['audio/webm', 'audio/mp4'].includes(mime)) throw Error('Неподдерживаемый формат аудио.');
  const audio = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data || []);
  if (audio.length < 200 || audio.length > CHUNK_MAX) {
    throw Error('Фрагмент слишком короткий или больше 6 МБ.');
  }
  const filename = chunkFilename(queueState.meetingId, sequence);
  writePrivate(filename, encryptAudio(audio));
  queueState.nextSequence = sequence + 1;
  queueState.offsets = queueState.offsets || {};
  queueState.offsets[String(sequence)] = offset;
  writeJson(sessionFilename(), queueState);
  sendToUI({ received: sequence + 1, line: 'Звук сохранён, отправляем фрагменты…' });
  setImmediate(() => drainPending().catch(err => logError('queue-drain', err)));
  return { persisted: true, sequence, size: audio.length };
}
async function drainPending() {
  if (!queueState || !token || draining) return;
  draining = true;
  try {
    const id = queueState.meetingId;
    const dir = path.join(queueFolder(), id);
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /^\d{6}\.bin$/.test(f)).sort(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const name of files) {
      if (!queueState || queueState.meetingId !== id) return;
      const seq = Number(name.slice(0, 6));
      const filename = path.join(dir, name);
      const chunk = decryptAudio(fs.readFileSync(filename));
      const mime = chunk.length >= 8 && chunk.subarray(4, 8).toString('ascii') === 'ftyp' ?
        'audio/mp4' : 'audio/webm';
      try {
        await request('/api/meeting/sessions/' + encodeURIComponent(id) + '/chunks/' + seq,
          'POST', chunk, { 'Content-Type': mime,
            'X-Meeting-Offset-Ms': String(getChunkOffset(seq)) });
        fs.rmSync(filename, { force: true });
        if (queueState?.meetingId === id) {
          if (queueState.offsets) delete queueState.offsets[String(seq)];
          writeJson(sessionFilename(), queueState);
        }
        sendToUI({ line: 'Аудиофрагмент ' + (seq + 1) + ' передан в FILE-O.', error: '' });
      } catch (error) {
        sendToUI({ line: 'Фрагменты сохранены локально. Повторяем передачу…',
          error: error.message });
        return;
      }
    }
    if (queueState?.finishRequested) {
      await finishMeetingIfReady();
    }
  } finally { draining = false; }
}
function getChunkOffset(seq) {
  const value = queueState?.offsets?.[String(seq)];
  if (!Number.isInteger(value) || value < 0 || value > MAX_CAPTURE_MS + 300000) {
    throw Error('Не найдена временная метка аудиофрагмента.');
  }
  return value;
}
async function requestStop() {
  if (!queueState) return { ok: true };
  if (!queueState.finishRequested) {
    queueState.finishRequested = true;
    queueState.recording = false;
    writeJson(sessionFilename(), queueState);
  }
  recordEnded();
  sendToUI({ recording: false, busy: true, state: 'uploading',
    line: 'Останавливаем запись. Передаём оставшиеся аудиофрагменты…' });
  setImmediate(() => drainPending().catch(err => logError('stop-drain', err)));
  return { ok: true };
}
async function finishMeetingIfReady() {
  if (!queueState || !queueState.finishRequested || queueState.alreadyFinished) return;
  const id = queueState.meetingId;
  const dir = path.join(queueFolder(), id);
  if (fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.bin'))) return;
  try {
    await request('/api/meeting/sessions/' + encodeURIComponent(id) + '/finish', 'POST', {});
    if (!queueState || queueState.meetingId !== id) return;
    queueState.alreadyFinished = true;
    writeJson(sessionFilename(), queueState);
    sendToUI({ state: 'processing', busy: true,
      line: 'Вся запись отправлена. Создаётся протокол встречи…', error: '' });
  } catch (error) {
    sendToUI({ state: 'uploading', busy: true, error: error.message });
  }
}
async function pollMeeting() {
  if (!queueState || !token) return;
  const id = queueState.meetingId;
  try {
    const data = await request('/api/meeting/sessions/' + encodeURIComponent(id) +
      '?since=' + String(lastSeen));
    if (!queueState || queueState.meetingId !== id) return;
    if (Array.isArray(data.segments)) {
      const words = [];
      const lines = [];
      for (const s of data.segments) {
        if (typeof s.text === 'string' && s.text.trim()) {
          words.push(s.text.trim());
          if (Number.isFinite(Number(s.start)) && Number(s.start) >= 0) {
            lines.push({ start: Number(s.start), text: s.text.trim().slice(0, 1700) });
          }
        }
        if (Number.isInteger(s.sequence)) lastSeen = Math.max(lastSeen, s.sequence);
      }
      if (lines.length) {
        lastInfo.liveSegments = [...(lastInfo.liveSegments || []), ...lines].slice(-120);
      }
      if (words.length) {
        const text = ((lastInfo.recent || '') + ' ' + words.join(' ')).trim().slice(-7800);
        lastInfo.recent = text;
      }
    }
    if (data.state === 'done' || data.state === 'error') {
      const success = data.state === 'done';
      sendToUI({ state: data.state, busy: false, recording: false,
        line: success ? 'Протокол готов в личном кабинете.' :
          data.error || 'Обработка завершилась с ошибкой.',
        error: success ? '' : data.error, processed: data.processed, received: data.received,
        reportJobId: data.report_job_id, completedMeetingId: id });
      stopTimers(); closeSessionStorage();
      if (success) notify('Протокол встречи готов. Откройте личный кабинет.');
      return;
    }
    sendToUI({ processed: data.processed, received: data.received,
      state: queueState.finishRequested ? 'processing' : 'recording',
      ...(data.pending > 0 ? { pending: data.pending } : {}),
      recent: lastInfo.recent || '',liveSegments: lastInfo.liveSegments || [] });
  } catch (error) {
    sendToUI({ error: error.message || 'Временная ошибка проверки статуса.' });
  }
}
async function highlight() {
  if (!queueState || !queueState.recording) throw Error('Сначала начните запись.');
  const offset = Math.min(Math.max(0, Date.now() - queueState.started), MAX_CAPTURE_MS);
  const result = await request('/api/meeting/sessions/' +
    encodeURIComponent(queueState.meetingId) + '/markers/toggle',
    'POST', { offset_ms: offset });
  sendToUI({ markerActive: result.active, markerCount: (lastInfo.markerCount || 0) +
    (result.active ? 1 : 0), markerMessage: result.active ?
      'Момент начат: включая предыдущие 20 секунд. Повторное нажатие завершит отрезок.' :
      'Важный момент сохранён и будет проанализирован после записи.' });
  return result;
}
function updateTray() {
  if (!tray) return;
  const active = !!lastInfo.recording;
  tray.setToolTip('FILE-O Meeting' + (active ? ' · ИДЁТ ЗАПИСЬ' : ''));
  const menu = [
    { label: 'Открыть FILE-O Meeting', click: () => showWindow() },
    { label: active ? '● Запись идёт' : 'Запись не выполняется', enabled: false },
    { label: 'Остановить запись', enabled: active, click: () => {
      if (window && !window.isDestroyed()) window.webContents.send('meeting:stop-request');
      else requestStop().catch(() => {});
    } },
    { type: 'separator' },
    { label: 'Мои встречи', click: () => openExternal(HOST + '/account?section=telemost') },
    { type: 'separator' },
    { label: 'Выйти из приложения', click: () => requestQuit() }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(menu));
}
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function requestQuit() {
  if (queueState?.recording) {
    const result = dialog.showMessageBoxSync(window, {
      type: 'warning', buttons: ['Продолжить запись', 'Остановить и выйти'],
      defaultId: 0, cancelId: 0, noLink: true,
      title: 'Идёт запись встречи',
      message: 'Выход остановит запись. Уже отправленные фрагменты сохранятся.',
      detail: 'Для продолжения записи оставьте FILE-O Meeting запущенным в строке меню или трее.'
    });
    if (result !== 1) return;
    // The final MediaRecorder piece must be persisted by the renderer first.
    // Do NOT call requestStop() here: that would reject the final chunk.
    showWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('meeting:stop-request');
    }
    notify('Запись останавливается. Выйти можно после сохранения последних фрагментов.');
    return;
  }
  quitting = true;
  app.quit();
}
function makeWindow() {
  const workArea=screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({
    width: Math.min(1530, Math.max(940, workArea.width-65)),
    height: Math.min(940, Math.max(650, workArea.height-65)),
    minWidth: 900, minHeight: 600,
    title: 'FILE-O Meet', backgroundColor: '#0c1120',
    autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'assets', 'fileo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true,
      nodeIntegration: false, webSecurity: true,
      backgroundThrottling: false
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('did-finish-load', () => {
    sendToUI({ connected: Boolean(token),
      ...(!token ? { line: 'Подключите аккаунт FILE-O через одноразовый код.' } : {}) });
  });
  window.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
      if (lastInfo.recording) notify('Запись продолжается. FILE-O Meeting находится в строке меню или трее.');
    }
  });
  window.once('ready-to-show', () => window.show());
  window.loadFile(path.join(__dirname, 'index.html'));
}
function configureCapturePermissions() {
  // macOS: give native OS picker control to CoreAudio Tap and its permission
  // prompt. The custom picker can create an ENDED, silent audio track on Mac.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'], thumbnailSize: { width: 0, height: 0 }
      });
      callback(sources[0] ? { video: sources[0], audio: 'loopback' } : null);
    } catch (_) { callback(null); }
  }, { useSystemPicker: process.platform === 'darwin' });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const local = webContents?.getURL()?.startsWith('file://');
    callback(Boolean(local && ['media','display-capture','fullscreen','notifications'].includes(permission)));
  });
}
function setupIPC() {
  ipcMain.handle('meeting:pair', async (_event, raw) => claimAccount(String(raw || '').trim().toUpperCase()));
  ipcMain.handle('meeting:profile', () => getProfile());
  ipcMain.handle('meeting:list', async () => {
    const result = await request('/api/meeting/sessions');
    return { sessions: Array.isArray(result.sessions) ? result.sessions : [] };
  });
  ipcMain.handle('meeting:document', async (_event, arg) => {
    const id = String(arg?.id || '');
    const offset = arg?.offset ?? 0;
    if (!/^[A-Za-z0-9_-]{15,55}$/.test(id) ||
        !Number.isInteger(offset) || offset < 0 || offset > 250000) {
      throw Error('Неверная встреча или страница расшифровки.');
    }
    return request('/api/meeting/sessions/' + encodeURIComponent(id) +
                   '/document?offset=' + offset + '&limit=300');
  });
  ipcMain.handle('meeting:save-document', async (_event, arg) => {
    const id = String(arg?.id || '');
    const body = arg?.body;
    if (!/^[A-Za-z0-9_-]{15,55}$/.test(id) ||
        !body || typeof body !== 'object') {
      throw Error('Неверные данные документа.');
    }
    // Schema validation and optimistic revision check run on FILE-O server.
    return request('/api/meeting/sessions/' + encodeURIComponent(id) +
                   '/document', 'PUT', body);
  });
  ipcMain.handle('meeting:disconnect', () => disconnect());
  ipcMain.handle('meeting:start', (_event, args) => startMeeting(args));
  ipcMain.handle('meeting:chunk', (_event, args) => queueChunk(args));
  ipcMain.handle('meeting:stop', () => requestStop());
  ipcMain.handle('meeting:highlight', () => highlight());
  ipcMain.handle('meeting:open', (_event, url) => openExternal(String(url || '')));
  // Clipboard writes are explicit, bounded and local. Do not log/store
  // transcript content and do not expose general filesystem operations.
  ipcMain.handle('meeting:copy-text', (_event, text) => {
    if (typeof text !== 'string' || text.length > 180000) {
      throw Error('Недопустимый объём текста для копирования.');
    }
    clipboard.writeText(text);
    return { ok: true };
  });
  ipcMain.handle('meeting:get-state', () => ({ ...lastInfo, session: queueState ?
    { id: queueState.meetingId, started: queueState.started, finishRequested: queueState.finishRequested } : null }));
  ipcMain.handle('meeting:permission-microphone', async () => {
    if (process.platform === 'darwin') {
      try { return await systemPreferences.askForMediaAccess('microphone'); }
      catch (_) { return false; }
    }
    return true;
  });
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    ensurePrivateFolder(app.getPath('userData'));
    loadCredentials();
    recoverSessionState();
    configureCapturePermissions();
    setupIPC();
    makeWindow();
    const trayImage = nativeImage.createFromPath(path.join(__dirname, 'assets', 'fileo.png'));
    tray = new Tray(trayImage.resize({ width: 18, height: 18 }));
    tray.on('double-click', () => showWindow());
    tray.on('click', () => showWindow());
    updateTray();
    if (queueState) {
      startTimers();
      setTimeout(() => drainPending().catch(err => logError('resume', err)), 1200);
    }
  }).catch(error => {
    logError('start', error);
    app.quit();
  });
  app.on('before-quit', () => { quitting = true; stopTimers(); recordEnded(); });
  app.on('activate', () => showWindow());
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
