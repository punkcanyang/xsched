# HANDOFF：xsched 閘 0.4（probe 0.0.5：快捷鈕可拖動＋避讓其他擴充＋tooltip／浮層方向＋重設位置）

更新：2026-10-10 11:35（UTC+8）。分支 `gate0.4/drag-avoid-extensions`，基準 main `4491b79`（0.0.4）。

## 老闆實測 0.0.4

- 時間解析通過（繁中樣本 → 2026-10-13 23:19 Tue，timeOk=1、timeFail=0），浮層可捲。
- 問題「排得太亂」：Dagaz 快捷鈕與其他擴充浮動鈕（圓角方形斜線圖示鈕、NB 圓鈕）疊在一起，tooltip 也蓋到別的鈕。

## 要做

1. 快捷鈕可拖動、重新整理後留在原位：用 x.com 頁面的 `window.localStorage`（key 以 `xsched` 為前綴、只存位置數字），**不加 storage 權限**；夾在視窗內、resize 重夾；拖動不誤觸點擊。
2. 避讓納入其他擴充注入的 position:fixed 元素（body／documentElement 下非 X 節點），只用 getBoundingClientRect、數量有上限；使用者拖過後以使用者位置為準，不再自動跳。
3. tooltip 不蓋到別的鈕（換方向／縮短／改原生 title）；浮層依快捷鈕位置放合理一側。
4. 浮層加「重設位置」。
5. 版本 0.0.5。
6. e2e：拖動後 reload 留原位；右下兩個其他擴充 fixed 鈕（圓角方形＋圓形）不重疊；tooltip 不蓋別的鈕；重設位置有效；0 網路請求、manifest 權限不變；舊情境不倒退。截圖 `docs/gate0.4-*.png`，複本 `/workspace/xsched-shots/gate0.4/`。

## 工具與 session

- 寫碼：Codex gpt-6.1-sol high（非 Fast），resume `01a1212e-3e31-74f3-ba55-1c3c643723cb`
- 複審：Codex gpt-6.1-sol high，resume `01a12013-6780-77c1-9466-bb1e9f78097f`
- 不用 Grok Build、CodeWhale；撞額度即停、不掛等待腳本。Codex 沙箱 .git 唯讀、不能 listen：commit／e2e 由产品开发在外面做。

## 進度

- [x] 寫碼（完整驗證受環境依賴阻擋，尚未READY）
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main

## 寫碼計畫（同一Codex session）

1. 先以0.0.4原定位函式VM重現開關位移，記程式行號與輸出；掛載點與modal障礙分開判定。
2. 固定快捷鈕錨點與浮層定位分離；只在初始化／拖動結束／重設／resize自動避讓，排除dialog，保留重掛錨點。
3. 集中position模組存x.com固定xsched key的有限數字；verify對模組採精確審核來源白名單，其餘storage禁令保留並新增攻擊自測。
4. pointer拖動門檻／capture／取消、九語重設、原生title；浮層多方向避讓並保留固定操作區與60vh。
5. 升0.0.5，補unit／e2e拖动重載、其他擴充、modal前後位置完全相同及舊情境；文件與外部實跑指令。

環境差異：本輪node_modules不存在；`npm ci --offline --ignore-scripts`退出1 ENOTCACHED（zod），`npm ci --ignore-scripts --cache /tmp/xsched-npm-cache --fetch-retries=0 --fetch-timeout=15000`因registry.npmjs.org的EAI_AGAIN失敗。可用runtime metadata工具沒有environment_status，網路政策檔亦不存在；不嘗試繞過DNS／沙箱。先以無依賴VM完成根因證據，完整linkedom測試需要依賴恢復；不可宣稱未跑的測試通過。


## 本輪實作收尾（0.0.5，外部驗證待跑）

根因已先於production修改寫入GATE0：0.0.4把浮層尺寸併入鈕避讓，開關／poll都回寫host；host本來在body／html，不在dialog。從main4491b79匯出原content／ui到/tmp後VM重跑：同固定障礙open bottom=228px、closed=112px、再open=228px；原全頁modal的子鈕也被當障礙。沒有真機DOM，不能指認老闆畫面哪個障礙決定最終落點。

已完成：

- `probe/content.js`錨點唯一寫入函式，開關／poll／X mutation只移面板；重掛留錨點，初始化／reset／resize自動避讓。6px pointer門檻、capture／取消、drag click抑制、使用者位置優先；固定操作列加九語重設。保留mounted／外部display:none修正。
- `probe/ui.js`44×44快捷鈕與面板分別定位；panel可上下／左右，≤60vh與可用高度，內容獨立捲動。排除所有dialog子樹／全屏wrapper；加body／html外掛wrapper有界候選，原生title無自訂tooltip。
- `probe/position.js`唯一storage邊界：x.com固定`xsched.probe.pos`／有限數字x,y；格式驗證／JSON上限／例外／getter變更再驗證。resize夾可見座標而不覆寫原存值，reset只刪固定key。頁面同origin可讀到位置數字；沒有本文／身份／診斷儲存。
- manifest／package／lock／reader／skeleton／版本測試升0.0.5；manifest只改版本／描述與增加本機position.js載入，無新權限／host／web資源。
- verify原30API／14icon／9SVG／39洩漏攻擊全保留；新增唯一root位置模組的精確SHA-256白名單、storage方法名別名阻擋、18項storage自測。模組任何修改須重審摘要，其他storage仍禁止。
- unit加數字邊界／攻擊、panel方向、拖動reload／clamp／reset、錨點不受poll／SPA／modal／remount影響；e2e新增`fixtures/extensions.html`、物理拖動／刷新／精確矩形、body+html外掛鈕點擊／非重疊、數字key／resize原值、reset、native title、modal前後精確矩形與基準4491b79權限比較。舊expanded DM情境改為显式resize觸發位置重算，原非重疊／命中斷言保留。

## 實跑結果（本session）

| 命令 | 結果 |
|---|---|
| `node /tmp/xsched-gate04-position-vm.mjs`（固定4491b79來源） | 退出0，open228／closed112／open228、modal子鈕障礙輸出如GATE0 |
| `node --test --test-isolation=none test/position.test.mjs` | 退出0，**5過／0敗／0跳過**；真verify靜態probe掃描0錯、**18項storage自測**通過 |
| `node --check`（probe／scripts／test全部JS）＋`git diff --check` | 退出0，語法與空白檢查通過 |
| manifest離線對照4491b79 | permissions／host_permissions／web_accessible_resources／matches完全相同；package／lock／manifest皆0.0.5 |
| `npm test` | 退出1；按檔彙總**9檔、1過／8敗**，8檔均因`ERR_MODULE_NOT_FOUND: linkedom`在載入時失敗，非完整120+細項結果 |
| `npm run verify` | 退出1，`ERR_MODULE_NOT_FOUND: linkedom`，沒有完整自測通過數，不能沿用0.0.4的39洩漏通過證據 |
| `npm run e2e` | 退出1，`ERR_MODULE_NOT_FOUND: puppeteer-core`，未啟動Chrome／server，**0個Chrome斷言／0新截圖**；既有listen限制仍需外部跑 |

完整日誌只留/tmp，不提交：xsched-gate04-{npm-test,verify,e2e}.log。npm ci線上／離線錯誤見前節；已請求可讀離線依賴路徑，當前尚無依賴可恢復。不能把無依賴靜態檢查稱完整verify，不能宣稱READY。

## 修改檔案與外部工作樹

以開工f140740對照：AGENTS.md、docs/plan/ROADMAP.md、notes/GATE0.md、本HANDOFF；package.json／package-lock.json；probe/{content,ui,position,reader,skeleton}.js／manifest.json；scripts/{e2e,verify}.mjs；test/{content,position,reader,review,skeleton,ui}.test.mjs；新增fixtures/extensions.html。reader／skeleton只升版本，讀法不改。

外部在寫碼期間已建立WIP `16f6228`、`ec3c9f3`（非本sessioncommit）；收尾觀察HEAD為ec3c9f3，最新GATE0／HANDOFF仍有未提交文件差異。不要只測WIP commit而漏掉收尾工作樹。請外部執行：

```sh
cd /workspace/xsched
npm ci
npm test
npm run verify
npm run e2e
```

若Chrome路徑不同，先設定CHROME_PATH；DISPLAY空時腳本使用xvfb-run。若有失敗，回傳第一個失敗斷言／錯誤及diag，不放寬斷言。通過後提交最新工作樹與新假資料截圖，再交指定另一session複審；本session不commit／push／改main／PR／zip。

至少需外部產生並檢查：docs/gate0.4-{dragged-reload,avoid-extensions,tooltip,reset,modal-closed,modal-open,no-modal-open}.png；沿用全部舊情境的截圖改gate0.4前綴，不覆寫舊gate0／0.1／0.2／0.3及骨架。最新0網路資源證據須由e2e完成，僅允許既有一次使用者點擊的Scheduled頂層導覽。

老闆實測≤5步與已知限制見GATE0「閘0.4」：初始化後新增外掛不搬鈕、手動位置優先、有界候選可能漏元件、太小／太密空間可能收面板、title由Chrome處理方向、storage被禁用不刷新保存。老闆自己Chrome驗證另一擴充組合／開草稿不跳仍待實测。
