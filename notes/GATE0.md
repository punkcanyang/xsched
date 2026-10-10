# 閘 0：可行性（Scheduled 列表讀取）

最新階段見本檔末尾「閘 0.3」；之前各節保留歷史驗收與複審紀錄。

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

# 閘 0.2：Dagaz 快捷鈕與讀法結構整理（probe v0.0.3；首輪交付歷史）

以下保留首輪沙箱交付紀錄；外部後續已提交並回報首輪 e2e 305 斷言通過。最新真骨架／時間工作與驗收缺口見後面的「閘 0.2 真頁骨架分析」。

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

---

# 閘 0.2 真頁骨架分析（續作：2026-10-10）

**結論：則數依骨架可讀、時間格式待老闆診斷確認。** 本輪修改依老闆新增 A–D 驗收範圍；未宣稱安排時間已在真頁驗證，也尚未達到時間硬標準。先前「不猜新選擇器」的限制已由收到骨架與本輪明確授權取代；新 DOM 選擇器只使用下面有行號的結構。

## 收到的資料與列表位置

來源：`/workspace/xsched-shots/boss-skeleton-0.0.2-2026-10-09.txt`；340748 bytes、4110 行，首行 `xsched-skeleton v0.0.2 path=scheduled nodes=4109`。沒有附診斷。原始骨架留在 repo 外，本輪不提交。SHA-256：`402375daac852d2b2ebee4bcf0702499a1ad8c0fb4ab4e2f980292399cbfa52e`。

以下是對收到檔案實際逐行讀取的結構事實；不是登入 X 的量測。

| 行號 | 結構／路徑 | 可以支持的判斷 |
|---|---|---|
| 36 | `div[role=dialog]` 外層 | 包住 modal 的外殼。不能直接當列表 scope，舊 readable 規則會排除裡面另一個 dialog 的全部列。 |
| 42 | 外層 dialog → group → `div[role=dialog][aria-modal=true]` | 實際可見 modal scope；列表與兩個頁籤都在這個最近 dialog 內。 |
| 84、86、93 | 內層 dialog → nav → tablist → presentation → `a[role=tab]`；86 `aria-selected=false`，93 `aria-selected=true` | 選中 tab 的文字只剩第 97 行 `#text(3)`，名稱／語系未知。URL path=scheduled 是讀取條件，不能自行補出某個真 tab 文案。 |
| 107–108 | 內層 dialog 的列表分支 → `div → button[role=button][type=button]` | **唯一一顆含 tweetText 的列表 button，沒有 ×N 收合標記，應為 1 則當時 DOM 可見排程列**。這不是整個帳號的完整排程總數。 |
| 109–118 | button → div → div 的第一分支 → div → div → `div[dir=ltr]`，內有 SVG 與 `span → #text(28)` | **安排時間候選在第 117 行 span、第 118 行文字**；獨立於本文，與時間 icon 並列。真文字全部遮掉，28 只表示 code point 長度。 |
| 119–124 | 同一 row 的第二分支 → div → div → `div[data-testid=tweetText] → span → #text(2)` | 獨立本文。時間樣本、fmt 與骨架日曆文字匯出都排除這個子樹，內容全是假字替代。 |
| 126 | modal 分支的兄弟 `div[aria-hidden=true]` | 下層首頁背景，包含四周導覽、timeline、article。不能把其貼文當排程。 |
| 507、520 | 背景 tablist 的兩個 tab | 與 86／93 的 modal tabs 不同；讀法優先限定目前 modal 內的 tab。 |
| 539 起 | 21 個 `cellInnerDiv`；542 起 14 個 article；122 以外的 14 個 tweetText 都在背景 | 21 不是排程則數，cell 是通用 timeline 容器。上層排程沒有 cellInnerDiv。 |
| 627、823、998、1173、1348、1825、2003、2178、2357、2534、2629、2783、2960、3146、3323 | 背景 article／引用分支中的 `time[datetime=x]` | 本次對檔案逐行計得 **15 個 time**（含引用分支），全在背景；不能拿 datetime=x 推安排時間。上層 modal 裡 **0 個 time／datetime**。 |

排程 row 的 button 第 108 行**沒有 aria-label 属性**；第 117 行 span 也沒有日期相關屬性，只有長度 28 的文字。因而真正時間來源是「推定為安排時間的獨立文字 span」，不能聲稱讀 datetime 或從 aria-label 找到真日期。原始值／語系／時區都無法由此骨架復原。

## 讀法與舊行為保留

`READ_CONFIG` 集中新增：`[role=dialog][aria-modal=true]`、已選中 tab、`button[role=button]`、`span`、`article/[role=article]`，註解對應上表行號。未知 tab 名稱時依 Scheduled path 尋找含 selected tab 的最近可見 modal；已知 tab／aria-controls、舊 cell→a11y→文字層仍保留。

真結構 row 使用 **HTML button＋tweetText＋獨立 span**；只從不在 tweetText／composer／article 子樹的短 span 讀時間。不讀背景 `time[datetime]`，也沒有猜新 testid。即使時間無法解析，這種已證據支持的 row 仍計入則數，`unparsed=1`／`timeFail` 明示，浮層時間列顯示「時間未解析」。多個非本文 span 無法唯一決定時間時保守標未解析。

背景 `article` 不只在祖先排除，也擋住包 article 的 cell／聚合節點，避免 fallback 在 modal 消失／背景可見的 SPA 暫態把 timeline 文字洗成排程。測試包含取消背景 aria-hidden、背景放假的 Scheduled tab、article 本文刻意含完整排程片語，仍只有 modal 的 1 則；沒有 modal 的 column/body fallback 也不會算 article。

本輪對 `e607b5d` 的舊 10 個 fixture × 6 路徑，**60 組快照的則數、所有舊計數、各列 time／preview／key／at／tier 全部一致**；比較只省略 DOM 節點實體，以及任務明定要改的 samples／新增 fmt。沒有用新格式規則把舊 selectors-broken 的假 ISO/UTC 時間猜成正確。

## 時間、跨年與樣本

- 保留 legacy strict／loose 解析；新增具體合成例子支援 en／zh-Hant／zh-Hans／ja／ko 的有／無年份、AM/PM／午前午後／上午下午／오전오후、24 小時制與中文時／點。**這些文案是測試例子，不是從骨架解密出來的真 X 文案**。其餘四語已有日曆詞遮罩與快捷鈕文字，尚未聲稱有安排時間解析支援。
- 12:05 AM／上午12:05→00:05；PM／下午12:05→12:05；中文上午12點／下午12點→00:00／12:00。非法 meridiem 小時、分鐘／秒溢出、非法日期與 DST 空洞不猜 Date。
- 無年份以瀏覽器本地日期的今年為起點；月日已過則下一年。相同日的較早小時不跳一年。按目前列表順序，後列無年份用前列已解析日期當 reference，12/31→1/1 推到隔年；顯式年份保留原值。這依賴 Scheduled 列表日期按順序的假設；需老闆逐則對照，未知年份格式仍不能當已驗證。
- 浮層改顯示 `YYYY-MM-DD HH:mm (weekday)`，星期由本地 Date 算，不照抄文案。例如假的 `Fri, Oct 10, 2026` 實際是 Sat；reader 原 time 字串保留，UI 星期正確計算。重畫判斷也比較解析後時間，避免無年份文字不變但推定年份更新時仍顯示舊日期。
- `samples=` 仍最多 3 筆、各 ≤60 code points、percent encoding。全部成功時仍加 `fmt=`（第一則時間樣本）；失敗列也有 samples。會先提取時間短語，不把跟在時間後面的本文數字／網址帶進遮罩。
- 共用 `maskSample` 精确日曆詞白名單：英／西／法／德／葡月份星期、AM/PM，繁簡日韓的日曆詞／上午下午／午前午後／오전오후／排程片語。字詞邊界完整才保留，任意字變 x；URL／email／handle／UUID 先整段變 x（包括敏感 span 中的數字），避免 `@May2026`、`May@January.example` 被白名單保留下來。未知格式樣本仍要求有界的日期＋時鐘，不接受排程片語後混入任意本文數字。
- skeleton 0.0.3 在已隔離的短時間 span 用 `#text(N) calendar=<encoded masked sample>`；其他仍只印長度，尤其 tweetText 即使寫成完整日期、數字或排程片語也不能匯出。若無法安全提取／分離時間，fmt/samples 保守為 none。
- verify 所有原網路／注入／權限規則不變；原網址、ID、屬性、內文與 iframe 隱私攻擊全保留。依本輪授權調整「純日曆詞」的預期，新增短時間節點／fmt 匯出攻擊，證明 calendar-looking 的內文、handle、email、URL 仍不洩漏。

## fixture、轉換與提交前隱私掃描

`fixtures/real/boss-skeleton.html`／同名 JSON：保留 L36–124 的元素層級與安全 role／aria enum，未知 tab 文字替換成同長度假字；未知時間明寫假的「將於2026年10月10日 上午9:00傳送」，zh-Hant 也是推定。假本文甲乙；背景精簡成一則假 article/time。應讀 **1** 則、09:00、timeFail=0；只驗證這個合成時間例子。

`fixtures/real/cross-year.html`／JSON：僅為時間測試複製 row 成兩則，12/31 下午11:59→次年1/1 上午12:05，now 固定 2026-12-31 12:00；預期 2026-12-31 23:59、2027-01-01 00:05。這 2 則是人工情境，不能用來推真骨架有 2 則。

`scripts/real-skeleton-fixture.mjs` 從骨架只取元素階層與固定 enum；不複製原 id/class/style/href/src/aria-label／未知屬性值／任何原文字。SVG 保留空結構，不保留幾何屬性。所有文字／日期替代值都是腳本明寫的假值。轉換時確認原 header、modal、row 行號與 1 列符合證據；不符合即失敗。

**已實跑掃描**：腳本 `scanFixture` 對輸出拒絕 `http(s)://`、www、email、@handle、UUID；用 DOM 檢查屬性只能是固定 enum／lang／charset／合成 datetime。單元測試再要求輸出中沒有 id／href／src／aria-label，並確認雙 dialog／row 数；real JSON 時間 provenance 明列推定。原始 340KB 檔案未複製／提交，repo 只有約 2KB 的合成精簡 fixture、預期 JSON 與轉換腳本。

## 測試與外部續跑

外部已提交首輪 `722c83f`／`e607b5d`，使用者回報首輪 Chrome e2e **305 斷言通過**、截圖已提交。本輪續作又由外部建立 WIP `5da24dd`；此 WIP 不包含最後所有修改，不能直接當完成。

本輪最新實跑：

- `npm test`：退出 0，沙箱只回報 **8 檔通過**；完整同程序 `node --test --test-isolation=none test/`：**102 過／0 敗／0 跳過**，包含 25 個日曆／真結構／隱私測試、實際 content.js 標準時間／未解析顯示、兩個 real fixtures。
- `npm run verify`：退出 0；**9 probe 檔／4 Logo SVG；30 API bypass／14 icon／9 SVG／25 leak self-test**，原靜態守門未放寬。
- `git diff --check`：通過。既有 fixture 60 組基準比較如上。
- 最新 `npm run e2e` 本沙箱仍退出 1：`listen EPERM: operation not permitted 127.0.0.1`。本輪新浏览器情境 **未實跑**，新增 real／跨年截图尚未產生，不能沿用首輪 305 宣稱本輪通過。

外部請在最後工作樹跑：`npm test`、`npm run verify`、`npm run e2e`。新增 e2e 驗證真骨架 1 列、統一時間／timeFail=0／fmt、背景可見不混入、未知時間仍計數與 samples、固定假時鐘的跨年 2 列；新增截圖 `docs/gate0.2-real-skeleton.png`、`docs/gate0.2-real-time-unparsed.png`、`docs/gate0.2-cross-year.png`。保留舊 e2e 情境與網路證據：資源／背景請求必須 0，只有使用者物理點擊前往 Scheduled 的一次頂層導覽例外。新截图只能是這些假的 fixture。

無新增權限／host／資源載入／網路呼叫／儲存／花費，未登入 X。manifest／package／程式仍 **0.0.3**，因此老闆必須 reload 擴充後刷新 x.com，避免同版號舊 script 仍留在頁面。commit／push／PR／外部 e2e 由使用者安排；本沙箱 .git 唯讀。

## 老闆實測（≤5 步；合 main 後）

1. `git pull main`，取得最新 probe 檔。
2. 自己的 Chrome 開 `chrome://extensions`，重新載入 `probe/`，確認 **0.0.3**。
3. **重新整理 x.com**，看右下抬高處的 Dagaz 快捷鈕。
4. 到 Scheduled，對照浮層與 X 頁面的**則數**；再**逐則對照日期＋時分**（有上午／下午也要對照，自己捲過才是完整列表）。
5. 按「複製診斷」，立即貼到回覆草稿；再按「複製頁面結構」貼在同份草稿，一起貼回，附 X 語系。有 textarea 時全選手動複製。

## 還缺什麼與可直接轉給老闆的請求

仍缺 **0.0.3 的診斷／fmt／samples**，以及可以支持真日期文案與語系的新版骨架。0.0.2 的 #text(28) 無法確認月份、年份、上午／下午或時分，因此不能宣稱時間硬標準已過。也缺本輪外部 e2e 結果與另一 Codex session 複審。

> 請拉最新 main，在 chrome://extensions 重新載入 probe/ 確認 0.0.3，接著重新整理你的 x.com Scheduled 頁。先逐則對照浮層的日期＋時分是否和 X 一樣；按「複製診斷」立即貼到回覆草稿，再按「複製頁面結構」貼在後面，把兩份一起貼回，並說明 X 的語系。需要診斷中含 fmt=／samples= 的整行；若它們都是 none，請另外只貼一則 X 顯示的安排時間短句（保留日期／時分／上午下午，不貼本文、帳號或完整網址）。

保留限制：只讀當時 DOM／自己捲過的列；無唯一 ID 的同時間同本文仍可能去重；同 scope 刪除／編輯的虛擬窗口累加不能當即時權威總數。article 安全排除亦可能漏掉未來改版把真正排程放進 article 的布局；新骨架來了再據證據修。五語系合成例子已過，其他語系時間格式尚未承諾；本地時區與無年份的列表順序假設都需真機逐則核對。

---

# 閘 0.2 Codex 複審

2026-10-10；獨立 Codex 複審 session，與寫碼 session `01a1212e` 不同。審查 [PR #5](https://github.com/punkcanyang/xsched/pull/5) 的 `git diff d875959...HEAD`，接續到 `9545dc7`。本節是最新複審結果；前面的首輪測試與「尚未複審」描述保留為歷史。原骨架只在 repo 外親讀，沒有複製或提交。

## 發現與修正

| 嚴重度 | 檔案 | 問題與修正 |
|---|---|---|
| 高：隱私 | `probe/reader.js` | 日期先從 URL／email／handle 抽出會失去敏感來源，繞過整段遮罩。改為先遮罩完整身份字串再解析／提取；包含中日韓日期、protocol-relative URL、帶空格的引號 email。結構列仍保留則數，敏感時間標為未解析，fmt／samples／calendar 不匯出。 |
| 高：隱私 | `probe/reader.js` | 舊 cell／文字備援的 item.time 可能來自像日期的 tweetText。移除 fmt／samples 對 item.time 的後備匯出，只接受認證的獨立時間節點；失敗樣本也必須符合隔離檢查。舊讀取則數規則保留。 |
| 中：使用者觸發 | `probe/content.js` | 固定導覽原先接受頁面合成 click；改為 event.isTrusted 才執行固定 Scheduled location.assign，並停止冒泡。單元及 Chrome 測試加入合成點擊不得導覽；真物理點擊仍須導覽。 |
| 低：可讀性 | `probe/reader.js` | fmt 的 percent encoding 不便老闆核對；改為獨立第三行的可讀遮罩字串，先正規化空白，仍最多 60 code points。samples 保留既有 encoded token／pipe 格式，避免樣本中的空白與標點混淆欄位。 |
| 中：測試失敗 | `scripts/e2e.mjs` | 上一輪 fmt 換行後漏更新 samples 的解析；舊 `[^ ]*` 把下一行 fmt 吃進最後一筆。改成遇任何空白即停止，實際解析式以 selectors-broken 真 reader 輸出驗證 LF／CRLF 均只取到兩筆時間樣本。核對了版本首行、clipboard 三行格式、fmt、未知時間與跨年等其餘診斷斷言。 |

前三項與 fmt 修正已由使用者外部提交為 `1f784f7`，另含單元回歸與 verify 攻擊自測；本次續作只改 `scripts/e2e.mjs` 與本文件，commit／e2e 由外部執行。

## 完整核對結果

- **親讀骨架** L36／L42／L93／L108／L117／L122，支持最近 modal、選中 tab、唯一 button＋獨立 span＋tweetText；L126 起背景與 article/time 必須排除。`aria-current=page` 是沿用備援，不是本骨架證據；真時間格式、語系、時區仍未知，沒有據遮罩長度猜回文字。
- **實跑離線重建**：原檔 340748 bytes，SHA-256 與上述記錄一致；兩份 real HTML 均與轉換腳本逐字輸出一致且隱私掃描通過。HTML／JSON 清楚標示全部時間／本文是假值；跨年第二列是合成情境。檢視既有真結構與窄版假資料截圖，沒有將其當真頁驗證。
- **程式與測試核對**：manifest 只升版／加入本機 ui.js，無新增權限／host／action／web_accessible_resources；UI 在 shadow root，以 DOM／CSSOM／textContent 建立；不載入圖檔，不新增請求／儲存／背景操作。verify 原 API／注入／權限規則均保留；日曆詞例外依本輪明確規格，本文／身份資料的攻擊仍須失敗，新增先抽日期繞過及舊備援來源攻擊。
- **快捷鈕與生命週期**：九語、手動開關跨 SPA／重掛、60ms 節流、3 秒最多 3 次建立、400ms 恢復輪詢、dispose／pagehide 清理均核對；舊 0.0.2 採隱藏連線停放，不能宣稱已停止其 observer。矩形避讓及版本警告有單元／Chrome 情境；真頁避讓仍為啟發式，滿版覆蓋／極小視窗可能無處放置。
- **時間與背景**：五語合成例子、12 AM/PM／上午下午／午前午後／오전오후、24h、非法日期／DST 空洞、無年份與 12/31→1/1、標準時間重畫、未知列保留、背景可見仍排除均有通過的單元斷言。無年份推年依賴本地日期與列表順序；虛擬累加／同時間同本文去重限制保留，不能當即時權威總數。

## 實跑結果與外部續跑

- `npm test`：退出 0，8 個測試檔全部通過；補充同程序 reporter：**105 過／0 敗／0 跳過**。
- `npm run verify`：退出 0；**9 probe 檔、4 Logo SVG；30 API bypass、14 icon、9 SVG、32 leak self-test** 全過。故意洩漏的變體會令 self-test 失敗。
- `node --check scripts/e2e.mjs`、`git diff --check` 通過；實際 e2e 樣本解析式的 LF／CRLF 離線回歸通過。
- **外部回報，非本 session 實跑**：`793e370` 的 Chrome e2e 322 斷言通過；`1f784f7` 的 test 105／verify 32 通過，但 e2e 在上述 samples 換行解析處失敗。不能將先前 322 沿用為本次通過；本沙箱 listen 被擋，最新 Chrome 斷言與 0 請求證據仍待外部重跑。

外部請在含本次修正的工作樹跑 `npm test`、`npm run verify`、`npm run e2e` 全過再提交／合併。e2e 應保留所有隱私與網路斷言，更新 gate0.2 假資料截圖（含可讀 fmt）；資源／背景請求仍必須 0，只接受一次可信使用者點擊的固定頂層導覽。不得改連真 X 或用 API 驗證。

## 結論與老闆實測

**VERDICT: APPROVE（程式複審；合併前仍須外部最新 e2e 全過）。** 已修正的阻擋問題有回歸證據，沒有發現其他程式阻擋；這不代表真頁時間驗收或 STATUS READY。產品結論維持：**則數依骨架可讀、時間格式待老闆診斷確認**。

老闆實測沿用上節 **5 步**：取得 main → reload 擴充 → refresh X → Scheduled 逐則對照日期＋時分／則數 → 先複製診斷貼草稿，再在 Scheduled 頁按一下「複製頁面結構」，把結果與新診斷一起貼回（附語系）。fmt 現在可直接讀；samples 仍 encoded，可連同整份診斷貼回，不需老闆手工解碼。兩欄皆 none 時另提供一則不含本文／帳號／網址的安排時間短句。

---

# 閘 0.3：真格式星期修正、浮層捲動／縮小／右下避讓（probe 0.0.4）

2026-10-10，同一 Codex 寫碼 session，分支 `gate0.3/overlay-scroll-avoid`，基準 main `fdc8096`（PR #5、probe 0.0.3），開工提交 `568ff16`。本機實作與單元／守門完成，待外部 Chrome e2e、假資料截圖、另一 session 複審與老闆真機逐則對照，尚未 READY。

## 0.0.3 失敗根因與證據

老闆確認繁中介面與安排時間的結構：L117–118 的單一 span 文字，日曆圖示在旁、含年份、日期後有未加括號的星期、上午／下午在時分之前，後綴發送。**節點選擇已確認正確，不需要猜新列表選擇器。** 這裡只記格式，所有範例日期／本文換成假值，不存老闆真日期時間或真畫面。

用假日期重現：`將於 2026年11月3日 週二 下午11:19 發送`。在 0.0.3 上 `parseSchedule=null`、`timeSample=""`，真骨架重建仍讀 1 則、timeFail=1、fmt 空；直接 `maskSample` 能保留整個日曆短句。去掉 `週二 ` 就能解析成 `2026-11-03 23:19 (Tue)`。

因此根因是 **日期後的未加括號星期不在文法裡**：legacy strict／loose、中文 labelPatterns 只允許括號星期或直接接上午下午／時分；unknown numeric timeSample 的日期→時鐘提取也沒有週／周／星期分支。不是將於／發送片語、不是真時間節點隔離失敗、不屬於上午下午位置或普通空白問題，也不是遮罩順序造成。先遮罩身份再提取的複審隱私修正仍保持。

原浮層已經有 overflow:auto，但操作鈕在一般內容流底部，避讓又可以把整個面板縮到很短，沒有為操作區保留空間。使用者看不到操作鈕，且缺少明顯縮小入口。舊幾何偵測從 button／a／role 等互動候選往上找 fixed 祖先，可能漏掉純 div 的紅點圓形元件；查詢後遍歷亦無上限，clear=false 的最後預設位置仍可能遮到原生元件。這些是程式的風險分析，沒有把真頁圓形元件猜成某個新 testid。

## 修法與 fixture

- `READ_CONFIG.time` 內既有中英文／日韓規則保留；繁簡中文 strict／loose／labelPatterns 與 unknown sample 提取增添有界、非 capturing 的 `週|周|星期`＋一至六／日／天，位置在日期後、上午下午之前，不改既有 parts 索引。普通空白、NBSP、全形冒號與時鐘兩側空白也接受。
- 有年份以明確日期為準。星期與日期不同不崩潰、不令時間失敗；浮層星期從 Date 計算，忽略文案星期，沒有增加包含原文字的診斷。例：假日期 11/3 加週五，仍顯示 Tue。
- 單元覆盖繁簡兩套片語的 1–12 點 × 上午下午（48 組例子）；上午12:19→00:19、下午12:19→12:19。週／周／星期、有無空白、全年份／無年份與跨年例子一起跑。0.0.3 原五語、跨年、隱私與備援回歸都保留。
- `fixtures/real/boss-skeleton.html/.json` 改成「格式由老闆真機樣本確認、日期／本文為假」：`將於 2026年11月3日 週二 下午11:19 發送`，預期 **1 則、2026-11-03 23:19 (Tue)、timeFail=0**。雙 dialog／未知 tab／獨立時間 span／背景 article 結構不變。
- 新增 `boss-skeleton-zh-Hans.html/.json`：`将于 2026年11月3日 周二 下午11:19 发送`，同一假日期与預期。簡中是需求指定的對應變體；不宣稱老闆使用簡中真機測過。
- 轉換腳本仍只取原遮罩骨架安全結構與 enum，文字全部明寫替代；新增 `--zh-Hans`。`cross-year` 的缺年份／第二列仍是合成測試例子，不能把它當真機格式／真頁兩列。
- 原 340KB 骨架留在 repo 外。已重跑轉換／scanFixture，拒絕網址／email／handle／UUID 與非允許屬性；三個 real fixtures 自動配 JSON 驗收。沒有把這次老闆真時間字串存進 repo。

## 浮層、固定操作鈕與安全樣本

整個 panel（含標頭／按鈕）max-height ≤視窗 **60%**，並取 viewport 剩餘空間的較小值；box-sizing:border-box。用 flex column 分成不縮小的 header、min-height:0／overflow:auto 的 `.panel-body`、不縮小的 `.panel-actions`。只有內容列／診斷／textarea 在內部捲動，複製診斷與骨架始終在操作列；非 Scheduled 的前往 Scheduled 也在同列。操作區被避讓後的面板最小高度計算保留，沒有再縮成看不到按鈕的 80px 面板。

標頭有九語「縮小」按鈕，與快捷鈕共用 `collapsed`；縮成只剩 Dagaz，按快捷鈕再展開。手動選擇跨 SPA／host 重掛保留。前往 Scheduled 仍只接受可信使用者點擊、固定 location.assign 目標，沒有 href sink／合成點擊導覽。

每個未解析時間列在「時間未解析」下方顯示 `.sample`：只用 reader 認證的獨立時間樣本，重用 `maskSample`、≤60 code points；不用 item.time、preview／本文當備援。沒有安全樣本則顯示「無可安全匯出的樣本」。網址／email／handle／UUID 先整段遮罩，未知格式拒絕任意本文數字；時間節點後的內文、日期形狀的身份，以及 tweetText 裡的日曆短句都不能匯出。fmt 保持第三行可讀，samples 保持 encoded／最多3筆；所有複審修正保留。

## 右下避讓策略與上限

只用讀取 DOM 與 getComputedStyle／getBoundingClientRect；不 click、不捲 X、不修改 X DOM，不新增任何 X 選擇器或權限。

1. 有限互動查詢取最多 **96** 個候選，補左側 Post／既有 FAB 等。右下 **448×640px** 區域以 32px 步距 elementsFromPoint 取樣（最多 **320** 點，每點最多8個元素），可找到非 button 的圓形 div、徽章父層、DM／Grok 等。所有來源合計最多 **256** 個候選，排除自家 host／停放容器。
2. 每候選最多向上 **12** 層，style cache 全部最多 **768** 節點。只計 fixed／sticky、非 display:none／hidden／collapse／opacity:0、矩形有尺寸且與 viewport 相交者；矩形去重。完整頁面 fixed backdrop 不當成整個右下抽屜，但其互動子元素仍可當障礙。
3. 用快捷鈕＋上方 panel 的保守聯合矩形，保留 **8px** 間距，先向上再向左；候選加入障礙邊緣與有限步距，水平至多64個位置；垂直另含預設／底緣位置，保守上限66個。面板上方／左右保留16px空間。預設仍 right16／bottom112／44px Dagaz。
4. 展開面板放不下時，最多12個步進縮短候選，另試最小高度候選，仍預留固定操作區。仍無空間只露出可避讓的快捷鈕；連快捷鈕都無安全位置就暫時隱藏自家 UI，避免覆蓋已偵測控制項。手動意圖保留，400ms poll／resize／頁面 mutation／scroll 會重試。

這是有界幾何啟發式，不是對所有 X 布局的保證。新增 mock 是假的 DOM／CSS：收合 DM drawer、純 div＋紅點1的圓形、Grok，以及原桌面 Post／窄版 FAB。e2e 在 **1280×600、1100×820、390／600×820** 驗證 panel／shortcut 矩形不重疊、原生鈕 elementFromPoint 嚴格命中與物理點擊；圓形 div 允許命中其徽章子節點。沒有登入 X。

## 版本、公開 repo 衛生與守門

manifest／package／lockfile／reader／skeleton 都 **0.0.4**，診斷與浮層正常首行 `xsched probe v0.0.4 (manifest 0.0.4)`。版本不符／runtime invalidated 與 0.0.2 接手機制保留；老闆仍須 reload 擴充再 refresh 頁面。

指定舊身份誘餌已換成 `@decoy_handle`（需無@時用 decoy_handle）與 `decoy@example.invalid`。全 repo 工作樹（不含 node_modules／.git 歷史）搜尋兩個指定舊字串 **0 命中**；包含 AGENTS／測試／verify／兩份開工卡／HANDOFF 的既有提及。AGENTS 硬規則只替換指定身份，其他硬規則文字不改；另更新測試說明。没有記錄老闆真日期、handle、真頁截圖、token 或對話全文。

verify 原網路 API／資源 sink／HTML 注入／權限／固定導覽規則未放寬，API30／icon14／SVG9 自測不減；洩漏自測由 main 的 **32** 增到 **37**，新增週字樣日期身份3筆與安全 weekday fmt／samples／骨架匯出檢查。舊誘餌替换後的 fragment／故意洩漏 mock 斷言仍能抓到外洩。未新增權限、host、遠端資源／請求、背景工作或儲存；$0，不打包 zip。

## 本機實跑與外部續跑

- `npm test`：退出0，沙箱 reporter **8 檔通過／0 敗**；細項 `node --test --test-isolation=none test/`：**113 過／0 敗／0 跳過**（三個 real fixture 子測試）。
- `npm run verify`：退出0，**9 probe 檔／4 Logo SVG；30 API bypass／14 icon／9 SVG／37 leak self-test**。
- `node --check scripts/e2e.mjs`／`git diff --check`：通過。
- `npm run e2e`：退出1，`fixture server failed: Error: listen EPERM: operation not permitted 127.0.0.1`。Chrome 斷言沒有開始，本輪 **0 張新圖、網路證據待外部**；不能沿用閘0.2的323斷言稱本輪通過。

外部在最後工作樹執行 `npm test`、`npm run verify`、`npm run e2e`，需要明細再跑 `node --test --test-isolation=none test/`。沿用 Chrome for Testing 預設 CHROME_PATH 與 Xvfb。新增 Chrome 情境用30列假資料证明短視窗內部真的可捲，捲到底後固定按鈕仍可命中／物理複製，縮小重掛與展開，DM／Grok／紅點避讓，繁簡1列假日期 timeFail=0，未知時間的樣本不含身份／內文；舊語系／virtual／clipboard／接手全繼續跑。網路證據仍只有那一次可信使用者點擊頂層導覽例外，資源／背景請求要求0。

新圖全部寫 `docs/gate0.3-*.png`，至少 `small-viewport-scroll`、`collapsed`、`avoid-native`、`unparsed-sample`、`real-skeleton-zh-Hant`、`real-skeleton-zh-Hans`；其餘舊情境也改 gate0.3 前綴，另 `docs/gate0.3-skeleton-sample.txt`。gate0／gate0.1／gate0.2 舊图與骨架保留不覆寫。截圖全部是 fixture 假資料；外部複本由使用者安排，本沙箱不寫 repo 外。

.git 唯讀，本寫碼 session 無法提交；commit／push／外部 e2e 由使用者做。另一 session 尚未複審，不開 PR、不改 main。

## 老闆實測（≤5步；合 main 後）

1. `git pull main`。
2. 自己的 Chrome 開 `chrome://extensions`，重新載入 `probe/`，確認 **0.0.4**。
3. **重新整理 x.com**，確認浮層可內部捲、可按縮小再用 Dagaz 展開，沒蓋到 X 右下原生元件。
4. 到 Scheduled，逐則對照浮層日期＋時分與 X 顯示的時間；數字只代表當時 DOM／自己捲過的列。
5. 截圖浮層（解析失敗時包含時間樣本），按「複製診斷」貼回；clipboard 被拒時用固定「全選」手動複製。真機回報不提交 repo。

## 已知限制／待確認

繁中格式已由真機回報確認、假日期解析已通過；0.0.4 尚未在老闆 Chrome 逐則實測。簡中是對應變體而非真機驗收。另四語時間格式仍未承諾；時區跟瀏覽器，無年份按今天／列表順序推年，虛擬累加與同時間同本文去重限制沿用。

右下取樣有有限區域／步距／候選上限；極小控制項、區域外的純 div、超深層 fixed、closed shadow、全頁遮擋或極小視窗可能不可辨識／無空間。已偵測無空間時縮成快捷鈕或暫藏，不為顯示操作區而覆蓋原生矩形；空間恢復會重試。陰影本身不計入矩形，實際堆疊／縮放／真 X 抽屜仍需真機與外部 Chrome 核對。縮小與重掛保留手動狀態，刷新會重設。

## 閘0.3 外部 remount 失敗續修（2026-10-10）

外部 `6e9cecf` 的 test113／verify37通過；Chrome e2e 在原681行隱藏host後 mounted 應為0處逾時，後續情境與最終網路證據未跑完。根因是避讓 `positionUI()` 在每次poll先寫 `display:block !important`，結尾可放置時又寫一次block，於是覆蓋外部 `display:none !important`。可見性函式仍測host的連接／矩形，沒有誤測快捷鈕。

修正不再由避讓覆写host display；無空間暫藏改為 `visibility:hidden`，仍可量矩形並在空間恢復時重試。`hostMounted()` 保留原連接與兩维非零檢查，另拒絕 computed display:none／visibility:hidden或collapse，讓診斷反映實際host顯示狀態。外部隱藏經poll與完整重畫仍mounted=0，外部恢复block才回1；避讓暫藏與自動恢复不丟手動展開意圖，也不取消外部display隱藏。

新增2項 content 回歸與reader可見性斷言；e2e原0→1等待不改，另要求computed display仍none、診斷mounted=0。檢查後續骨架複製／textarea、virtual、SPA、mutations、composer、lifecycle、首頁／非Scheduled及network，無明顯需改的舊幾何假設；固定操作區與既有gate0.3幾何測試保留。

本輪 `npm test` 8檔通過，細項 **115/115、0敗、0跳過**；verify **30 API bypass／14 icon／9 SVG／37 leak** 全過；e2e語法與diff檢查通過。Chrome因既有沙箱listen限制仍待外部在最新工作樹跑 `npm test` → `npm run verify` → `npm run e2e`，本輪不宣稱e2e／0請求驗收通過。外部失敗途中產生的24張gate0.3圖保留未動，完整圖片／網路證據需重跑。版本0.0.4不變，沒有改讀法、verify守門或權限；尚未READY。

---

# 閘 0.3 Codex 複審

2026-10-10，接續同一獨立 Codex 複審 session（與寫碼 session `01a1212e` 不同）。已讀 AGENTS／ROADMAP／開工卡／競品／HANDOFF 與本文件閘0.3節，第一輪審查 `git diff fdc8096...65052dd` 全部改動。以下第一輪結果保留為歷史；最新判定與交付以本節末「本輪續審（b6c8a1a＋工作樹修正）」為準。

## 發現與修正

| 嚴重度 | 檔案 | 發現與修正 |
|---|---|---|
| 高：讀法正確性 | `probe/reader.js` | 舊 cell／role／文字備援仍對整列 textContent 解析：時間標籤未知時，tweetText 內的日曆短句可被誤算為安排時間。已重現並修正為只讀 tweetText 外的文字節點；本文內的 role／aria-label 也不得成為 metadata。保留原選擇器、外部時間標籤及本文預覽／去重鍵；骨架已支持的 button 未解析列仍保留則數。timeFail 不再把本文年份當格式漂移。 |
| 低：文件精確度 | 本文件避讓上限 | 垂直候選在64個有界位置之外另有預設／底緣位置；縮短迴圈外另試一次最小高度。文件已改為相應保守上限，程式仍有限，不改避讓算法。 |

`test/calendar.test.mjs` 新增兩項回歸，覆蓋 cell／listitem／button role／文字備援、本文 role／aria-label、外部午夜標籤與另一個日期形狀的本文。`scripts/verify.mjs` 新增本文不能成為 metadata 的攻擊，自測37→38，原所有 API／注入／權限與洩漏斷言保留。`scripts/e2e.mjs` 新增真 content script 的同類 cell 情境：只保留第二則有正確外部時間的列，第一則本文日期不能變成時間或診斷。

## 逐項核對

- **時間**：繁簡週／周／星期及空白變體、48組上午／下午1–12點、午夜／中午、星期不符以日期為準、原五語與跨年全部通過。確認格式來自使用者真機回報；本 session 沒有登入 X 或重讀真頁。三份 real HTML 均與原骨架離線轉換結果逐字相同，隱私掃描通過；日期與本文為假，簡中明列對應變體，無年份／第二列明列合成情境。
- **舊讀法比較**：10個舊 fixture×6路徑共60組，與 `fdc8096` 的則數、各列時間／preview／key、層級及其他計數無差異；只有刻意把 home fixture 放在 Scheduled 路徑的案例，移除本文年份的兩個假 timeFail，empty 因而0→1。沒有把這項安全修正宣稱為完整 JSON 零差異。
- **浮層**：panel≤60vh，header／actions不縮小，body min-height:0＋overflow:auto；縮小與快捷鈕共用手動狀態，SPA／重掛保留。檢視已提交的短視窗捲動與未解析樣本假資料截圖，固定操作鈕可見；Chrome hit-test／物理點擊仍以外部實跑為證。沒有修改 X DOM、click 或自動捲動。
- **避讓／mounted**：候選256、style768、點320、祖先12層及有限位置／縮短候選均有界；observer不監看shadow內部，host自身變動排除，重掛限速仍保留。無空間時暫藏自家 UI並重試；65052dd 的修正不覆寫外部 display:none，mounted 檢查 host連線、尺寸與display／visibility，相關真 content 回歸已過。避讓仍是有限區域幾何啟發式，不保證辨識所有真頁控制項或堆疊遮擋。
- **隱私／硬規則**：遮罩樣本只取認證隔離時間節點，不取 item.time／本文備援；URL／email／handle／UUID先整段遮罩，未知格式拒絕任意本文數字。lang／doclang、骨架enum／class／iframe及診斷的舊攻擊保留。指定舊身份字串工作樹0命中（掃描含隱藏檔、排除node_modules／.git歷史）；常見token／私鑰格式掃描亦0命中。manifest僅升版，無新權限／host／資源公開；verify原靜態規則未放寬。$0、無新網路API／資源載入／儲存，未連真 X。

## 實跑結果與外部交付

- `npm test`退出0：8個測試檔全過；同程序細項 **117/117，0敗、0跳過**。
- `npm run verify`退出0：**9 probe檔／4 Logo SVG；30 API bypass／14 icon／9 SVG／38 leak自測**。故意洩漏骨架／遮罩／語系／iframe的變體仍會失敗；CLI違規探針仍退出1。
- `node --check scripts/e2e.mjs`、`git diff --check`通過。
- **外部回報，非本 session 實跑**：`65052dd` 的 test115／verify37／e2e453斷言已通過；這是複審修正前的結果。最新 reader／新增Chrome情境尚未外部驗證，不能沿用453宣稱本次通過。本沙箱listen被擋、.git唯讀，本次沒有提交／push／merge／改main／生成新截圖。

本次修改5檔：`probe/reader.js`、`test/calendar.test.mjs`、`scripts/verify.mjs`、`scripts/e2e.mjs`、`notes/GATE0.md`。外部請在最新工作樹重跑 `npm test`、`npm run verify`、`npm run e2e` 全過，再提交／合併；保留全部原情境與擴充0資源／背景請求斷言，仍僅接受一次可信使用者點擊的固定Scheduled頂層導覽。截图全部由本機假fixture生成，旧gate0／0.1／0.2不覆寫。

## 結論與老闆實測

**VERDICT: APPROVE（程式複審；合併前須外部最新三項測試全過）。** 阻擋問題已修且有回歸證據，未發現其他阻擋；不代表閘0真機驗收已完成。繁中格式已確認，0.0.4的逐則時間／布局仍待老闆自己的Chrome實测；簡中只確認對應假資料。

老闆步驟保留 **≤5步**：pull main → reload確認0.0.4 → refresh X確認捲動／縮小／避讓 → Scheduled逐則對照日期＋時分 → 回傳浮層與失敗樣本截图及診斷。真機資料不提交公開repo。剩餘限制為有限幾何取樣、closed shadow／極小視窗、本地時區及無年份順序假設、DOM可見窗口累加與同時間同本文去重，不能把探針數字當即時權威總數。

## 本輪續審（b6c8a1a＋工作樹修正）

接續同一複審 session，已重審 PR #8 的 `git diff fdc8096...b6c8a1a` 全部改動及本輪修正。下方「紅燈分析」是寫碼 session 在 b6c8a1a 前的分析紀錄，其 production 未改／Chrome 待跑敘述保留為當時狀態。

**紅燈分析成立，新增測試比第一輪嚴格。** 已親讀 reader／content／測試，並離線重現：只改 `.when`／tweetText，舊 aria-label 合法提供09:00，單次 snapshot 即有2則、l1=l2=2；因此不能只歸因於累加。兩份 metadata 都未知後，單次掃描僅第二列；virtual 同scope仍保留已見列、換scope清空是既有設計。timeFail來自本次掃描，timeOk／items來自UI累加集合；en時間標籤是div，不是認證span，故timeFail=1但samples=none正確，沒有放寬樣本入口。b6c8a1a 保留本文日期、count=1、fmt／samples空與解碼診斷無本文日期的斷言，另加單次 isolated snapshot與scope重置，沒有接受count=2或跳過情境。

**本輪另發現高嚴重度讀法漏洞並修正**：舊fixture的aria-label本來是「時間＋本文」。若可見時間未知、aria同步變成「未知時間＋同一本文」，reader仍可從aria中的本文借到假日期11/3 23:19；離線重現為2則、l1=l2=2，fmt／samples雖空，但讀法錯誤。這不是上述舊aria保留09:00的紅燈根因。`probe/reader.js` 新增完全比對的本文尾段排除：解析accessible label及計timeFail前移除與tweetText完全相同的尾段，不猜新選擇器、不改日期文法，保留正確外部aria時間與本文preview／去重鍵。

保護證據：`test/calendar.test.mjs` 新增cell／listitem／button role、自身與內層aria的回歸，並驗證正確外部時間仍可讀。既有content mutation回歸與e2e改成保留「未知時間＋本文」的accessible label形狀；isolated snapshot、scope重置、count=1、唯一第二列、fmt／samples空、解碼診斷無本文日期的斷言全保留。verify新增合併aria的攻擊，洩漏自測38→39；用b6c8a1a原reader跑最新攻擊，確實以 `accessible label borrowed tweet body date` 失敗。原API30／icon14／SVG9與所有網路／注入／manifest規則未改。

上一輪其餘核對仍成立：繁簡週／周／星期、12點邊界、24h、跨年及五語回歸全過；panel≤60vh、body內捲／固定操作列、縮小狀態、有限避讓／重掛與mounted檢查不變；UI仍只寫自家shadow／host，固定Scheduled導覽仍限可信使用者點擊。三份real fixture與repo外骨架離線轉換結果逐字相同且隱私掃描通過；格式與假日期來源標示清楚。指定舊身份字串掃描含binary／hidden、排除node_modules／.git歷史，0命中；常見token／私鑰掃描亦0命中。manifest只升版，無新權限／API／網路資源。老闆5步實測含Scheduled逐則對照日期與時分，真機驗收及幾何／累加限制保留。

實跑與交付：

- `npm test`退出0，8檔全過；細項 **120/120、0敗、0跳過**。
- `npm run verify`退出0：9 probe檔／4 Logo SVG，**30 API／14 icon／9 SVG／39 leak自測**。
- 60組舊fixture／路徑完整snapshot與b6c8a1a逐字相同；新攻擊拒絕舊reader。`node --check scripts/e2e.mjs`、`git diff --check`通過。
- **外部回報、非本session實跑**：b6c8a1a的test119／verify38／e2e476通過；這是本輪修正前證據。最新production reader與合併aria情境仍須外部重跑三項，不能沿用476宣稱最新通過。網路證據仍要求0擴充資源／背景請求，只保留既有一次可信使用者點擊的固定Scheduled頂層導覽。

本輪修改6檔：`probe/reader.js`、`test/calendar.test.mjs`、`test/content.test.mjs`、`scripts/e2e.mjs`、`scripts/verify.mjs`、本文件。無commit／push／merge／main修改、未登入X／連真站／花費／生成新截圖。

**VERDICT: APPROVE（本輪阻擋問題已修；合併前外部最新test／verify／e2e須全過）。** 老闆真機逐則時間與布局驗收仍待自己的Chrome實測；虛擬累加不追蹤編輯／刪除身份，不能當即時權威總數。

# 閘 0.3 e2e 紅燈分析

本節先分析再修測試。分析基準 HEAD `ef63bd3`，已含 `fa87c62` 複審修正；`git status --short` 為空。未改 production／測試碼前，用 linkedom 與真 content.js VM 做離線重現；沒有登入 X、listen 或執行 Chrome。

## 結論與程式證據（修正前行號）

**目前未重現新的 reader bug；紅燈是測試前置 DOM／實跑版本待核對，不能把日誌直接歸因於累加。** 現有 `scripts/e2e.mjs:535–544` 已同步改 `.when`／aria-label，並替換完整 dialog；照這份 HEAD 重現，單次讀取與真 content 都剩1則。外部回報的 l1=2／l2=2 與此不同，反而吻合只改可見標籤／本文、保留原 aria-label 的 DOM。離線不能斷言外部究竟用了哪份檔案或 DOM；Chrome 實跑仍須外部驗證。

- `reader.js:493–497` 優先採用可解析 aria-label；只改 `.when`，原 aria-label 的09:00仍是合法外部 metadata。`reader.js:469–477`／`480–481` 已排除 tweetText 的文字及內層 role。內文的繁中短句不能救回未辨識 metadata。
- `reader.js:558–570` 回傳 tab 最近 dialog 的物件；`content.js:419–427` 在 scope 物件改變時清空累加。相同scope、needsScroll或virtualized時才保留舊列；非可捲／非virtual則整份replace。`reader.js:746–748` 累加按time＋body鍵去重，不追蹤列編輯／刪除身份。這是探針保留已見虛擬窗口的既有設計與限制，不代表当前列表的權威即時總數。
- 因此若只改可見標籤但保留aria，期待count=1不合理；若兩個metadata都改了、仍同scope且可捲，count也可因累加維持2，但此時單次掃描 **l1=l2=1**。改成新scope後期待count=1合理，不能把預期放寬為2。
- `reader.js:688–709` 的timeFail是本次掃描中帶年份但無法解析的候選／未解析列；`content.js:298–310` 的items、timeOk、unparsed來自浮層累加集合，timeFail、fmt、samples沿用最新report。這些不是同一集合的互斥桶，timeOk＋timeFail不必等於items。甚至未累加時，aria成功、可見文字失敗也可同時timeOk=2／timeFail=1。
- samples比timeFail更嚴格：`reader.js:170–171` 只認骨架證明的span；`297–302` 要獨立葉節點且不在tweetText／composer／timeline；`699–709` 才收集。en fixture的`.when`是div，故timeFail=1但samples=none正確；不能為了有sample猜新選擇器。fmt只取認證結構樣本（`730–732`），legacy的fmt=none也正確。本文日曆詞即使可遮罩也不得進診斷。

## 實跑指令與輸出

`node /tmp/xsched-gate03-red-analysis.mjs`：讀取 `fixtures/en.html` → 同DOM改第一cell可見標籤為假未知格式 `Will send on 2027-01-01 23:59 UTC`、本文為假繁中日期 → 再讀；接著同步改aria，另以全新DOM重現現有e2e的clone／替換dialog。

| 步驟 | snapshot則數／時間 | l1／l2 | timeOk／timeFail | samples／fmt | scope |
|---|---|---|---|---|---|
| 初始en | 2：09:00、11/9 20:05 | 2／2 | 2／0 | []／空 | dialog |
| 同DOM，只改.when＋本文 | 2：仍09:00、11/9 20:05 | 2／2 | 2／1 | []／空 | 同一物件 |
| 再改aria-label | 1：11/9 20:05 | 1／1 | 1／1 | []／空 | 同一物件 |
| 現有e2e：改兩metadata＋換dialog | 1：11/9 20:05 | 1／1 | 1／1 | []／空 | 不同物件 |

獨立節點輸出：`{"tag":"DIV","isolated":false,"unknownParsed":null,"bodyParsed":"2026-11-03 23:19 (Tue)"}`。本文日期本身可以被通用字串parser解析，卻必須在DOM reader入口被排除，這是要保護的安全邊界。

`node /tmp/xsched-gate03-content-analysis.mjs`：沿用content測試的VM／linkedom裝置，實際觸發外部childList mutation callback、不改route；一組原snapshot，一組測試裝置將layout flag設成virtualized=1／needsScroll=1以驗證累加分支。這不是production hook，亦非真Chrome幾何證據。

```text
非virtual，同scope改兩metadata：count=1 l1=1 l2=1 timeOk=1 timeFail=1 samples=none fmt=none
強制virtual，同scope改兩metadata：count=2 l1=1 l2=1 timeOk=2 timeFail=1 samples=none fmt=none
兩組換scope後：count=1 times=["2026-11-09 20:05 (Mon)"]
```

可靠測試須先等初始probe完成、驗證兩個metadata確實都改成未知格式／本文仍存在且scope已替換，再直接檢查擴充isolated world的單次snapshot，最後驗證浮層只剩第二則、l1=l2=1、timeFail=1、fmt／samples均none，整份解碼診斷及顯示時間都不含本文日期。另用真content單元回歸覆蓋非virtual replace、virtual同scope保留與換scope清空，避免拿UI累加則數代替reader安全證據。保留複審的reader／verify修正及所有舊虛擬累加測試，不放寬count=1。

## 第二步：測試修正與驗證

production reader／content、verify與權限保持原狀。`scripts/e2e.mjs:535–581` 增加初始讀取完成的等待、三項DOM前置斷言、isolated world本次snapshot的則數／l1／l2／timeOk／timeFail／時間／samples／fmt驗證；再等真浮層scope重置為1則，保留原timeFail／none斷言，並檢查兩份解碼後診斷均無本文日期／時鐘。沒有刪除日期形狀的本文，也没有接受count=2。

`test/calendar.test.mjs:65` 新增同DOM兩次讀取回歸：舊aria仍可解析時保留09:00，aria與.when都未知後僅第二列；本文短句本身可解析，但DOM reader不借用。`test/content.test.mjs:118` 新增真content／observer callback回歸，驗證非virtual替換、virtual累加保持09:00、換scope清空；正文含假的handle／email／URL誘餌，解碼診斷無日期及身份。virtual flag僅由測試裝置設定，production未加hook。

實跑 `npm test`退出0（8檔）；`node --test --test-isolation=none test/` **119過／0敗／0跳過**；`npm run verify`退出0：**30 API bypass／14 icon／9 SVG／38 leak**，9 probe檔／4 Logo SVG。`node --check scripts/e2e.mjs`、`git diff --check`通過。共修改5檔：e2e、calendar／content測試、GATE0與HANDOFF；未commit／push／生成截圖。

本輪Chrome e2e因既有listen限制仍由外部執行，**外部原紅燈的實跑版本／DOM落差尚未確認，不能宣稱已在Chrome修好**。新的前置與snapshot斷言會在落差發生的步驟給出證據，避免只剩count等待逾時。外部請確認同一repo工作樹含本次修改，跑 `npm test` → `npm run verify` → `npm run e2e`；若仍紅，回傳第一個失敗斷言與scan結果，不放寬或跳過。全部通過後仍需獨立複審，不能沿用修正前453斷言作最新驗收。

# 閘 0.4：固定快捷鈕錨點／拖動保存／其他擴充避讓（probe 0.0.5）

## (b) 根因：先分析、尚未改production時的證據

基準main `4491b79`（PR #8），開工 `f140740`；老闆確認0.0.4繁中時間解析與捲動通過。本節只記格式／機制，不提交真日期或畫面。

0.0.4 `content.js:103–107`的host是position:fixed，`166–167` append到body或documentElement；不是掛在X dialog內，也沒有用dialog當CSS定位參考容器。問題是`positionUI:259–286`每次重收障礙、把panel高度傳給placement、最後把位置寫回快捷鈕host。開關click:159–164觸發render；poll:450–454也重跑同一定位。

`ui.js:88–103`在展開時把width從44改成344，height從44改成44+panelHeight+12，對這個聯合矩形找位置，因而把浮層的避讓反過來移動鈕。`ui.js:75–81`雖忽略全螢幕modal矩形，仍把其button子節點列為障礙；非全屏fixed dialog本體也會被計入。modal出現時可以再次改變位置。真畫面上的「跳進modal右下角」是視窗坐標的避讓結果，不代表DOM被移入dialog；沒有真機DOM不能再斷言是哪個具體障礙造成那個落點。

離線實跑：`node /tmp/xsched-gate04-position-vm.mjs`。從未改的content.js擷取完整positionUI函式（收尾再用`git show 4491b79:probe/{ui,content}.js`各自匯出到/tmp，VM讀固定基準並重跑同一輸出），用VM執行原函式＋原ui.js；1100×820、panel測試高度44、固定障礙矩形(900,600)–(980,655)。輸出：

```text
collapsed=false visibility=visible right=16px bottom=228px
collapsed=true  visibility=visible right=16px bottom=112px
collapsed=false visibility=visible right=16px bottom=228px
modalObstacles=[{left:900,right:980,top:600,bottom:655,width:80,height:55}]
```

最後一行用全螢幕fixed role=dialog模型與其靜態button子節點執行原collectObstacles，證明modal內容仍被當障礙。另直接呼叫原placement，closed={right:16,bottom:112,clear:true}、open={right:16,bottom:228,clear:true}。這是原函式VM的計算證據，不是真Chrome布局證據；本輪linkedom缺依賴且npm registry DNS EAI_AGAIN，不能把未完成的linkedom／Chrome實跑寫成通過。


## 修法與位置策略

`probe/content.js` 的 `applyAnchor` 是快捷鈕座標唯一寫入點。初始化時用44×44鈕本身找預設右16／下112的可用位置；開關／poll／X DOM mutation只跑面板定位。host仍直接掛body（不存在時html），position:fixed；重掛沿用錨點。自動錨點只在初始化、重設、resize重算；拖動結束以新使用者錨點重夾。不改X DOM、不點X控制項、不把modal當定位容器。明確保留外部display:none與mounted真實可見狀態。

`probe/ui.js` 把快捷鈕`placement`與`panelPlacement`拆開。面板可向上／下／左／右找空間，寬≤344、總高≤60vh且小於可用高度；保留可捲body與不隨body捲走的header／操作列。找不到可放下固定操作列和至少32px內容的安全位置時收起面板，快捷鈕不因面板大小而移動。候選最多66組，每組最多14個高度，不做無界搜尋。

障礙偵測增加最多64個body／html直接節點，保留最多96個控制項、320次右下取樣（每次最多8層命中）、總候選256、style讀取768、祖先深度12。只讀getComputedStyle／getBoundingClientRect，fixed／sticky可見矩形才計入；可讀到其他擴充的root wrapper（包括內含closed shadow的wrapper）。排除自家host、role=dialog／alertdialog整個子樹與85%以上全頁wrapper／遮罩。不猜X新testid，不改讀法。偵測後往上或左找空位；使用者位置不再自動避讓其他鈕，除非按重設。

pointer拖動門檻6px，pointer capture保留跨鈕拖動；門檻前仍是普通點擊，跨門檻後抑制相容click，取消／capture失去／resize中斷時回原錨點且不寫位置。拖完刷新仍在同一視窗座標；縮小視窗只夾可見位置，放大回原保存位置。操作列新增九語重設，清位置key後回自動避讓。tooltip採既有九語原生title，沒有自訂tooltip DOM；瀏覽器決定提示框位置，擴充不另占一塊浮動區域。

## localStorage與守門

只有`probe/position.js`可讀寫x.com頁面`window.localStorage`，固定key `xsched.probe.pos`，只接受恰有兩個鍵的有限數字`{x,y}`。寫入前複製並再驗證，阻止getter在驗證後換成字串；讀取最多128字元，非數字／多鍵／破損JSON直接忽略。拒絕其他hostname；讀寫例外不帶私人訊息進診斷。禁止chrome.storage，沒有新增權限。manifest描述改為只保存本機按鈕位置。

這是與x.com同origin的頁面儲存，X頁面及其他同origin腳本可能讀寫／刪掉此位置；只存兩個數字、不存本文／身份／路徑／診斷。原始保存值不被resize改寫；重設只刪固定key。儲存被禁用時本頁仍可拖動，但刷新不保留。

verify原persistent storage禁令保留。只對根目錄position.js、且來源SHA-256與已審數字模組完全一致時豁免storage關鍵詞／方法名兩項；任何來源改動都必須重新審核並更新摘要。網路／注入／manifest等其他規則仍完整掃描此模組。另加禁止getItem／setItem／removeItem，抓別處變數拼接storage名稱的繞法。18項自測證明別處／改名、錯前綴與不同key、非數字內容、刪驗證、有限數字驗證移除、其他storage及混入網路均被擋；原30 API／14 icon／9 SVG／39洩漏攻擊項目全保留。

## 測試與外部收尾

新增`test/position.test.mjs`、真content拖動／錨點回歸、幾何modal排除／外掛wrapper測試與`fixtures/extensions.html`（兩個假外掛鈕分別掛body與html）。e2e保留舊情境及0擴充資源／背景請求斷言；增加實際mouse拖動、reload、數字key、resize原值、重設、無自訂tooltip、外掛鈕非重疊／elementFromPoint／物理點擊、modal／無modal開關前後精確矩形比較、body／html掛載和基準4491b79權限比較。舊擴大DM測試在改幾何後顯式發resize，符合新規格，非重疊斷言沒有放寬。

本輪node_modules缺失；npm ci離線ENOTCACHED，線上registry DNS EAI_AGAIN。本session已實跑無依賴`node --test --test-isolation=none test/position.test.mjs`：**5過／0敗／0跳過**，其中實際verify靜態掃描10個probe檔（含manifest與4個PNG圖示）通過，18項storage自測過。這不是完整npm test或verify，也沒有跑完39項DOM洩漏攻擊。完整npm test、npm run verify、Chrome e2e仍需恢復依賴後跑，不能宣稱全過或READY。完整命令／實際退出碼記在HANDOFF。

外部請在最新工作樹依次跑`npm ci`、`npm test`、`npm run verify`、`npm run e2e`（Chrome for Testing／Xvfb與CHROME_PATH同前）。新增截圖目標：`docs/gate0.4-{dragged-reload,avoid-extensions,tooltip,reset,modal-closed,modal-open,no-modal-open}.png`；既有情境也改存gate0.4前綴，舊gate0／0.1／0.2／0.3截圖與骨架不覆寫。本session沒有生成新截圖／commit／push／PR／打包zip；外部工作中已建立WIP 16f6228／ec3c9f3，仍需提交最後文件差異並交另一session複審。

## 老闆實測（≤5步）

1. `git pull main`。
2. `chrome://extensions`重新載入`probe/`，確認版本0.0.5。
3. 重新整理x.com，拖快捷鈕到空處，再重新整理確認仍在原位。
4. 開關浮層並開X草稿對話框，確認鈕都不跳、沒有蓋到其他浮動鈕。
5. 浮層按「重設位置」確認回預設；有問題截圖並按「複製診斷」貼回。

## 已知限制

- 為位置穩定，初始化後才出現的外掛／DM幾何變動不會自動搬快捷鈕；可拖到空處、重設或resize重新避讓。手動位置優先，使用者拖到其他鈕上不會再跳走。
- 有界取樣可能漏極小或候選上限外的元件；closed shadow只能看有尺寸的外層wrapper，不能枚舉內層。全頁wrapper／modal有意排除。極小或障礙過密視窗可能只能留快捷鈕；若自動鈕本身也無安全位置則暫藏，resize會重試。
- 原生title由Chrome決定呈現方向，沒有自訂tooltip可驗證矩形；e2e驗證沒有自訂tooltip节点。真機不同外掛組合仍需老闆自己的Chrome確認。
- 儲存例外只影響刷新保留；同origin儲存可被頁面更改。位置只按CSS像素保存，不跨裝置同步。舊虛擬列表累加／讀法／時間格式限制沿用0.0.4，本輪不改解析行為。

# 閘 0.4 Codex 複審

2026-10-10，接續同一獨立複審 session，與寫碼 session `01a1212e` 不同。已讀 AGENTS／ROADMAP／開工卡／競品／HANDOFF／閘0.4筆記，重審 `git diff 4491b79...b01026b` 全部改動及本輪工作樹修正。前面依賴缺失／待外部驗證記錄是寫碼時的歷史，本節為最新複審結果。

## 發現與小修正

| 嚴重度 | 檔案 | 證據與修正 |
|---|---|---|
| 中：拖動清理 | `probe/content.js`、`test/content.test.mjs` | resize／重設／stop清空drag卻不釋放capture，另一個primary pointerdown也能覆蓋active drag。以b01026b真content VM重現resize後仍持有capture。加入集中取消／釋放，先清state再release以防loss事件重入，並拒絕覆蓋active drag。回歸涵蓋resize／重設／pagehide／dispose／pointercancel／capture loss與第二個pointer；取消不存值、後續move／up不得寫位置。 |
| 中：resize與重掛 | `probe/content.js`、`test/content.test.mjs` | applyAnchor在host斷線時先return，resize未重夾保留座標，重掛會用舊坐標。改為先計算anchor再判斷是否能寫host；以保存的假位置縮窗＋重掛驗證夾位，放大恢复原值，storage不被resize覆寫。 |
| 中：既有hostname相容性 | `probe/content.js`、`test/content.test.mjs` | manifest仍match twitter.com，但新頂層x.com guard讓該host完全沒UI；已用b01026b真content VM重現。恢復兩個原有matching host的UI；position模組仍拒絕twitter.com的load／save／reset，回歸證明三條路徑皆0儲存呼叫且不更改既有key。未增加host。 |
| 高：公開資料衛生 | `notes/HANDOFF-gate0.4.md` | 開頭重新記入老闆實测的真日期時間，違反不提交真機資料規則。已刪除日期時間，只留繁中格式與timeOk／timeFail。沒有在本複審節複製真值；本輪不改Git歷史。 |

`scripts/e2e.mjs`另補真mouse拖動持有capture→resize→mouseup前已釋放、錨點復原／不切換／不儲存四項斷言；原resize測試先移除host，再縮窗驗證重掛夾位。原drag／reload／reset／modal精確矩形、fixed操作區與0資源／背景請求等所有斷言保留。

## 重點核對

- **根因成立（已親讀程式，真機落點仍非本session驗證）**：基準把panel高度／寬度併入placement，render與poll都回寫host；原host掛body／html，沒有移進dialog。modal子鈕可成障礙的推論有原函式VM與程式證據，但不能指認老闆畫面中的哪個元件決定落點。新applyAnchor只在初始化／拖動及取消／重設／resize計算座標，重掛套用既有錨點；開關／poll／X mutation只定位panel，回歸驗證SPA／modal／重掛不搬鈕。
- **拖動／幾何**：6px門檻、有效pointer座標、單一active pointer、相容click抑制、capture清理、可見範圍clamp、保存位置優先均核對。panel獨立多方向定位、≤60vh、固定操作列與body捲動保留；無空間收面板而不搬鈕。有界64 root／96控制項／256候選／320點／768 style／12祖先，panel≤66候選×14高度。排除dialog／alertdialog子樹及全頁wrapper；只讀他人rect／computed style，不改他人DOM、不click／捲頁。九語重設與原生title完整；檢視外掛避讓／modal開啟假資料截圖，Chrome hit-test仍以外部實跑為證。
- **儲存是明確授權的受限例外**：基準全面禁止localStorage，本輪依新版AGENTS只開單一已審位置模組，不能稱基準仍全面禁止。已親讀37行position.js：hostname必須x.com、固定key `xsched.probe.pos`、恰兩個有限數字、JSON長度上限128、寫入複製後再驗證、捕捉storage／getter例外；不存本文／身份／URL／診斷，不加storage權限。來源SHA-256確實為 `6c20a9e0a844b21a23834f8af50ecf58084f6d5bd9fa9cbcdd44624ff436de10`，本複審未改position.js或摘要。其他模組storage仍禁，新增方法名別名阻擋；同名改碼／改名／錯key／刪數字驗證／非數字內容／其他storage／網路混入18攻擊全拒絕。這符合本機資料、權限最小及已授權邊界，其餘網路／注入／manifest／39洩漏守門保留。
- **硬規則與衛生**：manifest與4491b79對照，permissions／host／optional permissions／web resources／externally_connectable／action及matches完全不變；只改描述／版本與載入本機position.js。reader／skeleton僅升版本，閘0.3的本文隔離、合併aria、fmt／samples／骨架安全規則全保留。指定舊身份字串及常見token／私鑰掃描（含hidden／binary、排除node_modules／.git）0命中；real fixtures未改，新增extensions fixture明列假資料／非真頁快照，無遠端資源。診斷不增加位置或任何本文資料；$0、未登入X／連真站。
- **文件／實測**：5步實測保留reload0.0.5、拖動刷新、modal前後不跳、重設與診斷回報；不把本機假fixture／截圖當真頁驗收。老闆自己的Chrome與不同擴充組合仍待實測。

## 實跑與外部交付

- `npm test`退出0：9檔全過；細項 **133/133、0敗、0跳過**。
- `npm run verify`退出0：**10 probe檔／4 Logo SVG；30 API／14 icon／9 SVG／39 leak／18 storage自測**。已核對守門diff，除上述經授權的精確來源儲存例外外未放寬規則。
- `node --check probe/content.js`、`node --check scripts/e2e.mjs`與`git diff --check`通過。
- **外部回報，非本session實跑**：b01026b的test129／verify39＋18／e2e513通過；這是本輪修正前證據。最新content與新增Chrome情境須外部重跑test／verify／e2e全過後提交／合併，不能沿用513宣稱最新通过。本沙箱沒有listen／Chrome驗收或新截圖。

本輪修改5檔：`probe/content.js`、`test/content.test.mjs`、`scripts/e2e.mjs`、`notes/HANDOFF-gate0.4.md`、`notes/GATE0.md`。未commit／push／merge／改main；position.js、verify、manifest及日期讀法未改。

**VERDICT: APPROVE（阻擋問題已修並有回歸；合併前外部最新三測試須全過）。** 仍有有限幾何取樣／closed shadow／極小視窗、初始化後新外掛不自動搬鈕、手動位置可覆蓋其他控制項、同origin頁面可改位置key與儲存禁用不保存等既有明列限制。原生title方向由Chrome決定；探針累加不能當即時權威總數。真機位置驗收不由本session代替。
