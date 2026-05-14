---
id: T3-1
phase: 3
title: "E2E 手動確認 — 実 API で TTS ミックス → R2 保存 → UI 表示"
depends_on:
  - T1-5
  - T2-6
estimated_effort: S
files_touched: []
---

## 目的

Phase 1 + Phase 2 が完全に動作することを実環境で確認する。コード変更はなし。
ElevenLabs / OpenAI TTS を実際に呼び出すため **TTS API 課金が発生する**。
実行前にユーザー承認を得ること。

## 前提

- Phase 1 (T1-1〜T1-5) が全て完了していること
- Phase 2 (T2-1〜T2-6) が全て完了していること
- バックエンドサーバーが本番またはステージング環境で稼働していること
- フロントエンドが本番またはローカル開発環境で稼働していること
- `dialogue_generations` テーブルが Supabase 上に存在すること
- 課金発生の承認を得ていること

## E2E 検証手順

### ステップ 1: 事前準備

1. バックエンドの起動確認
   ```
   GET /api/v1/tts/voices → 200 (声リストが返ること)
   ```
2. ノードエディタを開き、パレットに「セリフ (TTS)」エントリが表示されることを確認
3. `Mic` アイコンが表示されていることを確認

### ステップ 2: 動画生成 (GenerateNode)

1. GenerateNode (Seedance またはその他) をキャンバスに配置
2. プロンプトを入力して動画を生成
3. GenerateNode の `videoUrl` が設定され、ノードが `completed` 状態になることを確認

### ステップ 3: DialogueNode の配置と接続

1. パレットから「セリフ (TTS)」を探し、キャンバスにドラッグ&ドロップ
2. GenerateNode の出力 Handle → DialogueNode の入力 Handle を接続
3. 接続線が表示されることを確認

### ステップ 4: セリフ入力と実行

1. DialogueNode のテキストエリアに日本語セリフを入力 (例: 「こんにちは。私はAIが生成したキャラクターです。」)
2. 声ドロップダウンから声を選択
3. 速度は 1.0 のまま
4. 注意書き「※ 口の動きは合成しません (TTS のみ)」が表示されていることを確認
5. 実行ボタンを押す

### ステップ 5: 処理中の確認

1. ノードが `processing` 状態になり、Loader2 アイコンが表示されることを確認
2. Supabase で `dialogue_generations` テーブルにレコードが作成されていることを確認
   - `status = 'processing'`
3. バックエンドログで TTS 呼び出しが行われていることを確認

### ステップ 6: 完了確認

1. 最大 15 分以内に DialogueNode が `completed` 状態になることを確認
2. CheckCircle アイコンが表示されることを確認
3. Supabase で以下を確認:
   - `status = 'completed'`
   - `output_video_url` が R2 の URL になっている
4. `output_video_url` の URL を直接ブラウザで開き、動画が再生されることを確認
5. 動画に TTS 音声が含まれていることを確認
6. **元動画の既存音声が保持されつつ、セリフ音声が重ね合わされていることを目視確認**

### ステップ 7: エラーケース確認 (任意)

1. 動画未接続で実行 → エラーメッセージ「動画ノードを接続してください」が表示される
2. セリフなしで実行 → エラーメッセージ「セリフと声を入力してください」が表示される
3. 5001 文字以上のセリフ → バリデーションエラーが表示される

## 完了条件 (AC)

- [ ] パレットに「セリフ (TTS)」が Mic アイコンとともに表示される
- [ ] DialogueNode がキャンバスに配置でき、GenerateNode と接続できる
- [ ] 実行ボタン押下後、`dialogue_generations` レコードが作成される
- [ ] 最大 15 分以内に `status = 'completed'` になる
- [ ] `output_video_url` が R2 上の有効な URL になっている
- [ ] R2 の動画 URL をブラウザで開くと動画が再生される
- [ ] 元動画の音声が保持され、TTS セリフ音声が重なって聞こえる
- [ ] DialogueNode の UI が `completed` + CheckCircle を表示する
- [ ] 元動画に音声トラックがない場合のフォールバック動作確認 (可能であれば)

## テスト

コード変更なし。上記手順を手動実行する。

問題が発生した場合のデバッグ手順:
1. バックエンドログを確認 (`stderr` / `stdout` のエラーログ)
2. Supabase で `dialogue_generations` テーブルの `status`, `error_message` を確認
3. `tts_generations` テーブルで TTS の中間ステータスを確認

## ロールバック

コード変更がないため、ロールバックなし。
Supabase のテストデータ (dialogue_generations レコード) は必要に応じて手動削除する。

## 参照

- Design Doc §13 Phase 3 完了条件 (L1)
- Design Doc §3 (シーケンス図 — 全体フロー)
- Design Doc §10 (エラーハンドリング — 元動画に音声なしケース)
- Design Doc §15 (リスク — 連続実行による課金リスク)
