<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="xsched：在 X 網頁上排程發文，查看已排內容。不用 API，貼文由 X 原生排程送出。0.1.1 快速時段測試版只填欄位，由使用者自己確認。">
</p>

<p align="center">
  <b>Chrome 擴充：在 x.com 頁面上幫你操作 X 原生排程。</b><br>
  不用 API、不發網路請求、不會自己發文。貼文一律由 X 原生排程送出。
</p>

> [!IMPORTANT]
> **目前版本：0.1.1，快速時段測試版。** 閘 0 列表讀取已通過老闆實測；快速時段依真頁遮罩骨架修正，仍待真頁逐欄驗證。擴充只填原生欄位，**不會替你按確認、排程或發佈**。完整 e2e 已在 fixture 修正後通過（686 斷言）。

## 快速時段 0.1.1

先自己打開 X 原生排程對話框，再在 Dagaz 浮層選 9:00、12:30、20:00 或「下個工作日 9:00」。時段以本地時區計算，選下一次至少比現在晚 5 分鐘的時間；不會自動打開 X 對話框，也還沒有自訂、星期設定或避開已排推文的功能。

偵測依據是遮罩骨架中的內層 dialog、日期／時間兩個 group、label 關聯及六個原生 select 的選項範圍。骨架的 testid 是空值，不猜前綴。日期與時間欄位必須完整且選項可表示目標值，才會整組填入；年份不在 X 的選項中時會明確報錯，完全不填。

填值使用原生 select value setter 與 input/change 事件，完成後逐欄讀回；任何不符就整組還原。若節點被回收或還原遭拒，會提示還原不完整，請自行檢查。日期 input 只讀 min/max，不直接寫入。**option 真值格式及 React 是否接受，仍需老闆實測確認。**

## 排程列表與診斷

<p align="center">
  <img src="./assets/readme/probe-overlay.png" width="756" alt="舊版探針的假資料浮層，示範排程則數、時間與文字前段。">
</p>

<p align="center"><sub>舊版測試頁示意，不是真實 X 頁面或帳號；目前介面與版本以程式及下方文件為準。</sub></p>

- Scheduled 列表會顯示已讀則數、時間與文字前段。X 採虛擬列表，須自己捲到底；探針不替你捲動。
- Dagaz 快捷鈕與浮層可以分別拖動，位置互相獨立。介面支援九語；時間解析另有繁簡中、英、日、韓及跨年回歸測試。
- 「複製診斷」只含版本、命中數與遮罩時間格式，不含推文內容、帳號或網址。
- 「複製頁面結構」保留結構並遮罩文字與屬性；0.1.1 僅讓 select／label 的安全日曆 UI 詞彙 testid 可見，疑似個資仍遮罩，option 文字與 value 也不匯出。

## 原則：不連線、不代替使用者送出

<p align="center">
  <img src="./assets/readme/how-it-works.svg" width="100%" alt="舊版列表探針流程：讀取畫面上已載入的排程列，在浮層顯示則數、時間與文字前段，不發網路請求。">
</p>

- **不用任何 API**：不呼叫 X 官方 API，也不連我們自己或任何第三方伺服器。
- **零網路請求**：不用 `fetch`、XHR、`sendBeacon`、WebSocket、EventSource。verify 靜態守門與 e2e 都要求擴充資源／背景請求為 0；0.1.1 完整 e2e 686 斷言通過，擴充資源／背景請求為 0。
- **零權限**：manifest 沒有 `permissions` 或 host 權限。content script 只在 `x.com` 和 `twitter.com` 執行。
- **只存兩個位置**：只有位置模組可用 x.com 的 localStorage，固定 key 為 `xsched.probe.pos` 與 `xsched.probe.panelPos`，只存有限數字 `{x,y}`。不存本文、帳號、網址或診斷，不加 storage 權限；讀到的列表只留在當前頁面記憶體。
- **不替你送出**：快速時段只填原生欄位，不 click X 的按鈕、不 submit、不派送滑鼠鍵盤事件。最終是否排程由你決定，貼文仍由 X 原生排程發出。

## 載入與實測（≤5 步）

尚未上架 Chrome Web Store。初次使用先下載 repo，在 `chrome://extensions` 開啟開發人員模式，以「載入未封裝項目」選擇 `probe/`；已有 clone 的更新流程如下：

1. 更新 repo 至本版 commit；PR 合併後，可在 main 執行 `git pull --ff-only origin main`。
2. 在 `chrome://extensions` 重新載入 `probe/`，確認 0.1.1；回到 x.com 重新整理頁面。
3. 自己打開 X 原生排程對話框，點 Dagaz 浮層的一個快速時段。
4. 逐欄核對月／日／年／時／分／上午下午，**不要按排程**。若必須送出測試，先手動選 2027 年以後，測完到 Scheduled 刪掉。
5. 按「複製頁面結構」與「複製診斷」貼回。真機資料不提交公開 repo。

## 路線

<p align="center">
  <img src="./assets/readme/roadmap.svg" width="100%" alt="舊版路線示意。最新狀態：閘 0 已通過實測，0.1.1 快速時段待驗證，其餘功能見 ROADMAP。">
</p>

**1.0 進度：閘 0 已通過；快速時段 0.1.1 待驗證，其餘項目仍在規劃中。**

- **快速時段**：本版提供四個固定未來時段，先手動開 X 對話框，按鈕只填欄位。與原開工卡不同，本版不自動開視窗、不自訂時段／星期，也不計算「避開已排」的空時段；這些留待後續。
- **自動預排**（規劃中，可開關、預設關）：開啟後按「發文」會改走排程，填入下個空時段。
- **避開已排推文**（規劃中）：用列表探針讀到的 X 排程比對空時段，不只看這台電腦記過什麼。
- **排程總覽**（規劃中）：以周視圖或列表查看時間與文字前段，連回 X 原生列表；細節見 ROADMAP。
- **健康檢查**：找不到原生欄位會明確提示，並保留複製診斷與頁面結構的按鈕。

是否上架商店另行決定。

## 已知限制

- 真骨架已證明欄位結構，尚未證明 option value 編碼、label 實際詞、React 是否接受或是否同步日期 input。需要再貼 0.1.1 骨架與診斷，並逐欄核對；新版不能還原原本空的 testid，option 值也仍遮罩。
- 多個設定對話框、label 關聯歧義、上下午文字與順序矛盾，或無法安全映射的選項，都會拒絕填值。React 回收原節點時，整組還原可能不完整。
- 5 分鐘是本版安全餘量，X 實際允許的最小間隔仍未知。自訂、星期設定與避開已排尚未實作。
- 列表要自己捲到底。同一頁編輯或刪除後，累加資料可能保留舊列；重新進入列表會重讀。時間與全文相同的兩則會去重，純圖片／影片列也可能讀不到。

## 開發

```bash
npm ci
npm test          # 列表、位置、骨架、四時段、真結構、預檢與整組還原
npm run verify    # 權限、網路、隱私、storage 與不 click／submit 守門
npm run e2e       # Chrome for Testing 載入真 probe/，本機 fixture，零送出斷言
```

`npm run e2e` 需要 Xvfb 與 `CHROME_PATH` 指向 Chrome for Testing。全部只用 fixture，不登入帳號；快速時段 fixture 與測試時鐘皆為 2027 年以後。

0.1.1 單元測試 169/169、verify 通過（55 洩漏、39 native writer 自測，既有守門保留）。外部 `737d242` 的兩個快速時段 e2e 情境已過，完整 e2e 在 Chrome 內建日期圖示的 data: SVG 請求上失敗。本次只在三份 fixture 隱藏日曆指示器，不修改擴充或網路政策，也不豁免 data:。修正後完整 e2e 686 斷言通過。

## 文件

- [`AGENTS.md`](AGENTS.md)：工作規矩與必要測試
- [`docs/plan/ROADMAP.md`](docs/plan/ROADMAP.md)：路線圖與目前進度
- [`notes/GATE0.md`](notes/GATE0.md)：列表讀法、真骨架證據表、原生 writer 與實測步驟
- [`notes/HANDOFF-v1.0-quick-fix.md`](notes/HANDOFF-v1.0-quick-fix.md)：0.1.1 交接、外部待跑與真機待驗證項目
- 0.1.1 假資料截圖（由外部 e2e 產生）：[`real-detected`](docs/v1.0-quickfix-real-detected.png)、[`real-filled`](docs/v1.0-quickfix-real-filled.png)、[`year-missing`](docs/v1.0-quickfix-year-missing.png)、[`rollback`](docs/v1.0-quickfix-rollback.png)
- 舊版範例截圖：[`docs/gate0-en.png`](docs/gate0-en.png)、[`gate0-ja.png`](docs/gate0-ja.png)、[`gate0-zh-Hans.png`](docs/gate0-zh-Hans.png)、[`gate0-zh-Hant.png`](docs/gate0-zh-Hant.png)、[`gate0-ko.png`](docs/gate0-ko.png)、[`gate0-roles-fallback.png`](docs/gate0-roles-fallback.png)、[`gate0-empty.png`](docs/gate0-empty.png)、[`gate0-virtual-before.png`](docs/gate0-virtual-before.png)、[`gate0-virtual-after.png`](docs/gate0-virtual-after.png)
- 標誌：[`docs/xsched-logo-B.svg`](docs/xsched-logo-B.svg)，使用符文 Dagaz，意思是「日子」，整體輪廓像封起來的 X

## 授權

作者：[@punkcan](https://x.com/punkcan)

[MIT](LICENSE)。
