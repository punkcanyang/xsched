# HANDOFF：xsched 0.1.3

分支 `v1.0/quick-013`，基準 main `4c16518`。只做這條需求，不帶入總覽；提交、push、複審、merge 與 Chrome e2e 由外部處理。

## 計畫

1. 在唯一數字儲存模組增加 A/B、最後讀到的排程時間＋讀取時刻、浮層高度三個固定 key；原位置 key 與禁令保留。
2. 新增最後一則＋隨機整數分鐘，沒有快取停用；已過時計算現在＋間隔。固定時段顯示實際日期／明天，按下時重算。
3. 浮層預設約 2/3 視窗高，底部 pointer 把手調整高度、保存、resize 夾回視窗；不影響鈕或浮層位置的獨立模型。
4. 年→月→日→上下午→時→分逐欄填值、重查並等待；暫時回收時有限重試，填完才整組核對，失敗依日曆值還原。
5. 保留零送出／網路／權限守門、加數字 storage 攻擊與回歸、更新版本及來源摘要，執行本機 npm test／verify；e2e 與假資料截圖外部跑。

原始真機資料不寫 repo。快取是最近讀到的列表，不是完整或即時排程權威；老闆仍須自己捲動並核對。

## WIP 與本次接續

外部已提交並 push WIP `d743155`。本次先以 `git diff 4c16518` 核對現有實作，再補 e2e 與文件；沒有重做或丟棄 WIP。五步計畫已完成實作，本機結果如下，完整 Chrome e2e 與獨立複審仍待外部。

使用者改為要求逐檔 WIP commit；已在完成 e2e 後嘗試 `git add -- scripts/e2e.mjs && git commit ...`，但沙箱回報 `fatal: Unable to create '/workspace/xsched/.git/index.lock': Read-only file system`。因此這次沒有建立新 commit、沒有 push／merge，完成的檔案留在工作樹，須外部提交。

相對基準共 38 個檔案有變更：主要實作在 `probe/position.js`、`quick.js`、`ui.js`、`content.js`；manifest／package／lock 及 reader／skeleton 版本同步，後兩者只改版本。其餘是 verify、e2e、合成 fixture 生成器與 fixture、單元回歸，以及 AGENTS／README／ROADMAP／GATE0／本交接。這次接續的未提交變更有 13 個檔案，未碰總覽或其他分支。

## 已完成

- 新時段：最近看過的有效排程時間最大值＋隨機 A–B 整數分，預設 10–30，兩端皆可抽中。沒有快取停用並提示先到 Scheduled；快取旁顯示讀取時刻與「只涵蓋已讀列」提醒。已過結果以現在＋同一次抽到的間隔重算，保留至少 5 分鐘安全餘量，向上取整分鐘。
- 讀列表時保存數字快取；離開列表或 reload 後可用，明確空列表清快取，解析失敗不覆蓋。補回歸：失敗讀取之後變成空列表，即使兩次都零個可解析時間也須清掉舊快取。讀法本身沒有改，reader 只升版本。
- A/B 設定區驗證正整數／A ≤ B，只有明確使用者儲存才寫設定，錯值不覆蓋。九語標題、提示、aria-label／title 齊全。
- 原四時段顯示實際本地日期及時間，今天／明天有清楚標示；下個工作日顯示日期。poll 更新標籤，按下時重算，不沿用舊 target。不能推定 X「時間已過」的內部原因，仍須老闆核對實際欄位與 X 提示。
- 浮層預設目標約 2/3 視窗高，底部把手調整並保存高度。最小可用高度／視窗夾位、內容捲動與固定操作區保留；預設自動避讓可能縮短，保存手動高度後優先使用手動值。resize 不覆蓋存值。把手使用 section pointer capture，門檻 6px，取消／resize／縮小／reset／remount／pagehide／dispose 清理，不保存半途拖動。
- 填值按年→月→日→上下午→時→分，逐欄重查同一 dialog，原生 setter＋bubbles input/change。每欄只等待重繪，不中途因 target 不符還原；暫時缺欄最多六次辨識、input 時回收最多三次嘗試。離開原 scope／另開 dialog 不重試，舊 detached 節點不送 change。
- 全部填完才核對整組（有界觀察、兩次一致）；錯了才按目前 option 的日曆含義還原全部原值並核對。保留晚到編碼切換／同 raw 不同月份／回收或拒絕還原的複審回歸。不 click X／confirm／Schedule／Post／calendar，不 submit、不派送鼠鍵事件。
- 版本 0.1.3 在 manifest、package／lock、reader／skeleton、面板／診斷、README 與本交接一致。manifest 只改版本及準確的數字儲存說明；權限／host／matches／resources 不變。

## 五個固定數字 key

只在根目錄 `probe/position.js` 使用 x.com localStorage，各 schema 拒絕額外欄位，讀寫都驗證；儲存例外不外洩。

| key | 格式 |
|---|---|
| xsched.probe.pos | 有限數字 `{x,y}` |
| xsched.probe.panelPos | 有限數字 `{x,y}` |
| xsched.probe.quickRange | 正整數 `{a,b}`，a ≤ b |
| xsched.probe.lastScheduled | 有效毫秒時間數字 `{time,readAt}` |
| xsched.probe.panelHeight | 有限正數 `{height}` |

不存本文、帳號、網址、診斷。重設位置只清原兩個位置 key；高度、間隔及時間快取保留。X 同來源頁面程式也可存取這些數字；不加 storage 權限，不用 chrome.storage。

## 本機驗證

PATH 先 `export PATH=/home/box/.local/bin:$PATH`。以最新工作樹執行：

- `npm test`：13 個測試檔通過。
- 細項 TAP：209 過／0 敗／0 跳過（含子測試）。
- 快取邊界回歸以帶年份的無效時間觸發既有 reader 的 timeFail，再移除列確認清快取；明確斷言 timeFail，避免把 reader 判定為空的無日期文字誤當讀取失敗。沒有改 reader 行為或放寬預期。
- `npm run verify`：OK，30 API／14 icon／9 SVG／66 leak／34 storage／52 native writer／22 author／160 URL／28 author boundary／158 解構／514 resource／308 CSS 自測。原 storage 21＋13；writer 49＋3，其餘舊自測數量不減。
- 四份位置／quick／ui／content 精確來源摘要已核對。作者 factory 內容不變；網路政策與 e2e 最後的網路守衛逐字保留，0 擴充資源／背景請求斷言未放寬。語法、`git diff --check`、manifest 權限／資源比對通過。
- 十份 picker＋一份假列表掃過，沒有 URL／email／handle／UUID，年份 2027+、option 數量正確。生成器只讀合成設定，不讀任何老闆原始骨架／截圖，未複製真機資料。

完整 Chrome e2e 本次未跑，沒有產生新截圖。`npm test` 的檔案數與細項數不同，不能當 Chrome 斷言數。尚未 READY，外部三測試／獨立 session 複審／老闆驗收仍要完成。

## 外部要跑

```bash
export PATH=/home/box/.local/bin:$PATH
npm test
npm run verify
npm run e2e
```

需要既有 Chrome for Testing／Xvfb／CHROME_PATH。日期 input 仍只讀 min/max；fixture 只用 CSS 隱藏 Chrome 內建日期圖示，沒有 data: 豁免。新 e2e 要求實體點擊快速鈕、讀回相同日期／時分／上下午、送出 click／submit 全 0；真列表快取透過 reader 產生，clock 在兩世界 2027+；另測 interim／transient 重建、過期回退、高度拖曳／reload／窄視窗與固定操作鈕命中。

新截圖主要輸出（舊截圖不覆寫）：

- `docs/v1.0-quick013-no-cache-dates.png`
- `docs/v1.0-quick013-cached-list.png`
- `docs/v1.0-quick013-random-filled.png`
- `docs/v1.0-quick013-height-dragged.png`
- `docs/v1.0-quick013-height-clamped.png`
- `docs/v1.0-quick013-transient.png`
- `docs/v1.0-quick013-interim.png`

原情境也產生 v1.0-quick013 前綴的副本；包括 real-detected／real-filled／year-missing／rollback／autocorrect／diag-failure 等。

## 老闆實測 ≤5 步

1. 合併後在 main `git pull --ff-only origin main`。
2. `chrome://extensions` 重新載入 probe，確認 0.1.3，再重新整理 x.com。
3. Scheduled 自己捲到底、對照則數，確認快取讀取時刻；拖底部把手，重新整理確認高度保留。
4. 自己開原生排程視窗，設定 A/B，選標出日期的時段或最後一則＋隨機，逐欄核對；**不要按排程／發佈**。
5. 複製診斷貼回（成功也貼 fill=ok）；有問題附浮層截圖／遮罩骨架，真機資料不提交公開 repo。

## 已知限制

快取不是完整即時排程：未捲到底、刪除／編輯、跨頁或跨分頁時可能過期，須自行核對。未知列不覆蓋原快取；極大間隔／X 有限年份或分鐘選項可能無法表示，會零寫入拒絕。X 允許的最小提前量未知，保留 5 分鐘餘量；本地 DST、時區或 X 內部狀態仍須真機驗證。原生日期 input 不直接寫，selected option 讀回成功不保證 X 已接受整個排程。群組／dialog 被全面替換或拒絕還原時可能還原不完整；有界重試／觀察無法涵蓋任意晚到重繪。沒有自動預排、佔用避讓或總覽，最後送出一定由老闆自己決定。$0，沒有新增權限或網路請求。
