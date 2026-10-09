# HANDOFF：xsched 閘 0.2（probe 0.0.3：Dagaz 快捷鈕＋讀法結構整理）

更新：2026-10-09 23:05（UTC+8）。分支 `gate0.2/shortcut-button`，基準 main `d875959`。

## 任務（老闆改優先序：xsched 第一，經商務拓展轉來）

1. x.com 右下圓形快捷鈕（Dagaz Logo，`probe/icons/`、`docs/xsched-logo-B*`）：點＝開關排程浮層；不在 Scheduled 頁時提供一鍵前往 `https://x.com/compose/post/unsent/scheduled`；不擋 X 原生發文鈕等控制項；把 0.0.2 的小膠囊整合進這顆鈕；被移除自動重掛（沿用 0.0.2 機制）；九語 aria-label／tooltip。
2. 版本 0.0.3（manifest＋package.json）。
3. 讀法：**不猜新選擇器**（老闆尚未貼 0.0.2 骨架）。只把選擇器集中、方便之後接骨架與補 fixture，**不改行為**。
4. 診斷第一行清楚印版本；舊快取（manifest 版本與執行中 content script 不符）要明顯可見。
5. 測試：`npm test`、`npm run verify`、`npm run e2e` 全過；e2e 新增快捷鈕情境（掛上、開關、被移除重掛、不擋模擬頁發文鈕、0 網路請求）；截圖 `docs/gate0.2-*.png`，box 複本 `/workspace/xsched-shots/gate0.2/`。
6. 不再打包 zip；老闆 pull main 後載入 `probe/`。

## 工具與 session

- 規劃＋寫碼：Codex 0.162.0 `-m gpt-6.1-sol` reasoning high（非 Fast），寫碼 session：`01a1212e-3e31-74f3-ba55-1c3c643723cb`（`codex exec resume 01a1212e-3e31-74f3-ba55-1c3c643723cb "..." </dev/null`）
- 複審：Codex gpt-6.1-sol high，另一 session：接回 `01a12013-6780-77c1-9466-bb1e9f78097f`
- CodeWhale 暫停，不用來寫碼。

## 進度

- [ ] 寫碼 session 規劃＋實作
- [ ] 測試全過、截圖
- [ ] PR
- [ ] Codex 複審
- [ ] merge --no-ff 到 main、push

## 寫碼計畫（本 Codex session）

1. 集中 reader 的既有選擇器、標籤、路徑與時間格式，不改解析／讀取行為；建立真骨架 fixture 說明與自動發現測試。
2. 加入九語快捷鈕字串與 DOM SVG Dagaz；44px 按鈕、預設 bottom 112px、矩形避讓可見原生控制項，浮層向上展開；保留手動開關與有限重掛。
3. 升 0.0.3；診斷／浮層顯示 script 與 manifest 版本，捕捉 runtime invalidated。舊 script 保留連線於隱藏容器避免其輪詢互搶，新 session 可清理自己的 observer。
4. 守門不放寬：既有規則禁止 href 寫入，使用固定目標 location.assign 按鈕；e2e 驗證目標與實際導覽、桌面／窄版原生鈕可點、版本、接手及 0 請求。
5. 分塊 commit；實跑 npm test / verify / e2e、只產生 gate0.2 截圖，更新文件與結果。另一個 Codex session 複審；本 session 不 push、不開 PR、不改 main、不打包 zip。
