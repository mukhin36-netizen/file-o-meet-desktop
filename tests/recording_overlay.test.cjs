'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
test('floating recording indicator is always-on-top and only shown during recording',()=>{
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 const html=fs.readFileSync(path.join(root,'recording_overlay.html'),'utf8');
 assert.match(main,/alwaysOnTop:true/);
 assert.match(main,/setVisibleOnAllWorkspaces\(true/);
 assert.match(main,/overlay\.showInactive\(\)/);
 assert.match(main,/else overlay\.hide\(\)/);
 assert.match(main,/if\(lastInfo\.recording\)/);
 assert.match(main,/meeting:overlay-open/);
 assert.match(html,/Идёт запись/);
 assert.match(html,/class="dot"/);
 assert.match(html,/aria-label="Открыть FILE-O Meet"/);
 assert.match(html,/Content-Security-Policy/);
});
test('overlay shows elapsed time and opens main window only on explicit click',()=>{
 const html=fs.readFileSync(path.join(root,'recording_overlay.html'),'utf8');
 const script=fs.readFileSync(path.join(root,'recording_overlay.js'),'utf8');
 const dom=new JSDOM(html,{url:'file:///tmp/overlay.html',runScripts:'outside-only'});
 const w=dom.window;
 let update;
 let opens=0;
 w.fileoOverlay={
  onRecording(cb){update=cb;return()=>{};},
  open(){opens++;}
 };
 w.eval(script);
 update({startedMs:Date.now()-6500});
 assert.match(w.document.getElementById('clock').textContent,/00:0[6-7]/);
 w.document.getElementById('show').click();
 assert.equal(opens,1);
 w.close();
});
test('automatic meeting titles are unique by local sequence and preserve manual names',()=>{
 const source=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(source,/generatedMeetingTitle/);
 assert.match(source,/localStorage\.setItem\('fileo_meet_next_record'/);
 assert.match(source,/const title = enteredTitle \|\| automatic\.title/);
 assert.match(source,/Запись №/);
 assert.doesNotMatch(html,/id="consent"/);
 assert.match(html,/Нажимая «Начать запись»/);
});
