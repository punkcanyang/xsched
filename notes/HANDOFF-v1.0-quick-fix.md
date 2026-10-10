# HANDOFF：xsched 快速時段 0.1.1（照老闆排程對話框真骨架修，分支 `v1.0/quick-fix`）

更新：2026-10-10 17:05（UTC+8）。基準 main `293589f`（0.1.0）。插隊：總覽（`v1.0/overview`）暫停中。

## 證據

老闆貼回 0.1.0「複製頁面結構」（排程對話框開著，path=other，nodes=3134），原檔在 box `/workspace/xsched-shots/boss-skeleton-0.1.0-schedpicker-2026-10-10.txt`，**不得 commit**。0.1.0 診斷：schedDialog=0 dateCtl=0 timeCtl=0 selects=6（偵測失敗）。
骨架：6 個原生 `<select>`（皆有 aria-labelledby、id、data-testid），日期一組（月 c=13、日 c=32、年 c=4，另有 `input type=date`），時間一組（時 c=13 即 1–12、分 c=61、上午／下午 c=2），12 小時制。

## 要做

偵測（testid 前綴＋aria-labelledby label＋option 數量特徵，不靠 class；修 schedDialog）、填值（原生 setter＋input/change、逐欄讀回、不符整組還原＋錯誤）、骨架白名單（只讓 select 與 label 的 data-testid 值原樣）、年份不在選項就報錯、防送出守衛保留、去識別 fixture（2027+）＋e2e。版本 0.1.1。

## 工具

寫碼 Codex gpt-6.1-sol high resume `01a1212e`；複審 resume `01a12013`。撞額度即停。
