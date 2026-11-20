'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/* Allowlisted, narrow capability bridge; no Node, filesystem or arbitrary
 * HTTP APIs exposed to untrusted renderer text. */
function invoke(name, value) {
  return ipcRenderer.invoke('meeting:' + name, value);
}
contextBridge.exposeInMainWorld('fileo', Object.freeze({
  isMacAppStore: process.mas === true,
  pair: (code) => invoke('pair', code),
  profile: () => invoke('profile'),
  list: () => invoke('list'),
  document: (id, offset = 0) => invoke('document', { id, offset }),
  saveDocument: (id, body) => invoke('save-document', { id, body }),
  disconnect: () => invoke('disconnect'),
  start: (args) => invoke('start', args),
  queueChunk: (args) => invoke('chunk', args),
  stop: () => invoke('stop'),
  highlight: () => invoke('highlight'),
  getState: () => invoke('get-state'),
  open: (url) => invoke('open', url),
  copyText: (text) => invoke('copy-text', text),
  platform: process.platform,
  microphonePermission: () => invoke('permission-microphone'),
  openRecordingSettings: (kind = 'system') =>
    invoke('open-recording-settings', kind === 'microphone' ? 'microphone' : 'system'),
  restartForPermissions: () => invoke('restart-for-permissions'),
  startSystemAudio: () => invoke('system-audio-start'),
  stopSystemAudio: () => invoke('system-audio-stop'),
  onSystemPCM: (handler) => {
    if(typeof handler!=='function')return () => {};
    const listener=(_event,pcm) => {
      if(typeof pcm==='string' && pcm.length<400000)handler(pcm);
    };
    ipcRenderer.on('meeting:system-pcm',listener);
    return () => ipcRenderer.removeListener('meeting:system-pcm',listener);
  },
  onSystemAudioLost: (handler) => {
    if(typeof handler!=='function')return () => {};
    const listener=() => handler();
    ipcRenderer.on('meeting:system-audio-lost',listener);
    return () => ipcRenderer.removeListener('meeting:system-audio-lost',listener);
  },
  onUpdate: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const callback = (_event, info) => handler(info);
    ipcRenderer.on('meeting:update', callback);
    return () => ipcRenderer.removeListener('meeting:update', callback);
  },
  onStopRequest: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const callback = () => handler();
    ipcRenderer.on('meeting:stop-request', callback);
    return () => ipcRenderer.removeListener('meeting:stop-request', callback);
  }
}));
