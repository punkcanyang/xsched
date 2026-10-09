# HANDOFF：xsched 閘 0.2（probe 0.0.3：Dagaz 快捷鈕＋真骨架讀法／時間）

更新：2026-10-10（UTC+8）。分支 `gate0.2/shortcut-button`，基準 main `d875959`。最新續作結果在本檔末節；首輪交付／計畫保留作歷史。

## 任務（老闆改優先序：xsched 第一，經商務拓展轉來）

1. x.com 右下圓形快捷鈕（Dagaz Logo，`probe/icons/`、`docs/xsched-logo-B*`）：點＝開關排程浮層；不在 Scheduled 頁時提供一鍵前往 `https://x.com/compose/post/unsent/scheduled`；不擋 X 原生發文鈕等控制項；把 0.0.2 的小膠囊整合進這顆鈕；被移除自動重掛（沿用 0.0.2 機制）；九語 aria-label／tooltip。
2. 版本 0.0.3（manifest＋package.json）。
3. 首輪只整理讀法；續作已收到 0.0.2 骨架並明確授權依真結構修讀法／時間。不得猜沒有骨架證據的新選擇器，舊 fixture 結果不能退。
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

## 首輪沙箱交付歷史（2026-10-09；後由外部提交，最新見續作章）

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

## 續作計畫：真頁骨架與時間（老闆擴大驗收）

外部已提交 722c83f／e607b5d，使用者回報既有 e2e 305 斷言通過；本輪從這份乾淨分支續作，commit／Chrome e2e 仍由外部跑。

1. 分析收到的 0.0.2 骨架：雙層 dialog（36／42 行），上層列表只有 108 行一顆含 tweetText 的 button；背景 126 行起 aria-hidden=true，article/time/cellInnerDiv 都在背景。時間候選是 117–118 行獨立 span/#text(28)，無 time/datetime、列 button 沒 aria-label；內容格式不可確認。
2. 依上述證據修最近 dialog 的 scope 與 button + tweetText + 獨立 span 讀法；背景 article 排除，舊層備援保留。轉換脚本只從骨架複製安全結構／enum，時間及文字全用假資料，原骨架不提交。
3. 補五語系時間／無年份／跨年／12-24 小時制解析，保留舊輸出欄位；浮層顯示統一解析时间，失敗明示。未解析的真結構列也保留則數。
4. 共用日曆詞白名單遮罩、fmt／samples 與 skeleton 的短時間文字樣本；時間候選嚴格隔離內文，新增洩漏攻擊 self-test，不放寬舊守門。
5. 新 real／跨年 fixtures、單元／Chrome e2e 情境與文件；本機實跑 test／verify，交外部跑 e2e、提交與另一 session 複審。結論保留「則數依骨架可讀、時間格式待老闆診斷確認」。

## 續作交付狀態（2026-10-10；最新）

**則數依骨架可讀、時間格式待老闆診斷確認。尚未 READY。** 原骨架 #text(28) 不含實際日期／時分文案；本輪合成例子通過不代表真頁時間已驗證。

- [x] 骨架分析：L36 外 dialog／L42 內 modal；L108 唯一含 tweetText 的 row button → **1 則可見排程**。時間候選 L117 span／L118 #text(28)，獨立於 L122 tweetText；row 無 aria-label、modal 無 time/datetime。背景 L126 起有 21 cell、14 article，實際 15 time 都不是排程。完整行號／路徑／SHA-256 見 GATE0「閘 0.2 真頁骨架分析」。
- [x] READ_CONFIG 新增有行號的最近 modal／selected tab／button／span／article 選擇器；舊三層保留。背景 article 與含 article 的聚合容器都排除；不解析的真結構 row 仍計入、明示「時間未解析」。
- [x] 五語合成時間例子：有／無年份、12 AM/PM／上午下午12點、24小時制、跨年 reference；浮層 YYYY-MM-DD HH:mm (weekday)，推定年份改變時也會重畫。沒有猜 datetime=x 或合成 ISO/UTC 成真安排時間。
- [x] 共用日曆詞白名單 mask、診斷 fmt／samples、skeleton 短時間節點 calendar=。隔離 tweetText／composer／article；先提取日期，URL／email／handle／UUID 整段遮罩。未知格式也拒絕排程片語後混入任意本文／數字的樣本。
- [x] 轉換腳本＋兩個精簡 real fixtures／JSON，自動掃網址／email／handle／UUID／屬性。所有文字、日期、語系都是明寫假值／推定；原 340KB 骨架留在 repo 外。boss HTML 1978 bytes、cross-year HTML 2191 bytes；後者人工複製第二列，只證明時間順序。
- [x] 本地 npm test／verify、舊 fixture 60 組讀法結果一致、語法／diff 檢查。
- [ ] 本輪外部 Chrome e2e、新假資料截圖與 0 資源／背景請求證據。
- [ ] 老闆 0.0.3 fmt／samples 診斷、新版骨架與逐則日期＋時分對照。
- [ ] 另一 Codex session 複審；後續提交／PR／合 main／push 由老闆安排。

### 改動檔案（相對外部首輪 e607b5d）

- probe：`reader.js`、`content.js`、`skeleton.js`。版本維持 0.0.3；manifest／package 未新增權限或資源。
- scripts：`real-skeleton-fixture.mjs`（新增）、`verify.mjs`、`e2e.mjs`。
- fixtures/real：`README.md`、`boss-skeleton.html`／JSON、`cross-year.html`／JSON。
- test：新增 `calendar.test.mjs`；更新 `content.test.mjs`、`reader.test.mjs`、`real-fixtures.test.mjs`、`skeleton.test.mjs`。
- 文件：`AGENTS.md`、`docs/plan/ROADMAP.md`、`notes/GATE0.md`、本 HANDOFF。

### 最終實跑

- `npm test` 退出 **0**：沙箱 reporter 顯示 **8 檔通過／0 敗**。補充 `node --test --test-isolation=none test/`：**102 項通過／0 敗／0 跳過**，含 25 個 calendar 測試與 2 個 real fixture 子測試。
- `npm run verify` 退出 **0**：9 probe 檔／4 Logo SVG，**30 API bypass／14 icon／9 SVG／25 leak self-test**。舊 API／注入／權限守門保留；新增未知時間的本文數字攻擊也會被攔。
- `node --check scripts/e2e.mjs`、`git diff --check`：通過。
- `npm run e2e` 退出 **1**：`fixture server failed: Error: listen EPERM: operation not permitted 127.0.0.1`。在 server 啟動就中止，**本輪 0 個 Chrome 斷言執行、0 張新截圖**；不可沿用首輪 305 宣稱本輪通過。

### 外部提交／續跑

使用者已在外部建立：

1. `722c83f`：首輪快捷鈕／0.0.3／版本診斷／選擇器整理。
2. `e607b5d`：首輪 Chrome **305 斷言 OK** 與 gate0.2 截圖（使用者回報）。
3. `5da24dd`：本輪真骨架／時間解析／fixtures 的 **WIP 快照**，不含後面的背景 article 聚合排除、未知時間樣本安全收斂、最終 Chrome 情境／單元測試與文件；不能當完成驗收。

`.git` 仍唯讀，本 session 沒有建立提交。請外部在最後工作樹依序跑：

```sh
npm test
npm run verify
npm run e2e
```

需要細項數字時補跑 `node --test --test-isolation=none test/`。Chrome／Xvfb 需求沿用 scripts/e2e.mjs；沒有打包 zip、沒有改 main／開 PR／push。

新增 Chrome 情境：boss 1 列與每列時間／timeFail=0／fmt；背景變可見仍不混入；未知時間保留 1 列並顯示失敗／samples；跨年 fake Date 固定 2026-12-31，2 列日期排序正確。沿用既有 0 資源／背景網路請求證據。

外部成功後新增假資料截圖：`docs/gate0.2-real-skeleton.png`、`docs/gate0.2-real-time-unparsed.png`、`docs/gate0.2-cross-year.png`；所有舊情境繼續跑，gate0／gate0.1 舊圖保留不動。

### 老闆實測與缺口

最新 **5 步實測**与可直接轉給老闆的請求見 GATE0「閘 0.2 真頁骨架分析」：pull main → reload probe 確認 0.0.3 → refresh x.com Dagaz → Scheduled 逐則對照則數／日期時分 → 複製診斷＋骨架貼回（附語系）。

缺的關鍵證據是 0.0.3 診斷含 `fmt=`／`samples=` 的整行與新版骨架；若兩欄皆 none，請另給一則僅含安排時間的短句，保留日期／時分／上午下午，排除本文／帳號／網址。五語語法是合成測試；另外四語只有快捷鈕與日曆詞遮罩，本地時區與無年份依列表順序的假設待真機確認。DOM 可見／自己捲過才有計數、同時間同本文去重、虛擬累加不能反映同 scope 刪改等限制保留。

無新增權限／網路 API／遠端資源／儲存，$0，不登入真 X。

## 外部狀態（产品开发，2026-10-10 00:26 UTC+8）

- 寫碼 session `01a1212e-3e31-74f3-ba55-1c3c643723cb` 兩輪完成；外部 commit 到 `793e370` 並 push。
- 外部實跑：`npm test` 102/102、`npm run verify` OK、`npm run e2e` OK 322 斷言；截圖 `docs/gate0.2-*.png`，box 複本 `/workspace/xsched-shots/gate0.2/`。
- PR：https://github.com/punkcanyang/xsched/pull/5
- 複審：Codex gpt-6.1-sol high，session `01a12013-6780-77c1-9466-bb1e9f78097f`（resume），log `/workspace/bd-punkcan/logs/codex-xsched-gate0.2-review.log`。通過即 `merge --no-ff` 到 main 並 push。
- 結論：則數依骨架可讀、時間格式待老闆診斷確認。

## 複審中斷（2026-10-10 00:33 UTC+8）

- 複審 session `01a12013` 跑到一半撞 Codex 用量上限（訊息：2:10 AM 後再試），**沒有 VERDICT**。它在工作樹的部分修正已外部 commit 為 `1f784f7`（點擊需 isTrusted 才導覽、`fmt=` 改獨立一行、洩漏自測 25→32）。
- `1f784f7` 上：`npm test` 105/105、`npm run verify` OK；`npm run e2e` **FAILED**：selectors-broken 情境的 samples 斷言因 `fmt=` 換行而不符（複審改到一半）。
- 接回：02:10 後 `codex exec resume 01a12013-6780-77c1-9466-bb1e9f78097f "..." </dev/null`，請它修完 e2e 斷言並給 VERDICT；未 APPROVE 不合併。

## 收尾（2026-10-10 07:10 UTC+8）

- 複審第二輪 `01a12013`：**VERDICT: APPROVE**（修 e2e samples 解析、GATE0 複審節），外部 commit。
- 用 merge（非 rebase／force）把 origin/main（#6 公開 repo 衛生、#7 LICENSE）併進分支，無衝突。
- 外部實跑：`npm test` 105/105、`npm run verify` OK（30 API／14 icon／9 SVG／32 洩漏自測）、`npm run e2e` OK 323 斷言；截圖已更新。
- 公開 repo 掃描：原始 340KB 骨架不在任何 commit；`fixtures/real/`、`docs/` 無網址／email／handle／id／密鑰／真實資料。
- 合併 main（--no-ff）。結論：**則數依骨架可讀、時間格式待老闆診斷確認**。
