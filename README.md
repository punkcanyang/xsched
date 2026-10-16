<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="xsched：在 X 網頁上排程發文，查看已排內容。不用 API，貼文由 X 原生排程送出。0.1.4 快速時段測試版只填欄位，由使用者自己確認。">
</p>

<p align="center">
  <b>Chrome 擴充：在 x.com 頁面上幫你操作 X 原生排程。</b><br>
  不用 API、不發網路請求、不會自己發文。貼文一律由 X 原生排程送出。
</p>

> [!IMPORTANT]
> **目前版本：0.3.0。** 排程日曆會把上次同步的時間與前 20 字存到 x.com 的本機儲存，切頁、重新整理或隔天打開都能看；超過 24 小時會提醒再同步。浮層可依日期分組、查看與前一則相差幾分鐘，也能展開全頁月曆。點日曆項目只在恰好一列相符時開啟 X 原生編輯器，**絕不替你按 Update、Schedule、Delete 或 Post**。快速時段及既有拖曳操作保留。

## 快速時段 0.1.5

可以在發文框旁直接選時段，由擴充開原生排程視窗並填好；也可照舊自己開視窗，再在 Dagaz 浮層選 9:00、20:00 或「下個工作日 9:00」（0.2.2 起拿掉 12:30）。時段以本地時區計算，選下一次至少比現在晚 5 分鐘的時間；只有你點發文框快速時段才會打開原生視窗；還沒有自訂、星期設定或避開已排推文的功能。

偵測依據是遮罩骨架中的內層 dialog、日期／時間兩個 group、label 關聯及六個原生 select 的選項範圍。骨架的 testid 是空值，不猜前綴。日期與時間欄位必須完整且選項可表示目標值，才會整組填入；年份不在 X 的選項中時會明確報錯，完全不填。

填值使用原生 select value setter 與 input/change，按年→月→日→上下午→時→分依序處理；每欄先重查節點並等待重繪，暫時回收時有限重試；全部填完才核對整組。不符時按原日曆值還原並再次等待。被替換的欄位只有在同一對話框／group 內能以唯一 label 關聯辨識，才會繼續操作；否則會提示還原不完整，請自行檢查。日期 input 只讀 min/max，不直接寫入。**欄位讀回相符仍不代表 X 已排程成功，請自行核對。**

「最後一則＋隨機分鐘」使用最近讀 Scheduled 時看到的最後排程時間，間隔預設 10–30 分，可在設定區儲存正整數 A/B（A ≤ B）。無快取會停用；過期結果改用現在＋隨機間隔，仍保留 5 分鐘安全餘量並向上取整分鐘。時段按鈕標出實際日期、今天／明天；下個工作日顯示日期。浮層高度至少約 2/3 視窗，並納入完整快速操作區；舊的小高度會夾回下限，底部把手可調高、重新整理仍保留。首次填值不縮短，縮小視窗時以視窗邊界為上限，內容仍可捲。

成功填值後，擴充只觀察你親按原生「排程」及相符關閉／新成功提示，確認兩次後，把最後時間推到原快取與本次時間中較晚的那個。浮層九語顯示「剛才排的」或「讀自 Scheduled 列表」；下次讀到有效列表時直接覆蓋。取消、改欄位、錯誤或看不準均不更新；這是畫面觀察，不能代替 X 伺服器確認。

## 排程列表與診斷

<p align="center">
  <img src="./assets/readme/probe-overlay.png" width="756" alt="舊版探針的假資料浮層，示範排程則數、時間與文字前段。">
</p>

<p align="center"><sub>舊版測試頁示意，不是真實 X 頁面或帳號；目前介面與版本以程式及下方文件為準。</sub></p>

- **排程日曆**：讀 Scheduled 當下已載入的列表，保存時間與前 20 字，並標最後同步時間。完整同步會移除已發出／刪除的項目；短虛擬視窗則合併保留。選「日曆」看日期分組、排序與分鐘差，選「展開」看可切月份的七欄格子，Esc／關閉鈕可離開。點項目只開啟唯一相符的原生列；找不到會提示，多列相符只高亮。日曆內的「清除本機排程資料」會清除此份快取。
- Scheduled 列表會顯示已讀則數、時間與文字前段。X 採虛擬列表，須自己捲到底；探針不替你捲動。
- Dagaz 快捷鈕與浮層可以分別拖動，位置互相獨立。介面支援九語；時間解析另有繁簡中、英、日、韓及跨年回歸測試。
- 「複製診斷」含版本、命中數、遮罩時間格式與本版的日曆欄位診斷。成功加 fill=ok；失敗逐欄列出目標、讀回及前 3＋最後 1 個安全 option value，不含推文內容、帳號或網址。
- 「複製頁面結構」保留結構並遮罩文字與屬性；0.1.4 保留 select／label 的安全日曆 UI 詞彙 testid，並在 dialog 內 select 行加安全 option value 樣本。只留 1–4 位數字或固定短上下午列舉，其他值與 option 文字仍遮罩。

## 原則：不連線、不代替使用者送出

<p align="center">
  <img src="./assets/readme/how-it-works.svg" width="100%" alt="舊版列表探針流程：讀取畫面上已載入的排程列，在浮層顯示則數、時間與文字前段，不發網路請求。">
</p>

- **不用任何 API**：不呼叫 X 官方 API，也不連我們自己或任何第三方伺服器。
- **零網路請求**：不用 `fetch`、XHR、`sendBeacon`、WebSocket、EventSource。verify 靜態守門與 e2e 都要求擴充資源／背景請求為 0；0.1.1 的外部完整 e2e 曾通過 686 斷言；0.1.4 仍須外部重跑，不能沿用舊結果當成本版驗收。
- **零權限**：manifest 沒有 `permissions` 或 host 權限。content script 只在 `x.com` 和 `twitter.com` 執行。
- **資料留在本機**：既有位置、A/B、最後時間、高度、開關仍由位置模組保存。日曆另用固定 `xsched.probe.calendar`，只含版本、同步時間、完整性標記，以及每則的毫秒時間／前 20 字；壞資料丟棄，最多 2,000 則，JSON 讀入長度有上限。一次性的編輯目標在 `xsched.probe.calendarTarget` sessionStorage，最多有效 2 分鐘，用前移除。不存全文、帳號欄位、網址欄位或診斷，不加 storage 權限。
- **不替你送出**：只在你可信地點快速時段時開原生排程圖示，或點日曆項目時開唯一相符的原生列；兩處都受精確來源摘要守門。其餘 X 按鈕、submit、滑鼠鍵盤事件派送一律禁止，最終更新、排程、刪除與發佈由你決定。

## 載入與實測（≤6 步）

尚未上架 Chrome Web Store。初次使用先下載 repo，在 `chrome://extensions` 開啟開發人員模式，以「載入未封裝項目」選擇 `probe/`；已有 clone 的更新流程如下：

1. 更新 repo；在 `chrome://extensions` 重新載入 `probe/`，確認 0.3.0，再重新整理 x.com。
2. 進 Scheduled，自行捲動列表同步；回首頁打開 Dagaz，核對時間、20 字預覽與最後同步時間。
3. 整頁重新整理，確認資料仍在；超過 24 小時依提示回 Scheduled 同步。
4. 選「日曆」看日期分組／分鐘差，再選「展開」看月曆，切月份並用 Esc／關閉離開。
5. 點兩則不同範例排程，逐一核對 X 開啟正確編輯器；不要按 Update／Schedule／Delete／Post。多列相符時只應高亮。
6. 選日曆內的「清除本機排程資料」，確認重新整理後仍空白。真機問題附診斷給開發者，不把真實資料提交公開 repo。

## 路線

<p align="center">
  <img src="./assets/readme/roadmap.svg" width="100%" alt="舊版路線示意。最新狀態：閘 0 已通過實測，0.1.4 快速時段待驗證，其餘功能見 ROADMAP。">
</p>

**1.0 進度：閘 0 已通過；快速時段可用；0.3.0 新增持久化排程日曆與原生編輯入口，待外部 Chrome e2e／真機驗收。**

- **快速時段**：發文框旁與浮層都可選固定未來時段；擴充只填原生欄位，由你確認。尚未自訂、星期設定或避開已排。
- **排程日曆**：本機持久化、日期分組、全頁月曆、與前一則的分鐘差；點項目只開唯一相符的 X 原生編輯器。
- **自動預排**（規劃中，可開關、預設關）：開啟後按「發文」會改走排程，填入下個空時段。
- **避開已排推文**（規劃中）：用列表探針讀到的 X 排程比對空時段，不只看這台電腦記過什麼。
- **健康檢查**：找不到原生欄位會明確提示，並保留複製診斷與頁面結構的按鈕。

是否上架商店另行決定。

## 已知限制

- 真骨架提供欄位結構；其他介面與重繪仍可能改版。成功觀察用精確且保守的按鈕／提示文案，尚待真機確認。未知提示、欄位被清空或原 dialog 被替換時不更新；請到 Scheduled 重讀校正。opaque value 仍遮罩，只有安全數字與短列舉樣本可見。
- 自動位置找不到完整空位時仍可能收合；手動位置不因障礙縮高度，可能重疊，請拖到空處。極小視窗無法容納全部快速區時，以視窗邊界與捲動為優先。
- 多個設定對話框、label 關聯歧義、上下午文字與順序矛盾，或無法安全映射的選項，都會拒絕填值。React 回收原節點時，整組還原可能不完整。
- 5 分鐘是本版安全餘量，X 實際允許的最小間隔仍未知。自訂、星期設定與避開已排尚未實作。
- 列表要自己捲到底。同一頁編輯或刪除後，累加資料可能保留舊列；重新進入列表會重讀。時間與全文相同的兩則會去重，純圖片／影片列也可能讀不到。
- 日曆只涵蓋已讀的列表，刪除／發出後要再完整同步。尚未載入或無唯一相符列時不會代點或自動捲動，請自行尋找；無法解析的時間不寫入日曆，保留不完整提示。資料屬於同一瀏覽器的 x.com 站點儲存，切換帳號前請清除日曆再同步。

## 開發

```bash
npm ci
npm test          # 列表、快速時段、持久化日曆、原生列唯一匹配、拖曳與還原
npm run verify    # 權限、網路、隱私、精確 storage／點擊邊界、禁止送出
npm run e2e       # Chrome for Testing 載入真 probe/，本機 fixture，零送出斷言
```

`npm run e2e` 需要 Xvfb 與 `CHROME_PATH` 指向 Chrome for Testing。全部只用 fixture，不登入帳號；快速時段 fixture 與測試時鐘皆為 2027 年以後。

0.3.0：本機完整單元測試、verify 與 e2e 語法檢查結果見 [日曆交接](notes/HANDOFF-v1.0-calendar-030.md)。沙箱無法 listen，完整 Chrome e2e 待外部執行，不沿用歷史結果。

0.1.1 的歷史結果：169/169 單元測試、完整 e2e 686 斷言通過。0.1.2 複審前外部完整 e2e 曾通過 911 斷言；複審補修後，npm test 12 檔／細項 199 過，verify 通過（66 洩漏／49 writer 自測，其他守門保留）。沿用 fixture-only CSS，不改網路政策、不豁免 data:；0.1.4 的完整 Chrome e2e 與真頁逐欄驗收仍待外部。0.1.4 當時本機 npm test 13 檔／細項 226 全過，verify OK（37 storage／59 writer，其他守門全保留）；完整 Chrome 結果仍待外部，詳見 0.1.4 HANDOFF。

## 文件

- [`AGENTS.md`](AGENTS.md)：工作規矩與必要測試
- [`docs/plan/ROADMAP.md`](docs/plan/ROADMAP.md)：路線圖與目前進度
- [`notes/GATE0.md`](notes/GATE0.md)：列表讀法、真骨架證據表、原生 writer 與實測步驟
- [`notes/HANDOFF-v1.0-quick-014.md`](notes/HANDOFF-v1.0-quick-014.md)：0.1.4 交接、外部待跑與真機待驗證項目
- 0.1.4 假資料截圖（待外部 e2e 產生）：[`立即填值`](docs/v1.0-quick014-immediate-fill.png)、[`短視窗高度`](docs/v1.0-quick014-height-floor-small.png)、[`觀察關閉`](docs/v1.0-quick014-observed-close.png)、[`列表校正`](docs/v1.0-quick014-list-authoritative.png)
- 舊版範例截圖：[`docs/gate0-en.png`](docs/gate0-en.png)、[`gate0-ja.png`](docs/gate0-ja.png)、[`gate0-zh-Hans.png`](docs/gate0-zh-Hans.png)、[`gate0-zh-Hant.png`](docs/gate0-zh-Hant.png)、[`gate0-ko.png`](docs/gate0-ko.png)、[`gate0-roles-fallback.png`](docs/gate0-roles-fallback.png)、[`gate0-empty.png`](docs/gate0-empty.png)、[`gate0-virtual-before.png`](docs/gate0-virtual-before.png)、[`gate0-virtual-after.png`](docs/gate0-virtual-after.png)
- 標誌：[`docs/xsched-logo-B.svg`](docs/xsched-logo-B.svg)，使用符文 Dagaz，意思是「日子」，整體輪廓像封起來的 X

## 授權

作者：[@punkcan](https://x.com/punkcan)

[MIT](LICENSE)。
