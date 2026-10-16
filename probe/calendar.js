// Local calendar UI and the sole audited Scheduled-row activation boundary.
(() => {
"use strict";
const WORDS = Object.freeze({
  'zh-Hant': ['日曆','展開','關閉','清除本機排程資料','超過 24 小時，請回 Scheduled 同步一次。','與前一則相差 {n} 分鐘','找不到相符排程，請在 Scheduled 手動尋找。','有多列相符，已標示候選；請自行選擇。','已開啟原生編輯畫面。','本機儲存失敗，請檢查瀏覽器設定。','上一月','下一月','時間未解析的項目請到 Scheduled 查看。'],
  'zh-Hans': ['日历','展开','关闭','清除本机排程数据','超过 24 小时，请回 Scheduled 同步一次。','与前一则相差 {n} 分钟','找不到相符排程，请在 Scheduled 手动寻找。','有多行相符，已标记候选；请自行选择。','已打开原生编辑画面。','本机存储失败，请检查浏览器设置。','上个月','下个月','时间未解析的项目请到 Scheduled 查看。'],
  en: ['Calendar','Expand','Close','Clear local schedule data','Over 24 hours old. Open Scheduled to sync again.','{n} minutes since previous','No matching scheduled post. Find it manually in Scheduled.','Multiple matching rows are highlighted. Choose one yourself.','Native editor opened.','Local storage failed. Check your browser settings.','Previous month','Next month','Open Scheduled to check items with unparsed times.'],
  ja: ['カレンダー','拡大','閉じる','ローカル予約データを削除','24時間以上経過。Scheduled で再同期してください。','前の投稿から {n} 分','一致する予約がありません。Scheduled で探してください。','候補が複数あります。強調した行から選んでください。','標準編集画面を開きました。','保存に失敗しました。ブラウザー設定を確認してください。','前月','翌月','時刻不明の項目は Scheduled で確認してください。'],
  ko: ['달력','확대','닫기','로컬 예약 데이터 지우기','24시간이 지났습니다. Scheduled에서 다시 동기화하세요.','이전 게시물 이후 {n}분','일치하는 예약이 없습니다. Scheduled에서 찾아주세요.','일치하는 여러 행을 강조했습니다. 직접 선택하세요.','기본 편집기를 열었습니다.','로컬 저장 실패. 브라우저 설정을 확인하세요.','이전 달','다음 달','시간을 읽지 못한 항목은 Scheduled에서 확인하세요.'],
  es: ['Calendario','Ampliar','Cerrar','Borrar datos locales','Han pasado más de 24 horas. Abre Scheduled para sincronizar.','{n} minutos desde el anterior','No hay coincidencias. Busca en Scheduled.','Hay varias filas coincidentes resaltadas. Elige una.','Editor nativo abierto.','No se pudo guardar. Revisa el navegador.','Mes anterior','Mes siguiente','Consulta Scheduled para las horas desconocidas.'],
  fr: ['Calendrier','Agrandir','Fermer','Effacer les données locales','Plus de 24 heures. Ouvrez Scheduled pour synchroniser.','{n} minutes depuis le précédent','Aucune correspondance. Cherchez dans Scheduled.','Plusieurs lignes correspondent et sont surlignées. Choisissez-en une.','Éditeur natif ouvert.','Échec du stockage local. Vérifiez le navigateur.','Mois précédent','Mois suivant','Consultez Scheduled pour les horaires inconnus.'],
  de: ['Kalender','Vergrößern','Schließen','Lokale Plandaten löschen','Über 24 Stunden alt. Öffne Scheduled zum Synchronisieren.','{n} Minuten seit dem vorherigen','Kein passender Beitrag. Suche in Scheduled.','Mehrere passende Zeilen sind markiert. Wähle selbst.','Nativer Editor geöffnet.','Lokales Speichern fehlgeschlagen. Prüfe den Browser.','Voriger Monat','Nächster Monat','Unbekannte Zeiten bitte in Scheduled prüfen.'],
  pt: ['Calendário','Expandir','Fechar','Limpar dados locais','Mais de 24 horas. Abra Scheduled para sincronizar.','{n} minutos desde o anterior','Nenhuma correspondência. Procure em Scheduled.','Várias linhas correspondentes estão destacadas. Escolha uma.','Editor nativo aberto.','Falha no armazenamento local. Verifique o navegador.','Mês anterior','Próximo mês','Consulte Scheduled para horários desconhecidos.'],
});
function stringsFor(doclang, navlang) {
  const values = WORDS[globalThis.XSCHED_OVERVIEW.language(doclang, navlang)];
  return {calendar:values[0], expand:values[1], close:values[2], clear:values[3], old:values[4], gap:values[5], missing:values[6], ambiguous:values[7], opened:values[8], failed:values[9], previous:values[10], next:values[11], unknown:values[12]};
}
function dateKey(at) { return `${String(at.getFullYear()).padStart(4,'0')}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`; }
function groups(items) {
  const result = new Map();
  let previous = null;
  for (const item of globalThis.XSCHED_OVERVIEW.sortItems(items).filter(globalThis.XSCHED_OVERVIEW.validTime)) {
    const key = dateKey(item.at);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push({item, gap:previous === null ? null : Math.round((item.at.getTime()-previous)/60000)});
    previous = item.at.getTime();
  }
  return [...result].map(([date, entries]) => ({date, entries}));
}
function monthDays(year, month) {
  const start = new Date(year, month, 1, 12);
  start.setDate(1-start.getDay());
  return Array.from({length:42}, (_, index) => {
    const at = new Date(start); at.setDate(start.getDate()+index);
    return {date:dateKey(at), day:at.getDate(), current:at.getFullYear()===year && at.getMonth()===month};
  });
}
// All native receiver checks live inside this digest-locked module. The reader
// supplies only the existing read-only time/body parser and Scheduled snapshot.
function editableRows(doc, reader) {
  const report=reader.readSnapshot(doc,{pathname:doc.defaultView.location.pathname});
  const scope=report.scopeElement;
  if (!report.onScheduled || !report.tab || !scope || scope===doc.body || scope===doc.documentElement) return [];
  const rows=[...scope.querySelectorAll('button, [role="button"]')].filter(node=>{
    if (node.closest('form') || node.disabled || node.getAttribute('aria-disabled')==='true'
      || (node.tagName==='BUTTON' && node.getAttribute('type')!=='button')
      || node.querySelectorAll('[data-testid="tweetText"]').length!==1
      || node.querySelector('[data-testid="tweetTextarea_0"], [role="textbox"], [contenteditable="true"], article')) return false;
    for (let ancestor=node;ancestor;ancestor=ancestor.parentElement) {
      if (ancestor.hidden || ancestor.getAttribute('aria-hidden')==='true' || ancestor.id==='xsched-probe-root'
        || ancestor.matches('article, [data-testid="tweet"], [contenteditable="true"], [role="textbox"]')
        || (ancestor!==scope && ancestor.getAttribute('role')==='dialog')) return false;
      const css=doc.defaultView?.getComputedStyle?.(ancestor);
      if (css && (css.display==='none' || css.visibility==='hidden' || css.visibility==='collapse')) return false;
      if (ancestor===scope) break;
    }
    const rect=node.getBoundingClientRect();
    return rect.width>0 && rect.height>0;
  });
  return rows.filter(node=>!rows.some(other=>other!==node && node.contains(other)))
    .map(node=>({node,item:reader.parseRow(node,true,{now:new Date(),lang:doc.documentElement.lang})})).filter(entry=>entry.item?.at);
}
function create(doc, {reader, store, changed, clearData}) {
  let pending = store.takeTarget(Date.now());
  let status = '';
  let marked = [];
  let shadow = null;
  let panelView = null;
  let full = null;
  let shown = false;
  let items = [];
  let syncedAt = 0;
  let partial = false;
  let failed = false;
  let month = null;
  let returnFocus = null;
  let fullSignature = '';
  const labels = () => stringsFor(doc.documentElement.lang, doc.defaultView?.navigator?.language);
  function node(tag, text, className) {
    const el = doc.createElement(tag); el.textContent = text; el.className = className || '';
    return el;
  }
  function style(el, values) { for (const [key,value] of Object.entries(values)) el.style.setProperty(key,value); return el; }
  function button(text, className, action) {
    const el = node('button', text, className); el.type = 'button';
    style(el, {background:'#15202b',color:'#e7e9ea',border:'1px solid #536471','border-radius':'5px',padding:'5px',cursor:'pointer','pointer-events':'auto',font:'inherit'});
    el.addEventListener('click', event => {event.preventDefault();event.stopPropagation();if(event.isTrusted)action(event);});
    return el;
  }
  function unmark() { for (const entry of marked) entry.node.style.outline = entry.outline; marked = []; }
  function close() {
    full?.remove(); full = null; fullSignature = '';
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function message(container) {
    const text = failed ? labels().failed : status ? labels()[status] : '';
    if (text) { const el = node('p', text, 'calendar-status');el.setAttribute('role','status');container.append(el); }
    if (partial) container.append(node('p',globalThis.XSCHED_OVERVIEW.stringsFor(doc.documentElement.lang,doc.defaultView?.navigator?.language).stale,'calendar-partial'));
    if (syncedAt && Date.now()-syncedAt>86400000) container.append(node('p', labels().old, 'calendar-old'));
    if (items.some(item => !globalThis.XSCHED_OVERVIEW.validTime(item))) container.append(node('p', labels().unknown, 'calendar-unknown'));
  }
  function entry(row) {
    const item = row.item;
    const el = button('', 'calendar-entry', event => request(event, item));
    style(el, {display:'block',width:'100%','text-align':'left','word-break':'break-word',margin:'3px 0'});
    el.dataset.calendarTime = String(item.at.getTime());
    el.append(node('span', `${String(item.at.getHours()).padStart(2,'0')}:${String(item.at.getMinutes()).padStart(2,'0')}`, 'calendar-time'));
    el.append(node('span', ' '+item.preview, 'calendar-preview'));
    const gap = node('small', row.gap === null ? '—' : labels().gap.replace('{n}',String(row.gap)), 'calendar-gap');
    gap.style.display = 'block'; el.append(gap);
    return el;
  }
  function drawPanel() {
    if (!panelView) return;
    panelView.replaceChildren();
    panelView.style.display = shown || status || failed ? 'block' : 'none';
    message(panelView);
    if (!shown) return;
    panelView.append(button(labels().clear, 'calendar-clear', () => {
      unmark(); pending=null; store.clearTarget(); status=''; clearData();
    }));
    for (const group of groups(items)) {
      const day = node('div','', 'calendar-day');day.dataset.calendarDate = group.date;
      day.append(node('h4',group.date,'calendar-date'));
      for (const row of group.entries) day.append(entry(row));
      panelView.append(day);
    }
  }
  function drawFull() {
    if (!full) return;
    full.replaceChildren();
    const toolbar = style(node('div','','calendar-full-toolbar'),{display:'flex',gap:'8px','align-items':'center','flex-wrap':'wrap',position:'sticky',top:'0',background:'#000',padding:'8px','z-index':'1'});
    toolbar.append(node('h2',`${labels().calendar} ${dateKey(new Date(month.year,month.month,1)).slice(0,7)}`,'calendar-month'));
    const move = delta => {const at=new Date(month.year,month.month+delta,1);month={year:at.getFullYear(),month:at.getMonth()};drawFull();};
    toolbar.append(button(labels().previous,'calendar-previous',()=>move(-1)),button(labels().next,'calendar-next',()=>move(1)),button(labels().close,'calendar-close',close));
    full.append(toolbar);
    if (syncedAt) full.append(node('p',`${globalThis.XSCHED_OVERVIEW.stringsFor(doc.documentElement.lang,doc.defaultView?.navigator?.language).synced}: ${reader.formatTime(new Date(syncedAt))}`,'calendar-synced'));
    message(full);
    const grid = style(node('div','','calendar-grid'),{display:'grid','grid-template-columns':'repeat(7, minmax(0, 1fr))',gap:'4px',padding:'8px'});
    grid.setAttribute('role','grid');grid.setAttribute('aria-label',labels().calendar);
    for (let day=0;day<7;day++) {
      const title=new Intl.DateTimeFormat(globalThis.XSCHED_OVERVIEW.language(doc.documentElement.lang,doc.defaultView?.navigator?.language),{weekday:'short'}).format(new Date(2027,7,1+day));
      const heading=node('strong',title,'calendar-weekday');heading.setAttribute('role','columnheader');grid.append(heading);
    }
    const grouped = new Map(groups(items).map(group=>[group.date,group.entries]));
    for (const day of monthDays(month.year,month.month)) {
      const cell = style(node('div','','calendar-cell'),{border:'1px solid #536471','min-height':'100px',padding:'4px','min-width':'0',opacity:day.current?'1':'.55'});
      cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',day.date);cell.dataset.calendarDate=day.date;
      cell.append(node('strong',String(day.day),'calendar-cell-date'));
      for (const row of grouped.get(day.date)||[]) cell.append(entry(row));
      grid.append(cell);
    }
    full.append(grid);
  }
  function expand(event) {
    close(); returnFocus=event.currentTarget;
    const at=items.find(globalThis.XSCHED_OVERVIEW.validTime)?.at || new Date();month={year:at.getFullYear(),month:at.getMonth()};
    full=style(node('div','','calendar-full'),{position:'fixed',inset:'0',width:'100vw',height:'100vh','box-sizing':'border-box',overflow:'auto',background:'#000',color:'#e7e9ea','pointer-events':'auto','z-index':'2147483647',font:'14px/1.4 system-ui, sans-serif'});
    full.setAttribute('role','dialog');full.setAttribute('aria-modal','true');full.setAttribute('aria-label',labels().calendar);full.tabIndex=-1;
    shadow.append(full);drawFull();full.focus();
  }
  function request(event, item) {
    if (!event.isTrusted || !globalThis.XSCHED_OVERVIEW.validTime(item)) return;
    unmark(); status='';pending=null;
    if (!store.clearTarget()) {failed=true;drawPanel();return;}
    if (!store.putTarget({time:item.at.getTime(),preview:item.preview},Date.now())) {failed=true;drawPanel();return;}
    pending=store.takeTarget(Date.now());
    if (!pending) {failed=true;drawPanel();return;}
    close();
    if (reader.classifyPath(doc.defaultView.location.pathname) === 'scheduled') { process(); changed(); }
    else {
      // Preserve the one-use target across this user-requested full navigation.
      if (!store.putTarget({time:pending.time,preview:pending.preview},Date.now())) {pending=null;failed=true;drawPanel();return;}
      pending=null;
      location.assign("https://x.com/compose/post/unsent/scheduled");
    }
  }
  function candidates(target) {
    return editableRows(doc,reader).filter(entry=>entry.item.at?.getTime()===target.time && entry.item.preview===target.preview);
  }
  function unmatched(matches) {
    status=matches.length?'ambiguous':'missing';
    for (const hit of matches) {marked.push({node:hit.node,outline:hit.node.style.outline});hit.node.style.outline='3px solid #ffd400';}
    drawPanel();
  }
  function expire() {
    if (pending && !store.target(pending,Date.now())) {pending=null;status='missing';drawPanel();}
  }
  function process() {
    expire();
    if (!pending) return;
    const report=reader.readSnapshot(doc,{pathname:doc.defaultView.location.pathname});
    const scope=report.scopeElement;
    if (!report.onScheduled || !report.tab || !scope || scope===doc.body || scope===doc.documentElement
      || scope.closest('[aria-busy="true"]') || scope.querySelector('[role="progressbar"], [aria-busy="true"]')) return;
    const loadedEmpty=scope.querySelector('[data-testid="emptyState"]') || [...scope.querySelectorAll('p, span, div')].some(node=>!node.children.length && node.textContent.trim()==='Nothing scheduled yet.');
    if (!report.items.length && !loadedEmpty) return;
    const target=pending;pending=null;unmark();
    // The target is consumed even on zero/ambiguous matches. Never retry a click.
    const matches=candidates(target);
    if (matches.length!==1) {
      unmatched(matches);return;
    }
    const row=matches[0].node;
    // Re-read identity, scope, visibility and uniqueness immediately before activation.
    const current=candidates(target);
    if (current.length!==1) {unmatched(current);return;}
    if (current[0].node!==row || !row.isConnected) {status='missing';drawPanel();return;}
    row.click();
    status='opened';drawPanel();
  }
  function mount(root, overviewBox, body, before, nextItems, at, incomplete, storageFailed) {
    if (shadow && shadow!==root) close();
    shadow=root;items=nextItems;syncedAt=at;partial=incomplete;failed=storageFailed;
    const toolbar=style(node('div','','calendar-toolbar'),{position:'absolute',right:'0',top:'0',display:'flex',gap:'4px','font-size':'10px','line-height':'1.2'});
    const toggle=button(labels().calendar,'calendar-toggle',event=>{shown=!shown;event.currentTarget.setAttribute('aria-expanded',String(shown));drawPanel();});
    toggle.setAttribute('aria-expanded',String(shown));
    toolbar.append(toggle,button(labels().expand,'calendar-expand',expand));
    overviewBox.style.position='relative';overviewBox.append(toolbar);
    if (syncedAt && Date.now()-syncedAt>86400000) overviewBox.append(node('p',labels().old,'calendar-old'));
    panelView=style(node('div','','calendar-view'),{'font-size':'12px','pointer-events':'auto'});
    body.insertBefore(panelView,before);drawPanel();
    const signature=JSON.stringify([items.map(item=>[item.at?.getTime(),item.preview]),syncedAt,partial,failed,Date.now()-syncedAt>86400000,doc.documentElement.lang]);
    if (signature!==fullSignature) {fullSignature=signature;drawFull();}
  }
  function onKey(event) {
    if (!full) return;
    if (event.key==='Escape') {event.preventDefault();event.stopPropagation();close();}
    if (event.key==='Tab') {
      const buttons=[...full.querySelectorAll('button')];
      const first=buttons[0];
      const last=buttons[buttons.length-1];
      if (event.shiftKey && (shadow.activeElement===first || shadow.activeElement===full)) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && shadow.activeElement===last) {event.preventDefault();first?.focus();}
    }
  }
  doc.addEventListener('keydown',onKey,true);
  return {mount, process, expire, reset(){pending=null;store.clearTarget();unmark();status='';close();},dispose(){pending=null;unmark();close();doc.removeEventListener('keydown',onKey,true);}};
}
globalThis.XSCHED_CALENDAR=Object.freeze({WORDS,stringsFor,dateKey,groups,monthDays,editableRows,create});
})();
