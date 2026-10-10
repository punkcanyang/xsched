# 老闆骨架 → 本機 fixture

已收到老闆 0.0.2 遮罩骨架（340748 bytes，4109 節點），原檔在 repo 外，不能整份提交。

- `boss-skeleton.html`：保留骨架 L36–124 的雙層 dialog、選中但文字未知的 tab、L108 button／L117 獨立 span／L122 tweetText；只有 **1 則可見排程列**。背景精簡成一則假 article/time。繁中格式由老闆真機樣本確認；日期與本文全是假資料。例如「將於 2026年11月3日 週二 下午11:19 發送」→ 2026-11-03 23:19 (Tue)。不保存老闆的真日期時間。
- `boss-skeleton-zh-Hans.html`：同一結構的簡中對應變體「将于 2026年11月3日 周二 下午11:19 发送」；日期與本文為假，繁中格式真機確認，簡中文案是需求指定的對應。
- `cross-year.html`：只為時間驗收複製出第二列；原骨架仍是 1 列，不能拿此 fixture 的 2 列聲稱真頁數量。now 固定 2026-12-31 12:00，兩列應為 2026-12-31 23:59、2027-01-01 00:05。
- 轉換：`node scripts/real-skeleton-fixture.mjs /workspace/xsched-shots/boss-skeleton-0.0.2-2026-10-09.txt fixtures/real/boss-skeleton.html`；加 `--cross-year` 並改輸出檔可重建跨年例子，加 `--zh-Hans` 可重建簡中變體。腳本只複製有限 enum／結構，不複製原屬性、id、文字；自動拒絕網址／email／handle／uuid 及非允許屬性。時間／label／本文替代字串都是腳本明寫的假值。

後續收到老闆在自己的 Chrome 用 0.0.4「複製頁面結構」產生的樣本後：

1. 一起記錄「複製診斷」、X 語系、畫面上排程列數、是否已自己捲到底。勿提供真推文／帳號／完整網址。
2. 依骨架縮排重建元素，保留已遮罩屬性名與允許的 enum；`×N` 展開，`#text(N)` 改用長度相近的假字。被遮罩的 id/aria-controls 可用本機假 ID 配對，但要註明這是補造資料。
3. 0.0.2 骨架不含時間原文，不能從 x／長度猜格式；0.0.4 只在已隔離的短時間節點輸出日曆遮罩樣本。需要已確認的時間格式與語系，才建立假日期／本文，所有存入 repo 的日期都必須換成假值。
4. 存 `<case>.html`，頁首註明來源是遮罩骨架重建，非真頁快照；同名 `<case>.json` 必填 `{ "pathname": "/compose/post/unsent/scheduled", "onScheduled": 1, "count": 2 }`（count 改成經確認的預期值）。可另填 `layer` 與 `times`。
5. `npm test` 自動發現所有本目錄 `.html`，比較同名 JSON 預期；缺少預期資料會失敗。空目錄只跳過這項。收到骨架後才另外修 READ_CONFIG 與解析，另做 review。

截斷／closed shadow／跨源 iframe 無內容的骨架不能還原完整 DOM，需記錄限制。不要提交未遮罩真頁或 secret。
