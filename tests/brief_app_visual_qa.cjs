'use strict';
const {chromium}=require('/tmp/fileo-web-qa/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const faults=[];
 const mid='L5Dp9mlR-fivgVPRhW6ZQzpfl4w';
 const meeting={id:mid,title:'ДЕМО · План запуска продукта',started:1794567600,
   ended:1794568263,participant_count:4,state:'done'};
 const transcript=[
  {start:24,end:42,text:'Сначала уточним цели: запустить первую версию сервиса, собрать отзывы пользователей и проверить стабильность системы.'},
  {start:169,end:190,text:'Мария подготовит обновлённый дизайн карточек до среды.'},
  {start:199,end:220,text:'Игорь проверит регистрацию и сохранение данных до четверга.'},
  {start:326,end:348,text:'Решили зафиксировать 20 ноября как ориентир выпуска после тестирования.'}
 ];
 const source={ready:true,meeting,revision:1,duration:663,
  documents:{formatted:'# План\n\nОсновные тезисы',summary:'Обсудили цели и сроки.',
    brief:'Обсудили запуск продукта, назначили поручения и ориентир релиза.',
    raw_text:'Текст встречи'},sections:{discussed:['Цели запуска'],
    decided:['Ориентир релиза — 20 ноября после успешных тестов',
      'Протокол и конспект редактируются пользователем'],
    next_steps:['Мария — дизайн до среды','Игорь — проверка до четверга',
      'Дмитрий — план запуска к пятнице'],
    risks:['Возможные задержки тестирования'],open_questions:[]},
  segments:transcript,segment_total:transcript.length,segment_has_more:false,
  markers:[{start_ms:148000,title:'Важный момент — поручения'}]
 };
 for(const [name,width,height,view] of [
  ['home-1440',1440,900,'home'],
  ['home-1040',1040,780,'home'],
  ['record-1040',1040,780,'record'],
  ['detail-1040',1040,780,'document'],
  ['detail-800',800,740,'document'],
  ['live-1040',1040,780,'live']]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console:'+m.text().slice(0,180));});
  await page.addInitScript(({meeting,source,transcript})=>{
   const callbacks=[];
   window.__uiCallbacks=callbacks;
   window.fileo={
     profile:async()=>({connected:true,email:'demo@example.test',
       plan:'Плюс навсегда',model:'Whisper Large-v3'}),
     getState:async()=>({state:'idle',recording:false}),
     list:async()=>({sessions:[meeting]}),
     document:async()=>source,
     saveDocument:async()=>({revision:2}),
     pair:async()=>({email:'demo@example.test'}),
     disconnect:async()=>({ok:true}),
     start:async()=>({id:'demo-id',model:'Whisper Large-v3'}),
     queueChunk:async()=>({persisted:true}),
     highlight:async()=>({active:true}),
     stop:async()=>({ok:true}),
     open:async()=>{},
     microphonePermission:async()=>true,
     onUpdate:fn=>{callbacks.push(fn);return()=>{};},
     onStopRequest:()=>()=>{}
   };
   window.__sampleTranscript=transcript;
  },{meeting,source,transcript});
  await page.goto('file:///opt/filelo/desktop-app/index.html',{waitUntil:'load'});
  await page.waitForTimeout(550);
  if(view==='record'){
   await page.locator('#navNew').click();
  }else if(view==='document'){
   await page.locator('#homeRecent .history-open').first().click();
   await page.waitForTimeout(180);
  }else if(view==='live'){
   await page.locator('#navNew').click();
   await page.evaluate(()=>{
     const value={state:'recording',recording:true,received:4,processed:3,
       title:'ДЕМО · План запуска продукта',
       recent:window.__sampleTranscript.map(x=>x.text).join(' '),
       liveSegments:window.__sampleTranscript};
     window.__uiCallbacks.forEach(fn=>fn(value));
   });
   await page.waitForTimeout(180);
  }
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  const m=await page.evaluate(()=>{
   const now=['homePage','recordPage','meetingsPage','documentPage']
    .filter(id=>!document.getElementById(id).hidden);
   return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    active:now,sync:document.getElementById('syncState').textContent,
    history:document.querySelectorAll('#homeRecent .history-row').length,
    segments:document.querySelectorAll('#detailTranscript .segment-row').length,
    liveRows:document.querySelectorAll('#transcript .live-transcript-row').length,
    hasHorizontalScroll:document.documentElement.scrollWidth>innerWidth+1};
  });
  await page.screenshot({path:'/opt/filelo/static/meeting-app-'+name+'.png',
    fullPage:false,animations:'disabled'});
  if(m.hasHorizontalScroll||errors.length)faults.push(name+': '+JSON.stringify({m,errors}));
  console.log('APP_VISUAL',name,JSON.stringify(m),'ERRORS',JSON.stringify(errors));
  await page.close();
 }
 await browser.close();
 if(faults.length){console.error('APP_VISUAL_FAILED',faults);process.exitCode=1;}
 else console.log('ALL_APP_SIZES_PASSED');
})().catch(e=>{console.error('APP_VISUAL_EXCEPTION',e);process.exitCode=1});
