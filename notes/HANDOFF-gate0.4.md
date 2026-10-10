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

- [ ] 寫碼
- [ ] 外部三測試、截圖
- [ ] PR
- [ ] 複審
- [ ] merge --no-ff main
