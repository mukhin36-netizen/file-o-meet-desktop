'use strict';
const { chromium } = require('/tmp/fileo-web-qa/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
 const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const id='L5Dp9mlR-fivgVPRhW6ZQzpfl4w';
 const sample={
   id,title:'ДЕМО · План запуска продукта и распределение задач',
   started:1794567600,ended:1794568263,state:'done',
   participant_count:4,report_job_id:'meeting_'+id
 };
 const transcript=[
  {start:24,end:42,text:'Сначала уточним цели: запустить первую версию сервиса, собрать отзывы пользователей и проверить стабильность системы.'},
  {start:52,end:67,text:'В проекте четыре условных участника. Дмитрий отвечает за координацию, Мария за дизайн, Игорь за разработку, Ольга за маркетинг.'},
  {start:169,end:190,text:'Мария подготовит обновлённый дизайн карточек до среды. Нужен единый стиль заголовков, кнопок и таблиц.'},
  {start:199,end:220,text:'Игорь проверит регистрацию и сохранение данных. К четвергу нужно пройти тесты и устранить критические ошибки.'},
  {start:326,end:348,text:'Решили зафиксировать двадцатое ноября как ориентир выпуска, но не публиковать продукт до успешного прохождения проверки.'},
  {start:360,end:382,text:'Также выделим отдельный важный момент: нужно контролировать ошибки оплаты и восстановление доступа к личному кабинету.'},
  {start:580,end:603,text:'Итоговые поручения: Марии дизайн до среды, Игорю тестирование до четверга, Дмитрию подготовка плана на пятницу.'}
 ];
 const details={
  ready:true,meeting:sample,revision:1,duration:663,
  sections:{
   discussed:['Запуск первой версии сервиса','Распределение ролей и сроков'],
   decided:['Ориентир релиза — 20 ноября после успешных тестов',
    'Сохранять редактируемый протокол и расшифровку',
    'Уведомлять участников о записи'],
   next_steps:['Мария — дизайн карточек до среды',
    'Игорь — проверка регистрации до четверга',
    'Дмитрий — план запуска к пятнице'],
   risks:['Сложность установки приложения для новых пользователей'],
   open_questions:['Выбор интерфейса приложения для macOS']
  },
  documents:{
   formatted:'# План запуска\n\n## Обсуждали\n\nСогласовали цели проекта.',
   summary:'## Конспект\n\nОбсудили сроки и задачи.',
   brief:'Встреча посвящена выпуску первой версии продукта. Участники согласовали ориентир релиза, контроль качества и задачи по дизайну, разработке и маркетингу.',
   raw_text:transcript.map(x=>x.text).join(' ')
  },
  markers:[{start_ms:148000,end_ms:211000,
    title:'ДЕМО · Поручения и сроки',
    summary:'Распределение задач между условными участниками'}],
  segments:transcript,segment_total:transcript.length,segment_has_more:false
 };
 const jsErrors=[];
 async function open(options={}){
  const page=await browser.newPage({viewport:{width:1120,height:710},deviceScaleFactor:1});
  page.on('pageerror',e=>jsErrors.push(e.message));
  await page.addInitScript(({sample,details,connected})=>{
   window.fileo={
    profile:async()=>connected?
      {connected:true,email:'demo@example.test',plan:'Плюс навсегда',
       model:'Whisper Large-v3'}:{connected:false},
    getState:async()=>({state:'idle',recording:false}),
    list:async()=>({sessions:[sample]}),
    document:async()=>details,
    saveDocument:async()=>({revision:2}),
    pair:async()=>({email:'demo@example.test'}),
    disconnect:async()=>({ok:true}),
    start:async()=>({id:'demo-id',model:'Whisper Large-v3'}),
    stop:async()=>({ok:true}),
    highlight:async()=>({active:true}),
    queueChunk:async()=>({persisted:true}),
    open:async()=>{},
    microphonePermission:async()=>true,
    onUpdate(fn){(window.__updates ||= []).push(fn);return()=>{};},
    onStopRequest(fn){window.__stop=fn;return()=>{};}
   };
  },{sample,details,connected:options.connected!==false});
  await page.goto('file:///opt/filelo/desktop-app/index.html',{waitUntil:'load'});
  await page.waitForTimeout(650);
  return page;
 }
 const dest='/opt/filelo/static';
 const doc=await open();
 await doc.locator('#homeRecent .history-open').first().click();
 await doc.waitForTimeout(550);
 console.log('DOC_RENDER',await doc.evaluate(()=>({
  visible:!document.getElementById('documentPage').hidden,
  transcript:document.querySelectorAll('.segment-row').length,
  decisions:document.getElementById('detailDecisions').textContent.slice(0,80),
  error:document.getElementById('documentStatus').textContent
 })));
 await doc.screenshot({path:dest+'/meeting-real-interface.png'});
 await doc.locator('.document-columns').screenshot({path:dest+'/meeting-step-document.png'});
 await doc.close();
 const setup=await open();
 await setup.locator('#navNew').click();
 await setup.waitForTimeout(220);
 await setup.locator('#setupPanel').screenshot({path:dest+'/meeting-step-record.png'});
 await setup.close();
 const connect=await open({connected:false});
 await connect.locator('#pairPanel').screenshot({path:dest+'/meeting-step-connect.png'});
 await connect.close();
 const live=await open();
 await live.locator('#navNew').click();
 await live.evaluate(({transcript})=>{
  window.__updates.forEach(fn=>fn({state:'recording',recording:true,title:'ДЕМО · План запуска продукта',
   line:'Записываем разговор',received:3,processed:2,
   liveSegments:transcript.slice(0,3),recent:transcript.slice(0,3).map(x=>x.text).join(' ')}));
 },{transcript});
 await live.waitForTimeout(250);
 await live.screenshot({path:dest+'/meeting-desktop-live.png'});
 await live.close();
 await browser.close();
 if(jsErrors.length){console.error('SCREENSHOT_JS_ERRORS',jsErrors);process.exit(1)}
 console.log('APP_SCREENSHOTS_CREATED');
})().catch(e=>{console.error(e);process.exit(1)});
