# HANDOFF：xsched 1.0 第二項「排程總覽」（分支 `v1.0/overview`，版本 0.2.0）

更新：2026-10-10 16:50（UTC+8）。基準 main `293589f`（0.1.0 快速選時段）。

## 範圍

- 讀 Scheduled 列表（0.0.6 讀法已在老闆真機驗過），依本地日期分組顯示每天幾則；在已有排程的日期範圍內，沒排程的日子標「空」。
- 點某一則：scrollIntoView 捲到 X 頁面上那一則並短暫標亮（只改我們自己的標亮樣式／shadow 外框，不改 X 內容）。
- 只讀：不改、不刪、不點 X 任何控制項。九語、本地時區。
- 只動總覽相關檔案（新增 `probe/overview.js`＋最少接線）；**`probe/quick.js` 不准改**（避免與快速時段照真 DOM 修衝突）。
- 開工卡原文「點擊跳到 X 的 Scheduled 那則編輯」：本版依指示改為捲動＋標亮，不開編輯。

## 插隊

若老闆貼回排程對話框骨架：總覽進度 commit＋push 到本分支、暫停，先修快速時段，再回來。

## 工具

寫碼 Codex gpt-6.1-sol high resume `01a1212e-3e31-74f3-ba55-1c3c643723cb`（不開第二個寫碼 session）；複審 resume `01a12013-6780-77c1-9466-bb1e9f78097f`。撞額度即停。

## 進度

- [ ] 寫碼
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main

## 本輪簡短計畫

先保留 quick.js 的 SHA-256（c24818395b41357f5ca2311bd5fd9aad0077409e07104c4ae3e2ce327443016e），不修改任何字元。reader 僅增加非序列化的列弱參照介面，不改選擇器／解析／累加結果；總覽獨立模組負責九語、本地日期／空日、90天上限、自家shadow標亮與過期節點提示。content只接線到可切換區塊，既有列表預設保留。verify新增精確來源的唯一捲動邊界及攻擊自測；e2e新增2027+假列表、原生子樹零變更／零點擊／零送出。跑完整unit與verify，外部再跑Chrome e2e與提交。

## 暫停（2026-10-10 17:03 UTC+8）

老闆貼回排程對話框骨架，依插隊規則：寫碼 session 第一輪中途停掉（進度已在 `1b19423`），先做快速時段 0.1.1（分支 `v1.0/quick-fix`）。回來時先把本分支 rebase／merge 到新 main，再 resume 寫碼 session 續做（提示 `/workspace/bd-punkcan/xsched-v1.0-overview-write-prompt.txt`，告知已有 WIP）。
