---
id: T2-8
phase: 2
title: Phase 2 動作確認 (Seedance 2.0)
depends_on:
  - T2-3
  - T2-4
  - T2-5
  - T2-6
  - T2-7
estimated_effort: S
files_touched: []
---

## 目的

Seedance 2.0 の E2E 動作確認を行い、Phase 2 マージ条件を全て満たすことを検証する。コード変更は行わない。

## 前提

- T2-1 〜 T2-7 が全て完了していること
- ローカル FastAPI サーバーが起動できること
- `.env` に `PIAPI_API_KEY` が設定済みであること
- `.env` の `VIDEO_PROVIDER` を `seedance` に変更してテストすること (テスト後に元の値に戻す)
- `GATEWAY_ENABLED=false` であること

## 変更内容

コード変更なし。手動検証のみ。

## 完了条件 (AC)

### バックエンド検証

- [ ] `pytest tests/videos/test_piapi_seedance_provider.py -v` 全ケース PASS
- [ ] `pytest tests/ -v` で既存テスト失敗が増加していない (既知 2 件除く)
- [ ] `.env` の `VIDEO_PROVIDER=seedance` でサーバー起動し、`POST /api/v1/videos` にリクエストを送ると:
  - タスクが作成される (HTTP 202 または 200 が返る)
  - PiAPI ダッシュボード (`https://piapi.ai/`) でタスクが `Processing` または `Completed` 状態になる
  - タスク完了後に `video_url` が MP4 URL で返ってくる

### GATEWAY 安全性確認

- [ ] `GATEWAY_ENABLED=false` 設定のまま FastAPI を起動しても `gateway_init.py` の Seedance 登録ブロックがエラーを出さない
- [ ] `GATEWAY_ENABLED=false` 時に通常の `VIDEO_PROVIDER` による動画生成が引き続き動作する

### フロントエンド検証

- [ ] `http://localhost:3000` の動画生成 UI に "Seedance 2.0" が選択肢として表示される
- [ ] `getCameraSupportLevel('*', 'seedance')` が `'prompt'` を返すため、カメラワーク選択 UI が適切に動作する

## テスト

手動 E2E テスト (上記 AC チェックリスト実施)。自動テストは T2-6 で完了。

## ロールバック

動作確認のみのため、ロールバック操作は T2-1 〜 T2-7 の各タスクのロールバック手順に従う。テスト用に変更した `.env` の `VIDEO_PROVIDER` を元の値に戻すこと。

## 参照

- Design Doc §9 (Phase 2 マージ条件)
- Design Doc §1 (出荷完了の定義 — Phase 2)
- Design Doc §11 (リスク: PiAPI ピーク時間帯遅延、task_type 名称変更)
