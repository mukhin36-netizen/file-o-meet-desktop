'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const design=fs.readFileSync(__dirname+'/../meet_ui.js','utf8');
const workspace=fs.readFileSync(__dirname+'/../workspace.js','utf8');
const sample={
  id:'L5Dp9mlR-fivgVPRhW6ZQzpfl4w',
  title:'ДЕМО · Реальный формат встречи',state:'done',
  started:1794567600,participant_count:3
};
const text=['Обсудили документы','Согласовали сроки','Проверили запуск'];
function setup(){
  const dom=new JSDOM(html,{url:'file:///tmp/fileo/index.html',runScripts:'outside-only'});
  const w=dom.window;
  w.HTMLElement.prototype.focus=()=>{};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  let copied='';
  const called=[];
  const meeting={
    ready:true,revision:1,duration:1890,meeting:sample,
    documents:{brief:'Краткое содержание по материалам',raw_text:text.join('\n'),
      formatted:'Протокол встречи'},
    sections:{discussed:['Конвертация документов','Релиз'],decided:['Одобрено'],
      next_steps:['Подготовить сборку'],risks:['Ограничение времени'],
      open_questions:[]},
    markers:[{start_ms:90000,title:'Ключевой вопрос'}],
    segments:text.map((value,i)=>({start:10+i*80,end:40+i*80,text:value})),
    segment_total:3,segment_has_more:false
  };
  w.fileo={
    profile:async()=>({connected:true,email:'qa@example.invalid',plan:'Тестирование'}),
    list:async()=>({sessions:[sample]}),
    document:async()=>meeting,
    getState:async()=>({recording:false,state:'idle'}),
    copyText:async content=>{copied=content;return {ok:true};},
    saveDocument:async()=>({revision:2}),
    open:async url=>{called.push(url);},
    onUpdate:()=>()=>{}
  };
  w.eval(design);w.eval(workspace);
  return {dom,w,called,getCopied:()=>copied};
}
const tick=async()=>{for(let i=0;i<9;i++)await new Promise(resolve=>setImmediate(resolve));};
test('Russian meeting detail uses real values and never invents speaker names',async()=>{
  const f=setup();try{
    await tick();f.w.document.querySelector('#homeRecent .history-open').click();await tick();
    const d=f.w.document;
    assert.equal(d.querySelector('#metricDuration').textContent,'31:30');
    assert.equal(d.querySelector('#metricWords').textContent,'6');
    assert.equal(d.querySelector('#metricFragments').textContent,'3');
    assert.equal(d.querySelector('#metricParticipants').textContent,'3');
    assert.match(d.querySelector('#meetingSpeakerNote').textContent,/не определяются/);
    assert.match(d.querySelector('#detailTopics').textContent,/Конвертация документов/);
    assert.match(d.querySelector('#detailRisks').textContent,/Ограничение времени/);
    assert.equal(d.querySelectorAll('.meet-topic-chip').length,1);
    assert.equal(d.querySelectorAll('.segment-row').length,3);
    assert.equal(d.body.classList.contains('is-meeting-detail'),true);
    assert.equal(d.querySelector('#topMeetActions').hidden,false);
    assert.doesNotMatch(d.querySelector('#detailTranscript').textContent,/София Мартин|Томас Дюбуа/);
  }finally{f.w.close();}
});
test('copy and export buttons connect to real clipboard and cabinet actions',async()=>{
  const f=setup();try{
    await tick();f.w.document.querySelector('#homeRecent .history-open').click();await tick();
    f.w.document.querySelector('#topMeetCopy').click();await tick();
    assert.match(f.getCopied(),/Обсудили документы/);
    f.w.document.querySelector('#topMeetExport').click();await tick();
    assert.ok(f.called.some(url=>url.includes('/account?section=telemost&meeting=')));
  }finally{f.w.close();}
});
test('sidebar record starts the real recorder with a single click when ready',async()=>{
  const f=setup();try{
    await tick();
    let started=0;
    const button=f.w.document.getElementById('start');
    button.disabled=false;
    button.addEventListener('click',()=>started++);
    f.w.document.querySelector('#sidebarRecordButton').click();await tick();
    assert.equal(f.w.document.querySelector('#recordPage').hidden,false);
    assert.equal(f.w.document.querySelector('#meetingSubnav').hidden,true);
    assert.equal(f.w.document.querySelector('#topMeetActions').hidden,true);
    assert.equal(started,1);
  }finally{f.w.close();}
});
test('recording indicator accurately follows real bridge state',async()=>{
  const f=setup();try{
    await tick();
    f.w.FILEOMeetUI.onRecordStatus({recording:true,state:'recording'});
    assert.equal(f.w.document.querySelector('.sidebar-recorder').classList.contains('is-recording'),true);
    assert.match(f.w.document.querySelector('#sidebarRecordStatus').textContent,/Запись идёт/);
    f.w.FILEOMeetUI.onRecordStatus({recording:false,state:'idle'});
    assert.equal(f.w.document.querySelector('.sidebar-recorder').classList.contains('is-recording'),false);
  }finally{f.w.close();}
});
