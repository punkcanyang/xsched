# HANDOFF：xsched 作者連結

2026-10-10。分支 `docs/author-link`，基準 main `293589f`（PR #11 快速選時段），probe 0.1.0。寫碼：同一個 Codex session 續作；複審由另一個 Codex session 做，尚未執行。檔案實作完成，外部 e2e／截圖與複審通過前不宣稱 READY。

## 做了什麼

- README 授權段落增加作者 `[@punkcan](https://x.com/punkcan)`，這是老闆明確指定可公開的帳號。
- `probe/ui.js` 增加 `createAuthorLink(doc)`：只用 `createElement('a')`、`setAttribute`、`textContent` 建立普通連結；href 精確為 `https://x.com/punkcan`、target `_blank`、rel `noopener`、文字 `@punkcan`。
- 浮層實際由 `probe/content.js` 組裝，因此此檔只接入 factory，在浮層既有12px底部padding中以10px字／10px行高絕對定位靠右；不加入操作區或header的flex排版，不增加固定區高度；連結在捲動內容之外，縮小時不建立。位置、拖動與避讓模型不改。
- 單元測試覆蓋 DOM 建立（markup setter／插入方法若被用即失敗）、浮層唯一 anchor／屬性、poll／縮小展開／重掛及骨架／診斷排除。移除整個 host 前後骨架相等，確認排除發生在遮罩前。
- e2e 加入 Scheduled 展開及 1280×600 內容捲到底後的連結驗證：唯一 anchor、精確 href、target／rel／文字、固定操作區底部、在浮層和視窗矩形內可見、elementFromPoint 命中、不與操作鈕重疊；另驗證診斷及複製骨架不含作者。從不點作者連結，既有0資源／背景請求斷言與網路政策不變。新增截圖路徑 `docs/author-link-scheduled.png`，本 session 未產生或覆寫截圖。
- AGENTS.md 補作者連結測試說明。

## 白名單精確範圍

只在 scanner 的檔案標籤精確為 `probe/ui.js`，且包含與 verify 中 `AUTHOR_LINK_SOURCE` 逐字一致的完整 factory 時，從「resource attribute」規則的原始／正規化掃描視圖中移除第一個 factory 的唯一固定 href statement。factory 內部是本地 `const link = doc.createElement('a')`，網址必須逐字為 `https://x.com/punkcan`；target、rel、文字也鎖在完整 factory 中。單独 href statement、factory 修改、重複 factory、其他元素／屬性／網址／檔案均不豁免。其餘規則仍掃原始來源與原本正規化來源，沒有通用 URL 或 href 例外。

新增22項作者連結攻擊自測：不同帳號路徑、外域、http、尾斜線／query／fragment、img／src、修改元素建立、其他及巢狀檔案、單獨／重複 statement，以及在合法 factory 後夾帶資源、網路、namespaced 屬性、markup、storage。main的30 API bypass、14 icon、9 SVG、41 leak、21 storage、33 native writer自測全保留。`probe/position.js` 未修改，SHA-256 仍為 `7485935c58ef6e3c1ae2db7417deea44e8224ace44c20b9d699da92e15bee335`。

## 版本與權限

維持main的0.1.0：這是作者標示的小變更，沒有新增資料格式、權限或流程上的升版需求；現有版本一致性測試通過，manifest／package.json／lockfile／版本常數不需變動。manifest 完全未改、沒有新增網路 API 或遠端資源、花費$0。普通 anchor 僅由使用者點擊開啟作者頁，不會主動請求。

## 本 session 驗證

| 命令 | 結果 |
|---|---|
| `npm test` | 退出0，10檔通過／0敗／0跳過 |
| `node --test --test-isolation=none test/`（細項計數） | 重跑退出0，159過／0敗／0跳過 |
| `npm run verify` | 退出0，11 probe檔／4 Logo SVG；30 API／14 icon／9 SVG／41 leak／21 storage／33 native writer／22 author-link自測全過 |
| `npm run e2e` | 依指示未執行：sandbox不能listen，留給外部跑；本輪無Chrome結果及新截圖 |

細項計數首跑有2個CLI子程序ETIMEDOUT；未改測試或timeout，原命令重跑159/159通過（約3.8秒）。標準npm test首跑即10檔全過。

## 修改檔案

`README.md`、`probe/ui.js`、`probe/content.js`、`scripts/verify.mjs`、`scripts/e2e.mjs`、`test/ui.test.mjs`、`test/content.test.mjs`、`test/review.test.mjs`、`AGENTS.md`、`notes/HANDOFF-author-link.md`。

## Rebase衝突解法

以main `293589f`為底，AGENTS.md保留完整1.0測試／送出守門段落後追加作者連結說明；ui exports同時保留QUICK_STRINGS／quickStringsFor與createAuthorLink；e2e保留0.1.0版本斷言和全部快速時段情境，追加作者連結檢查；verify同時保留quick來源摘要、全部native writer規則／33項自測及作者factory白名單／22項自測，兩者分別統計。與293589f比對，main功能沒有刪除；非衝突檔的差異僅作者連結新增，版本一致性測試沿用0.1.0。quick.js／position.js和manifest／package／版本常數均未修改。

## 外部e2e紅燈與底部padding修正

外部回報：main 293589f的e2e 622斷言通過；作者連結分支1acda83連續兩跑卡在 `pointer drag moves button to user anchor`。取消拖動的resize後，鈕rect是 `{x:1040,y:540,width:44,height:44}`，浮層是 `{left:740,top:152,right:1084,bottom:584,width:344,height:432}`，鈕rect完整落在面板內；滑鼠down沒有到快捷鈕，原始拖動斷言因此超時。fixture截圖亦顯示兩rect相交。

原碼確認：作者wrapper的 `flex-basis:100%` 強制在 `.panel-actions` 多排一列，影響固定操作區的實測高度及 `positionUI` 的 `minimum = header.height + actions.height + 40 + 32`。面板size仍是固定60vh；不能把432px直接當成其最小高度。這個情境沿用localStorage的panel錨點，resize保留x/y、重新依障礙物縮高再受minimum下限限制，不會重新執行初次空位選擇。fixture方塊top為592，減8px間距是584，恰好吻合回報的面板bottom；錨點仍為740/152，因此浮層縮高後仍覆蓋位於1040/540的鈕。`panelPlacement` 無空位的處理是隱藏面板，原碼沒有「找不到就覆蓋鈕」的回退。新增作者列介入了原固定區排版／resize計算，與main沒有此列的結果不同；實際Chrome幾何修復仍須外部跑驗證。

修正只讓作者link退出排版：直接把anchor放在section內，用 `position:absolute;right:12px;bottom:1px;font:10px/1` 佔用既有12px底部padding。原操作列的孩子、header、面板尺寸與兩錨點演算法全部沿用main；不新增一列、不擠body、不搬鈕。link的10px行高加1px底距在原padding內，與操作鈕分隔。factory沒有改，因此verify精確白名單與全部自測數量不需修改。版本仍0.1.0，quick.js／position.js／manifest不動。

單元測試增加檢查anchor是section直接子節點且絕對定位、排程頁操作區仍只有原三顆button；poll／縮小展開／重掛／診斷與骨架檢查保留。e2e只調整作者連結的所在區檢查為padding／退出flex排版，唯一性／href／target／noopener／文字／可見矩形／命中／不遮操作鈕／隱私要求全保留。任何既有e2e斷言（包含原失敗拖動、capture／cancel、雙rect不變及0資源／背景請求）未修改或刪除。本次修改5檔：probe/content.js、test/content.test.mjs、scripts/e2e.mjs、AGENTS.md及本HANDOFF；既有外部截圖不改動。

本次npm test退出0，10檔全過（測試細項仍159項）；verify退出0，30 API／14 icon／9 SVG／41 leak／21 storage／33 native writer／22 author-link全過。最新修正e2e由外部執行，尚無通過結果。

## 外部交接與已知限制

作者連結原改動已由外部commit為7527282，本session只解檔案衝突，沒有執行Git寫入指令；未push／開PR，也沒有讀寫另一條開發工作目錄。rebase已由外部完成為1acda83（基於main 293589f）；本次是此commit後的布局修正，Git寫入仍由外部做。請在本分支最新檔案外部跑三測試，取得 `docs/author-link-scheduled.png` 的fixture截圖及0資源／背景请求證據，再交另一個Codex session複審；通過後由外部commit／push。PR附這份交接及外部結果、複審session資訊。

Chrome真實排版、拖動、避讓、固定操作區仍需完整外部e2e確認；單元測試不提供Chrome幾何結果。維持main的0.1.0時，載入修改後仍應重新整理已開啟的X頁，避免舊content script繼續執行。沒有新增作者頁網路白名單，e2e不能點連結。

老闆自己的Chrome驗收（4步）：重新載入擴充並重新整理X；打開Scheduled，確認底部小字連結及原操作鈕；捲動／縮小再展開／分別拖鈕與浮層，確認原操作正常；複製診斷和骨架確認不含作者連結。不回傳真實資料或真帳號截圖。
