---
id: T1-6
phase: 1
title: Phase 1 動作確認 (GPT Image 2)
depends_on:
  - T1-3
  - T1-4
  - T1-5
estimated_effort: S
files_touched: []
---

## 目的

GPT Image 2 の E2E 動作確認を行い、Phase 1 マージ条件を全て満たすことを検証する。コード変更は行わない。

## 前提

- T1-1 〜 T1-5 が全て完了していること
- ローカル FastAPI サーバーが起動できること (`uvicorn app.main:app --reload --port 8000`)
- `.env` に `OPENAI_API_KEY` が設定済みかつ OpenAI Org Verification 完了済みであること

## 変更内容

コード変更なし。手動検証のみ。

## 完了条件 (AC)

### バックエンド検証

- [ ] `pytest tests/videos/test_openai_gpt_image2_provider.py -v` 全ケース PASS
- [ ] `pytest tests/ -v` で既存テスト失敗が増加していない (既知 2 件除く)
- [ ] Swagger UI (`http://localhost:8000/docs`) の `POST /api/v1/videos/generate-image` に `openai_gpt_image2` を指定してリクエストを送ると:
  - HTTP 200 が返る
  - レスポンスの `image_url` が `https://<R2_PUBLIC_URL>/generated/gpt2_` で始まる R2 URL である
  - R2 上にファイルが実際に存在する (URL を直接ブラウザで開いて画像が表示される)

### エラーシナリオ検証

- [ ] 不正なプロンプト (コンテンツポリシー違反の内容) を送信すると、エラーメッセージに `"コンテンツポリシー"` が含まれる日本語エラーが返る

### フロントエンド検証

- [ ] `http://localhost:3000` の画像生成 UI に "GPT Image 2 (OpenAI)" が選択肢として表示される
- [ ] 選択すると構造化入力フォームが非表示になる (`supportsStructuredInput: false`)

## テスト

手動 E2E テスト (上記 AC チェックリスト実施)。自動テストは T1-4 で完了。

## ロールバック

動作確認のみのため、ロールバック操作は T1-1 〜 T1-5 の各タスクのロールバック手順に従う。

## 参照

- Design Doc §9 (Phase 1 マージ条件)
- Design Doc §1 (出荷完了の定義 — Phase 1)
- Design Doc §11 (リスク: OpenAI Org Verification 未完了)
