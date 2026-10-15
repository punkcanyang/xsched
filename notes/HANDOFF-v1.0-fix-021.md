# xsched 0.2.1 急修 — HANDOFF

基準 main `d0fa1d8`（0.2.0），分支 `v1.0/fix-021`。規格與根因見 AGENTS.md「0.2.1 急修」。

- 第 1 項（modal 快速時段）：合成 `fixtures/quick-composer-modal.html` 重現老闆的「找不到原生排程圖示」：舊 composer.js 在 picker 把同一 dialog 內容換掉、編輯框卸下時直接報 iconMissing。修 composer.js；`icon.click();` 仍是唯一代點，verify 規則不變、只更新摘要。
- 第 2 項（排程後總覽）：content.js `rememberScheduled()` 只寫記憶體；預覽由 composer 在使用者親按「排程」時被動讀取前 20 字。
- 未做：手動（不經快速時段）排程不被觀察；真 X modal 行為待老闆真機確認。真機截圖不進 repo。
