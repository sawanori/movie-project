---
id: T3-1
phase: 3
title: "E2E 手動確認 — Hedra 実 API 使用 (課金 $0.10-0.20)"
depends_on:
  - T2-5
estimated_effort: M
files_touched: []
---

## 目的

Phase 1 + Phase 2 の実装を実際の Hedra API で end-to-end 検証する。§1「出荷完了の定義」を満たすことを確認する。**実 API 課金あり (1 回 $0.10-0.20) のため、実行前にユーザー承認を得ること。**

## 前提

- T2-5 (FE 単体テスト) 含む Phase 1+2 全タスク完了済
- `HEDRA_API_KEY` が `movie-maker-api/.env` に設定済で有効であること
- `LIP_SYNC_PROVIDER` が `"hedra"` に設定済であること (Design Doc §4)
- 開発サーバーが起動済であること:
  - `movie-maker-api/`: `uvicorn app.main:app --reload --port 8000`
  - `movie-maker/`: `npm run dev`
- テスト用動画が準備済であること:
  - **顔あり動画**: キャラクターの顔が正面からはっきり映る 5-10 秒の mp4 (R2 またはローカルサーバーで公開)
  - **顔なし動画**: 風景や物体のみで顔が映らない mp4 (エラー確認用)

## 確認内容

### シナリオ 1: useLipSync=true でリップシンク成功

1. ノードエディタを開き、GenerateNode の動画出力を DialogueNode の入力に接続する
2. DialogueNode でセリフテキストと声を設定する
3. 「口を動かす (リップシンク)」チェックボックスを **ON** にする
4. 「リップシンク合成する」ボタンを押す
5. ステータス表示が `pending` → `processing` → `completed` に遷移することを確認
6. 処理中に「(1-3 分かかります)」が表示されることを確認
7. 完了後、出力動画 URL が設定されることを確認
8. 動画を再生してキャラが口を動かしていることを目視確認

**期待結果**:
- 1-3 分以内に completed になる
- 出力動画でキャラの唇が音声に合わせて動く
- Supabase `dialogue_generations` テーブルに `use_lip_sync=true`, `lip_sync_generation_id` (UUID) が記録されている

### シナリオ 2: useLipSync=true で顔検出失敗 → 日本語エラー

1. 顔が映らない動画 (風景等) を GenerateNode 代わりに ImageInput や VideoInput で用意し接続する
2. 「口を動かす (リップシンク)」チェックボックスを ON にして実行する
3. ステータスが `failed` になることを確認
4. DialogueNode 上に日本語エラーメッセージが表示されることを確認

**期待結果**:
- エラーメッセージに「動画から顔を検出できませんでした。キャラの顔がはっきり映る動画を使ってください」が含まれる

### シナリオ 3: useLipSync=false (既存動作の回帰確認)

1. 「口を動かす (リップシンク)」チェックボックスを **OFF** にして実行する
2. 処理が 5-10 秒以内に完了することを確認
3. 出力動画が ffmpeg ミックスで生成されることを確認

**期待結果**:
- 従来通りの ffmpeg ミックス動画が出力される
- `dialogue_generations` テーブルの `use_lip_sync=false`, `lip_sync_generation_id=NULL`

## 完了条件 (AC)

- [ ] シナリオ 1: チェックボックス ON で実行し、1-3 分後に completed になること
- [ ] シナリオ 1: 出力動画でキャラが口を動かしていることを目視で確認できること
- [ ] シナリオ 1: Supabase で `dialogue_generations.lip_sync_generation_id` が UUID 値で記録されていること:
  ```sql
  SELECT id, use_lip_sync, lip_sync_generation_id, status
  FROM dialogue_generations
  WHERE use_lip_sync = true
  ORDER BY created_at DESC LIMIT 3;
  ```
- [ ] シナリオ 2: 顔なし動画で日本語エラー「動画から顔を検出できませんでした...」が表示されること
- [ ] シナリオ 3: チェックボックス OFF で従来の ffmpeg 経路が 10 秒以内に完了すること
- [ ] Design Doc §1 の出荷完了の定義を満たすこと:
  「DialogueNode で useLipSync チェックボックスを ON にし、GenerateNode の動画 URL を接続して実行ボタンを押すと、Hedra 経由でリップシンクされた動画 URL が DialogueNode の出力 Handle から下流に流れる。OFF の場合は従来通り ffmpeg ミックスのみが動く。」

## テスト

手動 E2E のみ。自動化は Follow-up (Design Doc §11-1)。

処理時間の記録 (参考値):
- シナリオ 1 開始時刻: ___
- completed 到達時刻: ___
- 合計処理時間: ___ 分

バックエンドタイムアウト確認:
- 既存 `PROCESSING_TIMEOUT_SECONDS=600` (10 分) で収まった場合: 変更不要
- 合計が 10 分を超えた場合: `movie-maker-api/app/core/config.py` の設定値を 900 に変更する PR を別途作成

## ロールバック

Phase 1+2 のタスクを個別にロールバックする (各タスクの「ロールバック」手順参照)。E2E タスク自体にロールバック対象ファイルはない。

## 参照

- Design Doc §1 出荷完了の定義
- Design Doc §8-3 E2E 確認 (実 API 課金あり)
- Design Doc §10-3 ステップ 3 完了条件 (L1 検証)
- Design Doc §10-4 統合ポイント定義 (ステップ 3 完了時の期待状態)
- Design Doc §13 リスク「バックエンドタイムアウト超過」(実 E2E で計測)
