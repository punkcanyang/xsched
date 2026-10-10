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


# 閘 0.5：浮層可拖、鈕與浮層位置獨立（probe 0.0.6）

## 根因（先讀原碼，尚未改production）

基準93ed233／開工a43a152，0.0.5 `content.js:194–202`在shortcut pointermove更新anchor後呼叫positionUI，pointerup:209–214也呼叫；positionUI:341–345每次都以最新anchor執行panelPlacement並寫panel.left/top。poll:522同樣重算，面板沒有自己的位置state／storage。因此鈕位置不被面板影響，但面板仍單向跟鈕走；不是DOM掛載點的問題。

離線`node /tmp/xsched-gate05-root.mjs`直接呼叫未改的ui.panelPlacement，以1100×820、假幾何、無障礙、測試高度350重現：anchor(1040,664)→panel(740,302)；anchor(200,100)→panel(16,156)。這是純函式計算，非真機畫面；不記錄任何老闆真日期／本文。


## 修法／位置模型

快捷鈕錨點與panelAnchor完全獨立，panel初次真正展開才用既有多方向panelPlacement在鈕旁找空位。初始面板使用固定≤60vh高度，不依本文長短縮放，body可捲／header與操作列固定。只有第一次放置讀鈕的anchor；之後開關、拖鈕、poll、X mutation／modal及重掛只套用panel自己的座標，不再次跟鈕定位。位置以視窗CSS像素存x,y。首次成功定點即寫panel key，刷新後使用同一點。

標題列是拖動把手，6px門檻；任何button／a／input／textarea／select／role=button按下都不啟動拖動。pointer capture放在不隨render重建的section，避免poll重畫header時丟capture；clear state在release之前，防capture loss重入。單一active drag（鈕或浮層）、有效座標與primary pointer保護；pointercancel／loss／resize／reset／pagehide／dispose／remount取消會釋放capture、回原錨點、不寫入未完成位置；跨門檻抑制相容click，之後普通按鈕按下重新清除抑制旗標。標題列按鈕的正常click照舊有效。

拖浮層只更新panel座標，拖鈕只更新鈕座標；浮層拖動結束才保存、重新決定此位置的可用高度。resize夾兩個位置（包含host斷線時），不覆寫原始存值；放大恢復存值。浮層寬≤344、高≤60vh，整個矩形夾在視窗內。reload／resize時只在固定x,y縮短面板來避開原生／外掛元件；若縮短將使header／操作列不可用，使用者存的位置優先，保留必要高度而允許與控制項重疊。poll／mutation／modal不再改面板位置或避讓高度。極小視窗連固定操作列也容不下時面板暫藏，鈕仍可用，resize重試。

「重設位置」先取消兩種拖動，再清兩個key、鈕回自動避讓、面板用鈕旁邏輯重新預覽。**重設後的poll不會立即再寫key**；下一次明確展開浮層或完成拖動才提交panel預設點。重設後立刻刷新仍從空key算同一套預設；保存被禁止時本頁定點正常，刷新只能重新算預設。

## 兩個localStorage key／隱私與守門

只有probe/position.js可存取x.com的window.localStorage：`xsched.probe.pos`、`xsched.probe.panelPos`，各只存經驗證的有限數字`{x,y}`，不存大小／本文／診斷／路徑／帳號。集中internal read／write／erase也檢查key為這兩個常數，對外只提供固定button／panel介面，不能傳第三個key。保留128字元JSON上限、多鍵拒絕、getter複製再驗證、throw捕捉与hostname檢查。原manifest matching host相容性保留，但twitter.com仍完全不存位置；沒有新增權限／chrome.storage。

verify只更新經逐行核對的position模組來源SHA-256授權边界，其他模組storage、第三key／錯前綴、非數字、sessionStorage／indexedDB／chrome.storage、網路與DOM注入全禁止。18→21 storage攻擊自測，額外包含別處使用panelPos與panel常數改成第三key／非xsched key；舊18項全保留，並讓失效的mutation replacement直接失敗。原30 API／14 icon／9 SVG／39洩漏自測保留。本輪reader／skeleton只升0.0.6，不改日期文法／讀法／樣本規則。

同origin頁面腳本可讀／改這兩個數字位置，原始偏好不跨裝置同步，localStorage受阻時刷新不能留位置；不把任何位置或storage錯誤文字寫進診斷。測試／截圖只用既有假fixtures與假幾何，本節沒有老闆真機日期、樣本或帳號。

## 驗證與外部交付

新增position雙key／clamp與真content雙錨點拖動、toggle／reload／modal／poll／remount、不把header按鈕當把手、capture跨render與每種中斷、超窗保存值回歸。原鈕取消測試對新的初始panel key改為驗證鈕key不寫且panel值不變；reset仍檢查整個兩key儲存清空，沒有放寬為只檢查UI。

本session實跑npm test退出0（9檔）；細項`node --test --test-isolation=none test/` **138過／0敗／0跳過**。npm run verify退出0：**10 probe檔／4 Logo SVG；30 API／14 icon／9 SVG／39 leak／21 storage自測**。Chrome e2e實跑仍因本機fixture server listen EPERM:127.0.0.1退出1，未開始Chrome斷言／沒有本輪截圖，外部不能沿用0.0.5數字當本輪驗收。

e2e保留全部舊時間、診斷、host／lifecycle、原生控制項與網路斷言；擴大DM情境在resize後顯式重設兩個位置（新面板不因resize任意移向別處），其非重疊／elementFromPoint／物理Post／widget點擊斷言不變。新增雙rect精確不變／header物理拖動／reload／兩key數字／超窗實際header命中／header按鈕不capture且仍可點／重設雙rect、93ed233基準manifest比較。0擴充資源／背景請求守門保持，只接受既有一次可信使用者點擊固定Scheduled導覽。

外部請跑npm test → npm run verify → npm run e2e，產生docs/gate0.5-{panel-dragged,button-dragged,reload-both,clamped,reset-both}.png與沿用情境gate0.5前綴截圖／骨架；舊gate0／0.1／0.2／0.3／0.4完全保留。完成最新外部三測試後提交／複審；本session不commit／push／main／PR／打包zip。完整檔案／命令見HANDOFF-gate0.5.md。

## 老闆實測（≤5步）

1. `git pull main`。
2. `chrome://extensions`重新載入probe/，確認0.0.6。
3. 重新整理x.com、打開浮層，拖鈕與浮層標題列，確認互不跟著動。
4. 重新整理確認兩者各留原位，開關浮層也不動。
5. 按「重設位置」確認兩者回預設；有問題截圖並按「複製診斷」貼回。

## 已知限制

- 保存位置優先，手動拖動或resize可能讓浮層覆蓋原生／其他擴充元件；不因新元件出現而搬動，可拖到空處或重設。初始化避讓有界，closed shadow只看外層wrapper，原生title方向由Chrome決定。
- 極小視窗無法同時容納60vh與固定操作列時收起面板；回到較大視窗即可再開。resize只改可見夾位，不改兩個原存值；尺寸以CSS像素計，沒有跨裝置同步。
- 頁面可改／刪同origin數字位置；storage失敗不妨礙本頁操作，但刷新不能保存。重設預覽直到下一次明確展開或完成拖動才重新保存panel key。
- 新Chrome物理拖动／rect／網路證據與老闆自己的Chrome實測仍待外部跑；既有reader虛擬累加／真DOM變動限制沿用，不宣稱即時權威總數。

## 閘 0.5 Codex 複審

獨立複審 session，與寫碼 session 01a1212e 不同。審查基準 `93ed233...8edc4e5` 全部差異；親讀 AGENTS、HANDOFF、上述根因與實作／測試。**未發現阻擋合併的問題，APPROVE**；本輪只補本節，不改 production、守門規則或測試。

- **根因有原碼證據**：基準的 shortcut pointermove／pointerup 與 poll 都呼叫 positionUI，該函式直接用當時的 button anchor 重算 panelPlacement。新版只有 panelAnchor 尚未建立時才依鈕定點；之後兩個錨點分開。拖鈕、開關、poll／mutation／modal／重掛不重算浮層錨點；浮層完成拖動、resize／reload 的高度避讓仍有界，手動位置優先的限制已揭露。
- **拖動與夾位**：6px 門檻、互斥 active pointer、標題列互動元素排除、section capture 跨 render、先清 state 再 release、防相容 click 均成立。取消／capture loss／resize／reset／pagehide／dispose／重掛回復未完成拖動且不保存；兩方向獨立、首次保存、reload、reset 預覽後 poll 不補寫、斷線 resize 保留原存值有回歸保護。Chrome 測試另外斷言完整 rect、標題列實際可見且命中，不只比 style 數字。
- **儲存與硬規矩**：逐行核對 position.js 及已審 SHA-256，只在 x.com 存兩個固定 key 的有限數字 x/y；第三 key、非數字／額外欄位、變動 getter、儲存例外與 twitter.com 拒絕路徑安全。verify 的來源摘要豁免只涵蓋集中模組的 storage 規則，其他網路／注入／權限禁令未放寬；舊 18 項 storage 攻擊保留並增至 21。manifest 除版本／描述外與基準相同，reader／skeleton 只升版，診斷與樣本隱私規則未改。
- **公開資料與文件**：新增文字、骨架及 41 張 PNG 對照本機 fixture／e2e 生成流程，另檢視截圖；皆為合成資料／遮罩結構，PNG 無附加 metadata，未引入老闆真日期、原始時間樣本、真帳號或密鑰。全工作樹排除 .git／node_modules 後未命中既定禁用身分字串。老闆實測為 5 步。上方與 HANDOFF 的「外部待跑」是寫碼當時的歷史狀態，以下補上本輪收到的外部結果。

**本複審實跑**：`npm test` 退出 0（9 檔），細項 `node --test --test-isolation=none test/` 為 **138 過／0 敗／0 跳過**；`npm run verify` 退出 0（10 probe 檔／4 SVG，30 API／14 icon／9 SVG／39 洩漏／21 storage 自測）；PR diff 空白檢查通過。**外部結果由产品开发提供**：8edc4e5 的 npm test 138/138、verify OK、e2e **548 斷言通過**；本複審未在沙箱重跑 Chrome，不把外部數字記為自己實跑。文件提交後，依最新分支三測試規則由外部補跑 e2e／提交；本輪沒有程式差異需要重新產生截圖。

剩餘風險沿用上述限制：保存位置可能覆蓋新出現的原生／其他擴充元件，極小視窗可能暫藏浮層，同 origin 可改數字偏好，storage 禁用時不能跨刷新保存；老闆自己的 Chrome 仍須按 5 步確認。沒有新增權限、網路、真機資料或讀法風險。

# 1.0 快速選時段（probe 0.1.0）

## 先查證據（寫碼之前）

本輪先讀 AGENTS、ROADMAP 第1項、開工卡、競品、HANDOFF與閘0依據表／0.2–0.5筆記，再查 repo 與未提交的遮罩骨架。`rg -n 'scheduledDateField|scheduledTimeField|scheduleOption|scheduleConfirm' fixtures probe` 無排程設定欄位命中；既有 fixture 的 dialog 是 Scheduled／草稿列表，不是日期時間選單。依據表第5列只是未親讀文章的未驗證線索，本輪沒有把它當真頁證據，也沒有引用新網頁。

離線指令：Python逐行搜尋原始遮罩骨架，檔案340748 bytes／4110行，`role=dialog`在L36、L42；四個上述testid均0命中；`^\s*select\b`／`option`均0節點。一般`select`字串的4次命中在L86、93、507、520，都是aria-selected。另`rg -n '^\s*input\b'`只有L3461的type=text、role=combobox，位於背景分支，沒有date／time input。這份骨架只有排程列表／背景時間軸，不能證明排程設定對話框的控制項結構。原始骨架不提交，也不從它匯出任何真機資料。

結論：**出快速填值原型，但真頁控制項尚未驗證**。老闆自己先打開X原生排程對話框，擴充只按明確、完整的假設選單填值；不打開X視窗、不點任何X控制項或送出鈕。缺欄位／有歧義／選项不匹配時整組不填。這是相對開工卡「一按打開」的刻意縮小：拿到老闆新骨架後才修偵測，開視窗功能另議，最終確認始終留給老闆。

## 設計／未驗證選擇器表

所有設定集中在`probe/quick.js:5–11`的QUICK_CONFIG，不修改reader的列表選擇器／讀法。只有x.com、由老闆可信點擊shadow內快速鈕，才會進填值入口；不點X的排程圖示，不代替確認。按既有Dagaz快捷鈕展開浮層才能看快速區；保留0.0.6的手動開關與雙位置模型，不因X開對話框自動移位。快速區在可捲body，診斷／骨架／重設等仍在固定操作列。九語的四個鈕文字、aria-label／title及狀態都在ui.js的QUICK_STRINGS。

| 假設 | 選擇器／選項值 | 證據／狀態 |
|---|---|---|
| 設定視窗是可見dialog | `[role="dialog"]`，欄位必須直接歸屬同一最近dialog；拒絕隱藏與多個設定視窗 | 列表骨架有dialog，但**設定視窗此結構未驗證** |
| 日期／時間容器 | `data-testid=scheduledDateField`／`scheduledTimeField` | 依據表#5未親讀公開文章；**未驗證假設** |
| 日期選單 | 日期容器內`select[name="month"]`／`day`／`year` | 純合成fixture；**未驗證假設** |
| 時間選單 | 時間容器內`select[name="hour"]`／`minute`／可選`period` | 純合成fixture；**未驗證假設** |
| 選项值 | 月1–12、日／年／時／分為數字（允許零補齊）；period明確AM／PM。不看任意選項文字猜值 | 純合成fixture；**未驗證假設**。月0–11、數字AMPM或其他映射均拒絕 |
| 12／24小時 | 有period需完整1–12及AM/PM；無period需完整0–23 | 保守的合成控制項合約，真頁尚待確認 |

每次按鈕點擊重新偵測，不沿用render抓到的節點。欄位缺漏、重複、disabled／hidden／multiple、目標選項缺失／重複時整組拒絕。先算出所有目標值、預檢所有選項與原生setter，再把全部值設好，最後才送出原生input/change。setter拒絕時靜默回復原值、不發事件；找不到setter不改值。React受控選單的事件處理若重建或重設欄位，末尾检查連線及值，失敗明示不成功，不會再猜測／補點X按鈕。真X相容性仍需骨架與老闆欄位對照確認。

預設9:00／12:30／20:00取下一次**至少晚於現在5分鐘**的本地時間，跨日／月／年按Date本地日曆計算；「下個工作日9:00」從明天開始找週一到週五，不包含今天、不判國定假日。遇DST造成小時正規化則跳過該日，不默默填另一時間。原生分鐘選單可精確表示就填（含零補齊）；不能表示就顯示「未偵測到排程欄位」，所有欄位不變，不私自四捨五入。

這不是「下一個空時段」：本PR不避開已排推文（ROADMAP第3項）、不做自訂時段／星期、不存時段設定、不自動预排，也不聲稱填值代表已排成功。之後拿到真設定視窗DOM才修假設；開工卡的一按開視窗另議，最後送出始終由老闆操作。

## 診斷／骨架與守門

content診斷第一行`xsched probe v0.1.0 (manifest 0.1.0)`，新增獨立純計數行`schedDialog=N dateCtl=N timeCtl=N selects=N`：schedDialog只計含假設容器的可見設定候選；dateCtl/timeCtl計候選容器內select數；selects計所有可見dialog所屬的select數，不借用未知欄位的名稱／值猜用途。因此即使testid改名，也可能看到schedDialog=0／selects=6供比對。其他診斷及fmt／samples規則不變，這一行不含任何欄位值／本文／帳號／網址。

skeleton.js原本根從body整棵走，非只走Scheduled列表；合成fixture證明開著的設定dialog及select／option會被走入。select／option文字只留#text長度，不走短日曆樣本出口，屬性照舊遮罩；不匯出選項日期值、名稱或本文。原始真機骨架不提交，新fixture與所有截圖情境皆是假資料。

verify新增禁止click方法／別名、requestSubmit／submit方法／別名、MouseEvent／PointerEvent／KeyboardEvent／SubmitEvent、任何未審dispatchEvent。只有根目錄quick.js且SHA-256完全符合逐行核對的來源，才豁免dispatchEvent關鍵字一條；同檔其他網路／storage／激活／注入規則照掃。唯一writeNativeControls函式只對預檢後的原生select送input／change，不對dialog、button、form送事件。來源改動／改名／其他模組派送，即使只送change，也失敗。20項新攻擊自測，保留30 API／14 icon／9 SVG／21 storage；洩漏39項保留，加選項內容／日曆匯出路徑為41項。position.js與其授權摘要不變，仍只有兩個數字位置key，權限／host／resources／matches與2cceb5e一致。$0，0擴充網路請求由原e2e證據守門持續驗證。

## 本輪實跑／外部待跑

`npm test`退出0（Node隔離模式彙總10檔）；細項`node --test --test-isolation=none test/`：**154過／0敗／0跳過**。`npm run verify`退出0：11個probe檔、4 SVG，30 API／14 icon／9 SVG／41 leak／21 storage／20 native writer自測。new quick單元包含跨年／月／閏日／5分邊界、工作日、12／24h、原生setter批次值先於事件、缺漏／不支持分鐘／年份／歧義／hidden／disabled／非x.com、setter失敗回復、九語、診斷無值、選項遮罩；content VM測可信點擊及render後欄位消失的即時預檢，仍不觸發任何X送出。

`npm run e2e`實跑退出1：`fixture server failed: Error: listen EPERM: operation not permitted 127.0.0.1`；**Chrome斷言0、新截圖0**。node_modules已存在，無須安裝。e2e腳本保留全部548基準情境的斷言，不把548寫成本輪已過；新增合成設定fixture、四時段逐欄比對、input/change計數、Confirm／Schedule／composer Post click=0及form submit=0、missing／partial／選項無法表示時完全不填、骨架／診斷物理複製與0額外網路證據。新設定情境在main與extension isolated world各以測試Date替換固定2027年時鐘，只有test腳本注入，不改production；獨立断言跨年到2028年及工作日跳週末，fixture年份選單從2027起。

外部在最新分支依次跑`npm test`、`npm run verify`、`npm run e2e`（沿用Chrome for Testing／Xvfb及CHROME_PATH）。新截圖至少`docs/v1.0-quick-{dialog-detected,slot-filled,not-detected,partial-fields,diag}.png`；旧情境也另存v1.0-quick前綴，舊gate0–0.5截圖／骨架不覆寫。沙箱不commit／push／PR，外部WIP 2ac003b只是中途snapshot，後續差異還需外部提交與不同session複審。**未達READY：外部最新e2e與真設定DOM／老闆欄位對照待確認。**

## 老闆實測（≤5步）

1. `git pull main`。
2. `chrome://extensions`重新載入probe/，確認版本0.1.0。
3. 在x.com發文框自己打開X原生排程對話框，再點Dagaz展開浮層，看快速時段顯示「未偵測到排程欄位」或可用。
4. 不論可用與否，保持X設定對話框開著，按「複製頁面結構」與「複製診斷」貼回。
5. 若可用，按一個快速時段、逐欄確認原生日期／時間被填好，**不要按排程**。若一定要按送出測試，先手動把年份改到2027年以後，測完到Scheduled刪掉那則；有問題附範例化截圖回報，真機資料不入公開repo。

## 已知限制／還缺什麼

- 尚無排程設定真DOM；testid、name、選項值與受控事件處理都是假設，真頁可能全部顯示未偵測。還需老闆在**設定對話框開著**時貼0.1.0的骨架及schedDialog／dateCtl／timeCtl／selects診斷，不能用既有Scheduled列表骨架代替；只用遮罩資料修公開fixture。
- X允許的最小提前量／可排上限未驗證；本地5分鐘僅本版安全餘量，不保證X接受，時區依本機Date而非X自行選的其他時區。AMPM數字值、零基月、非select／不完整或不能精確表示的選單均拒絕。遇原生事件重建欄位，不宣稱成功，老闆需自己對照。
- 缺控件／不可表示都用同一「未偵測到排程欄位」訊息，不提供可能含值／私人錯誤的診斷；需骨架分辨原因。工作日只指週一到週五，沒有假日表。無自訂時段／星期／佔用避讓。
- 雙位置、極小視窗、虛擬列表與同origin位置storage限制沿用0.0.6；快速鈕在body內可能需捲動，但複製操作固定可見。extension不開X對話框、不確認、不排程、不背景發文。

## 1.0 快速時段 e2e 紅燈續修（32b769a之後）

外部回報32b769a：npm test154/154、verify OK，全部舊gate0.5情境通過；quickFixture第一次toggle(true)逾時。**本輪定位到測試缺首次render等待的初始化競態，production不改。** Chrome紅燈當下沒有state快照，以下是原函式離線重現的證據，與回報相符；尚需外部重跑確認實際Chrome修復，不能宣稱e2e已過。

程式證據：e2e的findExtensionContext（225–230）只查XSCHED_READER存在；open（236–240）只等domcontentloaded，原quickFixture（1119–1137）找context後改Date就直接toggle。content的start（693–694）先ensureHost再schedule；schedule以SETTLE_MS=60延後首次tick。快捷鈕click（208）在lastReport尚空時直接返回，不記開啟請求。模組／host已存在不等於首次報告已完成；早點一下被忽略，首次tick在非Scheduled路徑仍預設收合，所以後面的400ms poll不會自行開啟，toggle等待可一直失敗。這不是測試應接受「開或關都算過」的情況。

離線實跑`node /tmp/xsched-quick-toggle-repro.mjs`：擷取test/content.test.mjs原fixture helper，只把初始flush留給呼叫端，載入真content.js及原quick-dialog假fixture，注入原2027年Date mock，先點再flush／poll；输出：

```text
before initial read {"ready":false,"expanded":null,"display":""}
early click + tick + poll {"ready":true,"expanded":"false","display":"none"}
click after first read {"ready":true,"expanded":"true","display":"flex"}
geometry (no fixed obstacles) {"left":920,"top":160,"right":1264,"bottom":652,"width":344,"maxHeight":492,"clear":true}
```

ready依實際host的diagnostic是否存在判斷。fixture的dialog及子樹由原collectObstacles排除；剩餘原生Post是static，不構成fixed障礙。1280×820、快捷鈕(1220,664)、492px panelHeight由原panelPlacement計算可放下；是純幾何計算，非Chrome量測。此測試只改Date類別，沒有Emulation virtual time policy；VM中既有setTimeout／interval callback仍可flush執行，Date mock並不替換它們。

最小修正：scripts/e2e.mjs quickFixture（1123–1130）先等當頁mounted=1、mode=other、0.1.0首次診斷完成，**另斷言expanded=false且panelVisible=false**，再照舊注入兩個世界的2027時鐘、只點一次shortcut。原toggle的expanded=true **且** panelVisible=true檢查完全不變，不用重試點擊／接受錯狀態／改production避讓。

預查後續：第一次成功填值使quickStatus進render signature，60ms後重建body；若立刻抓下一個button handle，可能在物理click中被重畫移除。四時段循環首次填值後等待原quick-status節點已斷線，再抓下一顆鈕，等待實際重畫，不加任意sleep。四時段逐欄／獨立跨年期望、input/change、Confirm／Schedule／Post click=0及submit=0、缺欄位／部分欄位／不能表示完全不改值、骨架遮罩／複製與0網路斷言全部保留。

新增test/content.test.mjs:486的真content VM回歸：不先flush，證明早點擊被忽略；2027 Date mock下完成tick後仍收合，再等診斷後點一次即展開且有四個快速鈕。fixture helper新增預設true的startReady參數，舊測試行為不變。

本輪實跑npm test退出0（10檔）；`node --test --test-isolation=none test/` **155過／0敗／0跳過**。verify退出0（11 probe檔／4 SVG；30 API、14 icon、9 SVG、41 leak、21 storage、20 native writer自測），node --check與git diff --check通過。npm run e2e仍退出1：fixture server listen EPERM 127.0.0.1，Chrome斷言未開始，新截圖0。外部在最新工作樹再跑npm test → npm run verify → npm run e2e；不用沿用32b769a數字當本輪e2e驗收。沒有新增權限／依賴／真機資料，沒有commit／push。

## 1.0 快速選時段 Codex 複審

獨立複審 session，與寫碼 session 01a1212e 不同。已審 `2cceb5e...6f42f83` 全部差異、開工卡、ROADMAP、AGENTS、HANDOFF 與本節；**修正以下守門缺口後 APPROVE 此未驗證原型，不宣稱真 X 填值或 1.0 第一項已完成驗收**。

- **高：原生激活別名守門漏擋，已修。** 複審實際呼叫原 scanSource，`const {click: activate}=button`、`Reflect.get(button,"click")`、解構 submit 與 Object.getOwnPropertyDescriptor 取得 submit 均回傳零錯誤；這是靜態守門缺口，沒有發現 production 在執行這些操作。scripts/verify.mjs 追加解構／反射取 click／submit、onclick／onsubmit 別名禁令，保留原規則與兩個已審來源摘要，不擴大任何豁免。原 20 個 native writer 攻擊保留，追加 prototype.call、label、focus＋Enter、dispatchEvent 別名、註解／拼接／跨行、反射／解構及直接 handler 攻擊，共 **33**；test/review.test.mjs 用真 CLI 的五個違規頁證明退出 1 且 stderr 指向新增規則，test/quick.test.mjs 更新自測數，AGENTS 同步規則與數字。
- **送出與原生設值：親讀程式，符合限定範圍。** content 只有可信 shadow 快速鈕點擊才呼叫 fillSlot；唯一 writer 不匯出，只對整組預檢的 HTMLSelectElement 用 prototype value setter，再送 input／change。沒有 click／pointer／keyboard／submit、確認／發佈／Update 激活路徑或 requestSubmit／form.submit。缺欄位／歧義／hidden／disabled／不可表示選項在任何寫入前拒絕，setter 拒絕會嘗試靜默回復，不發事件；受控事件重建後的相容性仍未知，不把失敗當成功。e2e 對合成頁所有 Confirm／Schedule／Post 鈕與兩個 form 計數，逐個快速時段要求送出為 0；missing／partial／不可表示分鐘要求欄位不變且所有計數為 0，原網路守門保留。
- **證據與範圍：親查原始骨架的結構計數。** 340748 bytes／4110 行、dialog 在 36／42 行；四個設定 testid 與 select／option 節點均 0，支持上述「沒有設定 DOM」結論，未提交或匯出原檔內容。QUICK_CONFIG 集中所有 testid／name／domain 假設，程式、九語 heading 與文件皆標未驗證；設定缺失會顯示未偵測。開工卡的一按開視窗、自訂／星期與佔用避讓未實作，理由與縮小範圍已寫清楚。遠端 PR 正文讀取失敗（Cache miss），未宣稱已核對其文案；产品开发須在 PR 保留「合成 fixture 原型／真設定 DOM 未驗證」及上述未做範圍。
- **時間、隱私、權限：親讀與本機測試。** 本地 next 9:00／12:30／20:00、從明天開始的工作日 9:00、5 分鐘邊界、跨月年／閏日／DST、12／24h 及精確分鐘選項有測試。新設定 fixture／now 都在 2027+；舊列表假資料讀法不改。新診斷行只有四個非負安全整數，不匯出欄位值；骨架能走進設定 dialog，select／option 的文字只留長度。manifest 除名稱／描述／版本及本地 quick.js 外無新增權限／host／資源；position.js 與 storage 摘要不改，沒有新增儲存／網路或注入。核對 46 張新增截圖與本機生成流程、PNG 無附加 metadata；新增文字／fixture 為假資料或結構計數，未引入真機日期／原始樣本／真帳號／密鑰。老闆實測 5 步包含手動開設定視窗、複製結構及診斷貼回、逐欄確認、不送出或手動改 2027+ 後刪除。

**本複審實跑**：npm test 退出 0（10 檔）；細項 **156 過／0 敗／0 跳過**。verify 退出 0：11 probe 檔／4 SVG，**30 API／14 icon／9 SVG／41 洩漏／21 storage／33 native writer 自測**；diff 空白檢查通過。**外部由产品开发提供**：6f42f83 原版 test 155/155、verify OK、e2e **622 斷言通過**；不是本沙箱執行結果。本輪不改 probe／fixture／e2e，只改 scripts/verify.mjs、兩個測試、AGENTS 與本節；外部在含修正的最新工作樹再跑三測試後提交，預期 e2e 仍保留原 622 斷言，不須為本輪重建截圖。

仍待老闆的新設定骨架與真頁逐欄對照；原生 select／option 合約、React input/change 行為、X 可接受提前量／上限及時區設定都未驗證，合成測試不能代替真頁證據。靜態守門是保守文字掃描，不能當任意 JavaScript 的完整安全證明；本輪同時逐行核對唯一 writer。禁止自動開視窗／確認／送出與公開資料規矩不變。

# 1.0 快速時段 0.1.1：真骨架

## 寫碼前證據

親讀0.1.0設定視窗遮罩骨架（3134節點）與原skeleton.js，不提交原檔或任何真機文字／值。離線以`nl -ba`讀L36–171，再核對attrToken：raw為null或空字串時只印屬性名稱；非空未知data-testid會印=x。**六個select的裸data-testid代表空值，不是前綴被遮掉**；本輪無testid前綴可用。aria-labelledby／label id被遮成x，只有關聯形狀，沒有真id或label詞證據。

| 證據行 | 結構／路徑 | 可判定與不可判定 |
|---|---|---|
| L36／42 | 外dialog → role=group(L40) → aria-modal=true內dialog | 六個選單屬內dialog，不能讓外group重複計數 |
| L86 | 內dialog → 日期group，四個子分支 | 三個select分別在label後，第四分支為日曆鈕＋date input |
| L88–96／91 | 日期group → wrapper → label(id)／select(aria-labelledby)，c=13 | disabled空value＋12選項；文字長度3／4，符合月份，但月份名稱與value真值仍未知 |
| L101–109／104 | 日期group第二wrapper，同關聯，c=32 | 空白＋31選項；文字長度1／2，符合日 |
| L114–120／117 | 日期group第三wrapper，同關聯，c=4 | 空白＋3選項，文字長度4，符合年份；不匯出真年份 |
| L124–132 | 日期group第四分支，label → button／input(type=date,min,max,value) | 另有日期input與日曆控制；是否為同步鏡像未知，不點鈕、不改input |
| L135／139 | 內dialog → 時間group → 四個子wrapper的容器 | 一個提示分支＋三個label/select分支 |
| L141–149／144 | 時間group第一select，c=13 | 空白＋12選項，文字長度1／2；12小時制 |
| L154–160／157 | 第二select，c=61 | 空白＋60選項，文字長度2；分鐘 |
| L165–170／168 | 第三select，c=2 | 兩個文字長度2的選項，無空白；上下午需以九語文字＋順序互相驗證 |

0.1.0只查未驗證scheduledDateField／scheduledTimeField容器與name選單，因此真骨架雖有6個select，schedDialog仍0。修法必須加入真結構分支；不把未知class／遮罩id／空testid當成真選擇器。option value全部=x，**value格式未驗證**，不能直接假設月為1–12或上下午為AM/PM。

## 偵測／填值設計

所有新結構選擇器集中在quick.js的QUICK_CONFIG並附上述行號：真結構分支只接收可見`[role="dialog"][aria-modal="true"]`，日期與時間select必須直接歸屬同一最近group與dialog；aria-labelledby必須唯一指到本group的label，不借背景／別的dialog／重複id。由九語日曆label提示及選項完整域辨識角色；label為中性詞時依域推斷，歧義一律拒絕。日期group另需一個type=date input；時間group支援12h＋兩個上下午選項或完整0–23的24h。原scheduledDateField／scheduledTimeField＋name的合成備援保留，結果不改；不新增class或猜測testid前綴。

數字來源是option value或完整數字／日曆單位／九語月份名稱的option文字，寫回實際option.value而非猜一個後端編碼。數值與文字都可識別但不一致時拒絕；只有**整個0–11域與十二個月份文字都一致差1**才接受零基月份。12h域必須完整1–12，24h必須完整0–23；目標日／分／年不可表示時不半填。AM／PM須有兩個可用且值唯一的選項，第一個文字確認上午、第二個確認下午；若value也可辨認AMPM，必須與文字及順序一致。未知上下午文字／逆序／duplicate value（含disabled同值選項）／hidden目標選項均拒絕。這是保守的判定規則，不宣稱已知真X的value格式。

目標年份不存在時九語明示「目標年份不在 X 的選項中」，其他缺選項／日期越界也有獨立九語錯誤。維持本地Date四個未來時段與至少5分鐘餘量。date input只讀min/max作本地日曆日期預檢，不寫value／min／max、不點日曆鈕：骨架沒有同步鏡像或事件行為證據，不能把它當必填控制項；X自己的React事件可能同步它，還需真頁確認。

唯一writeNativeControls用原生HTMLSelectElement.prototype.value setter先寫整組，再送每個select的bubbles input/change，最後逐欄檢查連線及value。任何setter／事件後讀回不符，都嘗試對**全部原節點**還原原值，整組還原值先於還原input/change事件。還原讀回成功才顯示「填值失敗，已還原」；React若回收節點、拒絕還原或重設欄位，明示「還原不完整」，不對新節點猜測補寫，不宣稱成功。無setter完全不寫，預檢失敗完全無事件。0.1.0的「setter部分失敗後靜默還原」測試依本輪授權改為驗證整組還原事件與零click／submit，沒有放寬失敗或送出斷言。

## 骨架／隱私／送出守門

新增select／label專用data-testid出口；只保留短ASCII且由固定日曆UI詞彙組成的值（例如合成select-month／month-label），拒絕@／URL／email／UUID／數字ID／未知身份詞。其他元素照舊，未知合法testid也可能遮成x，這是刻意保守。原先空testid新版仍印裸名稱，不能還原不存在的前綴。label文字、id／aria-labelledby、option文字與value仍遮罩，select／option文字只留長度，沒有新增值型診斷；schedDialog／dateCtl／timeCtl／selects仍是純計數。

verify原API／注入／storage／激活與防送出規則全保留；只更新逐行核對的quick.js精確來源摘要，唯一writer（含還原）只能對已預檢select派送input/change。原33 native writer攻擊保留，再加讀回／bounds／上下午檢查被刪、原生setter替換、派送到body及點擊別名攻擊為39；原41洩漏自測保留，加入select／label兩個新出口各7個身份攻擊成55。position.js來源與摘要不動；manifest 權限／host／resources／matches與293589f一致，無新增依賴，$0。

三份`fixtures/quick-real-*.html`是精簡結構重建：保留內外dialog／group、label＋aria-labelledby、空testid、select選項數量及date input；所有id、文字、value及日期為新生成假資料，年份2027／2028／2029。Form／送出計數器是測試專用合成結構，不宣稱骨架證明有form。variant year-missing只保留2027；rollback以頁面change handler一次拒絕目標hour，不修改production或extension prototype。用Python掃新fixture：無URL／email／@handle／UUID，日期年份均>=2027，id只允許fake-/fixture-/合成測試按鈕；原骨架只有讀取，未轉存／提交任何真值。

## 實跑／外部待跑

0.1.1 的單元測試為 **169 過／0 敗／0 跳過**（11 個測試檔）。verify 通過：11 個 probe 檔、4 個 SVG，**30 API／14 icon／9 SVG／55 leak／21 storage／39 native writer 自測**。涵蓋真骨架結構辨識、四個時段、12 AM／PM、24 小時制、分鐘刻度、選項數字與文字映射、label 關聯、缺年份及日期界線的零寫入、讀回失敗後整組還原，以及九語錯誤提示。reader 的讀法沒有改動，只更新版本。

外部在 `737d242` 實跑 `npm test` 169/169、verify OK；e2e 的原合成快速時段與真骨架重建情境均通過，但**完整 e2e 未通過**：最後的網路守衛抓到 Chrome 為 `input type=date` 自繪日曆指示器時產生的 `data:image/svg+xml` 請求。它是瀏覽器內建圖示，不是擴充發出的請求，也不會連線出去；仍不能因此把這次 e2e 記成通過。

### 本次 e2e 修法：只隱藏 fixture 的內建圖示

採第一案，在三份 `quick-real-*` fixture 的樣式加上 `input[type=date]::-webkit-calendar-picker-indicator{display:none}`，並在 e2e 真骨架情境前註明原因。已掃描所有 fixture，只有這三份含日期輸入框。這個樣式只隱藏測試頁的瀏覽器日曆圖示，保留原生 date input、value、min/max 及所有填值／還原斷言；擴充本身的行為不變。

**沒有新增 data: 豁免**：`scripts/network-policy.mjs`、網路守衛及「0 擴充資源請求」斷言均未修改。本輪依交接不在沙箱啟動 e2e server，也不生成截圖；CSS 能否消除該筆請求，交由外部重跑確認。

外部實測（2026-10-10 19:40 UTC+8，含本次 fixture 修正）：`npm test` 169/169、verify OK、`npm run e2e` **OK — 686 斷言**；網路段 78 筆本機 fixture／favicon／頁面導覽、0 擴充資源／背景請求、1 次使用者點擊的前往 Scheduled，日期圖示的 data: 請求已消失。

外部請在最新工作樹跑 `npm test` → `npm run verify` → `npm run e2e`，沿用 Chrome for Testing／Xvfb／`CHROME_PATH`。快速時段情境保留：真結構計數 1／3／3／6、四個時段逐欄比對、12 小時換算、日期 input 不寫入、缺年份零寫入／零事件、讀回失敗後整組還原且 input/change 各 12 次，以及 Confirm／Schedule／Post／calendar click、form submit 全為 0。兩個 JavaScript world 都用 2027 年假時鐘，production 沒有時鐘覆寫；權限仍與 `293589f` 相同。

已核對 e2e 實際輸出路徑：

- `docs/v1.0-quickfix-real-detected.png`
- `docs/v1.0-quickfix-real-filled.png`
- `docs/v1.0-quickfix-year-missing.png`
- `docs/v1.0-quickfix-rollback.png`

上述四張快速時段截圖由外部產生，使用 2027 年以後的假資料。舊列表情境另存 quickfix 前綴，沿用既有合成日期（包含 2026 年），不是老闆真機資料；既有 gate0 與 v1.0-quick 截圖不覆寫。完整 e2e 已由外部實跑通過；複審結果見下節，老闆真頁逐欄驗收仍待完成。總覽沒有帶入此分支。

## 老闆實測（≤5步）

1. 更新 repo 至本版 commit；PR 合併後，可在 main 執行 `git pull --ff-only origin main`。
2. 在`chrome://extensions`重新載入probe/，確認0.1.1；回到 x.com 重新整理頁面。
3. 在x.com發文框自己打開原生排程對話框，再點Dagaz浮層的一個快速時段。
4. 逐欄核對月／日／年／時／分／上午下午與原生畫面一致，**不要按排程**；若必須送出測試，先手動選2027以後的年份，測完到Scheduled刪掉。
5. 按「複製頁面結構」和「複製診斷」貼回；若出錯附畫面，真機資料不提交公開repo。

## 已知限制／是否需再貼骨架

需要0.1.1新版骨架及診斷，搭配逐欄實測確認偵測／React接受結果；原骨架已足夠證明結構，但**option真value、label實際詞與React受控行為尚未驗證**。空testid下一次仍為空；若出現非空且屬安全UI詞彙，新出口才可見，其他字串仍遮罩。option仍只輸出長度，不能靠新版骨架確認全部值編碼；若仍失敗，再請回報不含推文或真日期的label詞／下拉編碼類型（例如月份0基或1基、上下午顯示文字），不需帳號或真id。

日曆input未直接同步，原生事件是否更新X內部狀態不能由合成fixture證明；若React重建欄位，原節點可能無法完整還原，錯誤會要求自行檢查。多個設定dialog、重複label id／多重aria-labelledby、未知上下午詞／選項順序、無法安全映射的值一律拒絕。原本X可接受提前量／上限、DST與本地時區、自訂／星期／佔用避讓未做的限制沿用0.1.0。本版仍不開X排程視窗、不確認／排程／發佈、不背景發文。

## 1.0 快速時段 0.1.1 Codex 複審

獨立 Codex session 審 PR #13，與寫碼 session `01a1212e` 不同。範圍為 `293589f...f3513d4` 全部差異，另親讀本機遮罩 picker 骨架並核對上表行號；原檔沒有轉存或提交。50 張新增 PNG 已逐張檢視，皆為 fixture 範例，未發現真機內容或文字型 metadata。

沒有發現需改 production 的阻擋問題。唯一 writer 只對原生 select 設值與派送 input/change，事件後讀回整組，失敗時還原原節點；節點回收或還原遭拒會回報不完整。補強既有單元測試：change handler 以新 select 取代原節點，新節點保留頁面設定的值、收到 0 個事件，其餘原欄位全部還原，結果不得當成功。防 click／submit／滑鼠鍵盤事件規則與原 33 項 writer 攻擊仍在，新增六項及真 CLI 違規退出測試通過；摘要豁免仍只有 quick.js 的 dispatchEvent 一條。

select／label 的 testid 出口只接受固定日曆 UI 詞彙，身份、URL、email、數字 ID、UUID、未知字串與 option 內容仍遮罩。manifest 除版本外與基準完全相同。已比對 network-policy.mjs 與 e2e 最後網路檢查區塊，兩者與基準逐字相同：沒有 data: 豁免，0 擴充資源／背景請求斷言保留。三份新 fixture 的日期均為 2027+ 合成資料，新增文字未發現密鑰或已禁用身份字串。

本輪修正兩項文件問題：快速時段的四張截圖為 2027+，舊列表截圖沿用合成 2026 日期，不能混稱；外部完整 e2e 已通過，不再列為待跑。README／HANDOFF／本節實測步驟也修正 `git pull main` 的錯誤命令，補上重新整理 x.com，仍為五步。production、verify、fixture、e2e 均未修改。

本輪實跑 `npm test` 通過 11 個測試檔；目前 Node 26 的預設報告以檔案彙總，另以 `node --test --test-isolation=none --test-reporter=tap test/*.test.mjs` 核對 **169 過／0 敗／0 跳過**。`npm run verify` 通過 **30 API／14 icon／9 SVG／55 leak／21 storage／39 native writer 自測**。沙箱未跑 e2e；外部在 `f3513d4` 的結果為 **686 斷言、78 筆本機請求、0 擴充資源／背景請求**，本輪沒有改動其執行程式或頁面。未 commit／push／merge，也未碰 author 或 overview 工作。

結論 **APPROVE**，適用於這個保守填欄位測試版。option 真編碼、React 接受事件與日期 input 同步仍待老闆逐欄驗證，不能宣稱真頁填值已驗收；靜態文字掃描也不是任意 JavaScript 的完整安全證明。外部提交本輪文件／測試補強後，依 repo 流程在最新提交跑三項測試，e2e 仍須在沙箱外執行。

# 1.0 快速時段 0.1.2：填值根因

## 寫碼前核對

本輪只修快速時段。原始骨架及截圖留在外部證據目錄，不複製進 repo；以下只記結構、長度與程式證據。以 Python 比較 0.1.0 與 0.1.1 骨架的 L86–173，輸出 `L86–173 equal: True`。

| 項目 | 骨架證據 | 結論 |
|---|---|---|
| 月 | L91–96：13 個 option，第一個 disabled 且 value 空；其餘文字 9×3、3×4 字 | 符合月份文字形狀；無法區分 value 的 1、01 或 0 起 |
| 日 | L104–109：空白＋31；文字 9×1、22×2 字 | 符合日數；value 是否補零未知 |
| 年 | L117–120：空白＋3；每個文字 4 字 | 符合三個年份；真年份與 value 格式不匯出、不記入 repo |
| 時 | L144–149：空白＋12；文字 9×1、3×2 字 | 符合 1–12 的 12 小時制；value 格式未知 |
| 分 | L157–160：空白＋60；每個文字 2 字 | 不是每 5 分鐘一格；文字可能補零，但 value 是否補零仍未知 |
| 上下午 | L168–170：兩個 option、無空白；每個文字 2 字 | 結構符合上下午；不能證明 value 是 AM/PM、a/p 或其他編碼 |
| testid | 六個 select 都只印 `data-testid`；0.1.1 skeleton.js attrToken 在 raw 空字串時先回傳屬性名 | 真值為空，不可拿 testid 當欄位依據 |

對照本輪起點的 0.1.1 quick.js：L119–133 以 option value 數字與日曆文字互相核對；零基月份要求完整 0..11 與月份文字一致。L111–117 上下午要求文字與順序一致，可辨識 value 也須一致。這些配對已能處理部分格式，但骨架沒有真 value，不能宣稱格式已驗證。

L243、L249–250 已使用 `Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set` 與 bubbles input/change；因此「完全沒用原生 setter 或事件」不是根因。L223–227 的順序為月→日→年→時→分→上下午；L255–258 先批次設值、再送事件、隨即同步讀回，且沿用最初節點參照。**順序與重繪等待不足是可確認的流程缺陷**：年月事件若重建日選單，後續事件會拿到舊節點；受控欄位在下一次重繪修正時，同步讀回也無法可靠反映結果。老闆回報的「已還原」代表原 writer 捕捉失敗且原節點恢復，不能從這句判定是哪一欄。

最可能是受控欄位的相依事件與同步讀回共同造成失敗，仍標為**推測**；骨架無法證明 React 的事件處理、節點回收或上下午自動修正。也不能排除其他 setter／事件拒絕。報錯類型也是線索：0.1.1 的缺年份／缺目標選項／日期越界會在預檢直接回報獨立錯誤，不進 writer；老闆看到「已還原」表示至少這次已通過預檢，之後才在設值或事件讀回失敗。因此不能直接把原因說成月份補零或分鐘刻度不足。0.1.2 需以安全逐欄診斷分辨，不猜 option 編碼。

## 離線假頁重現與修法

`node /tmp/xsched-fill-sync-repro.mjs` 載入 main `162a838` 的 0.1.1 quick.js 與本版 writer，用同一份合成 picker 模擬「每次 change 同步重繪整組受控值，不換節點」。輸出：

```text
0.1.1 result=failed periodAfterRepaint=AM change=12
0.1.2 result=filled periodAfterRepaint=PM change=6
fill=ok y=2028 m=1 d=1 h=8 min=0 period=PM
```

批次寫好六欄不代表六欄都已進入受控狀態：第一個事件重繪時，還沒送事件的欄位會被舊狀態蓋回去。這個機制能重現老闆見到的「失敗、已還原」，因此是目前最可能的原因；**真頁是否採用這種重繪時機仍是推測**。上述年月日時分皆為假資料，不是老闆真機值。

另跑 `node /tmp/xsched-fill-repro.mjs`，用假頁的 rAF 上下午自動修正模型：0.1.1 同步回報 filled，但重繪後變成 AM；0.1.2 回報 failed 並還原，診斷為 `failed=period`、`field=period target=PM value=PM read=AM options=AM|PM`。這證明同步讀回可能漏掉延後修正，不能用它宣稱填值成功；也不能把此模型當作真 X 的行為證據。兩個暫存重現腳本不提交；正式回歸測試留在 `test/quick-fill.test.mjs`。

0.1.2 的唯一 writer 改為年→月→日→上下午→時→分，每欄都重新辨識同一個原始 dialog 的唯一控制項。原生 setter 後立刻送 input/change，等 microtask、rAF，再以 25ms 間隔最多讀六次；需連續兩次一致才繼續，最後再讀回整組。rAF 有 80ms 後備，背景分頁不會無限等待；觀察期間不重試寫入目標值。尚在填值時停用快速時段鈕，避免兩個操作交錯。

月份以完整 0..11 value 範圍辨識零起，任何可解析文字必須全域一致為零起或一開始；1／01 也依實際 option value 回填。上下午以順序及九語文字／value（含 a/p）交叉核對，歧義拒絕。原合成備援也使用同一套保守映射，不再只比較裸 value。

失敗先記錄還原前的六欄讀回，再按同樣順序、原生 setter＋事件與等待，還原全部原值。年月改動造成日 select 替換時，只能在原 dialog、原 group、唯一有效 label 關聯下找到新節點；不靠位置、class 或任意新節點補寫。節點消失、選項不再存在或 X 拒絕還原，明示「還原不完整」，不宣稱成功。日期 input 仍只讀 min/max，不直接同步。

## 診斷、骨架與隱私

成功加一行 `fill=ok y=… m=… d=… h=… min=… period=AM/PM/24h`；12 小時制的 h 是原生小時值，搭配 period 看。失敗有填值結果／失敗欄位，再逐欄列出 target、value（目標 option 編碼）、read（還原前讀回）、options（前 3 個＋最後 1 個 value）。尚未辨識到完整欄位時不採樣其他 DOM，read/options 印 x；target 此時是本地時間的邏輯值。資訊由內部記憶體提供，不讀頁面可竄改的診斷 dataset，不存 localStorage。

兩個出口共用 skeleton.js 的安全函式：只保留 **1–4 位數字**、空值標記 empty，以及固定短上下午詞彙；長數字 ID、日期字串、URL、email、handle、UUID、任意本文與 opaque 編碼一律 x。不是任何字母都能當列舉。骨架只在 dialog 內、且非 article／tweetText 的 select 行加 `option-values=` 樣本；option 文字、逐個 option 的其他屬性與 id 仍照舊遮罩。這是本輪授權新增的日曆欄位診斷，並非放開本文或任意屬性。

verify 的靜態禁令與舊自測保留：新增 11 個 option value 洩漏攻擊，55→66；新增 7 個非同步 writer 邊界改寫攻擊，39→46。更新 quick.js 與 content.js 的精確來源摘要；ui.js 的作者 factory 未動，既有摘要仍一致。作者連結、網路、storage、CSS／資源／URL／解構守門均保留。manifest 權限、host、資源、matches 與 `162a838` 一致；reader 只升版本，不改讀法。

## Fixture、外部 e2e 與已知限制

`scripts/build-quick-fixtures.mjs` 不讀原骨架，只依上述結構表重建八份 `quick-real-*` 假頁。基礎頁的 option 數量及文字長度符合骨架，變體用來測缺年份、讀回拒絕、1／01／0 起與中文上下午 value。所有新日期為 2027–2029。受控模型只認原生 setter＋input/change，直接寫 instance value 會被重繪蓋回；年／月會重建日 select。單元測試另覆蓋同步重繪、閏月日數、最後一欄事件改回先前欄位，以及全組還原。

日期圖示沿用 main 的 fixture-only CSS，隱藏 Chrome 內建指示器；`scripts/network-policy.mjs` 與最後的 0 擴充請求斷言未改，沒有 data: 豁免。e2e 保留舊情境及全部零 click／submit 斷言，新增四種編碼各四個時段、控制項替換、fill=ok、上下午延後修正後整組還原、六欄診斷與實體複製。等待條件要求整個非同步操作結束，不以第六次 change 就當成功。原小時拒絕情境的事件數改成 11（五欄嘗試＋六欄還原），上下午拒絕是 10（四欄嘗試＋六欄還原）；每欄與全組還原斷言仍在。

截圖由外部 `npm run e2e` 產生，前綴全部改為 `docs/v1.0-quickfill-`，不覆寫舊截圖。新增重點圖為 real-detected、real-filled、numeric、padded、zero、period-values、autocorrect、diag-failure、year-missing、rollback；舊列表情境沿用合成日期，四個時段及新的 picker 情境均 2027+。這個沙箱仍不能 listen，本輪完整 e2e／截圖交外部，不能宣稱 Chrome 已通過。

仍待老闆確認真 option 編碼、React 事件與相依欄位重繪、日期 input 是否由 X 同步，以及 X 的實際最小提前量。六次有界讀回不是任意延遲的永久保證；若 X 更晚才修正，仍須逐欄核對。欄位或 group 回收後無法安全辨識會拒絕，還原可能不完整。自訂時段、星期設定、佔用避讓與總覽均不在本輪。

## 老闆實測（≤5 步）

1. PR 合併後，在 main 執行 `git pull --ff-only origin main`。
2. 在 `chrome://extensions` 重新載入 `probe/`，確認 0.1.2；重新整理 x.com。
3. 在發文框自己打開 X 原生排程對話框，按 Dagaz 浮層的一個快速時段。
4. 逐欄核對月／日／年／時／分／上下午，**不要按排程**；若必須送出測試，先手動選 2027 年以後，測完到 Scheduled 刪掉。
5. 按「複製診斷」貼回，成功也貼一次（應含 fill=ok）；失敗看逐欄 read/options，必要時再貼新版「複製頁面結構」。真機資料不提交公開 repo。

## 0.1.2 本輪測試結果

`npm test` 12 檔通過；細項 TAP（含子測試）196 過／0 敗／0 跳過。verify OK：30 API／14 icon／9 SVG／66 leak／21 storage／46 native writer／22 author／160 URL／28 author boundary／158 解構／514 資源／308 CSS 自測。語法、diff 空白、八份 fixture 結構／去識別掃描通過；manifest 除版本外不變，網路政策與 e2e 最後守衛逐字保留。完整 Chrome e2e 與截圖本輪未跑，需外部執行。

還原按原日曆值在當前選項中唯一映射，即使原 raw token 仍存在，也不能優先把它當成原月份。原值為空則只能恢復唯一空白選項。欄位及 date bounds 每次填前再查；本文／article 內的控制項排除，input 後若節點斷線或移出原 dialog，不派送 change。複審補修的回歸結果見下節。

## 1.0 快速時段 0.1.2 Codex 複審

獨立 Codex 與寫碼 session `01a1212e` 不同，審查 `162a838...290476b` 全部差異。親讀外部 0.1.1 骨架及填值失敗截圖；兩版骨架 L86–173 確實逐字相同。截圖可證明偵測六欄及 writer 回報失敗，不能證明 React 的重繪時機或 option 真編碼。文件把這些列為推測，沒有將合成重現宣稱為真頁證明。原始證據未複製或提交。

複審先以新增回歸重現兩項高嚴重度問題：

- 最後一欄事件把月份編碼由 1..12 換成 0..11，重繪仍選 raw `1`，已代表二月；原 writer 卻只比 raw token 而回報 `filled`。修正每欄與最後整組讀回，按當前唯一映射核對目標日曆值；失敗診斷也以當前映射判定欄位，能正確列出 month。
- 還原時舊 raw `1` 仍存在，原 writer 優先採它，將原本一月還原成二月卻宣稱已還原。改為按初始日曆值重新映射，還原的等待與最後整組確認也使用日曆值；無法唯一映射就回報不完整。空白原值只允許恢復唯一空白。

另補一項中嚴重度邊界：input handler 把原節點移出 dialog 但仍連在 document 時，原檢查會繼續派送 change。現在在 input/change 前均要求最近 dialog 仍是本次原 dialog；回歸確認移出的 year 收到 0 次 change，操作回報還原不完整。三項均保留所有 X/calendar/send click 與 form submit 為 0 的斷言。

`scripts/verify.mjs` 的既有 API、權限、storage、作者連結、URL／資源／CSS／解構及防送出規則未放寬。原 46 項 writer 攻擊保留，舊讀回改寫樣本更新為新判定的等價位置，再加日曆讀回、還原 raw 優先及 dialog 邊界的三項攻擊為 **49**。新 quick.js 完整摘要為 `f780b40ae0a8a8f4138d2b28fa89d0746146104b47c0536b328187d440d4d25e`；AUTHOR_* 摘要、ui.js、position.js 原樣且相符。

option 樣本仍共用原安全函式，只有 1–4 位數字、空白標記及固定短上下午詞彙，沒有新增文字出口。manifest 除版本外與基準相同；network-policy.mjs 與 e2e 最後網路守衛逐字相同。八份 fixture 年份均 2027+、無身份／網址，生成腳本可在 /tmp 重建出逐字相同檔案。57 張變更 PNG 已逐張核對為 fixture 範例，沒有文字型 metadata；沒有提交老闆真機資料。

補修後實跑 `npm test` **12 檔通過**，展開 TAP **199 過／0 敗／0 跳過**；verify **30 API／14 icon／9 SVG／66 leak／21 storage／49 native writer／22 author／160 URL／28 author boundary／158 解構／514 資源／308 CSS 自測**全部通過。主代理提供的複審前 e2e 是 **911 斷言通過**；本沙箱未跑 Chrome，且本輪修改 writer，最新完整 e2e 必須交外部重跑。沒有 commit／push／merge。

結論 **APPROVE（本輪工作樹補修已納入）**，合併前須外部提交補修並在最新提交重跑三項。真頁 option 編碼、React 接受與相依重繪、日期 input 同步仍待老闆五步逐欄驗收；有界讀回不能保證任意更晚的修正。不宣稱本版已通過真頁驗收。
