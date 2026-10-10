# HANDOFF：xsched 快速時段 0.1.1（照老闆排程對話框真骨架修，分支 `v1.0/quick-fix`）

更新：2026-10-10 17:05（UTC+8）。基準 main `293589f`（0.1.0）。插隊：總覽（`v1.0/overview`）暫停中。

## 證據

老闆貼回 0.1.0「複製頁面結構」（排程對話框開著，path=other，nodes=3134），原檔在 box `/workspace/xsched-shots/boss-skeleton-0.1.0-schedpicker-2026-10-10.txt`，**不得 commit**。0.1.0 診斷：schedDialog=0 dateCtl=0 timeCtl=0 selects=6（偵測失敗）。
骨架：6 個原生 `<select>`（皆有 aria-labelledby、id、data-testid），日期一組（月 c=13、日 c=32、年 c=4，另有 `input type=date`），時間一組（時 c=13 即 1–12、分 c=61、上午／下午 c=2），12 小時制。

## 要做

偵測（testid 前綴＋aria-labelledby label＋option 數量特徵，不靠 class；修 schedDialog）、填值（原生 setter＋input/change、逐欄讀回、不符整組還原＋錯誤）、骨架白名單（只讓 select 與 label 的 data-testid 值原樣）、年份不在選項就報錯、防送出守衛保留、去識別 fixture（2027+）＋e2e。版本 0.1.1。

## 工具

寫碼 Codex gpt-6.1-sol high resume `01a1212e`；複審 resume `01a12013`。撞額度即停。

## 本輪先查／計畫

已確認分支v1.0/quick-fix、HEAD106661e、工作樹乾淨，總覽檔案不在此分支，不帶入。先親讀3134節點骨架及skeleton.js：裸data-testid是空屬性；非空未知值會=x，沒有可用前綴。以內層dialog、label關聯、日期／時間group與選項完整域辨識；保留原合成備援。原生select集中writer批次設值、input/change、讀回失敗整組還原並派送事件；date input不猜測同步，只讀min/max預檢。新fixture／日期／id／文字全部合成2027+。補九語錯誤、select／label testid安全匯出、原送出禁令及新攻擊自測，最後跑unit／verify，Chrome e2e與提交交外部。

## 實作／交接結果

- 結構證據、選擇器依據、空testid意義及5步實測見GATE0「1.0快速時段0.1.1：真骨架」。內層aria-modal dialog與兩group，label關聯＋選項域；保留合成備援，不猜class／真id／前綴。value／React行為仍待真頁確認。
- 原生writer批次設值／input/change，讀回失敗整組還原＋事件；還原不完整明示。新增九語年份／選項／bounds／讀回／還原錯誤。date input只讀min/max，不直接同步。skeleton僅select／label的安全日曆UI詞彙testid可見，身份／任意詞／option內容仍遮。
- 假fixture三份（quick-real-dialog、year-missing、rollback），新quick-real unit及content VM；所有新日期2027+，原始骨架未提交。沒有總覽程式／接線；position模組未動，reader只升版。
- 本輪npm test：11檔退出0；細項169/169、0敗／0跳過。verify OK：30 API／14 icon／9 SVG／55 leak／21 storage／39 native writer；原41／33自測保留。node語法及diff空白檢查過。
- e2e沙箱listen EPERM退出1，Chrome斷言0、新截圖0；外部跑`npm test`、`npm run verify`、`npm run e2e`（原Chrome for Testing／Xvfb），並提交b60b70d之後的修改。新增截圖quickfix-{real-detected,real-filled,year-missing,rollback}；舊截圖不覆寫。未達READY，還需外部最新e2e、另一session複審及老闆逐欄實測。
- 請老闆再貼0.1.1設定視窗開著的骨架＋計數診斷。新版不能還原原先空testid，value仍遮罩；若失敗需非個資label／option編碼類型。不要提交真機內容／日期／id。

## 中斷：Codex 額度（2026-10-10 約 17:45 UTC+8）

寫碼 session 01a1212e 第一輪在跑自己的 e2e 時撞額度，訊息為「try again at 7:12 PM」（19:12 UTC+8）。進度 commit 在 `737d242`（manifest 0.1.1、quick.js 真骨架偵測／原生 setter／讀回還原、skeleton.js testid 白名單、三個 quick-real fixture、quick-real 單元測試、GATE0／ROADMAP／AGENTS 已改，不保證寫完）。

外部實測（737d242）：npm test 169/169、verify OK（55 leak、39 native writer 自測）。e2e **失敗**，兩個快速時段情境本身 ✓（含 quickfix real structure），失敗在網路守衛：Chrome 為 fixture 裡的 `input type=date` 自繪日曆圖示產生 `data:image/svg+xml` 請求（fill=WindowText，Chrome 內建 date picker indicator，非擴充、非網路），被「0 請求」斷言擋下。待辦：e2e 的請求守衛對瀏覽器內建 data: 圖示的處理要有依據地調整（不能放寬成接受任何網路請求），或 fixture 讓該 input 不渲染指示器；然後跑完 e2e、截圖、複審 01a12013。
