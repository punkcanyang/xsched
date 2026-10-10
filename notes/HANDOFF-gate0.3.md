# HANDOFF：xsched 閘 0.3（probe 0.0.4：浮層捲動／縮小／避讓＋浮層顯示遮罩時間樣本＋查 0.0.3 解析失敗）

更新：2026-10-10 08:20（UTC+8）。分支 `gate0.3/overlay-scroll-avoid`，基準 main `fdc8096`（0.0.3）。

## 老闆實測 0.0.3（截圖，經商務拓展轉來）

- 浮層：`xsched probe v0.0.3 (manifest 0.0.3)` → 「讀到 1 則」→ 黃字虛擬列表提示 → 藍字「時間未解析」；下方被截斷，看不到「複製診斷」等按鈕。
- 浮層蓋住 X 右下角原生元件（帶紅點 1 的圓形元件，可能是訊息）。
- 背景排程列露出「9:00 AM」→ 線索：英文 12 小時制（**未驗證**）。

## 要做

1. 浮層內部捲動（max-height ≤ 視窗 60%、overflow:auto），操作鈕（複製診斷／複製頁面結構／前往 Scheduled）永遠可見（頂部或底部固定）。
2. 浮層可縮小成只剩快捷鈕。
3. 位置避開 X 右下原生固定元件（訊息抽屜、Grok 等），只用 getBoundingClientRect；快捷鈕本身也不蓋。
4. 浮層直接顯示遮罩時間樣本（同診斷遮罩），「時間未解析」旁可見。
5. 查 0.0.3 為何解析不到：英文 12 小時制排程字樣涵蓋？28 字節點是否抓錯？選法要有依據。
6. 版本 0.0.4。
7. 洩漏測試與 AGENTS.md 的「VibeEyeX」「punkcan@example.com」換成 `@decoy_handle`、`decoy@example.invalid`（商務拓展同意），verify 不變弱。
8. e2e：1280×600 浮層可捲、按鈕可見可點；可縮小；模擬右下原生固定元件不重疊；未解析時浮層顯示遮罩樣本且不含內文；0 網路請求；舊情境不倒退。截圖 `docs/gate0.3-*.png`，複本 `/workspace/xsched-shots/gate0.3/`。

## 工具與 session

- 寫碼：Codex gpt-6.1-sol high（非 Fast），resume `01a1212e-3e31-74f3-ba55-1c3c643723cb`
- 複審：Codex gpt-6.1-sol high，resume `01a12013-6780-77c1-9466-bb1e9f78097f`
- 撞額度：立即停、回報可重試時間，不掛等待腳本。
- Codex 沙箱 `.git` 唯讀、不能 listen：commit／push／e2e 由产品开发在外面做。

## 進度

- [ ] 寫碼
- [ ] 外部 npm test／verify／e2e、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main
