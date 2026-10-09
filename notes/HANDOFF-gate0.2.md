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

- [x] 寫碼 session 規劃＋實作
- [ ] 測試全過、截圖
- [ ] PR（由老闆安排，本寫碼 session 不開 PR）
- [ ] Codex 複審
- [ ] merge --no-ff 到 main、push

## 寫碼計畫（本 Codex session）

1. 集中 reader 的既有選擇器、標籤、路徑與時間格式，不改解析／讀取行為；建立真骨架 fixture 說明與自動發現測試。
2. 加入九語快捷鈕字串與 DOM SVG Dagaz；44px 按鈕、預設 bottom 112px、矩形避讓可見原生控制項，浮層向上展開；保留手動開關與有限重掛。
3. 升 0.0.3；診斷／浮層顯示 script 與 manifest 版本，捕捉 runtime invalidated。舊 script 保留連線於隱藏容器避免其輪詢互搶，新 session 可清理自己的 observer。
4. 守門不放寬：既有規則禁止 href 寫入，使用固定目標 location.assign 按鈕；e2e 驗證目標與實際導覽、桌面／窄版原生鈕可點、版本、接手及 0 請求。
5. 分塊 commit；實跑 npm test / verify / e2e、只產生 gate0.2 截圖，更新文件與結果。另一個 Codex session 複審；本 session 不 push、不開 PR、不改 main、不打包 zip。

## 寫碼交付狀態（2026-10-09，本 session 最終結果）

- [x] 簡短計畫先寫本檔；快捷鈕／九語／固定 Scheduled 導覽／SPA 開關／矩形避讓／重掛已實作。
- [x] 0.0.3、版本 mismatch／runtime invalidated、舊 0.0.2 UI 接手與新版 dispose。
- [x] READ_CONFIG 集中既有選擇器／標籤／時間格式；未加新讀法。基準 d875959 的 60 組快照一致。
- [x] real fixture 自動发现與說明、真 content.js DOM 測試、守門加強、文件。
- [x] npm test / verify 實跑；補充不隔離程序測試：73 項，72 過／0 敗／1 跳過。
- [ ] 外部 Chrome e2e／截圖：本 session listen EPERM 阻塞，沒有浏览器斷言或新圖，不能標 READY。
- [ ] 另一 Codex session 複審、後續 PR／merge／push 由老闆安排；本 session 不做。

### Git 狀態與提交

本 session 嘗試 `git add`／commit 時失敗：`.git/index.lock: Read-only file system`；本 session 沒有成功建立 commit。工作期間外部在同分支建立快照：

- `b3a1684` — `wip(gate0.2): Codex write session snapshot — Dagaz shortcut, 0.0.3, version diag, selector config (in progress)`。

這是 WIP，**不含全部最後修正**。後續尚未提交檔案包含 AGENTS.md、ROADMAP、GATE0、本 HANDOFF、content.js 位置／runtime 整理、e2e 網路證據、verify 導覽守門、content.test.mjs 的 DOM mock 隔離、review.test.mjs 的導覽拒絕案例。不可直接把 WIP 當驗收完成。

外部可依剩餘差異分塊提交，建議訊息：
1. `fix(gate0.2): refine panel placement and isolated DOM tests`。
2. `test(gate0.2): tighten clicked navigation evidence and guards`。
3. `docs(gate0.2): record implementation, validation and owner handoff`。
4. 外部 e2e 成功後：`test(gate0.2): add Chrome shortcut fixture screenshots`。

### 改動檔案（含 WIP 已收與尚未提交）

- probe：`content.js`、新增 `ui.js`、`reader.js`、`skeleton.js`、`manifest.json`。
- 版本：`package.json`、`package-lock.json`。
- fixture：`fixtures/en.html`、`home.html`、新增 `real/README.md`。
- scripts：`e2e.mjs`、`network-policy.mjs`、`verify.mjs`、新增 `test-cli.mjs`。
- tests：`reader.test.mjs`、`skeleton.test.mjs`、`review.test.mjs`、`logo.test.mjs`；新增 `ui.test.mjs`、`content.test.mjs`、`real-fixtures.test.mjs`。
- 文件：`AGENTS.md`、`notes/GATE0.md`、本 HANDOFF、`docs/plan/ROADMAP.md`。

### 實跑與截圖

- `npm test` 退出 0：沙箱 reporter 顯示 7 檔通過／0 失敗；child test events 沒輸出。`node --test --test-isolation=none test/` 實跑 72 過／0 敗／1 跳過（只缺真骨架）。CLI stdout／stderr 改暫存檔，退出碼／錯誤內容斷言保留，spawn error 直接失敗。
- `npm run verify` 退出 0：9 probe 檔＋4 Logo SVG；30 API bypass／14 icon／9 SVG／15 leak self-test。原规则未放寬。
- `npm run e2e` 退出 1：`fixture server failed: Error: listen EPERM: operation not permitted 127.0.0.1`。0 浏览器斷言／網路證據未取得，不能聲稱實測 0 請求。
- `git diff --check` 通過；reader 10 fixture × 6 路徑與 d875959 共 60 快照完全一致（不比 DOM node identity）。
- **實際新增截圖清單：空（0 張）**。外部跑 e2e 後應產生 `gate0.2-{scheduled-open,scheduled-closed,home-closed,home-open-goto-link,narrow-fab,remount,diag-version,version-mismatch,runtime-invalidated,en,ja,zh-Hans,zh-Hant,ko,roles-fallback,empty,selectors-broken,skeleton-copied,skeleton-fallback,virtual-before,virtual-after,not-scheduled}.png` 與 `gate0.2-skeleton-sample.txt`。都在 docs/，舊 gate0／gate0.1 不改；沙箱只允許本 repo 與 /tmp，不在 `/workspace/xsched-shots` 建複本。

### 外部續跑與限制

先對最後工作樹跑 `npm test`、`npm run verify`、`npm run e2e`，留存實際 assertions／request 數字與假資料截圖；再由另一 session 複審。本輪沒有加權限／網路資源／儲存／API 呼叫，$0、不登入真 X、不打包 zip。

Chrome 的幾何避讓、真 0.0.2 並存接手與网络證據待外部實跑。真頁未驗證；reader 完全保留舊假設，需老闆回傳 0.0.3 骨架＋診斷、X 語系／列數／捲到底狀態，修時間格式另需去內容的時間文案。滿版覆蓋／closed shadow／極小視窗仍可能找不到位置；舊 0.0.2 script 接手後只是隱藏連線，直到刷新才消失。老闆實測 5 步與完整限制見 GATE0.md「閘 0.2」。
