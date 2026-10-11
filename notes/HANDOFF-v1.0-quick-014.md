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

未捲完的列表快取仍不完整；沿用 reader 的累加／去重與未解析列限制，沒有改讀法。自動面板找不到完整空位時仍可保守收合；手動位置不因避讓縮高度，可能與既有元件重疊，請自行拖到空處。極小視窗無法物理容納全部快速區，優先保留視窗邊界與捲動。需外部完整 e2e、假資料截圖、獨立複審及老闆驗收後才 READY。
