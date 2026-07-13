# Implementation Plan: 動画→プロンプト逆算（Video-to-Prompt リバースエンジニアリング）

作成日: 2026-06-13
着想元: OSS `prompt-lens` (github.com/raojiacui/prompt-lens, MIT)
関連調査: 会話内で実施済み（prompt-lens の analyzer.ts / analyze route と movie-maker 既存資産の対応を確認）

> 注: 本ファイルは直前まで「PiAPI Kling lip_sync プロバイダー」計画で使われていたが、当該機能は完了済み（git 履歴に保存）。本計画で上書き更新する。

## 1. Overview

ユーザーが「気に入ったAI動画」をアップロードすると、サーバーが等間隔キーフレームを抽出し、Vision LLM（Gemini 2.5-Flash）で「その動画を生成し得るプロンプト」を逆算し、6次元の**構造化中間表現（JSON）**として返す。ユーザーはそれを画面で確認・編集し（Phase A）、ワンクリックで既存のワンシーン生成フロー（`/generate/story`）にプリフィルして再生成できる（Phase B）。これにより「分析→改変→再生成」の創作閉ループを movie-maker 単体で完結させる。

prompt-lens から借りるのは**コードではなくプロンプト設計**（6次元逆算テンプレートとキーフレーム抽出戦略）。実装は movie-maker の既存資産（フレーム抽出・Gemini連携・生成フロー）の組み替えで行い、新規開発を最小化する。

## 2. Goal

- ユーザー目標: 参考にしたいAI動画から、再生成に使えるプロンプトを数十秒で得て、自分の素材として改変・再生成できる。
- ビジネス目標: prompt-lens 的な逆算機能を、外部生成API任せにせず movie-maker の内蔵生成パイプラインに直結させ、「分析から制作まで1サービスで完結」を差別化価値にする。ショートドラマのカット制作の起点として使う。

## 3. Current State

再利用可能な既存資産（すべて実在を確認済み）:

- `app/services/video_analyzer.py`
  - `VideoAnalyzer._extract_frames(video_path, output_dir, num_frames=4) -> list[str]`: ffmpeg で N 等間隔キーフレームを抽出。`num_frames` 引数で枚数可変。現状は BGM 分析用途。
  - `VideoAnalyzer._analyze_with_gemini(frames_base64, duration, num_cuts) -> dict`: base64 フレーム群を Gemini 2.5-Flash に投げ、JSON を受けて Markdown コードブロック除去＋パースするパターンを持つ。
- `app/external/gemini_client.py`
  - `analyze_image_for_base_prompt(image_url) -> str`、`generate_storyboard_prompts(...)`、`_extract_prompt_components(...)` 等、Gemini への画像/テキスト投入と構造化抽出の実装パターンが揃っている。Gemini SDK は `from google import genai`、画像は `types.Part.from_bytes(data=..., mime_type="image/jpeg")`。
- `app/videos/router.py`
  - `POST /api/v1/videos/upload-video-raw`: 動画アップロード（MP4/WebM/MOV、最大500MB/300秒、R2保存、ffprobe検証、`{video_url, thumbnail_url, duration}` を返す）。背景削除機能で使用中。
  - `POST /api/v1/videos/storyboard/translate-scene`、`createStoryVideo` 系の生成導線が存在。
- `app/videos/schemas.py`: `StoryboardSceneBase`（scene_number/act/description_ja/runway_prompt/camera_work/mood/duration_seconds/scene_image_url/generation_seed）等。
- フロント `app/generate/story/page.tsx`（ワンシーン生成、= Phase B の繋ぎ先）:
  - `japanesePrompt` state にユーザーが日本語プロンプトを入力
  - `videosApi.translateStoryPrompt({ description_ja, video_provider, subject_type, camera_work, ... })` で英語化
  - `videosApi.createStoryVideo({ story_text: englishPrompt, ... })` で動画生成
- フロント `lib/api/client.ts`（`fetchWithAuth`、`videosApi`、FormData アップロード規約）、`components/video/user-video-uploader.tsx`（react-dropzone + 検証）、`components/layout/header.tsx`（認証時ナビ）。

現状、これらは「テキスト→動画」の順方向にしか使われておらず、「動画→プロンプト」の逆方向の導線・逆算プロンプト・中間表現スキーマは存在しない。

## 4. Scope

### Phase A（必須）— 逆算して構造化中間表現を返す + 表示・編集UI
- バックエンド: `POST /api/v1/videos/analyze-prompt`。入力は `video_url`（既存 upload-video-raw でR2に上げたURL）。処理: R2から動画取得 → 8枚キーフレーム抽出 → Gemini 逆算 → **構造化中間表現 JSON** を返す（同期処理）。
- バックエンド: 逆算用システムプロンプト（日本語・6次元）を新設し、Gemini に JSON で返させる関数を `gemini_client.py` に追加。
- バックエンド: 中間表現の Pydantic スキーマ（`ReversePromptResult`）。
- フロント: `/generate/reverse` ページ。動画アップロード（既存 uploader 流用）→ 分析実行 → 6次元の結果を表示、各フィールド編集可、`core_prompt` コピー可。
- フロント: `lib/api/client.ts` に `analyzePrompt` 追加、ナビに導線追加。

### Phase B（必須）— 再生成フローへ繋ぐ変換アダプタ
- フロント: 中間表現 → 日本語プロンプト文字列に組み立てる変換アダプタ（`lib/reverse-prompt/to-japanese-prompt.ts`）。
- フロント: 結果画面に「このプロンプトで生成」ボタン → 変換結果を `/generate/story` にプリフィル遷移（sessionStorage 経由）。`app/generate/story/page.tsx` 側でプリフィル値を読んで `japanesePrompt` を初期化。
- **バックエンドの生成系改修は不要**（既存の translateStoryPrompt → createStoryVideo フローをそのまま使う）。

## 5. Non-Scope

- 長尺動画のショット自動分割→各ショット逆算（将来拡張。初期は単一クリップ〜8秒前提の単一分析のみ）。
- 音声分析（prompt-lens の audio-analyze 相当）。
- 「種寄り」用途の専用UI（スタイル/カメラだけ抽出して4シーン絵コンテに展開）。中間表現は6次元分離保持して将来繋げられる形にするが、専用導線は作らない。
- 逆算結果の履歴保存・履歴ページ（DBテーブル追加なし）。
- 逆算結果の英語プロンプト直接生成（Phase B は既存の translateStoryPrompt に日本語を渡して英語化させる。逆算側で英語化はしない）。
- batch 専用モードのUI切替（バックエンドは複数フレームをまとめて1回分析する「batch相当」を既定動作とし、prompt-lens のような single/batch のUI切替は設けない）。

## 6. Assumptions

- 入力動画は事前に `POST /api/v1/videos/upload-video-raw` で R2 にアップロード済みで、その `video_url` を `analyze-prompt` に渡す（アップロードと分析を2段に分ける。既存アップロード資産を流用しUIを統一するため）。
- 8フレーム抽出 + Gemini 1回 の処理時間は概ね 20〜60 秒。**同期エンドポイント**で実装し、背景削除のような非同期ジョブ基盤・DBジョブ行は作らない。フロントはローディング表示でカバー。タイムアウトは httpx/フロント側で 120 秒を上限に設定。
- 逆算の中間表現は **JSON**（prompt-lens は人間可読テキストだが、Phase B の変換と将来のスキーマ連携のため構造化する）。Gemini に JSON 出力を指示し、既存 `_analyze_with_gemini` と同じ「Markdownコードブロック除去→json.loads→失敗時フォールバック」パターンで頑健化する。
- Gemini モデルは既存の `gemini-2.5-flash` を使用、`GEMINI_API_KEY` は設定済み。追加の環境変数・契約は不要。
- 認証は既存の `get_current_user` 依存をそのまま使う。DEBUG時のモックユーザーも既存挙動を踏襲。
- 主用途はショートドラマのカット（〜8秒）。長尺を入れても8フレーム等間隔抽出で一応動くが、取りこぼしが増える旨をUIに注記する。

## 7. Architecture Impact

- フロントエンド: 新規ページ1枚（`/generate/reverse`）、API client 1メソッド追加、ナビ1リンク追加、変換アダプタ1ファイル、`/generate/story` のプリフィル読み取り改修。
- バックエンド: 新規エンドポイント1本（`analyze-prompt`）、Gemini逆算関数1つ＋逆算プロンプト定数、中間表現スキーマ、キーフレーム抽出の流用（必要なら public 化）。
- データベース: **変更なし**（履歴保存はスコープ外）。
- 認証: 既存依存を流用、変更なし。
- ストレージ: 入力動画は既存 upload-video-raw 経由でR2。分析は一時ファイルで完結し、新規R2書き込みなし（抽出フレームはサーバー一時ディレクトリのみ、処理後削除）。
- インフラ: 追加サービスなし。Railway 既存 ffmpeg を使用。

## 8. UI Plan

### 新規ページ `/generate/reverse`（"use client"）
- 状態: `idle`（アップロード前）/ `uploading` / `analyzing` / `done` / `error`。
- アップロード: 既存 `user-video-uploader.tsx` 流用（MP4/MOV/WebM、サイズ検証）。アップロード完了で `video_url` 取得。
- 注記表示: 「〜8秒程度の単一カット推奨。長い動画は内容を取りこぼす場合があります」。
- 分析ボタン: 押下で `analyzePrompt({ video_url })` 呼び出し、`analyzing`（ローディング、目安30秒）。
- 結果（`done`）: 6次元をカード/アコーディオンで表示。各セクション（主体/環境/カメラ/光影/スタイル/雰囲気/技術）と `core_prompt`、`full_description_ja`。`core_prompt` と各フィールドは編集可能（textarea/input、ローカルstate）。コピーボタン。
- アクション: 「このプロンプトで生成」ボタン（Phase B）→ 変換して `/generate/story` へ遷移。
- レスポンシブ: 既存ページ同様、`flex` ベースでモバイル1カラム。Tailwind v4 既知のグリッド欠落クラス（sm:grid-cols-2 等）は使わず flex で組む。`globals.css` は触らない（`@source` 厳禁）。
- 文言: 日本語ハードコード、ダークテーマ（zinc系、既存 concat/story ページに準拠）。

### 改修ページ `/generate/story`
- マウント時に sessionStorage の `reversePrefillPrompt` を読み、あれば `japanesePrompt` 初期値に設定し、キーを消費（1回限り）。既存の入力・翻訳・生成フローは不変。

## 9. API Plan

### 新規: `POST /api/v1/videos/analyze-prompt`
- 認証: `Depends(get_current_user)`。
- リクエスト（JSON）: `{ "video_url": str }`。`video_url` はR2公開URL（`R2_PUBLIC_URL` ホスト or `*.r2.dev` であることを検証＝既存背景削除と同じSSRF防止方針）。
- 処理:
  1. `video_url` のホスト検証。
  2. R2/HTTP から一時ファイルへダウンロード（既存 `r2.download_file` 流用）。
  3. ffprobe で duration 取得（既存）。
  4. キーフレーム8枚抽出（`_extract_frames(..., num_frames=8)`）→ base64 化。
  5. `gemini_client.reverse_engineer_prompt_from_frames(frames_base64, duration)` で逆算 → dict。
  6. `ReversePromptResult` に整形して返す。
  7. 一時ファイル・抽出フレームを finally で削除。
- レスポンス（`ReversePromptResult`）:
  ```json
  {
    "core_prompt": "string (1行・日本語・コピー/プリフィル用)",
    "full_description_ja": "string (150-200字の全体描写)",
    "subject": {"person": "", "action": "", "costume": "", "others": ""},
    "environment": {"scene_type": "", "time_weather": "", "spatial_layers": ""},
    "camera": {"angle": "", "shot_size": "", "movement": "", "focus": "", "composition": ""},
    "lighting": {"source": "", "direction": "", "ratio": "", "color_temp": ""},
    "style": {"visual_style": "", "color": "", "texture": "", "post": ""},
    "mood": {"tone": "", "narrative": "", "rhythm": ""},
    "technical": {"aspect_ratio": "", "motion_intensity": "", "suggested_duration_sec": 0, "negative_prompt": ""}
  }
  ```
- バリデーション: `video_url` 必須・URL形式・許可ホスト。フレーム抽出0枚／Gemini失敗時は500＋日本語メッセージ。
- エラーハンドリング: Gemini応答がJSONパース不能なら、`full_description_ja` にraw全文を入れ他フィールドは空、`core_prompt` は先頭行、という degrade フォールバック（既存 `_analyze_with_gemini` のフォールバック思想を踏襲）。非許可ホストは400「不正な動画URLです」。

### 既存利用（改修なし）
- `POST /api/v1/videos/upload-video-raw`（入力動画アップロード）。
- `POST /api/v1/videos/storyboard/translate-scene` 系（Phase B はフロントのプリフィルのみ、バックエンド呼び出しは既存のまま）。

## 10. Database Plan

スキーマ変更なし・マイグレーションなし。逆算結果は永続化せずレスポンスで返すのみ（履歴はスコープ外）。

## 11. File-by-File Plan

### バックエンド（movie-maker-api）
- `app/external/gemini_client.py` — **modify** / リスク: 中
  - 追加: 逆算用システムプロンプト定数 `REVERSE_PROMPT_SYSTEM_JA`（prompt-lens の6次元テンプレートを日本語化＋JSON出力指示）。
  - 追加: `reverse_engineer_prompt_from_frames(frames_base64: list[str], video_duration: float) -> dict`。既存の Gemini 呼び出し（`from google import genai` / `types.Part.from_bytes`）と JSON パース/フォールバックを踏襲。
- `app/services/video_analyzer.py` — **modify** / リスク: 低
  - `_extract_frames` を分析からも使えるよう薄い public ラッパー `extract_keyframes(video_path, num_frames=8) -> list[str]` を追加（既存メソッドへ委譲）。BGM 既存挙動は不変。
- `app/videos/schemas.py` — **modify** / リスク: 低
  - 追加: `AnalyzePromptRequest`（video_url）、`ReversePromptResult` と各サブモデル（Subject/Environment/Camera/Lighting/Style/Mood/Technical）。
- `app/videos/router.py` — **modify** / リスク: 中
  - 追加: `POST /analyze-prompt` ハンドラ（ホスト検証→DL→抽出→逆算→整形→一時ファイル削除）。
- `app/videos/service.py` — **modify**（任意） / リスク: 低
  - ルーターが太る場合、`analyze_video_prompt(video_url, user_id) -> ReversePromptResult` をサービスへ抽出。
- `tests/videos/test_analyze_prompt.py` — **create** / リスク: 低
  - ルーター: 正常（モックで中間表現返却）、video_url未指定(422)、非許可ホスト(400)、Gemini失敗時のフォールバック。
- `tests/external/test_reverse_prompt.py` — **create** / リスク: 低
  - `reverse_engineer_prompt_from_frames`: Gemini をモックし、JSON正常パース／コードブロック除去／パース失敗フォールバックを検証。

### フロントエンド（movie-maker）
- `app/generate/reverse/page.tsx` — **create** / リスク: 中
  - アップロード→分析→6次元表示・編集→コピー→「このプロンプトで生成」。
- `lib/api/client.ts` — **modify** / リスク: 低
  - 追加: `videosApi.analyzePrompt({ video_url }): Promise<ReversePromptResult>` と型定義（`ReversePromptResult` 等）。
- `lib/reverse-prompt/to-japanese-prompt.ts` — **create** / リスク: 低
  - `buildJapanesePrompt(result: ReversePromptResult): string`（中間表現→日本語プロンプト文字列。core_prompt をベースに主要素を結合）。純関数なので単体テスト容易。
- `app/generate/story/page.tsx` — **modify** / リスク: 中（既存生成フローを壊さないこと）
  - マウント時 sessionStorage `reversePrefillPrompt` を読み `japanesePrompt` 初期化、読み後にキー削除。既存ロジックは不変。
- `components/layout/header.tsx` — **modify** / リスク: 低
  - 認証時ナビに「プロンプト逆算」リンク（`/generate/reverse`、lucide アイコン）。
- `app/generate/reverse/page.test.tsx` — **create** / リスク: 低
  - 状態遷移（idle/uploading/analyzing/done/error）、編集、コピー、生成ボタンが sessionStorage 設定＋遷移を呼ぶ。api は vi.mock。
- `lib/reverse-prompt/to-japanese-prompt.test.ts` — **create** / リスク: 低
  - 変換アダプタの純関数テスト（フィールド欠損時の堅牢性含む）。

## 12. Implementation Order

1. task_001: 逆算プロンプト定数＋Gemini逆算関数（バックエンド中核）
2. task_002: キーフレーム抽出の public ラッパー（流用準備）
3. task_003: 中間表現スキーマ（schemas）
4. task_004: `POST /analyze-prompt` エンドポイント＋（任意でサービス抽出）
5. task_005: バックエンドテスト（gemini逆算＋ルーター）
6. task_006: フロント API client＋型、`/generate/reverse` ページ（Phase A）
7. task_007: フロント Phase A テスト
8. task_008: 変換アダプタ＋`/generate/story` プリフィル＋ナビ（Phase B）＋テスト
9. task_009: 統合検証（実動画でアップロード→逆算→プリフィル→生成まで手動E2E）

## 13. Verification Commands

リポジトリに実在するもののみ:

- バックエンド: `cd movie-maker-api && make test`（= `pytest`）
- バックエンド単体: `cd movie-maker-api && ./venv/bin/python -m pytest tests/videos/test_analyze_prompt.py tests/external/test_reverse_prompt.py -v`
- フロント Lint: `cd movie-maker && npm run lint`
- フロント 型チェック: `cd movie-maker && npx tsc --noEmit`（tsc は依存に存在。`build` にも型チェックは含まれる）
- フロント単体: `cd movie-maker && npm run test`（Vitest）
- フロント ビルド: `cd movie-maker && npm run build`
- フロント E2E（任意）: `cd movie-maker && npm run test:e2e`（Playwright、`NEXT_PUBLIC_E2E_TEST_MODE` 自動付与）

## 14. Acceptance Criteria

- AC1: `/generate/reverse` で動画をアップロードし「分析」を押すと、120秒以内に6次元の中間表現が表示される。
- AC2: `analyze-prompt` が `core_prompt`・`full_description_ja` を含む `ReversePromptResult` 形状のJSONを返す（必須フィールド非欠落）。
- AC3: Gemini 応答がJSON不正でもエンドポイントは500で落ちず、degrade フォールバック（full_description_ja に raw、core_prompt に先頭行）で200を返す。
- AC4: 非許可ホストの `video_url` は 400「不正な動画URLです」で拒否される。
- AC5: 未認証リクエストは 401。
- AC6: 「このプロンプトで生成」を押すと `/generate/story` に遷移し、`japanesePrompt` に逆算由来のテキストがプリフィルされている。プリフィルは1回限りで、リロード後は残らない。
- AC7: 既存の `/generate/story` の手入力→翻訳→生成フローはプリフィル有無に関わらず従来通り動作する（回帰なし）。
- AC8: 一時ファイル（DL動画・抽出フレーム）が処理後に残らない。
- AC9: モバイル幅（375px）で `/generate/reverse` が1カラムで崩れず操作可能。
- AC10: `make test` 全通過（既知の既存失敗以外の新規失敗なし）、`npm run lint` / `npx tsc --noEmit` / `npm run test` / `npm run build` 全通過。

## 15. Repair Loop

1. 検証コマンド（§13）を実行する。
2. エラー出力を捕捉する。
3. エラーを task_id にマッピングする（例: pytest の analyze-prompt 系失敗 → task_004/005、tsc/vitest のreverse系 → task_006/007、プリフィル不具合 → task_008）。
4. 関連ファイルのみをパッチする（無関係リファクタ禁止）。
5. 検証コマンドを再実行する。
6. 実装が計画と乖離したら本計画と task-list を更新する。
