# HANDOFF：閘 0（可行性）

更新：2026-10-09（UTC+8），產品開發（CodeWhale，deepseek-flash）。分支：`gate0/scheduled-read`；閘 0.1 在 `gate0.1/probe-fixes`（見文末）。

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
4. **Logo B（Dagaz）接續複審**：產品開發已推送首輪複審 `abd42d8`，並新增 Logo commit `587aca2`。SVG 在 `docs/xsched-logo-B*.svg`；16／32／48／128 PNG 在 `probe/icons/`，與指定來源逐位元相同。manifest 只加 icons，沒有 action／額外權限／web_accessible_resources。Codex 在同一複審 session 補嚴格圖示／SVG 守門及 Chrome 資源讀取測試；本輪仍只在本機 commit，不 push／merge，測試數字見 `notes/GATE0.md`。

## 閘 0.1：真機浮層修正（probe v0.0.2，分支 `gate0.1/probe-fixes`）

老闆真機載入 0.0.1 **看不到任何浮層**，並提供診斷；取得方式未知，不能推定浮層曾可見。詳見 `notes/GATE0.md`「閘 0.1」一節。

### 已完成（CodeWhale 首版已 commit 並 push；下列測試為歷史數字）

1. **無條件掛載**：任何 x.com 頁都掛浮層；非 Scheduled 收成膠囊「xsched 探針：非 Scheduled 頁」（仍可展開看診斷／按鈕）；Scheduled 讀到 0 則也顯示「讀到 0 則」＋診斷。host 掛 `document.body`（無 body 才 `documentElement`），inline `all:initial;position:fixed;z-index:2147483647;display:block`＋`!important` 防覆蓋；`MutationObserver` 偵測 host 被移除即重掛（節流）。
2. **`mounted` 修正**：改成真實掛載狀態（`isConnected` 且有尺寸 >0）；新增 `remounts=`（重掛次數）、`items=`（則數）；診斷加 `lang=`（`navigator.language`）、`doclang=`（`documentElement.lang`，皆經 `sanitizeLang`）；`timeFail>0` 加 `samples=` 遮罩樣本（≤3 個、每個 ≤60 code point，只取時間樣本最小節點，數字保留、其餘換 `x`）。
3. **新鈕「複製頁面結構」**：純模組 `probe/skeleton.js`（node 可測）；屬性／class／aria／data-* 全部遮罩，只留短列舉值；涵蓋 shadow／同源與跨源 iframe；同構兄弟收 `×N`；上限 6000 節點／深度 60。
4. **測試**：`npm test` 57 過；`npm run verify` 加攻擊樣本 self-test（12 leak self-tests，有牙）；`npm run e2e` OK 211 斷言（新增 selectors-broken／remount／skeleton 三情境，維持擴充 0 網路請求）。
5. **fixture**：`fixtures/selectors-broken.html`（Scheduled 頁但結構不同＋陌生時間格式）。**截圖**：`docs/gate0.1-*.png`、範例骨架 `docs/gate0.1-skeleton-sample.txt`（舊 `docs/gate0-*.png` 保留）。

### 未完成／下一步

1. **不改讀法選擇器、不猜新選擇器**（依指示）；真機 `cell=0`／`l1=l2=l3=0` 的問題要等老闆貼回「複製頁面結構」再修。
2. 請老闆照 `notes/GATE0.md`「閘 0.1」的 ≤5 步重測：載入 0.0.2 → 開 Scheduled 頁 → 確認右下有浮層（「讀到 N 則」）→ 複製骨架立即貼入回覆草稿，再把新診斷附在同一份草稿貼回 → 若仍無浮層回報 `chrome://extensions` 有無錯誤。
3. 視貼回的骨架修選擇器／標籤／時間格式；真頁通了才進 1.0。
4. 使用者提供本分支 PR #3（base main）；Codex 複審只在本機 commit，未 push／merge／改 main。

### 已知限制

- **真頁未驗證**（不能登入 X）；「浮層看不到」的單一確因未證實，本文區分程式事實與推測，不宣稱排除所有可能。
- 時間樣本遮罩後只剩數字骨架，格式判讀仍需老闆貼回的樣本與語系。

## 下一步（閘 0 原線）

1. 产品开发推送本機複審 commits 到 PR #2，PR 說明更新 reviewer、最新測試數字／截图與已知限制；交商務拓展。
2. 請老闆照 `notes/GATE0.md` 的五步在自己的 Chrome 實測並貼回「複製診斷」。
3. 視實測結果修選擇器／標籤／時間格式；真頁通了才進 1.0。

## 硬規矩（違反不能合）

不用 X API／不用任何 API、不加任何網路請求、不攔截或 patch 頁面 fetch／XHR／GraphQL、不注入 page-world、不發文／不點送出／刪除／編輯、probe 只讀 DOM（不 click、不自動捲動）、不用 innerHTML／outerHTML=／insertAdjacentHTML／document.write、UI 只在 shadow root、權限最小、診斷不含推文內容／帳號／網址、$0、不登入任何 X 帳號、不推 secret。詳見 `AGENTS.md`。

## 閘 0.1 Codex 接續複審（本機提交）

- 真機根因仍未知；scope=2 是 dialog enum，舊 host 在 documentElement，signature 已檢查 isConnected。不能從取得診斷推定浮層曾可見，誤述已修。
- lang 只留已知語言碼／script／region；class 不留任意可讀前綴；role／testid 等值走固定 UI 白名單。時間樣本排除 tweetText 後代、年份內文與聚合列，先遮罩；iframe 只留 hostname，剝除帳密／埠／路徑。
- 所有屬性名保留；簽名預處理也受 6000 節點／60 深度限制；shadow 文字、iframe 子樹參與比較。長度不同的兄弟保留。
- 每 3 秒最多建立 3 次，400ms 輪詢在窗口過後恢复；忽略自家 mutation；mounted 需連線＋寬高 >0。clipboard 同步拒絕也有 textarea，重複失敗不累積備援。
- 舊 docs/gate0-*.png 已還原且保留；virtual 改存 docs/gate0.1-virtual-{before,after}.png。
- 本輪只本機 commit，不 push／merge／改 main；最新實跑測試數字見 GATE0.md 閘 0.1 §5。交产品开发更新 [PR #3](https://github.com/punkcanyang/xsched/pull/3) 的 reviewer／結果與 READY 內容。

STATUS READY：xsched 閘 0.1 — PR #3（https://github.com/punkcanyang/xsched/pull/3）

交产品开发／商務拓展：Codex 獨立 session 已修 UI 重掛、診斷／骨架隱私、有限遍歷與文件根因誤述；讀法仍依公開來源，真 DOM 未驗證，X 改版仍可能讀到 0。無新增權限、無擴充網路請求／儲存，花費 $0，未登入／未連真 X。複審後本機實跑 npm test 64/64、verify 24/14/9/15 自測全過、e2e 214 斷言、38 本機請求／擴充 0。假資料範例在 docs/gate0.1-*.png 及 skeleton-sample.txt；老闆實測 5 步與已知限制見 GATE0.md 閘 0.1 §6–7。建議合併本輪探針修正，保留「有條件可行」。請更新 PR 說明並轉給老闆；本 session 未寫外部應用／未 push／未 merge。
