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

- [x] 寫碼（0.0.6；待外部e2e與獨立複審）
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main

## 卡在 Codex 額度（2026-10-10 12:43 UTC+8，歷史記錄；本輪已恢復續作）

- 寫碼 session `01a1212e` resume 一啟動就回「You've hit your usage limit … try again at 2:09 PM」，沒有讀改任何檔。依指示停下、不掛等待腳本。
- 接回：14:09（UTC+8）後 `codex exec resume 01a1212e-3e31-74f3-ba55-1c3c643723cb "$(cat /workspace/bd-punkcan/xsched-gate0.5-write-prompt.txt)" </dev/null`。


## 本輪計畫

先記0.0.5單向錨點根因，保留閘0.4複審的capture取消／active pointer保護／斷線resize／matching host相容性。位置模組只增加固定panelPos有限數字介面；panel初次開啟定點保存，後續只套用自己的位置。標題列拖動排除按鈕，capture放在不重建的section，重設清兩個key並預覽默认位置。補unit／verify攻擊／Chrome精確rect與reload／clamp情境，升0.0.6並更新文件；commit／Chrome外部跑。node_modules本輪已存在。


## 本輪收尾

先讀AGENTS／HANDOFF／GATE0閘0.4與複審，保留capture取消／active pointer拒絕覆蓋、host斷線resize、matching host UI相容性、x.com-only storage與公開資料衛生修正。根因是0.0.5 pointermove／up、poll都用鈕的新錨點重算panel，面板沒有自己的位置；假幾何VM結果與原碼行號已先寫GATE0，沒有記任何老闆真日期／樣本。

已實作獨立panelAnchor與header拖動、6px門檻、排除所有按鈕／輸入、stable section pointer capture跨render、取消／重入／第二pointer保護。拖鈕不移panel；拖panel不移鈕；開關／poll／modal／mutation／重掛套用各自位置。首次成功展開以既有多方向邏輯放鈕旁，使用≤60vh固定高度並保存panel key；內容可捲、header／操作鈕固定。resize只夾可見位置、保留兩個原存值；初次／reload／resize可縮短固定x,y的面板以避障，沒有足夠避讓空間時以存的位置優先並保留header／操作區。極小視窗不夠操作區則暫收面板。

重設取消兩種drag、清兩key、鈕回自動避讓、panel在鈕旁預覽；poll不補寫。下一次明確開panel或完成拖動才保存預覽點。首次保存模式確保一般reload不跟鈕重算，reset後立即reload會以空key算預設。

位置模組只增加第二固定key `xsched.probe.panelPos`，舊key仍`xsched.probe.pos`；對外固定button／panel介面，各只寫有限數字x,y。兩常數內部guard／JSON128／多鍵拒絕／getter再驗證／throw／x.com hostname均保留；無第三key、本文、帳號、網址、診斷或新權限。verify新SHA-256精確審核邊界，storage自測18→21（原18保留）；其他網路／注入／權限及39洩漏自測不改。reader／skeleton只升0.0.6，不改讀法。

## 實跑結果（本session）

| 命令 | 結果 |
|---|---|
| `npm test` | 退出0，**9檔全過** |
| `node --test --test-isolation=none test/` | 退出0，**138過／0敗／0跳過** |
| `npm run verify` | 退出0，10 probe檔／4 Logo SVG；**30 API／14 icon／9 SVG／39 leak／21 storage自測** |
| `node --check`（probe／scripts／test全部JS）／`git diff --check` | 退出0 |
| manifest與93ed233離線比對 | permissions／host／optional／web resources／externally_connectable／matches完全相同 |
| `npm run e2e` | 退出1：`fixture server failed: Error: listen EPERM: operation not permitted 127.0.0.1`，**0個Chrome斷言／0新截圖** |

本輪node_modules存在，沒有再遇到依賴缺失。e2e日誌只留/tmp/xsched-gate05-e2e.log，不提交。不能沿用main的0.0.5外部數字宣稱本輪Chrome通過。

## 修改20檔

- probe/content.js／ui.js／position.js：獨立錨點與drag、viewport clamp、兩固定key。
- probe/manifest.json／reader.js／skeleton.js、package.json／package-lock.json：版本0.0.6、manifest本機位置描述；reader／skeleton只改常數。
- scripts/verify.mjs／e2e.mjs：兩key審核來源與21項storage攻擊、新舊Chrome情境、gate0.5截圖／骨架與93ed233權限基準。
- test/content.test.mjs／position.test.mjs／reader.test.mjs／review.test.mjs／skeleton.test.mjs／ui.test.mjs：雙key、獨立位置／拖動／capture／clamp／reset與版本回歸；舊reader／洩漏fixture結果保留。
- AGENTS.md、docs/plan/ROADMAP.md、notes/GATE0.md、本HANDOFF：測試／storage模型、根因、5步實測、結果與限制。

## 外部收尾

在含全部收尾差異的最新工作樹跑：

```sh
cd /workspace/xsched
npm test
npm run verify
npm run e2e
```

Chrome for Testing／Xvfb與CHROME_PATH同前；若路徑不同先設定CHROME_PATH。需要細項數字可另跑`node --test --test-isolation=none test/`。失敗時回傳第一個斷言／錯誤與diag，不能放寬斷言。通過後外部commit／push及另session複審；本session未commit／push／PR／改main或打包zip。外部工作中已建立WIP b041b64；收尾觀察AGENTS與本HANDOFF仍有最後文件差異，請一起提交。

新e2e必須證明雙向拖動互不影響整個rect、header按鈕不capture且照常有效、開關／modal／poll／reload雙rect精確保留、两个key數字值、超窗時實際header可見且elementFromPoint命中、reset兩key清空後poll不補寫並回雙預設。舊expanded DM在resize後顯式reset重新選初始panel空位，非重疊／命中／物理點擊斷言全保留；網路仍0擴充資源／背景請求，僅既有一次使用者點擊的固定Scheduled導覽。

外部至少產生docs/gate0.5-{panel-dragged,button-dragged,reload-both,clamped,reset-both}.png；沿用情境也產生gate0.5前綴與gate0.5-skeleton-sample.txt。舊gate0／0.1／0.2／0.3／0.4截圖與骨架不覆寫。只能fixture假資料，不能真帳號畫面。

已知限制與老闆≤5步實測見GATE0「閘0.5」：存的位置優先可覆蓋其他元件、有界避讓／closed shadow限制、極小視窗可能暫收panel、同origin能改數字key、storage被禁刷新不保存、reset預覽延後保存。Chrome真幾何／指標事件及老闆自己環境仍待外部驗收，尚未READY。

## 收尾（产品开发，2026-10-10 14:45 UTC+8）

- 14:13 額度恢復後寫碼 `01a1212e` 完成；複審 `01a12013` **VERDICT: APPROVE**（無阻擋，只補 GATE0 複審節）。
- 外部實跑：npm test 138/138、verify OK（39 洩漏＋21 storage 自測）、e2e OK 548 斷言。
- PR：https://github.com/punkcanyang/xsched/pull/10 ；merge --no-ff 到 main。
