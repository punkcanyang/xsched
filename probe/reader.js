// xsched gate 0 — pure read-only reader for X's "Unsent posts → Scheduled" list.
//
// No network, no storage, no page-patching. This file only inspects DOM that is
// already rendered and returns counts + parsed schedule times.
//
// It is a *classic* script (no `export`), shared two ways:
//   - Chrome: manifest loads it as a content script right before content.js, in the
//     same isolated world, so both share the isolated global object.
//   - Node:   test/reader.test.mjs does `await import("../probe/reader.js")` and reads
//     `globalThis.XSCHED_READER`. (We cannot use ES-module `import` between content
//     scripts: Chrome refuses to resolve extension specifiers without
//     web_accessible_resources, which the hard rules forbid. Verified empirically.)
//
// Legacy assumptions come from public clues. Gate 0.2 adds structural evidence from
// the owner's masked skeleton (notes/GATE0.md). Gate 0.3 confirms the Chinese weekday format; all example dates remain fake. See notes/GATE0.md for the source
// table. When the real page drifts, the diagnostic counters (l1/l2/l3, cell, button,
// phrase, timeFail) are meant to say *which* assumption broke.
//
// Everything lives inside an IIFE: Chrome runs reader.js and content.js as two classic
// scripts in the SAME isolated world, so a top-level `const` here would collide with the
// same-named one in content.js ("Identifier 'PROBE_VERSION' has already been declared").
// Only `globalThis.XSCHED_READER` is exported.
(() => {
"use strict";

const PROBE_VERSION = "0.0.4";

// Tab labels that mean "Scheduled". en / ja are from public sources; zh-Hant, zh-Hans
// and ko are *guesses* (no public source found) and are marked as such in GATE0.md.
const SCHEDULED_LABELS = [
  "scheduled", // en — public source
  "scheduled posts",
  "予約済み", // ja — public source
  "予約投稿",
  "已排程", // zh-Hant — guessed
  "已排定",
  "已定时", // zh-Hans — guessed
  "已排程",
  "예약됨", // ko — guessed
  "예약",
];

const LABEL_SET = new Set(SCHEDULED_LABELS.map((label) => label.toLowerCase()));

const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
// Optional weekday prefix, e.g. "Fri, " or "Friday ". Non-capturing on purpose so the
// component group numbers stay stable across every pattern below.
const WEEKDAY_PREFIX = "(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s*)?";

// --- time phrase patterns ---------------------------------------------------------
// Each pattern exposes group 1 = the human-readable time phrase we show verbatim,
// and the following groups are the numeric parts used to build a local Date.
// tier "strict" = the sentence carries a send verb ("Will send on …", "…に送信されます").
// tier "loose"  = a bare date+time with no verb; only used as a fallback.

const STRICT = [
  {
    lang: "en",
    re: new RegExp(
      `will send on\\s+(${WEEKDAY_PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[2])], day: m[3], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "en",
    re: new RegExp(
      `will send on\\s+(${WEEKDAY_PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[3])], day: m[2], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "ja",
    re: /((\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*\([^)]{1,12}\))?(?:\s*の)?\s*(午前|午後)?\s*(\d{1,2}):(\d{2})\s*に送信されます)/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "zh-Hant",
    re: /((?:將於|於)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]{1,8}[)）])?(?:\s*(?:週|周|星期)\s*[一二三四五六日天])?\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2})\s*:\s*(\d{2})\s*(?:傳送|發送|发送|传送))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "zh-Hans",
    re: /((?:将于|于)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]{1,8}[)）])?(?:\s*(?:週|周|星期)\s*[一二三四五六日天])?\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2})\s*:\s*(\d{2})\s*(?:发送|傳送|传送|发出))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "ko",
    re: /((\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2}):(\d{2})\s*(?:에\s*)?(?:전송됩니다|게시됩니다|예약됩니다|예약됨))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
];

const LOOSE = [
  {
    lang: "en",
    re: new RegExp(
      `^(${WEEKDAY_PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[2])], day: m[3], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "en",
    re: new RegExp(
      `^(${WEEKDAY_PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[3])], day: m[2], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "ja",
    re: /^((\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*\([^)]{1,12}\))?(?:\s*の)?\s*(午前|午後)?\s*(\d{1,2}):(\d{2}))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "zh",
    re: /^((\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(?:週|周|星期)\s*[一二三四五六日天])?\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2})\s*:\s*(\d{2}))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "ko",
    re: /^((\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2}):(\d{2}))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
];

// A send verb that marks a "real" schedule phrase (used for the phrase counter).
const SEND_VERB_RE = /will send on|に送信されます|將於|将于|전송됩니다|게시됩니다|예약됩니다/i;
// Any 4-digit year in an element that we could not parse → format drift signal.
const YEAR_RE = /\b20\d{2}\b|\d{4}\s*年|\d{4}\s*년/;

// Gate 0.3: unparenthesized 週／周／星期 after 日 is owner-confirmed Chinese grammar.
// Calendar vocabulary is an exact token allowlist, never arbitrary prose. Locale
// Chinese weekday wording is confirmed; other locale examples remain synthetic. Shared by skeleton.
const CALENDAR_WORDS = new Set((
  "will send on at am pm a.m. p.m. " +
  "jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october nov november dec december " +
  "mon monday tue tues tuesday wed wednesday thu thur thurs thursday fri friday sat saturday sun sunday " +
  "janvier février mars avril mai juin juillet août septembre octobre novembre décembre lundi mardi mercredi jeudi vendredi samedi dimanche " +
  "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre lunes martes miércoles jueves viernes sábado domingo " +
  "januar februar märz april mai juni juli august september oktober november dezember montag dienstag mittwoch donnerstag freitag samstag sonntag " +
  "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro segunda terça quarta quinta sexta sábado domingo"
).split(" "));
const CJK_CALENDAR = ["に送信されます", "전송됩니다", "게시됩니다", "예약됩니다", "예약됨", "將於", "将于", "傳送", "發送", "发送", "传送", "发出", "午前", "午後", "上午", "下午", "晚上", "中午", "凌晨", "清晨", "오전", "오후", "년", "월", "일", "시", "분", "年", "月", "日", "時", "时", "點", "点", "分", "の", "於", "于", "에", "星期", "週", "周", "一", "二", "三", "四", "五", "六", "七", "天", "火", "水", "木", "金", "土", "요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"].sort((a, b) => b.length - a.length);
const CJK_CALENDAR_RE = new RegExp("^(?:" + CJK_CALENDAR.join("|") + ")+$", "u");
const LABEL_PATTERNS = [
  { lang: "en", re: new RegExp(`^(?:will send on\\s+)?(${WEEKDAY_PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`, "i"), parts: m => ({year:m[4], month:MONTH_INDEX[monthKey(m[2])], day:m[3], hour:m[5], minute:m[6], meridiem:m[7], meridiemStyle:"en"}) },
  { lang: "en", re: new RegExp(`^(?:will send on\\s+)?(${WEEKDAY_PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+(\\d{4}))?\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`, "i"), parts: m => ({year:m[4], month:MONTH_INDEX[monthKey(m[3])], day:m[2], hour:m[5], minute:m[6], meridiem:m[7], meridiemStyle:"en"}) },
  { lang: "zh", re: /^((?:將於|将于|於|于)?\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]{1,12}[)）])?(?:\s*(?:週|周|星期)\s*[一二三四五六日天])?\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2})\s*(?::\s*(\d{2})|(?:點|点|時|时)\s*(\d{1,2})?\s*分?)\s*(?:傳送|發送|发送|传送|发出)?)/, parts: m => ({year:m[2],month:m[3],day:m[4],hour:m[6],minute:m[7] || m[8] || "0",meridiem:m[5],meridiemStyle:"cjk"}) },
  { lang: "ja", re: /^((?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日(?:\s*[(（][^)）]{1,12}[)）])?(?:\s*の)?\s*(午前|午後)?\s*(\d{1,2})(?::|時)(\d{1,2})\s*分?\s*(?:に送信されます)?)/, parts: m => ({year:m[2],month:m[3],day:m[4],hour:m[6],minute:m[7],meridiem:m[5],meridiemStyle:"cjk"}) },
  { lang: "ko", re: /^((?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2})(?::|시\s*)(\d{1,2})\s*분?\s*(?:에\s*)?(?:전송됩니다|게시됩니다|예약됩니다|예약됨)?)/, parts: m => ({year:m[2],month:m[3],day:m[4],hour:m[6],minute:m[7],meridiem:m[5],meridiemStyle:"cjk"}) },
];
// Gate 0.2: legacy values plus owner skeleton evidence (line numbers in GATE0.md).
// Sources: notes/GATE0.md gate 0 §1–2 and gate 0.2 skeleton analysis. Traditional Chinese weekday format confirmed by owner; fixture dates remain fake.
const READ_CONFIG = Object.freeze({
  selectors: Object.freeze({
    // cell: public generic X cell (§1 #5); namedRow/roles: Japanese a11y clue (#3).
    // tweet, scope, exclusion, wildcard and layout selectors: existing heuristics (§2).
    // Boss skeleton L36/L42: nested dialogs; L93: selected tab with masked text.
    modal: '[role="dialog"][aria-modal="true"]',
    selectedTab: '[role="tab"][aria-selected="true"], [role="tab"][aria-current="page"]',
    // L108 button, L117 span, L122 tweetText; L126+ background article/time.
    structuralRow: 'button[role="button"]',
    timeLeaf: 'span',
    timeline: 'article, [role="article"]',
    namedRow: "[role=\"button\"][aria-label], [role=\"listitem\"][aria-label]",
    tweet: "[data-testid=\"tweetText\"]",
    rowEvidence: "[data-testid=\"cellInnerDiv\"], [role=\"listitem\"]",
    tab: "[role=\"tab\"]",
    dialog: "[role=\"dialog\"]",
    column: "[data-testid=\"primaryColumn\"]",
    region: "[role=\"region\"]",
    styled: "[style]",
    all: "*",
    cell: "[data-testid=\"cellInnerDiv\"]",
    button: "[role=\"button\"]",
    listitem: "[role=\"listitem\"]",
    link: "[role=\"link\"]",
    composer: 'form, [contenteditable="true"], [data-testid="tweetTextarea_0"], [data-testid="scheduledDateField"], [data-testid="scheduledTimeField"], [data-testid="scheduleConfirm"], [data-testid="scheduleOption"], [data-testid="scheduleChip"]',
  }),
  paths: Object.freeze({
    picker: /^\/compose\/(?:post|tweet)\/schedule(?:\/|$)/,
    scheduled: /^\/compose\/(?:post|tweet)\/unsent\/scheduled(?:\/|$)/,
    drafts: /^\/compose\/(?:post|tweet)\/unsent\/drafts?(?:\/|$)/,
    unsent: /^\/compose\/(?:post|tweet)\/unsent(?:\/|$)/,
  }),
  // en/ja public clues; zh-Hant/zh-Hans/ko guessed, unchanged from gate 0.
  labels: SCHEDULED_LABELS,
  // Chinese weekday wording is owner-confirmed; legacy tolerances and Korean examples remain synthetic.
  time: Object.freeze({ strict: STRICT, loose: LOOSE, sendVerb: SEND_VERB_RE, year: YEAR_RE, months: MONTH_INDEX, monthPattern: MONTH, weekdayPrefix: WEEKDAY_PREFIX, labelPatterns: LABEL_PATTERNS }),
});


function parseTimeLabel(raw, { now = new Date(), reference = null, lang = "" } = {}) {
  const text = normalize(raw);
  if (!text) return null;
  // Chinese and Japanese overlap on 24-hour labels. Locale is a preference, not
  // a restriction: a recognizable phrase from another locale still parses.
  const preferred = lang.split('-')[0];
  const patterns = [...READ_CONFIG.time.labelPatterns].sort((a,b) => Number(b.lang === preferred) - Number(a.lang === preferred));
  for (const pattern of patterns) {
    const m = pattern.re.exec(text);
    if (!m) continue;
    const parts = pattern.parts(m);
    const inferredYear = !parts.year;
    if (inferredYear) {
      const floor = reference instanceof Date && !Number.isNaN(reference.getTime()) ? reference : now;
      if (!(floor instanceof Date) || Number.isNaN(floor.getTime())) return null;
      parts.year = floor.getFullYear();
      // Missing years follow calendar order: Dec 31 → Jan 1 is next year.
      // Do not turn a same-day past hour into a whole year in the future.
      if (Number(parts.month) < floor.getMonth()+1 || (Number(parts.month) === floor.getMonth()+1 && Number(parts.day) < floor.getDate())) parts.year++;
    }
    const suffix = text.slice(m[0].length);
    const at = /^[\d:]/.test(suffix) ? null : toDate(parts);
    return { lang: pattern.lang, tier: READ_CONFIG.time.sendVerb.test(m[0]) ? "strict" : "loose", time: normalize(m[1]), body: normalize(suffix), at, unparsed: at === null, inferredYear };
  }
  return null;
}
function formatTime(at) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return "時間未解析";
  const pad = value => String(value).padStart(2,"0");
  return `${at.getFullYear()}-${pad(at.getMonth()+1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())} (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][at.getDay()]})`;
}

function monthKey(raw) {
  return String(raw || "").toLowerCase().replace(/\./g, "").slice(0, 3);
}

// --- small helpers ----------------------------------------------------------------

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/[\u00a0\u202f\u2007]/g, " ")
    .replace(/：/g, ":")
    .replace(/[\u200b\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// First `limit` code points, so emoji / CJK are not cut in half.
function previewText(value, limit = 20) {
  return Array.from(String(value == null ? "" : value)).slice(0, limit).join("");
}

// A language-shaped username is still private. Keep registered two-letter languages
// and common script/region subtags only; private-use/variants and arbitrary words mask.
const LANG_CODES = new Set("aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(" "));
const LANG_SCRIPTS = new Set("Arab Armn Beng Cyrl Deva Ethi Geor Grek Gujr Guru Hans Hant Hebr Jpan Kana Khmr Knda Kore Latn Mlym Mong Mymr Orya Sinh Taml Telu Thai Tibt".split(" "));
function sanitizeLang(value) {
  const text = String(value == null ? "" : value);
  const match = /^([a-z]{2})(?:-([A-Z][a-z]{3}))?(?:-([A-Z]{2}|[0-9]{3}))?$/i.exec(text);
  if (!match || !LANG_CODES.has(match[1].toLowerCase())) return "x";
  const script = match[2] && match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
  if (script && !LANG_SCRIPTS.has(script)) return "x";
  return [match[1].toLowerCase(), script, match[3] && match[3].toUpperCase()].filter(Boolean).join("-");
}

// Redact identities before either date extraction or calendar token masking:
// cutting a date out of a URL/email first would lose its sensitive provenance.
function redactIdentities(value) {
  return (typeof value === "string" ? value : "").replace(/(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|www\.|mailto:|tel:|data:)[^\s]+|\u0022(?:[^\u0022\\]|\\.)*\u0022@[^\s]+|\S*@\S+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu,
    sensitive => Array.from(sensitive, () => "x").join(""));
}
// Whitelist tokens survive only as whole words, after full identity redaction.
function maskSample(value) {
  const text = redactIdentities(value);
  const masked = text.replace(/[\p{L}\p{M}]+(?:\.[\p{L}\p{M}]+)*\.?|[^\p{L}\p{M}\p{Nd}\p{P}\s]/gu, token => {
    const lower = token.toLowerCase();
    return CALENDAR_WORDS.has(lower) || CALENDAR_WORDS.has(lower.replace(/\.$/, "")) || CJK_CALENDAR_RE.test(token) ? token : Array.from(token, () => "x").join("");
  });
  return Array.from(masked).slice(0,60).join("");
}
// Extract the date/clock portion before masking, never a trailing post body. Even
// unknown formats must have date+clock+calendar vocabulary and a bounded label.
function timeSample(raw) {
  const text = normalize(redactIdentities(raw));
  if (!text || Array.from(text).length > 160 || !/\d/.test(text)) return "";
  const parsed = parseSchedule(text);
  if (parsed) return maskSample(parsed.time);
  // Unknown numeric date formats can be sampled, but arbitrary prose between a
  // send phrase and clock cannot: its numbers might be private post content.
  const match = /^((?:will send on\s+|(?:將於|将于|於|于)\s*)?(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|(?:\d{4}\s*[年년]\s*)?\d{1,2}\s*[月월]\s*\d{1,2}\s*[日일])(?:\s*[(（][\p{L}\p{M} ]{1,12}[)）])?(?:\s*(?:週|周|星期)\s*[一二三四五六日天])?\s*(?:,|at|の)?\s*(?:上午|下午|午前|午後|오전|오후)?\s*\d{1,2}[:時时點点시]\s*\d{1,2}(?:\s*(?:AM|PM|分|분))?)/iu.exec(text);
  if (!match) return "";
  const masked = maskSample(match[1]);
  // At least one surviving calendar word, not just a number in arbitrary prose.
  if (!/[a-wyz\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/i.test(masked)) return "";
  return masked;
}
function isIsolatedTimeElement(el) {
  if (!el || el.children.length || el.closest(READ_CONFIG.selectors.tweet) || el.closest(READ_CONFIG.selectors.composer) || el.closest(READ_CONFIG.selectors.timeline)) return false;
  const row = el.closest(READ_CONFIG.selectors.structuralRow + ', ' + READ_CONFIG.selectors.button + ', ' + READ_CONFIG.selectors.listitem + ', ' + READ_CONFIG.selectors.cell);
  // Owner row evidence, or a legacy send phrase on a separate span. No aggregate
  // buttons, free paragraphs, or body-only nodes can become diagnostic samples.
  return el.matches(READ_CONFIG.selectors.timeLeaf) && Boolean(row) && Boolean(timeSample(el.textContent));
}

// True only when the overlay host is actually in the document *and* laid out.
function hostMounted(el) {
  if (!el || !el.isConnected) return false;
  let width = 0;
  let height = 0;
  if (typeof el.getBoundingClientRect === "function") {
    try {
      const rect = el.getBoundingClientRect();
      width = Number(rect && rect.width) || 0;
      height = Number(rect && rect.height) || 0;
    } catch { /* ignore */ }
  }
  if (!width && !height) {
    width = Number(el.offsetWidth) || 0;
    height = Number(el.offsetHeight) || 0;
  }
  return width > 0 && height > 0;
}

function dedupStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (value && !seen.has(value)) { seen.add(value); out.push(value); }
  }
  return out;
}

function classifyPath(pathname) {
  const path = pathname || "";
  if (READ_CONFIG.paths.picker.test(path)) return "picker";
  if (READ_CONFIG.paths.scheduled.test(path)) return "scheduled";
  if (READ_CONFIG.paths.drafts.test(path)) return "drafts";
  if (READ_CONFIG.paths.unsent.test(path)) return "unsent";
  return "other";
}

function isScheduledLabel(value) {
  const text = normalize(value);
  if (!text || text.length > 24) return false;
  return LABEL_SET.has(text.toLowerCase());
}

function labelOf(el) {
  const aria = el.getAttribute ? el.getAttribute("aria-label") : "";
  return normalize(aria || el.textContent || "");
}

function toDate(parts) {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  let hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (minute < 0 || minute > 59) return null;
  const mer = String(parts.meridiem || "").replace(/[.\s]/g, "").toLowerCase();
  if (mer && (hour < 1 || hour > 12)) return null;
  if (parts.meridiemStyle === "en") {
    if (mer === "am") hour = hour % 12;
    else if (mer === "pm") hour = hour < 12 ? hour + 12 : hour;
  } else {
    // 午前 / 上午 / 오전 → before noon; 午後 / 下午 / 오후 → after noon.
    if (/^(午前|上午|오전|凌晨|清晨)$/.test(mer)) hour = hour % 12;
    else if (/^(午後|下午|晚上|中午|오후)$/.test(mer)) hour = hour < 12 ? hour + 12 : hour;
  }
  if (hour < 0 || hour > 23) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // Reject silently-rolled dates such as Feb 30.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}

// Parse a candidate string (aria-label or textContent) into a schedule record.
// Returns null when no time phrase is present. `unparsed: true` means a phrase was
// found but we refuse to guess a Date.
function parseSchedule(raw, { allowLoose = true, now = new Date(), reference = null, lang = "" } = {}) {
  const text = normalize(raw);
  if (!text) return null;
  for (const pattern of READ_CONFIG.time.strict) {
    const m = pattern.re.exec(text);
    if (!m) continue;
    const time = normalize(m[1]);
    const offset = m[0].indexOf(m[1]);
    const start = m.index + Math.max(0, offset);
    const body = normalize(text.slice(start + m[1].length));
    const suffix = text.slice(m.index + m[0].length);
    const at = pattern.lang === "en" && /^[\d:]/.test(suffix) ? null : toDate(pattern.parts(m));
    return { lang: pattern.lang, tier: "strict", time, body, at, unparsed: at === null };
  }
  if (!allowLoose) return READ_CONFIG.time.sendVerb.test(text) ? parseTimeLabel(text, { now, reference, lang }) : null;
  for (const pattern of READ_CONFIG.time.loose) {
    const m = pattern.re.exec(text);
    if (!m) continue;
    const time = normalize(m[1]);
    const body = normalize(text.slice(time.length));
    const at = /^[\d:]/.test(text.slice(m[0].length)) ? null : toDate(pattern.parts(m));
    return { lang: pattern.lang, tier: "loose", time, body, at, unparsed: at === null };
  }
  return parseTimeLabel(text, { now, reference, lang });
}

function toItem(parsed) {
  const preview = previewText(parsed.body);
  return {
    time: parsed.time,
    preview,
    key: `${parsed.time}\u0000${normalize(parsed.body)}`,
    lang: parsed.lang,
    tier: parsed.tier,
    at: parsed.at,
    unparsed: parsed.unparsed,
  };
}

function dedup(items) {
  const map = new Map();
  for (const item of items) if (!map.has(item.key)) map.set(item.key, item);
  return [...map.values()];
}

function outermost(elements) {
  const candidates = new Set(elements);
  return [...candidates].filter((el) => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (candidates.has(parent)) return false;
    }
    return true;
  });
}

function deepest(elements) {
  const ancestors = new Set();
  for (const el of elements) {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) ancestors.add(parent);
  }
  return elements.filter((el) => !ancestors.has(el));
}

// Composer chips and editor bodies are never list rows, even inside the unsent dialog.
const COMPOSER = READ_CONFIG.selectors.composer;
function readable(el, scope) {
  // A cell/aggregate containing an article must not launder background tweet text
  // into L1 or text fallback, even during a route/dialog transition.
  if (el.querySelector && el.querySelector(READ_CONFIG.selectors.timeline)) return false;
  for (let node = el; node; node = node.parentElement) {
    if (node.id === "xsched-probe-root" || node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.matches(COMPOSER) || node.matches(READ_CONFIG.selectors.timeline)) return false;
    if (node !== scope && node.getAttribute("role") === "dialog") return false;
    if (node === scope) break;
  }
  return true;
}

function parseElement(el, allowLoose, options = {}) {
  // Boss skeleton L108–124: real HTML button, dedicated date span, separate body.
  // Count the structurally proven row even if its time grammar is unknown.
  if (el.matches(READ_CONFIG.selectors.structuralRow) && el.closest(READ_CONFIG.selectors.dialog) && el.querySelector(READ_CONFIG.selectors.tweet)) {
    const leaves = [...el.querySelectorAll(READ_CONFIG.selectors.timeLeaf)].filter(node => !node.children.length && !node.closest(READ_CONFIG.selectors.tweet) && readable(node, el) && normalize(node.textContent));
    const parsedLeaves = leaves.filter(node => parseSchedule(redactIdentities(node.textContent), options));
    const label = parsedLeaves.length === 1 ? parsedLeaves[0] : leaves.length === 1 ? leaves[0] : null;
    const raw = label ? normalize(label.textContent) : "";
    const parsed = label && parseSchedule(redactIdentities(raw), options);
    const body = normalize(el.querySelector(READ_CONFIG.selectors.tweet).textContent);
    return { ...toItem(parsed ? { ...parsed, body } : { time: raw, body, lang: "x", tier: "loose", at: null, unparsed: true }), sample: label ? timeSample(raw) : "" };
  }
  const named = el.querySelector && el.querySelector(READ_CONFIG.selectors.namedRow);
  const aria = (el.getAttribute && el.getAttribute("aria-label")) || (named && named.getAttribute("aria-label")) || "";
  const fromAria = aria ? parseSchedule(aria, { ...options, allowLoose }) : null;
  const fromText = parseSchedule(el.textContent, { ...options, allowLoose });
  let parsed = fromAria || fromText;
  if (!parsed) return null;
  {
    const tweet = el.querySelector && el.querySelector(READ_CONFIG.selectors.tweet);
    const body = normalize(tweet ? tweet.textContent : "");
    if (body) parsed = { ...parsed, body };
  }
  if (!parsed.body && parsed.tier === "loose") {
    const ariaBody = normalize(fromAria ? el.textContent : aria);
    const other = parseSchedule(ariaBody, { ...options, allowLoose });
    const body = other ? other.body : ariaBody;
    if (body) parsed = { ...parsed, body };
  }
  // A standalone time-only button is a composer chip, not sufficient list evidence.
  if (!parsed.body && !el.closest(READ_CONFIG.selectors.rowEvidence)) return null;
  return toItem(parsed);
}

function textFallback(scope) {
  const all = [...scope.querySelectorAll(READ_CONFIG.selectors.all)].filter((el) => readable(el, scope) && !el.querySelector(COMPOSER) && parseSchedule(el.textContent, { allowLoose: false }));
  const leaves = deepest(all);
  const items = [];
  for (const el of leaves) {
    let hit = parseSchedule(el.textContent, { allowLoose: true });
    const parent = el.parentElement;
    if (hit && !hit.body && parent && scope.contains(parent) && parent !== scope && readable(parent, scope) && !parent.querySelector(COMPOSER)) {
      const parentHit = parseSchedule(parent.textContent, { allowLoose: true });
      if (parentHit && parentHit.body) hit = parentHit;
    }
    if (hit && hit.body) items.push(toItem(hit));
  }
  return dedup(items);
}

function countDeep(scope, re) {
  const all = [...scope.querySelectorAll(READ_CONFIG.selectors.all)].filter((el) => readable(el, scope) && re.test(normalize(el.textContent)));
  return deepest(all).length;
}

function visibleInDocument(el) {
  for (let node = el; node; node = node.parentElement) if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
  return true;
}
function selectedModal(doc) {
  return [...doc.querySelectorAll(READ_CONFIG.selectors.modal)].find(el => visibleInDocument(el) && [...el.querySelectorAll(READ_CONFIG.selectors.selectedTab)].some(tab => tab.closest(READ_CONFIG.selectors.dialog) === el)) || null;
}
function findScheduledTab(doc) {
  const modal = selectedModal(doc);
  const tabs = [...(modal || doc).querySelectorAll(READ_CONFIG.selectors.tab)];
  const scheduled = tabs.filter((el) => visibleInDocument(el) && readable(el, el.closest(READ_CONFIG.selectors.dialog) || doc.body) && isScheduledLabel(labelOf(el)));
  const inDialogs = scheduled.filter(el => el.closest(READ_CONFIG.selectors.dialog));
  const candidates = inDialogs.length ? inDialogs : scheduled;
  return candidates.find(tabIsSelected) || candidates[0] || null;
}

function tabIsSelected(tab) {
  if (!tab) return false;
  return tab.getAttribute("aria-selected") === "true" || tab.getAttribute("aria-current") === "page";
}

function findScope(doc, tab) {
  if (tab) {
    const controls = tab.getAttribute ? tab.getAttribute("aria-controls") : "";
    if (controls) {
      const panel = doc.getElementById ? doc.getElementById(controls) : null;
      if (panel) return { el: panel, name: "panel" };
    }
  }
  // A wrapper dialog is not the list scope. The selected tab's NEAREST dialog
  // (owner L42/L93) contains rows; using the outer L36 skips every nested row.
  const visibleDialogs = [...doc.querySelectorAll(READ_CONFIG.selectors.dialog)].filter(visibleInDocument);
  const dialog = (tab && tab.closest(READ_CONFIG.selectors.dialog)) || selectedModal(doc) || visibleDialogs[visibleDialogs.length - 1];
  if (dialog) return { el: dialog, name: "dialog" };
  const column = doc.querySelector(READ_CONFIG.selectors.column);
  if (column) return { el: column, name: "column" };
  const region = doc.querySelector(READ_CONFIG.selectors.region);
  if (region) return { el: region, name: "region" };
  return doc.body ? { el: doc.body, name: "body" } : null;
}

function computedOverflow(doc, el) {
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== "function") return "";
  try {
    const style = view.getComputedStyle(el);
    return `overflow:${style.overflow || ""};overflow-y:${style.overflowY || ""}`;
  } catch {
    return "";
  }
}

// Heuristic only. `virtualized` = the list positions rows with inline translateY().
// `needsScroll` = something in the scope can scroll, so the overlay must warn that the
// count grows only as the user scrolls (we never scroll for them).
function detectLayout(scope, doc) {
  const inlineStyled = [scope, ...scope.querySelectorAll(READ_CONFIG.selectors.styled)].slice(0, 200);
  let virtualized = 0;
  let overflow = 0;
  for (const el of inlineStyled) {
    const style = el.getAttribute ? el.getAttribute("style") || "" : "";
    if (/translateY\s*\(/i.test(style)) virtualized = 1;
    const combined = `${style} ${computedOverflow(doc, el)}`;
    if (/overflow(?:-y)?\s*:\s*(?:auto|scroll)/i.test(combined)) {
      const scrollHeight = Number(el.scrollHeight || 0);
      const clientHeight = Number(el.clientHeight || 0);
      if (scrollHeight > clientHeight + 24) overflow = 1;
    }
  }
  if (!overflow) {
    const scrollHeight = Number(scope.scrollHeight || 0);
    const clientHeight = Number(scope.clientHeight || 0);
    if (scrollHeight > clientHeight + 24) overflow = 1;
  }
  return { virtualized, needsScroll: virtualized || overflow ? 1 : 0 };
}

function blank(onScheduled) {
  return {
    onScheduled,
    tab: 0,
    scope: "none",
    cell: 0,
    button: 0,
    listitem: 0,
    link: 0,
    tweetText: 0,
    phrase: 0,
    l1: 0,
    l2: 0,
    l3: 0,
    layer: "none",
    mounted: 0,
    samples: [],
    fmt: "",
    timeOk: 0,
    timeFail: 0,
    unparsed: 0,
    loose: 0,
    needsScroll: 0,
    virtualized: 0,
    empty: onScheduled ? 1 : 0,
    items: [],
  };
}

function readSnapshot(doc, { pathname = "", now = new Date() } = {}) {
  const kind = classifyPath(pathname);
  const tab = findScheduledTab(doc);
  const selected = tabIsSelected(tab);
  let onScheduled = 0;
  if (kind !== "picker" && kind !== "drafts") {
    if ((kind === "scheduled" && (!tab || selected)) || (kind === "unsent" && selected)) onScheduled = 1;
  }
  if (!onScheduled) return blank(0);

  const found = findScope(doc, tab);
  if (!found) return { ...blank(1), tab: tab ? 1 : 0 };
  const scope = found.el;
  const candidates = (selector) => [...scope.querySelectorAll(selector)].filter((el) => readable(el, scope) && !el.querySelector(COMPOSER));

  const cells = outermost(candidates(READ_CONFIG.selectors.cell));
  const buttons = outermost(candidates(READ_CONFIG.selectors.button));
  const listitems = outermost(candidates(READ_CONFIG.selectors.listitem));
  const links = outermost(candidates(READ_CONFIG.selectors.link));

  const parseRows = (rows) => {
    let reference = null;
    return rows.map(el => {
      const item = parseElement(el, true, { now, reference, lang: doc.documentElement?.lang || "" });
      if (item?.at) reference = item.at;
      return item;
    }).filter(Boolean);
  };
  const fromCells = dedup(parseRows(cells));
  const fromA11y = dedup(parseRows(outermost([...listitems, ...links, ...buttons])));
  const fromText = fromCells.length === 0 && fromA11y.length === 0 ? textFallback(scope) : [];

  let items = [];
  let layer = "none";
  if (fromCells.length) {
    items = dedup([...fromCells, ...fromA11y]);
    layer = fromCells.some((item) => item.tier === "strict") ? "cell" : "loose";
  } else if (fromA11y.length) {
    items = fromA11y;
    layer = fromA11y.some((item) => item.tier === "strict") ? "a11y" : "loose";
  } else if (fromText.length) {
    items = fromText;
    layer = "text";
  }

  const pool = outermost([...cells, ...listitems, ...links, ...buttons]);
  let timeFail = 0;
  for (const el of pool) {
    const text = normalize(`${(el.getAttribute && el.getAttribute("aria-label")) || ""} ${el.textContent || ""}`);
    if (!READ_CONFIG.time.year.test(text)) continue;
    if (!parseSchedule(text, { allowLoose: true })) timeFail += 1;
  }

  // Sample only a recognized time phrase in an isolated leaf, never an aggregate
  // row or tweetText subtree. A year alone is not evidence of a time label.
  const sampleRows = new Set(pool);
  const failNodes = [...scope.querySelectorAll(READ_CONFIG.selectors.all)].filter((el) => {
    if (!readable(el, scope) || sampleRows.has(el) || !isIsolatedTimeElement(el)) return false;
    const text = el.textContent;
    if (!READ_CONFIG.time.year.test(normalize(text || "")) || !READ_CONFIG.time.sendVerb.test(text || "")) return false;
    const parsed = parseSchedule(text, { allowLoose: true });
    return !parsed || parsed.unparsed === true;
  });
  const legacySamples = dedupStrings(failNodes.map((el) => timeSample(el.textContent))).filter(Boolean);
  const failedRows = items.filter(item => item.unparsed);
  timeFail = Math.max(timeFail, failedRows.length);
  const samples = dedupStrings([...failedRows.map(item => item.sample), ...legacySamples]).filter(Boolean).slice(0,3);

  const layout = detectLayout(scope, doc);
  return {
    onScheduled: 1,
    scopeElement: scope,
    tab: tab ? 1 : 0,
    scope: found.name,
    cell: cells.length,
    button: buttons.length,
    listitem: listitems.length,
    link: links.length,
    tweetText: scope.querySelectorAll(READ_CONFIG.selectors.tweet).length,
    phrase: countDeep(scope, READ_CONFIG.time.sendVerb),
    l1: fromCells.length,
    l2: fromA11y.length,
    l3: fromText.length,
    layer,
    // Real mount state is computed by the content glue; the reader cannot know it.
    mounted: 0,
    samples,
    // Only the structural reader certifies a separate time label. Legacy parsed
    // item.time may have originated inside tweetText; never export it as a sample.
    fmt: items.length ? items[0].sample || "" : "",
    timeOk: items.filter((item) => item.at !== null).length,
    timeFail,
    unparsed: items.filter((item) => item.unparsed).length,
    loose: items.filter((item) => item.tier === "loose").length,
    needsScroll: layout.needsScroll,
    virtualized: layout.virtualized,
    empty: items.length === 0 && timeFail === 0 ? 1 : 0,
    items,
  };
}

// Accumulate across snapshots (the list is virtualized, so earlier rows disappear).
// `replace` is used on non-virtual pages where one snapshot already holds the whole list.
function mergeItems(previous, next, { replace = false } = {}) {
  if (replace) return dedup(next);
  return dedup([...(previous || []), ...(next || [])]);
}

const DIAG_ORDER = [
  "onScheduled", "tab", "scope", "cell", "button", "listitem", "link", "tweetText",
  "phrase", "l1", "l2", "l3", "layer", "mounted", "items", "remounts", "timeOk",
  "timeFail", "unparsed", "loose", "needsScroll", "virtualized", "empty", "scrolled",
];

// Masked, percent-encoded time samples (max 3). The pipe separator is safe because
// maskSample already replaced every non-digit/punct/space symbol, including the pipe.
function sampleField(samples) {
  if (!Array.isArray(samples)) return "none";
  const out = [];
  for (const sample of samples) {
    if (typeof sample !== "string" || !sample) continue;
    out.push(encodeURIComponent(maskSample(sample)));
    if (out.length >= 3) break;
  }
  return out.length ? out.join("|") : "none";
}

// Diagnostic string: counters / booleans / language tags / masked samples / version only.
// Never a tweet body, account, URL, or unmasked schedule-time string.
// Manifest data is trusted only after validating a short numeric version. Never echo
// exception messages: an invalidated extension can throw arbitrary strings.
function versionLine(manifestVersion, runtimeInvalidated = false) {
  const version = typeof manifestVersion === "string" && /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:\.\d{1,5})?$/.test(manifestVersion) ? manifestVersion : "unknown";
  if (runtimeInvalidated) return `xsched probe v${PROBE_VERSION} — 擴充已重新載入，請重新整理頁面`;
  if (version !== "unknown" && version !== PROBE_VERSION) return `xsched probe v${PROBE_VERSION} ⚠ 版本不符：script ${PROBE_VERSION} / manifest ${version}，請重新整理頁面`;
  return `xsched probe v${PROBE_VERSION} (manifest ${version})`;
}

function buildDiagnostic(report) {
  const scopeCode = { none: 0, panel: 1, dialog: 2, column: 3, region: 4, body: 5 };
  const layerCode = { none: 0, cell: 1, a11y: 2, text: 3, loose: 4 };
  const parts = DIAG_ORDER.map((key) => {
    if (key === "scope" || key === "layer") {
      const codes = key === "scope" ? scopeCode : layerCode;
      const value = report[key];
      return `${key}=${typeof value === "string" && Object.hasOwn(codes, value) ? codes[value] : 0}`;
    }
    const value = report[key];
    return `${key}=${typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0}`;
  });
  const fmt = normalize(maskSample(report.fmt)) || "none";
  return `${versionLine(report.manifestVersion, report.runtimeInvalidated === true)}\n${parts.join(" ")} lang=${sanitizeLang(report.lang)} doclang=${sanitizeLang(report.doclang)} samples=${sampleField(report.samples)}\nfmt=${fmt}`;
}

// Shared API. `globalThis` so a classic content script loaded right after this file (same
// isolated world) can use it, and so the node unit test can `await import("./reader.js")`
// and read `globalThis.XSCHED_READER`.
globalThis.XSCHED_READER = {
  PROBE_VERSION,
  READ_CONFIG,
  versionLine,
  SCHEDULED_LABELS,
  normalize,
  previewText,
  classifyPath,
  isScheduledLabel,
  parseSchedule,
  parseTimeLabel,
  formatTime,
  timeSample,
  isIsolatedTimeElement,
  findScheduledTab,
  readSnapshot,
  mergeItems,
  buildDiagnostic,
  maskSample,
  sanitizeLang,
  hostMounted,
};
})();
