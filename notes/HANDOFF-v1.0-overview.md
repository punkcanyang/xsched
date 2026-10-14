# xsched 0.2.0 — 排程總覽

基準 main `8693756`（0.1.6），分支 `v1.0/overview-020b`。遠端 `v1.0/overview` 停在 0.1.0 的 live 列表＋捲動標亮；本版改為「任何頁面看快取列表」，沒有把舊的 nativeRow／scrollIntoView 帶進來。

## 範圍

- 只做總覽。不加權限、不發網路請求、不替使用者按排程／發佈、不捲動或點原生列。
- Dagaz 浮層在任何 x.com 頁面顯示上次讀 Scheduled 留下的**頁面記憶體**快取：依時間排序的日期、時分、上下午、跨年與前 20 字，以及最後同步時間。
- 快取是空的：九語提示「去 Scheduled 頁同步一次」，並沿用既有固定 `location.assign("https://x.com/compose/post/unsent/scheduled")` 按鈕。
- 不把本文寫進 localStorage。位置模組與六個已授權 key 不變。整頁重新整理後記憶體快取清空，需再同步。
- 版本 0.2.0。fixtures／截圖只用示例資料。

## 完成內容

- 新增 `probe/overview.js`：純資料（排序、格式、snapshot、九語）。snapshot 只留 time／preview／at／unparsed／sample，不含 body／key。
- `probe/content.js`：成功讀完 Scheduled（含未解析列）時寫入記憶體快取；已確認空列表才清空；忙碌／載入中不清。非 Scheduled 頁用 `.overview-time`／`.overview-preview` 顯示快取，不重用 `.time`，以免更動既有則數／時間斷言。
- 守門：overview.js 由既有規則全掃，不豁免 click／scroll／storage。AUTHOR_CONTENT_SHA256 因接線更新；ui／quick／position／composer 未改。

## 測試

- `npm test`：既有檔案加上 `test/overview.test.mjs` 與 content VM 總覽回歸／連續三次走查。
- `npm run verify`：原自測數量不減。
- `npm run e2e`：舊情境只改 0.2.0 版本期望；新增空快取、現場列表、SPA 快取、AM/PM／跨年排序，連續走查 3 次。截圖 `docs/v1.0-overview-{empty,scheduled,cached-home}.png`。

## 已知限制

- 快取不是完整即時列表：未捲到底、刪除／編輯、跨分頁或整頁重新整理後會過期或清空。
- 本版不做周視圖，也不點擊跳到 X 上那則編輯。
- 診斷仍只含命中數，不含推文內容。
