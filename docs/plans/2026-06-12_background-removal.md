# 背景削除機能 設計書

作成日: 2026-06-12
根拠: docs/research/2026-06-12_bg-removal-tech-selection.md（技術選定）+ コードベース調査

## 1. 概要

動画・画像の背景をAIで削除し、透過アセット（WebM VP9アルファ / ProRes 4444 / 透過PNG）を生成する機能。
推論は **fal.ai** のキュー型APIに委譲（GPUなしのRailway環境のため）。モデルはコンフィグで切替可能、デフォルトは検証済み最安・最適合の **Bria VRMBG 3.0**。

| 項目 | 値 |
|------|----|
| 動画モデル（デフォルト） | `bria/video/background-removal/v3`（$0.00425/秒、入力上限60秒） |
| 画像モデル（デフォルト） | `fal-ai/bria/background/remove`（$0.018/枚） |
| 動画出力 | WebM VP9アルファ（デフォルト・ブラウザプレビュー可）/ ProRes 4444（`mov_proresks`、NLE納品用） |
| 画像出力 | 透過PNG |
| 認証 | `Authorization: Key {FAL_KEY}` |

### fal キューAPIフロー（検証済み）
1. `POST https://queue.fal.run/{model_id}` （JSON入力）→ `{request_id, status_url, response_url, cancel_url}`
2. `GET {status_url}` をポーリング → `IN_QUEUE | IN_PROGRESS | COMPLETED`
3. `GET {response_url}` → 結果JSON（動画/画像URL。falのCDN URLは恒久保証がないため**即R2へ転写**）

**重要**: status_url/response_url は submit レスポンスで返るものを**そのまま永続化して使う**（ネストしたモデルIDのURL構築規則に依存しない）。読み戻し時はホストが `queue.fal.run` であることを検証する。

## 2. バックエンド設計（movie-maker-api）

### 2.1 config（app/core/config.py に追記）
```python
# fal.ai (Background Removal)
FAL_KEY: str = ""
FAL_BG_REMOVAL_VIDEO_MODEL: str = "bria/video/background-removal/v3"
FAL_BG_REMOVAL_IMAGE_MODEL: str = "fal-ai/bria/background/remove"
BG_REMOVAL_MOCK: bool = False  # ローカルE2E用: trueでfalを呼ばずsource_urlをそのまま結果として返す
```

### 2.2 external/fal_provider.py（新規）
`piapi_kling_provider.py` の httpx パターンに準拠。

```python
class FalProviderError(Exception): ...  # ユーザー向けメッセージに人間化

@dataclass
class FalJobRef:
    request_id: str
    status_url: str
    response_url: str

@dataclass
class FalJobStatus:
    status: str            # "pending" | "processing" | "completed" | "failed"
    progress: int          # IN_QUEUE=0, IN_PROGRESS=50, COMPLETED=100（falは%を返さないため擬似値）
    result_url: Optional[str]   # 完了時のみ
    error_message: Optional[str]

class FalBackgroundRemovalProvider:
    provider_name = "fal"
    async def submit_video(self, video_url: str, output_format: str = "webm") -> FalJobRef
        # body: {"video_url": ..., "background_color": "Transparent",
        #        （output_format=="prores" の場合のみ出力コーデック指定 "mov_proresks"。
        #          enum名はBria v3 APIスキーマで実装時に確認。webmはデフォルトのため未指定）}
    async def submit_image(self, image_url: str) -> FalJobRef
        # body: {"image_url": ...}
    async def check_status(self, ref: FalJobRef) -> FalJobStatus
        # GET status_url。COMPLETED時は response_url から結果を取得し result_url を抽出
        # 結果JSONの動画/画像URLはキー名がモデルで異なるため再帰探索（http && 拡張子）で抽出
```
- タイムアウト: submit 60s / status 30s
- エラー人間化: 401/403→「fal.aiのAPIキーが無効です」、402/429→「fal.aiのクレジット不足またはレート制限です」、422→詳細をそのまま、5xx→「fal.ai側のエラーが発生しました」
- `FAL_KEY` 未設定で `ValueError`（PiAPIと同パターン）
- `BG_REMOVAL_MOCK=true` のとき: submit はダミー `FalJobRef(request_id="mock-...")` を返し、check_status は即 `completed`・`result_url=source_url` を返す（外部通信なし）

### 2.3 DBテーブル（docs/migrations/20260612_background_removals.sql 新規）
`lip_sync_generations` のパターンを踏襲:

```sql
CREATE TABLE background_removals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','completed','failed')),
    progress INT NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL CHECK (source_type IN ('video','image')),
    source_url TEXT NOT NULL,
    output_format TEXT NOT NULL DEFAULT 'webm'
        CHECK (output_format IN ('webm','prores','png')),
    provider TEXT NOT NULL DEFAULT 'fal',
    model_id TEXT,
    provider_request_id TEXT,
    provider_status_url TEXT,
    provider_response_url TEXT,
    output_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
+ user_id/status インデックス、updated_at トリガー、RLS（本人SELECTのみ＋service_role全権 — 書き込みはバックエンド経由のみ。omni_reference_assetsのパターン）

### 2.4 ドメイン app/background_removal/（新規: router.py / service.py / schemas.py）
- `POST /api/v1/background-removal`
  - body: `{source_type: "video"|"image", source_url: str(URL検証), output_format?: "webm"|"prores"}`（imageは強制的にpng）
  - `Depends(get_current_user)`。DB行作成 → `start_bg_removal_processing(id)`（`asyncio.create_task`）→ 即 `BackgroundRemovalResponse` 返却
- `GET /api/v1/background-removal/{id}/status` → `{id, status, progress, output_url, error_message}`（user_id一致チェック、404）
- `GET /api/v1/background-removal?page=&per_page=` → 自分のジョブ一覧（新しい順）
- main.py に `app.include_router(background_removal_router, prefix="/api/v1")`、router 自体は `prefix="/background-removal", tags=["BackgroundRemoval"]`
- 入力ソースのアップロードは既存エンドポイントを再利用（動画=既存のユーザー動画アップロード、画像=upload-image系）。新設しない。

### 2.5 tasks/bg_removal_processor.py（新規）
`lip_sync_processor.py` と同型:
1. DB行取得 → status=processing
2. provider.submit_*() → request_id/status_url/response_url を DB保存
3. ポーリング: 5秒間隔・最大144回（12分）— Bria動画は実測数分想定
4. 完了: 結果URLから `download_file()` → R2 `upload_with_key(content, f"bg-removal/{user_id}/{id}.{ext}", content_type)` → `output_url` 更新・progress=100
   - ext/content_type: webm→video/webm, prores→mov(video/quicktime), png→image/png
5. 失敗/タイムアウト: status=failed・error_message 更新
6. 全体 try/except で failed 確定（握りつぶし禁止）

### 2.6 テスト（tests/background_removal/ + tests/external/ + tests/tasks/）
既存の lip_sync テストパターン（auth_client fixture・AsyncMock・get_supabase patch・asyncio.sleep patch）に準拠:
- test_router.py: POST成功/不正body(422)/status取得/他人のID(404)/一覧
- test_service.py: 行作成・status取得のSupabaseモック
- test_fal_provider.py: httpx.AsyncClient をモックし submit/status/エラー人間化/モックモード
- test_bg_removal_processor.py: 成功フロー（submit→poll→R2→DB completed）/プロバイダ失敗/タイムアウト

## 3. フロントエンド設計（movie-maker）

### 3.1 ページ app/background-removal/page.tsx（新規）
concat ページのパターン（useState + useEffect + setInterval 3秒ポーリング）に準拠。フロー:
1. **アップロード**: react-dropzone。タブまたは自動判別で 動画（MP4/MOV、最大200MB・**60秒以内** — クライアント側で `<video>` metadata により尺検証）/ 画像（PNG/JPEG/WebP、最大20MB）
2. **出力形式選択**（動画のみ）: 「WebM（透過・Web用）」デフォルト / 「ProRes 4444（編集ソフト納品用）」
3. **実行**: 既存アップロードAPIでR2へ → `backgroundRemovalApi.create()` → jobId 保存
4. **進捗**: 3秒ポーリング（completed/failed で停止、最大10分でタイムアウト表示）。インライン進捗バー（既存スタイル踏襲）
5. **結果**:
   - webm/png: **チェッカーボード背景**（CSS `repeating-conic-gradient`）上に `<video autoPlay loop muted playsInline>` / `<img>` で透過プレビュー
   - prores: プレビュー不可の旨を表示しダウンロードのみ
   - ダウンロードボタン（fetch→Blob→a[download]、concatの既存パターン）
   - Safari注意書き（WebM透過はChrome/Firefox推奨）
6. エラー時: error_message を表示してリトライ可能に

### 3.2 API client（lib/api/client.ts に追記）
```typescript
export const backgroundRemovalApi = {
  create: (body: {source_type: "video"|"image"; source_url: string; output_format?: "webm"|"prores"}) =>
    fetchWithAuth("/api/v1/background-removal", {method: "POST", body: JSON.stringify(body), headers: {"Content-Type": "application/json"}}),
  getStatus: (id: string) => fetchWithAuth(`/api/v1/background-removal/${id}/status`),
  list: (page = 1, perPage = 20) => fetchWithAuth(`/api/v1/background-removal?page=${page}&per_page=${perPage}`),
};
```
型は既存のレスポンス型定義の流儀に合わせる。

### 3.3 ナビゲーション
components/layout/header.tsx のログイン時ナビ（リップシンク等と同列）に `<Link href="/background-removal">背景削除</Link>` を追加（既存のアイコン+テキストの体裁に合わせ、lucide-react の `Scissors` 等を使用）。

### 3.4 制約（厳守）
- **globals.css に `@source` を追加しない**（Tailwind v4が壊れる）
- レスポンシブグリッドが必要な場合は globals.css 既存の属性セレクタ override を確認
- UIテキストは日本語ハードコード（既存方針）
- ダークテーマのCSS変数（--color-surface 等）を使用

### 3.5 テスト
- Vitest + RTL: ページの主要状態（アップロード前/検証エラー/処理中/完了/失敗）。api client はモック
- 既存テストの体裁（tests/ 配下）に準拠

## 4. 検証計画

1. バックエンド: `make test` 全通過（既知の既存失敗3件は除外: test_text_to_image×2, library/test_service×1）
2. フロントエンド: `npm run lint && npm run test && npm run build` 全通過
3. ローカルE2E（モック）: `BG_REMOVAL_MOCK=true` で両サーバー起動 → ブラウザ相当のフロー（アップロード→ジョブ→ポーリング→結果表示）を curl + Playwright で確認
4. マイグレーション適用は Supabase MCP（apply_migration）で実施し、テーブル存在を verify
5. 実API検証（FAL_KEY取得後）: scripts/poc_bg_removal.py で3モデル比較 → デフォルトモデル最終確定 → モック無効で実E2E

## 5. 非スコープ（v2候補）

- クレジット/プラン制限との連動（check_usage_limit は動画生成用。背景削除の課金設計は別途）
- ライブラリへの自動保存・履歴ページ
- Webhook受信（fal_webhook）への切替 — ポーリングで開始し、Railway上で安定したら移行検討
- 画像のProRes/一括処理、動画の部分マスク指定（SwitchX的編集）
