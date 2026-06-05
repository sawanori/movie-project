# Implementation Plan: PiAPI Kling lip_sync プロバイダー（Hedra 代替）

## 1. Overview

リップシンク（口パク合成）機能の新しいバックエンドプロバイダーとして、PiAPI の Kling `lip_sync` タスクを実装する。既存の `LipSyncProviderInterface` を実装した `PiAPIKlingLipSyncProvider` を追加し、ファクトリ `get_lip_sync_provider` に登録、`LIP_SYNC_PROVIDER` を `piapi_kling` に切り替える。これによりリップシンクスタジオ（`/generate/lip-sync`）と DialogueNode の「口を動かす」の両方が、既存の `PIAPI_API_KEY` だけで（Hedra アカウントなしで）動作する。

## 2. Goal

- ユーザーゴール: 動画キャラクターにセリフ（音声）を付けて口を動かした動画を生成できる。
- ビジネスゴール: 未設定の Hedra（有料・別アカウント）に依存せず、既に契約済みの PiAPI 残高でリップシンクを提供し、機能の即時利用を可能にする。

## 3. Current State

- リップシンク抽象: `movie-maker-api/app/external/lip_sync_provider.py`
  - `LipSyncProviderInterface`: `provider_name`（property）, `generate_lip_sync(source_url, audio_url, source_type="image") -> str`, `check_status(task_id) -> LipSyncStatus`, `get_video_url(task_id) -> Optional[str]`
  - `LipSyncStatus(status, progress, video_url, error_message)`、status は `"pending"|"processing"|"completed"|"failed"`
  - `get_lip_sync_provider(provider_name=None)`: 現状 `"hedra"` のみ分岐。未指定時は `settings.LIP_SYNC_PROVIDER`（既定 `"hedra"`）。
- 既存実装: `app/external/hedra_provider.py`（参考。`/v1/characters` 作成・`/v1/projects/{id}` ポーリング。`HEDRA_API_KEY` 未設定で「Illegal header value b'Bearer '」になり使用不可）
- PiAPI 認証・タスク参考: `app/external/piapi_kling_provider.py`
  - base: `https://api.piapi.ai/api/v1`、作成 `POST /task`、状態 `GET /task/{task_id}`
  - 認証ヘッダ: `_get_headers()` → `{"x-api-key": PIAPI_API_KEY, "Content-Type": "application/json"}`
  - 作成レスポンス: `result["data"]["task_id"]`
  - 状態レスポンス: `result["data"]["status"]`（小文字: completed/processing/pending/staged/failed）、出力は `data["output"]`（`output["video_url"]` または `output["works"][0]["video"]["url"]/["resource"]` など複数パターン）、失敗時 `data["error"]["message"]`
- 処理タスク: `app/tasks/lip_sync_processor.py`
  - `provider_name = record.get("provider", "hedra")`（DB レコードの `provider` を使用）→ `get_lip_sync_provider(provider_name)` → `generate_lip_sync(source_url, audio_url, source_type)` → `check_status` ポーリング
- レコード生成: `app/lip_sync/service.py` `create_lip_sync_generation(provider: str = "hedra")` が `lip_sync_generations.provider` に保存
- 呼び出し元はいずれも `provider` 未指定（= 既定 `"hedra"`）:
  - `app/lip_sync/router.py:44`（リップシンクスタジオ API）
  - `app/tasks/dialogue_processor.py:282`（DialogueNode の use_lip_sync=True）
- 設定: `app/core/config.py` に `PIAPI_API_KEY`（設定済み）, `HEDRA_API_KEY`（空）, `LIP_SYNC_PROVIDER = "hedra"`
- 既存テスト: `tests/external/test_hedra_provider.py`, `tests/tasks/test_lip_sync_processor.py`, `tests/lip_sync/*`

## 4. Scope

- `PiAPIKlingLipSyncProvider`（`LipSyncProviderInterface` 実装）の新規作成。
- `get_lip_sync_provider` に `"piapi_kling"` 分岐を追加。
- `create_lip_sync_generation` の `provider` 既定を `settings.LIP_SYNC_PROVIDER` 由来にし、両呼び出し元（router / dialogue_processor）で設定値が使われるようにする。
- `LIP_SYNC_PROVIDER` を `piapi_kling` に切替（config 既定 + `.env`）。
- `source_type="image"` 時は Kling lip_sync 非対応として明確な日本語エラーを送出。
- 新プロバイダーの単体テスト追加（generate / check_status / get_video_url / image 非対応 / API エラー）。

## 5. Non-Scope

- Hedra プロバイダーの削除（将来の選択肢として残す。空キーガードは既に追加済み）。
- Hedra 連携の新 API（X-API-Key 系）への移行。
- フロントエンドの大規模変更（静止画非対応の注意書きは任意・別タスク）。
- TTS 直指定（`tts_text/tts_timbre/tts_speed`）モードの実装（本アプリは TTS で audio_url を生成済みのため `local_dubbing_url` を使う。TTS 直指定は非スコープ）。
- 新規 DB マイグレーション（`lip_sync_generations.provider` は既存カラムを利用）。
- gateway / model_registry 経由のルーティング統合。

## 6. Assumptions

- PiAPI Kling lip_sync の作成・状態取得レスポンス構造は既存 `piapi_kling_provider.py`（`data.task_id` / `data.status` / `data.output`）と同一フォーマットである。
- `lip_sync_generations` テーブルに `provider`（text）カラムが存在し、`"piapi_kling"` 値を許容する（CHECK 制約がない、または許容している）。制約があれば別途緩和が必要（実装時に確認）。
- カスタム音声は `local_dubbing_url` に MP3 URL を渡す方式で機能する。アプリの TTS / アップロード音声は R2 上の公開 URL（MP3 等）として渡せる。
- Kling lip_sync は「顔が明瞭・安定して大半のフレームに映っている動画」を要求する。素材要件を満たさない場合は PiAPI 側がエラーを返す（その文言は既存 Kling のエラー変換に倣って日本語化）。
- 料金は約 $0.1/5秒。残高不足時は PiAPI が credit/balance エラーを返す。

## 7. Architecture Impact

- フロントエンド: 変更なし（既存のリップシンクスタジオ・DialogueNode はプロバイダー抽象経由で動作）。任意で静止画非対応の注意文言追加余地あり（非スコープ）。
- バックエンド: `external/` に新プロバイダー1ファイル追加、`lip_sync_provider.py`（ファクトリ）・`lip_sync/service.py`（既定 provider）・`config.py`（既定値）を修正。
- データベース: スキーマ変更なし（既存 `provider` カラム利用）。`provider` 値として `"piapi_kling"` を書き込む。
- 認証: 影響なし（API 認証は既存どおり）。プロバイダー認証は `PIAPI_API_KEY`。
- ストレージ: 影響なし（生成結果 URL は既存どおり処理）。
- インフラ: 影響なし。`.env` の `LIP_SYNC_PROVIDER` を更新しサーバー再起動。

## 8. UI Plan

本機能はバックエンドのプロバイダー差し替えのため、UI 変更は必須ではない。

- ページ: `/generate/lip-sync`（既存）。状態（processing/ progress / 結果動画）は既存のポーリング表示をそのまま利用。
- 任意（非スコープ）: ソースタイプが「画像」の場合に「現在のリップシンクエンジン（Kling）は動画のみ対応」と注記する。レスポンシブ要件は既存準拠。

## 9. API Plan

新規 API エンドポイントは追加しない。外部 API（PiAPI）呼び出しを新プロバイダー内に実装する。

- 作成: `POST https://api.piapi.ai/api/v1/task`
  - headers: `{"x-api-key": PIAPI_API_KEY, "Content-Type": "application/json"}`
  - body: `{"model": "kling", "task_type": "lip_sync", "input": {"video_url": <source_url>, "local_dubbing_url": <audio_url>}}`
  - 成功: `result["data"]["task_id"]` を返す
- 状態: `GET https://api.piapi.ai/api/v1/task/{task_id}`
  - `result["data"]["status"]`（小文字）を内部 `LipSyncStatus.status` にマッピング（completed→completed / processing→processing / pending,staged→pending / failed→failed）
  - 完了時の `video_url` を `data["output"]` から抽出（`video_url` / `works[0].video.url|resource` 等、既存 Kling と同じ多パターン対応）
  - 失敗時 `data["error"]["message"]` を日本語化（credit/balance, rate/limit, timeout, preprocess 等は既存 Kling の変換に倣う）
- バリデーション/エラー処理:
  - `source_url` 空 → `ValueError("source_url must not be empty")`
  - `source_type != "video"` → `ValueError("Kling リップシンクは動画ソースのみ対応しています（静止画は非対応）...")`
  - `PIAPI_API_KEY` 未設定 → 既存 Kling 同様に初期化時 `ValueError`
  - HTTP エラー → ログ出力の上、`Exception` を送出（`lip_sync_processor` が failed として error_message を保存）

## 10. Database Plan

- スキーマ変更なし。既存 `lip_sync_generations.provider`（text）に `"piapi_kling"` を保存。
- 制約確認: `provider` カラムに CHECK 制約（許可値リスト）があれば `"piapi_kling"` を許可するよう緩和が必要。実装時に `list_tables` 等で確認し、制約があれば `docs/migrations/` にマイグレーションを追加（その場合のみ Non-Scope から昇格、計画を更新）。
- インデックス・トリガー変更なし。

## 11. File-by-File Plan

| ファイル | 区分 | 目的 | 想定変更 | リスク |
|---|---|---|---|---|
| `movie-maker-api/app/external/piapi_kling_lipsync_provider.py` | 作成 | PiAPI Kling lip_sync プロバイダー | `LipSyncProviderInterface` を実装。`_get_headers`（x-api-key）、`generate_lip_sync`（POST /task, task_type=lip_sync, video_url+local_dubbing_url）、`check_status`（GET /task/{id}, status/出力/エラー解析）、`get_video_url`。image 非対応エラー、PIAPI_API_KEY 未設定ガード。 | 中 |
| `movie-maker-api/app/external/lip_sync_provider.py` | 変更 | ファクトリ登録 | `get_lip_sync_provider` に `if provider_name == "piapi_kling": return PiAPIKlingLipSyncProvider()` を追加（既存 hedra 分岐は残す） | 低 |
| `movie-maker-api/app/lip_sync/service.py` | 変更 | 既定 provider を設定値に | `create_lip_sync_generation` の `provider` 既定を `settings.LIP_SYNC_PROVIDER` 由来に変更（呼び出し元が未指定でも設定値が反映されるように） | 中 |
| `movie-maker-api/app/core/config.py` | 変更 | 既定プロバイダー切替 | `LIP_SYNC_PROVIDER` の既定を `"piapi_kling"` に変更 | 低 |
| `movie-maker-api/.env` | 変更 | 実環境切替 | `LIP_SYNC_PROVIDER=piapi_kling` を設定（または追記） | 低 |
| `movie-maker-api/tests/external/test_piapi_kling_lipsync_provider.py` | 作成 | 新プロバイダーの単体テスト | httpx をモックして generate/check_status/get_video_url/image非対応/APIエラー を検証 | 低 |
| `movie-maker-api/tests/lip_sync/test_lip_sync_service.py` | 変更（必要時） | 既定 provider 変更の追従 | provider 既定が設定値になったことで既存アサーション（"hedra" 前提）が壊れる場合に修正 | 低 |

## 12. Implementation Order

1. task_001: `PiAPIKlingLipSyncProvider` 実装（+ ファクトリ登録）
2. task_002: 新プロバイダーの単体テスト追加
3. task_003: 既定 provider を `settings.LIP_SYNC_PROVIDER` 由来にする（service.py）＋ 既存テスト追従
4. task_004: `config.py` 既定 + `.env` を `piapi_kling` に切替、`provider` カラム制約の確認
5. task_005: 全体回帰（lip_sync 関連 + external + tasks のテスト）

## 13. Verification Commands

リポジトリに存在するコマンドのみ（`movie-maker-api/` で実行）:

- `make test`（= pytest, `pytest.ini`、asyncio_mode=auto）
- `pytest tests/external/test_piapi_kling_lipsync_provider.py -v`
- `pytest tests/external/test_hedra_provider.py tests/tasks/test_lip_sync_processor.py tests/lip_sync -q`

（フロント変更を行わないため frontend のコマンドは対象外）

## 14. Acceptance Criteria

- `get_lip_sync_provider("piapi_kling")` が `PiAPIKlingLipSyncProvider` を返す。
- `generate_lip_sync(video_url, audio_url, source_type="video")` が `POST /task`（model=kling, task_type=lip_sync, input に video_url と local_dubbing_url）を送り、`data.task_id` を返す（httpx モックで検証）。
- `check_status` が PiAPI の status を `LipSyncStatus`（pending/processing/completed/failed）に正しくマッピングし、完了時に `video_url` を抽出する。
- `source_type="image"` で `generate_lip_sync` を呼ぶと、分かりやすい `ValueError`（静止画非対応）になる。
- `LIP_SYNC_PROVIDER=piapi_kling` のとき、リップシンクスタジオ API と DialogueNode が新プロバイダーで動作する（レコードの `provider` が `"piapi_kling"` になる）。
- 既存テストが壊れない（必要な追従修正のみ）。新プロバイダーのテストが pass。
- Hedra 関連コードは残存し、`LIP_SYNC_PROVIDER=hedra` で従来どおり選択可能。

## 15. Repair Loop

1. 検証コマンド（§13）を実行する。
2. エラーを採取する。
3. エラーを task_id に対応づける（例: 状態解析エラー → task_001、既定 provider 起因の既存テスト失敗 → task_003）。
4. 関連ファイルのみ修正する。
5. 検証を再実行する。
6. 実装が計画と乖離した場合は本計画と `docs/task-list.json` を更新する。
