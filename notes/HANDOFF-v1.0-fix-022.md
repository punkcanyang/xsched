# HANDOFF v1.0/fix-022（0.2.2）

- 範圍：拿掉「明天 12:30」快速時段（發文框快速列＋浮層）。詳見 AGENTS.md「0.2.2 小修」。
- 根因：未確認。合成 fixture 與既有 12 PM／:30 測試全部通過；需真機失敗時的「複製診斷」。
- 實作：`quick.js` `VISIBLE_SLOT_IDS`；`composer.js` 列與點擊白名單、`content.js` 浮層按鈕與標籤共用此清單。`nextSlot('lunch')` 保留給測試。
- 遷移：無已存的時段設定，按鈕依固定清單重畫；不動 storage key。
- 測試：UI 斷言 5→4 顆、點 12:30 改點其他時段（強度不變）；12:30 證據改用直接呼叫 `fillSlotResult(document,'lunch')`。
- 摘要：COMPOSER_SOURCE_SHA256、QUICK_SOURCE_SHA256、AUTHOR_CONTENT_SHA256 更新；verify 規則不變。
