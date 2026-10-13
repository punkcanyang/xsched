# xsched 0.1.5 — 發文框快速時段

基準 main `595e29e`，分支 `v1.0/quick-015`。首次檢查時尚無 0.1.5 WIP；其後外部存成 `81fed7d`、`e5865d0`、`9a9bd83`，本次從 `9a9bd83` 接續，不丟棄外部截圖、不 commit／push／merge。

## 計畫與依據

1. 既有 0.1.1 遮罩骨架 L517：`tweetTextarea_0`、role=textbox；L601：`scheduleOption`、button/type=button/role=button，含 SVG。原檔及真機截圖不進 repo，只記結構證據。
2. 新模組集中辨識上述控制項、建立 shadow 快速列；內容沿用浮層四個固定時段＋隨機時段，共五顆。唯一代點是經可信使用者點擊、重新辨識後的原生排程圖示。
3. 等待唯一新 picker，沿用 quick.js 的有界重試、整組讀回／還原和被動成功觀察；不代按確認、排程、發佈或關閉。
4. verify 只為上述唯一 click statement 加精確 SHA 例外及直接相關攻擊測試；其他守門不變。版本同步 0.1.5。
5. 合成 2027+ fixture／單元回歸、追加 e2e 入口情境及連用三次走查，跑 test／verify；外部跑 Chrome 與獨立複審，未完成前不宣稱 READY。

## 續作狀態

外部途中已存 WIP `81fed7d`（tracked 接線／版本／摘要）；composer.js、合成 fixture、單元測試與本交接原先仍未追蹤，本輪接著完成。沒有把原骨架或真機截圖放進 repo。


## 完成內容

- `probe/composer.js` 集中所有入口選擇器與唯一 `activateIcon`。原生圖示需符合骨架證明的 button／type／role／testid，含 SVG、沒有可見按鈕本文；與一個可見 editor 共用最近且無歧義的容器。最多八個圖示、祖先最多 24 層；disabled／隱藏／背景 article／tweetText／自家 host 不採用。找不到圖示仍顯示停用列與九語提示，不改 X 控制項。
- 新列以正常文件流附在 composer 容器，全部 UI 在自家 shadow。四個固定時段＋最後一則隨機，共五顆，沿用浮層標籤、A/B、快取和實際未來日期；不另加第六種未定義時段。按鈕可換行、文字可折行、不超過容器寬度，320px 幾何由新 e2e 驗證。浮層入口保留。
- 唯一可信使用者動作可代點經重查的圖示一次；已有 picker、缺快取、不可信事件、忙碌或失效圖示不點。最多等 20×100ms，只有新出現且唯一可辨識的完整 picker 才呼叫原 `fillSlotResult`。仍走相同原生 setter、input/change、相依順序、有界重試與整組讀回／還原；quick.js 完全未改。等待期間原 composer 被移除會明示停止，不留「正在開啟」狀態。
- 成功、失敗及缺視窗以九語狀態列及自家 shadow 提示呈現；提示不攔截滑鼠，不包含本文、帳號、網址或例外原文。未找到視窗零寫入；中途失敗可能已派送欄位事件，但會由原 writer 整組還原，不能稱「零事件」。還原不完整沿用明確警告。這版只准點開啟圖示，不能代點關閉：已打開的原生視窗保留原欄位，請使用者自行關閉，不用 click 取消或改 X DOM 關掉。沒有半填／永久忙碌的狀態，但不能保證原生視窗自動關閉。
- 填好仍由使用者按確認／排程／發佈；原 0.1.4 親按後成功觀察與最後時間更新沿用。UI 本身不新增 storage，權限／matches／網路政策與 main 相同；只有 manifest 加一個本機 content script、版本改 0.1.5。
- verify 精確鎖住根目錄 composer.js，只有 `icon.click();` statement 從 activation 掃描中移除；並非放行整個 click 規則。新增 5 項直接相關來源／接收者／信任檢查／重查／改名攻擊；原 writer 59 項全部保留，合計 64。原其他規則及自測數量不減。AUTHOR_CONTENT_SHA256 及新增 COMPOSER_SOURCE_SHA256 同步；ui／quick／position 來源未改，不必重設其摘要。

## 測試、走查與待外部

新增 `test/composer.test.mjs` 五項直接回歸：證據匹配及誤按排除、九語／不可信點擊、三次連用的原生受控重建與零送出、缺圖示／缺新視窗零寫入、失敗全組還原及親按成功觀察。測試模板只用假資料，年份 2027–2029，時鐘固定 2027 年底；linkedom 對 inert template 的查詢與 Chrome 不同，測試把模板暫時移出 document 以符合瀏覽器語意，production 不加時間或測試鉤子。

新 e2e 區塊只有本入口的 320px 五按鈕／原生工具列不重疊、三次時段填值／每次唯一圖示 click、input/change 與完整年月日時分上下午、缺圖示／缺視窗／失敗還原。所有確認／排程／Post／calendar／submit 計數仍 0。舊情境只同步 0.1.5 版本期望，其他斷言、截圖路徑及網路守衛保留。原來的 realPickerState 依賴展開浮層，新入口另讀原生欄位，不為測試打開 Dagaz。新截圖為：

- `docs/v1.0-quick015-composer.png`
- `docs/v1.0-quick015-filled-morning.png`
- `docs/v1.0-quick015-filled-lunch.png`
- `docs/v1.0-quick015-filled-evening.png`
- `docs/v1.0-quick015-no-dialog.png`
- `docs/v1.0-quick015-reject.png`

前一環境曾實跑 npm test 14/14 檔全過（新增 composer 5/5；連用三次走查通過），verify OK（12 probe 檔，64 writer 自測，其他原數量不變）。這不是本輪最終來源的通過宣告：本輪等待中移除 composer 的狀態提示與九語測試接線另有小修。

本輪環境重建後缺 node_modules：實跑 `npm test` 因 linkedom 等依賴缺失而檔案啟動失敗，不能視為測試斷言結果；離線 `npm ci --offline --ignore-scripts` 缺 zod 快取（ENOTCACHED），一般安裝則 DNS EAI_AGAIN，沒有修改 lockfile 或省略測試。`npm run verify` 的本輪啟動結果見下方補記。JS 語法、JSON／版本／摘要及 diff 空白檢查可在無依賴下驗證。Chrome e2e 按本任務交由外部跑，不宣稱已產生新截圖或完成瀏覽器走查。

外部請執行：

```bash
export PATH=/home/box/.local/bin:$PATH
npm ci --ignore-scripts
npm test
npm run verify
npm run e2e
```

四個新增檔案仍需外部加入 commit：`probe/composer.js`、`fixtures/quick-composer.html`、`test/composer.test.mjs`、本 HANDOFF；不要漏掉。原有未追蹤 0.1.4 假資料圖保留，不以其結果代替本版驗收。

## 老闆實測（≤5 步）

1. 合併後 `git pull --ff-only origin main`。
2. `chrome://extensions` 重新載入 probe，確認 0.1.5，再重新整理 x.com。
3. 在發文框確認工具列旁有五個快速時段，窄視窗不蓋住原生按鈕；不用先開 Dagaz。
4. 連用三次不同時段，逐次確認原生視窗開啟與六欄正確，且沒有自動確認／排程／發佈。純測試請用 2027 年以後，核對後自行關閉；真的要排才親按原生按鈕，再核對最後時間來源。
5. 找不到圖示／視窗或填值失敗時，確認有清楚提示及欄位原狀，有問題截圖＋複製診斷私下貼回，不提交真機資料。

本輪不交 STATUS READY：需要外部最終 test／verify／e2e、Chrome 連用三次走查、合成截圖及指定 `01a12013` 獨立複審（最多兩輪，只看 P0/P1；P2 記 BACKLOG）。沒有代替另一 session 複審，也沒有開 PR、commit、push 或 merge。

本輪最終補記：`npm run verify` 也因 `ERR_MODULE_NOT_FOUND: linkedom` 在載入階段退出 1，尚未跑到守門自測，不能說 verify OK。離線／一般安裝都未成功，沒有可用的本機 linkedom／esprima 副本。無依賴檢查通過：JS 語法、版本 0.1.5、manifest 權限／matches 與基準相同、四份來源 SHA 逐一吻合、唯一 icon.click statement、自家 quick／ui／position／network-policy 與基準逐字未改，以及 git diff --check。需外部安裝依賴後重跑三測試；本輪不宣稱 READY。


## 外部 e2e 啟動紅燈：Chrome 路徑

外部 Node 26 已實跑 test 235/235、verify OK（64 writer，其他自測原樣）。e2e 在啟動瀏覽器前找不到舊預設 `/tmp/cft/chrome/linux-155.0.8059.39/chrome-linux64/chrome`，尚未跑到情境斷言。puppeteer-core 不會隨 npm ci 安裝 Chrome；缺少該檔案是測試環境問題，不是時段／填值紅燈。

本輪只改 e2e 的執行檔尋找與本交接，既有情境、斷言、網路政策、probe、版本及來源 SHA 全不動。CHROME_PATH 明確指定時必須存在且可執行，錯誤不偷偷 fallback。未指定時只找 tmpdir/cft 與 PUPPETEER_CACHE_DIR（預設 ~/.cache/puppeteer）的 Chrome for Testing Linux 安裝，優先較新數字版本；不再綁一個暫存版本號、不改用個人 Chrome profile、不自動下載。啟動前找不到便明示安裝指令。

外部若尚未安裝，先在開發環境執行（不是擴充的網路請求）：

```bash
export PATH=/home/box/.local/bin:$PATH
npx @puppeteer/browsers install chrome@stable --path /tmp/cft
npm run e2e
```

若已安裝在其他路徑，直接 `CHROME_PATH=/完整路徑/chrome npm run e2e`。仍需 Xvfb；Chrome 找到後才會跑原來的完整情境與 0 擴充請求斷言，不能把找到瀏覽器當成 e2e 通過。

Chrome 路徑修正收尾（接續外部 WIP `ac79ea8`）：本機 Node 26.10.0 實跑 `npm test` 14/14 檔通過，0 失敗、0 跳過；`npm run verify` OK，64 writer 與全部其他自測數量原樣。另在 /tmp 以假安裝目錄驗證五個尋路案例：缺瀏覽器、數字版本排序、明確 CHROME_PATH、錯誤明確路徑不 fallback、不可執行檔不採用，5/5 通過，沒有新增 repo 測試或守門。

完整比對確認 e2e 從 `const sleep` 到結尾（全部情境／斷言）與修前逐字相同，probe／verify／network-policy／test 檔未動；JS 語法與 diff 空白檢查通過。本環境仍沒有 Chrome for Testing，實跑 e2e 以明確「Chrome for Testing not installed」及安裝／CHROME_PATH 指令退出 1，未跑情境。外部需要先安裝瀏覽器或指定有效路徑，再重跑完整 e2e；不能宣稱這次已通過 Chrome。只改 e2e 路徑設定與本交接，沒有 commit／push／merge。

## testfix-2：外部仍缺 Chrome for Testing

外部 235/235 test、verify OK，但直接跑 e2e 仍回報「Chrome for Testing not installed」。這代表 testfix-1 的初始化檢查正確辨識缺安裝，不是新的情境斷言失敗。檢查現有 cache 沒有 Chrome for Testing，只有 `/opt/google/chrome` 的一般 Google Chrome 154；不修改擴充或 e2e 斷言來繞過安裝需求。

本輪已實際嘗試專案內安裝器（不經 npx 再安裝套件）：`node node_modules/@puppeteer/browsers/lib/cjs/main-cli.js install chrome@stable --path /tmp/cft`，在解析 `googlechromelabs.github.io` 時遭 DNS `EAI_AGAIN`，下載未開始。程式的路徑搜尋不能憑空補上瀏覽器；沒有需要修的來源邏輯，僅補此環境證據與指令。沒有修改 test／verify／e2e／probe，沒有刪斷言或放寬守門。

外部必須在能下載的環境執行上述安裝器（或安裝既有 Chrome for Testing 並設定 CHROME_PATH），再跑 `npm run e2e`。若外部也遇 DNS 錯誤，需先恢復該開發環境的 DNS／下載連線；安裝未成功前，重跑 e2e 會得到同一個缺瀏覽器訊息。本輪不宣稱 e2e 通過、不 commit／push／merge。

## 複審第 1 輪 P1（b）–（g）續作

基準 `21513bf`，本輪先核對 log／diff，尚無這六項修正的 WIP。原斷言與守門保留；先補不衝突的 b/c/d/f，每項追加直接相關單元與 015 e2e。e 的 optional open 數字 schema、g 的未知／已確認空列表界線已向使用者詢問；不在未確認時偷偷放寬位置 schema 或無快取停用斷言。外部 Chrome 走查及第二輪 P0/P1 複審仍須由外部做，不 commit／push／merge。

### 已完成 b/c/d/f/g，e 待儲存授權

- b：不改 generic collectObstacles 的 dialog 排除規則。只把 quick 已辨識且完整的原生 picker 傳給新的 pure `avoidPicker`；不重疊保留拖曳點，重疊時在視窗內四個方向選最短平移，留 8px。不寫回這個臨時位置，picker 關閉會回原拖曳點；在臨時避讓位置開始拖動時，以實際顯示的 CSS 座標為起點。物理上沒有可分離空位時維持原點，不假稱能避開全螢幕 dialog。
- c：新 Scheduled route／scope 尚未讀到列表時，零列不清最後時間。busy／progressbar 節點仍保守視為待載入；已有排程列的同一 scope 後續變空，或已選 Scheduled tab 的已知空列表公告，才可確認空。頁面背景時間軸的 cell 不當成已載入 Scheduled。reader 讀法本身不改。已知公告目前只取原 empty fixture 的精確「Nothing scheduled yet.」；未知真頁空提示保守保留快取，不能把未知空 DOM 當成載完。
- d：親按排程後通過既有成功觀察，浮層和 composer 提示改為九語「已觀察到排程完成」。即使快取已有更晚的排程，也要更新狀態，不能因 max 不變而留著「尚未排程」。診斷 fill=ok 仍是最後一次填值記錄，不改既有觀察／送出守門。
- f：自家 panel 明確畫在 shortcut 上層；shortcut 拖進固定操作鈕／作者連結區域，命中仍落在 panel 控制項。沒有移動任一錨點來避讓自己。鈕被 panel 覆蓋時，可用 panel 的縮小鈕讓鈕再露出。
- g：區分「未知／沒讀過」與「已確認空列表」。前者仍停用，保留舊的無快取斷言；後者可從現在＋隨機 A/B 分鐘填值，不製造假的最後排程快取。沿用整分鐘向上取整及 5 分鐘安全餘量。空列表確認目前限本次頁面 session；整頁重載後沒有證據就回到未知，需再讀列表。浮層與 composer 共用這個布林狀態，沒有新增 storage。

每項已有直接相關單元測試，015 區塊各有一個新增 assert：b 同時驗原拖曳點與最短 38px 平移、c source-2 快取在 SPA busy 時逐字不變、d 親按後狀態離開未排程、f 物理拖到診斷／作者兩處仍命中、g 零快取的已確認空列表從現在＋A/B 填。d 的排程是 Puppeteer 模擬使用者親點，不是擴充代按；其餘既有 click/submit 與網路斷言全保留。舊 e2e 語句／斷言與 `21513bf` 完全保留（僅新增一段及一個空行）。verify 只同步 ui/content/quick/composer 四個 SHA，原規則／全部自測逐字未動，position.js 與 storage schema 未改。

本機實跑 `npm test` 14/14 檔通過、0 失敗、0 跳過；content 42/42、ui 9/9。`npm run verify` OK，仍為 30 API／14 icon／9 SVG／66 leak／37 storage／64 writer／22 author-link／160 URL／28 author boundary／158 解構／514 資源／308 CSS。語法與 diff 空白檢查通過；依本任務不在沙箱跑 Chrome e2e，外部需重跑。版本仍 0.1.5，不增加權限／網路或送出操作。

**e 未完成，不能宣稱六項已全過。** AGENTS 限定五個固定數字 key，panelPos 必須恰好 `{x,y}`；舊單元與 e2e 又逐字核對這個 schema。把 open 加在 panelPos 會破壞舊斷言，不能擅改。已詢問使用者是否授權 position.js 新增唯一 `xsched.probe.panelOpen`，schema 恰好 `{open:0/1}`，拒絕額外欄位／其他值；保留原五個 schema 與所有舊斷言，不增加擴充權限。收到明確授權後才實作對應 reload 接線、單元與第六個 015 assert，目前未寫這個 key。沒有用位置數字偷編碼狀態，也沒有用 history／其他儲存繞過守門。等待中的問題不是合併批准，而是必要儲存規格的授權。
