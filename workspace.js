'use strict';

/* FILE-O desktop workspace: real meeting history, source-timed transcript,
 * decisions, tasks and revision-locked editing from existing Meeting API.
 * Does not emulate speaker detection or audio playback.
 */
(() => {
  const bridge = window.fileo;
  const byId = id => document.getElementById(id);
  const PAGES = ['home', 'record', 'meetings', 'documents', 'document', 'settings'];
  const labels = {home:'Главная',record:'Новая запись',meetings:'Все встречи',
    documents:'Документы',document:'Протокол встречи',settings:'Настройки'};
  let active='record',profile=null,meetings=[],detail=null;
  let segments=[],viewSource='meetings',editing=false,loading=false;
  let lastListAt=0;
  let draftVersion=0;

  const node=(tag,className,text)=>{
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(text!==undefined)element.textContent=String(text);
    return element;
  };
  const dateFormat=seconds=>{
    if(!Number.isFinite(Number(seconds))||!seconds)return '—';
    return new Date(Number(seconds)*1000).toLocaleDateString('ru-RU',{
      day:'2-digit',month:'short',year:'numeric'});
  };
  const timeFormat=seconds=>{
    const x=Math.max(0,Math.floor(Number(seconds)||0));
    const h=Math.floor(x/3600);
    return (h?String(h).padStart(2,'0')+':':'')+
      String(Math.floor(x/60)%60).padStart(2,'0')+':'+
      String(x%60).padStart(2,'0');
  };
  const statusLabel=state=>({
    done:'Готово',recording:'Идёт запись',finalizing:'Расшифровка',
    compiling:'Готовим протокол',error:'Ошибка'
  })[state]||'Обрабатывается';
  function setText(id,value){const elem=byId(id);if(elem)elem.textContent=String(value||'');}
  function setStatus(text,error=false,target='meetingsStatus'){
    const elem=byId(target);if(!elem)return;
    elem.textContent=text||'';
    elem.classList.toggle('is-error',Boolean(error));
  }
  function show(page){
    if(!PAGES.includes(page))return;
    active=page;
    PAGES.forEach(key=>{
      const div=byId(key+'Page');if(div)div.hidden=key!==page;
    });
    document.querySelectorAll('.nav-item[data-view]').forEach(item=>{
      const selected=item.dataset.view===page;
      item.classList.toggle('active',selected);
      if(selected)item.setAttribute('aria-current','page');
      else item.removeAttribute('aria-current');
    });
    setText('currentViewName',labels[page]||'Meeting');
    if(page==='home'||page==='meetings'||page==='documents')refresh();
    if(page==='record'){
      byId('subject')?.focus({preventScroll:true});
    }
  }
  async function loadProfile(){
    try{
      const p=await bridge.profile();
      profile=p?.connected?p:null;
      setText('sidebarEmail',profile?.email||'Аккаунт не подключён');
      setText('sidebarPlan',profile?.plan||'FILE-O Meeting');
      setText('settingsEmail',profile?.email||'Не подключён');
      setText('settingsPlan',profile?.plan||'Не подключён');
      setText('syncState',profile?'FILE-O подключён':'Требуется подключение');
      byId('syncLight')?.classList.toggle('online',Boolean(profile));
      if(!profile){meetings=[];setText('homeMetrics','Подключите аккаунт для истории встреч');}
      return Boolean(profile);
    }catch(error){
      setText('sidebarEmail','Нет соединения');
      setText('syncState','Проверяем подключение');
      return false;
    }
  }
  function table(container,records,context){
    container.replaceChildren();
    if(!records.length){
      const wrapper=node('div','history-empty');
      wrapper.append(node('strong','',context==='documents'?
        'Готовых документов пока нет':'Здесь появятся ваши встречи'));
      wrapper.append(node('p','',profile?
        'Начните запись — после обработки материалы сохранятся здесь.':
        'Подключите аккаунт FILE-O, чтобы увидеть историю.'));
      const newBtn=node('button','btn btn-outline','Новая запись');
      newBtn.type='button';newBtn.addEventListener('click',()=>show('record'));
      wrapper.append(newBtn);
      container.append(wrapper);
      return;
    }
    const head=node('div','history-head');
    ['ДАТА','ТЕМА','УЧАСТНИКИ','СТАТУС',''].forEach(t=>head.append(node('span','',t)));
    container.append(head);
    for(const m of records){
      const item=node('div','history-row');
      item.append(node('span','history-date',dateFormat(m.started)));
      const subject=node('div','history-subject');
      subject.append(node('strong','',m.title||'Встреча'));
      if(String(m.title||'').startsWith('ДЕМО'))
        subject.append(node('small','demo-label','Пример · данные вымышлены'));
      item.append(subject);
      item.append(node('span','history-count',m.participant_count||'—'));
      item.append(node('span','history-status '+(m.state||''),
        statusLabel(m.state)));
      const open=node('button','history-open','Открыть');
      open.type='button';
      open.addEventListener('click',()=>{
        viewSource=context==='documents'?'documents':'meetings';
        openMeeting(m.id);
      });
      item.append(open);
      container.append(item);
    }
  }
  async function refresh(force=false){
    if(loading)return;
    if(!profile){table(byId('homeRecent'),[],'home');return;}
    if(!force&&Date.now()-lastListAt<9000){
      renderLists();return;
    }
    loading=true;
    try{
      const result=await bridge.list();
      meetings=Array.isArray(result?.sessions)?result.sessions:[];
      lastListAt=Date.now();
      renderLists();
      setStatus('');
    }catch(error){
      setStatus(error.message||'Не удалось получить встречи.',true);
      if(!meetings.length)renderLists();
    }finally{loading=false;}
  }
  function renderLists(){
    table(byId('homeRecent'),meetings.slice(0,5),'home');
    const count=meetings.length;
    const finished=meetings.filter(x=>x.state==='done').length;
    const inProgress=meetings.filter(x=>!['done','error'].includes(x.state)).length;
    setText('homeMetrics',count===0?'Встреч ещё нет':
      count+' встреч · '+finished+' готовы'+
      (inProgress?' · '+inProgress+' обрабатываются':''));
    const search=String(byId('meetingsSearch')?.value||'').trim().toLocaleLowerCase('ru-RU');
    table(byId('meetingsBody'),meetings.filter(m=>
      !search||String(m.title||'').toLocaleLowerCase('ru-RU').includes(search)), 'meetings');
    table(byId('documentsBody'),meetings.filter(m=>m.state==='done'),'documents');
  }

  function renderSegments(newSegments,append=false){
    const target=byId('detailTranscript');
    if(!append)target.replaceChildren();
    if(!newSegments.length&&!append){
      target.append(node('p','empty-state',
        'В этой записи нет доступной расшифровки с таймкодами.'));
      return;
    }
    for(const part of newSegments){
      if(!part||!part.text)continue;
      const row=node('div','segment-row');
      const time=node('span','segment-time',timeFormat(part.start));
      const text=node('p','segment-text',part.text);
      row.append(time,text);target.append(row);
    }
    setText('documentSegmentCount',
      'Показано '+segments.length+' из '+(detail?.segment_total||segments.length));
    byId('moreSegments').hidden=!detail?.segment_has_more;
    filterTranscript();
  }
  function filterTranscript(){
    const term=String(byId('documentTranscriptSearch')?.value||'').trim()
        .toLocaleLowerCase('ru-RU');
    const all=[...byId('detailTranscript').querySelectorAll('.segment-row')];
    let visible=0;
    for(const row of all){
      const match=!term||row.textContent.toLocaleLowerCase('ru-RU').includes(term);
      row.hidden=!match;
      if(match)visible++;
    }
    const empty=byId('detailTranscript').querySelector('.transcript-no-matches');
    if(empty)empty.remove();
    if(term&&!visible){
      byId('detailTranscript').append(node('p','transcript-no-matches',
        'Среди загруженных фрагментов совпадений нет. '+
        'Если запись длинная, нажмите «Показать ещё фрагменты».'));
    }
    if(term){
      setText('documentSegmentCount','Совпадений: '+visible+
        ' / загружено '+all.length);
    }
  }
  function renderList(id,values){
    const ul=byId(id);ul.replaceChildren();
    const items=Array.isArray(values)?values:[];
    if(!items.length)ul.append(node('li','no-items','Не зафиксировано'));
    else items.forEach(v=>ul.append(node('li','',v)));
  }
  function renderDetail(){
    if(!detail)return;
    const m=detail.meeting||{};
    setText('documentTitle',m.title||'Встреча');
    setText('documentMeta',
      [dateFormat(m.started),timeFormat(detail.duration),
        m.participant_count?m.participant_count+' участника(ов)':'Участники не указаны']
        .join(' · '));
    byId('detailDemoLabel').hidden=!String(m.title||'').startsWith('ДЕМО');
    byId('documentTranscriptSearch').value='';
    renderSegments(segments);
    setText('detailBrief',detail.documents?.brief||'Краткое содержание не сформировано.');
    renderList('detailDecisions',detail.sections?.decided);
    renderList('detailTasks',detail.sections?.next_steps);
    const markers=detail.markers||[];
    byId('detailHighlightsSection').hidden=!markers.length;
    renderList('detailHighlights',markers.map(x=>
      timeFormat((x.start_ms||0)/1000)+' · '+(x.title||'Важный момент')));
    setText('documentStatus','');
    byId('documentTitleInput').value=m.title||'';
    byId('documentCountInput').value=m.participant_count||'';
    byId('detailFormattedEditor').value=detail.documents?.formatted||'';
    byId('detailDecisionsEditor').value=(detail.sections?.decided||[]).join('\n');
    byId('detailTasksEditor').value=(detail.sections?.next_steps||[]).join('\n');
    setEditMode(false);
  }
  function setEditMode(value){
    editing=Boolean(value);
    byId('documentEdit').hidden=editing;
    byId('documentSave').hidden=!editing;
    for(const id of ['documentEditMeta','detailEditTextLabel',
      'detailDecisionsEditLabel','detailTasksEditLabel']){
      byId(id).hidden=!editing;
    }
    for(const id of ['detailDecisions','detailTasks'])byId(id).hidden=editing;
  }
  async function openMeeting(id){
    if(!/^[A-Za-z0-9_-]{15,55}$/.test(String(id)))return;
    show('document');
    setText('documentStatus','Загружаем протокол…');
    byId('detailTranscript').replaceChildren();
    try{
      const data=await bridge.document(id,0);
      if(!data?.ready)throw Error('Протокол ещё обрабатывается.');
      detail=data;
      segments=Array.isArray(data.segments)?data.segments.slice():[];
      renderDetail();
    }catch(error){
      detail=null;
      setText('documentTitle','Не удалось открыть встречу');
      setStatus(error.message||'Документ недоступен.',true,'documentStatus');
    }
  }
  async function loadMore(){
    if(!detail?.segment_has_more)return;
    const button=byId('moreSegments');button.disabled=true;
    try{
      const next=await bridge.document(detail.meeting.id,segments.length);
      const parts=Array.isArray(next?.segments)?next.segments:[];
      segments.push(...parts);
      detail.segment_has_more=Boolean(next.segment_has_more);
      detail.segment_total=next.segment_total;
      renderSegments(parts,true);
    }catch(error){
      setStatus(error.message||'Не удалось загрузить следующие фразы.',true,'documentStatus');
    }finally{button.disabled=false;}
  }
  async function save(){
    if(!detail||!editing)return;
    const title=byId('documentTitleInput').value.trim();
    const countRaw=byId('documentCountInput').value.trim();
    const count=countRaw?Number(countRaw):null;
    if(title.length<3||title.length>120||count!==null&&
       (!Number.isInteger(count)||count<1||count>100)){
      setStatus('Проверьте тему и количество участников.',true,'documentStatus');return;
    }
    const original=detail.sections||{};
    const sections={};
    for(const key of ['discussed','decided','next_steps','risks','open_questions']){
      sections[key]=Array.isArray(original[key])?original[key].slice():[];
    }
    for(const [key,id] of [['decided','detailDecisionsEditor'],['next_steps','detailTasksEditor']]){
      sections[key]=byId(id).value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      if(sections[key].length>60||sections[key].some(x=>x.length>450)){
        setStatus('Не более 60 пунктов по 450 символов.',true,'documentStatus');return;
      }
    }
    const overrides={};
    for(const key of ['formatted','summary','brief','raw_text']){
      overrides[key]=detail.documents?.[key]||'';
    }
    overrides.formatted=byId('detailFormattedEditor').value;
    const revision=detail.revision;
    const button=byId('documentSave');button.disabled=true;
    setText('documentStatus','Сохраняем в личном кабинете…');
    try{
      const saved=await bridge.saveDocument(detail.meeting.id,{
        revision,title,participant_count:count,sections,overrides
      });
      detail.revision=saved.revision;
      detail.meeting.title=title;
      detail.meeting.participant_count=count;
      detail.sections=sections;
      detail.documents={...detail.documents,...overrides};
      renderDetail();
      setText('documentStatus','Изменения сохранены в FILE-O.');
      lastListAt=0;
    }catch(error){
      setStatus(error.message||'Не удалось сохранить документ.',true,'documentStatus');
    }finally{button.disabled=false;}
  }
  function navigateToRecord(){
    show('record');
    byId('subject')?.focus({preventScroll:true});
  }
  function openCabinet(){
    bridge.open('https://file-o.com/account?section=telemost');
  }
  for(const btn of document.querySelectorAll('.nav-item[data-view]')){
    btn.addEventListener('click',()=>show(btn.dataset.view));
  }
  byId('quickRecord').addEventListener('click',navigateToRecord);
  byId('meetingsNew').addEventListener('click',navigateToRecord);
  byId('homeAll').addEventListener('click',()=>show('meetings'));
  byId('meetingsSearch').addEventListener('input',renderLists);
  byId('documentsCabinet').addEventListener('click',openCabinet);
  byId('settingsCabinet').addEventListener('click',openCabinet);
  byId('settingsDisconnect').addEventListener('click',()=>{
    const button=byId('disconnect');
    if(button&&!button.disabled)button.click();
    setTimeout(()=>loadProfile().then(()=>show('record')),700);
  });
  byId('documentBack').addEventListener('click',()=>show(viewSource));
  byId('documentEdit').addEventListener('click',()=>setEditMode(true));
  byId('documentSave').addEventListener('click',save);
  byId('moreSegments').addEventListener('click',loadMore);
  byId('documentTranscriptSearch').addEventListener('input',filterTranscript);
  byId('documentToCabinet').addEventListener('click',()=>{
    if(!detail)return;
    bridge.open('https://file-o.com/account?section=telemost&meeting='+
                encodeURIComponent(detail.meeting.id));
  });
  window.addEventListener('fileo:connected',()=>{
    loadProfile().then(ok=>{if(ok)show('home');});
  });
  window.addEventListener('fileo:disconnected',()=>{
    loadProfile().then(()=>show('record'));
  });
  window.addEventListener('fileo:record-started',()=>show('record'));
  bridge.onUpdate(info=>{
    if(!info)return;
    if(info.recording||['uploading','processing'].includes(info.state)){
      setText('syncState',info.recording?'Запись и синхронизация':'Синхронизируем запись');
      byId('syncLight')?.classList.add('online');
    }else if(info.state==='done'){
      setText('syncState','Протокол готов');
      lastListAt=0;
    }
  });
  // A read-only UI heartbeat. The underlying recorder and its upload retry
  // loops remain in the main process, independent of this page.
  setInterval(()=>{
    if(profile&&!document.hidden&&['home','meetings','documents'].includes(active))
      refresh();
  },30000);
  (async()=>{
    const connected=await loadProfile();
    show(connected?'home':'record');
  })();
})();
