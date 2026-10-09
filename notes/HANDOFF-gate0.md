# HANDOFF：閘 0（可行性）

更新：2026-10-09（UTC+8），產品開發（CodeWhale，deepseek-flash）。分支：`gate0/scheduled-read`。

## 現況

- Cursor 雲端額度用完，老闆定：交接後改用 **CodeWhale（deepseek-flash，--auto）寫碼、Codex（gpt-6.1-sol，reasoning high，非 Fast）複審**。寫與審分開 session，同一件事同一個 session。session id 記在 `/workspace/bd-punkcan/codewhale-sessions.md`（共享機）。
- 前一個 Cursor agent（bc-4ccfe624）做過：公開來源調查、probe、fixtures、單元測試、verify、e2e、截圖，但**全部沒推上 GitHub**。其 transcript 在共享機 `/workspace/cloud-agent-transcripts/bc-4ccfe624-6779-50dd-a364-c7e84e29b01c.jsonl`，抽出的線索在 `/workspace/xsched-clues/`（只當線索，未驗證）。

## 已完成（本次 CodeWhale session，已 commit 並 push 到 `gate0/scheduled-read`）

以下為 CodeWhale 首版的歷史紀錄；複審後的行為、診斷代碼與測試數字以 `notes/GATE0.md` 為準。

1. **DOM 依據表** → `notes/GATE0.md` §1：每條附來源 URL、標「已親讀／未親讀／推論」、真頁一律「未驗證」。
2. **`probe/` 最小 MV3 唯讀探針**（name `xsched gate0 probe`，v0.0.1）：
   - `reader.js`：純讀取邏輯，classic 共享腳本（IIFE，只掛 `globalThis.XSCHED_READER`；因 Chrome content script 不支援 ES module import，已實測）。多層選擇器 L1 cell → L2 a11y → L3 文字掃描，scope 備援（aria-controls → dialog → primaryColumn → region → body）；五語系時間解析，解析不出標 `unparsed` 不猜；虛擬化累加去重。
   - `content.js`：SPA 路由（MutationObserver＋location 輪詢＋popstate，**不 patch history**）；右下可收合浮層（open shadow root、textContent＋createElement）；「複製診斷」只含計數／布林／版本。
   - `manifest.json`：MV3、**無 permissions／host_permissions／storage**、`content_scripts.matches` 只 `https://x.com/*` 與 `https://twitter.com/*`。
3. **`fixtures/`**：en／zh-Hant／zh-Hans／ja／ko 各一、empty、virtual（捲動換 cell）、roles（無 testid，只剩 role/aria）、home（首頁，須 0 命中）。全部假資料，頂部註明「依公開來源重建，非真頁快照」。
4. **`test/reader.test.mjs`**：`npm test`＝20/20 過（linkedom）。
5. **`scripts/verify.mjs`**：`npm run verify` 過；擋 fetch／XHR／WebSocket／sendBeacon／EventSource／innerHTML／outerHTML=／insertAdjacentHTML／document.write／eval／new Function／importScripts／chrome.debugger／webRequest，檢查 manifest 權限最小；含 self-test 證明會抓違規。
6. **`scripts/e2e.mjs`**：`npm run e2e` 過；真 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server（自簽憑證、port 0）＋ `--host-resolver-rules` 把 x.com 指到 127.0.0.1。驗證各語系 2 則、roles 走 a11y、empty 0、virtual 3→6（測試程式自己捲）、home 0、擴充無額外網路請求。
7. **截圖**：`docs/gate0-{en,ja,zh-Hans,zh-Hant,ko,roles-fallback,empty,virtual-before,virtual-after}.png`。
8. **`notes/GATE0.md`**：依據表、讀法、改版風險、結論（**有條件可行**）、老闆實測 ≤5 步、讀不出來的替代方案、已知限制。
9. `package.json`（private, type module；devDeps 只有 `puppeteer-core`＋`linkedom`，未下載 Chrome）＋ `.gitignore`。`AGENTS.md` 補上 `npm test`／`npm run verify`／`npm run e2e` 說明。

## 複審後現況（交給产品开发／商務拓展）

1. **獨立複審已完成**：依老闆指定，由 Codex 在本次獨立 session（與 CodeWhale 寫碼 session 不同）讀完整差異、直接修正守門／日期／scope／去重／浮層節流與清理／e2e 網路證據／文件。最新結果以 `notes/GATE0.md` §5 為準，PR 說明請補上複審身分與結果。
2. **PR 已開**：[PR #2](https://github.com/punkcanyang/xsched/pull/2)，`gate0/scheduled-read` → `main`（使用者提供的 PR 資訊）。複審只在本機 commit，**未 push、未 merge、未改 main 或 PR 說明**；由产品开发推送複審 commits 並更新 PR 的 1–7。
3. **老闆真帳號實測**（在他的 Chrome，`AGENTS.md` 規矩 7）：照 `notes/GATE0.md` §6 的 ≤5 步；回報「複製診斷」與語系。**在真頁驗證前，結論只能是「有條件可行」。**

## 下一步

1. 产品开发推送本機複審 commits 到 PR #2，PR 說明更新 reviewer、最新測試數字／截图與已知限制；交商務拓展。
2. 請老闆照 `notes/GATE0.md` 的五步在自己的 Chrome 實測並貼回「複製診斷」。
3. 視實測結果修選擇器／標籤／時間格式；真頁通了才進 1.0。

## 硬規矩（違反不能合）

不用 X API／不用任何 API、不加任何網路請求、不攔截或 patch 頁面 fetch／XHR／GraphQL、不注入 page-world、不發文／不點送出／刪除／編輯、probe 只讀 DOM（不 click、不自動捲動）、不用 innerHTML／outerHTML=／insertAdjacentHTML／document.write、UI 只在 shadow root、權限最小、診斷不含推文內容／帳號／網址、$0、不登入任何 X 帳號、不推 secret。詳見 `AGENTS.md`。
