# xsched（X 預排推文擴充）路線圖

更新：2026-10-09 17:45（UTC+8）。老闆 2026-10-09 點頭開工。
規格以開工卡為準：`docs/plan/cards/开工卡-X预排推文扩展-2026-10-09.md`（與 `notes/` 裡同名檔相同）。競品報告：`docs/plan/X预排推文-竞品-2026-10-09.md`。接手前先讀根目錄 `AGENTS.md`。

## 定位

Chrome 擴充，只改造 x.com 頁面：老闆照樣在網頁上發文，擴充幫他操作 **X 原生的「排程」視窗**（快速選時段、自動預排、排程總覽）。不用任何 API，不自己發文。先老闆自用兩周，$0；能用再談上架（Chrome Web Store US$5 要老闆另批）。

現成競品（AutoSkedule、Xchedule、XScheduler）都只在 X 排程視窗裡填時間，沒有一個讀得出 X 上已經排了什麼，所以「下一個空時段」可能撞到已排的，也沒有總覽。這就是我們的空缺。

## 閘 0：可行性（目前階段）

| 項目 | 內容 |
|---|---|
| 要驗證 | 能否從 x.com 頁面穩定讀出「Unsent posts → Scheduled」列表：每則的排程時間、文字前段。不靠 API。 |
| 要交出 | DOM 結構依據、讀取方式、改版風險、一個只讀的測試小擴充、老闆實測 ≤5 步（讀出的則數與時間是否和 X 上一致）。 |
| 讀不出來 | 停下，回報替代方案（例如只記本機自己排過的）。 |
| 狀態（2026-10-09 18:50） | PR #2 已合 main（`bb0e453`）：唯讀探針 `probe/`＋fixtures＋測試＋`notes/GATE0.md`＋Logo B。寫：CodeWhale deepseek-flash；審：Codex gpt-6.1-sol high（APPROVE）。結論**有條件可行**（真頁未驗證），等老闆照 `notes/GATE0.md` §6 實測（≤5 步）。 |

閘 0 做完回報商務拓展，老闆實測通過才往下做 1.0。

## 閘 0.2：Dagaz 快捷鈕＋真結構讀法／時間（probe 0.0.3，待真時間驗收）

首輪快捷鈕／版本／九語已由外部提交 `722c83f`、`e607b5d`，使用者回報 Chrome e2e 305 斷言通過與假資料截圖已提交。老闆追加硬標準：真 Scheduled 則數與每則日期＋時分都要正確，未達到不算過。

2026-10-10 收到 0.0.2 遮罩骨架：外層 dialog 36 行／內層 modal 42 行；108 行僅一顆含 tweetText 的 row button，117–118 行為獨立時間 span/#text(28)。背景 126 行起包含全部 cell/article/time，不能算排程。**則數依骨架可讀、時間格式待老闆診斷確認**；真文字、語系與日期無法由長度恢復。

本輪已加據骨架的最近 modal／button＋tweetText＋span 讀法、背景 article 排除、未知時間列保留、五語有／無年份／12–24小時／跨年解析、標準時間顯示、日曆詞白名單 fmt／samples／骨架樣本、兩個 real 合成 fixtures。舊 fixture 60 組讀法結果不退；本機 102 過／0 敗，verify 30／14／9／25 自測過。本轮外部 WIP `5da24dd`，仍有最後修改未提交。

**未達 READY**：需老闆 0.0.3 fmt／samples 診斷與新版骨架逐則確認實際时间；本輪 Chrome e2e 沙箱 listen EPERM，新增 real／跨年情境與截图請外部跑，另由另一 Codex session 複審。無新增權限／網路資源，$0，不打包 zip。本 session 不 push／PR／改 main。依據、5 步實測與可轉給老闆的請求見 `notes/GATE0.md`「閘 0.2 真頁骨架分析」；交接見 `notes/HANDOFF-gate0.2.md`。

狀態（2026-10-10 07:10）：PR #5 Codex gpt-6.1-sol high 複審 APPROVE 後合 main。則數依老闆骨架可讀（內層 modal 1 則，背景時間軸排除）；**時間格式待老闆貼 0.0.3「複製診斷」（含 `fmt=`／`samples=`）確認**，確認前閘 0.2 時間硬標準不算過。

## 閘 0.3：確認繁簡時間格式＋浮層捲動／縮小／避讓（probe 0.0.4，待外部驗證）

2026-10-10，分支 `gate0.3/overlay-scroll-avoid`，基準 main `fdc8096`（PR #5）。繁中真機確認 L117–118 時間節點正確；0.0.3 失敗是日期後未加括號的「週二」缺文法，解析和樣本提取都停住，不是抓錯節點。已補週／周／星期與繁簡片語／空白變體，日期優先於文案星期；repo只用假日期／本文，新增簡中重建fixture。

已實作整個面板≤60vh、獨立可捲內容與固定操作列、九語縮小入口、安全遮罩時間樣本；有界右下取樣和fixed／sticky祖先幾何避讓，無安全空間時只留快捷鈕或暫藏，手動狀態保留。版本0.0.4、舊身份誘餌清除、原verify規則保留；本機113過／0敗／0跳過，verify30／14／9／37自測過。

外部工作期間建立WIP `05242c5`，仍有最後收尾差異待提交。待外部 `npm test`／`npm run verify`／`npm run e2e`、gate0.3假資料截圖與0資源／背景請求證據；沙箱listen EPERM，沒有本輪Chrome斷言／新截圖。另待另一session複審及老闆自己的Chrome逐則日期時分與右下布局實測，尚未READY。無新增權限／網路API／遠端資源，$0、不打包zip。根因、5步實測與限制見 `notes/GATE0.md`「閘0.3」，外部交接見 `notes/HANDOFF-gate0.3.md`。

狀態更新（2026-10-10）：閘0.3已經由PR #8合main `4491b79`，老闆確認0.0.4繁中時間timeOk=1／timeFail=0、浮層可捲。下一輪修布局，不倒退時間讀法。

## 閘 0.4：快捷鈕可拖動＋避讓其他擴充（probe 0.0.5，實作完成、驗證受阻）

2026-10-10 11:35（UTC+8）。老闆實測 0.0.4：時間解析通過（timeOk=1、timeFail=0）、浮層可捲；但快捷鈕與其他擴充浮動鈕疊在一起、tooltip 蓋鈕。分支 `gate0.4/drag-avoid-extensions`；位置存 x.com localStorage（不加權限）。交接見 `notes/HANDOFF-gate0.4.md`。

0.0.4跳鈕根因已用原函式VM證明：展開把面板矩形算入鈕避讓並回寫host，poll也重跑；不是掛在dialog內，modal子鈕仍能成障礙。本輪固定錨點／面板分離、modal排除、外掛root fixed有界偵測、6px pointer拖動／reload保存／resize夾位、九語重設與原生title已實作；位置只存x.com固定xsched key的兩個有限數字，不加權限。verify原禁令保留，以精確已審來源邊界開放唯一位置模組，增加18項storage攻擊自測。

**尚未READY**：本輪沒有node_modules，npm ci ENOTCACHED／registry DNS EAI_AGAIN；無依賴位置測試5/5、实际静態守門與18項storage自測已過，完整npm test／verify／e2e未通過驗收。外部已有WIP `16f6228`，後續修改待提交；需外部安裝lockfile依賴並跑三測試／gate0.4假資料截圖，另由另一session複審與老闆真機位置驗收。根因、策略、5步實測與限制見notes/GATE0.md「閘0.4」；完整環境結果及外部命令見HANDOFF。

狀態更新：PR #9已合main93ed233（0.0.5）；上述依賴阻擋為歷史，閘0.4複審與capture／resize修正已合。

## 閘 0.5：浮層可拖、鈕與浮層位置獨立（probe 0.0.6，實作完成、待外部e2e／複審）

2026-10-10 12:40（UTC+8）。老闆回報 0.0.5 拖鈕時浮層跟著跑。分支 `gate0.5/draggable-panel`。交接見 `notes/HANDOFF-gate0.5.md`。

0.0.5仍在每次pointermove／poll用鈕錨點重算panel，造成單向跟隨。本輪改獨立panel位置，首次展開選鈕旁空位並保存第二個固定xsched key，標題列6px拖動／section capture／按鈕排除，兩位置互不跟隨，reset清兩key後預覽。resize夾位但保留原存值；60vh／body捲動／固定操作區、權限與網路限制不變。只用假資料，reader只升版。

本機npm test 9檔通過，細項138/138；verify30／14／9／39 leak／21 storage全過。npm run e2e仍listen EPERM，0個新Chrome斷言／截圖；需外部最新三測試、gate0.5假資料截圖與另一session複審，尚未READY。根因／兩key儲存與重設預覽模型／5步實測／限制見notes/GATE0.md「閘0.5」，檔案清單與外部命令見HANDOFF。

## 1.0（閘 0 過才做）

> 2026-10-10 16:05（UTC+8）：閘 0 老闆實測通過（0.0.6）。開工第 1 項「快速選時段」，分支 `v1.0/quick-slots`，一項一個 PR。排程對話框尚無真 DOM 證據，見 `notes/HANDOFF-v1.0-quick.md`。

1. **快速選時段**：發文框旁加按鈕，預設時段（例如 9:00／12:30／20:00，可自訂、可設星期）。一按＝打開 X 原生排程視窗並填入「下一個空時段」，老闆確認後照原流程按 Schedule。
   - 本輪0.1.0：四個固定未來時段與九語shadow介面、純計數診斷、原生select整組預檢填值；老闆手動開X設定視窗／自己確認，擴充不click或submit。設定DOM仍未驗證，失敗不半填；不做自訂／星期／佔用避讓。npm test154/154、verify OK（41洩漏／20 native writer自測）；e2e沙箱listen EPERM，外部最新三測試／範例截圖與獨立複審待跑，未達READY。證據、假設與5步實測見GATE0「1.0快速選時段」，交接見HANDOFF-v1.0-quick。

   - 狀態更新：0.1.0 已合 main `293589f`（PR #11）。0.1.1 quick-fix 依真遮罩骨架補上內層 modal、兩個 group 與六個 label 關聯選單的辨識；骨架中的 testid 是空值，不猜前綴。已完成保守的選項映射、九語年份／選項錯誤、原生 setter＋input/change、讀回失敗整組還原、日期 input 的 min/max 只讀，以及 select／label 安全 testid 匯出。外部 `737d242` 的 169 項單元測試、verify（55 洩漏／39 writer 自測）及兩個快速時段 e2e 情境通過；完整 e2e 在 Chrome 內建日期圖示的 data: SVG 請求上失敗。本次只在三份 fixture 隱藏指示器，網路守衛不變；修正後外部完整 e2e 686 斷言通過，quickfix 截圖已產生。option 真值、React 是否接受及日期 input 是否由 X 同步，仍待老闆逐欄驗證；複審也待完成。見 HANDOFF-v1.0-quick-fix 與 GATE0「1.0 快速時段 0.1.1：真骨架」。總覽另分支暫停，未帶入本輪。

   - 0.1.2 quick-fill（分支 `v1.0/quick-fill`，基準 main `162a838`）：老闆真頁已偵測到六欄，但填值被還原。核對兩版骨架 L86–173 相同，60 個分鐘／空 testid／未知 value 格式；0.1.1 已用原生 setter，缺陷是批次寫值、相依順序與同步讀回。假頁可重現第一個 change 重繪蓋掉未送事件的值，這是最可能原因，真頁時機仍待診斷確認。本版改年→月→日→上下午→時→分、每欄重查、等待 microtask／rAF／有界輪詢，失敗整組還原也等待；新增六欄安全診斷、fill=ok 與骨架 option value 樣本。新增受控重繪／節點替換／編碼變體與自動修正測試，verify 舊守門全保留（66 洩漏／46 writer 自測），npm test 12 檔／細項 196 過。完整 e2e／quickfill 假資料截圖／獨立複審及真頁逐欄實測待外部；總覽沒有動。見 HANDOFF-v1.0-quick-fill 與 GATE0「1.0 快速時段 0.1.2：填值根因」。

2. **自動預排**（可開關，預設關）：開啟後按發文改走排程，填入下一個空時段。
3. **空時段避開 X 上已排的推文**（用閘 0 讀到的列表），不只記本機。
4. **排程總覽**：側欄或頁面面板，周視圖／列表，顯示已排推文的時間與文字前段，點擊跳到 X 的 Scheduled 那則編輯。
5. 時區跟瀏覽器；多語系沿用 Chatseek 那套（繁中、簡中、英、日、韓為先）。
6. **健康檢查**：找不到 X 排程視窗或列表時，面板明確警告，並有「複製診斷」（只含命中數，不含推文內容）。

## 之後（未排，要老闆拍板）

- 上架 Chrome Web Store（US$5 開發者費）。

## 已知風險

- X 一改版就可能壞（跟 Chatseek 一樣），靠健康檢查＋複製診斷＋fixture 快修。
- 自動化操作網頁有被判異常的風險；擴充只在老闆按下按鈕時操作排程視窗，不定時、不背景發文，以降低風險。
