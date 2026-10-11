# HANDOFF：xsched 0.1.4 write-1

分支 `v1.0/quick-014`，基準 main `4f7a084`；本輪接續外部 WIP `25dad97`。只完成「最後時間自動往後推」及「高度不塌」兩項，不帶入總覽。本輪沒有 commit／push／merge，既有未追蹤的 0.1.3 截圖保留。

## 五步計畫與完成狀態

1. 已核對基準及 WIP 差異，離線重現舊避讓路徑把 546px 預設高度壓到 160px；根因與程式行號寫入 GATE0。
2. 已完成只讀成功觀察：成功填值＋可信的使用者原生排程點擊＋同一作用範圍相符關閉或新成功提示，連續兩次觀察後才推進快取。取消／欄位改動／錯誤／未知提示／超時／失敗填值均不更新。設定視窗的「確認」只是暫時狀態，仍須在原本發文框親按最後的「排程」。
3. 已補九語最後時間及來源。沿用五個固定 key；lastScheduled 可存 `{time,readAt,source}`，source 只允許數字 1（列表）或 2（觀察到排程完成）。舊兩數字快取仍可讀，視為列表來源。新時間只取較晚者；重新讀到有效 Scheduled 列表後，以列表最大值直接覆蓋，包含比觀察快取更早的時間。沒有保存按鈕文字、提示或貼文。
4. 已把高度下限改為視窗 2/3 與完整快速區需求的較大者，上限仍是視窗減 32px。移除避讓縮短高度；標題列拖曳也使用相同下限夾位。舊小高度只夾顯示、不偷偷改寫儲存值。快速區量測包含標題、固定操作區、快速時段／設定區；狀態文字留高度，首次渲染、忙碌及成功狀態不縮短。resize 重新量測；極小視窗仍以視窗上限優先，內容可捲、操作區固定。
5. 已同步版本 0.1.4、四份來源 SHA、storage／writer 攻擊自測、單元回歸、e2e 情境與文件。本機測試全過；完整 Chrome e2e、截圖、另一 session 複審及真機驗收仍交外部。

## 實跑結果

PATH 已優先 `/home/box/.local/bin`。`npm test`：13 檔全過。展開 TAP：226 過／0 敗／0 跳過。`npm run verify`：OK，30 API／14 icon／9 SVG／66 leak／37 storage／59 native writer／22 author-link／160 URL／28 author boundary／158 解構／514 資源屬性／308 CSS 資源自測全過。原有攻擊與靜態禁令全保留，storage 34→37、writer 52→59。

新增回歸涵蓋舊成功提示、未知／錯誤提示、停用／不可信／無關按鈕、關閉前偷偷改欄位、確認後最後排程、延後錯誤、取消及觀察超時；另測較晚快取保留、九語來源／reload、列表覆蓋、來源 enum／getter 驗證、舊小高度、立即填值高度不變及拖到底部不裁切。

## 外部待跑

```bash
export PATH=/home/box/.local/bin:$PATH
npm test
npm run verify
npm run e2e
```

Chrome for Testing／Xvfb 沿用既有環境；沙箱 listen 受限，本輪沒有硬跑 e2e，不宣稱 Chrome 通過或 READY。e2e 只用合成 fixture／2027+ 假時鐘；既有所有自動填值情境仍要求 X click／submit=0。新增成功觀察情境由 Puppeteer 實體點擊模擬使用者，單獨核對每一次原生點擊，擴充程式不得製造任何點擊，submit 仍 0。保留 0 擴充資源／背景請求，network-policy 原樣，沒有 data: 豁免。manifest 除版本外與 `4f7a084` 相同。

重點截圖由 e2e 產生：

- `docs/v1.0-quick014-immediate-fill.png`
- `docs/v1.0-quick014-height-floor-small.png`
- `docs/v1.0-quick014-observed-{close,toast,plain,cancel,changed,error,unfilled,unknown,stale,confirm-only,two-stage,older}.png`
- `docs/v1.0-quick014-list-authoritative.png`

其他舊情境的本版副本也用 v1.0-quick014 前綴，不覆寫舊截圖。本輪尚未產生這些圖。

## 老闆實測（≤5 步）

1. 合併後在 main 執行 `git pull --ff-only origin main`。
2. 到 `chrome://extensions` 重新載入 `probe/`，確認 0.1.4，再重新整理 x.com。
3. 自己打開原生排程對話框，打開 Dagaz 浮層後立刻點時段；確認完整快速區、五個時段與儲存間隔鈕可見，高度不塌，拖高度把手也不能低於下限。
4. 先到 Scheduled 讀列表，再回發文框用「最後一則＋隨機分鐘」。核對所有欄位；只有確實要排的貼文才親自按原生「排程」，確認最後時間與來源更新。取消或改欄位不應更新。純測試請讓快速時段算出 2027 年以後的日期；填完再手改年份會取消追蹤。
5. 再讀 Scheduled，確認來源回到列表；純測試貼文自行刪除。有問題附浮層截圖＋「複製診斷」，真機資料只私下貼回，不提交公開 repo。

## 限制與待確認

成功觀察不是 X 伺服器確認。原生排程／確認／取消及成功提示的精確九語 UI 文案仍是保守假設，集中在 COMPLETION_CONFIG；沒有真提示 DOM 證據。看不準、另一個 dialog 取代原本節點、成功後同步清空欄位、未知新通知或超過 10 分鐘都不推進，請回 Scheduled 重讀。關閉後仍可能有更晚的錯誤，連續兩次觀察不能保證任意延遲；列表重讀才是校正依據。

未捲完的列表快取仍不完整；沿用 reader 的累加／去重與未解析列限制，沒有改讀法。write-1 原本在找不到完整空位時收合，write-2 已改為視窗內備援位置；手動位置不因避讓縮高度，可能與既有元件重疊，請自行拖到空處。極小視窗無法物理容納全部快速區，優先保留視窗邊界與捲動。需外部完整 e2e、假資料截圖、獨立複審及老闆驗收後才 READY。

## write-2：第 3 點 P0，先查根因（修正前）

本輪從 `22be1dc` 接續，只修浮層重新叫出／恢復與兩個診斷計數，不新增功能，不擴大 verify 或 e2e 守門。先讀程式再執行 `node /tmp/quick014-reopen-before.mjs`（linkedom＋真 content VM，合成資料與 2027 假時鐘），結果如下：

| 可能原因 | 程式與離線證據 | 結論 |
|---|---|---|
| 開關狀態跟 DOM 不同步 | content.js:217–223 只反轉 collapsed；452–453／469–471 能將 section 隱藏，卻不改 collapsed。模擬 panelPlacement 找不到空位，四次點擊全部 expanded=false／display=none。 | 可重現：邏輯以為開，實體仍藏起來，再點鈕沒有恢復路徑。 |
| remount 後事件未重綁 | ensureHost 每次新建都執行 shortcut.addEventListener；VM 移除 host 後 remounts=1，點鈕 expanded=true。 | 沒重現事件漏綁；但 ensureHost:144 只檢查 host connected，section 被移除時 poll 得到 TypeError：Cannot read properties of null (reading 'style')。shadow 子樹缺損未恢復是真缺口。 |
| SPA 移除 host | content.js:782–805 的 observer、pollLocation:755 的斷線偵測與 ensureHost 有界重掛已存在。VM 移除 host 可恢復，沿用既有測試驗證 body 替換與節流。 | 能恢復整個 host；問題是沒有檢查連線中的 host 是否還含完整面板。保留原重掛節流。 |
| 夾位反而越界 | ui.js 的 clampPanelPosition 使用面板完整尺寸；存 x/y=5000 後 resize 到 390×600，VM 得 left=30px、top=184px、height=400px。 | 未重現公式把儲存座標夾到視窗外；仍要補實際面板 rect 越界時的恢復，以防外部樣式或缺損。 |

以上能證明程式缺陷，不能確認老闆那次的真頁觸發路徑，沒有新的真機 DOM／診斷證據。修法限定：點鈕以實際面板可見性決定開／關；缺損時重建自家 host 並重綁；未找到初始避讓空位時改用視窗內備援位置；只在需要恢復時重新夾位。保留使用者正常收合與位置獨立性、原有自動重掛節流，以及外部把整個 host 隱藏時 mounted=0 的既有診斷；再次明確開啟時可重建它。新增 toggles／recoveries 純數字計數，不匯出內容。

## write-2：第 3 點修正完成

接續外部根因筆記 commit `6cb1cf8`。本輪只動五個檔案：content.js、content.test.mjs、e2e.mjs、verify.mjs（僅 content SHA 一行）與本 HANDOFF。ui.js／quick.js／position.js／reader.js／manifest 原樣；沒有新增儲存、權限、網路請求或送出動作。沒有 commit／push／merge。

- Dagaz 依面板實際可見性決定開關，不再只反轉 collapsed。避讓無解時，改用視窗內完整尺寸的備援位置，讓使用者能拖到空處；不再把開啟意圖藏在 display:none 後面。備援位置可能與原生元件重疊，這是無空位時的取捨，正常避讓仍照舊。
- 保留自家 section／shortcut 的節點參照，poll 會辨識移除／替換、意外 display:none／hidden／visibility／opacity、實際 rect 越界，重建 host 及事件綁定，再按現有完整尺寸夾位。positionUI 遇缺節點先排恢復，不再直接讀 null.style。使用者正常收合不算故障；外部刻意隱藏整個 host 仍顯示 mounted=0，明確要求開啟時可重建，保留既有 hidden-host 斷言。
- 自動重掛仍最多每 3 秒 3 次，窗口過後重試；只有使用者明確開啟可以重新給重試額度，沒有增加自動忙迴圈。健康面板開關／poll 不重定位；原儲存位置保持不變。
- toggles 計算實際受理的 Dagaz 開關及縮小；拖曳後被抑制的點擊不計。recoveries 計算實際重建、無空位備援或越界夾位；正常開關不增加。兩者為本次頁面 session 的數字，加入既有診斷計數行，原 fmt／samples／複製診斷格式仍保留，沒有新文字出口。

新增 3 個單元回歸：無空位仍能開且狀態一致；8 種 shadow 缺損／隱藏／越界及重綁（另驗正常收合與明確開啟隱藏 host）；20 輪開／關穿插 SPA／縮放／重掛，每次都在視窗內。修後同一 `/tmp/quick014-reopen-before.mjs` 得 expanded/display 依序 true/flex、false/none、true/flex、false/none；missing panel 顯示 no error，重掛後事件與原夾位數值仍正常。這仍是合成離線證據，不是老闆真頁觸發路徑的確認。

e2e 僅追加一個「20 輪完整開／關」情境（40 次 Dagaz 點擊），穿插 history SPA、390×600／1280×820 縮放及自家 panel／host 缺損；逐輪檢查開啟、收合及完整 rect 在視窗內，核對 toggles／recoveries。沒有改寫任何舊情境或網路守衛，也沒有增加其他守門／截圖／fixture。只用既有合成 2028 列表，不操作 X 原生送出按鈕。

實跑：PATH 已優先 `/home/box/.local/bin`。`npm test` 13 檔通過、0 敗、0 跳過；content 細項 37/37（新增 3 項）。`npm run verify` OK，仍為 30 API／14 icon／9 SVG／66 leak／37 storage／59 writer／22 author-link／160 URL／28 author boundary／158 解構／514 資源／308 CSS 自測，數量與規則完全不變。語法與 diff 空白檢查通過。比對 HEAD 確認 e2e 刪掉新情境後與舊檔逐字相同，verify 刪掉 content SHA 差異後逐字相同；網路政策、manifest、ui／quick 均未動。

沙箱 listen 受限，本輪沒有執行 Chrome e2e；外部請執行 `export PATH=/home/box/.local/bin:$PATH` 後 `npm run e2e`。仍需獨立複審與真頁反覆開關驗收；本輪沒有宣稱 READY。

第 3 點老闆實測（≤5 步）：

1. 合併後 `git pull --ff-only origin main`。
2. `chrome://extensions` 重新載入 probe，確認 0.1.4，再重新整理 x.com。
3. Dagaz 連續開／關 20 輪，期間在首頁與 Scheduled 間切換、縮放視窗；每次打開都應出現且在視窗內。不按原生排程／發佈。
4. 若用了備援位置，可拖浮層到空處，再開／關確認不消失。
5. 有問題附截圖及「複製診斷」（含 toggles／recoveries）私下貼回，不提交真機資料。
