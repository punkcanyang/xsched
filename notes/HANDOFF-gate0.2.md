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

- 規劃＋寫碼：Codex 0.162.0 `-m gpt-6.1-sol` reasoning high（非 Fast），寫碼 session：（待填）
- 複審：Codex gpt-6.1-sol high，另一 session：接回 `01a12013-6780-77c1-9466-bb1e9f78097f`
- CodeWhale 暫停，不用來寫碼。

## 進度

- [ ] 寫碼 session 規劃＋實作
- [ ] 測試全過、截圖
- [ ] PR
- [ ] Codex 複審
- [ ] merge --no-ff 到 main、push
