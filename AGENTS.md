# AGENTS.md — 在 xsched 工作的規矩

給任何 coding agent（Cursor、Grok Build CLI、Codex、DeepSeek／CodeWhale…）。不需要聊天紀錄，照這份做。

## 這是什麼

xsched：Chrome 擴充（MV3），改造 x.com 頁面，幫老闆操作 X 原生的排程視窗：快速選時段、自動預排、排程總覽。

## 先讀

1. `docs/plan/ROADMAP.md`：閘 0 → 1.0，目前在哪一步。
2. `docs/plan/cards/开工卡-X预排推文扩展-2026-10-09.md`：**卡就是規格**。
3. `docs/plan/X预排推文-竞品-2026-10-09.md`：競品與空缺。
4. `notes/`：产品开发的筆記與交接（HANDOFF）。

## 誰負責

- **老闆**（Punkcan）：拍板、真帳號測試（只在他自己的 Chrome）。
- **商務拓展**：寫規格／開工卡、驗收、把結果轉給老闆。
- **产品开发**：實作、開 PR、找複審、合併。
- 規格有疑問、要加權限、要花錢：停下來回報商務拓展，不要自己決定。

## 硬規矩（違反就不能合）

1. **不用 X 官方 API，不用任何 API**，不連我們自己或任何第三方伺服器。
2. **不發任何網路請求**：不 `fetch`／XHR／`sendBeacon`／WebSocket／EventSource，不用 CDN。要有 `scripts/verify.mjs` 之類的守門腳本擋掉，它只能加強、不能放寬。
3. **只改造 x.com 頁面、只操作 X 原生的排程視窗**。推文一律靠 X 原生排程發出。
4. **擴充絕不自己定時發文、不在背景發文**。所有操作都由老闆在頁面上的動作觸發（自動預排也只是把「發文」改成走 X 排程，最後仍是 X 排程發出）。
5. **權限最小**：content script 只匹配 `x.com`／`twitter.com`；資料只存本機。要加任何權限或 host 一律停下，老闆批准才做。
6. 診斷只放命中數，**不含推文內容**、帳號、網址。
7. **不在共享機器上登入老闆的 X**（不碰 @decoy_handle，也不碰老闆個人號）。真帳號測試一律由老闆在自己的 Chrome 做；開發用本機模擬頁／fixture。
8. 花費 $0；任何要花錢的（含 Chrome Web Store US$5）先問。
9. 不推 secret；不改別人的分支和檔案（`notes/` 是产品开发的）。
10. **公開 repo**（老闆 2026-10-10 拍板維持公開）：絕不提交 secret、token、真實對話內容、帳號 handle 或老闆的任何真實資料；截圖一律用範例資料。

## 本機位置儲存（閘 0.4／0.5 授權範圍）

只允許 `probe/position.js` 存取 x.com 的 `window.localStorage`，只允許兩個固定 key：`xsched.probe.pos`（鈕）與 `xsched.probe.panelPos`（浮層），值只能是經有限數字驗證的 `{x,y}`。不存本文、帳號、網址或診斷；不加 storage 權限。其他模組的 localStorage，以及所有 sessionStorage／indexedDB／chrome.storage 仍由 verify 禁止；修改位置模組須重審來源摘要與 storage 攻擊自測。

## 怎麼工作

- **分支 + PR**：從最新 `main` 開分支（例如 `gate0/…`、`feat/…`），一件事一個 PR。
- **同一件事同一個 session** 做完，不中途換。任何工具都**不用 Fast 模式**（例如 Grok 4.7 用 high）。
- **複審**：由**不同的 session／模型**審，Opus 5.5 有額度就用，沒有就 Grok 4.7 high（非 Fast）另開 session。PR 說明寫明是誰審的。
- 測試：建好 `package.json` 後至少要有 `npm run verify`（權限與網路請求守門）和 fixture 測試（模擬 X 的 Scheduled 列表與排程視窗）。PR 前全部要過，名字寫進這份文件。
- **本 repo 的測試（PR 前三個都要在最新分支上跑過）**：
  - `npm test`：`node --test` + linkedom，測 `probe/reader.js`（五語系解析、各層備援、去重累加、空列表、非 Scheduled 0 命中、診斷不含內容、時間樣本遮罩、`lang`／`doclang` 過濾、`mounted` 真實狀態）與 `probe/skeleton.js`（屬性遮罩、class 前綴／雜湊、`×N` 收合、shadow、同源／跨源 iframe、截斷）；另測 `probe/ui.js` 九語／位置、真 `content.js` 的快捷鈕開關／SPA 狀態／重掛／固定導覽／版本警告／重複注入。`fixtures/real/*.html` 自動配同名 JSON 跑讀法驗收，空目錄時只跳過這項；目前有老闆遮罩骨架重建繁中／簡中（各1則；繁中格式真機確認、簡中對應，日期與本文為假）及合成跨年 fixture（2則）。另測五語系有／無年份、12 AM/PM、上午／下午12點、24小時制、跨年順序、無效日期、背景 article 不得透過 cell／文字備援混入、統一時間顯示、推定年份更新時重畫與未知列保留。另測週／周／星期與空白變體、星期不符以日期為準、繁簡上午下午1–12點、60vh固定操作區／縮小重掛／安全時間樣本、有界fixed／sticky幾何偵測。閘0.4另測數字位置儲存邊界（含兩個固定key、惡意JSON／getter／儲存例外）、拖動門檻與取消、重新整理與resize夾位但保留原值、九語重設、開關／poll／SPA／modal／重掛不移鈕、浮層多方向及modal排除／其他擴充root fixed節點。`test/position.test.mjs`可不依賴linkedom獨立跑，並執行實際verify静態掃描與21項storage攻擊自測；不能代替完整三測試。閘0.5另測標題列浮層拖動排除按鈕、section capture跨render、雙向獨立錨點／首次展開保存／reload／開關／poll／modal不移位、兩key重設預覽及後續poll仍清空、超視窗浮層clamp／斷線resize與原存值保留；取消／第二pointer／resize／reset／pagehide／dispose／重掛／capture loss不保存拖動。CLI 子程序輸出用暫存檔擷取，保留退出碼及 stderr 斷言。
  - `npm run verify`：`scripts/verify.mjs`，掃 `probe/` 擋網路 API／`innerHTML`／`eval` 等，並檢查 manifest 權限最小（原規則全保留，另擋 namespaced 資源屬性、markup parsing 及非固定 Scheduled 導覽；含會抓違規的 self-test，以及用含網址／uuid／email／handle／內文／長屬性值的攻擊樣本頁驗證 skeleton 與時間遮罩不洩漏；新增日曆词白名單 fmt／samples／骨架短時間節點匯出，完整內文即使像日期仍不得匯出，calendar-shaped URL／email／handle 須整段遮罩；誘餌為 @decoy_handle／decoy@example.invalid，另測含週字樣的日期身份及失敗時間匯出、合併aria不得借用本文日期，39項洩漏自測全保留）。閘0.4／0.5只對根目錄`probe/position.js`且SHA-256完全等於已審來源開放固定key數字儲存；任何修改／改名／其他storage仍失敗，另加21項storage自測（別處／混淆別名、第三個key／錯前綴、非數字、刪驗證、sessionStorage／indexedDB／chrome.storage與網路混入）。
  - `npm run e2e`：`scripts/e2e.mjs`，用 Chrome for Testing 載入真 `probe/`，本機 HTTPS fixture server ＋ `--host-resolver-rules` 把 x.com 指到 127.0.0.1，驗證浮層計數／時間、虛擬化累加、非排程頁 0 命中、選擇器全失效仍掛載並顯示「讀到 0 則」、host 被移除自動重掛、骨架複製與 textarea 備援、擴充無額外網路請求，另驗證 Dagaz 快捷鈕在 Scheduled／首頁的開關、手動狀態跨 SPA／重掛、固定目標的使用者點擊導覽、桌面 1100px 與窄版 390／600px 原生 Post／FAB／Messages-Grok 控制項矩形不重疊且 elementFromPoint 命中、版本不符／runtime invalidated、真 0.0.2 script 接手。產生 `docs/gate0.5-*.png` 與 `docs/gate0.5-skeleton-sample.txt`；舊 `docs/gate0-*.png`、`docs/gate0.1-*.png`、`docs/gate0.2-*.png`、`docs/gate0.3-*.png`、`docs/gate0.4-*.png`／骨架保留不覆寫。前往 Scheduled 使用固定目標 location.assign 按鈕（不寫 href），一般頁面導覽；網路證據只明確接受這一次使用者點擊的頂層導覽，資源／背景請求仍必須 0。另驗證真骨架精簡 fixture 1 則、逐則標準時間／timeFail=0、背景可見也不計數、未知時間仍 1 則且明示失敗、固定假時鐘下跨年 2 則；新增1280×600面板≤60vh、內部捲到底仍能以elementFromPoint命中固定操作鈕並物理複製、縮小再展開／重掛、桌面與短視窗收合DM／紅點圓形div／Grok不重疊、未知時間樣本隱私、繁簡確認格式假日期timeFail=0。沿用情境產生docs/gate0.5-{small-viewport-scroll,collapsed,avoid-native,unparsed-sample,real-skeleton-zh-Hant,real-skeleton-zh-Hans}.png。閘0.4另驗證body／html兩個外掛fixed鈕不重疊且物理可點、無自訂tooltip、pointer拖動不開關、reload保留精確矩形／key只含數字、resize夾位／原值保留、重設清key回自動位置、無modal／有草稿modal開關前後矩形完全相同、host固定於body／html且非dialog子節點；與4491b79比較manifest權限／host／資源／matches不變，保留0擴充資源／背景請求。沿用情境產生docs/gate0.5-{dragged-reload,avoid-extensions,tooltip,reset,modal-closed,modal-open,no-modal-open}.png；原擴大DM情境顯式觸發resize才重算鈕避讓，不再由DOM mutation移鈕。閘0.5另驗證開著浮層拖鈕時浮層整個rect完全不變、拖浮層時鈕整個rect完全不變、雙rect開關／reload不變、兩個key只含數字、超視窗clamp實際header可見可抓、標題列按鈕不take capture且仍物理可點、兩key reset後poll保持清空與雙預設rect復原、manifest與93ed233基準權限相同；新增docs/gate0.5-{panel-dragged,button-dragged,reload-both,clamped,reset-both}.png。擴大DM測試resize後顯式重設兩個位置才重新選面板空位，矩形／命中／物理點擊斷言全保留。需要 Xvfb（`DISPLAY` 空時自動 `xvfb-run`）與 `CHROME_PATH`（預設 `/tmp/cft/.../chrome`）。

## 1.0 第一項「快速選時段」的測試／送出守門

- `npm test`保留閘0全套，另測`probe/quick.js`的未驗證設定select假設、四個本地未來時段／>=5分鐘／跨日月年／閏日／工作日／DST、12／24小時與完整選項預檢。缺少／歧義／disabled／hidden／不可表示的分鐘或年份一律不半填、不發事件；setter失敗回復，沒有原生setter不寫。真content VM另測可信點擊才填、render後欄位移除、九語及純計數診斷；select／option骨架文字只留長度。新排程設定fixture與時鐘均2027年以後，舊列表fixture讀法結果保持不變。
- `npm run verify`追加**不click任何X鈕／不代替使用者送出**：禁止click方法與別名、requestSubmit／submit與別名、Mouse／Pointer／Keyboard／Submit事件及未審dispatchEvent；另擋click／submit解構與反射取方法、onclick／onsubmit別名。只對根目錄`probe/quick.js`的完全一致SHA-256來源，豁免dispatchEvent關鍵字一條；唯一`writeNativeControls`函式只對整組預檢後的原生select派送input／change，其他網路／storage／注入／激活禁令仍全掃。修改此模組須重審來源摘要；33個native writer攻擊自測（原20項全保留），另有真CLI違規退出測試；原30 API／14 icon／9 SVG／21 storage完整保留，39洩漏自測加option身份／日期路徑成41。位置storage仍僅position.js兩個固定數字key，不新增設定儲存。
- `npm run e2e`保留閘0.5全部斷言與0擴充資源／背景請求證據；合成設定dialog有月日年時分AMPM選單、Confirm／Schedule／composer Post及form click／submit計數。按四個快速時段：值與本地計算及獨立跨年期望一致、input/change有觸發、送出click／submit始終0；無欄位／部分欄位／選項無法表示皆完全不改值。測試腳本在main及extension isolated world注入2027年Date時鐘，production無時間override，年份選單從2027開始。比對2cceb5e的manifest權限／host／資源／matches不變。生成`docs/v1.0-quick-{dialog-detected,slot-filled,not-detected,partial-fields,diag}.png`及舊情境的新前綴副本／骨架，既有gate0–0.5截圖不覆寫；需要原Chrome for Testing／Xvfb。

作者連結測試：`npm test` 驗證無參數factory以全域document的DOM API建立浮層anchor、錯誤元素在寫href前拒絕、固定屬性、在既有底部padding絕對定位且不新增固定操作列、骨架／診斷排除；`npm run verify` 以完整SHA-256鎖住根目錄 `probe/ui.js` 的factory與 `probe/content.js` 唯一固定無參數呼叫，僅豁免factory那句精確 `https://x.com/punkcan` href；任何UI／content修改須重審並更新摘要。另全域擋URL組件写入、反射寫入／方法提取及未審動態屬性寫入（原22項作者攻擊保留，新增160項URL改寫／28項factory邊界自測，main的30 API／14 icon／9 SVG／41 leak／21 storage／33 native writer全保留）；`npm run e2e` 另驗證 Scheduled 展開及短視窗捲到底後底部連結的屬性、可見矩形／命中與操作鈕不重疊，從不點作者連結，資源／背景請求仍須0，新增截圖用 `docs/author-link-*.png`。

巢狀解構守門：明確devDependency `esprima@4.0.1`，用tokenizer（非舊版完整parser）在原始JS上配對各層括號，辨識解構賦值／for-of／for-in／函式及catch參數pattern；整個pattern內任何成員存取（含computed、this／super、預設值或computed key裡的成員讀取）及document／createElement都保守拒絕，字串／regex／模板純文字／註解不當成程式目標；tokenization失敗也拒絕。原規則／全部舊自測保留，另增158項解構攻擊及安全對照。`npm test`另在/tmp複製完整probe／scripts／Logo，先確認完整verify CLI退出0，再只在未鎖摘要的reader.js加入pointerover的search／hostname／雙重for-of攻擊，三變體均須以新解構規則退出1，不能用摘要不符或執行錯誤代替守門。正式probe靜態掃描失敗時不執行pure模組／DOM自測並退出1；乾淨來源要執行全部自測才能退出0。

資源屬性守門：`setAttribute`／`setAttributeNS` 與 IDL property 寫入共用一份對照表，完整保留原8項src／href／srcset／action／poster／data／ping／formaction，另禁attributionsrc／background／referrerpolicy／srcdoc及對應camelCase IDL（formAction／attributionSrc／referrerPolicy）。與URL組件共用直接／bracket／跳脫／拼接／複合賦值／for-of／for-in寫入規則，反射及任意深度解構沿用原禁令；另拒絕動態attribute名稱、setAttribute／setAttributeNS的方法提取與call／apply／bind、setAttributeNode與NamedNodeMap setter；只允許固定安全attribute直接呼叫，以及完整摘要鎖住content的既有SVG-key loop。資源網址僅原factory的精確href statement例外。新增514項資源屬性自測與安全讀取／CSS背景對照，所有舊自測數量不變。完整repo CLI保留原3個解構攻擊，再加15個reader.js pointerover資源寫入變體（含直接ping、跳脫／拼接bracket、Reflect.set／Object.assign／defineProperty及巢狀解構），乾淨副本退出0／全自測執行，18個攻擊皆須以具體守門規則退出1，不能靠摘要不符或執行錯誤。

作者連結merge至0.1.1的收斂回歸：保留CSS圖片函式守門與308項自測，不新增靜態規則或攻擊類別；完整repo CLI只追加review-5的image-set pointerover變體，18→19個，必須以reader.js的CSS規則退出1。UI／content摘要同步main 363b3ad合併後的作者連結來源；quick.js只有根目錄檔名與既有SHA完全吻合，才從解構檢查移除原本的 `fields[choices[0]]=select;`（巢狀computed index被誤判），其餘來源與規則照常掃描。沒有把靜態守門降級交給e2e；checkAuthorLink另保留浮層唯一anchor，追加整個shadow root恰1個anchor，精確href／target／noopener與0擴充資源／背景請求政策不變。

## 快速時段0.1.1的真骨架回歸

- `npm test`另測`test/quick-real.test.mjs`：內外dialog／兩group／aria-labelledby唯一label／空testid、四時段、opaque值及文字／數字映射、全域一致零基月份、12 AM/PM／24h／刻度分、上下午文字與順序矛盾拒絕、disabled同值／hidden選項、缺年份／日／分與min/max預檢零寫入。事件後讀回不符整組還原並派送input/change，節點回收／還原拒絕明示不完整；content VM驗證繁中優先於瀏覽器簡中及錯誤跨render保留。新fixture全為假資料、年份2027+；不直接寫日期input。
- `npm run verify`保留原30 API／14 icon／9 SVG／21 storage／41 leak／33 native writer自測；select與label的安全日曆UI詞彙testid新出口增加14身份攻擊，洩漏成55；writer刪讀回／bounds／period驗證、setter替換／body派送／click別名增加6攻擊，native writer成39。仍只對quick.js精確SHA豁免dispatchEvent一條，唯一writer只送select input/change（含整組還原）；不click／不submit禁令與position storage摘要不變。
- `npm run e2e`保留全部舊情境與0網路證據；真骨架精簡合成picker要求schedDialog=1 dateCtl=3 timeCtl=3 selects=6、四時段逐欄／12h換算、兩世界2027假時鐘、缺年份零改／零事件、change handler拒絕目標後所有select原值復原且input/change各12次，所有Confirm／Schedule／Post／calendar click及form submit皆0。date input不直接寫、picker骨架安全匯出、權限與293589f相同。新截圖`docs/v1.0-quickfix-{real-detected,real-filled,year-missing,rollback}.png`及舊情境的新前綴副本；既有截圖不覆寫。原真機骨架禁止提交；新的value格式與React接受仍須老闆確認。
- 0.1.1 的日期輸入框只存在於三份 `quick-real-*` fixture；測試頁用 `::-webkit-calendar-picker-indicator{display:none}` 隱藏 Chrome 內建日曆圖示，避免它在 CDP 產生 data: SVG 請求。保留 date input／min/max 與原生填值、還原及零送出斷言，擴充程式不變；網路政策不豁免 data:，仍要求 0 擴充資源／背景請求。外部 `737d242` 的兩個快速時段情境已過，但完整 e2e 曾在這筆圖示請求上失敗；修改 fixture 後外部重跑完整 e2e 已通過（686 斷言、0 擴充資源請求）。往後仍不能把單一情境通過當成完整 e2e 通過。

## 快速時段 0.1.2 的受控欄位回歸

- `npm test` 保留舊測試，另測 `test/quick-fill.test.mjs`：instance value 寫入被重繪還原、原生 setter＋input/change 才接受、年→月→日→上下午→時→分的事件順序、每欄重查／日 select 替換、同步與 rAF 重繪、1／01／0 起與中文上下午、閏月日數、上下午自動修正及最後事件改回先前欄位。失敗整組還原也重新辨識唯一 label 關聯並等待；缺欄、選項失效或拒絕還原不得宣稱成功。content VM 驗證成功 fill=ok、六欄失敗資訊及複製診斷，不只看事件次數。原同步 fill API 改為 Promise，測試須等待完整讀回與還原。
- `npm run verify` 保留全部舊守門／自測，option 樣本共用 skeleton 的有限數字／固定上下午詞彙遮罩；新增 11 個 value 洩漏攻擊（55→66），新增 7 個非同步 writer 邊界改寫（39→46）。原 30 API／14 icon／9 SVG／21 storage／22 author／160 URL／28 author boundary／158 解構／514 資源／308 CSS 自測數量不減。修改 quick／content 後須重新核對並更新精確 SHA；ui 作者 factory 與 position 模組未改。新日曆欄位診斷只允許計算目標數字、1–4 位 value 數字或固定短上下午列舉；本文、長 ID、網址與身份仍不得匯出。
- `npm run e2e` 新增受控 picker：年月重建日 select、四種 value 變體各填四時段、缺年份零寫入、上下午修正後全組還原、safe option-values 骨架樣本與實體複製六欄診斷。以完整非同步狀態和 readback 判定成功，不能用第六個 change 代替完成。所有 X/calendar/send click 及 form submit 仍 0，網路政策與 0 擴充資源／背景請求斷言不動，權限與 `162a838` 相同。日期 input 繼續只讀 min/max，fixture 隱藏內建日曆圖示；不增加 data: 豁免。截圖改存 `docs/v1.0-quickfill-*.png`，新增 picker／時鐘皆 2027+，舊列表仍是假資料，舊截圖保留。
- `node scripts/build-quick-fixtures.mjs` 可重建八份 `fixtures/quick-real-*.html`；腳本只讀合成設定，不讀老闆骨架。真機截圖、骨架、日期與 option 真值不得放 repo。完整 Chrome e2e 在沙箱外跑，未跑前不能宣稱 0.1.2 已通過真頁驗收。

## READY 的標準（PR 說明裡要有）

1. 做了什麼（閘 0 要附 DOM 依據、讀取方式、改版風險）。
2. 權限、網路請求、花費的確認。
3. 複審模型與 session。
4. 測試結果。
5. **範例資料**截圖（不能是老闆的真實推文或帳號）。
6. **老闆實測步驟 ≤6 步**（閘 0 是 ≤5 步）。
7. 已知限制。

完成後**叫商務拓展**：發一則「STATUS READY：xsched <階段>」，附 PR 連結與上面 1–7。沒有 agent 間訊息管道時，把同樣內容留在 PR 說明，請老闆轉。
