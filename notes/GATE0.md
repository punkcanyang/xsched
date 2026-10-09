# 閘 0：可行性（Scheduled 列表讀取）

更新：2026-10-09（UTC+8），產品開發（CodeWhale）；Codex 獨立 session 複審並修正。
分支：`gate0/scheduled-read`。**本階段只做可行性探針，不做任何 1.0 功能。**

一句話結論：**有條件可行** — 讀法有公開的第三方實機線索（尤其日文無障礙名稱），本機 fixture 與真 Chrome 都讀得到；但**我們沒有登入 X，真頁 DOM 一條都沒驗證過**，所以能不能在老闆的真帳號上讀出來，必須靠老闆實測（見文末 ≤5 步）。

---

## 1. DOM 依據表

「已親讀」＝ 产品开发來源基準 `/workspace/xsched-clues/sources-verified-by-pd.md` 記載其實際打開頁面讀到原文；不表示 CodeWhale 或這次 Codex 複審再次打開過來源。「真頁已驗證」＝ 在登入的 x.com 真頁上確認過 —— **全部為「未驗證」**，因為我們不能登入 X（`AGENTS.md` 規矩 7）。複審依使用者提供的產品開發來源基準核對，未另連 X 真站。
下面每一條都只說「公開來源說…」，不當成事實。

| # | 內容（我們據此寫的假設） | 來源 URL | 親讀狀態 | 真頁 |
|---|---|---|---|---|
| 1 | 直達 Scheduled 列表的路徑 `https://x.com/compose/post/unsent/scheduled`（入口：發文視窗 → 日曆 icon → 左下「Scheduled posts」；或 composer 右上「Unsent posts」→「Scheduled」tab） | https://jgallardo.me/blog/how-to-view-scheduled-posts-on-x/ | 已親讀（2025-08-14 更新） | 未驗證 |
| 2 | 日文 UI：composer 右上「下書き」→「予約済み」tab；列表顯示「予約日時と本文の冒頭」；「2026年7月20日(月)の午後4:24に送信されます」是**排程對話框／chip** 的範例，不能單獨當成列表格式證據 | https://sananeblog.com/x-scheduled-post/ | 已親讀（產品開發；作者稱 2026-07 在 Web 版實機驗證） | 未驗證 |
| 3 | 列表每則在無障礙樹是 `role=button`，accessible name 以「2026年…」開頭、含「に送信されます」，**name = 時間短語 + 本文**；列表不完整需 scrollBy 再 snapshot 合併 → 暗示虛擬化／懶載入 | https://github.com/shinshin86/ai-chrome-pilot/blob/main/skills/x-get-scheduled-posts/SKILL.md（regex `/^\d{4}年.*に送信されます/`；split `^(.+?に送信されます)\s*([\s\S]*)$`） | 已親讀 | 未驗證 |
| 3b | **推論（非原文）**：英文 UI 列表每則 name 可能類似 `Will send on Fri, Oct 10, 2026 at 9:00 AM <本文>`；具體日期格式與 weekday 是假資料，來源沒有證實 | 由 #3 列表結構與 #4 composer chip 句型推得 | 推論 | 未驗證 |
| 4 | 英文：composer chip 文案 `Will send on [date and time]`；Post 鈕變 `Schedule`；管理在 Unsent posts → Scheduled tab | https://www.crowbert.com/how-to-schedule-tweets | 已親讀（2026-06 更新；原文未給具體日期格式） | 未驗證 |
| 5 | 排程對話框（**不是列表**）testid：`scheduleOption`、`scheduledDateField`、`scheduledTimeField`、`scheduleConfirm`；通用虛擬列表外層 cell：`data-testid="cellInnerDiv"` | https://xactions.app/docs/guides/dom-selectors（自稱 Last verified: Feb 2026） | 未親讀（本次；來源基準記載前一個 agent 讀過） | 未驗證 |
| 6 | 簡中：「未发送的帖子」→ Drafts / Scheduled 兩個 tab，可看到每條的發佈時間與內容預覽；fixture 的「已定时」標籤與中文時間句型均為推測 | https://lanniaohao.com/article/2026-x-ping-tai-ru-he-she-zhi-nei-ron-din-shi-fa-bu 、 https://noobclaw.com/cn/blog/twitter-scheduled-post-setup-steps-2026/ | 未親讀（僅前 agent 搜尋摘要；具體文案為推測） | 未驗證 |
| 7 | 繁中、韓文的時間文案：**找不到公開原文**。解析器採用的格式是**推測**（繁中「將於 2026年10月10日 上午9:00 傳送」、韓文「2026년 10월 10일 오전 9:00에 전송됩니다」） | 無 | **推測**（依英／日句型） | 未驗證 |
| 8 | 产品开发記載：未登入抓 `abs.twimg.com` 前端字串包只拿到 logged-out bundle，不含 composer 字串 → 無法用官方字串驗證 | 来源基準檔 #8（產品開發先前查證動作，與擴充無關） | 已親讀（產品開發記載無結果；本次複審未重做） | 未驗證 |

> 注意：**沒有任何公開來源記載 Scheduled 列表本身的專屬 testid**（#5 的 cellInnerDiv 只是通用虛擬列表外層）。所以 reader 用「多層選擇器＋備援」，不押單一 testid。

---

## 2. 讀法（`probe/reader.js` 的實際邏輯）

`readSnapshot(document, { pathname })` → 回一份「快照」：計數 + 每則 `{ time, preview, at, unparsed, tier, lang }`。

1. **判斷在不在 Scheduled 頁**
   - 路徑從開頭比對：`/compose/post/unsent/scheduled`、`/compose/tweet/unsent/scheduled`；若有已知 Scheduled tab，必須選中，避免路由切換期間讀到 Drafts。
   - 或在 **unsent 路徑**裡，選中的 tab 是 Scheduled：找 `[role=tab]` 且標籤命中 `SCHEDULED_LABELS`（英文 `scheduled`、日文 `予約済み`／`予約投稿`、繁中 `已排程`／`已排定`、簡中 `已定时`、韓文 `예약됨`／`예약`），且 `aria-selected="true"` 或 `aria-current="page"`。首頁的同名 tab 不算。
   - 多語系清單可擴充；**繁／簡／韓標籤皆為推測**（#6、#7）。
   - 排程對話框路徑（`/compose/post/schedule`）與 Drafts 一律不讀（回 0）。
2. **選 scope**：`tab[aria-controls]` → `#<id>` 面板；否則該 tab 所在 `[role=dialog]` → 第一個 dialog → `[data-testid=primaryColumn]` → `[role=region]` → `body`。排除 hidden／aria-hidden、巢狀對話框、表單與 composer／picker 元素；這些排除規則也是推測，真頁未驗證。單獨只有時間、沒有本文／cell／listitem 證據的 chip 不計數。
3. **三層備援讀取**（每層命中數都進診斷：`l1/l2/l3`，用哪層記在 `layer`）
   - **L1 cell**：scope 內 `[data-testid="cellInnerDiv"]`，取最外層，parse 該列或內部 role 元素的 `aria-label`，再備援 `textContent`；優先用 `tweetText` 補本文。
   - **L2 a11y**：`[role=listitem]`／`[role=link]`／`[role=button]`（合併取最外層），parse `aria-label` 或 `textContent`。← 對應 #3 的日文 a11y 線索。與 L1 合併去重，避免改版時只剩部分 cell 而漏掉 role 列。
   - **L3 文字掃描**：L1/L2 都沒命中時，在 scope 內找「送信動詞＋日期」的最內層元素，必要時往上取父層補本文；不把單獨裸日期或時間 chip 算成文字列。
4. **時間解析**（`parseSchedule`）：英／繁中／簡中／日／韓。
   - `strict`：句子帶送信動詞（`will send on`、`に送信されます`、`將於/将于…傳送/发送`、`전송됩니다/게시됩니다/예약됩니다`）。
   - `loose`：只有裸日期時間，沒有動詞（備援）。
   - 英文日期格式容錯：`Fri, Oct 10, 2026 at 9:00 AM`、`October 10, 2026 at 9:00 AM`、`10 Oct 2026 at 09:00`（有／無 weekday、有／無 am-pm、`,` 或 `at`）。
   - 日文：「2026年7月20日(月)の午後4:24に送信されます」。
   - 中／韓：**放寬**（推測格式）。
   - 輸出：`time`＝正規化空白／冒號後的時間短語（英文不含 `Will send on`，不改寫日期）；`at`＝解析出的**本地 `Date`**；解析不出 → `unparsed: true`，**不猜**（非法 12 小時制、2 月 30 日、DST 不存在時間會被拒；重複的 DST 時間仍由本地 Date 決定）。
5. **虛擬化**：`content.js` 只「累加使用者自己捲過、出現在 DOM 的」項目（以 `時間短語+完整正規化本文` 在記憶體去重，`mergeItems`；浮層以 `Array.from` 顯示前 20 code points）。路由／query／scope 節點改變、離開 Scheduled 或讀到空列表就清空。**同一 scope 內非空重繪無法區分虛擬窗口與刪除，不聲稱都會清空**。非虛擬／無捲動的列表直接替換。絕不自動捲動；浮層固定提示「虛擬列表：請自己往下捲到底，數字才完整」。

### 浮層（`probe/content.js`，open shadow root，`#xsched-probe-root`）
- 固定右下、可收合（`收合`／`展開`）。顯示「讀到 N 則」＋每則「時間｜前 20 字」。
- 只在 Scheduled 頁顯示；其他頁隱藏。
- 「複製診斷」按鈕：使用者點按才 `navigator.clipboard.writeText`（不加 `clipboardWrite` 權限；失敗退回 textarea+execCommand，失敗顯示「複製失敗」）。複製的是程式內已驗證的字串，不信任頁面 dataset。診斷字串只有非負整數／布林數值／版本，所有欄位白名單、型別檢查；`scope` 數字代碼：none=0／panel=1／dialog=2／column=3／region=4／body=5；`layer`：none=0／cell=1／a11y=2／text=3／loose=4。例如 `xsched-gate0 v0.0.1 onScheduled=1 tab=1 scope=2 cell=2 layer=1 mounted=2 timeOk=2 scrolled=0`（完整輸出另含其餘計數）。
- **不存不傳**：無 storage、無網路。
- 技術註記：Chrome 不支援 content script 之間的 ES module import（無 `web_accessible_resources` 時連 dynamic import 都失敗，已實測），所以 `reader.js` 是 classic 共享腳本，整包包在 IIFE 內、只掛 `globalThis.XSCHED_READER`；manifest 依序注入 `["reader.js","content.js"]`。

### SPA 路由
`MutationObserver`（childList/subtree/characterData＋tab／aria 相關 attributes）＋ 每 400ms 輪詢 `location`（**不 patch `history`**）＋ `popstate`。60ms 有界節流，連續 mutation 不會無限延後讀取。忽略浮層自身增刪、資料沒變不重繪；pagehide 清理觀察器／輪詢／timer／資料，bfcache 恢復時重新啟動。

### 老闆選定的 Logo B（Dagaz）

- SVG：`docs/xsched-logo-B.svg`、`docs/xsched-logo-B-black-on-light.svg`、`docs/xsched-logo-B-white-on-dark.svg`、`docs/xsched-logo-B-accent-icon.svg`。只用幾何元素與本檔 clipPath；verify 以元素／屬性白名單拒絕 script、事件屬性、foreignObject、外部 href／CSS url、DOCTYPE／外部實體。
- PNG：`probe/icons/icon{16,32,48,128}.png`，分別為 16／32／48／128 正方形；逐位元比對與使用者指定來源 `/workspace/bd-punkcan/xsched-logo/variants/xsched-logo-B-icon{16,32,48,128}.png` 一致。
- manifest 只新增 `icons`，沒有 `action`、權限或 `web_accessible_resources`。守門僅允許安全的圖示物件與相對 `icons/*.png` 路徑，檢查檔案存在、非 symlink、PNG 結構／CRC／解壓資料／尺寸。若將來已有 action，只接受經同樣驗證的 `action.default_icon`；不能加 popup 等其他欄位。

---

## 3. 改版風險

| 風險 | 可能性 | 我們的緩解 |
|---|---|---|
| 沒有任何專屬 testid；X 一改 class／testid 就失效 | 中 | 三層備援（cell → a11y → 文字掃描）；不押單一選擇器 |
| a11y name 句型改了（#3 是第三方經驗，非官方） | 中 | `strict` 失敗退 `loose`；再失敗退 L3 文字掃描 |
| 英／繁／簡／韓時間文案與猜測不符 | **高**（#3b 英文列表推論、#6/#7 未親讀／推測） | 容錯 regex；非法日期只標 `unparsed` 不猜；無法匹配的疑似列記 `timeFail`；請老闆貼「複製診斷」 |
| 標籤文字（tab）不在我們的清單內 | 中 | 「複製診斷」會回傳 `onScheduled=0`；請老闆回報語系，我們加標籤 |
| 虛擬列表：只讀到當前窗口 | 中 | 累加去重＋捲動提示；**不自動捲動** |
| 虛擬化偵測（`translateY` heuristics）誤判 | 低 | 只影響提示文字，不影響計數正確性 |
| 真頁把列表放進 iframe／shadow DOM | 低 | reader 只看主 document；若真如此，L1–L3 皆 0，診斷會顯示 |

**診斷怎麼幫我們定位**：`l1/l2/l3` 全 0＝選擇器全失效；`l1>0` 但 `timeOk=0`＝選擇器對、時間格式變了；`timeFail>0`＝看到疑似列但解析不出；`onScheduled=0`＝路徑／tab 判斷失敗。

---

## 4. 結論

**有條件可行。**

- 支持：公開來源（#1–#4；列表結構以 #3 為最強線索）＋ 本機五語系 fixture 與**真 Chrome for Testing 載入真擴充** 都讀到正確 N 與時間（見 §5 測試結果、`docs/gate0-*.png`）。
- 條件：**真頁 DOM 未驗證**（不能登入）。路徑、tab 文案、a11y name、時間格式都可能在真頁不同。→ 需要老闆在自己的 Chrome 實測，並回報「複製診斷」。
- 若實測讀不出：見 §6 替代方案。**在真頁驗證前，不能說「可行」，只能說「有條件可行」。**

---

## 5. 測試結果（本機，非真頁）

- `npm test`：**41/41 過**（既有 35 項＋6 項 Logo 守門測試，含壞路徑／外部 URL／尺寸不符的 verify CLI 真正 exit 1）。
- `npm run verify`：**過**（掃 `probe/` 7 個檔案與 4 個 Logo B SVG；既有網路／權限規則保留，只增加經嚴格驗證的圖示欄位；**24 個 API 繞法＋14 個圖示＋9 個 SVG 反例 self-test**）。守門是保守的靜態檢查，不能證明任意混淆程式安全，仍需人工複審。
- `npm run e2e`：**過**（真 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server ＋ `--host-resolver-rules` 把 x.com 指到 127.0.0.1）：
  - en／ja／zh-Hans／zh-Hant／ko 各 **2 則**、時間字串正確；
  - roles（無 testid）走 **a11y 層**；
  - empty＝**0 則**；virtual＝**3 → 6**（測試程式自己捲，斷言 `scrolled` 0→1、`virtualized=1`、提示文字在）；
  - 虛擬列表同 scope 空列表 **6→0→3**，scope 替換 **3→0**；SPA 路由／attribute-only tab 切換；頻繁 mutation 不餓死 reader；穩定頁面不反覆重建控制鈕；composer chip 不計數；pagehide 清理與 bfcache 重啟；
  - home、Drafts、picker（故意保留選中 Scheduled tab）＝**浮層隱藏／0**；
  - clipboard：點擊前 **0** 次寫入、點擊後 **1** 次；篡改 dataset 放假帳號／URL／時間／內容，複製結果仍只有數字欄位；
  - Logo：已載入的 manifest 註冊 4 張圖示、沒有 action；測試程式另開分頁直讀 `chrome-extension://<id>/icons/icon128.png`，Chrome 成功解碼為 **128×128**。該分頁單獨監控／攔阻額外請求；擴充本身不讀取圖示、不加 `web_accessible_resources`。
  - **168 個斷言過**；fixture 分頁網路 **32** 個請求全部是本機 fixture document／瀏覽器 favicon，**擴充请求 0**。Puppeteer 攔阻任何額外請求，CDP 再檢查 type 與 extension initiator（包含同 URL 的 Fetch 也拒絕）；其餘 DNS host 一律解析失敗。測試程式單獨讀取本機擴充圖示不放寬 fixture 的請求規則；Chrome 可能不回報 extension-scheme 的 request event，因此以實際資源 URL＋解碼尺寸確認圖示存在。
- 截圖（假資料，**依公開來源重建，非真頁快照**；非真實推文／帳號）：`docs/gate0-en.png`、`gate0-ja.png`、`gate0-zh-Hans.png`、`gate0-zh-Hant.png`、`gate0-ko.png`、`gate0-roles-fallback.png`、`gate0-empty.png`、`gate0-virtual-before.png`、`gate0-virtual-after.png`。

---

## 6. 老闆實測（≤5 步）

1. Chrome 開 `chrome://extensions` → 開右上「開發者模式」→「載入未封裝項目」→ 選這個 repo 的 `probe/` 資料夾。
2. 開 `https://x.com/compose/post/unsent/scheduled`（或從發文視窗 → 排程 icon → 左下「Scheduled posts」）。
3. 右下角應出現 xsched 探針浮層，顯示「讀到 N 則」＋每則「時間｜前 20 字」。
4. **自己**把列表往下捲到底（工具不會自動捲；浮層會提示「請自己往下捲」）。
5. 對照浮層的 **N 與時間**是否和 X 頁面一致 → 按浮層的「**複製診斷**」→ 貼回給我們。

> 只回傳「複製診斷」那一行即可；它**不含**推文內容、帳號或網址。

### 讀不出來時的替代方案
1. **回報診斷**：貼「複製診斷」那一行，我們就知道是哪一層／哪個格式失效（`onScheduled=0`＝頁面判斷；`l1/l2/l3=0`＝選擇器；`timeFail>0`＝時間格式）。
2. **回報語系**：浮層若整個不出現或顯示 0，告訴我們你的 UI 語系與 tab 上那兩個字（例：日文「予約済み」），我們把標籤加進清單。
3. **只記本機自己排過的**（退路）：若真頁選擇器短期內改不動，1.0 可先只服務老闆自己排的內容（例如剛用排程對話框建的項目），不依賴讀取整個列表。
4. **只確認正在設定的那一則**（1.0 退路推論，需商務拓展確認）：原生排程對話框欄位（來源 #5，本次未親讀、真頁未驗證）與 composer chip（來源 #2／#4）可能用來讀目前設定的時間，但**不能取代已排列表、不能聲稱代表已排成功或能避開全帳號衝突**。仍由老闆按 X 原生 Schedule，擴充不攔網路、不用 API、不在背景發文。
5. **最後手段**：請老闆在真頁開 DevTools，對一條排程列「Copy → Copy outerHTML」（**只給我們那一段結構、自己先把內容碼掉**），我們據此修選擇器。此步涉及推文結構，非必要不做。

---

## 7. 已知限制

- 真頁未驗證（最大限制）；繁／簡／韓時間文案與標籤為推測。
- 診斷刻意只含計數，**無法**從診斷看出「哪一句格式」——需老闆另回報語系。
- 不做自動捲動，虛擬列表的總數只有老闆自己捲過才完整。
- 排程對話框本身（1.0 的「快速選時段」）**不在本階段**，本階段只讀列表。
- 相同時間＋完整本文完全相同的兩則仍無 DOM 唯一 ID 可區分，會合併；純媒體、僅時間的 role-only 列可能因 chip 排除規則漏讀。
- 虛擬化／scope 判斷仍是推論；同 scope 內編輯／刪除可能留下先前記憶體項目，空窗口也可能使累加清空。重新進入列表可重讀，不能將累加視為即時權威總數。

---

# 閘 0.1：真機浮層修正（probe v0.0.2）

更新：2026-10-09（UTC+8）；產品開發 CodeWhale 首版，Codex 獨立 session 接續複審。分支 `gate0.1/probe-fixes`；[PR #3](https://github.com/punkcanyang/xsched/pull/3)（使用者提供）。
**只修探針、診斷及隱私，不改讀法選擇器或時間解析規則，不猜新選擇器。**

## 1. 真機回報與證據

使用者轉述：老闆在自己的 Chrome 載入 0.0.1 後看不到浮層，提供：
```
xsched-gate0 v0.0.1 onScheduled=1 tab=1 scope=2 cell=0 button=5 listitem=0 link=0 tweetText=1 phrase=1 l1=0 l2=0 l3=0 layer=0 mounted=0 timeOk=0 timeFail=1 unparsed=0 loose=0 needsScroll=0 virtualized=0 empty=0 scrolled=0
```

依據：本機 `git diff main...HEAD`、main 的 `probe/content.js`／`probe/reader.js`（**已親讀程式**），以及上面診斷（**收到轉述，未親看真頁**）。DOM 依據仍是本文閘 0 的來源表及 `/workspace/xsched-clues/sources-verified-by-pd.md`（**已親讀清單，未另讀原網頁**）；真頁一律**未驗證**。

- `onScheduled=1` 是當次判定為 Scheduled，不能证明其他時刻的判定；`scope=2` 是 **dialog 的列舉代碼**，不是候選數量。
- 三層都是 0 命中；`timeFail=1` 表示一個含年份候選解析失敗，不能確認它與 `phrase=1` 是同一個節點。
- 診斷證明 reader 曾執行；取得方式未知，**不能推定浮層曾掛上或可見**。
- **確證的程式問題**：舊 `mounted` 使用 `items.length`，不是 DOM 狀態；因此原診斷的 0 無法證明浮層沒掛上。

## 2. 根因分析：事實與推測分開

- **已親讀程式事實**：舊 host 掛 `document.documentElement`，不是列表／modal 內部；不能宣稱它會隨列表替換而移除。舊 signature 的條件也檢查 `host.isConnected`，所以「快取阻止重掛」不是程式支持的根因。
- **已親讀程式事實**：舊觀察器忽略自家 host 移除紀錄；location 輪詢只在路由改變時 schedule。host 單獨移除、其他 DOM／路由都不變時缺少觸發，這是合理程式缺口；**真機是否發生是推測、未驗證**。
- 舊非 Scheduled 會 hide；SPA 路由／tab 暫態可能翻轉判定（**推測、未驗證**）。
- CSP、頁面样式覆蓋、堆疊脈絡／遮擋都是**推測、未驗證**；本轮降低風險，不能宣稱已排除所有可能。

單一真機根因**仍未確定**；0.0.2 是否修好真機必須由老闆實測。

## 3. 修正與隐私規則

- **無條件 UI**：啟動掛 body（沒有 body 才 documentElement）；Scheduled 0 則也顯示「讀到 0 則」＋診斷；其他頁是可展開膠囊，讀取仍 0 命中。
- host／panel 都用 CSSOM `style.setProperty(key, value, "important")`、shadow 與 textContent。固定定位／高 z-index 不保證越過所有祖先堆疊脈絡。
- **重掛**：忽略自家 mutation，讀取節流 60ms；觀察器與 400ms 輪詢都檢查斷線。每 3 秒最多建立 3 次，達上限等待窗口過後再試，避免互搶且不永久停用。pagehide 清理觀察器／計時器，bfcache 恢復不重複註冊。
- **mounted**：`isConnected` 且布局寬、高均 >0 才 =1；輪詢更新尺寸變化。這是布局狀態，不能证明未被其他元素遮擋。另加 `items`／`remounts`。
- **時間樣本**：只取既有時間字樣與年份命中且解析失敗的隔離葉節點，排除 tweetText 及其後代、composer、聚合列；非法日期已解析時只取 `parsed.time`。先遮罩再回傳，不保留原樣本。不安全／無法分離的標籤保守輸出 none。最多 3 筆、各 ≤60 code point，數字／標點／空白保留，其餘包括字母、CJK、emoji 一律 x，encodeURIComponent 後用 | 分隔。
- **lang／doclang**：只保留已知兩字母語言碼與常見 script／region；帳號形式字詞、私用／任意 variant 遮成 x；罕見三字母語言碼也保守遮罩。
- **頁面結構**：記標籤、深度、子節點數、所有屬性名，無原文字；文字只記字數。role／data-testid／aria flags 等值須符合短 token 規則（≤32、ASCII enum、不像 uuid／hash）且在各屬性固定 UI 值白名單，其他值 x。敏感屬性（aria-label、title、alt、placeholder、href、src、id、value 等）一律 x。
- **class**：最多 3 個，雜湊 h；只保留已知 X 命名空間 r／css，其他可讀前綴 x，避免帳號字詞混入。
- open shadow 包含文字及元素；同源 iframe 讀子樹；跨源只記 **hostname**（URL 解析排除帳密、埠、路徑、query，這是規格允許的網域例外）。
- 連續同構兄弟 ×N：遮罩後屬性值、子樹與文字長度都相同才折疊；長度不同保留，避免丟掉長度資訊。預處理簽名也限 **6000 走訪節點／深度 60**，超限明示 TRUNCATED；header 的 nodes 是輸出行數。
- 使用者點擊才寫 clipboard；拒絕／同步拋錯有 readonly textarea＋全選，重複失敗只保留一組備援。不加任何權限／網路／儲存。

## 4. 結論

**有條件可行（維持）**。本輪修了已確證的 mounted 語意問題及重掛觸發缺口，補有限重試與隱私防護；本機 fixture 只能支持被測情境。**真機看不到浮層的根因仍未知、真頁未驗證**；需回報新版骨架及診斷。讀法修正等真結構，未猜新選擇器。

## 5. 測試（Codex 複審實跑，結果更新於提交前）

- `npm test`：**64 過／0 敗**。包含原五語系／時間／scope／累加，新增帳號形式 lang／class／enum 遮罩、排除內文數字、iframe 帳密剝除、所有屬性名、不同長度／iframe 子樹不誤折疊、12000 層及 6100 寬 DOM 截斷。
- `npm run verify`：**OK**；8 probe 檔、4 Logo B SVG；24 API bypass、14 icon、9 SVG、15 leak self-test。原規則完全保留；先靜態守門才執行純模組；攻擊頁涵蓋網址、uuid、email、handle、中英日文、帶句子的屬性、短帳號 enum／class、lang、內文數字與 iframe 帳密。新增單元測試故意讓骨架／遮罩／語系／網域洩漏，逐個證明 self-test 會失敗。
- `npm run e2e`：**OK — 214 個斷言；38 個本機 fixture／favicon 請求，擴充 0 請求**。真 Chrome for Testing、本機 HTTPS fixture＋host-resolver，所有選擇器失效仍 mounted=1、0 則＋遮罩樣本；host／body 移除重掛、反覆移除限速後由輪詢恢復、display:none mounted=0 再恢復；骨架 clipboard／textarea 全選；原語系、虛擬化、SPA、lifecycle 皆保留，維持擴充 0 請求。
- 假資料截圖 **「依公開來源重建，非真頁快照」**：`docs/gate0.1-{en,ja,zh-Hans,zh-Hant,ko,roles-fallback,empty,not-scheduled,selectors-broken,skeleton-copied,skeleton-fallback,virtual-before,virtual-after}.png`；範例骨架 `docs/gate0.1-skeleton-sample.txt`。**所有舊 docs/gate0-*.png 保留不覆蓋。**

## 6. 老闆實測（≤5 步）

1. Chrome 開 chrome://extensions，開開發者模式，載入 probe/ 或重新載入既有擴充，確認版本 **0.0.2**。
2. 在自己的登入 Chrome 開 https://x.com/compose/post/unsent/scheduled。
3. 右下應有「讀到 N 則」浮層；0 則也應有診斷。
4. 在 Scheduled 頁按一下「**複製頁面結構**」，**立即貼到回覆草稿**；再按「**複製診斷**」，把新的診斷貼在同一份草稿後面（避免剪貼簿覆蓋骨架）。被拒時用 textarea 全選後手動複製。
5. 把骨架和新的診斷**一起貼回來**；若仍無浮層，貼 chrome://extensions 的擴充錯誤（有無紅色錯誤按鈕）。

## 7. 仍未解決

- **真頁未驗證**，選擇器及陌生時間格式維持原規則，等老闆回報骨架。
- 短 enum／class／語系採保守白名單，未知項會遮罩，可能減少診斷細節；無安全獨立時間標籤時 samples=none。
- mounted 是連線＋布局，不是「確實看得見」；持續移除時會等重試窗口，不能保證浮層永遠留住。
- 骨架保留標籤及屬性**名稱**（規格要求），不保留內容值；跨源 hostname 是明確允許例外。closed shadow／跨源內容無法走訪；大頁會截斷。

---

# 閘 0.2：Dagaz 快捷鈕與讀法結構整理（probe v0.0.3）

2026-10-09，Codex 寫碼 session；分支 `gate0.2/shortcut-button`，基準 `d875959`。**實作完成，待外部 Chrome e2e／截圖與另一 Codex session 複審，未達 READY。**

## 做了什麼與 DOM 依據

- 44px 圓形 Dagaz 快捷鈕取代非 Scheduled 膠囊；SVG 用 createElementNS／path 建立，幾何來自 `docs/xsched-logo-B.svg`，不載入圖檔、不加 web_accessible_resources。Scheduled 顯示則數角標，預設展開；首頁預設收合。第一次點擊後保留手動開關狀態，跨 SPA／host 重掛也保留；頁面重新整理才重設。
- 浮層與所有可見 UI 都在 open shadow root。非 Scheduled 浮層提供九語「前往 Scheduled」按鈕，固定 `location.assign("https://x.com/compose/post/unsent/scheduled")`；這是使用者點擊的頁面導覽。既有守門禁止 href 寫入，所以不用 anchor，不放寬資源 sink 規則。測試檢查固定目標及實際導覽，截圖名稱仍為 home-open-goto-link。
- 九語 aria-label／title 集中 `probe/ui.js` 的 STRINGS：zh-Hant／zh-Hans／en／ja／ko／es／fr／de／pt。優先用 documentElement.lang（X 頁面語系），不支援時用 navigator.language，再預設 en；zh-TW／HK／MO→Hant，zh-CN／SG→Hans。
- reader 的 `READ_CONFIG` 集中原選擇器、Scheduled 標籤、路徑與 strict／loose 時間格式，註明來源與推測。**沒有新的列表選擇器、沒有修讀法**；DOM 依據仍是閘 0 §1–2，真頁未驗證。`fixtures/real/README.md` 說明遮罩骨架重建流程；測試自動發現 `.html` 並要求同名 `.json` 預期，空目錄跳過。
- 0.0.3 同步 manifest、package／lockfile、reader 與 skeleton 版本常數。無新增權限、API／伺服器、儲存或背景發文；不用 CDN／資源圖檔；未登入真 X，花費 $0。

## 位置策略與依據

預設 right 16px／bottom 112px，44px 按鈕上方 12px 展開浮層（panel bottom 56px），空白 host 區不接收 pointer events。根據可見原生互動元素的 fixed／sticky 祖先矩形避讓，先往上、再往左搜尋，保留 8px 間距；較高浮層找不到位置時縮成可捲動短面板。resize、頁面 mutation／scroll、400ms 輪詢重新計算，因此 FAB 抬高或抽屜展开可再移位。

**依據是本輪設計與本機模擬，不是真頁量測。** `fixtures/en.html`／`home.html` 加入左側 Post、窄版右下 FAB 與 Messages/Grok 假控制項，Post/FAB testid 是任務提供的例子；它們不加入 reader 設定。e2e 以 1100×820、390×820、600×820 驗證開／關狀態不重疊、elementFromPoint 命中與實際點擊到原生發文鈕；再測較高的假抽屜。這些 Chrome 幾何情境因沙箱限制**尚未實跑**。

## 版本與舊快取偵測

診斷第一行正常為 `xsched probe v0.0.3 (manifest 0.0.3)`，浮層頂部也顯示。只允許短數字 manifest version，不輸出任意值／例外文字。script 與 manifest 不同時明顯印 `⚠ 版本不符：script 0.0.3 / manifest 0.0.2，請重新整理頁面`；runtime id 失效或 getManifest 拋錯時顯示 `擴充已重新載入，請重新整理頁面`，400ms 輪詢可更新狀態。

content.js 改 IIFE，避免與 0.0.2 的頂層 const 衝突；新 session 提供 dispose 清理自己的 observer／timer／事件。0.0.2 沒有 dispose，直接移除 host 會引起它重掛，因此接手時把舊 host 移到 inert／aria-hidden／display:none 的 shadow 停放容器，移除舊 ID但保留連線，讓舊輪詢不搶新 UI；直到頁面重新整理才完全清除舊 script。新版 host 用 data-xsched-version 辨識；仍沿用 60ms 節流、每 3 秒最多 3 次建立、400ms 輪詢恢復與 mounted／remounts 的原語意。

## 實跑結果與環境限制

- `npm test`：退出 0，沙箱 reporter 只顯示 **7 個測試檔通過／0 失敗**，未輸出子測試事件。再用 `node --test --test-isolation=none test/` 在同程序實跑：**73 項，72 過／0 敗／1 跳過**；跳過僅是尚無真骨架的 fixture。包括真 content.js DOM 的開關／SPA／重掛／固定導覽（dataset 篡改仍用常數）／runtime 警告／重複注入；幾何命中仍需 e2e。
- CLI 測試子程序的 pipe 被沙箱拒絕 EPERM，改成暫存檔擷取 stdout／stderr；所有退出碼、錯誤字串、實際守門違規斷言保留，且 spawn error 會直接失敗，不跳過。
- reader 對照基準 `d875959`：10 個現有 fixture × 6 條路徑，**60 組快照 JSON 完全一致**（只省略 DOM scope 節點實體）；包括每列 time、preview、key、at、tier、samples、所有計數。
- `npm run verify`：退出 0，**9 probe 檔／4 Logo SVG，30 API bypass／14 icon／9 SVG／15 leak 自測全過**。原规则全保留；新增 namespace 資源屬性、markup parsing、非固定 Scheduled 導覽守門。
- `npm run e2e`：退出 **1**，本機 HTTPS server 尚未啟動就拋 `Error: listen EPERM: operation not permitted 127.0.0.1`（scripts/e2e.mjs 的 fixture server failed）；**0 個浏览器斷言、0 個網路證據結果、0 張新截圖**。Chrome for Testing 預設執行檔與 xvfb-run 都存在。外部請跑原命令；不得把規劃的情境當成通過。
- e2e 保留原語系／scope／虚擬化／lifecycle／clipboard 檢查；新增本輪情境、兩種版本警告、讀基準 commit 真 0.0.2 scripts 在另一 isolated world 執行後接手。網路證據只另記一次物理點擊觸發的固定頂層導覽；其他 extension resource／background 請求仍要求 0，並拒絕相同 URL 的 Fetch 或非頂層導覽。
- `git diff --check` 通過。git commit 嘗試失敗：`Unable to create '/workspace/xsched/.git/index.lock': Read-only file system`，**本 session 未能 commit；外部另建立 WIP 快照 b3a1684，仍有最後修正未提交**。未 push／PR／merge／改 main／打包 zip。

預定由 e2e 產生（**尚不存在，不是已交截圖**）：
`docs/gate0.2-{scheduled-open,scheduled-closed,home-closed,home-open-goto-link,narrow-fab,remount,diag-version,version-mismatch,runtime-invalidated,en,ja,zh-Hans,zh-Hant,ko,roles-fallback,empty,selectors-broken,skeleton-copied,skeleton-fallback,virtual-before,virtual-after,not-scheduled}.png`，另 `docs/gate0.2-skeleton-sample.txt`。資料全是 fixture 假資料；所有 gate0／gate0.1 舊圖與舊骨架保留不動。

## 老闆實測（≤5 步；合 main 後）

1. `git pull main`。
2. 自己的 Chrome 開 `chrome://extensions`，重新載入 `probe/`，確認版本 **0.0.3**。
3. **重新整理 x.com 頁面**，確認右下抬高處有 Dagaz 快捷鈕。
4. 點快捷鈕開／關浮層；非 Scheduled 按「前往 Scheduled」，確認原生 Post／窄版 FAB／抽屜仍能點。
5. 在 Scheduled 頁按「複製頁面結構」並立即貼到回覆草稿，再按「複製診斷」貼在同份草稿，**兩者一起貼回**（clipboard 被拒時用 textarea 全選）。

## 已知限制與下一份證據

- **真頁未驗證，讀法仍可能 0 命中**；不能從假 fixture 推定真 X 可行。需老闆貼新版骨架＋診斷，附 X 語系、可見排程列數與是否已自己捲到底；時間原文被遮罩，要修時間格式還需單獨去內容的時間文案，不能猜回。
- Chrome e2e／幾何避讓／網路證據／真 0.0.2 接手情境待外部實跑，另一 Codex session 尚未複審。
- 位置策略是 DOM 矩形啟發式；全螢幕覆蓋、closed shadow／不可辨識原生控制項、極小視窗或沒有可容納面板的空間仍可能找不到位置。未宣稱排除所有真頁遮擋；此時需回報畫面與語系。
- 接手不能停止 0.0.2 的舊 observer；隱藏但連線直到刷新。僅舊 0.0.2 script 還在頁面、未注入新版時，舊程式本身不能產生新版警告，必須重新整理。
- mounted 仍只表示 host 連線且有尺寸，不能證明未被別的堆疊脈絡蓋住；重試仍有窗口限制。九語只保證快捷鈕與前往 Scheduled 的 label／title，探針其他文案保持原繁中。
- 原虛擬列表累加、同時間同本文去重、scope 內刪除／編輯與骨架截斷限制沿用閘 0.1；必須老闆自己捲動，擴充不自動捲、不操作發文。
