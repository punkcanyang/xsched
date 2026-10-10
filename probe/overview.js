// Read-only overview. Dates/previews come only from the reader's accumulated items.
// Native rows are never queried again, clicked, focused, or modified here.
(() => {
'use strict';
const MAX_DAYS = 90;
const STRINGS = Object.freeze({
  'zh-Hant': {title:'總覽',list:'列表',empty:'空',count:'{n} 則',missing:'請在列表中捲動到此則',goto:'請前往 Scheduled 並捲動列表',none:'尚未讀到排程',unknown:'時間未解析',limit:'僅展開前 {n} 天；後面尚有 {days} 天、{posts} 則',scroll:'捲動到這則排程',hint:'僅顯示已讀資料；請自己捲到底。空日不代表可用時段。'},
  'zh-Hans': {title:'总览',list:'列表',empty:'空',count:'{n} 则',missing:'请在列表中滚动到此则',goto:'请前往 Scheduled 并滚动列表',none:'尚未读到排程',unknown:'时间未解析',limit:'仅展开前 {n} 天；后面还有 {days} 天、{posts} 则',scroll:'滚动到这则排程',hint:'仅显示已读数据；请自己滚到底。空日不代表可用时段。'},
  en: {title:'Overview',list:'List',empty:'No posts',count:'{n} posts',missing:'Scroll the X list until this post is visible',goto:'Go to Scheduled and scroll the list',none:'No scheduled posts read yet',unknown:'Time not parsed',limit:'First {n} days shown; {days} days and {posts} posts remain',scroll:'Scroll to this scheduled post',hint:'Read items only; scroll the X list to the end yourself. Empty days are not available slots.'},
  ja: {title:'一覧',list:'リスト',empty:'投稿なし',count:'{n} 件',missing:'Xのリストでこの投稿までスクロールしてください',goto:'Scheduledでリストをスクロールしてください',none:'予約投稿はまだ読み取れていません',unknown:'時刻未解析',limit:'最初の{n}日を表示。残り{days}日、{posts}件',scroll:'この予約投稿へスクロール',hint:'読み取り済みのみ。Xのリストを最後までスクロールしてください。空の日は空き枠ではありません。'},
  ko: {title:'개요',list:'목록',empty:'게시물 없음',count:'{n}개',missing:'X 목록에서 이 게시물까지 스크롤하세요',goto:'Scheduled에서 목록을 스크롤하세요',none:'읽은 예약 게시물이 없습니다',unknown:'시간 해석 실패',limit:'처음 {n}일 표시; {days}일, {posts}개 남음',scroll:'이 예약 게시물로 스크롤',hint:'읽은 항목만 표시합니다. X 목록 끝까지 직접 스크롤하세요. 빈 날짜는 사용 가능한 시간대가 아닙니다.'},
  es: {title:'Resumen',list:'Lista',empty:'Sin publicaciones',count:'{n} publicaciones',missing:'Desplaza la lista de X hasta esta publicación',goto:'Ve a Scheduled y desplaza la lista',none:'Aún no hay publicaciones leídas',unknown:'Hora no interpretada',limit:'Primeros {n} días; quedan {days} días y {posts} publicaciones',scroll:'Ir a esta publicación programada',hint:'Solo datos leídos; desplaza la lista de X hasta el final. Los días vacíos no son horarios disponibles.'},
  fr: {title:'Vue d’ensemble',list:'Liste',empty:'Aucune publication',count:'{n} publications',missing:'Faites défiler la liste X jusqu’à cette publication',goto:'Ouvrez Scheduled et faites défiler la liste',none:'Aucune publication lue',unknown:'Heure non analysée',limit:'{n} premiers jours ; restent {days} jours et {posts} publications',scroll:'Voir cette publication programmée',hint:'Données lues seulement ; faites défiler X jusqu’au bout. Les jours vides ne sont pas des créneaux disponibles.'},
  de: {title:'Übersicht',list:'Liste',empty:'Keine Beiträge',count:'{n} Beiträge',missing:'Scrolle in der X-Liste bis zu diesem Beitrag',goto:'Öffne Scheduled und scrolle die Liste',none:'Noch keine Beiträge gelesen',unknown:'Zeit nicht erkannt',limit:'Erste {n} Tage; noch {days} Tage und {posts} Beiträge',scroll:'Zu diesem geplanten Beitrag scrollen',hint:'Nur gelesene Daten; scrolle X selbst bis zum Ende. Leere Tage sind keine freien Zeitfenster.'},
  pt: {title:'Visão geral',list:'Lista',empty:'Sem publicações',count:'{n} publicações',missing:'Role a lista do X até esta publicação',goto:'Abra Scheduled e role a lista',none:'Nenhuma publicação lida',unknown:'Hora não interpretada',limit:'Primeiros {n} dias; restam {days} dias e {posts} publicações',scroll:'Ir a esta publicação agendada',hint:'Apenas dados lidos; role a lista do X até o fim. Dias vazios não são horários disponíveis.'},
});
function language(doclang, navlang) {
  for (const raw of [doclang, navlang]) {
    const tag = String(raw || '').toLowerCase();
    if (/^zh(?:-|$)/.test(tag)) return /hant|tw|hk|mo/.test(tag) ? 'zh-Hant' : 'zh-Hans';
    const key = tag.split('-')[0];
    if (STRINGS[key]) return key;
  }
  return 'en';
}
function stringsFor(doclang, navlang) { return STRINGS[language(doclang,navlang)]; }
const pad = n => String(n).padStart(2,'0');
function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function validTime(item) { return item?.at instanceof Date && Number.isFinite(item.at.getTime()); }
function dayNumber(date) { return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) / 86400000; }
function groupDays(items, requestedLimit = MAX_DAYS) {
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1,Math.min(MAX_DAYS,requestedLimit)) : MAX_DAYS;
  const groups = new Map(), unknown = [];
  for (const item of items) {
    if (!validTime(item)) { unknown.push(item); continue; }
    const key = dateKey(item.at);
    if (!groups.has(key)) groups.set(key,{date:new Date(item.at.getFullYear(),item.at.getMonth(),item.at.getDate()),items:[]});
    groups.get(key).items.push(item);
  }
  const sorted = [...groups.values()].sort((a,b)=>a.date-b.date);
  if (!sorted.length) return {days:[],unknown,totalDays:0,omittedDays:0,omittedPosts:0};
  // Calendar days, not elapsed 24h periods: DST must not omit or duplicate a day.
  const totalDays = dayNumber(sorted.at(-1).date)-dayNumber(sorted[0].date)+1;
  const cursor = new Date(sorted[0].date), days = [];
  for (let i=0;i<Math.min(limit,totalDays);i++) {
    const key = dateKey(cursor);
    days.push({key,date:new Date(cursor),items:[...(groups.get(key)?.items || [])].sort((a,b)=>a.at-b.at)});
    cursor.setDate(cursor.getDate()+1);
  }
  const shown = new Set(days.map(day=>day.key));
  return {days,unknown,totalDays,omittedDays:Math.max(0,totalDays-limit),
    omittedPosts:sorted.filter(day=>!shown.has(dateKey(day.date))).reduce((sum,day)=>sum+day.items.length,0)};
}
function dayTitle(date, doclang, navlang) {
  const weekday = new Intl.DateTimeFormat(language(doclang,navlang),{weekday:'short'}).format(date);
  return `${dateKey(date)} (${weekday})`;
}
function interpolate(text, values) { return text.replace(/\{(n|days|posts)\}/g,(_,key)=>String(values[key])); }
function ownRoot(container) {
  const root = container?.getRootNode();
  return root?.host?.id === 'xsched-probe-root' && root.host.isConnected ? root : null;
}
function style(node, values) {
  for (const [key,value] of Object.entries(values)) node.style.setProperty(key,String(value),'important');
  return node;
}
// The sole native action boundary. The row is the reader's same-read reference.
function scrollToRow(row) { row.scrollIntoView({block:'center',behavior:'instant'}); }
function createController({window, resolveRow}) {
  let outline = null, timer = 0, message = '';
  function clearHighlight() {
    window.clearTimeout(timer); timer=0;
    // Only our freshly created node inside our own shadow is ever removed.
    outline?.remove(); outline=null;
  }
  function render(container, items, {doclang='',navlang='en',onScheduled=true}={}) {
    const root = ownRoot(container);
    if (!root) return;
    const doc = container.ownerDocument, labels = stringsFor(doclang,navlang);
    const model = groupDays(items);
    const make = (tag,text,className) => {
      const node = doc.createElement(tag); node.textContent=text; node.className=className;
      return node;
    };
    container.append(make('p',onScheduled ? labels.hint : labels.goto,'overview-hint'));
    const status = make('p',message ? labels.missing : '','overview-status');
    status.setAttribute('role','status'); container.append(status);
    function addItem(parent,item,index) {
      const time = validTime(item) ? `${pad(item.at.getHours())}:${pad(item.at.getMinutes())}` : labels.unknown;
      const button = style(make('button',`${time} · ${item.preview || ''}`,'overview-item'),{
        display:'block',width:'100%','text-align':'left',color:'#e7e9ea',background:'#202327',border:'1px solid #536471',
        'border-radius':'6px',padding:'8px',margin:'4px 0',cursor:'pointer','word-break':'break-word'});
      button.type='button'; button.dataset.xschedOverviewItem=String(index);
      button.setAttribute('aria-label',`${labels.scroll}: ${time}`); button.title=labels.scroll;
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        if (!event.isTrusted || !ownRoot(button)) return;
        clearHighlight();
        const row = onScheduled ? resolveRow(item) : null;
        if (!row || typeof row.scrollIntoView !== 'function') {message='missing';status.textContent=labels.missing;return;}
        try {
          scrollToRow(row);
          // A synchronous scroll listener may recycle the row. Recheck identity.
          if (resolveRow(item)!==row || !ownRoot(button)) {message='missing';status.textContent=labels.missing;return;}
          const rect = row.getBoundingClientRect();
          if (!(rect.width>0 && rect.height>0)) {message='missing';status.textContent=labels.missing;return;}
          message='';status.textContent='';
          outline = style(make('div','','overview-highlight'),{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,
            width:`${rect.width}px`,height:`${rect.height}px`,'box-sizing':'border-box',border:'3px solid #ffd400',
            'border-radius':'8px','pointer-events':'none','z-index':'2147483647'});
          outline.setAttribute('aria-hidden','true'); root.append(outline);
          timer = window.setTimeout(clearHighlight,1500);
        } catch {message='missing';status.textContent=labels.missing;}
      });
      parent.append(button);
    }
    let index = 0;
    for (const day of model.days) {
      const section = make('div','','overview-day'); section.dataset.xschedDay=day.key;
      section.dataset.xschedDayCount=String(day.items.length);
      section.append(make('h3',`${dayTitle(day.date,doclang,navlang)} · ${interpolate(labels.count,{n:day.items.length})}`,'overview-date'));
      if (!day.items.length) section.append(make('p',labels.empty,'overview-empty'));
      day.items.forEach(item=>addItem(section,item,index++)); container.append(section);
    }
    if (model.omittedDays) container.append(make('p',interpolate(labels.limit,{n:model.days.length,days:model.omittedDays,posts:model.omittedPosts}),'overview-limit'));
    if (model.unknown.length) {
      const section = make('div','','overview-unknown');section.append(make('h3',labels.unknown,'overview-date'));
      model.unknown.forEach(item=>addItem(section,item,index++));container.append(section);
    }
    if (!items.length) container.append(make('p',labels.none,'overview-none'));
  }
  return {render,clearHighlight};
}
globalThis.XSCHED_OVERVIEW = {MAX_DAYS,STRINGS,stringsFor,groupDays,dayTitle,createController};
})();
