# HANDOFF：xsched 快速時段 0.1.2

更新：2026-10-11。分支 `v1.0/quick-fill`，基準 main `162a838`；本輪起點 `f1852a7`。只修快速時段，總覽沒有帶入。沙箱不 commit／push／開 PR，外部處理提交與完整 e2e。

## 證據與根因

真機證據留在外部目錄，沒有複製進 repo。親讀兩版遮罩骨架後，確認 L86–173 逐字相同：六個空 testid、日期與時間兩 group、月份／日／年／時／分均有 disabled 空白，分鐘是 60 格，上下午兩格。文字長度能支持欄位判定，不能證明 value 是 1／01／0 起或 AM/PM 等編碼。證據表與 0.1.1 原程式行號見 GATE0「1.0 快速時段 0.1.2：填值根因」。

0.1.1 已用原生 setter＋input/change。可確認的缺陷是先批次寫六欄、以月日年時分上下午順序送事件、同步讀回且沿用舊節點。第一個 change 若重繪整組受控值，還沒送事件的欄位可能被舊狀態蓋回；這是最可能的原因，真 X 的重繪時機仍是推測。「已還原」而非缺年份／選項／bounds 訊息，也表示這次已過預檢，失敗發生在 writer 內，不能直接歸因於補零或分鐘刻度。

離線假頁以 main 0.1.1 與新 writer 對照：同步受控重繪時，舊版 `result=failed change=12`，新版 `result=filled change=6`；rAF 上下午自動修正時，舊版誤報 filled，新版失敗並還原，記錄 `failed=period target=PM read=AM`。所有時間與資料都是合成範例，不是真機值；重現命令及輸出已記錄在 GATE0，暫存腳本不提交。

## 完成的修正

- 唯一 writer 改年→月→日→上下午→時→分，每欄重查同一 dialog 的唯一控制項，依當下 option 的 value／文字映射。支援 1、01、完整 0..11 月份及九語上下午（含 a/p）；歧義拒絕。不靠空 testid、class 或本文猜欄位。
- 原生 `HTMLSelectElement.prototype.value` setter 後送 bubbles input/change；等待 microtask、rAF 及最多六次讀回，兩次一致才繼續，最後再查整組。rAF 有 80ms 後備，輪詢間隔 25ms；不重寫目標來掩蓋 X 的修正。填值期間停用快捷時段，防止交錯。
- 填值與還原都重查節點、等待重繪；年月重建日 select 時能找到唯一 label 關聯的新節點。讀回按當前選項映射核對日曆值；還原也依原本的日曆值唯一映射，即使原 raw token 仍存在，也不能把它當成相同月份。原值空白只能恢復空白。無法辨識、選項不存在或還原被拒會明示不完整。Detached／本文／article 或已移出原 dialog 的控制項不再發事件。
- 目標選項、年份與 date input min/max 先整組預檢，每欄填前再查 bounds；缺年份、缺選項一律零寫入。date input 不直接同步；最後的確認／排程／發佈仍完全由使用者決定。
- 診斷成功印 fill=ok；失敗列六欄 target、value、read、前 3＋最後 1 個 options 與失敗欄位，保留還原前的讀回。這些會顯示在浮層並進入「複製診斷」。骨架在 dialog 的 select 行新增相同規則的 option-values 樣本。
- 兩個出口共用安全函式：僅 1–4 位數字、empty 及固定短上下午詞彙可見，長 ID／URL／email／handle／UUID／日期字串／opaque 編碼／本文皆 x；其他骨架遮罩不放寬。
- 八份 `quick-real-*` fixture 由 `scripts/build-quick-fixtures.mjs` 重建，不讀原始骨架。option 數量與文字長度照證據表，年份 2027–2029，id／文字／value 全合成。受控模型拒絕 instance value 寫入，認原生 setter＋input/change，年月替換日 select；有編碼、缺年份、讀回拒絕與上下午自動修正變體。
- 版本 0.1.2 在 manifest、package／lockfile、reader／skeleton 常數、面板與診斷首行、README、本交接一致。reader 只升版。ui.js／position.js 原樣；quick writer 與 content 作者呼叫點的完整 SHA 已重新核對更新。依賴不變。

## 寫碼階段實跑（複審前）

接續核對：工作樹仍是 `v1.0/quick-fill`／`f1852a7`，上一輪實作完整保留。本次依更新後的 AGENTS.md 重跑以下三個本機命令，結果相同；兩個 `/tmp` 假頁重現也再次通過。沒有新增 production 改動，Chrome e2e／截圖仍待外部，不沿用歷史 e2e 結果。

- `npm test`：**12 個測試檔通過**。
- `node --test --test-isolation=none --test-reporter=tap test/*.test.mjs`：**196 過／0 敗／0 跳過**（含子測試）。
- `npm run verify`：**OK**；30 API／14 icon／9 SVG／66 leak／21 storage／46 native writer／22 author／160 URL／28 author boundary／158 解構／514 資源／308 CSS 自測。原攻擊均保留，新增 11 個洩漏與 7 個 writer 邊界攻擊。
- 語法及 `git diff --check` 通過。八份 fixture 已掃：無 URL、email、handle、真 id，年份全 2027+，option 數量／文字長度符合表格。
- manifest 除版本外與 `162a838` 相同；network-policy.mjs、e2e 最後網路守衛、ui.js、position.js 逐字不變；reader 除版本常數外逐字不變。

**本輪沒有實跑 Chrome e2e，也沒有產生截圖**，依交接沙箱 listen 受限，交外部處理。不可把 0.1.1 的 686 斷言當成本版結果；尚待完整 e2e、不同 session 複審與老闆真頁實測。

## 外部要跑

在最新工作樹跑：

```bash
npm test
npm run verify
npm run e2e
```

沿用 Chrome for Testing／Xvfb／`CHROME_PATH`。日期圖示沿用 fixture-only CSS；沒有 data: 豁免、沒有改 0 擴充資源／背景請求斷言。e2e 新增受控欄位與日節點替換、四種編碼各四時段、fill=ok、延後上下午修正後全組還原，以及實體複製六欄診斷。所有原生送出／日曆 click 與 submit 仍為 0。

截圖前綴是 `docs/v1.0-quickfill-`，保留舊截圖。主要輸出：

- `docs/v1.0-quickfill-real-detected.png`
- `docs/v1.0-quickfill-real-filled.png`
- `docs/v1.0-quickfill-numeric.png`
- `docs/v1.0-quickfill-padded.png`
- `docs/v1.0-quickfill-zero.png`
- `docs/v1.0-quickfill-period-values.png`
- `docs/v1.0-quickfill-autocorrect.png`
- `docs/v1.0-quickfill-diag-failure.png`
- `docs/v1.0-quickfill-year-missing.png`
- `docs/v1.0-quickfill-rollback.png`

新 picker／時鐘均 2027+；舊列表情境沿用既有假日期，沒有真機資料。

## 老闆實測（≤5 步）

1. PR 合併後，在 main 執行 `git pull --ff-only origin main`。
2. 在 `chrome://extensions` 重新載入 `probe/`，確認 0.1.2，回到 x.com 重新整理。
3. 自己打開原生排程對話框，點一個快速時段。
4. 逐欄核對月／日／年／時／分／上下午，**不要按排程**；若必須送出測試，先選 2027 年以後，測完到 Scheduled 刪掉。
5. 按「複製診斷」貼回，成功也貼一次（fill=ok）；失敗附六欄 read/options，必要時再貼 0.1.2「複製頁面結構」。真機資料不提交公開 repo。

## 已知限制

根因的真頁重繪時機、option 真值、React 是否接受及日期 input 是否由 X 同步仍待確認。六次讀回不能保證任意更晚的修正；群組回收、選項消失或無法唯一映射時還原可能不完整，須自行核對。Opaque value 仍印 x，新骨架不會還原空 testid。自訂／星期／佔用避讓／總覽未做，擴充不開原生視窗、不確認或送出、不加權限、不發網路請求，$0。

寫碼沿用本 session；寫碼階段交由獨立 session 複審，最新結果如下。

## Codex 複審更新

獨立 Codex 已審 `162a838...290476b`，親讀外部骨架與失敗截圖，真機重繪根因仍只能列為推測。複審重現並修正兩項高嚴重度問題：晚到的 option 編碼切換可讓錯月份誤報成功，以及舊 raw 仍存在時還原成錯月份；另補 input 後的原 dialog 邊界檢查。詳見 GATE0「1.0 快速時段 0.1.2 Codex 複審」。

補修後實跑：`npm test` 12 檔通過，細項 **199 過／0 敗／0 跳過**；verify **66 leak／49 native writer**，所有其他原自測數量不變。quick 摘要已同步；AUTHOR_UI／AUTHOR_CONTENT 摘要仍與目前來源完全一致。沒有修改 e2e、網路政策、manifest、fixture 或作者 factory，也沒有 commit／push。

主代理回報複審前完整 e2e **911 斷言通過**，57 張變更 PNG 已確認為合成資料。但本輪改了 writer，911 不能作為補修後的 Chrome 結果。外部須在最新工作樹重跑完整三項，特別是 e2e 的受控重繪、編碼變體、整組還原與 0 擴充資源／背景請求斷言；真頁驗收仍待老闆。

## 本輪檔案清單

- `AGENTS.md`
- `README.md`
- `docs/plan/ROADMAP.md`
- `fixtures/quick-real-autocorrect.html`
- `fixtures/quick-real-dialog.html`
- `fixtures/quick-real-numeric.html`
- `fixtures/quick-real-padded.html`
- `fixtures/quick-real-period-values.html`
- `fixtures/quick-real-rollback.html`
- `fixtures/quick-real-year-missing.html`
- `fixtures/quick-real-zero.html`
- `notes/GATE0.md`
- `notes/HANDOFF-v1.0-quick-fill.md`
- `package-lock.json`
- `package.json`
- `probe/content.js`
- `probe/manifest.json`
- `probe/quick.js`
- `probe/reader.js`
- `probe/skeleton.js`
- `scripts/build-quick-fixtures.mjs`
- `scripts/e2e.mjs`
- `scripts/verify.mjs`
- `test/content.test.mjs`
- `test/quick-fill.test.mjs`
- `test/quick-real.test.mjs`
- `test/quick.test.mjs`
- `test/reader.test.mjs`
- `test/review.test.mjs`
- `test/skeleton.test.mjs`
- `test/ui.test.mjs`
