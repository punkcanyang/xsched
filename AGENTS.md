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
7. **不在共享機器上登入老闆的 X**（不碰 @decoy_handle，也不碰老闆個人號）。真帳號測試一律由老闆在自己的 Chrome 做；開發用本機模擬頁／fixture。
8. 花費 $0；任何要花錢的（含 Chrome Web Store US$5）先問。
9. 不推 secret；不改別人的分支和檔案（`notes/` 是产品开发的）。
10. **公開 repo**（老闆 2026-10-10 拍板維持公開）：絕不提交 secret、token、真實對話內容、帳號 handle 或老闆的任何真實資料；截圖一律用範例資料。

## 怎麼工作

- **分支 + PR**：從最新 `main` 開分支（例如 `gate0/…`、`feat/…`），一件事一個 PR。
- **同一件事同一個 session** 做完，不中途換。任何工具都**不用 Fast 模式**（例如 Grok 4.7 用 high）。
- **複審**：由**不同的 session／模型**審，Opus 5.5 有額度就用，沒有就 Grok 4.7 high（非 Fast）另開 session。PR 說明寫明是誰審的。
- 測試：建好 `package.json` 後至少要有 `npm run verify`（權限與網路請求守門）和 fixture 測試（模擬 X 的 Scheduled 列表與排程視窗）。PR 前全部要過，名字寫進這份文件。
- **本 repo 的測試（PR 前三個都要在最新分支上跑過）**：
  - `npm test`：`node --test` + linkedom，測 `probe/reader.js`（五語系解析、各層備援、去重累加、空列表、非 Scheduled 0 命中、診斷不含內容、時間樣本遮罩、`lang`／`doclang` 過濾、`mounted` 真實狀態）與 `probe/skeleton.js`（屬性遮罩、class 前綴／雜湊、`×N` 收合、shadow、同源／跨源 iframe、截斷）；另測 `probe/ui.js` 九語／位置、真 `content.js` 的快捷鈕開關／SPA 狀態／重掛／固定導覽／版本警告／重複注入。`fixtures/real/*.html` 自動配同名 JSON 跑讀法驗收，空目錄時只跳過這項；目前有老闆遮罩骨架重建繁中／簡中（各1則；繁中格式真機確認、簡中對應，日期與本文為假）及合成跨年 fixture（2則）。另測五語系有／無年份、12 AM/PM、上午／下午12點、24小時制、跨年順序、無效日期、背景 article 不得透過 cell／文字備援混入、統一時間顯示、推定年份更新時重畫與未知列保留。另測週／周／星期與空白變體、星期不符以日期為準、繁簡上午下午1–12點、60vh固定操作區／縮小重掛／安全時間樣本、有界fixed／sticky幾何偵測。CLI 子程序輸出用暫存檔擷取，保留退出碼及 stderr 斷言。
  - `npm run verify`：`scripts/verify.mjs`，掃 `probe/` 擋網路 API／`innerHTML`／`eval` 等，並檢查 manifest 權限最小（原規則全保留，另擋 namespaced 資源屬性、markup parsing 及非固定 Scheduled 導覽；含會抓違規的 self-test，以及用含網址／uuid／email／handle／內文／長屬性值的攻擊樣本頁驗證 skeleton 與時間遮罩不洩漏；新增日曆词白名單 fmt／samples／骨架短時間節點匯出，完整內文即使像日期仍不得匯出，calendar-shaped URL／email／handle 須整段遮罩；誘餌為 @decoy_handle／decoy@example.invalid，另測含週字樣的日期身份及失敗時間匯出）。
  - `npm run e2e`：`scripts/e2e.mjs`，用 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server ＋ `--host-resolver-rules` 把 x.com 指到 127.0.0.1，驗證浮層計數／時間、虛擬化累加、非排程頁 0 命中、選擇器全失效仍掛載並顯示「讀到 0 則」、host 被移除自動重掛、骨架複製與 textarea 備援、擴充無額外網路請求，另驗證 Dagaz 快捷鈕在 Scheduled／首頁的開關、手動狀態跨 SPA／重掛、固定目標的使用者點擊導覽、桌面 1100px 與窄版 390／600px 原生 Post／FAB／Messages-Grok 控制項矩形不重疊且 elementFromPoint 命中、版本不符／runtime invalidated、真 0.0.2 script 接手。產生 `docs/gate0.3-*.png` 與 `docs/gate0.3-skeleton-sample.txt`；舊 `docs/gate0-*.png`、`docs/gate0.1-*.png`、`docs/gate0.2-*.png`／骨架保留不覆寫。前往 Scheduled 使用固定目標 location.assign 按鈕（不寫 href），一般頁面導覽；網路證據只明確接受這一次使用者點擊的頂層導覽，資源／背景請求仍必須 0。另驗證真骨架精簡 fixture 1 則、逐則標準時間／timeFail=0、背景可見也不計數、未知時間仍 1 則且明示失敗、固定假時鐘下跨年 2 則；新增1280×600面板≤60vh、內部捲到底仍能以elementFromPoint命中固定操作鈕並物理複製、縮小再展開／重掛、桌面與短視窗收合DM／紅點圓形div／Grok不重疊、未知時間樣本隱私、繁簡確認格式假日期timeFail=0。至少新增docs/gate0.3-{small-viewport-scroll,collapsed,avoid-native,unparsed-sample,real-skeleton-zh-Hant,real-skeleton-zh-Hans}.png。需要 Xvfb（`DISPLAY` 空時自動 `xvfb-run`）與 `CHROME_PATH`（預設 `/tmp/cft/.../chrome`）。

## READY 的標準（PR 說明裡要有）

1. 做了什麼（閘 0 要附 DOM 依據、讀取方式、改版風險）。
2. 權限、網路請求、花費的確認。
3. 複審模型與 session。
4. 測試結果。
5. **範例資料**截圖（不能是老闆的真實推文或帳號）。
6. **老闆實測步驟 ≤6 步**（閘 0 是 ≤5 步）。
7. 已知限制。

完成後**叫商務拓展**：發一則「STATUS READY：xsched <階段>」，附 PR 連結與上面 1–7。沒有 agent 間訊息管道時，把同樣內容留在 PR 說明，請老闆轉。
