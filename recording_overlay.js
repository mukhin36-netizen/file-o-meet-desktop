'use strict';
(()=>{
  const clock=document.getElementById('clock');
  const open=document.getElementById('show');
  let startMs=0;
  function render(){
    const seconds=Math.max(0,Math.floor((Date.now()-startMs)/1000));
    const h=Math.floor(seconds/3600);
    const m=String(Math.floor(seconds/60)%60).padStart(2,'0');
    const s=String(seconds%60).padStart(2,'0');
    clock.textContent=(h?String(h).padStart(2,'0')+':':'')+m+':'+s;
  }
  window.fileoOverlay.onRecording(data=>{
    if(data?.startedMs && Number.isFinite(data.startedMs)){
      startMs=data.startedMs;
      render();
    }
  });
  open.addEventListener('click',()=>window.fileoOverlay.open());
  setInterval(()=>{if(startMs)render()},500);
})();
