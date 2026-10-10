# HANDOFF：xsched 作者連結

2026-10-10。分支 `docs/author-link`，基準 main `293589f`（PR #11 快速選時段），本輪起點 HEAD `eb945f7`／PR #12，probe 0.1.0。寫碼：同一個 Codex session 續作；另一個 Codex session 複審 REQUEST_CHANGES，本輪修正 P1 ping及資源IDL property寫入繞過。最新外部 e2e 與複審通過前不宣稱 READY。

## 做了什麼

- README 授權段落增加作者 `[@punkcan](https://x.com/punkcan)`，這是老闆明確指定可公開的帳號。
- `probe/ui.js` 的 `createAuthorLink()` 不接受document參數，使用全域 `document.createElement('a')`，確認tagName為A才寫href；只用DOM API建立普通連結，href 精確為 `https://x.com/punkcan`、target `_blank`、rel `noopener`、文字 `@punkcan`。
- 浮層實際由 `probe/content.js` 組裝，因此此檔只接入 factory，在浮層既有12px底部padding中以10px字／10px行高絕對定位靠右；不加入操作區或header的flex排版，不增加固定區高度；連結在捲動內容之外，縮小時不建立。位置、拖動與避讓模型不改。
- 單元測試覆蓋 DOM 建立（markup setter／插入方法若被用即失敗）、浮層唯一 anchor／屬性、poll／縮小展開／重掛及骨架／診斷排除。移除整個 host 前後骨架相等，確認排除發生在遮罩前。
- e2e 加入 Scheduled 展開及 1280×600 內容捲到底後的連結驗證：唯一 anchor、精確 href、target／rel／文字、固定操作區底部、在浮層和視窗矩形內可見、elementFromPoint 命中、不與操作鈕重疊；另驗證診斷及複製骨架不含作者。從不點作者連結，既有0資源／背景請求斷言與網路政策不變。新增截圖路徑 `docs/author-link-scheduled.png`，本 session 未產生或覆寫截圖。
- AGENTS.md 補作者連結測試說明。

## 白名單精確範圍

scanner標籤必須精確為根目錄 `probe/ui.js`，且**整檔**SHA-256必須等於 `AUTHOR_UI_SHA256`，才能從「resource attribute」原始／正規化掃描視圖移除 `AUTHOR_LINK_SOURCE` 中唯一的 `link.setAttribute('href', 'https://x.com/punkcan');`。factory無參數，使用全域document且先確認A元素；target、rel、文字與其他UI內容都鎖在摘要中。根目錄 `probe/content.js` 也須整檔等於 `AUTHOR_CONTENT_SHA256`，固定唯一的 `createAuthorLink()` 呼叫與連結使用位置。任一檔改動即失敗，需複審後更新摘要；其他檔引用factory／XSCHED_UI也拒絕。单独href statement、不同網址、其他元素／屬性／檔案均不豁免。其餘原始／正規化規則全照常掃描，沒有通用URL或href例外。

新增規則全域禁止11個URL組件的寫入：href／search／hostname／host／pathname／protocol／port／hash／origin／username／password；涵蓋點／literal bracket／跳脫／字串拼接、複合賦值、增減、解構賦值、括號、for-of及delete。另禁止Reflect、Object.assign／defineProperty／defineProperties及相關反射提取／別名，未知computed key寫入也拒絕；document／createElement改寫及其他檔的factory引用拒絕。新反射規則僅保留原固定Scheduled導覽與摘要鎖住的quick原生select value descriptor讀取；新動態寫入規則僅保留完整摘要鎖住的quick既有寫入及content的既有dataset statement，均不能寫URL。所有舊規則仍逐條掃描。

原22項作者連結攻擊自測全保留，改為對完整UI來源套用變體：不同帳號路徑、外域、http、尾斜線／query／fragment、img／src、修改元素建立、其他及巢狀檔案、單獨／重複statement，以及夾帶資源、網路、namespaced屬性、markup、storage。本輪write-5新增160項URL改寫與22項factory邊界攻擊；本輪另補6項document／元素建立邊界案例，現為160／28項（相對b147ca1新增188項，作者相關共210項）。URL案例放在其他檔並檢查具體規則錯誤，避免被UI／content摘要不符掩蓋漏檢。main的30 API bypass、14 icon、9 SVG、41 leak、21 storage、33 native writer自測全保留。`probe/position.js` 未修改，SHA-256 仍為 `7485935c58ef6e3c1ae2db7417deea44e8224ace44c20b9d699da92e15bee335`。

## 版本與權限

維持main的0.1.0：這是作者標示的小變更，沒有新增資料格式、權限或流程上的升版需求；現有版本一致性測試通過，manifest／版本常數不變；本輪package.json／lockfile僅明確加入既有esprima開發相依，版本欄位不變。manifest 完全未改、沒有新增網路 API 或遠端資源、花費$0。普通 anchor 僅由使用者點擊開啟作者頁，不會主動請求。

## 本 session 驗證

| 命令 | 結果 |
|---|---|
| `npm test` | 退出0，10檔通過／0敗／0跳過 |
| `node --test --test-isolation=none test/`（細項計數） | 退出0，165過／0敗／0跳過 |
| `npm run verify` | 退出0，11 probe檔／4 Logo SVG；30 API／14 icon／9 SVG／41 leak／21 storage／33 native writer／22 author-link／160 URL mutation／28 author boundary／158 destructuring／514 resource property自測全過 |
| `npm run e2e` | 依指示未執行：sandbox不能listen，留給外部跑；本輪無Chrome結果及新截圖 |

最新完整來源的標準npm test與細項計數全過；前輪164項保留，本輪新增資源屬性矩陣，完整repo CLI測試增加15個攻擊變體，共165項。

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

作者連結已由外部rebase／commit／push並開PR #12，本輪起點b147ca1；本session只改檔及測試，没有Git寫入，也沒有讀寫另一條開發工作目錄。請外部在最新檔案跑e2e並更新PR，取得fixture截圖與0資源／背景請求證據，再交原複審session確認P1修正。PR附這份交接及外部結果、複審session資訊。

Chrome真實排版、拖動、避讓、固定操作區仍需完整外部e2e確認；單元測試不提供Chrome幾何結果。維持main的0.1.0時，載入修改後仍應重新整理已開啟的X頁，避免舊content script繼續執行。沒有新增作者頁網路白名單，e2e不能點連結。

老闆自己的Chrome驗收（4步）：重新載入擴充並重新整理X；打開Scheduled，確認底部小字連結及原操作鈕；捲動／縮小再展開／分別拖鈕與浮層，確認原操作正常；複製診斷和骨架確認不含作者連結。不回傳真實資料或真帳號截圖。

## PR #12 P1 白名單繞過修正（本輪）

根因：先前只移除精確factory裡的href statement，未限制回傳值的後續URL組件寫入；factory接收外部document，呼叫者也可讓createElement回傳link，帶遠端href掛到head。複審者指出的 `author.search = '?x=1'`、`author.hostname = 'evil.example'` 和假document呼叫已加入完整來源變體自測；其他檔同類URL改寫也由獨立規則驗證拒絕。

採用無參數全域document＋A元素斷言，並額外鎖完整UI／content來源摘要，而非只數factory片段或呼叫次數。理由是別名、shadow、call／apply、重新排序和回傳值改寫容易繞過局部文字比對；完整摘要會一律拒絕未審改動。代價是未來UI／content任何修改（包含無關功能）都須複審與摘要同步，不能只更新factory片段。這是保守的靜態守門，不宣稱可證明任意混淆JavaScript安全；舊raw／canonical掃描不替換或放寬。

單元測試改在VM全域document執行真UI來源，保留DOM／markup禁用斷言；額外證明外部參數無法換document、錯誤元素在寫href前拋錯。content VM保留既有幾何override，factory使用該VM的document。新增真CLI案例確認URL改寫、Object.assign與假document呼叫退出1，未執行違規模組。全部規則／原自測保留，相對b147ca1新增188項安全自測；npm test細項162全過，verify全過。

本輪改8檔：probe/ui.js、probe/content.js、scripts/verify.mjs、test/ui.test.mjs、test/content.test.mjs、test/review.test.mjs、AGENTS.md、本HANDOFF。沒有改連結位置、CSS或e2e斷言；quick.js／position.js／manifest未改，版本維持0.1.0。e2e依指示由外部跑，本輪未執行。

## write-5額度中斷後續核對（本輪續作）

先檢查git status／git diff，確認原8檔未commit改動都保留，factory、固定無參數呼叫及160項URL／22項邊界自測已完成，不重寫既有實作。逐項複核發現額外遺漏：其他probe檔的 `const {document, unused} = ...` 可建立全域lexical document，原掃描回傳空陣列；VM以純記錄物件證明factory會使用它並寫入href（沒有任何網路請求）。另有解構賦值／for-of改寫Document.prototype.createElement的形式未被拒絕。

補強document／createElement寫入規則與解構document宣告，複用賦值尾端規則涵蓋shorthand欄位；新增6項邊界攻擊（直接／巢狀／含default的document解構宣告、createElement與document解構賦值、createElement的for-of寫入），28項邊界自測全過。UI單測保留DOM與錯誤元素驗證，追加惡意lexical document來源的掃描拒絕；真CLI測試也追加這一例。原160項URL、22項author-link及main所有規則／自測均保留，162項單測全過。

本輪找到的具體繞過已封住；不把有限的靜態掃描當作任意混淆JavaScript的安全證明。UI／content來源摘要與固定呼叫契約仍不變；後續改動需複審摘要。quick.js／position.js／manifest與e2e腳本未動，版本仍0.1.0；e2e交外部。只改工作檔及執行測試，無Git寫入。

## 6276e5c後複審：巢狀解構P1修正（本輪）

外部已commit／push前輪修法，HEAD 6276e5c的npm test 162過、verify OK、e2e 638 OK。另一個Codex session再次REQUEST_CHANGES：targetEnd僅辨識平坦尾端，後續欄位有巢狀pattern時，author.search／hostname、document與Document.prototype.createElement都可被解構賦值改寫；未鎖的reader.js追加pointerover handler也能讓完整verify誤判通過。本輪不改任何probe來源或其摘要。

修法不再延長targetEnd：保留全部舊規則，額外用Esprima tokenizer對原始JS建立完整成對括號與父層關係，在解構賦值、for-of／for-in、函式／method／arrow及catch參數pattern內，以任意深度檢查成員存取與document／createElement識別字（含跳脫）。computed member涵蓋identifier、this／super、呼叫／括號結果及literal／tagged template接收者。預設值或computed key裡的成員讀取也保守拒絕；正常來源不需要它們。tokenization／括號失敗即拒絕。字串、regex、模板純文字與註解不提供假的delimiter；模板插值內的程式仍掃描。

取捨：Esprima 4的parseScript不支援現有optional chaining、optional catch binding等語法，不能把舊parser強套在production。tokenize可完整處理現有六份JS，故使用lexical token與delimiter結構的保守規則，不宣稱這是完整AST解析或任意JS沙箱。esprima原是間接相依，現在package.json與lockfile根devDependencies明確鎖4.0.1；既有lock中的版本／integrity不變，不增加production資源、權限或請求。離線npm install因無registry metadata cache失敗，直接同步現有鎖檔根相依；npm ls esprima --depth=0確認直接相依4.0.1。

新增158項解構自測：11個URL組件、document、createElement的原例／多層object-array／for-of／for-in／預設值／rest／template插值，64層深度、escaped identifier、computed key、this／super與其他member接收者；另有安全的解構、資料object及文字／regex／註解對照。舊22 author-link／160 URL mutation／28 author boundary和main的30 API／14 icon／9 SVG／41 leak／21 storage／33 native writer全保留。

完整CLI自測複製probe、scripts與4份Logo到/tmp，以原node_modules解析既有相依，先證明乾淨repo副本CLI退出0且全自測通過；再只在reader.js加pointerover handler抓shadowRoot的.panel-author，分別用巢狀解構改search、hostname及雙for-of改兩者。三個變體都退出1，錯誤必須是probe/reader.js的destructuring規則，不能是UI／content摘要不符、SELF-TEST FAILED或ReferenceError。靜態失敗已禁止pure模組載入，因此main改為先回報靜態失敗，不再對未載入模組執行DOM洩漏自測；乾淨repo全部自測依舊必跑，未跑完不會給OK。

自行補查9種陣列／rest／預設值含分號／computed target／generator與async參數／escaped binding／template多插值／字串key寫法，全部拒絕；進一步發現computed receiver的this／super等token需納入，已補入規則與158項回歸。現有probe全部通過新規則，未發現仍可重現的巢狀pattern繞過；有限靜態守門仍不證明任意混淆JS安全。

本輪7檔：scripts/verify.mjs、package.json、package-lock.json、test/position.test.mjs（真scanner VM提供esprima）、test/review.test.mjs、AGENTS.md、本HANDOFF。npm test 10檔全過、細項164過／0敗／0跳過，verify 11 probe／4 Logo全過；新增158解構攻擊與3個完整CLI攻擊變體。版本0.1.0，quick.js／position.js／manifest以及所有probe／e2e來源不變；無Git寫入。本輪e2e仍由外部跑，不能把HEAD 6276e5c的638結果當成本輪重跑證據。

## eb945f7後複審：ping與資源IDL寫入P1修正（本輪）

前輪已由外部commit／push，HEAD eb945f7的npm test 164過、verify OK、e2e 638 OK。新P1根因是resource attribute規則只檢查setAttribute／setAttributeNS，而直接property寫入只檢查11個URL組件，漏掉HTMLAnchorElement.ping及其他資源IDL。只在未鎖的reader.js追加pointerover handler便能設ping且verify退出0。依[HTML hyperlink auditing標準](https://html.spec.whatwg.org/multipage/links.html#hyperlink-auditing)，跟隨帶ping的連結可以額外送POST；href白名單本身不應授權這項行為。

修法使用一份RESOURCE_ATTRIBUTE_IDL對照表，產生setAttribute／setAttributeNS的禁單，同時把全部IDL名稱併入原URL寫入規則。原8個attribute完整保留：src、href、srcset、action、poster、data、ping、formaction（IDL formAction）；加attributionsrc（IDL attributionSrc）、background、referrerpolicy（IDL referrerPolicy）與srcdoc。理由是共用來源可避免兩份禁單再漂移。IDL點／literal bracket／Unicode與hex escape／字串拼接／複合賦值／增減／delete／for-of／for-in同一規則拒絕；反射、未知computed key與任意深度解構直接沿用已存在的保守禁令，不另開豁免。混合resource及URL改寫同時回報兩種錯誤，保留原URL診斷。安全property讀取、CSS的background資料／setProperty和現有probe都通過。

對照來源：[HTML表單提交屬性](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#attributes-for-form-submission)、[HTMLImageElement的IDL](https://html.spec.whatwg.org/multipage/embedded-content.html#htmlimageelement)、[attributionsrc規格](https://wicg.github.io/attribution-reporting-api/#attributionsrc-html-attribute)、[舊body background](https://html.spec.whatwg.org/multipage/obsolete.html#dom-body-background)及[iframe srcdoc](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-srcdoc)。referrerPolicy本身不觸發請求，但影響請求資訊；srcdoc可建立會載入資源的iframe文件，故兩者也保守拒絕。

新增514項resource property自測：12組attribute／IDL，每組41種写法，共492項；另8項ping原例、固定作者網址誤用、dynamic key、模板key、反射別名與resource／URL混合寫入，再加14項動態attribute／方法提取／Attr及NamedNodeMap setter攻擊。每項在未鎖reader.js標籤檢查具體規則，不能被摘要失敗掩蓋；明確對照表及514數量斷言防止漏映射造成矩陣縮水。另有4組安全來源對照（讀property／CSS背景／普通解構／安全attribute）。原30 API／14 icon／9 SVG／41 leak／21 storage／33 native writer／22 author-link／160 URL mutation／28 author boundary／158 destructuring全保留，舊7個自測函式與其他BANNED條目逐段比對HEAD未變；兩項resource attribute規則是原8項的嚴格擴充。

完整repo CLI測試保留原3個search／hostname／for-of變體，新增15個reader.js pointerover攻擊：直接ping、Unicode bracket、拼接bracket、Reflect.set、Object.assign、defineProperty、巢狀解構ping、attributionSrc、formAction、srcdoc、referrerPolicy、background，以及setAttribute別名／call／動態名称。先驗證乾淨副本退出0且包含全部新舊自測，再驗證18個攻擊皆退出1且命中reader.js的resource／reflective／destructuring／dynamic-extracted attribute規則；無UI／content摘要失敗、SELF-TEST FAILED或ReferenceError。測試只寫/tmp副本，不載入違規模組、不點作者連結、不發請求。

自行複核時另發現setAttribute方法別名、call及動態屬性名仍可繞過literal attribute檢查，已加入14項回歸及3個完整CLI案例，並補強方法守門：只允許非禁單的固定attribute名稱直接呼叫；拒絕方法提取／call／apply／bind與動態名稱，setAttributeNode／setAttributeNodeNS／setNamedItem／setNamedItemNS也拒絕。唯一非literal名字呼叫是完整SHA-256鎖住content的既有 `path.setAttribute(key, value);` SVG-key loop，key來源為原本固定的d／fill／stroke等資料，不能換成資源屬性；摘要不符即失敗，原資源禁單仍掃描全部來源。這不是新增資源網址白名單。

另外自行補查144個變體（12個IDL×12種括號接收者、條件接收者、註解、模板literal key／插值、for-await、深層for-of、陣列default／rest、Unicode反射名與方法別名），全部拒絕。此次檢查範圍內未找到仍能重現的資源IDL寫入繞過；守門是有限靜態檢查，並非任意混淆JavaScript安全的證明。

本輪只改4檔：scripts/verify.mjs、test/review.test.mjs、AGENTS.md、本HANDOFF。版本仍0.1.0，所有probe來源（包括quick.js／position.js／manifest）及SHA-256、package／lockfile、README、e2e腳本均未改。npm test 10檔全過；細項165過／0敗／0跳過；verify掃11 probe／4 Logo SVG全過，新增514資源自測及15完整CLI攻擊。e2e依指示交外部重跑，HEAD eb945f7的638是前輪證據。未執行Git寫入。
