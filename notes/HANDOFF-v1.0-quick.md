# HANDOFF：xsched 1.0 第一項「快速選時段」（分支 `v1.0/quick-slots`）

更新：2026-10-10 16:05（UTC+8）。基準 main `2cceb5e`（probe 0.0.6，閘 0 全部通過）。

## 背景

閘 0 老闆實測通過（0.0.6 讀到 2 則、timeOk=2、timeFail=0）。1.0 照 ROADMAP 一次一項、每項一個 PR；本 PR 只做第 1 項「快速選時段」，排程總覽、自動預排之後再做。

## 證據狀況

手上只有老闆「Scheduled 列表」骨架；**沒有「排程設定對話框」（日期／時／分選單）的真 DOM**。GATE0.md 依據表第 5 列的 `scheduleOption`／`scheduledDateField`／`scheduledTimeField`／`scheduleConfirm` 來自公開文章、未親讀、未驗證。因此：介面與邏輯照合理假設寫、用合成 fixture 測；「複製頁面結構」在排程對話框開著時也要能抓；診斷加原生日期／時／分控制項數；找不到控制項時快速鈕顯示「未偵測到排程欄位」、不填。

## 硬規矩（本項追加）

- 絕不代替使用者按「排程／確認／發佈／Post」等送出鈕；verify 與測試守住「程式不 click 送出鈕」。
- 測試與 fixture 的排程一律在 2027 年以後；老闆實測若真的按排程，也要排到 2027 年以後並刪掉。
- 不加權限、0 網路請求、不用 API、不登入 X、公開 repo 不放老闆真機資料。

## 工具

寫碼 Codex gpt-6.1-sol high resume `01a1212e-3e31-74f3-ba55-1c3c643723cb`；複審 resume `01a12013-6780-77c1-9466-bb1e9f78097f`。不用 Grok Build／CodeWhale；撞額度即停。

## 進度

- [ ] 寫碼
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main
