// Read-only schedule overview. Rows come from the last Scheduled list snapshot.
// Native X controls are never queried, clicked, focused, or modified here.
(() => {
"use strict";
const TTL = 86400000;
const MAX_ITEMS = 80;
const MAX_PREVIEW = 100;
const STRINGS = Object.freeze({
  "zh-Hant": {
    title: "排程總覽", total: "共 {n} 則", next: "最近一則還有 {wait}", sync: "最後同步：{when}",
    syncNow: "最後同步：本頁列表", missing: "尚未同步列表。這不是「沒有排程」。", empty: "目前沒有已排程的推文（已確認空列表）。",
    expired: "快取已過期，請前往 Scheduled 同步。過期資料不能當成「沒有排程」。", pending: "正在讀取 Scheduled 列表，還不能當成沒有排程。",
    goto: "前往 Scheduled 同步", openRow: "前往 Scheduled 查看此則", none: "（沒有文字）", hint: "資料來自上次讀到的 Scheduled 列表；請自己捲到底。不做編輯或送出。",
    noNext: "沒有可倒數的時段", past: "最近一則的時間已過，請同步", underMinute: "不到 1 分鐘",
    inMinutes: "{n} 分鐘", inHours: "{n} 小時", inHoursMinutes: "{h} 小時 {m} 分", inDays: "{n} 天", inDaysHours: "{d} 天 {h} 小時"
  },
  "zh-Hans": {
    title: "排程总览", total: "共 {n} 则", next: "最近一条还有 {wait}", sync: "最后同步：{when}",
    syncNow: "最后同步：本页列表", missing: "尚未同步列表。这不是“没有排程”。", empty: "目前没有已排程的推文（已确认空列表）。",
    expired: "缓存已过期，请前往 Scheduled 同步。过期数据不能当成“没有排程”。", pending: "正在读取 Scheduled 列表，还不能当成没有排程。",
    goto: "前往 Scheduled 同步", openRow: "前往 Scheduled 查看此条", none: "（没有文字）", hint: "数据来自上次读到的 Scheduled 列表；请自己滚到底。不做编辑或发送。",
    noNext: "没有可倒数的时段", past: "最近一条的时间已过，请同步", underMinute: "不到 1 分钟",
    inMinutes: "{n} 分钟", inHours: "{n} 小时", inHoursMinutes: "{h} 小时 {m} 分", inDays: "{n} 天", inDaysHours: "{d} 天 {h} 小时"
  },
  en: {
    title: "Scheduled overview", total: "{n} posts", next: "Next post in {wait}", sync: "Last synced: {when}",
    syncNow: "Last synced: this page’s list", missing: "List not synced yet. This is not “nothing scheduled”.", empty: "No scheduled posts (empty list confirmed).",
    expired: "Cache expired. Sync from Scheduled. Stale data is not “nothing scheduled”.", pending: "Reading the Scheduled list; do not treat this as empty.",
    goto: "Go to Scheduled to sync", openRow: "Open Scheduled for this post", none: "(no text)", hint: "From the last Scheduled list you scrolled. No edit or send.",
    noNext: "No upcoming time", past: "The nearest time has passed; please sync", underMinute: "under 1 minute",
    inMinutes: "{n} min", inHours: "{n} h", inHoursMinutes: "{h} h {m} min", inDays: "{n} d", inDaysHours: "{d} d {h} h"
  },
  ja: {
    title: "予約一覧", total: "{n} 件", next: "次まで {wait}", sync: "最終同期：{when}",
    syncNow: "最終同期：このページの一覧", missing: "まだ同期していません。「予約なし」ではありません。", empty: "予約投稿はありません（空の一覧を確認済み）。",
    expired: "キャッシュ期限切れ。Scheduled で同期してください。期限切れは「予約なし」ではありません。", pending: "Scheduled 一覧を読み取り中。空とみなせません。",
    goto: "Scheduled で同期", openRow: "Scheduled でこの投稿を開く", none: "（本文なし）", hint: "前回読んだ Scheduled 一覧です。最後まで自分でスクロール。編集・送信しません。",
    noNext: "次の時刻なし", past: "直近の時刻は過ぎています。同期してください", underMinute: "1分未満",
    inMinutes: "{n}分", inHours: "{n}時間", inHoursMinutes: "{h}時間{m}分", inDays: "{n}日", inDaysHours: "{d}日{h}時間"
  },
  ko: {
    title: "예약 개요", total: "{n}개", next: "다음까지 {wait}", sync: "마지막 동기화: {when}",
    syncNow: "마지막 동기화: 이 페이지 목록", missing: "아직 동기화하지 않았습니다. “예약 없음”이 아닙니다.", empty: "예약된 게시물이 없습니다(빈 목록 확인됨).",
    expired: "캐시가 만료되었습니다. Scheduled에서 동기화하세요. 만료는 “예약 없음”이 아닙니다.", pending: "Scheduled 목록을 읽는 중입니다. 비어 있다고 보지 마세요.",
    goto: "Scheduled에서 동기화", openRow: "Scheduled에서 이 게시물 열기", none: "(텍스트 없음)", hint: "마지막으로 읽은 Scheduled 목록입니다. 끝까지 직접 스크롤. 편집/전송 없음.",
    noNext: "다음 시간 없음", past: "가장 가까운 시간이 지났습니다. 동기화하세요", underMinute: "1분 미만",
    inMinutes: "{n}분", inHours: "{n}시간", inHoursMinutes: "{h}시간 {m}분", inDays: "{n}일", inDaysHours: "{d}일 {h}시간"
  },
  es: {
    title: "Resumen programado", total: "{n} publicaciones", next: "La próxima en {wait}", sync: "Última sincronización: {when}",
    syncNow: "Última sincronización: lista de esta página", missing: "Aún no hay sincronización. Esto no es “nada programado”.", empty: "No hay publicaciones programadas (lista vacía confirmada).",
    expired: "Caché caducada. Sincroniza en Scheduled. Los datos viejos no son “nada programado”.", pending: "Leyendo la lista Scheduled; no la trates como vacía.",
    goto: "Ir a Scheduled para sincronizar", openRow: "Abrir Scheduled para esta publicación", none: "(sin texto)", hint: "De la última lista Scheduled que leíste. Sin editar ni enviar.",
    noNext: "Sin hora próxima", past: "La hora más cercana ya pasó; sincroniza", underMinute: "menos de 1 min",
    inMinutes: "{n} min", inHours: "{n} h", inHoursMinutes: "{h} h {m} min", inDays: "{n} d", inDaysHours: "{d} d {h} h"
  },
  fr: {
    title: "Aperçu programmé", total: "{n} publications", next: "Prochaine dans {wait}", sync: "Dernière synchro : {when}",
    syncNow: "Dernière synchro : liste de cette page", missing: "Pas encore synchronisé. Ce n’est pas « rien de programmé ».", empty: "Aucune publication programmée (liste vide confirmée).",
    expired: "Cache expiré. Synchronisez dans Scheduled. Les données périmées ne sont pas « rien de programmé ».", pending: "Lecture de la liste Scheduled ; ne pas la traiter comme vide.",
    goto: "Ouvrir Scheduled pour synchroniser", openRow: "Ouvrir Scheduled pour cette publication", none: "(pas de texte)", hint: "Dernière liste Scheduled lue. Faites défiler jusqu’au bout. Pas d’édition ni d’envoi.",
    noNext: "Pas d’horaire à venir", past: "L’horaire le plus proche est passé ; synchronisez", underMinute: "moins d’1 min",
    inMinutes: "{n} min", inHours: "{n} h", inHoursMinutes: "{h} h {m} min", inDays: "{n} j", inDaysHours: "{d} j {h} h"
  },
  de: {
    title: "Geplante Übersicht", total: "{n} Beiträge", next: "Nächster in {wait}", sync: "Zuletzt synchronisiert: {when}",
    syncNow: "Zuletzt synchronisiert: Liste dieser Seite", missing: "Noch nicht synchronisiert. Das ist nicht „nichts geplant“.", empty: "Keine geplanten Beiträge (leere Liste bestätigt).",
    expired: "Cache abgelaufen. In Scheduled synchronisieren. Veraltete Daten sind nicht „nichts geplant“.", pending: "Scheduled-Liste wird gelesen; nicht als leer behandeln.",
    goto: "Zu Scheduled synchronisieren", openRow: "Scheduled für diesen Beitrag öffnen", none: "(kein Text)", hint: "Aus der zuletzt gelesenen Scheduled-Liste. Selbst zu Ende scrollen. Kein Bearbeiten/Senden.",
    noNext: "Keine nächste Zeit", past: "Die nächste Zeit ist vorbei; bitte synchronisieren", underMinute: "unter 1 Min.",
    inMinutes: "{n} Min.", inHours: "{n} Std.", inHoursMinutes: "{h} Std. {m} Min.", inDays: "{n} T.", inDaysHours: "{d} T. {h} Std."
  },
  pt: {
    title: "Visão agendada", total: "{n} publicações", next: "Próxima em {wait}", sync: "Última sincronização: {when}",
    syncNow: "Última sincronização: lista desta página", missing: "Ainda não sincronizado. Isto não é “nada agendado”.", empty: "Não há publicações agendadas (lista vazia confirmada).",
    expired: "Cache expirada. Sincronize em Scheduled. Dados velhos não são “nada agendado”.", pending: "A ler a lista Scheduled; não trate como vazia.",
    goto: "Abrir Scheduled para sincronizar", openRow: "Abrir Scheduled para esta publicação", none: "(sem texto)", hint: "Da última lista Scheduled lida. Role até o fim. Sem editar ou enviar.",
    noNext: "Sem horário próximo", past: "O horário mais próximo já passou; sincronize", underMinute: "menos de 1 min",
    inMinutes: "{n} min", inHours: "{n} h", inHoursMinutes: "{h} h {m} min", inDays: "{n} d", inDaysHours: "{d} d {h} h"
  }
});
function language(doclang, navlang) {
  for (const raw of [doclang, navlang]) {
    const tag = String(raw || "").toLowerCase();
    if (/^zh(?:-|$)/.test(tag)) return /(?:-hant|-tw|-hk|-mo)(?:-|$)/.test(tag) ? "zh-Hant" : "zh-Hans";
    const key = tag.split("-")[0];
    if (Object.hasOwn(STRINGS, key)) return key;
  }
  return "en";
}
function stringsFor(doclang, navlang) { return STRINGS[language(doclang, navlang)]; }
function fill(text, values) {
  const n = values && Number.isSafeInteger(values.n) ? String(values.n) : "";
  const h = values && Number.isSafeInteger(values.h) ? String(values.h) : "";
  const m = values && Number.isSafeInteger(values.m) ? String(values.m) : "";
  const d = values && Number.isSafeInteger(values.d) ? String(values.d) : "";
  const wait = values && typeof values.wait === "string" ? values.wait : "";
  const when = values && typeof values.when === "string" ? values.when : "";
  return String(text).replace("{n}", n).replace("{h}", h).replace("{m}", m).replace("{d}", d).replace("{wait}", wait).replace("{when}", when);
}
function previewFrom(item) {
  let text = "";
  if (item && typeof item.key === "string") {
    const split = item.key.indexOf("\u0000");
    if (split >= 0) text = item.key.slice(split + 1);
  }
  if (!text && item && typeof item.p === "string") text = item.p;
  if (!text && item && typeof item.preview === "string") text = item.preview;
  return Array.from(text).slice(0, MAX_PREVIEW).join("");
}
function timeOf(item) {
  if (item && item.at && typeof item.at.getTime === "function") {
    const t = item.at.getTime();
    if (Number.isSafeInteger(t) && t > 0) return t;
  }
  if (item && Number.isSafeInteger(item.t) && item.t > 0) return item.t;
  return 0;
}
function fromItems(items, now) {
  const synced = Number.isSafeInteger(now) && now > 0 ? now : Date.now();
  const rows = [];
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const t = timeOf(item);
    if (!t) continue;
    rows.push({ t, p: previewFrom(item) });
  }
  rows.sort((a, b) => a.t - b.t);
  if (rows.length > MAX_ITEMS) rows.length = MAX_ITEMS;
  if (!rows.length) return { s: synced, n: 0 };
  return { s: synced, n: rows.length, i: rows };
}
function inspect(snapshot, now, pending) {
  const clock = Number.isSafeInteger(now) ? now : Date.now();
  if (pending && !snapshot) return { status: "pending", items: [], total: 0, next: null, until: null, sync: null, expired: false, pastOnly: false };
  if (!snapshot) return { status: "missing", items: [], total: 0, next: null, until: null, sync: null, expired: false, pastOnly: false };
  const expired = !Number.isSafeInteger(snapshot.s) || clock - snapshot.s > TTL;
  const items = snapshot.n > 0 && Array.isArray(snapshot.i) ? snapshot.i.slice() : [];
  items.sort((a, b) => a.t - b.t);
  if (snapshot.n === 0) {
    return { status: expired ? "expired" : "empty", items: [], total: 0, next: null, until: null, sync: snapshot.s, expired, pastOnly: false };
  }
  let next = null;
  for (const item of items) {
    if (item.t >= clock) { next = item; break; }
  }
  const pastOnly = !next && items.length > 0;
  if (pastOnly) next = items[0];
  return {
    status: expired ? "expired" : "ready",
    items, total: items.length, next,
    until: next ? next.t - clock : null,
    sync: snapshot.s, expired, pastOnly
  };
}
function formatUntil(ms, labels) {
  if (!Number.isFinite(ms)) return labels.noNext;
  if (ms < 0) return labels.past;
  const minute = 60000, hour = 3600000, day = 86400000;
  if (ms < minute) return labels.underMinute;
  if (ms < hour) return fill(labels.inMinutes, { n: Math.floor(ms / minute) });
  if (ms < day) {
    const hours = Math.floor(ms / hour);
    const minutes = Math.floor((ms % hour) / minute);
    return minutes ? fill(labels.inHoursMinutes, { h: hours, m: minutes }) : fill(labels.inHours, { n: hours });
  }
  const days = Math.floor(ms / day);
  const hours = Math.floor((ms % day) / hour);
  return hours ? fill(labels.inDaysHours, { d: days, h: hours }) : fill(labels.inDays, { n: days });
}
function formatWhen(t) {
  const reader = globalThis.XSCHED_READER;
  if (!reader || !Number.isSafeInteger(t)) return "";
  return reader.formatTime(new Date(t));
}
function css(node, values) {
  for (const key of Object.keys(values)) node.style.setProperty(key, String(values[key]), "important");
  return node;
}
function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render(container, snapshot, options) {
  if (!container || container.nodeType !== 1) return;
  const doc = container.ownerDocument;
  if (!doc) return;
  const opts = options && typeof options === "object" ? options : {};
  const now = Number.isSafeInteger(opts.now) ? opts.now : Date.now();
  const labels = stringsFor(opts.doclang, opts.navlang);
  const view = inspect(snapshot, now, opts.pending === true);
  while (container.firstChild) container.removeChild(container.firstChild);
  container.className = "overview-root";
  container.dataset.xschedOverviewStatus = view.status;
  container.dataset.xschedOverviewCount = String(view.total);
  const heading = make(doc, "strong", labels.title, "overview-title");
  container.append(heading);
  container.append(make(doc, "p", labels.hint, "overview-hint"));
  if (opts.pending === true && snapshot) container.append(make(doc, "p", labels.pending, "overview-pending"));
  let statusText = labels.missing;
  if (view.status === "empty") statusText = labels.empty;
  else if (view.status === "expired") statusText = labels.expired;
  else if (view.status === "pending") statusText = labels.pending;
  else if (view.status === "ready") statusText = fill(labels.total, { n: view.total });
  const status = make(doc, "p", statusText, "overview-status");
  status.setAttribute("role", "status");
  container.append(status);
  if (view.status === "ready" || view.status === "expired") {
    const wait = view.pastOnly ? labels.past : formatUntil(view.until, labels);
    container.append(make(doc, "p", fill(labels.next, { wait }), "overview-next"));
  }
  const syncText = opts.onScheduled ? labels.syncNow : (view.sync ? fill(labels.sync, { when: formatWhen(view.sync) }) : labels.missing);
  container.append(make(doc, "p", syncText, "overview-sync"));
  if (typeof opts.onGo === "function" && !opts.onScheduled) {
    const go = css(make(doc, "button", labels.goto, "overview-sync-go"), {
      display: "inline-block", margin: "0 0 8px", padding: "5px 8px", color: "#0f1419",
      background: "#eff3f4", border: "0", "border-radius": "999px", cursor: "pointer", font: "inherit", "font-weight": "760"
    });
    go.type = "button";
    go.title = labels.goto;
    go.setAttribute("aria-label", labels.goto);
    go.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.isTrusted) return;
      opts.onGo();
    });
    container.append(go);
  }
  if (opts.showRows === true && view.items.length) {
    const list = make(doc, "div", "", "overview-list");
    let index = 0;
    for (const item of view.items) {
      const when = formatWhen(item.t);
      const preview = item.p || labels.none;
      const row = css(make(doc, "button", "", "overview-row"), {
        display: "block", width: "100%", "text-align": "left", color: "#e7e9ea", background: "#202327",
        border: "1px solid #536471", "border-radius": "6px", padding: "8px", margin: "4px 0",
        cursor: "pointer", "word-break": "break-word"
      });
      row.type = "button";
      row.dataset.xschedOverviewItem = String(index);
      index += 1;
      row.setAttribute("aria-label", labels.openRow + ": " + when);
      row.title = labels.openRow;
      const timeNode = make(doc, "div", when, "overview-when");
      css(timeNode, { color: "#1d9bf0", "font-weight": "680" });
      const previewNode = make(doc, "div", preview, "overview-preview");
      row.append(timeNode, previewNode);
      row.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.isTrusted) return;
        if (typeof opts.onGo === "function") opts.onGo();
      });
      list.append(row);
    }
    container.append(list);
  }
}
globalThis.XSCHED_OVERVIEW = Object.freeze({
  TTL, MAX_ITEMS, MAX_PREVIEW, STRINGS, stringsFor, previewFrom, fromItems, inspect, formatUntil, render
});
})();
