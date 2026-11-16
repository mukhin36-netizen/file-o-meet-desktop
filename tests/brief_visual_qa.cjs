'use strict';
const {chromium}=require('/tmp/fileo-web-qa/node_modules/playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const root='/opt/filelo/static/';
 const allErrors=[];
 for(const width of [1920,1440,1280,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:width<=390?780:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push('js: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,180));});
  page.on('response',r=>{if(r.status()>=400&&r.url().includes('/static/meeting'))errors.push('HTTP '+r.status()+' '+r.url());});
  const response=await page.goto('https://file-o.com/meeting',{waitUntil:'networkidle',timeout:38000});
  await page.locator('.hero-product img').waitFor({state:'visible'});
  const result=await page.evaluate(()=>{
   const x=el=>{const r=el.getBoundingClientRect();return {width:Math.round(r.width),height:Math.round(r.height),left:Math.round(r.left),right:Math.round(r.right)};};
   const images=[...document.querySelectorAll('img')];
   return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     hero:x(document.querySelector('.hero')),
     h1:x(document.querySelector('.hero h1')),
     preview:x(document.querySelector('.hero-product img')),
     logo:x(document.querySelector('.brand img')),
     screenshotsLoaded:images.every(i=>i.complete&&i.naturalWidth>0),
     downloadCount:document.querySelectorAll('.download-row a[download]').length,
     demoVisible:!document.querySelector('[data-showcase-pane="transcript"]').hidden,
     hasHorizontalScroll:document.documentElement.scrollWidth>innerWidth+2,
     zoom:devicePixelRatio};
  });
  await page.locator('[data-showcase-tab="decisions"]').click();
  const changed=await page.locator('[data-showcase-pane="decisions"]').isVisible();
  if(!changed)errors.push('demo tabs did not switch');
  const media=page.locator('.hero-product img');
  if(!(await media.evaluate(x=>x.complete&&x.naturalWidth>0)))errors.push('hero screenshot did not load');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  if(width===1440){
   await page.screenshot({path:root+'meeting-landing-desktop.png',fullPage:true,animations:'disabled'});
   await page.screenshot({path:root+'meeting-landing-desktop-first.png',fullPage:false,animations:'disabled'});
  }
  if(width===390){
   await page.screenshot({path:root+'meeting-landing-mobile.png',fullPage:true,animations:'disabled'});
   await page.screenshot({path:root+'meeting-landing-mobile-first.png',fullPage:false,animations:'disabled'});
  }
  console.log('VISUAL',width,'HTTP',response.status(),JSON.stringify(result),'ERRORS',JSON.stringify(errors));
  if(response.status()!==200||result.hasHorizontalScroll||!result.screenshotsLoaded||errors.length)allErrors.push(width+': '+errors.join('; ')+JSON.stringify(result));
  await page.close();
 }
 await browser.close();
 if(allErrors.length){
  console.error('VISUAL_FAILURE',allErrors);
  process.exitCode=1;
 }else console.log('ALL_VIEWPORTS_PASSED');
})().catch(e=>{console.error('VISUAL_EXCEPTION',e);process.exitCode=1});
