## 0.3.0 排程日曆（實作完成，待外部 Chrome e2e／獨立複審）
- 老闆已授權固定 localStorage 版本化日曆（時間＋最多 20 字＋同步時間／部分標記），及兩分鐘一次性的 sessionStorage 編輯目標；新模組各受 SHA 鎖定，不增加權限或網路 API。
- 已做：切頁／整頁 reload／隔日恢復，24h 提示，日期分組／排序／分鐘差，七欄六週月曆與切月／Esc／關閉，唯一相符原生列只點一次，零／多列只提示／高亮，親按成功即持久化，部分視窗合併、完整同步移除舊項、清除資料。
- 測試：完整 npm test 17/17 檔（content 60、calendar030 11）；verify 保留原 1,410＋新 31 項；e2e／新模組語法與 diff check 通過。未在 listen EPERM 沙箱跑 Chrome，所有新 e2e／實體命中與 0 資源背景請求待外部，沒有沿用歷史通過結果。
- 三處既有行為斷言調整及版本／前提異動逐條見 `notes/HANDOFF-v1.0-calendar-030.md`；沒有改等待逾時或放寬其他守門。沒有 commit／push／切分支。
- 限制：快取非即時；跨帳號需先清除再同步；未載入／同時間同 20 字碰撞不代點；未知時間不持久化。真 X 原生編輯器仍待老闆自己的 Chrome 確認。

## 0.2.3：穩定 020 cached short window home（已修碼，待外部完整 e2e 連跑驗證）
- 根因已用真 content VM 重現：`lastLocation` 原本只由 400ms poll 更新。上次 poll 讀 `/home` 後，測試刪列表節點並切 Scheduled，MutationObserver 的 60ms tick 先讀出短列表；若下一個 poll 前又用 `replaceState` 回 `/home`，poll 比較到兩次都是 `/home` 就不排 tick。`replaceState` 不產生 DOM mutation／popstate，之後一直重畫舊 Scheduled report，mode 卡住。不是等待不足，也不是 isolated world 的 URL 不同步。
- 修法：只由 tick 記錄這次實際讀取的 URL，poll 比較目前 URL 與最後讀取 URL；初始化不先標成已讀。保留原 60ms／400ms、全部斷言、逾時及 verify 守門，沒有加重試或 CDP 喚醒。
- 只新增一個直接相關測試：`test/content.test.mjs` 的 `URL polling follows a mutation-driven short Scheduled read between two home polls`，舊碼最後得到 `scheduled`（預期 `other`）而失敗；修正後一次正常 poll 即為 `other`／0 live rows，五則快取與不完整提示仍保留。資料／時鐘為合成 2027+。
- 版本同步 0.2.3；既有測試只換版本期望字串，沒有改行為斷言。verify 只同步 content SHA；權限／網路／其他摘要不變。
- 本機驗證：`npm test` 16/16 檔通過；單獨真 content VM 58/58 通過；`npm run verify` 通過，原 1,410 項自測全保留；`git diff --check` 通過。
- 本機 Chrome e2e 在 fixture server 的 `listen EPERM: operation not permitted 127.0.0.1` 被沙箱擋住，未執行瀏覽器斷言；需外部完整連跑五次確認穩定性。
- 未產生 docs 變更。依指示嘗試 `git checkout -- docs` 因 `.git/index.lock` 唯讀而失敗；`git clean -fdq docs` 成功，`git status --short --untracked-files=all -- docs` 為空。沒有 commit／push／切分支。


## 0.1.4 使用者走查（2026-10-11 21:31）發現的問題，不在本版範圍
1. 浮層開著時，用 SPA 切到 Scheduled，但列表還沒載入（0 列）。這時 tick 裡的 `report.empty && !times.length` 會直接清掉快取，連「剛才排的」最後時間也一起清掉。要加防抖，或只在確定列表真的是空的時候才清。建議先在真機確認：X 在載入中時，會不會被讀成空列表。
2. 老闆按下排程、對話框關閉之後，快取其實已經更新了，但狀態列還是顯示「已填入欄位；尚未排程」，會讓人誤會。
3. 整頁載入新的發文框時，浮層預設是收起的，要再按一次 Dagaz 才會打開。真 X 大多走 SPA，可能不會發生，待真機確認。
4. 鈕和浮層各自定位，鈕被拖到浮層上時，會蓋住浮層的按鈕（例如「複製診斷」）。預設位置下，也會蓋住右下角的 @punkcan 連結。

## 0.2.0 排程總覽複審第 1 輪 P2（本輪不修）
1. 星期固定英文（Sun–Sat），未解析列的「時間樣本」寫死中文，與九語文案不一致。既有 live 列表的 formatTime 也用英文星期。不擋合併。
2. e2e 改了共用點擊與等待（xvfb 逾時 180 秒改成 300 秒、clickShadow 先命中取樣再退回中心點擊、重載後矩形未對上立刻丟錯），不只加總覽情境。斷言文字沒有放寬。不擋合併。

## 0.2.2 小修（2026-10-15）
- 拿掉「明天 12:30」快速時段（老闆真機回報從來沒設好）。根因未確認：合成 fixture 與既有 12 PM／:30 測試都通過。
- 待辦：請老闆在真機用「隨機」或手動時間碰到 12:xx 失敗時附「複製診斷」，看是哪一欄（hour／period／minute）被 X 改掉，再決定寫入器是否要修。
- 隨機時段仍可能產生 12:xx／:30。

## 0.2.1 急修（2026-10-15）
- 0.1.4 第 2 項（排程後狀態列）：0.2.1 起觀察到親按排程完成時狀態列與總覽一起更新。
- 未做：完全手動（不用快速時段）在原生視窗排程，不會被觀察，總覽要等下次讀 Scheduled。

## 0.2.1 複審第 1 輪 P2（Grok 4.7 high，session 6d742433，APPROVE；本輪不修）
1. `editorFor` 在排程鈕所在 dialog 對不到唯一編輯框時改讀整頁唯一編輯框；首頁 modal 卸下編輯框、inline 發文框還在時，前 20 字可能來自另一則。建議 dialog 內對不到就回 null。
2. 親按「排程」但 `editorFor` 回空時不清掉上一筆 draft，下次可能交出上一則的前 20 字。
3. draft 逾期只在 `takeDraft` 時判斷，觀察沒成功就留在閉包直到 dispose（只在記憶體）。
4. `previewOf` 先壓縮連續空白再切 20 字，Scheduled 讀取的 `previewText` 不壓，兩邊前 20 字可能不同。
5. 同一分鐘兩則：`mergeSnapshots` 以時間為鍵，第二則換掉預覽、則數不加（既有規則）。
6. 「同一個 dialog 節點事先沒有 select、內容換成 picker」的分支沒有獨立 fixture 鎖住（現有 fixture 是插入新的內層 dialog）。

## 0.2.2 複審第 1 輪 P2（Grok 4.7 high，APPROVE；本輪不修）
1. `probe/ui.js` 九語 `QUICK_STRINGS.slots` 第二格仍是 `12:30`。畫面不讀這個陣列（標籤由 `slotLabel` 依實際時間組成），`test/quick.test.mjs` 仍要求長度 4。之後若用索引對 `VISIBLE_SLOT_IDS` 會錯位，要一起改。

## 0.2.3 複審第 1 輪 P2（Grok 4.7 high，APPROVE；本輪不修）
1. 新回歸測試先改 pathname 再 mutate，鎖住「tick 讀到 Scheduled 後 poll 誤判沒變」，但沒鎖 e2e 的微順序：observer 排程時 URL 仍是 /home、同一 turn 才 replaceState 到 Scheduled。若有人把 lastLocation 改成在 schedule() 當下寫，現有單元測試仍過、e2e 會回到失敗。可補一支「先 mutate 再改 pathname、再 flush」的測試。

## 0.3.0 複審第 1 輪 P2（Grok 4.7 high，APPROVE；本輪不修）
1. `probe/calendar.js` 建立時 `takeTarget()` 接受 sessionStorage 裡任何合 schema、兩分鐘內的目標。x.com 頁面腳本可先寫入 `xsched.probe.calendarTarget`，下一頁載入時就可能對恰好一列點一次（只開編輯器，不送出）。可改為記憶體內 nonce／只接受本擴充剛寫入的目標。
2. HANDOFF 表格的 `test/content.test.mjs:1243–1247` 行號已移到約 `:1295–1299`。
3. 全頁月格固定週日起始；zh／ja／ko／de／fr 常見週一起始未做。
