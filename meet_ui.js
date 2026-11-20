'use strict';

/* FILE-O Meet 2026 dashboard: presentation bound only to real meeting data.
 * Existing recording, encrypted upload, meeting APIs and edit workflow
 * remain in renderer.js / workspace.js. No invented speakers or summaries.
 */
(() => {
  const el=id=>document.getElementById(id);
  let activeMeeting=null,loadedSegments=[],activePage='home';
  let copyBusy=false;
  const create=(tag,className,text)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  const localTime=seconds=>{
    const value=Math.max(0,Math.floor(Number(seconds)||0));
    const hours=Math.floor(value/3600);
    const mm=String(Math.floor(value/60)%60).padStart(2,'0');
    const ss=String(value%60).padStart(2,'0');
    return hours?String(hours).padStart(2,'0')+':'+mm+':'+ss:mm+':'+ss;
  };
  function show(page){
    activePage=page;
    const isDetail=page==='document';
    document.body.classList.toggle('is-meeting-detail',isDetail);
    if(el('meetingSubnav'))el('meetingSubnav').hidden=!isDetail;
    if(el('topMeetActions'))el('topMeetActions').hidden=!isDetail;
    if(isDetail && activeMeeting){
      const title=activeMeeting.meeting?.title||'Протокол встречи';
      el('currentViewName').textContent=title;
    }
  }
  function renderDetail(meeting,segments){
    activeMeeting=meeting;
    loadedSegments=Array.isArray(segments)?segments.slice():[];
    const meta=meeting?.meeting||{};
    const docs=meeting?.documents||{};
    const sections=meeting?.sections||{};
    const wholeTranscript=typeof docs.raw_text==='string'?docs.raw_text:'';
    const partialTranscript=loadedSegments.map(s=>String(s?.text||'')).join(' ');
    const countWords=text=>String(text||'').trim().match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length||0;
    const count=countWords(wholeTranscript||partialTranscript);
    el('metricDuration').textContent=meeting?.duration!=null?
      localTime(meeting.duration):'—';
    el('metricWords').textContent=count?count.toLocaleString('ru-RU'):'—';
    el('metricFragments').textContent=Number.isFinite(Number(meeting?.segment_total))?
      Number(meeting.segment_total).toLocaleString('ru-RU'):String(loadedSegments.length);
    const participants=Number(meta.participant_count);
    el('metricParticipants').textContent=Number.isInteger(participants)&&participants>0?
      String(participants):'—';
    el('meetingSpeakerNote').textContent=participants>0?
      'Указано участников: '+participants+'. Имена говорящих автоматически не определяются.':
      'Имена и количество говорящих автоматически не определяются. Данные можно уточнить вручную.';
    if(activePage==='document'){
      el('currentViewName').textContent=meta.title||'Протокол встречи';
    }
    renderTopicMarkers(meeting.markers||[]);
    renderList('detailTopics',sections.discussed);
    renderList('detailRisks',sections.risks);
    el('detailRisksSection').hidden=!Array.isArray(sections.risks)||!sections.risks.length;
    renderKeywords(sections.discussed||[]);
    // The download is an account export, not a nonexistent local exporter.
    el('topMeetExport').disabled=!meeting?.meeting?.id;
    const hasText=Boolean(wholeTranscript||partialTranscript);
    el('topMeetCopy').disabled=!hasText;
  }
  function renderList(id,items){
    const target=el(id);if(!target)return;
    target.replaceChildren();
    if(!Array.isArray(items)||items.length===0){
      target.append(create('li','no-items','Не указано'));
      return;
    }
    items.filter(v=>typeof v==='string'&&v.trim())
         .slice(0,35).forEach(value=>target.append(create('li','',value)));
    if(!target.childElementCount)target.append(create('li','no-items','Не указано'));
  }
  function renderKeywords(topics){
    const box=el('detailKeywordChips');box.replaceChildren();
    // Only actual meeting topics are used; do not fabricate entities
    // from generic document words and pretend they were AI-classified.
    const items=Array.isArray(topics)?topics:[];
    const dedup=new Set();
    items.forEach(item=>{
      const value=String(item||'').trim();
      if(!value||dedup.has(value.toLocaleLowerCase('ru-RU')))return;
      dedup.add(value.toLocaleLowerCase('ru-RU'));
      if(dedup.size<=12)box.append(create('span','meet-keyword-chip',value));
    });
    if(!box.childElementCount)box.append(create('span','meet-keyword-empty',
      'Темы появятся, когда они будут выделены в протоколе.'));
  }
  function renderTopicMarkers(markers){
    const box=el('meetingTopicStrip');if(!box)return;
    box.replaceChildren();
    const items=Array.isArray(markers)?markers.slice(0,12):[];
    if(!items.length){
      box.append(create('span','meet-topic-empty',
        'Временные отметки пока не добавлены.'));
      return;
    }
    items.forEach(item=>{
      const sec=Math.max(0,Math.floor(Number(item.start_ms||0)/1000));
      const chip=create('button','meet-topic-chip');
      chip.type='button';
      chip.title='Перейти к доступному фрагменту возле '+localTime(sec);
      chip.append(create('b','',localTime(sec)));
      chip.append(document.createTextNode(String(item.title||'Важный момент')));
      chip.addEventListener('click',()=>goToSegment(sec));
      box.append(chip);
    });
  }
  function goToSegment(seconds){
    // Search only loaded segments. If the time is outside the loaded
    // window, tell the user; never jump to the wrong part of a transcript.
    const rows=[...el('detailTranscript').querySelectorAll('.segment-row')];
    const nearest=loadedSegments
      .map((v,i)=>({idx:i,dist:Math.abs((Number(v.start)||0)-seconds)}))
      .sort((a,b)=>a.dist-b.dist)[0];
    if(!nearest||!rows[nearest.idx] ||
        (activeMeeting?.segment_has_more &&
         seconds>Number(loadedSegments[loadedSegments.length-1]?.end||0)+15)){
      note('Отметка находится за пределами загруженного текста. Нажмите «Показать ещё фрагменты».');
      el('documentTranscriptPanel').scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(el('documentTranscriptSearch').value){
      el('documentTranscriptSearch').value='';
      el('documentTranscriptSearch').dispatchEvent(new Event('input',{bubbles:true}));
    }
    const row=rows[nearest.idx];
    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.classList.add('meet-segment-focused');
    setTimeout(()=>row.classList.remove('meet-segment-focused'),1200);
  }
  function note(message,error=false){
    const status=el('documentStatus');
    if(!status)return;
    status.textContent=message;
    status.classList.toggle('is-error',Boolean(error));
  }
  async function copyTranscript(){
    if(copyBusy||!activeMeeting)return;
    const raw=typeof activeMeeting.documents?.raw_text==='string'?
      activeMeeting.documents.raw_text:'';
    const loaded=loadedSegments
      .filter(part=>part&&typeof part.text==='string'&&part.text.trim())
      .map(part=>localTime(part.start)+'  '+part.text.trim()).join('\n\n');
    const content=(raw.trim()||loaded).slice(0,180000);
    if(!content){note('В этой встрече пока нет текста для копирования.');return;}
    copyBusy=true;
    try{
      if(typeof window.fileo?.copyText==='function'){
        await window.fileo.copyText(content);
      }else if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(content);
      }else throw Error('Не удалось получить доступ к буферу обмена.');
      note(raw?'Текст встречи скопирован.':
        'Скопированы загруженные фрагменты. Для полной расшифровки откройте протокол в кабинете.');
    }catch(_){note('Не удалось скопировать текст. Попробуйте ещё раз.',true);}
    finally{copyBusy=false;}
  }
  function onRecordStatus(info){
    const playing=Boolean(info?.recording);
    const busy=Boolean(info?.busy)||['uploading','processing'].includes(info?.state);
    const panel=el('sidebarRecordButton'),parent=panel.closest('.sidebar-recorder');
    parent.classList.toggle('is-recording',playing);
    panel.textContent=playing?'Открыть запись':busy?'Посмотреть обработку':'Начать запись';
    el('sidebarRecordStatus').textContent=playing?'Запись идёт':
      busy?'Фрагменты обрабатываются':'Запись не идёт';
  }
  function bind(){
    el('sidebarRecordButton')?.addEventListener('click',()=>{
      // One deliberate user action opens the recorder and starts it.
      // An active recording or processing task is only displayed, never
      // restarted by another click.
      const button=el('sidebarRecordButton');
      const isActive=button?.closest('.sidebar-recorder')?.classList.contains('is-recording');
      const isBusy=button?.textContent?.includes('обработку');
      el('navNew')?.click();
      if (isActive || isBusy) return;
      const start=el('start');
      if (start && !start.disabled) start.click();
    });
    el('meetingNavBack')?.addEventListener('click',()=>el('navMeetings')?.click());
    document.querySelectorAll('[data-meet-jump]').forEach(button=>{
      button.addEventListener('click',()=>{
        const target=el(button.dataset.meetJump);
        if(!target)return;
        document.querySelectorAll('[data-meet-jump]').forEach(other=>
          other.classList.toggle('selected',other===button));
        target.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });
    el('meetingSpeakerEdit')?.addEventListener('click',()=>{
      el('documentEdit')?.click();
      el('documentEditMeta')?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    el('topMeetExport')?.addEventListener('click',()=>el('documentToCabinet')?.click());
    el('topMeetCopy')?.addEventListener('click',copyTranscript);
    window.fileo?.onUpdate?.(onRecordStatus);
    window.fileo?.getState?.().then(onRecordStatus).catch(()=>{});
    show('home');
  }
  window.FILEOMeetUI=Object.freeze({show,renderDetail,onRecordStatus,copyTranscript});
  bind();
})();
