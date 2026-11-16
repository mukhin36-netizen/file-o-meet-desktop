const {chromium}=require('/tmp/fileo-web-qa/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors=[];
 for(const [name,viewport] of [
   ['landing-desktop',{width:1440,height:900}],
   ['landing-tablet',{width:820,height:900}],
   ['landing-mobile',{width:390,height:844}]]){
   const page=await browser.newPage({viewport,deviceScaleFactor:1});
   page.on('pageerror',e=>errors.push(name+': '+e.message));
   const response=await page.goto('https://file-o.com/meeting',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForTimeout(750);
   const measure=await page.evaluate(()=>{
     const hero=document.querySelector('.hero');
     const win=document.querySelector('.preview-window');
     const download=document.querySelector('.download-section');
     const logo=document.querySelector('.wordmark img');
     return {width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
       logoWidth:logo.getBoundingClientRect().width,
       logoHeight:logo.getBoundingClientRect().height,
       heroHeight:Math.round(hero.getBoundingClientRect().height),
       previewWidth:Math.round(win.getBoundingClientRect().width),
       downloadCards:download.querySelectorAll('.download-card').length,
       extLinks:[...document.querySelectorAll('a')].filter(a=>/extension|chrome\.zip|safari-source/i.test(a.href)).length};
   });
   await page.screenshot({path:'/tmp/fileo-qa-'+name+'.png',fullPage:false});
   await page.screenshot({path:'/tmp/fileo-qa-'+name+'-full.png',fullPage:true});
   console.log('VISUAL_SITE',name,response.status(),JSON.stringify(measure));
   await page.close();
 }
 for(const [name,viewport] of [
   ['app-setup',{width:1040,height:780}],
   ['app-narrow',{width:800,height:720}],
   ['app-live',{width:1040,height:780}]]){
   const page=await browser.newPage({viewport});
   await page.addInitScript(()=>{
     window.fileo={
       profile:async()=>({connected:true,email:'demo@example.test',
          plan:'Плюс навсегда',model:'Whisper Large-v3'}),
       getState:async()=>({state:'idle',recording:false}),
       onUpdate(cb){window.__fakeUpdate=cb;return()=>{};},
       onStopRequest(cb){window.__fakeStop=cb;return()=>{};},
       microphonePermission:async()=>true,
       open:async()=>{},
       pair:async()=>({email:'demo@example.test'}),
       disconnect:async()=>({ok:true}),
       highlight:async()=>({active:true}),
       start:async()=>({id:'demo-id',model:'Whisper Large-v3'}),
       queueChunk:async()=>({persisted:true}),
       stop:async()=>({ok:true})
     };
   });
   page.on('pageerror',e=>errors.push(name+': '+e.message));
   await page.goto('file:///opt/filelo/desktop-app/index.html',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForTimeout(550);
   if(name==='app-live'){
     await page.evaluate(()=>window.__fakeUpdate({
       state:'recording',recording:true,busy:false,title:'План запуска проекта',
       line:'Идёт запись',received:4,processed:3,
       markerCount:1,markerActive:false,
       recent:'Сегодня согласовали первый этап работ и обсудили сроки запуска. Дальше проверим материалы и назначим ответственных.'
     }));
     await page.waitForTimeout(150);
   }
   const measure=await page.evaluate(()=>{
     const panel=document.getElementById('meetingPanel');
     const setup=document.getElementById('setupPanel');
     const live=document.getElementById('livePanel');
     const sidebar=document.querySelector('.side-nav');
     return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
       sidebarWidth:Math.round(sidebar.getBoundingClientRect().width),
       panelWidth:Math.round(panel.getBoundingClientRect().width),
       setupVisible:!setup.hidden,liveVisible:!live.hidden,
       startEnabled:!document.getElementById('start').disabled,
       liveText:document.getElementById('transcript').textContent.slice(0,50)};
   });
   await page.screenshot({path:'/tmp/fileo-qa-'+name+'.png',fullPage:false});
   console.log('VISUAL_APP',name,JSON.stringify(measure));
   await page.close();
 }
 console.log('JS_ERRORS',errors);
 await browser.close();
 if(errors.length)process.exitCode=1;
})().catch(e=>{console.error('VISUAL_TEST_FAILED',e);process.exitCode=1});
