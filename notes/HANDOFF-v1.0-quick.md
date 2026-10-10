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

- [x] 寫碼（0.1.0，未驗證原生欄位假設）
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main

## 本輪簡短計畫（先查後做）

1. 已查：原骨架沒有select／option或設定欄位testid，證據先記GATE0。
2. 集中未驗證選擇器，實作本地日期四個時段與整組預檢／原生setter，唯一事件出口僅input/change。
3. shadow浮層九語快速鈕、純計數診斷、選項骨架隱私；不動舊讀法／拖動／位置。
4. 合成2027+選單fixture、送出計數器、缺欄位／不可表示／時鐘回歸；verify加強，保留全部旧e2e斷言。
5. 本機test／verify；e2e由外部跑，完成文件並交另一session複審。

## 寫碼交付（最新）

基準main 2cceb5e；外部中途WIP 2ac003b已收進部分改動，後續差異仍在工作樹。本session沒有commit／push／PR，沒有改main。

- 證據先記GATE0新節：340748-byte遮罩骨架只有列表dialog，0 select／option、4個設定testid均0；不提交原始骨架。
- 新quick.js集中未驗證testid／name假設、四種本地未來時段（>=now+5分鐘）、整組原生select預檢／setter、唯一input/change事件出口；沒有X click／確認／送出。
- 既有shadow浮層九語快速區／未偵測提示，可信點擊才寫；新純計數診斷。既有雙拖動／位置／reader讀法保留，骨架走全body並把option文字限定為長度。
- 三個合成fixture quick-dialog／quick-missing／quick-partial，年份2027–2031；新quick及真content測試。verify精確SHA只開放quick.js的唯一input/change出口，新增20攻擊自測，洩漏39→41，其他禁令全保留，position模組與摘要不動。
- 版本manifest／package／lock／reader／skeleton／版本測試同步0.1.0，不用version_name；manifest permissions／hosts／resources／matches與基準相同。

本機實跑：npm test退出0（10測試檔）；細項154/154、0 fail／skip。npm run verify退出0（11 probe檔／4 SVG；30 API、14 icon、9 SVG、41 leak、21 storage、20 native writer自測）。npm run e2e退出1，fixture server listen EPERM 127.0.0.1；Chrome斷言未開始、未生成新截圖。node_modules可用，未安裝新依賴。

外部請在最新分支跑：

```sh
npm test
npm run verify
npm run e2e
```

需要原Chrome for Testing／Xvfb；CHROME_PATH預設沿用。e2e新增main／extension兩個世界的2027年測試時鐘，逐欄四時段／原生change與0送出計數、缺欄位／不能表示原子失敗、骨架複製／純計數與原0網路證據；原548基準斷言全部保留，**不當成本輪已通過數字**。至少新增docs/v1.0-quick-{dialog-detected,slot-filled,not-detected,partial-fields,diag}.png，其餘旧情境另存v1.0-quick前綴，所有旧截圖保留。

未達READY：外部最新e2e／截圖、獨立session複審、老闆設定對話框新骨架與欄位對照尚待完成。真頁可能未偵測，不能宣稱真X填值已通過；本版不自動打開視窗、不確認／送出，不做自訂／星期設定／佔用避讓。5步實測、假設表、原生控制項受控事件風險與還缺什麼見GATE0新節。

## e2e 紅燈续修（本輪最新）

外部已commit／push至32b769a，回報154/154、verify OK，舊情境全部過，quickFixture的toggle(true)逾時。本輪只改scripts/e2e.mjs、test/content.test.mjs及GATE0／本交接：**production／fixture／verify不動**。

根因證據：findExtensionContext只保證reader模組已載入，host先掛、首次tick延後60ms；此間shortcut的click因lastReport空而直接返回。真content VM＋原假fixture離線重現「早點＋tick／poll仍false，等待首次診斷後點一次true」，2027 Date mock沒有凍結timer callback。1280×820的原幾何計算可放下panel，modal子樹不是障礙。實際外部紅燈當下尚無state快照，修復仍需外部Chrome重跑確認。

修測試：quickFixture在唯一一次toggle前先等mounted／mode／完整版本診斷，再斷言初始收合且不可見；toggle本身嚴格expanded=true且panelVisible=true不變。首次填值後等待原status節點因render斷線，避免下一button handle在click中重畫失效。全部原送出0／事件／欄位／隐私／網路斷言保留。新增初始化競態VM回歸，不加production hook。

實跑npm test退出0（10檔），細項**155/155、0 fail／skip**；verify OK：30 API／14 icon／9 SVG／41 leak／21 storage／20 native writer。e2e再次實跑listen EPERM 127.0.0.1，Chrome0斷言／新截圖0；node --check與diff --check過。本session不commit／push，外部請在含本次修正的最新工作樹跑：npm test → npm run verify → npm run e2e，再交獨立session複審。截圖檔名與原計畫不變，未達READY。

## 收尾（产品开发，2026-10-10 17:05 UTC+8）

- 寫碼 `01a1212e` 兩輪（第二輪修 e2e 首次 render 前點擊的測試競態）；複審 `01a12013` **VERDICT: APPROVE**，另補 verify 擋解構／反射取得 click／submit 的繞法（native writer 自測 20→33）。
- 外部實跑：npm test 156/156、verify OK、e2e OK 622 斷言。
- PR：https://github.com/punkcanyang/xsched/pull/11 ；merge --no-ff 到 main。
- **排程設定對話框仍無真 DOM 證據**：待老闆照 GATE0「1.0 快速選時段」實測步驟，開著對話框貼「複製頁面結構」＋「複製診斷」。
