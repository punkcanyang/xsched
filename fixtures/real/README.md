# 老闆骨架 → 本機 fixture

目前沒有真頁骨架；本目錄不放猜測的新選擇器。收到老闆在自己的 Chrome 用 0.0.3「複製頁面結構」產生的遮罩骨架後：

1. 一起記錄「複製診斷」、X 語系、畫面上排程列數、是否已自己捲到底。勿提供真推文／帳號／完整網址。
2. 依骨架縮排重建元素，保留已遮罩屬性名與允許的 enum；`×N` 展開，`#text(N)` 改用長度相近的假字。被遮罩的 id/aria-controls 可用本機假 ID 配對，但要註明這是補造資料。
3. 骨架不含時間原文，不能從 x／數字猜格式。需要老闆另提供去內容的時間文案與語系，才建立假日期時間及假本文。
4. 存 `<case>.html`，頁首註明來源是遮罩骨架重建，非真頁快照；同名 `<case>.json` 必填 `{ "pathname": "/compose/post/unsent/scheduled", "onScheduled": 1, "count": 2 }`（count 改成經確認的預期值）。可另填 `layer` 與 `times`。
5. `npm test` 自動發現所有本目錄 `.html`，比較同名 JSON 預期；缺少預期資料會失敗。空目錄只跳過這項。收到骨架後才另外修 READ_CONFIG 與解析，另做 review。

截斷／closed shadow／跨源 iframe 無內容的骨架不能還原完整 DOM，需記錄限制。不要提交未遮罩真頁或 secret。
