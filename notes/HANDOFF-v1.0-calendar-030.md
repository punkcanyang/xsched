# xsched 0.3.0 排程日曆交接

分支 `v1.0/calendar-030`，同一寫碼 session 延續。沒有 commit、push、切分支；PR／獨立複審／Chrome e2e 由外部處理。新增資料皆為示例，fixture 日期 2028，24h 情境與單元時鐘 2027+；沒有登入 X 或按 Post。

## 做法與資料格式

- 新 `probe/calendar-store.js` 是本版唯一新增 storage 邊界。x.com 頁面自己的 localStorage 固定 key `xsched.probe.calendar`：

  ```js
  {version: 1, syncedAt: 1830258000000, partial: false,
   items: [{time: 1830301200000, preview: "Example early schedu"}]}
  ```

- 頂層與每列都拒絕額外欄位；版本恰為 1，partial 為布林，時間為有效正整數 ms（Date 上限內），預覽最多 20 個 Unicode code points。syncedAt=0 代表尚未讀列表；若有項目，必須 partial=true。最多 2,000 列，JSON 最長 1,000,000 UTF-16 單位；壞 JSON／版本／schema 讀到即丟棄。儲存失敗保留當頁記憶體並顯示錯誤，不改存其他位置。
- sessionStorage 固定 key `xsched.probe.calendarTarget`：`{version:1,time,preview,expiresAt}`，兩分鐘有效。可信日曆項目點擊才建立；導覽使用既有固定 Scheduled URL。新頁先移除 target，再驗證／放到短期記憶體；零列、多列、一次點擊後皆消耗，不會重複點或重試。sessionStorage 無法寫／移除時不代點。尚未掛上 Scheduled 分頁／列表或仍 busy 時保留目標等待 DOM 掛載；只有可辨識列表才消耗一次。現有 400ms poll 只清理逾期目標，不新增計時器或背景讀取。
- `content.js` 啟動恢復日曆；成功完整同步取代快取，部分／虛擬視窗合併，載入中不清；完整零列也保存同步時間。既有親按成功觀察立即追加時間＋20 字並持久化，沒有列表同步時仍標 partial、不偽造同步時間。同分鐘不同預覽可保留。清除按鈕只清本版日曆資料／記憶體／待編輯目標，保留既有數字設定；同一 Scheduled snapshot 的後續 poll 不立刻寫回。
- `calendar.js` 建立九語日期分組與跨日的前一則分鐘差。全頁視圖是七欄、六週、42 個日格的月曆，帶在地星期標題、切月、同步時間、24h／不完整提示、關閉／Esc 與鍵盤焦點控制。全部位於既有 shadow root，預覽一律 textContent，不進診斷或骨架。
- 原生列點擊的所有 receiver 邊界在摘要鎖住的 calendar 模組：Scheduled 分頁、非 body scope、原生 row button、唯一 tweetText、可見、非 disabled、非 form／composer／背景 article。依時間＋20 字找唯一列，點前整組重新辨識同一節點，唯一 `row.click();` 只開編輯器。0 列說明，≥2 高亮候選，不點／不捲動。reader 僅額外導出原本的只讀 `parseElement` 為 `parseRow`，原檔維持未鎖，舊 19 項 CLI 攻擊測試未改。

## verify 改動

1. 新 `CALENDAR_STORE_SHA256`：僅根目錄 calendar-store.js 且完整來源一致，才移除六種固定 storage expression（localStorage 的 DATA_KEY get/set/remove；sessionStorage 的 TARGET_KEY get/set/remove），再跑原兩條 storage 規則；未移除的程式碼及全部其他規則仍掃描。
2. 新 `CALENDAR_SOURCE_SHA256`：僅根目錄 calendar.js 且完整來源一致，移除唯一 `row.click();` statement 後跑原 activation 規則。不豁免 dispatchEvent、submit、網路、storage、反射、資源或注入禁令。
3. 同步 AUTHOR_CONTENT_SHA256；position、quick、composer、ui 摘要不變。
4. CLI 子程序曾以既有 10 秒上限 ETIMEDOUT；量測發現反覆正規化整份來源的成本。將純函式 canonicalSource 的相同輸入結果在每個 scanSource 呼叫內重用（原文／activation／storage 各 view），不改任何 regex、輸入或判定，保留原逾時。
5. 原 1,410 項自測及所有規則保留。另加 31 項日曆邊界攻擊：錯 key／schema／TTL／未消耗目標、移除信任／唯一性／scope／disabled／type 檢查、改 receiver／重複點／submit／別處 storage／網路／改名等，合計 1,441 項。舊完整 repo CLI 的 19 項攻擊仍必須由具體靜態規則拒絕，不能靠來源摘要失敗替代。

## 新增測試與 e2e

- `test/calendar030.test.mjs`：11 項，嚴格 schema／Unicode／限額／壞資料丟棄、session target TTL／一次性、儲存例外與非 x.com 拒絕、九語／日期與分鐘差／閏月、42 格／切月／Esc／關閉／不可信事件、兩個不同項目各只點對應列一次、零／多列不點且高亮、可見／disabled／type／路徑預檢、固定導覽、目標等待 Scheduled 分頁／列表掛載，以及 31 項守門攻擊。
- `test/content.test.mjs`：新增 2 項，跨頁／整頁 reload／隔日／24h／清除後仍空，以及部分快照持久化後完整同步移除舊列；另在既有親按成功測試驗證立即持久化。
- e2e 新增 `calendar.html`、`calendar-ambiguous.html`、`calendar-missing.html` 合成列表／編輯器，第三份少 early 列，第二份同時間／同 20 字但後文不同的兩列。原生列點擊只顯示編輯器並記錄 row ID，Update／Schedule／Delete／Post 另各計數。
- 新 e2e：Scheduled 同步→首頁→整頁 reload 的精確資料恢復，日期／時間排序與 45／2055 分鐘差，42 格／七欄／全視窗矩形，Esc／關閉，首頁點 early 跨整頁導覽後只點 early 一次、全頁格子點 late 只點 late 一次、四個送出／刪除控制項皆 0、兩候選高亮／零候選說明且 0 點擊、24h 提示及原 goto、清除後 reload 空白。既有 021 親按成功情境追加持久化與 reload；020 短列表／完整空列表追加持久化斷言。
- 唯一新增預定截圖：`docs/v0.3.0-calendar-month.png`，待外部產生；本機沒有產生 docs 變更。

## 改過的既有斷言（本版檔案行號）

| 位置 | 原斷言 → 新斷言 | 原因 |
| --- | --- | --- |
| `test/content.test.mjs:1243`–`:1247` | 不可有任何含 Synthetic 的 storage → 保存恰 6 則、觀察時間存在、每列只有有效數字 time 與 ≤20 字 preview，僅新 calendar key 可存預覽 | 老闆授權日曆持久化；保留其他 key 不得存文字的限制 |
| `scripts/e2e.mjs:2150`–`:2157` | 任何 key 都不得含 synthetic modal → calendar key 恰為 version／syncedAt／partial／items schema，1 則、恰好指定前 20 字／time 兩欄，其他 key 不得含文字 | 既有親按排程觀察現在必須立即保存預覽；仍不得存完整草稿或額外欄位 |
| `scripts/e2e.mjs:2265` | 固定 Scheduled 頂層導覽恰 1 次 → 恰 3 次 | 原 goto 1 次＋新日曆 early／missing 情境各一次使用者可信點擊。仍是精確次數，資源／背景 0 及所有 network-policy 規則不變 |

版本期望只把 0.2.3 換為 0.3.0，包含 regex 跳脫，沒有改 matcher 強度：

- `test/content.test.mjs:23`（fixture manifest）、`:339`、`:342`、`:351`、`:549`。
- `test/ui.test.mjs:109`、`:110`、`:113`、`:115`、`:120`、`:122`、`:123`。
- `test/reader.test.mjs:219`、`test/review.test.mjs:175`、`test/skeleton.test.mjs:30`、`:32`。
- `scripts/e2e.mjs:392`、`:468`、`:475`、`:490`、`:784`、`:880`、`:898`、`:1271`、`:1309`。

其他測試前提調整：`scripts/e2e.mjs:1986`–`:1988` 的 020 empty walkthrough，以及 `:2116` 的 021 每次獨立走查，明確清掉新日曆 key，保持原「尚未同步」前提；不是改成期待空的資料會自己消失。原空狀態斷言完整保留。`:2012` 只把 assertion 說明的 in-memory 改成 local。原 fixture／其他情境／逾時／等待器／點擊 helper 不變；新日曆另有自己的實體點擊 helper。

## 改動檔案

- 新產品：`probe/calendar-store.js`、`probe/calendar.js`。
- 接線／純資料／版本：`probe/content.js`、`probe/overview.js`、`probe/reader.js`、`probe/skeleton.js`、`probe/manifest.json`、`package.json`、`package-lock.json`（只有根版本兩處，依賴不變）。
- 守門／e2e：`scripts/verify.mjs`、`scripts/e2e.mjs`。
- 新 fixture：`fixtures/calendar.html`、`fixtures/calendar-ambiguous.html`、`fixtures/calendar-missing.html`。
- 測試：新 `test/calendar030.test.mjs`；改 `test/content.test.mjs`、`test/reader.test.mjs`、`test/review.test.mjs`、`test/skeleton.test.mjs`、`test/ui.test.mjs`。
- 文件：`AGENTS.md`、`README.md`、`notes/BACKLOG.md`、本 HANDOFF。

## 本機驗證與外部待辦

- `PATH=/home/box/.local/bin:$PATH npm test`：17/17 檔，0 失敗；真 content VM 60 項，calendar030 11 項。
- `npm run verify`：OK，15 個 probe 檔，舊 1,410 自測保留＋31 新項。
- `node --check scripts/e2e.mjs`、兩個新模組語法檢查、`git diff --check`：通過。
- 按本任務說明，不在 listen EPERM 沙箱重跑 e2e。完整 Chrome e2e 與矩形／實體命中／0 資源背景請求證據須由外部跑；本輪未宣稱 Chrome 通過。外部產物清理照原流程，本機 docs 乾淨。
- 待外部獨立 session 複審與建立 PR；尚未 STATUS READY。

## 外部首輪 e2e：014 快速區首屏排版修正

- 外部 `6856671` 的單元／verify 通過，完整 e2e 在 `014 just opened: full quick area, all four slots and interval save visible` 失敗。0.3.0 整頁載入會恢復總覽，原生選時視窗也沿用「總覽摘要＋同步時間／提示＋第一則在快速區前」；短視窗即使面板長到 viewport cap，也容不下兩者。
- `content.js` 在原生 picker 完整可用時將快速區排在首位，總覽與日曆接在後面；高度下限只計入實際位於快速區前的總覽。首頁／Scheduled 保留總覽在前，快取與提示內容完整保留，未改高度上下限或儲存高度偏好。
- 新增一項真 content VM 回歸，使用 2028 假資料、80px 儲存高度、過期且部分的持久化總覽，涵蓋 1280×600／1280×820 的可視範圍與日曆展開。套回修正前產品碼會以 `entire quick area fits without scrolling` 失敗。
- verify 僅更新 content 的來源 SHA；e2e 腳本、既有斷言／步驟及 verify 規則完全不改。本輪完整 Chrome e2e 仍由外部重跑。
- 本輪 `npm test`（17/17 檔）、`npm run verify`（全部原自測保留）、`node --check scripts/e2e.mjs` 與 `git diff --check` 均通過；未 commit、push 或切分支。

## 限制

- 日曆是已讀列表的快取，不背景同步；虛擬列表須自行捲。發出／刪除直到完整同步才移除。
- 同時同前 20 字的碰撞只高亮、不猜；未載入或不符合原生列結構時不點、不自動捲動。真 X 新編輯器結構仍待老闆自有 Chrome 確認。
- 未解析時間只留在當頁讀取結果，不寫入持久化日曆；保存部分標記以免當成完整列表。
- x.com 同源儲存未按帳號分區（不保存帳號識別）；切換帳號前清除日曆再同步。既有 numeric lastScheduled 等設定由舊位置模組管理，清日曆不刪它們。
