# AGENTS.md — 在 xsched 工作的規矩

給任何 coding agent（Cursor、Grok Build CLI、Codex、DeepSeek／CodeWhale…）。不需要聊天紀錄，照這份做。

## 這是什麼

xsched：Chrome 擴充（MV3），改造 x.com 頁面，幫老闆操作 X 原生的排程視窗：快速選時段、自動預排、排程總覽。

## 先讀

1. `docs/plan/ROADMAP.md`：閘 0 → 1.0，目前在哪一步。
2. `docs/plan/cards/开工卡-X预排推文扩展-2026-10-09.md`：**卡就是規格**。
3. `docs/plan/X预排推文-竞品-2026-10-09.md`：競品與空缺。
4. `notes/`：产品开发的筆記與交接（HANDOFF）。

## 誰負責

- **老闆**（Punkcan）：拍板、真帳號測試（只在他自己的 Chrome）。
- **商務拓展**：寫規格／開工卡、驗收、把結果轉給老闆。
- **产品开发**：實作、開 PR、找複審、合併。
- 規格有疑問、要加權限、要花錢：停下來回報商務拓展，不要自己決定。

## 硬規矩（違反就不能合）

1. **不用 X 官方 API，不用任何 API**，不連我們自己或任何第三方伺服器。
2. **不發任何網路請求**：不 `fetch`／XHR／`sendBeacon`／WebSocket／EventSource，不用 CDN。要有 `scripts/verify.mjs` 之類的守門腳本擋掉，它只能加強、不能放寬。
3. **只改造 x.com 頁面、只操作 X 原生的排程視窗**。推文一律靠 X 原生排程發出。
4. **擴充絕不自己定時發文、不在背景發文**。所有操作都由老闆在頁面上的動作觸發（自動預排也只是把「發文」改成走 X 排程，最後仍是 X 排程發出）。
5. **權限最小**：content script 只匹配 `x.com`／`twitter.com`；資料只存本機。要加任何權限或 host 一律停下，老闆批准才做。
6. 診斷只放命中數，**不含推文內容**、帳號、網址。
7. **不在共享機器上登入老闆的 X**（不碰 @VibeEyeX，也不碰老闆個人號）。真帳號測試一律由老闆在自己的 Chrome 做；開發用本機模擬頁／fixture。
8. 花費 $0；任何要花錢的（含 Chrome Web Store US$5）先問。repo 保持 private。
9. 不推 secret；不改別人的分支和檔案（`notes/` 是产品开发的）。

## 怎麼工作

- **分支 + PR**：從最新 `main` 開分支（例如 `gate0/…`、`feat/…`），一件事一個 PR。
- **同一件事同一個 session** 做完，不中途換。任何工具都**不用 Fast 模式**（例如 Grok 4.7 用 high）。
- **複審**：由**不同的 session／模型**審，Opus 5.5 有額度就用，沒有就 Grok 4.7 high（非 Fast）另開 session。PR 說明寫明是誰審的。
- 測試：建好 `package.json` 後至少要有 `npm run verify`（權限與網路請求守門）和 fixture 測試（模擬 X 的 Scheduled 列表與排程視窗）。PR 前全部要過，名字寫進這份文件。
- **本 repo 的測試（PR 前三個都要在最新分支上跑過）**：
  - `npm test`：`node --test` + linkedom，測 `probe/reader.js`（五語系解析、各層備援、去重累加、空列表、非 Scheduled 0 命中、診斷不含內容）。
  - `npm run verify`：`scripts/verify.mjs`，掃 `probe/` 擋網路 API／`innerHTML`／`eval` 等，並檢查 manifest 權限最小（含會抓違規的 self-test）。
  - `npm run e2e`：`scripts/e2e.mjs`，用 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server ＋ `--host-resolver-rules` 把 x.com 指到 127.0.0.1，驗證浮層計數／時間、虛擬化累加、非排程頁 0 命中、擴充無額外網路請求，並產生 `docs/gate0-*.png`。需要 Xvfb（`DISPLAY` 空時自動 `xvfb-run`）與 `CHROME_PATH`（預設 `/tmp/cft/.../chrome`）。

## READY 的標準（PR 說明裡要有）

1. 做了什麼（閘 0 要附 DOM 依據、讀取方式、改版風險）。
2. 權限、網路請求、花費的確認。
3. 複審模型與 session。
4. 測試結果。
5. **範例資料**截圖（不能是老闆的真實推文或帳號）。
6. **老闆實測步驟 ≤6 步**（閘 0 是 ≤5 步）。
7. 已知限制。

完成後**叫商務拓展**：發一則「STATUS READY：xsched <階段>」，附 PR 連結與上面 1–7。沒有 agent 間訊息管道時，把同樣內容留在 PR 說明，請老闆轉。
