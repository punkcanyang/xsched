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

只允許 `probe/position.js` 存取 x.com 的 `window.localStorage`。原兩個固定 key：`xsched.probe.pos`（鈕）與 `xsched.probe.panelPos`（浮層），值只能是經有限數字驗證的 `{x,y}`。0.1.3 明確授權另三個固定 key：`xsched.probe.quickRange` 的正整數 `{a,b}`（a ≤ b）、`xsched.probe.lastScheduled` 的有效毫秒時間 `{time,readAt}`（0.1.4 可另含數字 source：1＝列表、2＝觀察到使用者排程完成；拒絕其他列舉與額外欄位）、`xsched.probe.panelHeight` 的有限正數 `{height}`；每個 schema 拒絕多餘欄位。0.1.5 明確授權第六個固定 key：`xsched.probe.panelOpen`，值只能是 JSON 布林 `true` 或 `false`；整頁載入新編輯框時浮層依此恢復上次開關，沒有值時預設展開。不存本文、帳號、網址或診斷；不加 storage 權限。其他模組的 localStorage，以及所有 sessionStorage／indexedDB／chrome.storage 仍由 verify 禁止；修改位置模組須重審來源摘要與 storage 攻擊自測。

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
- 0.1.2 Codex 複審另測晚到的月份編碼切換、原 raw 仍存在時的日曆值還原，以及 input 後控制項移出原 dialog 時禁止 change。讀回與還原都按當前唯一選項映射核對日曆值，不能只比較 raw token。原 46 項 writer 攻擊保留，追加上述邊界的三項來源改寫攻擊為 49；quick.js 摘要同步，AUTHOR_* 摘要與其他守門不變。

## 快速時段 0.1.3

- 測 `test/quick013.test.mjs`：含頭尾的隨機整數分鐘、過期回退與 5 分鐘餘量、跨年、缺快取、五個固定數字 key、惡意 JSON／getter／storage 例外、九語實際日期與約 2/3 預設高度。真 content VM 另測讀列表快取、跨頁／reload、A/B 驗證、高度把手／取消／resize、鈕與浮層錨點不移動。
- writer 逐欄重查並等待，全部填完才整組核對。暫時缺節點最多六次辨識、input 時回收最多三次寫入；不同 dialog／移出原 scope 不重試。最終讀回與還原仍核對目前 option 的日曆含義，零送出規則不變。
- verify 原 21 storage 攻擊保留，追加三個新 key 的外部使用／非授權 key／錯 schema／數字驗證／快照驗證共 13 項成 34；原 49 writer 攻擊保留且調整為新流程對應保護，追加三項有界重試攻擊成 52。其他所有自測與原靜態禁令不減，唯一 storage 模組和 quick／ui／content 的來源摘要同步。
- e2e 新增 2028 假列表讀取快取、五個時段（無快取第五鈕停用）、隨機間隔與已過快取回退、日期標籤、受控中途修正與暫時節點重建、高度拖曳／reload／窄視窗／固定操作鈕。只有預設高度需求改為約 2/3，原 60vh 斷言相應改成新上限；網路、權限、矩形／命中、送出 click／submit=0 斷言保留。`docs/v1.0-quick013-*.png` 由外部 Chrome e2e 產生；舊截圖保留。

## 快速時段 0.1.4 write-1

- `npm test` 保留舊測試，新增只讀成功觀察：可信使用者親按精確原生排程鈕、原日曆值匹配、相符關閉或新成功提示連續兩次才更新；取消／改值／未知與錯誤提示／舊提示／確認但未排程／失敗／超時都不更新。另測 max 保留、列表較早值覆蓋、九語來源與 reload、數字 source 1/2 及 getter 拒絕；高度至少 2/3 且納入完整快速區、舊高度夾位、立即填值高度不變、標題列拖到底部也不裁切。
- `npm run verify` 原 66 leak／34 storage／52 writer 及全部其他守門保留，追加成 37 storage／59 writer。唯一位置模組只對原 lastScheduled key 增加 optional 數字 source，仍只存數字、拒絕多餘欄位；四份來源摘要同步。被動監聽原生事件不代表授權派送 click／鼠鍵／submit；防送出禁令不變。
- `npm run e2e` 新增打開後立即填值幾何、完整快速區和全部按鈕矩形／命中、成功／取消／錯誤等觀察及 max／列表權威覆蓋。原自動填值情境仍要求所有 X click=0；新觀察情境由 Puppeteer 模擬使用者親點原生鈕，單獨核對每次點擊，擴充發起點擊必須 0，submit=0。fixture／時鐘全合成 2027+，保留 0 擴充資源／背景請求與原網路政策，manifest 除版本外與 4f7a084 相同。截圖用 `docs/v1.0-quick014-*.png`，舊圖保留；本機未跑 Chrome 不得宣稱完整 e2e 通過。

## READY 的標準（PR 說明裡要有）

1. 做了什麼（閘 0 要附 DOM 依據、讀取方式、改版風險）。
2. 權限、網路請求、花費的確認。
3. 複審模型與 session。
4. 測試結果。
5. **範例資料**截圖（不能是老闆的真實推文或帳號）。
6. **老闆實測步驟 ≤6 步**（閘 0 是 ≤5 步）。
7. 已知限制。

完成後**叫商務拓展**：發一則「STATUS READY：xsched <階段>」，附 PR 連結與上面 1–7。沒有 agent 間訊息管道時，把同樣內容留在 PR 說明，請老闆轉。


## 快速時段 0.1.5：唯一原生圖示代點例外

老闆明確授權：只有使用者可信地點發文框旁的快速時段，`probe/composer.js` 集中函式才可點同一發文框的原生 `button[data-testid="scheduleOption"][type="button"][role="button"]`。需唯一且可見的 `tweetTextarea_0`／textbox、SVG、空本文、非 disabled，點前重查；骨架依據為 0.1.1 L517／L601。不要依 class 或「第幾顆」猜。這是開啟欄位，絕非確認／排程／發佈授權；其他所有 X 控制項、submit、鼠鍵事件派送仍禁止。verify 只在根目錄 composer.js 的精確 SHA 下移除唯一 `icon.click();` statement 再掃，其他來源及規則照舊；修改此模組須同步來源摘要並複審。

`npm test` 新增 composer 回歸：九語五顆時段、可信點擊才開、圖示失效／歧義拒絕、受控節點重建、失敗整組還原、連用三次與既有親按成功觀察。新的年份均 2027+。原 writer 59 自測保留，新增 5 個直接相關 composer 來源／接收者／信任／改名攻擊為 64，其他守門數量不變。e2e 只追加本入口的 320px 不重疊、連用三次、僅圖示每次點一次、input/change 與完整讀回、缺圖示／缺視窗／還原、確認／排程／Post／submit=0；原情境除版本期望外不改，網路守衛原樣。

找不到圖示顯示停用提示；未找到新視窗零填值；writer 失敗沿用整組還原及還原不完整提示。只准代點圖示，不能代點關閉：若 X 已打開視窗，錯誤後仍保留原欄位讓使用者自行關閉，不能偷偷按取消或改 X DOM 來關掉。這是「不留半填狀態」的界線。

## 0.2.3：SPA URL 讀取與輪詢競態修正

- 根因：`lastLocation` 只記錄上一次 400ms poll 的 URL。`/home` → DOM 變動並切 Scheduled → MutationObserver 的 60ms tick 先讀取短列表 → 下一次 poll 前 `replaceState` 回 `/home`，poll 見 URL 與舊樣本相同就不再排 tick。`replaceState` 沒有 DOM mutation／popstate，mode 因而長期停在 Scheduled；不是 tick 節流過慢或 Chrome isolated world 必須被 CDP 喚醒。
- 修法：`probe/content.js` 由 tick 記錄實際讀取的 pathname＋search，poll 只比較當前 URL 與這份記錄；start 不把尚未讀取的 URL 當作已讀。原 60ms 節流／400ms poll、重掛、快取與零送出規則保留。不加重試、不拉長等待、不改 fixture 或 e2e 步驟。產品行為只修正快速往返 SPA 時使用舊 report 的問題，既有行為斷言無須修改。
- `npm test` 只新增一個直接相關真 content VM 回歸：`URL polling follows a mutation-driven short Scheduled read between two home polls`。固定先讀完整五則、poll 到首頁、DOM mutation 讀短虛擬窗口（中間不 poll）、再回首頁；舊碼最後是 `scheduled` 而失敗，修正後一次 poll 即為 `other`／0 live rows，五則總覽與不完整提示保留。新增時鐘／資料均 2027+，不新增測試重試。
- 版本為 0.2.3，package／lockfile／manifest／reader／skeleton／README 及 test／e2e 版本期望同步，含 regex 跳脫。`scripts/verify.mjs` 只更新 AUTHOR_CONTENT_SHA256，其他摘要、規則與全部自測數量不變；不增權限、storage、網路請求或花費。
- 本機 `npm test` 16/16 檔、單獨 content VM 58/58、`npm run verify`（1,410 項原自測）與 `git diff --check` 通過。
- 本機 `npm run e2e` 在 fixture server 的 `listen EPERM: operation not permitted 127.0.0.1` 被沙箱擋住，未執行瀏覽器斷言，不能宣稱完整 e2e 已通過；待外部連續完整跑五次。e2e 產物照指示還原／清理 docs，既有截圖不帶入本版。

## 排程總覽 0.2.0

- 只做總覽。老闆在任何 x.com 頁面打開 Dagaz，就能看到上次讀 Scheduled 列表留下的記憶體快取：依時間排序的日期、時分、上下午、跨年與前 20 字摘要，以及最後同步時間。快取是空的時候顯示「去 Scheduled 頁同步一次」的提示，並沿用既有固定 `location.assign` 按鈕。整頁重新整理後快取清空，需再同步。不把本文、帳號或網址寫進 localStorage；不新增 storage key 或權限。
- `npm test` 保留閘 0／快速時段全套，另測 `probe/overview.js` 的排序、12h 上下午、跨年、20 字預覽、九語、空輸入、snapshot 不含 body／key，以及 `probe/overview.js` 通過既有 verify 掃描。真 content VM 另測首頁空快取提示／goto、Scheduled 讀入後 SPA 到首頁仍顯示排序後的總覽、忙碌空列表不清快取、已確認空列表才清空，以及連續三次 empty→sync→SPA 走查。版本號 0.2.0。本環境 Node 22 不能把 `test/` 目錄當測試入口，`package.json` 的 test script 改為 `node --test test/*.mjs`（不斷言放寬）。
- `npm run verify` 不放寬既有斷言與守門。新增 `probe/overview.js` 由原規則全掃，不豁免 click／scroll／storage／dispatchEvent。AUTHOR_CONTENT_SHA256 因 content 接線更新；ui／quick／position／composer 摘要不變。原 30 API／14 icon／9 SVG／66 leak／37 storage／64 writer／22 author／160 URL／28 author boundary／158 解構／514 資源／308 CSS 自測數量不減。
- `npm run e2e` 保留全部舊情境與 0 擴充資源／背景請求；只把版本期望改成 0.2.0。新增總覽情境：空首頁提示＋goto、合成 2027+ 未排序列表的現場讀取、SPA 到 `/home` 後快取仍依時間排序且含 AM/PM／跨年／20 字前綴、診斷不含本文、連續走查 3 次。不點作者連結、不增加第二次 Scheduled 頂層導覽。截圖 `docs/v1.0-overview-*.png`；既有截圖不覆寫。fixture 一律示例資料。

## 0.2.2 小修：拿掉「明天 12:30」快速時段

- 老闆真機回報：「明天 12:30」從來沒有正確設好，要求拿掉。發文框快速列與浮層都不再顯示 12:30；剩 9:00、20:00、下個工作日 9:00 與隨機。
- 根因：**未找到（未確認）**。已查：12 點對應「12＋PM」（不是 0／AM）、分鐘 30 對到選項、上下午 select、四種選項編碼（numeric／padded／zero／period-values）、受控重繪、真結構骨架 fixture，單元與 e2e 全部通過，合成 fixture 重現不出來。沒有真機 12:30 的「複製診斷」就無法判斷 X 那邊在 12 點／30 分做了什麼（例如自動改上下午被讀回檢查還原）。寫入器不改，避免沒有證據的修改影響其他時段。
- 做法：`quick.js` 新增 `VISIBLE_SLOT_IDS`（SLOT_IDS 去掉 lunch）；composer 快速列、composer 點擊白名單、浮層按鈕與標籤都用這份清單。浮層標籤與按鈕同一份清單、同一索引，不會錯位或出現空白按鈕。`nextSlot('lunch')` 仍在，只為保留 12 PM／:30 的回歸測試。
- 遷移：快速時段沒有任何已存設定（storage 只有位置、開合、高度、隨機區間、最後排程時間），按鈕每次依固定清單重畫，所以舊使用者重新載入擴充後自然只剩四顆，沒有空白或壞掉的按鈕；不新增也不刪除 storage key。
- 測試：UI 層原本點 12:30 或數 5 顆的斷言改成點剩下的時段／數 4 顆，斷言強度不變（同樣檢查年月日時分上下午、事件數、零代按）。12:30 的 12 PM／:30 證據改由測試直接呼叫 `XSCHED_QUICK.fillSlotResult(document,'lunch')`（e2e 在擴充 world；單元在 rebuilt picker），原 e2e「12:30 is twelve PM」與受控變體斷言原樣保留。新增：composer 隱藏 12:30 仍填 12／30／PM、浮層只有四顆且每顆標籤對自己的時段。014 完成觀察改用 20:00，「older」先前快取改 21 點，語意不變。
- 限制：隨機時段仍可能落在 12:xx 或 :30。若真機失敗，讀回檢查會整組還原並在診斷列出哪一欄。

## 0.2.1 急修：彈出發文框快速時段＋排程後總覽立即更新

- 根因（合成 fixture 重現）：首頁「為你推薦」彈出的發文 modal，按原生排程圖示後 X 把**同一個** aria-modal dialog 的內容換成排程 picker，編輯框被卸下。0.1.5 的等待迴圈一看到編輯框不在就報「找不到原生排程圖示」，picker 根本沒被填；確認後 X 重建新的編輯框／工具列，快速列的按鈕卻還綁著舊節點，下一次按也會失敗。選擇器本身沒有失效。修法：等待期間編輯框被卸下不算失敗，只看是否出現新 picker；「舊 dialog」只算按下前就已有 select 的 dialog；快速列每次 refresh 更新目前節點，點擊時以 scope／editor／icon 任一相同重新辨識，只點當下的原生圖示（`icon.click();` 仍是唯一代點）；同一 scope 內隱藏的重複圖示不再造成歧義（可見的兩個仍拒絕）。
- 排程成功（沿用 quick.js 既有親按觀察）後，content 把該時間加進記憶體總覽，則數、倒數、列表立即更新，不必進 Scheduled。前 20 字取自使用者親按原生「排程」那一刻的發文框（composer 的被動 capture listener，只讀不點），只留在記憶體、每次觀察只交出一次、超過 10 分鐘作廢；不存本文、不發請求、不代按。未同步過時只顯示這一則並標示「可能不是完整列表」，不偽造最後同步時間；之後讀 Scheduled 仍以列表為準。狀態列在觀察到完成時改為「已觀察到排程完成」（BACKLOG 0.1.4 第 2 項）。
- `npm test` 新增 `test/composer-modal.test.mjs`（modal 換內容仍填值、確認後重建再用第二次、親按確認＋排程被觀察且預覽為前 20 字、不可信點擊／非排程鈕不擷取、重繪後不綁舊節點、隱藏重複圖示）與 content 兩項（已同步總覽立即 +1 且同步時間不變；未同步時單則＋partial）。新 fixture `fixtures/quick-composer-modal.html` 全為假資料。舊斷言除版本號外不改。
- `npm run verify` 規則與自測數量不變；COMPOSER_SOURCE_SHA256、AUTHOR_CONTENT_SHA256 同步。`npm run e2e` 追加 021 區塊：連續 3 次在首頁 modal 與 `/compose/post` 各按一個快速時段、時間真的改變、浮層開關與拖動、模擬使用者確認＋排程後總覽不進 Scheduled 就更新；舊情境除版本期望外不改，0 擴充請求。
- 限制：只有「用快速時段填值後親按排程」會被觀察；完全手動在原生視窗選時間再排程，不會進總覽（需下一版）。真 X 的 modal 行為以合成 fixture 模擬，仍需老闆真機確認。
