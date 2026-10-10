# HANDOFF：xsched 閘 0.5（probe 0.0.6：浮層可拖、鈕與浮層位置互相獨立）

更新：2026-10-10 12:40（UTC+8）。分支 `gate0.5/draggable-panel`，基準 main `93ed233`（0.0.5）。

## 老闆回報（0.0.5）

拖 Dagaz 鈕時，浮層會跟著跑。

## 要做

1. 浮層可拖（標題列當把手）；位置另存 localStorage 第二個固定 `xsched` 前綴 key，只存數字、不加權限。verify 只放寬到「集中位置模組允許這兩個固定 key」，其他限制不變。
2. 拖鈕時浮層不動；拖浮層時鈕不動；開關浮層時兩者都不動。
3. 浮層第一次打開且沒存過位置時才放在鈕旁（往有空間方向）；之後一律用存的位置；超出視窗夾回、resize 也夾；拖標題列不誤觸內部按鈕。
4. 「重設位置」兩者都重設。
5. 版本 0.0.6。
6. e2e：拖鈕前後浮層 rect 不變；拖浮層前後鈕 rect 不變；開關前後兩者 rect 不變；reload 後兩者留在各自位置；超出視窗夾回；重設兩者；0 網路請求、權限不變、舊情境不倒退。截圖 `docs/gate0.5-*.png`，複本 `/workspace/xsched-shots/gate0.5/`。

## 規矩

- 公開 repo：不寫老闆真機任何資料（含日期）。
- 寫碼 Codex gpt-6.1-sol high resume `01a1212e-3e31-74f3-ba55-1c3c643723cb`；複審 resume `01a12013-6780-77c1-9466-bb1e9f78097f`。不用 Grok Build／CodeWhale；撞額度即停。

## 進度

- [ ] 寫碼
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main

## 卡在 Codex 額度（2026-10-10 12:43 UTC+8）

- 寫碼 session `01a1212e` resume 一啟動就回「You've hit your usage limit … try again at 2:09 PM」，沒有讀改任何檔。依指示停下、不掛等待腳本。
- 接回：14:09（UTC+8）後 `codex exec resume 01a1212e-3e31-74f3-ba55-1c3c643723cb "$(cat /workspace/bd-punkcan/xsched-gate0.5-write-prompt.txt)" </dev/null`。


## 本輪計畫

先記0.0.5單向錨點根因，保留閘0.4複審的capture取消／active pointer保護／斷線resize／matching host相容性。位置模組只增加固定panelPos有限數字介面；panel初次開啟定點保存，後續只套用自己的位置。標題列拖動排除按鈕，capture放在不重建的section，重設清兩個key並預覽默认位置。補unit／verify攻擊／Chrome精確rect與reload／clamp情境，升0.0.6並更新文件；commit／Chrome外部跑。node_modules本輪已存在。
