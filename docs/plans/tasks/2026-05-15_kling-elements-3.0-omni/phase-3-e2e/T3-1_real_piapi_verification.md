---
id: T3-1
phase: 3
title: 実 PiAPI API E2E 検証 ($0.50-1.00 課金あり)
depends_on:
  - T1-7
  - T2-5
estimated_effort: M
files_touched: []
---

## 目的

Phase 1+2 の全変更が実際の PiAPI Kling 3.0 Omni API で正しく動作することを確認する。  
`config.service_mode: "public"` と `@image_i` 自動付加が送信 request body に含まれ、  
参照画像の特徴が生成動画に反映されることを目視確認する。

**注意: 実行前にユーザー承認を取得すること ($0.50-1.00/5 秒動画 の課金が発生)**

## 前提

- Phase 1 (T1-1〜T1-7) と Phase 2 (T2-1〜T2-5) が全て完了済み
- PiAPI API KEY が設定済み (`PIAPI_API_KEY` 環境変数)
- `PIAPI_KLING_VERSION=3.0` が設定されている
- 同一キャラクターの写真 3 枚 (例: 正面・横・後ろ) が手元にある
- backend サーバーが起動していること (`uvicorn app.main:app --reload --port 8000`)
- frontend が起動していること (`npm run dev`)

## 検証手順

### ステップ 1: 事前確認 (backend ログ設定)

```bash
# backend ログレベルを DEBUG に設定して起動
cd movie-maker-api
LOG_LEVEL=DEBUG uvicorn app.main:app --reload --port 8000
```

### ステップ 2: ノードエディタ操作

1. ブラウザでノードエディタを開く
2. ProviderNode を追加、`provider: piapi_kling` を選択
3. KlingElementsNode を追加
   - 同一キャラクターの画像 3 枚をアップロード
   - **確認**: ノード上に 4 マスのグリッドで表示され、3 マスが埋まる
   - **確認**: ヒント文「プロンプトに @image_1 を入れると参照位置を明示できます」が表示される
   - **確認**: Provider 警告「⚠ Kling 専用ノードです」が非表示であること
4. PromptNode を追加: `「@image_1 が街を歩く」`
5. ImageInputNode を追加 (ベース画像)
6. GenerateNode を追加して接続
7. GenerateNode を実行

### ステップ 3: backend ログ確認

実行直後の backend ログで以下を確認する。

```bash
# ログから request body を抽出
grep -A 30 "PiAPI Kling request body" /path/to/server.log
```

期待する request body:
```json
{
  "model": "kling",
  "task_type": "omni_video_generation",
  "input": {
    "prompt": "@image_1 が街を歩く @image_1 @image_2 @image_3",
    "duration": 5,
    "aspect_ratio": "9:16",
    "version": "3.0",
    "images": ["<url1>", "<url2>", "<url3>"]
  },
  "config": {
    "service_mode": "public"
  }
}
```

> **注意**: ユーザーが `@image_1` を明示記載した場合は自動付加されない (`@image_1 が街を歩く` のまま)。  
> 自動付加テストには `@image_i` を含まないプロンプト (例: 「街を歩く」) を使うこと。

### ステップ 4: 動画生成完了確認

1. GenerateNode のステータスが `completed` になるまで待機 (約 1-2 分)
2. 動画 URL が R2 に保存されることを確認
3. 動画を再生し、参照画像の人物の顔・服装の一貫性を目視確認

### ステップ 5: 既存リグレッション確認 (Elements 不使用)

`element_images` を指定しないで動画生成が正常に動作することを確認する。

1. KlingElementsNode を **接続せず** に GenerateNode を実行
2. 単一画像 (`images: [image_url]`) のみで request が送信されることをログで確認
3. 動画が正常に生成されることを確認

## 完了条件 (AC)

- [ ] backend ログで request body に `config.service_mode: "public"` が含まれていることを確認
- [ ] backend ログで `input.prompt` 末尾に `@image_1 @image_2 @image_3` が自動付加されていることを確認 (`@image_i` を含まないプロンプト使用時)
- [ ] `input.images` に 3 枚の element_images URL が格納されていることを確認
- [ ] 生成動画の視聴: 参照画像の人物の顔・服装の特徴が動画に反映されていること (目視確認)
- [ ] リグレッション確認: Elements 不使用時 (`element_images` なし) に `input.images: [image_url]` (単一) で動画生成が完了すること
- [ ] エラーなく task_id が返り、約 1-2 分後に動画 URL が生成されること

## ロールバック

E2E テストは読み取り専用 (API 送信のみ)。コード変更がないためロールバック不要。  
API 課金が発生した場合は PiAPI ダッシュボードで確認する。

## 参照

- Design Doc §12 ステップ 3: E2E 確認 (実 PiAPI 課金あり)
- Design Doc §3-2: 修正前後の request body 差分
- Design Doc §4-2: 公式サンプル request body (期待値の参考)
- Design Doc §14: リスク — PiAPI Kling 3.0 Omni のクォータ/料金
