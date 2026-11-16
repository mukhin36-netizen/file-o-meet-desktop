'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const tick = async () => {
  for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
};
function build({ noSystemAudio = false } = {}) {
  const dom = new JSDOM(html, {
    url: 'file:///tmp/fileo-test/index.html',
    runScripts: 'outside-only'
  });
  const w = dom.window;
  const sent = [];
  const calls = [];
  Object.defineProperty(w, 'isSecureContext', { value: true });
  w.Blob = Blob;
  class AudioContext {
    constructor() { this.state = 'suspended'; }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [track()] } }; }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 512, getByteTimeDomainData: out => out.fill(128) }; }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class MediaRecorder {
    constructor(_stream, options) {
      this.state = 'inactive';
      this.handlers = {};
      this.options = options;
      calls.push('new MediaRecorder');
    }
    static isTypeSupported(mime) { return mime === 'audio/webm;codecs=opus'; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    start() { this.state = 'recording'; calls.push('recorder-start'); }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      const blob = new Blob([new Uint8Array(1400)], { type: 'audio/webm' });
      this.handlers.dataavailable?.({ data: blob });
      this.handlers.stop?.();
    }
  }
  function track() {
    return {
      readyState: 'live', handlers: [],
      addEventListener(name, cb) { if (name === 'ended') this.handlers.push(cb); },
      stop() { this.readyState = 'ended'; this.handlers.forEach(cb => cb()); }
    };
  }
  const sysAudio = noSystemAudio ? [] : [track()];
  const sysVideo = [track()];
  w.navigator.mediaDevices = {
    async getDisplayMedia() {
      calls.push('display');
      return {
        getAudioTracks: () => sysAudio,
        getTracks: () => [...sysAudio, ...sysVideo]
      };
    },
    async getUserMedia() {
      calls.push('microphone');
      const mic = [track()];
      return { getAudioTracks: () => mic, getTracks: () => mic };
    }
  };
  w.AudioContext = AudioContext;
  w.MediaRecorder = MediaRecorder;
  let updates, stopRequest;
  const mock = {
    async profile() {
      return { connected: true, email: 'user@example.test',
        plan: 'Плюс навсегда', model: 'Whisper Large-v3' };
    },
    async getState() { return { state: 'idle', recording: false }; },
    async start(obj) {
      calls.push('server-start');
      return { id: 'a_Long_Test_Meeting_Identifier123', model: 'Whisper Large-v3',
        fragment_seconds: 25 };
    },
    async queueChunk(obj) {
      calls.push('persist-chunk');
      sent.push({ seq: obj.sequence, offset: obj.offsetMs,
        size: obj.data.byteLength, mime: obj.mime });
      return { persisted: true };
    },
    async stop() { calls.push('server-finish'); return { ok: true }; },
    async highlight() { calls.push('mark'); return { active: true }; },
    async open(url) { calls.push('open:'+url); },
    async microphonePermission() { return true; },
    async pair(code) { calls.push('pair:' + code); return { email:'user@example.test' }; },
    async disconnect() { calls.push('disconnect'); return { ok:true }; },
    onUpdate(callback) { updates = callback;return () => {}; },
    onStopRequest(callback) { stopRequest = callback;return () => {}; }
  };
  Object.defineProperty(w, 'fileo', { value: mock });
  w.eval(js);
  return { w, doc: w.document, sent, calls,
    update: message => updates(message),
    stopRequest: () => stopRequest(),
    close() { w.close(); } };
}
test('desktop window has secure local context and no remote assets', () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /assets\/fileo\.png/);
  assert.ok(!html.includes('https://cdn.'));
  const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /aes-256-gcm/);
  assert.match(main, /useSystemPicker: process\.platform === 'darwin'/);
});
test('user is connected, recording cannot start without consent', async () => {
  const f = build();
  try {
    await tick();
    assert.equal(f.doc.getElementById('pairPanel').hidden, true);
    assert.equal(f.doc.getElementById('meetingPanel').hidden, false);
    assert.equal(f.doc.getElementById('start').disabled, true);
    assert.match(f.doc.getElementById('accountEmail').textContent, /user@/);
    f.doc.getElementById('consent').checked = true;
    f.doc.getElementById('consent').dispatchEvent(new f.w.Event('change'));
    assert.equal(f.doc.getElementById('start').disabled, false);
  } finally { f.close(); }
});
test('start, mark, encrypted queue contract and stop in correct order', async () => {
  const f = build();
  try {
    await tick();
    f.doc.getElementById('consent').checked = true;
    f.doc.getElementById('consent').dispatchEvent(new f.w.Event('change'));
    f.doc.getElementById('start').click();
    await tick();
    assert.equal(f.doc.getElementById('livePanel').hidden, false);
    assert.equal(f.doc.getElementById('recordIndicator').hidden, false);
    assert.ok(f.calls.indexOf('display') < f.calls.indexOf('server-start'));
    assert.ok(f.calls.includes('microphone'));
    f.doc.getElementById('highlight').click();
    await tick();
    assert.ok(f.calls.includes('mark'));
    f.doc.getElementById('stop').click();
    await tick();
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].seq, 0);
    assert.equal(f.sent[0].mime, 'audio/webm');
    assert.ok(f.sent[0].size > 500);
    assert.ok(f.calls.indexOf('persist-chunk') < f.calls.indexOf('server-finish'),
      'final audio must be persisted before finish request');
    assert.equal(f.doc.getElementById('processingPanel').hidden, false);
  } finally { f.close(); }
});
test('mic only works without OS screen permissions', async () => {
  const f = build();
  try {
    await tick();
    f.doc.getElementById('systemSound').checked = false;
    f.doc.getElementById('microphone').checked = true;
    f.doc.getElementById('consent').checked = true;
    f.doc.getElementById('consent').dispatchEvent(new f.w.Event('change'));
    f.doc.getElementById('start').click();
    await tick();
    assert.ok(!f.calls.includes('display'));
    assert.ok(f.calls.includes('microphone'));
    assert.ok(f.calls.includes('server-start'));
    f.doc.getElementById('stop').click();
    await tick();
  } finally { f.close(); }
});
test('silently ended system audio is rejected without creating a server job', async () => {
  const f = build({ noSystemAudio: true });
  try {
    await tick();
    f.doc.getElementById('microphone').checked = false;
    f.doc.getElementById('consent').checked = true;
    f.doc.getElementById('consent').dispatchEvent(new f.w.Event('change'));
    f.doc.getElementById('start').click();
    await tick();
    assert.equal(f.calls.includes('server-start'), false);
    assert.match(f.doc.getElementById('status').textContent, /аудиодорожку/);
  } finally { f.close(); }
});
test('after report completion a fresh meeting can start without restarting the app', async () => {
  const f = build();
  try {
    await tick();
    f.update({ state: 'done', busy: false, recording: false,
      meetingId: 'a_Long_Test_Meeting_Identifier123',
      reportJobId: 'meeting_a_Long_Test_Meeting_Identifier123' });
    await tick();
    assert.equal(f.doc.getElementById('newMeeting').hidden, false);
    f.doc.getElementById('newMeeting').click();
    await tick();
    assert.equal(f.doc.getElementById('setupPanel').hidden, false);
    assert.equal(f.doc.getElementById('consent').checked, false);
    assert.equal(f.doc.getElementById('start').disabled, true);
  } finally { f.close(); }
});
test('opening cabinet uses FILE-O HTTPS and no embedded remote window', async () => {
  const f = build();
  try {
    await tick();
    f.doc.getElementById('openCabinet').click();
    await tick();
    assert.ok(f.calls.some(x => x.includes('https://file-o.com/account?section=telemost')));
  } finally { f.close(); }
});
