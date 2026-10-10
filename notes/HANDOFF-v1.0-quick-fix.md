# HANDOFF：xsched 快速時段 0.1.1

更新：2026-10-10。分支 `v1.0/quick-fix`，本輪起點 `7cf0372`；基準 main `293589f`（0.1.0）。總覽留在另一分支，本輪沒有帶入；不碰 author 相關工作。

## 真骨架與實作

已親讀排程設定視窗的 0.1.0 遮罩骨架。原檔留在 `/workspace/xsched-shots/`，不提交公開 repo。證據表與行號見 GATE0「1.0 快速時段 0.1.1：真骨架」。

- 六個原生 select 位於內層 `aria-modal=true` dialog，分成日期與時間兩個 group；每個 select 以 aria-labelledby 關聯前方 label。日期組另有 `input type=date`。
- 月／日／年／時／分／上午下午的子節點數分別為 13／32／4／13／61／2，符合含空白選項的日期與 12 小時制時間選單。骨架中的裸 `data-testid` 代表空值，沒有可用的前綴；不猜 class、真 id 或 testid。
- `quick.js` 集中設定結構選擇器，依 group、label 關聯及選項數字／文字的完整範圍辨識欄位。保留原合成 fixture 備援；上下午文字必須與選項順序一致，可辨識的 value 也須一致。
- 唯一原生 writer 使用 `HTMLSelectElement.prototype.value` setter，整組預檢後設值，再逐欄送 bubbles 的 input/change。最後讀回全部欄位；任何不符就整組還原原值並再送事件。還原不完整會明示，不會對回收後的新節點猜測補寫。
- 年份不在選項中會顯示「目標年份不在 X 的選項中」，完全不填值、不送事件；缺少其他目標選項或超出日期 min/max 同樣拒絕。date input 只讀 min/max，不直接同步，因為骨架無法證明它與 React 狀態的關係。
- skeleton 只對 select／label 的安全日曆 UI 詞彙保留非空 testid；疑似身份資料與任意未知詞仍遮罩。option 文字／value、label 文字與 id 照舊遮罩。診斷只新增欄位計數。
- 三份 `quick-real-*` fixture 的文字、id、value 與日期皆為合成資料，年份 2027–2029。原生日曆鈕與所有 Confirm／Schedule／Post、form 均有零激活斷言；擴充不替使用者確認或送出。

## 外部結果與本輪修法

進度先存於 `737d242`，額度中斷交接在 `7cf0372`。外部實跑：`npm test` **169/169**、verify OK；e2e 原合成與真骨架重建的兩個快速時段情境都通過，最後的網路守衛失敗。原因是 Chrome 為 fixture 的日期輸入框自繪日曆指示器，CDP 記錄了一筆 `data:image/svg+xml`（fill=WindowText）請求；它是瀏覽器內建圖示，不會出網。

本輪採**第一案**：只在三份日期輸入框 fixture 加 `input[type=date]::-webkit-calendar-picker-indicator{display:none}`，e2e 加註解交代原因。已掃描所有 fixture，沒有其他日期輸入框。保留 date input 本身、min/max、欄位值及所有原生填值／還原測試。

沒有修改任何 `probe/` 程式、`scripts/network-policy.mjs` 或網路斷言，也沒有增加 data: 豁免。Codex 沙箱內不跑 e2e、不 commit／push／開 PR。

外部實測（2026-10-10 19:40 UTC+8，含本次 fixture 修正）：`npm test` 169/169、verify OK、`npm run e2e` **OK — 686 斷言**；網路段 78 筆本機 fixture／favicon／頁面導覽、0 擴充資源／背景請求、1 次使用者點擊的前往 Scheduled，日期圖示的 data: 請求已消失。

## 測試與截圖交接

- `npm test`：11 個測試檔通過；細項 169 過、0 敗、0 跳過。
- `npm run verify`：30 API／14 icon／9 SVG／55 leak／21 storage／39 native writer 自測通過。原守門與攻擊樣本均保留；position storage 摘要不變，quick writer 仍限精確來源摘要與 select 的 input/change。
- 外部已在最新工作樹跑 `npm test`、`npm run verify`、`npm run e2e`（Chrome for Testing／Xvfb）：全過，e2e 686 斷言；quickfix 截圖隨本次提交。

已核對 e2e 中的四個截圖路徑與文件一致：

- `docs/v1.0-quickfix-real-detected.png`
- `docs/v1.0-quickfix-real-filled.png`
- `docs/v1.0-quickfix-year-missing.png`
- `docs/v1.0-quickfix-rollback.png`

截圖由外部以合成資料產生；舊情境另存 quickfix 前綴，既有截圖不覆寫。外部前次產生的檔案保留原樣。

## 還待驗證

option 的真 value 格式、label 詞與 React 是否接受原生事件仍待老闆真頁確認。日曆 input 是否由 X 自行同步、React 是否回收節點，以及拒絕還原時的行為，也不能靠合成 fixture 證明。

請老闆再貼 0.1.1 設定視窗開著時的「複製頁面結構」與「複製診斷」。新版能保留安全的非空 select／label testid，但原本空值仍會是空值，option value 仍遮罩；骨架無法直接證明全部編碼。若仍失敗，再提供不含推文或真日期的 label 詞／選項編碼類型，例如月份零基或一基、上下午文字。真機資料不放公開 repo。

## 老闆實測（≤5 步）

1. 更新 repo 至本版 commit；PR 合併後，可在 main 執行 `git pull --ff-only origin main`。
2. 在 `chrome://extensions` 重新載入 `probe/`，確認版本 0.1.1；回到 x.com 重新整理頁面。
3. 在 x.com 發文框自己打開原生排程對話框，再點 Dagaz 浮層的一個快速時段。
4. 逐欄確認月／日／年／時／分／上午下午，**不要按排程**；若必須送出測試，先手動選 2027 年以後，測完到 Scheduled 刪掉。
5. 按「複製頁面結構」和「複製診斷」貼回；錯誤可附畫面，真機內容不提交 repo。

寫碼 session `01a1212e`；獨立 Codex 複審結果見 GATE0「1.0 快速時段 0.1.1 Codex 複審」。完整 e2e 已由外部實跑通過；option 編碼與 React 接受結果仍待老闆逐欄驗收。
