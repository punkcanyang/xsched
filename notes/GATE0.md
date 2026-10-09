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

- `npm test`：**35/35 過**（五語系、AM/PM／24 小時、跨年／閏年／非法日期／本地時區／DST、scope、chip 排除、各層備援、去重累加、1000 列、非 Scheduled、診斷型別、網路策略、verify CLI 真正 exit 1）。
- `npm run verify`：**過**（掃 `probe/` 3 個檔案；保留原始規則並加嚴，補直接名稱／alias、註解、字串拼接、跳脫、動態 import／資源請求／storage／操作守門；manifest 只接受最小欄位；**24 種繞法 self-test**）。守門是保守的靜態檢查，不能證明任意混淆程式安全，仍需人工複審。
- `npm run e2e`：**過**（真 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server ＋ `--host-resolver-rules` 把 x.com 指到 127.0.0.1）：
  - en／ja／zh-Hans／zh-Hant／ko 各 **2 則**、時間字串正確；
  - roles（無 testid）走 **a11y 層**；
  - empty＝**0 則**；virtual＝**3 → 6**（測試程式自己捲，斷言 `scrolled` 0→1、`virtualized=1`、提示文字在）；
  - 虛擬列表同 scope 空列表 **6→0→3**，scope 替換 **3→0**；SPA 路由／attribute-only tab 切換；頻繁 mutation 不餓死 reader；穩定頁面不反覆重建控制鈕；composer chip 不計數；pagehide 清理與 bfcache 重啟；
  - home、Drafts、picker（故意保留選中 Scheduled tab）＝**浮層隱藏／0**；
  - clipboard：點擊前 **0** 次寫入、點擊後 **1** 次；篡改 dataset 放假帳號／URL／時間／內容，複製結果仍只有數字欄位；
  - **163 個斷言過**；網路 **32** 個請求全部是本機 fixture document／瀏覽器 favicon，**擴充请求 0**。Puppeteer 攔阻任何額外請求，CDP 再檢查 type 與 extension initiator（包含同 URL 的 Fetch 也拒絕）；其餘 DNS host 一律解析失敗。
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
