# HANDOFF：閘 0（可行性）

更新：2026-10-09 17:45（UTC+8），产品开发。

## 現況

- Cursor 雲端額度用完，老闆定：交接後改用 **CodeWhale（deepseek-flash，--auto）寫碼、Codex（gpt-6.1-sol，reasoning high，非 Fast）複審**。寫與審分開 session，同一件事同一個 session。session id 記在 `/workspace/bd-punkcan/codewhale-sessions.md`（共享機）。
- 前一個 Cursor agent（bc-4ccfe624）做了：公開來源調查、probe/（reader.js＋content.js＋manifest）、fixtures、linkedom 單元測試、verify.mjs、Chrome for Testing e2e、範例截圖。**全部沒推上 GitHub**，雲端工作區已失。
- 它的 transcript 在共享機 `/workspace/cloud-agent-transcripts/bc-4ccfe624-6779-50dd-a364-c7e84e29b01c.jsonl`；抽出的線索：`/workspace/xsched-clues/`（只當線索，未驗證）。

## 未完成

1. 分支 `gate0/scheduled-read`：DOM 依據（每條標來源＋已驗證／未驗證）。
2. `probe/` 最小 MV3 唯讀探針：Scheduled 頁角落顯示「讀到 N 則」＋時間＋前 20 字；「複製診斷」只含命中數。
3. fixtures＋自動測試；`scripts/verify.mjs`（擋網路 API／innerHTML、權限最小）；e2e（Chrome for Testing＋host-resolver 把 x.com 指到本機 fixture）。
4. `notes/GATE0.md`：依據、讀法、改版風險、結論、老闆實測 ≤5 步、替代方案；範例截圖 `docs/`。
5. Codex 複審 → `merge --no-ff` 到 main → 交商務拓展。

## 下一步

照上面 1→5。硬規矩見 `AGENTS.md`：不用 API、不加網路請求、不攔截頁面 fetch／XHR／GraphQL、不發文、不點送出／刪除、無 innerHTML、權限最小、$0、不登入任何 X 帳號。
