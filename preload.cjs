'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/* Allowlisted, narrow capability bridge; no Node, filesystem or arbitrary
 * HTTP APIs exposed to untrusted renderer text. */
function invoke(name, value) {
  return ipcRenderer.invoke('meeting:' + name, value);
}
contextBridge.exposeInMainWorld('fileo', Object.freeze({
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
  microphonePermission: () => invoke('permission-microphone'),
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
