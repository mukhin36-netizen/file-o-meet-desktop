'use strict';
const {chromium}=require('/tmp/fileo-web-qa/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1365,height:920},deviceScaleFactor:1});
 const meeting={
  id:'L5Dp9mlR-fivgVPRhW6ZQzpfl4w',
  title:'ДЕМО · План запуска продукта и распределение задач',
  started:1794567600,ended:1794568263,state:'done',participant_count:4
 };
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/account/me',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({
   authenticated:true,email:'demo@example.test',verified:true,
   meeting_access:true,plus_forever:true,premium:true,
   paid_until:0,plan:'lifetime'
  })
 }));
 await page.route('**/api/telemost/sessions',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({sessions:[meeting]})
 }));
 await page.route('**/api/telemost/projects',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({projects:[]})
 }));
 await page.goto('https://file-o.com/account?section=telemost',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(950);
 const result=await page.evaluate(()=>{
  const p=document.getElementById('telemostPanel');
  const row=document.querySelectorAll('.tm-meeting-row');
  const r=p?.getBoundingClientRect();
  return {panelHidden:p?.hidden,parentHidden:p?.closest('[hidden]')?.id,
   rows:row.length,text:p?.textContent?.slice(0,180),
   width:r?.width,css:!!document.querySelector('link[href*="telemost_account.css"]')};
 });
 console.log('CABINET_STATE',result,'ERRORS',errors);
 if(result.rows>=1){
  const p=page.locator('#telemostPanel');
  await p.screenshot({path:'/opt/filelo/static/meeting-cabinet-demo.png',animations:'disabled'});
  console.log('CABINET_SCREENSHOT_CAPTURED');
 }
 await browser.close();
 if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
