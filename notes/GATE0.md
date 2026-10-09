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

更新：2026-10-09（UTC+8），產品開發（CodeWhale，deepseek-flash）。分支：`gate0.1/probe-fixes`。
**本階段只修探針本身，不改讀法選擇器、不猜新選擇器**（真正讀法修正等老闆貼回骨架再做）。

## 1. 真機回報

老闆在他的 Chrome 載入 0.0.1 後**看不到任何浮層**，貼回「複製診斷」：

```
xsched-gate0 v0.0.1 onScheduled=1 tab=1 scope=2 cell=0 button=5 listitem=0 link=0 tweetText=1 phrase=1 l1=0 l2=0 l3=0 layer=0 mounted=0 timeOk=0 timeFail=1 unparsed=0 loose=0 needsScroll=0 virtualized=0 empty=0 scrolled=0
```

可讀出的訊息：`onScheduled=1`（頁面判斷正確）、`scope=2`（找到 2 個 scope 候選）、`cell=0`（沒有 `cellInnerDiv`）、`button=5`、`phrase=1`（有 1 個節點含時間字樣）、`l1=l2=l3=0`（三層都 0 命中）、`timeFail=1`（唯一命中的時間短語解析失敗）。

**他貼得回診斷＝浮層其實有掛載過**（否則沒有「複製診斷」可按）。所以這是「浮層看不見」而非「完全沒執行」。同時 `mounted=0` 是 **bug**：舊 `reader.js` 把 `mounted` 寫成 `items.length`（等於「讀到幾則」而非「浮層是否掛上」），因此 `mounted=0` 不代表浮層沒掛。

## 2. 根因分析

真機只回傳一則診斷，**無法 100% 斷定**「看不到」的單一原因；且我們**不能登入 X**（規矩 7），真頁未驗證。以下分兩類誠實寫：**最可能原因**與**已全部防護的可能**。

### 最可能原因（依診斷與程式碼推斷，非確證）

1. **`hide()`／`onScheduled` 抖動把浮層藏起來**：舊 `content.js` 只在 `onScheduled` 判定為排程頁時才顯示浮層，非排程頁走 `hide()`。X 是 SPA，`onScheduled` 在路由／tab 抖動時可能來回翻轉，浮層被反覆 `hide()`；老闆若停在一個被判為「非排程頁」的瞬間，就完全看不到。
2. **host 被 X SPA 重繪移除後沒重掛**：舊版把 host 掛在某個會被 X 換掉的容器，X 重繪（虛擬列表、modal 開合）把 host 連根拔除；舊版**沒有**「host 被移除就重掛」的觀察器，於是浮層消失且不再出現。
3. **signature 快取跳過重繪**：舊版用「簽名」避免重複渲染，一旦 host 被移除而快取簽名沒變，就不會重建 host → 永久消失。

### 已全部防護的可能（本階段逐一處理）

- **掛載點錯（掛 documentElement 而非 body）**：現在一律掛 `document.body`，沒有 body 才退回 `documentElement`。
- **X `#layers`／modal 疊層蓋住浮層**：host 用 inline `z-index:2147483647`，且不依賴 X 的堆疊脈絡。
- **CSP 擋 `<style>`**：浮層樣式**全部**用 inline `style.setProperty(..., "!important")`，不插 `<style>` 標籤。
- **shadow host 樣式被 X 覆蓋（`display`／`all`／z-index）**：host 設 `all:initial` + `position:fixed` + `display:block` + z-index，全部 `!important`；panel 內容仍在 shadow root 內隔離。
- **非排程頁整個不顯示**：現在**無條件掛載**——任何 x.com 頁面都有浮層；非 Scheduled 頁收成小膠囊「xsched 探針：非 Scheduled 頁」，仍可展開看診斷與按鈕；Scheduled 頁讀到 0 則也顯示「讀到 0 則」＋診斷。
- **host 被移除沒重掛**：`MutationObserver` 監看，偵測 host 被移走就立刻重掛（3s／40 次節流，避免與 X 互搶無限迴圈），並計 `remounts=`。
- **`mounted=` 名不符實**：改成真實狀態——`host.isConnected` 且有尺寸（>0）才 =1；另加 `remounts=`（重掛次數）與 `items=`（則數）。

## 3. 改動（probe v0.0.2）

- **版本** 0.0.2：`manifest.json`、`probe/reader.js` 的 `PROBE_VERSION`、`probe/skeleton.js` 的 `SKELETON_VERSION`、診斷字首 `xsched-gate0 v0.0.2`、`package.json`。
- **無條件掛載**：`content.js` 啟動即掛；host id `xsched-probe-root`、`data-xsched-host=1`；非 Scheduled 膠囊、Scheduled 顯示「讀到 N 則」。
- **真實掛載狀態**：`hostMounted()`（`isConnected` ＋尺寸 >0）；`remounts`（第 2 次起建立才計）；`items`。
- **時間解析失敗遮罩樣本**：`timeFail>0` 時診斷加 `samples=`，最多 3 個、每個 ≤60 code point。只取「被認出有時間字樣（phrase 命中）但解析失敗」的**最小節點**文字（不取推文內文）。遮罩規則 `maskSample`：數字 `\p{Nd}`、標點 `\p{P}`、空白保留；**其他一律換成 `x`**（含所有 `\p{L}\p{M}` 字母文字與 `\p{S}` 符號／emoji）。多個連續 `x` 不合併（保留長度資訊）。格式：多筆以 `|` 分隔、值經 `encodeURIComponent`，空為 `none`。
- **`lang=`／`doclang=`**：值經 `sanitizeLang`，只允許 `[A-Za-z0-9-]{1,20}`，其他寫 `x`。
- **新按鈕「複製頁面結構」**（純模組 `probe/skeleton.js`，node 可測）：從 `document.body`（Scheduled scope 取不到時整頁）走訪、**排除自家浮層 host**。每節點一行：縮排＋小寫標籤名＋子節點數＋屬性名。短列舉值（role／data-testid／aria-selected／aria-hidden／aria-expanded／aria-checked／aria-current／aria-modal／aria-live／dir／type／tabindex／data-focusable 等：≤32 字、只含 `[A-Za-z0-9_:-]`、不像 uuid／長雜湊）才保留，其餘 `=x`。aria-label／aria-description／aria-valuetext／title／alt／placeholder／href／src／srcset／id／value／name／content／action／style 及非白名單 data-* 值一律 `x`。`class` 只留前綴（最多 3 個 token，各取到首個 `-`/`_` 前或 ≤20 字；像雜湊如 `r-1abcde`、`css-175oi2r` 後段、純 hex 寫 `h`）。文字節點只記 `#text(N)`；註解略過；script／style 只記標籤。涵蓋 open shadow root（`#shadow`）、同源 iframe（`#iframe-doc`，try/catch）、跨源 iframe（`#iframe origin=hostname`，只記 hostname，不記路徑／query）。連續同構兄弟收成 `×N`。上限 6000 節點／深度 60，超過結尾寫 `TRUNCATED nodes=… depth=…`。開頭 header：`xsched-skeleton v0.0.2 path=scheduled|other nodes=N`（不記 URL）。寫入剪貼簿用使用者點擊時的 `navigator.clipboard.writeText`；失敗則浮層內顯示 readonly textarea＋「全選」按鈕（不用 execCommand）。
- **腳本**：`scripts/verify.mjs` 加「攻擊樣本 self-test」（見下）；`scripts/e2e.mjs` 加 selectors-broken／remount／skeleton 三情境。

## 4. 結論

**有條件可行（維持）**。浮層「看不見」的問題已從程式中去除最可能的三個原因（抖動隱藏、移除不重掛、簽名快取），並防護其餘已知可能（掛載點、疊層、CSP、樣式覆蓋、非排程頁隱藏、mounted 名實不符)。**但真頁仍未驗證**（我們不能登入 X），能不能在老闆的真帳號上看到浮層與讀出結果，仍需老闆實測；讀法選擇器本身的修正**不在本階段**。

## 5. 測試

- `npm test`：**57 過 / 0 敗**（`node --test` ＋ linkedom）。含 reader 五語系與備援、skeleton 規則逐條（屬性遮罩／class 前綴與雜湊／×N 收合／shadow／同源與跨源 iframe／截斷）、時間樣本遮罩、`lang`/`doclang` 過濾、`mounted` 真實狀態、診斷不含 fixture 文字。
- `npm run verify`：**OK** — 掃 8 檔 probe ＋ 4 個 Logo SVG；24 API bypass、14 icon、9 SVG、**12 leak self-test**；無禁用 API、權限最小。攻擊樣本 self-test 構造含網址（`https://example.com/a?b=c`）、uuid、email、`@handle`、英中日文內文、帶句子的 aria-label／title／alt／placeholder、長雜湊 class、長 data-* 的一頁，跑 skeleton 與時間遮罩，斷言輸出**不出現**任何上述字串或其片段（≥4 字 ASCII 子字串、CJK ≥2 字）。已驗證有牙：故意讓屬性不遮罩 → FAIL（`skeleton leaked a URL host`），還原後 OK。
- `npm run e2e`：**OK — 211 個斷言**（真 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server ＋ `--host-resolver-rules`）。新增：
  - **selectors-broken**：Scheduled 頁但列表結構完全不同、時間格式陌生 → 浮層仍掛 `mounted=1`、顯示「讀到 0 則」、`timeFail>0`、`samples` 有遮罩樣本且**不含原文字母**；
  - **remount**：測試程式移除 host、再 `document.body.replaceChildren()` → 自動重掛、`remounts≥1` 且 `mounted=1`；
  - **skeleton**：點「複製頁面結構」→ 讀剪貼簿，header 格式正確、不含 fixture 任何文字；剪貼簿被拒 → 顯示 textarea fallback 且持有骨架。
  - 維持各語系 2 則、virtual 3→6（測試程式自己捲）、home 0、**擴充 0 網路請求**（38 個請求全是本機 fixture document／瀏覽器 favicon）。
- 截圖（假資料，**依公開來源重建，非真頁快照**）：`docs/gate0.1-{en,ja,zh-Hans,zh-Hant,ko,roles-fallback,empty,not-scheduled,selectors-broken,skeleton-copied,skeleton-fallback}.png`、範例骨架 `docs/gate0.1-skeleton-sample.txt`。（舊 `docs/gate0-*.png` 保留不覆蓋。）

## 6. 老闆實測（≤5 步）

1. Chrome 開 `chrome://extensions` → 開「開發者模式」→「載入未封裝項目」→ 選 `probe/`（**確認版本 0.0.2**；若已載 0.0.1 先「重新載入」該擴充）。
2. 開 `https://x.com/compose/post/unsent/scheduled`。
3. 確認右下角**一定有浮層**：Scheduled 頁應顯示「讀到 N 則」；非排程頁會收成小膠囊「xsched 探針：非 Scheduled 頁」。
4. 在 Scheduled 頁按一下「**複製頁面結構**」（會複製骨架到剪貼簿），再按「**複製診斷**」。
5. 把這**兩份**一起貼回給我們。**若仍看不到浮層**：回報 `chrome://extensions` 上這個擴充有沒有紅色錯誤（「錯誤」按鈕），把那串錯誤貼回。

> 「複製診斷」只含計數／布林／版本／語系（`lang`/`doclang`）與**遮罩後**的時間樣本；「複製頁面結構」是屬性骨架，**不含**推文內容、帳號、網址。

## 7. 未解決問題

- **真頁未驗證**：我們不能登入 X，浮層與讀法在真帳號上都還沒確認。
- **讀法未修**：`cell=0`／`l1=l2=l3=0`（三層都 0 命中）代表 0.0.1 的選擇器在真頁很可能不合用；本階段**刻意不動選擇器**，等老闆貼回「複製頁面結構」再依真結構修。
- **時間格式未解**：真機 `timeFail=1`（唯一命中的短語解析失敗）；`samples` 遮罩後只剩數字骨架，能否還原格式要看老闆貼回的樣本與語系。
- **浮層「看不到」的單一確因未證實**：本文只寫「最可能原因＋已防護的所有可能」，未捏造確證。
