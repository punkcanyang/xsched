# HANDOFF：xsched 閘 0.3（probe 0.0.4：浮層捲動／縮小／避讓＋浮層顯示遮罩時間樣本＋查 0.0.3 解析失敗）

更新：2026-10-10 08:20（UTC+8）。分支 `gate0.3/overlay-scroll-avoid`，基準 main `fdc8096`（0.0.3）。

## 老闆實測 0.0.3（截圖，經商務拓展轉來）

- 浮層：`xsched probe v0.0.3 (manifest 0.0.3)` → 「讀到 1 則」→ 黃字虛擬列表提示 → 藍字「時間未解析」；下方被截斷，看不到「複製診斷」等按鈕。
- 浮層蓋住 X 右下角原生元件（帶紅點 1 的圓形元件，可能是訊息）。
- 先前未驗證的英文時間線索已撤回；以這次老闆確認的繁中格式及 L117–118 節點為準。

## 要做

1. 浮層內部捲動（max-height ≤ 視窗 60%、overflow:auto），操作鈕（複製診斷／複製頁面結構／前往 Scheduled）永遠可見（頂部或底部固定）。
2. 浮層可縮小成只剩快捷鈕。
3. 位置避開 X 右下原生固定元件（訊息抽屜、Grok 等），只用 getBoundingClientRect；快捷鈕本身也不蓋。
4. 浮層直接顯示遮罩時間樣本（同診斷遮罩），「時間未解析」旁可見。
5. 查 0.0.3 為何解析不到：英文 12 小時制排程字樣涵蓋？28 字節點是否抓錯？選法要有依據。
6. 版本 0.0.4。
7. 洩漏測試與 AGENTS.md 的「decoy_handle」「decoy@example.invalid」換成 `@decoy_handle`、`decoy@example.invalid`（商務拓展同意），verify 不變弱。
8. e2e：1280×600 浮層可捲、按鈕可見可點；可縮小；模擬右下原生固定元件不重疊；未解析時浮層顯示遮罩樣本且不含內文；0 網路請求；舊情境不倒退。截圖 `docs/gate0.3-*.png`，複本 `/workspace/xsched-shots/gate0.3/`。

## 工具與 session

- 寫碼：Codex gpt-6.1-sol high（非 Fast），resume `01a1212e-3e31-74f3-ba55-1c3c643723cb`
- 複審：Codex gpt-6.1-sol high，resume `01a12013-6780-77c1-9466-bb1e9f78097f`
- 撞額度：立即停、回報可重試時間，不掛等待腳本。
- Codex 沙箱 `.git` 唯讀、不能 listen：commit／push／e2e 由产品开发在外面做。

## 進度

- [x] 寫碼（最新結果見本檔末節）
- [ ] 外部 npm test／verify／e2e、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main

## 寫碼計畫（同一 Codex session；2026-10-10）

1. 以假的日期重現已確認繁中格式，定位 0.0.3 解析與樣本提取失敗環節；加入週／周／星期的有界日曆詞規則，不改列表選擇器，保留五語及跨年行為。
2. 更新真骨架重建 fixture／轉換腳本，格式標為真機確認、所有日期及本文仍為假；加簡中變體與隱私回歸，升 0.0.4。
3. 分開固定操作區與可捲內容區，整個浮層 ≤60vh，加入縮小鈕；共用手動收合狀態，未解析列顯示認證過的遮罩時間樣本。
4. 改成有界右下幾何取樣與固定／sticky 祖先辨識，排除自己與不可見元件；往上／左避讓，依可用空間縮短浮層，不點擊或修改 X DOM。
5. 更新 e2e：短視窗捲動／固定操作鈕命中、縮小與重掛、DM／Grok／紅點圓鈕避讓、繁簡真格式假日期與安全樣本，全部輸出 gate0.3 圖，保留舊圖與網路證據。
6. 全 repo 移除指定舊誘餌字串，保持 verify 強度；本機實跑 test／verify、記錄 e2e 沙箱錯誤，更新文件與外部續跑指令。git／push／Chrome 實跑由外部做。

最新需求取代上方未驗證的「英文 12 小時」線索：繁中格式與 L117–118 單一時間節點已由老闆確認。公開 repo 文件只記格式／假日期，不記老闆的真日期時間或真畫面。

## 交付進度（2026-10-10；本輪最新）

- [x] 確認0.0.3根因：日期後未加括號的週二不在strict／loose／labelPatterns／unknown sample提取文法；去掉星期即可解析，遮罩能保留原日曆格式。時間span選法正確，不改列表選擇器。公開文件只記假日期例子。
- [x] 繁簡週／周／星期＋空白變體、所有上午下午1–12點與12點邊界；星期不符以日期為準，原五語與跨年測試保留。
- [x] 老闆結構fixture改已確認格式／假日期，新增簡中變體；轉換脚本及三份real fixture隱私掃描通過。原骨架留repo外。
- [x] 整個panel≤60vh，標頭／操作列固定，body獨立可捲；九語縮小鈕與快捷鈕共用狀態，SPA／重掛保留。
- [x] 未解析列顯示同診斷白名單遮罩樣本，只用認證隔離節點，無安全樣本明示；不使用item.time／本文備援。
- [x] 有界點取樣＋fixed／sticky祖先矩形避讓（候選256／style768／點320／深12），補非button紅點圓形；找不到面板空間保留快捷鈕，完全沒空間暫藏自家UI，保留使用者意圖後續重試。
- [x] 0.0.4所有版本同步、指定旧誘餌工作樹0命中，AGENTS硬規則只換指定身份；其餘僅測試說明更新。
- [x] 本地npm test／verify、113細項測試、e2e語法與diff檢查。
- [ ] 外部Chrome e2e／gate0.3假資料截图／0資源背景請求證據。
- [ ] 另一session複審、老闆0.0.4真機逐則時間與布局核對；未READY。

### 改動檔案

- `probe/{reader,content,ui,skeleton}.js`、`probe/manifest.json`；`package.json`／`package-lock.json`。
- `fixtures/en.html`／`home.html` 增加收合DM／非button紅點圓形／Grok；`fixtures/real/README.md`、boss-skeleton HTML／JSON、cross-year HTML，新增boss-skeleton-zh-Hans HTML／JSON。
- `scripts/{real-skeleton-fixture,e2e,verify}.mjs`。
- `test/{calendar,content,reader,review,skeleton,ui}.test.mjs`。
- `AGENTS.md`、`docs/plan/ROADMAP.md`、`notes/GATE0.md`、本HANDOFF；兩份開工卡只替換授權清除的身份誘餌。

### 實跑結果與外部指令

- `npm test`退出0：沙箱reporter **8檔通過／0敗**；`node --test --test-isolation=none test/`：**113過／0敗／0跳過**。
- `npm run verify`退出0：**9 probe檔／4 Logo SVG；30 API bypass／14 icon／9 SVG／37 leak自測**。原網路、HTML注入、權限規則保留，洩漏數由main的32增至37。
- `node --check scripts/e2e.mjs`、`git diff --check`通過；指定旧字串工作樹掃描0命中。
- `npm run e2e`退出1：`fixture server failed: Error: listen EPERM: operation not permitted 127.0.0.1`。Chrome斷言未開始，**本輪0張新增截圖，網路證據待外部**。不能把0.0.3既有323斷言算成本輪0.0.4通過。

外部請在最後工作樹執行：

```sh
npm test
npm run verify
npm run e2e
```

需要細項數字時補 `node --test --test-isolation=none test/`。沿用Chrome for Testing預設與Xvfb，自動重開腳本；本session不安裝、登入或啟用任何外部服務。`.git`唯讀，本session未建立提交；外部工作期間建立 `05242c5` WIP快照（開工568ff16），不含最後收尾文件與getComputedStyle呼叫整理；最後修改須由外部commit／push。本session不改main／開PR／打包zip。

e2e保留舊情境，全部產物改gate0.3前綴，舊gate0／0.1／0.2圖與骨架不覆寫。至少新增：

- `docs/gate0.3-small-viewport-scroll.png`：1280×600，30列假資料body捲到底，固定操作列可命中與物理複製。
- `docs/gate0.3-collapsed.png`：縮成Dagaz，重掛維持，能再展開。
- `docs/gate0.3-avoid-native.png`：panel與快捷鈕避開Post／收合DM／紅點圓形／Grok；桌面與390／600px也跑。
- `docs/gate0.3-unparsed-sample.png`：遮罩時間樣本，無本文／身份／網址。
- `docs/gate0.3-real-skeleton-zh-Hant.png`、`docs/gate0.3-real-skeleton-zh-Hans.png`：确认格式＋假日期11/3，1則／23:19 Tue／timeFail=0。

另外保留虛擬累加、跨年、診斷／版本不符／runtime invalidated、真0.0.2接手與clipboard備援等圖片，新增 `docs/gate0.3-skeleton-sample.txt`。網路機制只接受既有一次可信使用者點擊的固定頂層Scheduled導覽，資源與背景請求仍需0。repo外截图複本由使用者安排。

### 老闆實測與限制

根因、幾何上限、完整 **5步實測**見GATE0「閘0.3」：pull main → reload probe確認0.0.4 → refresh x.com看內部捲動／縮小／右下元件 → Scheduled逐則對照時間 → 截圖浮層（失敗時含樣本）＋複製診斷貼回。真機資料不提交repo。

繁中格式已確認，0.0.4真Chrome驗收仍待跑；簡中只是指定對應變體。取樣有限區域／候選／祖先深度，極小或區域外純div、closed shadow、全頁遮挡與極小視窗可能不可辨識／無位置；已偵測無空間則縮成快捷鈕或暫藏，400ms重試，使用者狀態不丟。時區／無年份順序推年／可見窗口累加與去重限制照舊。無新增權限／網路API／遠端資源／儲存，$0。

## 外部 e2e remount 失敗續修（2026-10-10）

外部已提交並 push `6e9cecf`；回報 test **113/113**、verify **37 leak** 通過，但 e2e 在原第681行「mounted: hidden host reports zero」逾時。此前情境通過不等於整套通過；後續與最終網路證據尚未執行。

根因：`positionUI()` 每次 poll 在可見性檢查前兩次寫 host 的 `display:block !important`，覆蓋測試設定的 `display:none !important`。`mounted` 仍測 host，沒有改成測快捷鈕。最小修正移除這兩處 display 重寫，避讓無空間改用 host `visibility:hidden`；保留矩形供後續避讓重試，空間恢復可自動顯示。`hostMounted()` 除原有連接／兩維尺寸檢查，再檢查 computed display／visibility（無 computed style 的 DOM 測試使用 inline style），因此外部 display 隱藏與避讓暫藏都回報0。

新增兩個真 content 回歸：外部隱藏經多次 poll／完整重畫仍0、恢復後1；無空間暫藏／恢復保持開啟意圖，且不能撤銷外部 display 隱藏。reader 補 hidden／collapse／display-none 即使有矩形仍不可算 mounted。原 e2e 0→1斷言不動，另加 computed display 仍none、診斷 mounted=0 兩項檢查。

已核對失敗點後的 skeleton／textarea／virtual／SPA／mutations／composer chip／lifecycle／home／non-Scheduled／network，以及前面的 gate0.3 幾何情境。固定操作鈕／body 捲動的選擇器與用法仍一致，沒有發現明顯舊幾何假設需修改；原隱私與網路斷言全保留。

本輪實跑：`npm test`退出0（8檔）；細項 `node --test --test-isolation=none test/` **115過／0敗／0跳過**；`npm run verify`退出0（**30 API bypass／14 icon／9 SVG／37 leak**，9 probe檔／4 Logo SVG）；`node --check scripts/e2e.mjs`與`git diff --check`通過。本轮未重跑受 listen 限制的 Chrome e2e，亦未生成／修改截圖；工作樹已有外部失敗途中產生的24張 gate0.3 圖，完整重跑仍待外部。

修改7檔：`probe/content.js`、`probe/reader.js`、`test/content.test.mjs`、`test/reader.test.mjs`、`scripts/e2e.mjs`、`notes/GATE0.md`、本HANDOFF。版本仍0.0.4，不改讀法／權限／verify。外部請在含此次修正的工作樹依序跑 `npm test`、`npm run verify`、`npm run e2e`，全過後提交／push；本沙箱未提交。尚未 READY。

## 外部狀態（产品开发，2026-10-10 09:02 UTC+8）— 卡在 Codex 額度

- 寫碼 `01a1212e` 兩輪完成（`6e9cecf`、`65052dd`）：在 `65052dd` 外部實跑 npm test 115/115、verify OK（37）、e2e OK 453；截圖 `docs/gate0.3-*.png`，複本 `/workspace/xsched-shots/gate0.3/`。
- PR：https://github.com/punkcanyang/xsched/pull/8
- 複審 `01a12013` 第一輪：**VERDICT: APPROVE**，並修了「舊 cell 備援可能把 tweetText 內日期當排程時間」（高）。這批修正 commit 為本 commit 的前一個 WIP。修正後 npm test 117/117、verify OK（38），但 **e2e FAILED**：複審新增的情境 `legacy body schedule phrase cannot become a second row`（scripts/e2e.mjs:531–543）。實際狀態 count=2、times 仍含改寫前的 09:00、timeFail=1 但 samples=none；疑為同 scope 累加快取保留舊列（測試寫法），或 timeFail／samples 不一致（reader bug），未定。
- 複審第二輪撞 Codex 額度：「try again at Oct 14th, 2026 12:50 PM」。**未合併**，main 仍 `fdc8096`（0.0.3）。依指示不掛等待腳本。
- 接回：額度恢復後 `codex exec resume 01a12013-6780-77c1-9466-bb1e9f78097f "$(cat /workspace/bd-punkcan/xsched-gate0.3-review-prompt2.txt)" </dev/null`（提示內容也在本節上方描述），修好 e2e 並給 VERDICT 後外部重跑三測試、`merge --no-ff`。

## 收尾路線改 Grok Build（商務拓展定，2026-10-10 09:04 UTC+8）— 402 停

- 路線：寫碼改 Grok Build CLI（grok 1.0.50）grok-4.7 reasoning high（非 Fast），先分析 e2e 紅燈是測試寫錯還是讀法 bug、再修；複審另開 Grok 4.7 high session；三測試全過＋APPROVE 才 merge。CodeWhale 不准用。
- 09:04 第一次呼叫（`grok -p … -m grok-4.7 --reasoning-effort high --always-approve --output-format json`）即回 **`API error (status 402 Payment Required): Grok Build usage balance exhausted`**，沒有建立可續的 session、沒有讀檔或改檔。依指示立即停、不換工具。分析提示存 `/workspace/bd-punkcan/xsched-gate0.3-grok-write-1.txt`。
- 紅燈結論：**未定**（無工具可分析）。main 仍 `fdc8096`（0.0.3），PR #8 未合。
- **待辦：10/14 12:50（UTC+8）Codex 額度恢復後，要補一次 Codex 複審**（session `01a12013`，提示 `/workspace/bd-punkcan/xsched-gate0.3-review-prompt2.txt`）；若屆時已由 Grok 複審合併，仍要補這次 Codex 複審。

## 同一 Codex 寫碼 session 續作：legacy-body 紅燈分析與測試補強

使用者新指示授權回到原寫碼session；基準HEAD `ef63bd3`（已含複審 `fa87c62`），先在/tmp重現、寫GATE0分析後才改測試。沒有呼叫Grok、外部服務、登入X或付費。

**結論：目前未重現新reader bug；測試前置DOM／實跑版本存在待核對落差。** 只改.when／本文而留下舊aria時，單次reader恰好重現外部回報的count2、09:00、l1=l2=2、timeFail1、samples／fmt none；09:00是合法aria metadata，不是借本文日期。同步改aria後，snapshot僅1則；同scope若virtual，真content仍可累加2則，但此時l1=l2=1。換dialog scope後兩種layout均只剩1則。當前HEAD e2e已含「改兩個metadata＋换dialog」；離線按其步驟只得到1，不能宣稱外部紅燈只是累加，也不能無Chrome證據斷言外部使用了哪份檔案。

timeOk／items是UI累加集合，timeFail是本次掃描格式失敗，非互斥桶；samples只收認證獨立span，en的.when為div不合資格，因此timeFail1但samplesnone符合隱私規則。fmt也不得從legacy本文／item.time取備援。完整行號、命令及输出見GATE0新節「閘 0.3 e2e 紅燈分析」；暫時重現腳本 `/tmp/xsched-gate03-{red,content}-analysis.mjs` 留repo外。

改動5檔：

- `scripts/e2e.mjs`：等初始讀取完成；嚴格驗證两個label確實未知、本文日期仍存在、dialog確實換物件；直接透過既有CDP機制讀擴充isolated world snapshot，要求1則／l1=l2=1／timeOk1／timeFail1、僅11/9第二列、samples／fmt空；再驗證浮層1則與解碼後兩份診斷無本文日期。不放寬原count=1／隱私／網路斷言。
- `test/calendar.test.mjs`：新增同DOM可見／aria標籤分開改寫的reader回歸，確定本文自身可解析卻不能被借作metadata。
- `test/content.test.mjs`：新增真content mutation／非virtual replace／virtual累加／換scope清空回歸，含假身份誘餌；裝置增加observer callback與可替換reader，production沒有hook。
- `notes/GATE0.md`、本HANDOFF：記分析、證據、修正、限制及外部續跑。

實跑 `npm test`退出0（8檔），细項 **119/119、0敗、0跳過**；`npm run verify`退出0（**30 API bypass／14 icon／9 SVG／38 leak**；9 probe檔／4 Logo SVG）；e2e語法及diff檢查通過。保留複審reader／verify修正，production零改動，probe仍0.0.4。未commit／push／修改截圖，Chrome e2e未在本沙箱重跑；目前不能宣稱外部紅燈已消失或最新0網路驗收通過。

外部請確認同一工作樹含本次修改，依序執行：

```sh
npm test
npm run verify
npm run e2e
```

若仍紅，回傳第一個失敗斷言（DOM前置、isolated snapshot或浮層scope重置）與scan結果；不用真頁資料，不跳過情境或改期待值。全過後外部提交／push，另session再複審；尚未READY／未合main，原補複審待辦保留。

## 收尾完成（2026-10-10 09:25 UTC+8）

- 老闆補的是 Codex 額度（Grok Build 仍 402，未使用、無 grok session）。
- 寫碼 `01a1212e`（Codex gpt-6.1-sol high）：紅燈分析＝**測試前置寫錯**（外部紅燈跑的是複審第一輪版本，只改 `.when`／本文，按鈕 aria-label 仍含 09:00，reader 依設計採用）；補強 e2e 與回歸，production reader 未改。
- 複審 `01a12013`（Codex gpt-6.1-sol high）第三輪：紅燈分析成立、新測試未變弱；另修一個高嚴重度讀法漏洞（合併 aria-label「未知時間＋本文」會借本文日期 → 解析前排除相同本文尾段），**VERDICT: APPROVE**。
- 外部實跑：npm test 120/120、verify OK（39 洩漏自測）、e2e OK 476 斷言。
- 「10/14 後補 Codex 複審」：本 PR 已由 Codex 複審 APPROVE，此項**已滿足**，不必再補。
