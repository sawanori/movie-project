# サーバーサイド・ワークフロー実行 (workflow_runs) 機能

## 1. 機能概要

ノードエディタで保存したワークフロー (`user_workflows`) を **サーバー側で耐久実行** する機能です。
ブラウザを閉じても実行が完走し、複数の入力画像へバッチ適用でき、モデルを「おまかせ」で
選択できます。

- **耐久実行**: 実行は `workflow_runs` テーブルに状態を保存しながらバックグラウンドで進行する。
  クライアント接続が切れても、Railway 上のプロセスが最後まで実行する。
- **バッチ適用**: `input_image_urls` に複数 URL を渡すと、グラフ内の唯一の ImageInput 画像を
  各 URL に差し替えた run をまとめて生成する (件数 = バッチ数)。
- **おまかせモデル選択**: `selection_priority` (`quality` | `speed` | `cost`) で送信時に最適な
  プロバイダを選ばせる。統合ゲートウェイ (`model_registry`) のメタデータで解決する。

対象は「保存済みワークフローの単一 Generate グラフ」です。サーバー実行の対応範囲 (単一
Generate 制限・v2v 非対応等) は §4 の対応ノード表と乖離ポイント決定表を参照してください。

---

## 2. API

すべて `/api/v1` プレフィックス配下。認証は Supabase JWT (共通 `get_current_user` 依存)。
req/res 概形は `app/workflows/schemas.py` と `app/gateway/router.py` から転記。

### 2.1 ワークフロー実行

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/v1/workflows/{id}/execute` | 保存済みワークフローをサーバー実行 (202) |
| GET  | `/api/v1/workflows/runs` | 自分の実行履歴一覧 |
| GET  | `/api/v1/workflows/runs/{run_id}` | 実行詳細 (ステップ内訳つき) |
| POST | `/api/v1/workflows/runs/{run_id}/cancel` | 実行のキャンセル |

> ルート宣言順の注意: FastAPI は宣言順マッチのため、`/workflows/runs...` 系は
> `GET /workflows/{workflow_id}` より **前** に定義されている
> (`app/workflows/router.py`)。後ろに置くと `runs` が `workflow_id` として解釈される。

#### `POST /api/v1/workflows/{id}/execute`

Request (`ExecuteRequest`):

```jsonc
{
  "input_image_urls": ["https://.../a.jpg", "https://.../b.jpg"], // 任意。件数=バッチ数。未指定なら単発
  "video_provider": "runway",                                     // 任意。プロバイダの明示指定
  "selection_priority": "quality"                                 // 任意。"quality"|"speed"|"cost"
}
```

Response (202, `ExecuteResponse`):

```jsonc
{ "batch_id": "uuid", "run_ids": ["uuid", "uuid"] }
```

エラー: 404 (他人/不存在のワークフロー)、400 (未対応ノード / 複数 Generate / v2v チェーン /
バッチ前提違反 / 入力欠落)、403 (バッチ上限超過 / クォータ予約不足)。

#### `GET /api/v1/workflows/runs`

Query: `workflow_id` (任意, 絞り込み)、`page` (>=1, 既定 1)、`per_page` (1-100, 既定 20)。

Response (`RunListResponse`):

```jsonc
{
  "runs": [
    {
      "id": "uuid", "workflow_id": "uuid", "batch_id": "uuid",
      "status": "processing",           // pending|submitting|processing|completed|failed|canceled
      "progress": 50,                    // 0-100
      "final_output_url": null,
      "error_message": null,
      "created_at": "2026-07-11T..."
    }
  ],
  "total": 1, "page": 1, "per_page": 20
}
```

> `total` の既知制限は §7 を参照 (現状はページ内件数を返す)。

#### `GET /api/v1/workflows/runs/{run_id}`

Response (`RunDetailResponse` = `RunResponse` + `steps`):

```jsonc
{
  "id": "uuid", "workflow_id": "uuid", "batch_id": "uuid",
  "status": "completed", "progress": 100,
  "final_output_url": "https://.../out.mp4", "error_message": null,
  "created_at": "2026-07-11T...",
  "steps": [
    {
      "node_id": "gen-1", "node_type": "generate",
      "status": "completed",            // pending|submitting|processing|completed|failed|skipped
      "output_url": "https://.../gen-1.mp4",
      "error_message": null, "provider_used": "runway"
    }
  ]
}
```

エラー: 404 (実行が見つからない / 他人の実行)。

#### `POST /api/v1/workflows/runs/{run_id}/cancel`

pending / processing / submitting の run のみキャンセル可能 (→ canceled)。completed / failed /
canceled は 400。Response は `RunResponse`。実際の停止と未着手分の返金はバックグラウンド
プロセッサが担う (§6 参照)。

### 2.2 統合ゲートウェイ カタログ (おまかせ選択の裏付け)

休眠中の `model_registry` のメタデータを **読み取り専用** で公開する独立経路。
`GATEWAY_ENABLED` フラグには依存しない (`app/gateway/router.py`)。

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/api/v1/config/models` | 登録済みモデルのメタデータ一覧 (`capability` で絞り込み可) |
| GET | `/api/v1/config/capabilities` | `capability -> [{name, provider}]` のマップ |
| GET | `/api/v1/config/recommended` | `priority`/`capability` に対する推奨モデル `{name, provider}` |

- `GET /config/models?capability=i2v` → `[{name, provider, capabilities, quality_score,
  speed_score, cost_per_second, max_duration, supported_aspect_ratios}, ...]`
- `GET /config/capabilities` → `{ "i2v": [{"name": "...", "provider": "..."}], ... }`
- `GET /config/recommended?priority=quality&capability=i2v` → `{"name": "...", "provider": "..."}`
  (不正な `priority` は 422、該当モデルなしは 404)

---

## 3. 実行アーキテクチャ (グラフ → ステップ列 → 耐久実行)

1. **コンパイル**: `app/services/workflow_engine.py` の `compile_graph(nodes, edges)` が、
   ビジュアルエディタと同じ `nodes`/`edges` グラフを **純粋関数** (I/O なし) で
   「順序付きステップ列」に変換する。フロントの
   `movie-maker/components/node-editor/utils/graph-to-api.ts` のサーバー側対応物。
2. **予約 + run 生成**: `app/workflows/service.py` の `create_runs` がクォータを原子予約し
   (§5)、バッチ数分の `workflow_runs` を service-role で INSERT する。
3. **耐久実行**: `app/tasks/workflow_run_processor.py` が各 run をステップ順に逐次実行し、
   各ステップ完了ごとに `compiled_steps` の状態を DB へ書き戻す。

Generate ステップは既存プロバイダ経路 (`submit_with_fallback` → `check_status` →
`download_video_bytes` → `ffmpeg_service`) を、dialogue / utility は既存 processor / service を
呼ぶ。プロセッサは **オーケストレーションに徹し、新規の外部 API 呼び出しは書かない**。

---

## 4. 対応ノード表と乖離ポイント決定表

> 以下は `app/services/workflow_engine.py` の実装 (定数定義と docstring) から **転記** した
> ものです。コードとの乖離を作らないため、変更時は同ファイルと突き合わせること。

### 4.1 スコープ (server-execution v1)

`workflow_engine.py:9-14` より:

- Generate ノードは **1 グラフにちょうど 1 個**。
- Generate ステップを先頭に、後段チェーンステップ (Dialogue / GetVideoFrame / TrimVideo /
  StitchVideos) を依存関係を尊重した安定順で並べる。
- DAG 並列なし、条件分岐なし、複数 Generate なし、**v2v (Generate→Generate) チェーンなし**。

**単一 Generate 制限・v2v チェーンはクライアント実行へ**: 複数 Generate は
`MultipleGenerateError`、v2v チェーン (VideoInput → Generate の source、または
Generate → Generate) は `V2vChainNotSupportedError` として 400 で拒否され、クライアント実行を
案内する。

### 4.2 対応ノードタイプ

`workflow_engine.py:117-139` より。ソースオブトゥルースは
`movie-maker/components/node-editor/utils/node-types.ts` の 22 個の登録済みエディタノード。

| 区分 | ノードタイプ |
|------|-------------|
| **Generate 入力ノード** (`GENERATE_INPUT_NODE_TYPES`) | `imageInput`, `videoInput`, `prompt`, `provider`, `cameraWork`, `klingMode`, `klingElements`, `klingEndFrame`, `klingCameraControl`, `actTwo`, `hailuoEndFrame`, `bgm`, `filmGrain`, `lut`, `overlay`, `omniReference` |
| **後段 (チェーン) ノード** (`DOWNSTREAM_NODE_TYPES`) | `dialogue`, `getVideoFrame`, `trimVideo`, `stitchVideos` |
| **無視 (装飾)** (`IGNORED_NODE_TYPES`) | `stickyNote` (登録済みだが装飾的 → ステップにならない) |
| **生成** | `generate` |

上記以外のノードタイプは `UnsupportedNodeError` (→ 400) で拒否される。

### 4.3 Generate ステップの params マッピング (抜粋)

Generate ステップの `params` は `app.videos.schemas.StoryVideoCreate` に検証される dict。
主なマッピング (`workflow_engine.py:17-45` より、graph-to-api.ts をトレース):

- `ImageInput.imageUrl` → `image_url` (必須。ImageInput 画像が無い場合は決定 (c) により
  `KlingElements.elementImages[0]` にフォールバック)
- `Prompt.englishPrompt` → `story_text` (必須) / `Prompt.subjectType` → `subject_type`
- `Provider.provider` → `video_provider` (既定 `runway`) / `Provider.aspectRatio` →
  `aspect_ratio` (既定 `9:16`)
- `Provider.duration` + プロバイダ種別 → `kling_duration` | `seedance_duration` | `veo_duration`
- Seedance 系 (`seedance_mode` / `seedance_generate_audio` / `seedance_seed` /
  `seedance_resolution` / `seedance_camera_fixed`)、Kling 系 (`kling_mode` / `element_images` /
  `end_frame_image_url` / `kling_camera_control`)、Act-Two 系、Hailuo end frame、
  OmniReference (`image|video|audio_reference_asset_ids`、consent 必須) はプロバイダ所有

後段ステップは `StoryVideoCreate` ではなく独自 `params` を持つ (`workflow_engine.py:47-51`):

- `Dialogue` → `{text, voice_id, speed, use_lip_sync, tts_instructions, kana_text,
  use_kana_mode, source_video_node_id}`
- `GetVideoFrame` → `{direction, source_video_node_id}`
- `TrimVideo` → `{start_seconds, end_seconds, source_video_node_id}`
- `StitchVideos` → `{transition, source_video_node_ids}` (順序付きリスト, video_1..video_5)

### 4.4 乖離ポイント決定表 (graph-to-api.ts の挙動: 再現 vs 拒否)

`workflow_engine.py:77-106` の decision table から **転記**:

| # | 挙動 | 決定 | 要旨 |
|---|------|------|------|
| (a) | 未接続の config ノードへの「グラフ内で最初の型 X」グローバルフォールバック (graph-to-api.ts:111-135, `TODO(Phase 2)` で削除予定) | **REJECT (再現しない)** | サーバーは config ノードを Provider の `*_input` handle にエッジ接続することを要求する (エッジトレース解決のみ)。フォールバックは非推奨で複数プロバイダと曖昧、再現すれば新規債務になる。未接続 config ノードは単に無視 (フィールド不在) される |
| (b) | Kling 6 軸カメラ制御が `camera_work` を削除する (graph-to-api.ts:412-420。非ゼロ軸があると `kling_camera_control` を設定し `camera_work` を削除) | **REPRODUCE (再現)** | 優先順位が同一なので、両方を使う Kling グラフでパリティが保たれる |
| (c) | KlingElements 画像が ImageInput の代替になる (graph-to-api.ts:299-301。ImageInput 画像が無ければ最初の KlingElements element 画像を `image_url` に) | **REPRODUCE (単発 Generate ペイロード)** | ただし **バッチ実行は不適格**。画像が KlingElements 由来だと「ImageInput ちょうど 1 個」というバッチ規則に反するため、`validate_batch_preconditions` が `BatchPreconditionError` を送出する |
| (d) | Provider ガード (V2V=Runway 強制、Kling/Hailuo/Seedance/Veo のフィールド所有) (graph-to-api.ts:228-229 と StoryVideoCreate validator) | **REPRODUCE (再現)** | provider→field マッピングを graph-to-api.ts と一致させ、不整合は StoryVideoCreate に拒否させる。なお server-execution v1 は V2V グラフをそもそもコンパイルしない (VideoInput source や Generate→Generate は拒否) |

---

## 5. クォータ予約 / 返金ポリシー

実装: `app/workflows/service.py` (予約)、`app/tasks/workflow_run_processor.py` (返金)、
`docs/migrations/20260707_workflow_runs.sql` の `reserve_video_quota` / `release_video_quota`。

### 5.1 原子予約 (TOCTOU 安全)

execute 時に **「Generate ステップ数 × バッチ数」** を `reserve_video_quota` RPC で原子予約する。
この RPC は `users.video_count_this_month + p_count <= p_limit` の場合のみ加算して `true` を、
超過なら加算せず `false` を返す (SQL 関数側で原子的に判定するため TOCTOU 安全)。`false` は
403 (不足本数を文言に含む)。

### 5.2 返金 (未着手 pending 分のみ)

run が **failed / canceled で確定** した時、`_count_pending_generate_steps` が数える
**未着手 (pending) の Generate ステップ分のみ** を `release_video_quota` で返金する
(下限 0)。**submitting 以降 (submitting / processing / completed / failed) のステップは消費確定
とみなし返金しない**。

返金トリガー: ステップ失敗、未対応ステップ、キャンセル確定、再開時の submitting スタック
(§6)。RPC 失敗で run 確定処理をクラッシュさせず、ログのみに留める。

### 5.3 プラン別バッチ上限

`app/core/dependencies.py:get_plan_limits` の `max_batch_size` より:

| プラン | バッチ上限 (`max_batch_size`) | 月間生成上限 (`max_videos_per_month`) |
|--------|------------------------------|--------------------------------------|
| free | 1 | 3 |
| starter | 1 | 5 |
| pro | 3 | 15 |
| business | 10 | 50 |

バッチ数が上限を超えると 403。

---

## 6. submitting プロトコルと再開の意味論

実装: `app/tasks/workflow_run_processor.py`、起動フックは `app/main.py`。

### 6.1 submitting プロトコル (二重課金ゼロ)

外部プロバイダへ送信する **直前** にステップを `submitting` として DB 保存 → 送信 →
`external_task_id` を保存して `processing` へ遷移する。

### 6.2 プロセス断からの再開

- **`external_task_id` あり** (送信済み): 送信フェーズをスキップし、既存 task_id で
  ポーリングから継続する。**再送信しない = 二重課金しない**。
- **`submitting` のまま task_id 無し**: 外部で生成が進行している可能性があるため、
  **再送信せず run を failed 化** し、未着手 Generate 分を返金する (二重課金より安全側に倒す)。

### 6.3 起動時スイープ (逐次)

`app/main.py` の起動フックが、`processing` のまま取り残された run を **逐次** 再開する
(同時一斉再開しない = サンダリングハード防止)。各 run はセマフォ取得込みで 1 件ずつ await
される。

---

## 7. 同時実行制御

`WORKFLOW_MAX_CONCURRENT_RUNS` (既定 3) のプロセス内 `asyncio.Semaphore` を 1 個共有する
(`workflow_run_processor.py`)。`start_workflow_run` はセマフォ取得後に実行し、超過分は
セマフォ取得までブロックして待機する (run は pending のまま枠が空くのを待つ)。Railway 単一
プロセス前提の安全弁。

---

## 8. 送信時フォールバック

実装: `app/external/video_provider.py` の `submit_with_fallback`。

- **対象経路**: サーバー実行の Generate は汎用 i2v 引数 (`image_url` / `prompt` / `duration` /
  `aspect_ratio` / `camera_work`) のみで `submit_with_fallback(capability="i2v")` を呼ぶ。
  おまかせ / 一般 i2v 経路のみが対象。
- **フォールバック条件**: **送信時 (generate_video) の失敗またはタイムアウト時のみ**。次点は
  priority ランキングで第一候補の次に来るプロバイダ **1 つだけ**、**1 回だけ**再送信する。
  ポーリング中の失敗はフォールバック対象外。
- **タイムアウト**: 送信 1 回あたり **15 秒** (`_FALLBACK_SEND_TIMEOUT_SECONDS = 15.0`)。
  応答が滞る第一候補を待ち続けず速やかに次点へ回す。
- **provider 固有機能はフォールバックしない**: 次点には汎用引数のみを渡す
  (プロバイダ固有 extra_params は別プロバイダで解釈できないため)。したがって Act-Two /
  Seedance omni / Kling 詳細のようなプロバイダ固有機能はフォールバック経路に載らない。

---

## 9. bg_removal との再開方式の差異

背景削除 (`app/tasks/bg_removal_processor.py`) は、保存済み fal ジョブ参照が無い (投入前に
中断された pending) 場合、**通常のフル処理 (submit から) を再実行** する。

これに対し本機能は、**「submitting のまま task_id 無し」を再送信せず failed 化** する
(外部課金の二重発注を避ける保守的方針)。外部で動画生成が進行している可能性がある以上、
再送信より failed + 返金の方が安全と判断している。

---

## 10. 既知の制限 (コードレビューで確認済み。正直に記載)

1. **DEBUG モードでもクォータを消費する (非対称)**
   story 直接経路は DEBUG でクォータ検査をバイパスする (`app/core/dependencies.py:95` の
   `check_usage_limit` が `settings.DEBUG` で早期 return)。一方 workflow execute はバッチ
   安全性のため、DEBUG でも `reserve_video_quota` を実行して消費する
   (`app/workflows/service.py` の `_reserve_or_403` に DEBUG ガードなし)。この非対称のため、
   **ローカルで execute を繰り返すと `users.video_count_this_month` が実加算される**。

2. **キャンセルは実行中ステップを打ち切らない**
   cancel は次ステップ境界で有効化される (`_run_steps` が各ステップ開始前に status を再読込)。
   **実行中 (ポーリング中) の Generate は完走し消費確定** (最大約 10 分:
   `_GENERATE_POLL_INTERVAL_SECONDS=10` × `_GENERATE_MAX_POLL_ATTEMPTS=60`)。仕様どおりだが、
   キャンセル即時停止ではない。

3. **`list_runs` の `total` はページ内件数**
   現状 `total` は返却ページ内の件数を返す (全件数ではない。`app/workflows/service.py` の
   `list_runs`)。多数の run を持つユーザーのページネーション表示が不正確になり得る軽微な
   既知制限 (フォローアップ候補。修正には `tests/workflows/test_execution.py` の fake supabase
   の count モデル化が必要)。

---

## 11. Railway 設定手順

1. **環境変数** `WORKFLOW_MAX_CONCURRENT_RUNS` を設定 (任意。未設定なら既定 3)。単一プロセス
   前提の同時実行上限。`.env.example` 参照。
2. **マイグレーション**: `workflow_runs` テーブル + `reserve_video_quota` /
   `release_video_quota` 関数のマイグレーション
   (`docs/migrations/20260707_workflow_runs.sql`) は **本番適用済み**。
3. `GATEWAY_ENABLED` は本機能では **既定 False のまま**でよい (カタログ公開・おまかせ選択は
   このフラグに依存しない独立経路)。

---

## 12. 関連ファイル

- グラフコンパイラ (純粋関数): `movie-maker-api/app/services/workflow_engine.py`
- 実行サービス (予約 / run 生成): `movie-maker-api/app/workflows/service.py`
- 耐久実行プロセッサ: `movie-maker-api/app/tasks/workflow_run_processor.py`
- API ルーター: `movie-maker-api/app/workflows/router.py`
- スキーマ: `movie-maker-api/app/workflows/schemas.py`
- ゲートウェイ カタログ: `movie-maker-api/app/gateway/router.py`
- 送信時フォールバック: `movie-maker-api/app/external/video_provider.py`
- Migration: `docs/migrations/20260707_workflow_runs.sql`
- 起動フック (再開スイープ / セマフォ): `movie-maker-api/app/main.py`
