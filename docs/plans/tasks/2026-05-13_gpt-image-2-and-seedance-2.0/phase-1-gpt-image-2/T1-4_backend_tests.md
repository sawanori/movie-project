---
id: T1-4
phase: 1
title: backend テスト追加 (GPT Image 2)
depends_on:
  - T1-2
  - T1-3
estimated_effort: M
files_touched:
  - movie-maker-api/tests/videos/test_openai_gpt_image2_provider.py
---

## 目的

`OpenAIGPTImage2Provider` の全ユニットテストを追加し、CI で全ケース PASS させる。

## 前提

- T1-2 完了 (`OpenAIGPTImage2Provider` 実装済み)
- T1-3 完了 (`service.py` 分岐追加済み)
- `pytest-asyncio` と `unittest.mock.AsyncMock` (または `respx`) が利用可能
- 実 API コール禁止。全 OpenAI 呼び出しをモックすること

## 変更内容

新規ファイル `movie-maker-api/tests/videos/test_openai_gpt_image2_provider.py` を作成する。

参照パターン: `tests/videos/test_text_to_image.py`

### 実装するテストケース (Design Doc §7 仕様通り)

**`test_generate_image_success`**
- `AsyncOpenAI().images.generate` をモック → `data[0].b64_json = "aGVsbG8="` (base64 "hello")
- `app.external.r2.upload_image` をモック → `None` を返す (副作用なし)
- `settings.R2_PUBLIC_URL` をモック → `"https://r2.example"`
- `provider.generate_image(prompt="test", aspect_ratio="9:16")` を呼ぶ
- 戻り値が `"https://r2.example/generated/gpt2_"` で始まる文字列であることを assert

**`test_generate_image_moderation_rejected`**
- `AsyncOpenAI().images.generate` が `openai.BadRequestError` (code=`"content_policy_violation"`) を raise するモック
- `await provider.generate_image(...)` が `ValueError` を raise すること
- `ValueError` メッセージに `"コンテンツポリシー"` が含まれることを assert

**`test_generate_image_org_not_verified`**
- `AsyncOpenAI().images.generate` が `openai.PermissionDeniedError` を raise するモック
- `await provider.generate_image(...)` が `ValueError` を raise すること
- `ValueError` メッセージに `"Org Verification"` が含まれることを assert

**`test_resolve_size_from_aspect_ratio`** (同期テスト可)
- `provider._resolve_size("9:16", None)` → `"1024x1536"`
- `provider._resolve_size("16:9", None)` → `"1536x1024"`
- `provider._resolve_size("1:1", None)` → `"1024x1024"`
- `provider._resolve_size("1:1", "2048x2048")` → `"2048x2048"` (size 直接指定が優先)

**`test_generate_image_rate_limit`**
- `openai.RateLimitError` を raise するモック
- `ValueError` メッセージに `"レート制限"` が含まれることを assert

## 完了条件 (AC)

- [ ] `pytest tests/videos/test_openai_gpt_image2_provider.py -v` で全テスト PASS
- [ ] 5 テストケース全て実装済み
- [ ] 実 API コールが発生していない (ネットワーク呼び出しなし)
- [ ] `pytest tests/videos/ -v` で既存テスト含め失敗増加なし (既知 2 件除く)

## テスト

このタスク自体がテストの追加であるため、追加テストなし。

TDD サイクル: 理想的には T1-2 実装前に RED で書き、T1-2 実装で GREEN にする。本タスクが T1-2 後でも、各テストが GREEN であることを確認する。

## ロールバック

`tests/videos/test_openai_gpt_image2_provider.py` を削除する。

## 参照

- Design Doc §7 (`test_openai_gpt_image2_provider.py` テストケース仕様)
- Design Doc §3.1 (エラーマッピングテーブル)
- `movie-maker-api/tests/videos/test_text_to_image.py` (参照パターン)
