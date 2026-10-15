// Composer entry only. The sole native activation opens the schedule picker.
(() => {
'use strict';
const COMPOSER_CONFIG=Object.freeze({
  // Masked picker skeleton L517 and L601: no class/ordinal/icon-path guess.
  editor:'[data-testid="tweetTextarea_0"][role="textbox"]',
  icon:'button[data-testid="scheduleOption"][type="button"][role="button"]',
  excluded:'[data-xsched-host="1"], article, [data-testid="tweetText"]',
  maxIcons:8,maxDepth:24,attempts:20,waitMs:100,
});
const OPEN_STRINGS=Object.freeze({
  'zh-Hant':{opening:'正在開啟排程欄位…',iconMissing:'找不到原生排程圖示，未變更欄位',dialogMissing:'未偵測到新排程視窗，未變更欄位；若視窗已開請自行關閉'},
  'zh-Hans':{opening:'正在打开排程字段…',iconMissing:'找不到原生排程图标，未更改字段',dialogMissing:'未检测到新排程窗口，未更改字段；若窗口已开请自行关闭'},
  en:{opening:'Opening schedule fields…',iconMissing:'Native schedule icon not found; fields unchanged',dialogMissing:'New schedule dialog not detected; fields unchanged. Close it yourself if open'},
  ja:{opening:'予約欄を開いています…',iconMissing:'予約アイコンが見つかりません。欄は未変更です',dialogMissing:'新しい予約画面を検出できません。未変更です。開いていればご自身で閉じてください'},
  ko:{opening:'예약 입력란을 여는 중…',iconMissing:'기본 예약 아이콘을 찾지 못했습니다. 입력란은 변경되지 않았습니다',dialogMissing:'새 예약 창을 감지하지 못했습니다. 입력란은 그대로입니다. 열렸다면 직접 닫아 주세요'},
  es:{opening:'Abriendo los campos…',iconMissing:'No se encontró el icono de programación; campos sin cambios',dialogMissing:'No se detectó un diálogo nuevo; campos sin cambios. Ciérralo tú si está abierto'},
  fr:{opening:'Ouverture des champs…',iconMissing:'Icône de programmation introuvable ; champs inchangés',dialogMissing:'Nouvelle fenêtre non détectée ; champs inchangés. Fermez-la vous-même si elle est ouverte'},
  de:{opening:'Planungsfelder werden geöffnet…',iconMissing:'Planungssymbol nicht gefunden; Felder unverändert',dialogMissing:'Neues Planungsfenster nicht erkannt; Felder unverändert. Falls offen, selbst schließen'},
  pt:{opening:'Abrindo os campos…',iconMissing:'Ícone de agendamento não encontrado; campos inalterados',dialogMissing:'Nova janela não detectada; campos inalterados. Feche-a manualmente se estiver aberta'},
});
function strings(doclang,navlang) {
  const key=value=>{const tag=String(value || '').toLowerCase();return /^zh(?:-|$)/.test(tag)?(/(?:hant|tw|hk|mo)/.test(tag)?'zh-Hant':'zh-Hans'):tag.split('-')[0];};
  return OPEN_STRINGS[key(doclang)] || OPEN_STRINGS[key(navlang)] || OPEN_STRINGS.en;
}
function visible(node,doc) {
  for(let el=node;el;el=el.parentElement) {
    const style=doc.defaultView.getComputedStyle?.(el) || el.style;
    if(el.hidden || el.hasAttribute('inert') || el.getAttribute('aria-hidden')==='true' || style?.display==='none' || style?.visibility==='hidden' || style?.visibility==='collapse' || style?.opacity==='0')return false;
  }
  return true;
}
// Quick slots belong only on a new-post editor. Reply modals and quote
// composers carry the parent post in the same surface; an inline reply on a
// status permalink often does not, so the path is the other signal.
function isPlainPost(doc, editor) {
  if(!editor)return false;
  const surface=editor.closest('[role="dialog"], [role="alertdialog"]') || editor.closest('[data-testid="cellInnerDiv"]') || editor.parentElement;
  if(surface?.querySelector('article, [data-testid="tweet"], [data-testid="tweetText"], [data-testid="quoteTweet"]'))return false;
  if(!editor.closest('[role="dialog"], [role="alertdialog"]')) {
    const path=doc.defaultView.location?.pathname || '';
    if(/^\/(?:i\/status\/\d+|[^/]+\/status\/\d+)(?:\/|$)/.test(path))return false;
  }
  return true;
}
function findEntries(doc) {
  if(doc.defaultView.location?.hostname!=='x.com')return [];
  const icons=[...doc.querySelectorAll(COMPOSER_CONFIG.icon)].slice(0,COMPOSER_CONFIG.maxIcons);
  const entries=[];
  for(const icon of icons) {
    if(icon.closest(COMPOSER_CONFIG.excluded) || icon.disabled || icon.getAttribute('aria-disabled')==='true' || !visible(icon,doc) || !icon.querySelector('svg') || icon.textContent.trim())continue;
    let depth=0;
    for(let scope=icon.parentElement;scope && scope!==doc.body && scope!==doc.documentElement && depth++<COMPOSER_CONFIG.maxDepth;scope=scope.parentElement) {
      const editors=[...scope.querySelectorAll(COMPOSER_CONFIG.editor)].filter(editor=>!editor.closest(COMPOSER_CONFIG.excluded) && visible(editor,doc));
      if(editors.length>1)break;
      if(editors.length!==1)continue;
      // A hidden duplicate toolbar copy does not make the visible icon ambiguous.
      const usable=[...scope.querySelectorAll(COMPOSER_CONFIG.icon)].filter(node=>!node.closest(COMPOSER_CONFIG.excluded) && visible(node,doc));
      if(usable.length===1 && usable[0]===icon && isPlainPost(doc,editors[0]))entries.push({scope,editor:editors[0],icon});
      break;
    }
  }
  return entries;
}
// Exact-source verify exception for this single statement. Never exported and
// never accepts arbitrary page controls; it revalidates the captured composer.
function activateIcon(doc,entry,event) {
  if(!event?.isTrusted)return false;
  // X re-renders the editor and toolbar (typing, returning from the picker),
  // so a row's captured nodes go stale. Re-find the same composer by any of
  // its proven nodes and click only the icon that is current right now.
  const current=findEntries(doc).find(row=>row.scope===entry.scope || row.editor===entry.editor || row.icon===entry.icon);
  if(!current || !current.icon)return false;
  const icon=current.icon;
  icon.click();
  return true;
}
// The draft text at the user's own trusted Schedule click, kept in memory only
// for the overview row (first 20 characters). Never stored or exported.
function editorFor(doc,button) {
  const usable=root=>[...root.querySelectorAll(COMPOSER_CONFIG.editor)].filter(editor=>!editor.closest(COMPOSER_CONFIG.excluded) && visible(editor,doc) && isPlainPost(doc,editor));
  const surface=button.closest('[role="dialog"], [role="alertdialog"]');
  const near=surface ? usable(surface) : [];
  if(near.length===1)return near[0];
  const all=usable(doc);
  return all.length===1 ? all[0] : null;
}
function previewOf(editor) {
  return Array.from(String(editor?.textContent || '').replace(/\s+/g,' ').trim()).slice(0,20).join('');
}
function create(doc,options) {
  const rows=new Map();let active=false,epoch=0,status='',notice=null,draft=null,listening=false;
  function capture(event) {
    if(!event?.isTrusted)return;
    const button=event.target?.closest?.(options.quick.COMPLETION_CONFIG.button);
    if(!button || button.closest(COMPOSER_CONFIG.excluded))return;
    const label=String(button.getAttribute('aria-label') || button.textContent || '').trim();
    if(label.length>40 || !options.quick.COMPLETION_CONFIG.schedule.includes(label))return;
    const editor=editorFor(doc,button);
    if(editor)draft={text:previewOf(editor),at:Date.now()};
  }
  function listen(){if(listening)return;listening=true;doc.addEventListener('click',capture,true);}
  function unlisten(){if(!listening)return;listening=false;doc.removeEventListener('click',capture,true);}
  function style(node,values){for(const name of Object.keys(values))node.style.setProperty(name,String(values[name]),'important');return node;}
  function text(result) {return strings(doc.documentElement.lang,doc.defaultView.navigator?.language)[result] || options.labels()[result] || options.labels().missing;}
  function report(result) {
    status=result;
    if(!notice?.isConnected) {
      notice=doc.createElement('div');notice.setAttribute('data-xsched-host','1');notice.className='xsched-composer-notice';
      style(notice,{position:'fixed',top:'16px',right:'16px',width:'calc(100vw - 32px)','max-width':'344px','z-index':'2147483647','pointer-events':'none'});
      const message=doc.createElement('div');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
      style(message,{background:'#15202b',color:'#ffd400',padding:'10px','border-radius':'8px',font:'13px system-ui','overflow-wrap':'anywhere'});
      notice.attachShadow({mode:'open'}).append(message);(doc.body || doc.documentElement).append(notice);
    }
    notice.shadowRoot.firstElementChild.textContent=text(result);
    options.changed?.(result);refresh();
  }
  async function run(entry,event,id) {
    if(!entry)return;
    if(!event?.isTrusted || active || options.quick.isFilling(doc))return;
    if(![...options.quick.VISIBLE_SLOT_IDS,'random'].includes(id))return;
    const settings=options.settings();
    if(id==='random' && ((!settings.cache && !settings.empty) || !options.quick.validRange(settings.range))){report('noCache');return;}
    if(options.quick.detectControls(doc).counts.selects>0){report('dialogMissing');return;}
    // In the modal composer X reuses the compose dialog and swaps its content
    // to the picker. Only a dialog that already held fields counts as old.
    const existing=new Set([...doc.querySelectorAll(options.quick.QUICK_CONFIG.dialog)].filter(dialog=>dialog.querySelector('select')));
    const generation=epoch;active=true;
    try {
      if(!activateIcon(doc,entry,event)){report('iconMissing');return;}
      report('opening');
      for(let attempt=0;attempt<COMPOSER_CONFIG.attempts;attempt++) {
        if(generation!==epoch)return;
        // The modal composer unmounts its editor while the picker is open, so a
        // removed composer is not a failure; only a missing picker is.
        const picker=options.quick.detectControls(doc);
        if(picker.ready && !existing.has(picker.dialog)) {
          const result=await options.quick.fillSlotResult(doc,id,new Date(),options.settings());
          if(generation===epoch)report(result);
          return;
        }
        await new Promise(resolve=>doc.defaultView.setTimeout(resolve,COMPOSER_CONFIG.waitMs));
      }
      if(generation===epoch)report('dialogMissing');
    } catch {if(generation===epoch)report('failed');}
    finally {active=false;if(generation===epoch)refresh();}
  }
  function refresh() {
    if(doc.defaultView.location?.hostname!=='x.com'){dispose();return;}
    listen();
    const entries=findEntries(doc);
    // A missing icon still gets an inert explanatory row near a proven editor.
    if(!entries.length)for(const editor of [...doc.querySelectorAll(COMPOSER_CONFIG.editor)].slice(0,COMPOSER_CONFIG.maxIcons)) {
      if(editor.parentElement && !editor.closest(COMPOSER_CONFIG.excluded) && visible(editor,doc) && isPlainPost(doc,editor))entries.push({scope:editor.parentElement,editor,icon:null});
    }
    const scopes=new Set(entries.map(entry=>entry.scope));
    for(const [scope,row] of rows)if(!scopes.has(scope) && !active){row.host.remove();rows.delete(scope);}
    for(const entry of entries) {
      let row=rows.get(entry.scope);
      if(!row?.host.isConnected) {
        const host=doc.createElement('div');host.className='xsched-composer-root';host.setAttribute('data-xsched-host','1');
        style(host,{display:'block',width:'100%','max-width':'100%','min-width':'0','box-sizing':'border-box',margin:'6px 0',flex:'0 0 auto'});
        host.attachShadow({mode:'open'});entry.scope.append(host);row={host,signature:'',entry};rows.set(entry.scope,row);
      }
      row.entry=entry; // buttons resolve the latest proven nodes at click time
      const labels=options.labels(),now=new Date(),settings=options.settings();
      const slots=options.quick.VISIBLE_SLOT_IDS.map(id=>({id,label:options.slotLabel(id,options.quick.nextSlot(id,now),now)}));
      slots.push({id:'random',label:`${labels.random} ${settings.range.a}–${settings.range.b}`});
      const signature=JSON.stringify([slots,status,active,Boolean(settings.cache),Boolean(settings.empty),Boolean(entry.icon),options.quick.isFilling(doc),labels.heading]);
      if(row.signature===signature && row.host.shadowRoot.childNodes.length)continue;
      row.signature=signature;const root=row.host.shadowRoot;root.replaceChildren();
      const bar=style(doc.createElement('div'),{display:'flex','flex-wrap':'wrap',gap:'4px','max-width':'100%'});
      for(const slot of slots) {
        if(!slot.label)continue;
        const button=doc.createElement('button');button.type='button';button.dataset.xschedComposerSlot=slot.id;
        button.textContent=slot.label;button.title=slot.label;button.setAttribute('aria-label',slot.label);
        button.disabled=!entry.icon || active || options.quick.isFilling(doc) || (slot.id==='random' && !settings.cache && !settings.empty);
        style(button,{'max-width':'100%','min-width':'0','box-sizing':'border-box','white-space':'normal','overflow-wrap':'anywhere',font:'11px system-ui',padding:'4px 6px',background:'#15202b',color:'#1d9bf0',border:'1px solid #536471','border-radius':'12px',cursor:'pointer'});
        const owner=row;
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void run(owner.entry,event,slot.id);});bar.append(button);
      }
      root.append(bar);
      const message=doc.createElement('div');message.setAttribute('role','status');message.textContent=!entry.icon ? text('iconMissing') : status ? text(status) : labels.heading;
      style(message,{font:'11px system-ui',color:'#8b98a5','overflow-wrap':'anywhere'});root.append(message);
    }
  }
  function dispose(){epoch++;for(const row of rows.values())row.host.remove();rows.clear();notice?.remove();notice=null;status='';draft=null;unlisten();}
  // One draft per observed completion; stale captures (>10 min) are dropped.
  function takeDraft(now=Date.now()){const value=draft;draft=null;return value && now-value.at>=0 && now-value.at<=10*60*1000 ? value.text : '';}
  return {refresh,dispose,takeDraft,completed(){report('scheduled');}};
}
globalThis.XSCHED_COMPOSER={COMPOSER_CONFIG,OPEN_STRINGS,strings,findEntries,previewOf,create};
})();
