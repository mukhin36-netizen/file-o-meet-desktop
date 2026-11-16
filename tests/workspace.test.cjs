'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const source=fs.readFileSync(__dirname+'/../workspace.js','utf8');
const id='L5Dp9mlR-fivgVPRhW6ZQzpfl4w';
const sample={id,title:'ДЕМО · Тестовый разговор',started:1794567600,ended:1794568263,state:'done',participant_count:4};
const data={
 meeting:sample,ready:true,revision:1,duration:663,
 sections:{discussed:['План'],decided:['Согласовали сроки'],
  next_steps:['Мария — дизайн'],risks:['Задержка'],open_questions:[]},
 documents:{formatted:'# План\n\nТекст',summary:'Согласовали план',
  brief:'Уточнили сроки и задачи.',raw_text:'Звук'},
 markers:[],segments:[{start:24,end:42,text:'Начали обсуждать план'},
  {start:52,end:67,text:'Назначили задачи'}],
 segment_total:2,segment_has_more:false
};
const tick=async()=>{for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup(connected=true){
 const dom=new JSDOM(html,{url:'file:///tmp/fileo/workspace.html',runScripts:'outside-only'});
 const w=dom.window,doc=w.document;
 const calls=[];
 let stored=JSON.parse(JSON.stringify(data));
 w.HTMLElement.prototype.focus=()=>{};
 w.fileo={
  profile:async()=>connected?{connected:true,email:'test@example.invalid',
    plan:'Плюс навсегда',model:'Whisper Large-v3'}:{connected:false},
  list:async()=>{calls.push('list');return {sessions:[sample]};},
  document:async()=>{calls.push('document');return JSON.parse(JSON.stringify(stored));},
  saveDocument:async(_id,payload)=>{
   calls.push('save');
   if(payload.revision!==stored.revision)throw Error('Изменения уже сохранены');
   stored={...stored,revision:stored.revision+1,
     meeting:{...sample,title:payload.title,participant_count:payload.participant_count},
     sections:payload.sections,documents:{...stored.documents,...payload.overrides}};
   return {revision:stored.revision};
  },
  open:async(url)=>{calls.push(url);},
  onUpdate:()=>()=>{}
 };
 w.eval(source);
 return {w,doc,calls,getStored:()=>stored,close:()=>w.close()};
}
test('connected user sees real history and no invented counters',async()=>{
 const f=setup();
 try{
  await tick();
  assert.equal(f.doc.getElementById('homePage').hidden,false);
  assert.equal(f.doc.querySelectorAll('#homeRecent .history-row').length,1);
  assert.match(f.doc.getElementById('homeRecent').textContent,/Тестовый разговор/);
  assert.match(f.doc.getElementById('homeMetrics').textContent,/1 встреч/);
  assert.match(f.doc.getElementById('sidebarEmail').textContent,/test@/);
 }finally{f.close();}
});
test('private transcript with timecodes and decisions opens from history',async()=>{
 const f=setup();
 try{
  await tick();
  f.doc.querySelector('#homeRecent .history-open').click();
  await tick();
  assert.equal(f.doc.getElementById('documentPage').hidden,false);
  assert.equal(f.doc.querySelectorAll('.segment-row').length,2);
  assert.match(f.doc.getElementById('detailTranscript').textContent,/00:24/);
  assert.match(f.doc.getElementById('detailDecisions').textContent,/Согласовали сроки/);
  assert.equal(f.doc.getElementById('detailDemoLabel').hidden,false);
  assert.match(f.doc.getElementById('documentFootnote')?.textContent||f.doc.querySelector('.document-footnote').textContent,/не определяются/);
 }finally{f.close();}
});
test('transcript search filters only loaded source segments and remains editable',async()=>{
 const f=setup();
 try{
  await tick();
  f.doc.querySelector('#homeRecent .history-open').click();
  await tick();
  const input=f.doc.getElementById('documentTranscriptSearch');
  input.value='Назначили';
  input.dispatchEvent(new f.w.Event('input'));
  assert.equal(f.doc.querySelectorAll('.segment-row:not([hidden])').length,1);
  assert.match(f.doc.getElementById('documentSegmentCount').textContent,/Совпадений: 1/);
  input.value='несуществующий запрос';
  input.dispatchEvent(new f.w.Event('input'));
  assert.equal(f.doc.querySelectorAll('.segment-row:not([hidden])').length,0);
  assert.match(f.doc.querySelector('.transcript-no-matches').textContent,/загруженных/);
  input.value='';
  input.dispatchEvent(new f.w.Event('input'));
  assert.equal(f.doc.querySelectorAll('.segment-row:not([hidden])').length,2);
 }finally{f.close();}
});
test('editing source report uses optimistic revision and persists to backend',async()=>{
 const f=setup();
 try{
  await tick();
  f.doc.querySelector('#homeRecent .history-open').click();
  await tick();
  f.doc.getElementById('documentEdit').click();
  assert.equal(f.doc.getElementById('documentSave').hidden,false);
  f.doc.getElementById('documentTitleInput').value='Исправленная встреча';
  f.doc.getElementById('documentCountInput').value='6';
  f.doc.getElementById('detailDecisionsEditor').value='Согласовали обновлённые сроки';
  f.doc.getElementById('detailTasksEditor').value='Мария — дизайн к пятнице';
  f.doc.getElementById('detailFormattedEditor').value='# Исправленный план';
  f.doc.getElementById('documentSave').click();
  await tick();
  assert.equal(f.getStored().revision,2);
  assert.equal(f.getStored().meeting.title,'Исправленная встреча');
  assert.equal(f.getStored().meeting.participant_count,6);
  assert.equal(JSON.stringify(f.getStored().sections.decided),JSON.stringify(['Согласовали обновлённые сроки']));
  assert.equal(f.getStored().documents.formatted,'# Исправленный план');
  assert.ok(f.calls.includes('save'));
 }finally{f.close();}
});
test('unconnected user sees pairing page without fake meetings',async()=>{
 const f=setup(false);
 try{
  await tick();
  assert.equal(f.doc.getElementById('recordPage').hidden,false);
  assert.equal(f.doc.getElementById('homePage').hidden,true);
  assert.equal(f.doc.getElementById('sidebarEmail').textContent,'Аккаунт не подключён');
  assert.equal(f.calls.includes('list'),false);
 }finally{f.close();}
});
test('documents navigation filters only completed files and account link works',async()=>{
 const f=setup();
 try{
  await tick();
  f.doc.getElementById('navDocuments').click();
  await tick();
  assert.equal(f.doc.getElementById('documentsPage').hidden,false);
  assert.equal(f.doc.querySelectorAll('#documentsBody .history-row').length,1);
  f.doc.getElementById('documentsCabinet').click();
  await tick();
  assert.ok(f.calls.some(x=>x==='https://file-o.com/account?section=telemost'));
 }finally{f.close();}
});
