'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fileoOverlay',Object.freeze({
  onRecording(handler){
    if(typeof handler!=='function')return ()=>{};
    const listener=(_event,payload)=>handler(payload);
    ipcRenderer.on('meeting:recording-indicator',listener);
    return ()=>ipcRenderer.removeListener('meeting:recording-indicator',listener);
  },
  open(){ipcRenderer.send('meeting:overlay-open');}
}));
