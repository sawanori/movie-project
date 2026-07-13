# Implementation Plan: サーバーサイド・ワークフロー実行基盤 + 統合モデルゲートウェイ有効化

作成日: 2026-07-07
改訂: v2（2026-07-07）— ダブルレビュー反映済み。Fable（document-reviewer、コード突き合わせ）: 差し戻し→P0×4・P1×9・P2×11 を全反映。Gemini（gemini CLI）: 条件付き承認→P0×2（同時実行制御・ゾンビ生成防止）・P1×3（パリティテスト・クォータ消費モデル・タイムアウト）を全反映。
着想元: コードベース棚卸し調査（本セッション実施）— 休眠中の unified_gateway / model_registry、CRUD止まりの workflows ドメイン、クライアント側でのみ動くノードエディタ実行エンジンという「あと一歩」資産群の発見
関連調査: バックエンド/フロントエンド/docs の3系統並列インベントリ（エンドポイント・プロバイダ・タスクプロセッサ・ノード・料金プラン・移行履歴を確認済み）

> 注: 本ファイルは直前まで「動画→プロンプト逆算（Video-to-Prompt）」計画（2026-06-13、未着手）で使われていた。当該計画は破棄ではなく `docs/plans/archive/2026-06-13_video-to-prompt-reverse-engineering/` に3ファイルとも退避済みで、後日そのまま実行可能。本計画で上書き更新する。

## 1. Overview

movie-maker は動画生成6プロバイダ・画像生成・TTS・リップシンク・BGM・アップスケール・連結など機能豊富な「ツール箱」に成長したが、オーケストレーションは全てブラウザ依存（ノードエディタの実行は `graph-to-api.ts` によるクライアント側逐次呼び出し）で、保存済みワークフローは CRUD のみ、完全実装済みの統合ゲートウェイ（モデルレジストリ + 品質/速度/コスト・スコア）は `GATEWAY_ENABLED=False` のまま HTTP 露出ゼロで休眠している。

本計画は、この「8割まで作られて止まっている資産」を起動して製品の性格を変える:

1. **サーバーサイド・ワークフロー実行基盤** — 保存済みノードグラフをサーバー側で耐久実行（ブラウザを閉じても完走、再起動後の安全な再開、実行履歴、キャンセル）。複数入力画像への一括適用（バッチ実行）に対応。
2. **統合モデルゲートウェイの有効化** — フロントエンドが既に呼び先として実装済み（`gatewayApi`、現状バックエンド未実装で不通）の `/api/v1/config/models` 系3エンドポイントを実装し、モデルカタログ（スコア・上限メタデータ）を公開。「おまかせ（品質/速度/コスト優先）」自動モデル選択と、送信時失敗の自動フォールバックを提供。**注: これらは `GATEWAY_ENABLED` フラグ（`video_provider.py:223` の休眠分岐）を一切使わない独立経路として実装する。フラグの既定値は False のまま変更しない**（理由は §5 参照）。
3. **利用量ガードレール** — バッチ実行を安全にするための原子的クォータ予約（TOCTOU 対策）、プラン別バッチ上限、プロセス全体の同時実行数制御、ダッシュボード使用量表示の拡張。

これにより movie-maker は「手動で渡り歩くAIツール集」から「マルチモデルを自動選択して回る動画制作パイプライン・プラットフォーム」へ拡大する。requirements.md が Business プランの機能と定義する「バッチ生成」（同時本数の規定なし。本計画の上限 10 は提案値）の実体化であり、既存の公開ワークフロー（`is_public` + duplicate 実装済み）を「実行可能なテンプレート」に格上げするエコシステムの土台になる。

### 検討した代替案（不採用理由）

- **動画→プロンプト逆算の実行**: 良い機能だが単発機能であり「大幅な機能拡大」ではない。アーカイブから別途実行可能。
- **字幕自動生成 / 外部公開API / マーケットプレイス**: いずれも本基盤（サーバー実行・クォータ整備）の上に載る後続機能。基盤なしに先行させると作り直しになる。
- **Celery 等キュー基盤への移行**: インフラ複雑化に対し v1 の要件（単一 Railway プロセス + DB 永続化 + 起動時再開 + 同時実行セマフォ）で十分。`bg_removal_processor` の実績パターンを踏襲する。
- **クライアントがコンパイル済みステップ列を送信する方式**: グラフ意味論の二重実装は避けられるが、ヘッドレス実行（将来の cron / API 起動・公開テンプレートのワンクリック実行）が成立しないため不採用。二重実装の乖離リスクはパリティテスト（§14 AC15、task_004）で抑える。

## 2. Goal

- **ユーザー目標**:
  - ノードエディタで組んだワークフローを「サーバーで実行」でき、ブラウザを閉じても完走し、履歴から成果物を取得できる。
  - 複数の入力画像に同じワークフローを一括適用（バッチ）して量産できる。
  - モデルを「品質/速度/コスト」優先度で自動選択でき、プロバイダ送信失敗時は自動フォールバックされる。
  - 残りクォータと消費見込みが実行前に見える。
- **ビジネス目標**:
  - requirements.md が Business プラン機能と定義する「バッチ生成」を実装し、上位プラン移行動機を作る（バッチ上限をプラン差別化軸にする）。
  - モデル自動選択で新プロバイダ追加時の UI 改修コストを下げ、マルチモデル対応を運用可能にする。
  - 公開ワークフロー×サーバー実行で「テンプレートを選んで画像を入れるだけ」の導線（将来のテンプレートエコノミー）の技術前提を整える。

## 3. Current State

本セッションの調査およびダブルレビューでコードと突き合わせ済みの事実:

- **ノードエディタ**: 22 ノードタイプが `utils/node-types.ts:34-62` に実登録済み。実行は `movie-maker/components/node-editor/utils/graph-to-api.ts`（全633行）がグラフを `StoryVideoCreate` ペイロードへ変換し、`GenerateNode` の実行ボタンからブラウザが逐次呼び出し・ポーリングする（クライアント実行のみ）。**graph-to-api.ts が担うのは単一 Generate のペイロード変換のみ**であり、Dialogue / GetVideoFrame / TrimVideo / StitchVideos のチェーン実行意味論は各ノードコンポーネント（`DialogueNode.tsx` 等）と個別 API 配線（`utilityApi`、client.ts:2365-2377）に分散している。また graph-to-api.ts は GenerateNode→GenerateNode の v2v チェーン（:193-223）もサポートする。
- **ワークフロー永続化**: `movie-maker-api/app/workflows/` の実体は `__init__.py` / `schemas.py` / `router.py` のみ（**service.py は存在しない**）。router は list / public / get / create / patch / delete / duplicate の CRUD のみ（router.py:26-393）で、`GET /{workflow_id}` が :94 で先に宣言されているため、追加ルートの宣言順に制約がある。実行エンジンはサーバーに存在しない。
- **統合ゲートウェイ**: `app/external/unified_gateway.py` + `model_registry.py`（5モデル登録済み: piapi_kling / veo / runway / hailuo / seedance。`ModelMetadata` は quality_score / speed_score / cost_per_second / max_duration / supported_aspect_ratios を保持、model_registry.py:14-24）+ `gateway_init.py` が実装済み。ただし `GATEWAY_ENABLED=False`（config.py:73）で HTTP エンドポイントは1本もない。**重要な制約**: (a) **domoai はレジストリ未登録**（gateway_init.py の登録は5モデルのみ）、(b) `find_best()` は provider **インスタンス**を返しメタデータを返さない（model_registry.py:56-82）、(c) `video_provider.py:223-231` の休眠分岐を有効化すると storyboard_processor（引数なし呼び出し :242, :285）や t2v_processor（capability="i2v" ハードコード :59）を含む**全呼び出し元**の挙動が変わり、未登録プロバイダは無言で別プロバイダに置換される。
- **フロントエンド gatewayApi**: `movie-maker/lib/api/client.ts:2381-2390` に `GET /api/v1/config/models(?capability=)` / `GET /api/v1/config/capabilities` / `GET /api/v1/config/recommended?priority=&capability=` を呼ぶクライアントが実装済み（バックエンド未実装のため `client.test.ts:349-428` のモックテストのみで使用、UI 未使用）。既存フロント型 `ProviderMetadata`（`lib/types/provider-metadata.ts:1-8`）は `{name, provider, capabilities, quality, speed, cost}` で、バックエンドの実フィールド名（quality_score 等）と**不一致** — 本計画で §9 のワイヤ形式に統一する。
- **プロバイダ明示指定は既に可能**: バックエンドの `StoryVideoCreate`（`app/videos/schemas.py:278`、`video_provider` フィールドは :288。フロント TS 型名は `StoryVideoCreateRequest`）→ ただし `videos/router.py:3953` が**リクエスト時点で具体プロバイダ名に解決して DB 保存**（:3967）し、`start_story_processing` に具体名を渡す（:4024）。`story_processor.py:129-130` は常に具体名を受け取る。**したがって「おまかせ」解決はプロセッサ側ではなく router 側で行う必要がある**。
- **クォータ**: `get_plan_limits()`（free 3 / starter 5 / pro 15 / business 50 本/月、dependencies.py:81-89）と `check_usage_limit`（読み取り検査のみ、403、DEBUG=True バイパス、:92-106）。**加算は作成時**に `supabase.rpc("increment_video_count")`（videos/router.py:4014、videos/service.py:59, 265）。`POST /api/v1/videos/story`（router.py:3876）には `check_usage_limit` 適用済み（:3880）。事前検査+事後加算のため**並行リクエストで上限超過し得る（TOCTOU）** — バッチ導入で顕在化するため本計画で原子的予約に変える（§10）。
- **使用量表示は既に実装済み**: `app/dashboard/page.tsx:461-485` に実データ表示（今月の使用状況 videos_used/videos_limit、残数、プラン名バッジ、アップグレード導線）が存在し、`UsageCardSkeleton` はローディング時のみ。本計画では**差分**（コンポーネント抽出 + プログレスバー + リセット日 + テスト新設）のみ行う。
- **バックグラウンド処理**: FastAPI `BackgroundTasks` によるプロセス内実行（15 プロセッサ）。`bg_removal_processor.py` に起動時自動再開の実績パターン（`process_background_removal(generation_id, resume=False)` :62-81 + main.py:86-105 の startup フック）。同時実行数の制御は存在しない。キュー基盤なし。
- **ユーティリティ API 実装済み**: extract-frame / trim / stitch（非同期）/ dialogue（TTS+ミックス+リップシンク）/ BGM 適用 / LUT / フィルムグレイン / テキストオーバーレイ等、ステップ実行に必要な部品は `ffmpeg_service`（25+ 関数）と各ドメインサービスに揃っている。
- **既存テストの既知失敗（2026-07-12 更新）**: 旧記録の3件（`tests/videos/test_text_to_image.py` ×2、`tests/library/test_service.py` ×1、GenerateSceneImageResponse モック不足）は**解消済みで現在パスする**（実装中に自分で再実行確認）。実際の環境依存失敗は `tests/videos/test_bgm_api.py::TestBGMGenerateEndpoint::test_generate_bgm_success` のみ（背景タスクが Suno API へ実 HTTP 発信するため、オフライン環境で DNS 解決失敗。ネットワーク時はパス）。本計画の回帰判定ではこの1件のネットワーク失敗のみを環境要因として除外する。
- **`main.py:114` に既存ルートハンドラ `get_video_provider` が存在**: gateway router 実装時、`app.external.video_provider.get_video_provider` との import 名衝突に注意（パスは `/config/video-provider` と `/config/models` で不衝突）。

## 4. Scope

1. `workflow_runs` テーブル新設（グラフスナップショット、コンパイル済みステップ列、ステップ別ステータス、バッチグループ、RLS、インデックス）+ 原子的クォータ予約/返金の SQL 関数 `reserve_video_quota` / `release_video_quota` 新設（1マイグレーション）。
2. **ワークフローエンジン**（`app/services/workflow_engine.py`）: nodes/edges JSONB を検証し、順序付きステップ列にコンパイルする純関数群。
   - **意味論の正**: Generate ペイロード部分は `graph-to-api.ts` を正として等価実装。チェーン意味論（Dialogue / GetVideoFrame / TrimVideo / StitchVideos の接続・入出力受け渡し）は各ノードコンポーネント + `HANDLE_IDS`（`lib/types/node-editor.ts`）+ `utils/node-types.ts` を正とし、ステップ連結規則を task_004 の成果物として仕様化する。
   - **対応ノード（22種すべて）**: ImageInput / VideoInput / Prompt / Provider / Generate、KlingMode / KlingElements / KlingEndFrame / KlingCameraControl / HailuoEndFrame / ActTwo / CameraWork / OmniReference、BGM / FilmGrain / LUT / Overlay、Dialogue、GetVideoFrame / TrimVideo / StitchVideos（StickyNote は無視）。未対応ノードタイプ検出（400 + ノード名リスト）は現行 22 種を全対応するため**将来ノード・不正データ用の防御コード**である。
   - **v1 制限**: Generate ノードは**1グラフに1個のみ**（graph-to-api.ts がサポートする GenerateNode→GenerateNode v2v チェーンはサーバー実行 v1 では非対応。検出時は「v2v チェーンはクライアント実行をご利用ください」の明示エラーで 400）。
   - **意味論の乖離ポイント決定表**: (a) 未接続設定ノードのグローバルフォールバック採用（graph-to-api.ts:111-135、廃止予定 TODO 付き）、(b) Kling 6軸カメラ指定時の `camera_work` 削除（:418-419）、(c) KlingElements 画像による ImageInput 代替（:299-301）、(d) V2V=Runway 固定等のプロバイダガード — をサーバー側で再現するか拒否するかの決定リストを task_004 で確定し docstring + docs に残す。
3. **実行プロセッサ**（`app/tasks/workflow_run_processor.py`）: ステップ逐次実行（既存ドメインサービス/プロセッサを呼び、各ドメインテーブルをポーリング）、ステップ毎 DB 更新、キャンセル対応。
   - **同時実行制御**: プロセス全体で `asyncio.Semaphore(settings.WORKFLOW_MAX_CONCURRENT_RUNS)`（既定 3、env 可変）。超過分は pending のままキュー待ち。
   - **二重課金防止（submitting プロトコル）**: 外部プロバイダへ送信する**直前**にステップを `submitting` 状態で DB 保存 → 送信 → `external_task_id` を保存して `processing` へ。再開時、`submitting` のまま task_id が無いステップは**再送信せず** run を failed 化（外部で生成が進行している可能性があるため、二重課金より安全側に倒す）。
   - **起動時再開**: `resume_stuck_workflow_runs()` は processing の run を**逐次**（サンダリングハード防止）走査し、external_task_id ありはポーリング再開、submitting/未送信は上記規則で failed 化。
4. **実行 API**: `POST /api/v1/workflows/{id}/execute`（バッチ入力・モデル選択オプション付き）、`GET /api/v1/workflows/runs`（一覧）、`GET /api/v1/workflows/runs/{run_id}`（ステップ別詳細）、`POST /api/v1/workflows/runs/{run_id}/cancel`。
5. **ゲートウェイ HTTP 公開**（`app/gateway/router.py`）: フロント既存クライアントのパスと完全一致する `GET /config/models` / `GET /config/capabilities` / `GET /config/recommended` を実装。model_registry 読み取りのみ。`find_best()` はインスタンスを返すため、**同一ソート規則の `find_best_metadata()` を model_registry に追加**してメタデータ応答を組む。
6. **おまかせモデル選択（router 時点解決）**: `StoryVideoCreate` に `selection_priority`（"quality" | "speed" | "cost"、任意）を追加。**`videos/router.py:3953` の解決ロジックを拡張**し、`selection_priority` 指定かつ `video_provider` 未指定時は `resolve_provider_with_priority()`（`model_registry.find_best_metadata()` の薄いラッパ、capability="i2v"）で具体プロバイダ名に解決して従来通り DB 保存・下流受け渡しする。`selection_priority` は `start_story_processing` のタスク引数として story_processor へ渡し（永続化しない。story 生成に再開機構は無いため）、**送信時**失敗の場合のみ次点候補で1回フォールバック。フォールバック発生時は `video_generations.video_provider` を実使用プロバイダに更新し、構造化ログに記録する（DB の専用フラグは作らない）。外部送信には明示的な短い接続タイムアウトを設定する。
7. **クォータガードレール**: execute 時に「Generate ステップ数 × バッチ数」を `reserve_video_quota`（上限内なら加算、超過なら拒否、を1つの SQL 関数で原子実行）で**先行予約**してから 202 を返す。run が failed / canceled になった時点で**未着手** Generate ステップ分を `release_video_quota` で返金する（submitting / processing / completed のステップは消費確定）。ワークフロー経路の Generate ステップは**加算を含まない下位関数を直呼び**し、二重計上を構造的に防ぐ（加算責務は workflow 層に一元化）。既存の story 直接経路の加算（router.py:4014 等）は変更しない。プラン別バッチ上限（free/starter=1、pro=3、business=10）を `get_plan_limits()` に追加。
8. **フロントエンド**: `workflowRunsApi` クライアント追加、`lib/types/provider-metadata.ts` を §9 ワイヤ形式に拡張、NodeEditor「サーバーで実行」ボタン + 実行オプションモーダル（バッチ入力・モデル選択・消費見込み/残数表示）+ `WorkflowRunsPanel`（実行履歴・ステップ進捗・キャンセル・成果物リンク、SWR ポーリング）、ProviderNode の「おまかせ」オプション + モデルメタデータ表示（API 失敗時は現行静的リスト `PROVIDERS` へフォールバック）、ダッシュボード使用量表示の**差分拡張**（既存インライン表示のコンポーネント抽出 + プログレスバー + リセット日 + テスト）。
9. `.env.example` への `GATEWAY_ENABLED`（既定 False のまま、本計画では変更しない旨のコメント付き）と `WORKFLOW_MAX_CONCURRENT_RUNS` の記載、機能ドキュメント（`docs/features/workflow-runs.md`）新設。

## 5. Non-Scope

- **`GATEWAY_ENABLED` 既定 True 化および `video_provider.py:223` 休眠分岐の再設計**: 有効化すると全 `get_video_provider()` 呼び出し元（storyboard_processor の引数なし呼び出し、t2v_processor の capability ハードコード、レジストリ未登録の domoai）の挙動が変わり無言のプロバイダ置換が起きる。本計画の新機能はこの分岐を必要としないため、フラグは False のまま温存し、分岐の整理は将来の独立課題とする（レビュー指摘 P0-1 による確定事項）。
- ワークフローのマーケットプレイス化・課金販売（公開/複製は既存機能のまま）。
- スケジュール実行（cron）・完了 Webhook 通知・外部開発者向け公開 REST API（APIキー発行）。
- 1実行内の DAG 並列実行・条件分岐・ループ・複数 Generate（v2v チェーン含む。クライアント実行では従来通り可能）。
- バッチ一括キャンセル（v1 は run 単位の cancel のみ。バッチ10本の中止には10回の呼び出しが必要）。
- 新規ノードタイプの追加。クライアント側実行パス（graph-to-api.ts / GenerateNode）の変更（現行機能はそのまま併存）。
- Celery / RQ 等キュー基盤への移行、Railway 複数プロセス化。
- 分析ダッシュボード・EC 連携（requirements.md Phase 3 領域）。
- 動画→プロンプト逆算計画（アーカイブ済み、独立して後日実行可能）。
- `gc_omni_assets` の cron 配線（既知の別課題として残置）。
- 月次利用回数リセットの仕組み変更（現行運用のまま）。
- upscale / lip-sync / TTS プロバイダへの「おまかせ」適用。
- モバイル（メシプロAI）関連。

## 6. Assumptions

- **耐久性の水準**: Railway 単一プロセス + `BackgroundTasks` + DB 永続化 + 起動時逐次再開 + プロセス内セマフォで v1 要件を満たす。ジョブロスト率ゼロは保証しない（submitting プロトコルにより「ロストしても二重課金しない」ことを保証する）。
- **同時実行上限の既定値**: `WORKFLOW_MAX_CONCURRENT_RUNS=3` は Railway 標準プランのメモリ/CPU と外部 API レートリミットからの安全側推定値。負荷実測後に env で調整する。
- **バッチ上限のプラン値**: free/starter=1（=バッチ不可）、pro=3、business=10。requirements.md はバッチ生成を Business 機能と定義するのみで同時本数の規定は無く、**数値はすべて本計画の提案値**。`get_plan_limits()` に集約し後日調整可能にする。
- **クォータ消費モデル**: 「execute 時に総数を原子予約、run の failed/canceled 時に未着手 Generate 分を返金、着手済み（submitting 以降）は消費確定」。キャンセル時も実行中ステップは完走するため当該ステップは消費扱い。このポリシーは docs/features/workflow-runs.md に利用者向けに明記する。
- **おまかせ選択の適用範囲**: story 系生成（capability="i2v" の Generate ステップ）のみ。
- **レジストリスコアは手動メンテ値**: quality/speed/cost スコアと実際の課金原価は厳密一致しない。誤差は許容し、スコア更新は `model_registry.py` の編集で行う。domoai はレジストリ未登録のため「おまかせ」の選択対象外（明示指定では従来通り使用可能）。
- **バッチの置換対象**: バッチ実行はグラフ内の ImageInput ノードがちょうど1個の場合のみ許可（複数/ゼロなら 400）。KlingElements 画像による ImageInput 代替（graph-to-api.ts:299-301）に依存するグラフはバッチ不可（400）。VideoInput の一括置換は対象外。
- **ノード意味論の二重管理**: サーバー側コンパイラと graph-to-api.ts の等価性は**パリティテスト**（フロントのテストが書き出す「代表グラフ→期待ペイロード」fixture をバックエンドテストの期待値として共用）で機械的に検証する。将来のノード追加時は fixture 更新が両実装の同期を強制する。
- **DEBUG バイパス**: DEBUG=True でのクォータバイパスは現状維持。認証必須（401）のテストは DEBUG 依存を FastAPI dependency override で外して検証する（`get_current_user` は DEBUG=True かつ資格情報なしでモックユーザーを返すため。dependencies.py:27-28）。
- **omni-reference 資産の TTL**: サーバー実行でも omni 参照資産の 72h TTL 制約は現行のまま（実行時に期限切れなら該当ステップは失敗）。

## 7. Architecture Impact

- **バックエンド**:
  - 新規 `app/gateway/router.py`（prefix `/config`、`main.py` で `/api/v1` 配下にマウント）。model_registry 読み取りのみで副作用なし。`main.py:114` の既存ハンドラ名 `get_video_provider` との import 衝突に注意（関数名を別名にする）。
  - `app/external/model_registry.py` に `find_best_metadata(priority, capability)` を追加（既存 `find_best` と同一ソート規則: quality/speed 降順・cost 昇順）。
  - 新規 `app/services/workflow_engine.py`: グラフ検証・コンパイルの純関数（I/O なし、単体テスト容易）。
  - 新規 `app/tasks/workflow_run_processor.py`: ステップ実行・状態遷移・逐次再開・キャンセル・セマフォ。既存ドメインサービスを呼ぶオーケストレータであり、外部 API を直接叩く新規コードは書かない。Generate ステップは**使用量加算を含まない下位関数**を直呼びする。
  - `app/external/video_provider.py` に `resolve_provider_with_priority()` と `submit_with_fallback()`（短い接続タイムアウト付き）を追加。既存 `get_video_provider()` 本体と `GATEWAY_ENABLED` 分岐は**触らない**。
  - `app/videos/router.py`: `/story` の provider 解決部（:3953 付近）に priority 解決を追加。
  - 新規 `app/workflows/service.py`（**新規作成**。既存に service.py は無い）: run 作成・クォータ予約・取得系・キャンセル。
  - `app/core/config.py`: `WORKFLOW_MAX_CONCURRENT_RUNS` 設定追加（`GATEWAY_ENABLED` は変更しない）。
  - `app/main.py`: gateway router マウント + startup で run 再開フック（bg_removal と並置）。
- **フロントエンド**: NodeEditor にサーバー実行モードを追加（既存クライアント実行と並置・非破壊）。新規パネル/モーダル/フック。ProviderNode 拡張。`lib/types/provider-metadata.ts` のワイヤ形式統一。ダッシュボード使用量表示のコンポーネント抽出+拡張。
- **DB**: `workflow_runs` 1テーブル + SQL 関数2本の追加のみ（既存テーブルの変更なし・破壊的 DDL なし）。
- **認証**: 全新規エンドポイントは既存 JWT 依存（`get_current_user`）。`workflow_runs` は RLS で本人 SELECT のみ、書き込みはバックエンド service-role 限定（omni_reference_assets v3 と同方式）。
- **ストレージ**: 中間・最終成果物は既存の R2 パス規約を踏襲（新規パス体系を作らない）。
- **インフラ**: Railway 環境変数 `WORKFLOW_MAX_CONCURRENT_RUNS`（任意、既定3）。プロセス構成変更なし。

## 8. UI Plan

- **NodeEditor ツールバー**: 既存の実行ボタンの隣に「サーバーで実行」ボタンを追加。未保存（workflow_id なし）の場合は保存を促すダイアログを出し、保存後に続行。
- **ExecuteOnServerModal**（新規）:
  - バッチ入力: ライブラリ/アップロード済み画像から複数選択（プラン上限まで。上限超過時は選択不可 + 理由表示）。バッチ不可のグラフ（ImageInput が1個でない等）では選択 UI を無効化。
  - モデル選択: 「グラフの設定に従う」（既定）/「おまかせ: 品質・速度・コスト」segmented control。
  - 消費見込み: 「この実行で N 本の動画生成を予約します（残り M 本）」を表示（予約/返金ポリシーの注記リンク付き）。残数不足時は実行ボタン無効 + 文言表示。
- **WorkflowRunsPanel**（新規、エディタ右サイドパネル。lg 未満はフルスクリーンドロワー）:
  - 実行一覧（status バッジ、開始時刻、バッチグループ表示）。
  - 選択で詳細: ステップ毎の node 名 / status（submitting 含む）/ エラーメッセージ / 中間成果物リンク、final_output_url のプレビュー/ダウンロード、キャンセルボタン。
  - SWR 3 秒ポーリング（completed/failed/canceled で自動停止。既存ポーリング実装の間隔・パターンを踏襲）。
- **ProviderNode**: プロバイダドロップダウンに「おまかせ（品質優先/速度優先/コスト優先）」を追加。`gatewayApi.listModels()` から quality_score / cost_per_second / max_duration をツールチップ表示。取得失敗時は現行の静的 `PROVIDERS` リスト（ProviderNode.tsx:23）へ自動フォールバック（機能退行なし）。おまかせ対象は registry 登録5モデル（domoai は明示指定のみ）である旨を UI に注記。
- **ダッシュボード使用量表示（差分拡張）**: 既存のインライン実装（`app/dashboard/page.tsx:461-485`）を `UsageCard` コンポーネントに抽出し、残数プログレスバーとリセット日（`GET /auth/usage` が返す場合のみ。返さない場合は「毎月自動リセット」の固定文言）を追加。既存の表示内容・アップグレード導線は維持。
- **レスポンシブ注意**: Tailwind v4 の既知バグ（`sm:grid-cols-2` 等の JIT 欠落）があるため、新規レイアウトは flex 基調とし、レスポンシブ grid を使う場合は globals.css の既存属性セレクタ override 対象クラスに限定する。`@source` は絶対に追加しない。

## 9. API Plan

すべて既存 JWT 認証（`get_current_user`）。エラーボディは既存規約（`detail` メッセージ）に従う。

**ワイヤ形式の統一（ProviderMetadata）**: バックエンドのフィールド名を正とし、フロント `lib/types/provider-metadata.ts` を次の形に拡張する（既存の短縮名 quality/speed/cost は廃止。gatewayApi は UI 未使用・テストのみのため破壊的変更の実害なし）:
```json
{
  "name": "seedance", "provider": "piapi",
  "capabilities": ["i2v", "t2v"],
  "quality_score": 9, "speed_score": 6, "cost_per_second": 0.05,
  "max_duration": 15, "supported_aspect_ratios": ["9:16", "16:9"]
}
```

| Method / Path | Req | Res | 備考 |
|---|---|---|---|
| GET `/api/v1/config/models?capability=` | query 任意 | `ProviderMetadata[]`（上記形式） | フロント `gatewayApi.listModels` とパス一致 |
| GET `/api/v1/config/capabilities` | — | `{capability: [{name, provider}]}` | 同 `getCapabilities` |
| GET `/api/v1/config/recommended?priority=&capability=` | 必須2query | `{name, provider}` | `find_best_metadata()` で解決。不正 priority/capability は 422/400 |
| POST `/api/v1/workflows/{workflow_id}/execute` | `{input_image_urls?: string[], video_provider?: string, selection_priority?: "quality"\|"speed"\|"cost"}` | 202 `{batch_id, run_ids: string[]}` | 400: 未対応ノード（ノード名リスト付き）/ 複数 Generate（v2v チェーン案内文言）/ バッチ条件違反、403: クォータ予約失敗・プラン別バッチ上限超過、404: 他人/不存在 |
| GET `/api/v1/workflows/runs?workflow_id=&page=&per_page=` | query | `{runs: [{id, workflow_id, batch_id, status, progress, final_output_url, error_message, created_at}], total}` | 本人の run のみ |
| GET `/api/v1/workflows/runs/{run_id}` | — | run 詳細 + `steps: [{node_id, node_type, status, output_url, error_message, provider_used}]` | 404: 他人/不存在。status に submitting を含む |
| POST `/api/v1/workflows/runs/{run_id}/cancel` | — | 200 `{status: "canceled"}` | pending/processing のみ可。実行中の外部プロバイダタスクは打ち切らず、次ステップ遷移時に停止。未着手 Generate 分は返金 |
| POST `/api/v1/videos/story`（既存拡張） | `selection_priority` 任意フィールド追加 | 既存レスポンス不変 | **router で解決**: priority 指定かつ provider 未指定なら具体名に解決して従来フローへ。併記時は `video_provider` 優先。既存クライアントへの後方互換を維持 |

- **ルート定義順序**: `/workflows/runs/...` は既存 `GET /{workflow_id}`（router.py:94）より**前**に定義する（FastAPI は宣言順マッチのため、後置すると `runs` が workflow_id として解釈され 422/404 になる）。
- **バリデーション**: execute は (a) グラフのコンパイル成功 (b) ImageInput 個数（バッチ時=1、KlingElements 代替グラフは不可） (c) 原子的クォータ予約 (d) バッチ上限 を全て通過してから 202 を返し、以後は非同期。予約後にバリデーションで失敗した場合は即時返金する。
- **フォールバック記録**: workflow 経路では step の `provider_used` に実使用プロバイダを保存。story 直接経路では `video_generations.video_provider` を実使用プロバイダに更新し、フォールバック発生は構造化ログに記録（DB の専用フラグは作らない）。
- **タイムアウト**: `submit_with_fallback` の外部送信は明示的な短い接続/送信タイムアウトを設定し、フォールバック込みの最悪時間を制御する。

## 10. Database Plan

新規マイグレーション `docs/migrations/20260707_workflow_runs.sql`（Supabase MCP で適用、SQL ファイルを正とする）:

```sql
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES user_workflows(id) ON DELETE SET NULL,
  batch_id uuid NOT NULL,
  batch_index int NOT NULL DEFAULT 0,
  graph_snapshot jsonb NOT NULL,
  compiled_steps jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','canceled')),
  current_step int NOT NULL DEFAULT 0,
  video_provider text,
  selection_priority text
    CHECK (selection_priority IS NULL OR selection_priority IN ('quality','speed','cost')),
  reserved_generations int NOT NULL DEFAULT 0,
  final_output_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_runs_user_created ON workflow_runs(user_id, created_at DESC);
CREATE INDEX idx_workflow_runs_active ON workflow_runs(status)
  WHERE status IN ('pending','processing');
CREATE INDEX idx_workflow_runs_batch ON workflow_runs(batch_id);

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_runs_select_own ON workflow_runs
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE/DELETE ポリシーは作らない（バックエンド service-role のみが書く。
-- omni_reference_assets v3 で確立した方式）

-- 原子的クォータ予約: 上限内なら加算して true、超過なら加算せず false（TOCTOU 対策）
CREATE OR REPLACE FUNCTION reserve_video_quota(p_user_id uuid, p_count int, p_limit int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE ok boolean;
BEGIN
  UPDATE users
     SET video_count_this_month = video_count_this_month + p_count
   WHERE id = p_user_id
     AND video_count_this_month + p_count <= p_limit
  RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END $$;

-- 返金: 下限0でデクリメント
CREATE OR REPLACE FUNCTION release_video_quota(p_user_id uuid, p_count int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users
     SET video_count_this_month = GREATEST(video_count_this_month - p_count, 0)
   WHERE id = p_user_id;
END $$;
```

- `compiled_steps` は `[{node_id, node_type, params, status, external_task_id, output_url, provider_used, error_message}]` の配列。step の status は `pending → submitting → processing → completed / failed / skipped`。
- `graph_snapshot` は実行時点の nodes/edges（ワークフローが後で編集されても run の再現性を保つ。バッチ時は置換後の入力を反映）。
- `updated_at` は DB トリガーを作らず**アプリ側で明示更新**する（既存テーブルの慣行に合わせる）。
- `users.video_count_this_month` のカラム名は task_001 実施時に実テーブルで確認し、相違があれば SQL を実名に合わせる（関数のシグネチャは維持）。
- 破壊的 DDL なし。既存テーブル変更なし。ロールバックは `DROP TABLE workflow_runs; DROP FUNCTION reserve_video_quota; DROP FUNCTION release_video_quota;`（未リリース段階のみ許容、実施時は要確認）。

## 11. File-by-File Plan

### バックエンド（movie-maker-api/）

| ファイル | 区分 | 目的 / 変更内容 | リスク |
|---|---|---|---|
| `docs/migrations/20260707_workflow_runs.sql` | create | 上記 DDL + RLS + インデックス + クォータ予約/返金関数 | low |
| `app/gateway/__init__.py` | create | パッケージ化 | low |
| `app/gateway/router.py` | create | `/config/models` `/config/capabilities` `/config/recommended`。model_registry 読み取りのみ（import 名衝突に注意） | low |
| `app/external/model_registry.py` | modify | `find_best_metadata()` 追加（find_best と同一ソート規則） | low |
| `app/services/workflow_engine.py` | create | `validate_graph()` / `compile_graph()`。対応ノード表・チェーン連結規則・乖離ポイント決定表・単一 Generate 制限。純関数 | high（意味論等価はパリティテストで担保） |
| `app/tasks/workflow_run_processor.py` | create | セマフォ制御・submitting プロトコル・ステップ実行・逐次再開・キャンセル・返金呼び出し | high |
| `app/workflows/schemas.py` | modify | ExecuteRequest / RunResponse / RunDetailResponse / StepStatus 追加 | low |
| `app/workflows/router.py` | modify | execute / runs list / run detail / cancel の4endpoint 追加（既存 `GET /{workflow_id}`（:94）より前に定義） | medium |
| `app/workflows/service.py` | **create**（既存に無い） | run 作成（コンパイル・バッチ展開・原子予約・スナップショット）、取得系、キャンセル+返金 | medium |
| `app/videos/schemas.py` | modify | `StoryVideoCreate.selection_priority` 追加 + バリデーション | low |
| `app/videos/router.py` | modify | `/story` の provider 解決（:3953 付近）に priority 解決を追加、`start_story_processing` へ priority を引数伝搬 | medium |
| `app/tasks/story_processor.py` | modify | 送信部（:130 付近）を `submit_with_fallback()` 経由にし、フォールバック時に video_provider 列を更新 | medium |
| `app/external/video_provider.py` | modify | `resolve_provider_with_priority()` / `submit_with_fallback()`（短タイムアウト付き）追加。**既存 `get_video_provider()` と GATEWAY_ENABLED 分岐は不変** | medium |
| `app/core/config.py` | modify | `WORKFLOW_MAX_CONCURRENT_RUNS`（既定3）追加。**GATEWAY_ENABLED は変更しない** | low |
| `app/core/dependencies.py` | modify | `get_plan_limits()` に `max_batch_size` 追加 | low |
| `app/main.py` | modify | gateway router マウント、startup に run 逐次再開フック追加 | low |
| `.env.example` | modify | `WORKFLOW_MAX_CONCURRENT_RUNS` / `GATEWAY_ENABLED`（False 維持の注記） | low |
| `tests/gateway/test_router.py` | create | 3endpoint の正常/異常系（401 は dependency override で検証） | low |
| `tests/services/test_workflow_engine.py` | create | fixture 5系統 + パリティ fixture 照合 | medium |
| `tests/services/fixtures/`（グラフ/期待ペイロード JSON） | create | フロント graph-to-api テストと共用するパリティ fixture | low |
| `tests/workflows/test_run_processor.py` | create | 状態遷移・submitting 再開規則・キャンセル・セマフォ・返金（モック） | medium |
| `tests/workflows/test_execution.py` | create | execute の 202/400/403/404、一覧/詳細/cancel、原子予約の並行検証、バッチ上限 | medium |
| `tests/videos/test_model_selection.py` | create | router 時点の priority 解決とフォールバックの単体テスト（プロバイダはモック） | low |

### フロントエンド（movie-maker/）

| ファイル | 区分 | 目的 / 変更内容 | リスク |
|---|---|---|---|
| `lib/types/provider-metadata.ts` | modify | §9 ワイヤ形式へ拡張（quality_score / max_duration / supported_aspect_ratios 等） | low |
| `lib/api/client.ts` | modify | `workflowRunsApi`（execute/list/get/cancel）+ 型追加。gatewayApi はパス不変・型参照更新 | low |
| `lib/api/client.test.ts` | modify | workflowRunsApi 追加分 + gatewayApi の新ワイヤ形式へのテスト更新 | low |
| `components/node-editor/NodeEditor.tsx` | modify | 「サーバーで実行」ボタン + モーダル起動 + 保存誘導 | medium |
| `components/node-editor/ExecuteOnServerModal.tsx` | create | バッチ入力選択・モデル選択・消費見込み（予約説明付き）・実行 | medium |
| `components/node-editor/WorkflowRunsPanel.tsx` | create | 実行履歴・ステップ進捗（submitting 表示含む）・キャンセル・成果物 | medium |
| `lib/hooks/use-workflow-runs.ts` | create | SWR ポーリングフック（3s、terminal で停止） | low |
| `components/node-editor/nodes/ProviderNode.tsx` | modify | 「おまかせ」選択肢 + メタデータツールチップ + 静的 `PROVIDERS` フォールバック | medium |
| `components/node-editor/utils/graph-to-api.ts` | modify | auto 選択時は video_provider を送らず selection_priority を送る（最小差分） | medium |
| `components/node-editor/utils/graph-to-api.parity.test.ts` | create | 代表グラフ→期待ペイロードのパリティ fixture を生成・検証（バックエンドと共用） | medium |
| `app/dashboard/components/usage-card.tsx` | create | 既存インライン表示（page.tsx:461-485）の抽出 + プログレスバー + リセット日 | low |
| `app/dashboard/page.tsx` | modify | 抽出した UsageCard の使用（表示内容は維持） | low |
| `components/node-editor/__tests__/WorkflowRunsPanel.test.tsx` ほか | create | パネル/モーダル/UsageCard の表示・操作テスト（既存テスト配置規約に従う） | low |
| `tests/e2e/workflow-server-run.spec.ts` | create | E2E（playwright.config.ts の testDir `./tests/e2e` 配下。モック API でサーバー実行 UI 一連操作） | medium |

### ドキュメント

| ファイル | 区分 | 目的 | リスク |
|---|---|---|---|
| `docs/features/workflow-runs.md` | create | 機能仕様・対応ノード表・乖離ポイント決定表・クォータ予約/返金ポリシー・submitting/再開/キャンセル/フォールバックの意味論・同時実行制御・bg_removal との再開方式差異・Railway 設定 | low |

## 12. Implementation Order

| 順序 | task_id | 内容 | 依存 |
|---|---|---|---|
| 1 | task_001 | `workflow_runs` + クォータ関数のマイグレーション作成・適用・確認 | — |
| 2 | task_002 | ゲートウェイ 3endpoint + `find_best_metadata()` + テスト | — |
| 3 | task_003 | selection_priority の router 時点解決 + 送信時フォールバック + テスト | task_002 |
| 4 | task_004 | workflow_engine（検証・コンパイル・パリティ fixture） + テスト | — |
| 5 | task_005 | workflow_run_processor（セマフォ・submitting・実行・逐次再開・キャンセル） + テスト | task_001, task_004 |
| 6 | task_006 | 実行系 4endpoint + 原子予約/返金 + バッチ検査 + テスト | task_003, task_005 |
| 7 | task_007 | フロント API クライアント + provider-metadata 型統一 + テスト | task_006 |
| 8 | task_008 | NodeEditor サーバー実行 UI（ボタン/モーダル/パネル/フック） | task_007 |
| 9 | task_009 | ProviderNode おまかせ + graph-to-api 透過 + パリティ fixture 整合 | task_007 |
| 10 | task_010 | ダッシュボード使用量表示の差分拡張 | — |
| 11 | task_011 | E2E + 回帰確認一式 | task_008, task_009, task_010 |
| 12 | task_012 | `.env.example` / Railway 変数 / `docs/features/workflow-runs.md` 整備 | task_011 |

バックエンド（1-6）とフロントエンド（7-10）は task_006 完了を境に直列。task_002 / task_004 / task_010 は他と独立で並行可能。

## 13. Verification Commands

リポジトリに実在するコマンドのみ:

**バックエンド（movie-maker-api/）**
- `make test`（= pytest 全体。asyncio_mode=auto）
- `pytest tests/workflows/ -v` / `pytest tests/services/test_workflow_engine.py -v` / `pytest tests/gateway/ -v` / `pytest tests/videos/test_model_selection.py -v`（個別）

**フロントエンド（movie-maker/）**
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

注: バックエンドに lint/typecheck の定義済みコマンドはない（発明しない）。フロントに typecheck 単独スクリプトはなく、型エラーは `npm run build` で検出する。回帰判定から除外するのは `test_bgm_api::test_generate_bgm_success`（ネットワーク依存、オフライン時のみ失敗）の1件のみ。旧「既知3件」（test_text_to_image ×2 / test_service ×1）は解消済みで現在パスする。

## 14. Acceptance Criteria

- **AC1**: `GET /api/v1/config/models` / `/capabilities` / `/recommended` が registry の実データを §9 ワイヤ形式で返す。未認証は 401（DEBUG バイパスがあるため dependency override で検証）。
- **AC2**: `selection_priority="quality"` かつ `video_provider` 未指定の story リクエストで、**router 時点で** registry 最高 quality_score のプロバイダに解決され、`video_generations.video_provider` に具体名が保存される。
- **AC3**: プロバイダ送信時失敗を人工的に起こすと次点プロバイダへ1回だけフォールバックし、`video_generations.video_provider`（story 経路）/ step の `provider_used`（workflow 経路）が実使用プロバイダに更新され、構造化ログにフォールバック発生が記録される。2連続失敗は failed。
- **AC4**: ImageInput→Prompt→Provider→Generate→Dialogue の保存済みワークフローをサーバー実行すると、クライアント切断状態でも completed に到達し `final_output_url` が得られる。
- **AC5**: 未対応ノードタイプ（将来ノード/不正データ）を含むグラフの execute は 400 + 未対応ノード名一覧。複数 Generate（v2v チェーン）は 400 + クライアント実行への案内文言。
- **AC6**: 耐久性/二重課金防止: (a) `submitting` のまま external_task_id が無いステップは再起動後に**再送信されず** run が failed になる（外部への二重送信ゼロ）。(b) external_task_id を持つステップはポーリング再開で完走する。(c) 再開スイープは逐次実行される。
- **AC7**: キャンセル後、以降のステップは実行されず status=canceled で停止し、未着手 Generate 分が返金される。completed/failed への cancel は 400。
- **AC8**: クォータ: (a) 予約は原子的で、残数10に対する並行 execute×2（各10本）は片方のみ成功する。(b) バッチ数がプラン上限（free/starter=1, pro=3, business=10）超過は 403。(c) failed/canceled 時に未着手分が返金され、着手済み分は消費確定する。
- **AC9**: プロセス全体の同時実行 run 数が `WORKFLOW_MAX_CONCURRENT_RUNS` を超えない（超過分は pending で待機し、枠が空くと自動開始）。
- **AC10**: `workflow_runs` は RLS により本人のみ SELECT 可。他人の workflow_id / run_id への execute / GET / cancel は 404。
- **AC11**: ダッシュボードの使用量表示が既存内容（使用数/上限・残数・プラン名・アップグレード導線）を維持したまま、プログレスバーとリセット日（API が返す場合）が追加され、コンポーネントテストが新設される。
- **AC12**: ProviderNode の「おまかせ」から実行してモデル自動選択が機能する（クライアント実行・サーバー実行の両方）。`/config/models` 取得失敗時は静的リストにフォールバックし操作継続できる。
- **AC13**: 回帰: 既存クライアント側 Execute、`/generate/story` の従来動作（video_provider 明示/未指定）、既存ワークフロー CRUD、story 直接経路の使用量加算が全て不変。`GATEWAY_ENABLED` は False のまま、`video_provider.py:223` 分岐は未使用のまま。既存テストが、環境依存の `test_bgm_api::test_generate_bgm_success`（オフライン時のみ失敗）以外グリーン。
- **AC14**: `npm run lint` / `npm run test` / `npm run build` / `npm run test:e2e` / `make test` が全て成功する。
- **AC15**: パリティ: フロント `graph-to-api.parity.test.ts` が書き出す代表グラフ→期待ペイロード fixture を、バックエンド `test_workflow_engine.py` が同一期待値として検証し、両者が同時にグリーンである。

## 15. Repair Loop

1. 検証コマンド（§13）を実行する。
2. エラー出力を全文キャプチャする（要約で潰さない）。
3. エラーを task_id にマッピングする（例: パリティ fixture 不一致 → task_004 と task_009 の両方を確認、ルート順序ミス → task_006、予約/返金の数値ズレ → task_006、Tailwind クラス欠落 → task_008）。
4. 当該タスクの関連ファイルのみをパッチする（無関係リファクタ禁止）。
5. 検証コマンドを再実行する。
6. 実装が計画から乖離した場合は本ファイル・task-list.json・acceptance-checks.json を同時に更新する（feature 名 `workflow_automation_and_unified_gateway` は3ファイルで常に一致させる）。
7. 環境依存の `test_bgm_api::test_generate_bgm_success`（ネットワーク失敗）以外の既存テスト赤化は即座に回帰として扱い、原因タスクに差し戻す。
8. パリティ fixture の変更は必ずフロント側テストの再生成で行い、バックエンド fixture の手書き修正で辻褄を合わせない。
