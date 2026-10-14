# 0.1.5 浮層不受控制 — 重現

基準 `6ed82e4`（0.1.5）。重現腳本 `scripts/repro-panel.mjs`：puppeteer-core、`CHROME_PATH` 的 Chrome for Testing、載入 `probe/`、fixtures 的假 `x.com`。滑鼠只用 `page.mouse` down/move/up。非 Scheduled 的 `/compose/post`，狀態一直是 `Schedule fields not detected`。

發文視窗不是把 `role=dialog` 本身設成 fixed（那種框會被障礙收集排除，拖完停得住）。真機結構是外層 `position:fixed` 殼（720×640，小於視窗 85%）包住內層 `role=dialog`。殼沒有 dialog role，`closest('[role=dialog]')` 排除不到它。

## 現象

三輪都拖標題列。拖的過程浮層跟到目標，pointer capture 正常（`pointerdown` → `gotpointercapture` → `pointerup` 時仍握著 capture → `lostpointercapture` 是放開後的 release）。放開後：

| 輪 | 放下目標 | 拖動中 | `xsched.probe.panelPos` | 放開後畫面 |
| --- | --- | --- | --- | --- |
| 1 | 84,64（壓在發文殼上） | 84,64 | `{"x":84,"y":64}` | 跳回 920,106（拖之前的位置） |
| 2 | 860,48（不壓到殼） | 860,48 | `{"x":860,"y":48}` | 停在 860,48 |
| 3 | 156,112（壓在殼上） | 156,112 | `{"x":156,"y":112}` | 跳到 778,120 |

放開後再移動游標，浮層不再跟著走。Dagaz 鈕拖到浮層上不會帶走浮層。開關、排程視窗開關、`panelOpen`、SPA 切頁都正常。整頁重載後畫面仍不是存下來的放下點：第 1 輪從 920,106 再變成 778,120，儲存仍是 `{"x":84,"y":64}`。

## 根因

不是 `avoidPicker`，也不是 pointer capture 把拖動取消。狀態未偵測到排程欄位時，不會做選擇器避讓。capture 在 `pointerup` 之前沒有 `pointercancel` / `lostpointercapture`。

`pointerup` 先 `persistPanel()` 寫下放下點，再設 `panelNeedsLayout` 並呼叫 `positionUI()`。殼被 `collectObstacles` 收成障礙，面板頂部低於殼的上緣，可用高度變成負的，低於 `scrollMinimum`。這個分支呼叫 `panelPlacement`，把 `panelAnchor` 改回按鈕旁的自動位置。儲存的放下點沒被改掉，所以看起來是「卡住再跳回原位」；重載時 `panelNeedsLayout` 又是 true，同一段再把畫面從儲存點拉走。

## 修復（0.1.6）

已存的浮層座標不再交給這段避讓改寫。切片放不下時維持放下的位置與原本高度。還沒有儲存點的第一次自動擺放仍可改位置，改完才寫入。既有抽屜縮高（切片仍放得下）與就緒排程選擇器的 38px 暫時閃避不動。

另外：快速時段只掛在發新帖編輯框。回覆 modal、帶父貼文的回覆格、引用框（`quoteTweet`），以及貼文頁 `/*/status/:id` 上不在 dialog 裡的回覆框，都不掛。
