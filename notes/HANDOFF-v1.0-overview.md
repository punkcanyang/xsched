# xsched 0.2.0 — 排程總覽

基準 main `8693756`（0.1.6），分支 `v1.0/overview-020b`。遠端 `v1.0/overview` 停在 0.1.0 的 live 列表＋捲動標亮；本版改為「任何頁面看快取列表」，沒有把舊的 nativeRow／scrollIntoView 帶進來。

## 範圍

- 只做總覽。不加權限、不發網路請求、不替使用者按排程／發佈、不捲動或點原生列。
- Dagaz 浮層在任何 x.com 頁面顯示上次讀 Scheduled 留下的**頁面記憶體**快取：依時間排序的日期、時分、上下午、跨年與前 20 字，以及最後同步時間。
- 尚未同步、已確認沒有排程及可能過期各有九語提示，並沿用既有固定 `location.assign("https://x.com/compose/post/unsent/scheduled")` 按鈕。
- 不把本文寫進 localStorage。位置模組與六個已授權 key 不變。整頁重新整理後記憶體快取清空，需再同步。
- 版本 0.2.0。fixtures／截圖只用示例資料。

## 完成內容

- 新增 `probe/overview.js`：純資料（排序、格式、snapshot、九語）。snapshot 只留 time／preview／at／unparsed／sample，不含 body／key。
- `probe/content.js`：成功讀完 Scheduled（含未解析列）時寫入記憶體快取；已確認空列表才清空；忙碌／載入中不清。非 Scheduled 頁用 `.overview-time`／`.overview-preview` 顯示快取，不重用 `.time`，以免更動既有則數／時間斷言。浮層外殼 `overflow: hidden`，只讓 `.panel-body` 捲動，避免總覽把快捷區擠出換行、改變已存矩形。
- 守門：overview.js 由既有規則全掃，不豁免 click／scroll／storage。AUTHOR_CONTENT_SHA256 因接線更新；ui／quick／position／composer 未改。

## 複審前的測試紀錄（aecc099；不是本輪驗證結果）

- `npm test`：254/254 過（含 `test/overview.test.mjs` 與 content VM 總覽回歸／連續三次走查）。
- `npm run verify`：OK。原自測數量不減（30 API／14 icon／9 SVG／66 leak／37 storage／64 writer／22 author／160 URL／28 author boundary／158 解構／514 資源／308 CSS）。
- `npm run e2e`：OK，1536 斷言。Chrome for Testing 155.0.8059.79，`env -u DISPLAY` 交給 xvfb-run。0 擴充資源／背景請求，恰好 1 次使用者點擊的 Scheduled 頂層導覽。連續走查 3 次 empty → Scheduled 同步 → SPA 回首頁均過。截圖 `docs/v1.0-overview-{empty,scheduled,cached-home}.png`（合成 2027+ 假資料）。

## 已知限制

- 快取不是完整即時列表：未捲到底、刪除／編輯、跨分頁或整頁重新整理後會過期或清空。
- 本版不做周視圖，也不點擊跳到 X 上那則編輯。
- 診斷仍只含命中數，不含推文內容。
- 總覽在快速時段之前，打開就能看到標題與第一列／提示。其餘內容仍在浮層內捲動；原生控制項避讓與視窗上限優先，不會為了內容把面板撐出視窗。


## PR #20 第 1 輪 P1 補修（接手未提交改動）

只處理 REVIEW-020b-r1 的五個 P1，版本維持 0.2.0。兩個 P2 已列在 `notes/BACKLOG.md`，未改共用點擊／等待或星期格式。

1. **第一屏**：總覽放在 `.quick-controls` 之前；定位前納入已完成 layout 的總覽高度，仍受原避讓／視窗上限限制。e2e 移除截圖前的 `showOverview()`，直接量未捲動的標題與 `.overview-preview`／`.overview-empty` 和 `.panel-body` 的可見交集。
2. **短視窗**：虛擬／尚未捲完的列表把目前視窗併入既有總覽，保留未出現在視窗中的列。只用這次新讀到的預覽修正列，避免 live 累加器的舊本文版本再次進入總覽；空的虛擬視窗也不能清快取。完整列表及已確認的非虛擬空列表仍可取代快取。
3. **總數與最近倒數**：九語顯示總覽快取總數，選最近的未來排程顯示日／時／分；全數已過時顯示最近一則距今多久。沿用既有 poll 更新，不新增計時器或儲存。
4. **狀態**：未同步沒有 `.overview-sync`，不借用數字時間快取的 `readAt`；已確認空列表有實際同步時間及零則；未讀完整或重入載入中的舊總覽顯示可能不完整／過期提示。繁中未同步沿用原來的「快取是空的。去 Scheduled 頁同步一次。」以保留既有精確斷言，已確認空列表另用「已同步，目前沒有排程」區分。其他八語亦有三份不同文案。
5. **同時間改文**：總覽更新簽章納入前 20 字及未解析狀態。MutationObserver 只有在節點陣列非空且全為自家 host 時才略過，空陣列不能當作自家變動而跳過重讀。

三個接手紅燈的處理：動態陣列索引寫入改用 Map，既有 verify 規則原封不動；預覽重讀修正上述觀察器與簽章；新測試 `evening text changed!` 長 21 字，預期改成前 20 字 `evening text changed`，沒有更改程式的 20 字上限。撤回上一手對既有斷言的改寫，保留原斷言並另加新斷言。`scripts/verify.mjs` 只同步 content SHA，沒有變更規則或自測數量。

快取仍只在這個頁面的記憶體，不存本文、不增加 localStorage key／權限、不發請求、不點擊或捲動 X 的原生列。quick／ui／position／composer 與 manifest 均未改。

### 本輪驗證

- 聚焦：content 53/53、overview 10/10。
- 完整 `PATH=/home/box/.local/bin:$PATH npm test`：15 個測試檔全過，0 失敗；另逐檔獨立程序核對細項為 262/262，0 失敗。`node scripts/verify.mjs`：OK，13 個 probe 檔／4 個 Logo，1,410 個自測；原 30／14／9／66／37／64／22／160／28／158／514／308 數量全部保留。
- 已依指定路徑實跑 `CHROME_PATH=/tmp/cft/chrome/linux-155.0.8059.39/chrome-linux64/chrome npm run e2e`，在建立 HTTPS fixture server 時退出 1：`listen EPERM: operation not permitted 127.0.0.1`。尚未執行任何瀏覽器斷言，不能宣稱本輪 e2e 通過；需在可 listen 的外部環境重跑。新增 e2e 包含同時間改文、長列表→離開→短虛擬視窗、已確認空列表，以及第一屏／總數／倒數／狀態的斷言。
- 本輪未產生或覆寫 docs 截圖，不必還原無關截圖。新增情境預定輸出 `docs/v1.0-overview-incomplete.png`、`docs/v1.0-overview-confirmed-empty.png`；原三張總覽截圖也改由未捲動的第一屏產生，待外部執行。
- 沒有 commit／push。

補充：另試把所有測試放進同一個 `--test-isolation=none` 程序時，跨檔共用的全域／時區狀態會互相干擾；這不是 package.json 的正式測試跑法，本輪沒有改測試入口或處理其跨檔隔離。細項數量另以每個測試檔獨立程序核對，262/262 全過。


### 外部 e2e 補修：reset restores both automatic default rectangles

外部已確認 262/262 與 verify 通過，但 gate0.5 的雙位置重設矩形斷言失敗。根因是本輪新增的事後增高：`positionUI()` 先依快速區高度決定並保存自動錨點，再從正文溢出量增加 `panelMinimum`；重設則拿已增加的下限重新選自動位置。相同內容因為先前定位／增高的順序不同，會算出不同的預設矩形。這不是斷言過時。

本次把已完成 layout 的總覽內在高度納入定位前的 minimum 量測，刪除定位後逐次增高的迴圈。第一次開啟、已拖曳位置整頁重載及重設都走同一個量測與定位流程，保留既有原生控制項避讓與視窗高度上限。尚無可用正文 layout 時，不把不可用的量測加進下限。沒有改 e2e 或放寬既有高度／矩形斷言，verify 只同步 content SHA。

新增一個直接相關 content 回歸：用總覽加快速區超過 2/3 預設高度的幾何模型，記錄初始矩形、載入手動位置、重設並連續 poll 三次，逐次確認雙矩形回復、位置 key 持續清空。

實跑：`PATH=/home/box/.local/bin:$PATH npm test` 15/15 檔全過；content 54/54；`node scripts/verify.mjs` OK，1,410 個自測數量不變。指定 Chrome 的 `npm run e2e` 仍在本機 server 階段因 `listen EPERM: operation not permitted 127.0.0.1` 退出，0 個瀏覽器斷言；需外部完整重跑才能確認全綠。本次沒有改截圖，也沒有 commit／push。

### 014 首屏高度

外部 e2e 紅在 `014 just opened: full quick area, all five slots and interval save visible`。開層時 `positionUI()` 還沒寫入 height，flex 欄的 `.panel-body`（`min-height:0`）`clientHeight` 為 0，總覽高度被跳過，面板停在 2/3；總覽卻已插在快速區之前，把五個時段和間隔儲存擠出可見框。修正：先套用當前 size.height 再量測；`.overview` 只留摘要與第一列／空提示，其餘列放到快速區之後；拿掉摘要底下 8px 邊距並收緊標題，讓 1280×600 視窗上限（568）仍放得下完整快速區。既有 014 與第一屏總覽斷言未改。

開層未捲（014 `quick-real-numeric`、未同步摘要）實測：

- 1280×820：總覽摘要 33px、快速區 337px、面板 592（高於 2/3=546）
- 1280×600：總覽摘要 33px、快速區 337px、正文可見 378、面板 568（視窗上限）
