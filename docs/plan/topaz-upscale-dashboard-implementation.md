# Topaz APIによるダッシュボード動画アップスケール機能 実装計画書

## 概要

### 目的
ダッシュボードの「アップロード動画」タブにおいて、ユーザーがアップロードした動画をTopaz Video APIのEnhancementフィルターで高解像度化（アップスケール）できる機能を追加する。

### 背景
- 現在の解像度アップスケールは **Runway AI** を使用（`upscale_processor.py`）
- Topaz Video AIはアップスケール品質が業界トップクラスで、既にAPIキーを保有
- 既存の60fps変換でTopaz APIの6ステップワークフローが実装済み → 再利用可能
- ダッシュボードのアップロード動画（`user_videos`テーブル）にはアップスケール機能が未実装

### スコープ
- ダッシュボードのアップロード動画に対するTopaz APIアップスケール機能追加
- バックエンド：サービス・プロセッサ・APIエンドポイント
- フロントエンド：アップスケールボタン・ステータス表示・結果プレビュー
- 既存のRunwayアップスケール機能は既存のシーン動画/ストーリーボード向けにそのまま維持

### 設計判断: 新テーブル `user_video_upscales` を分離する理由
既存の `video_upscales` テーブルは Runway API 用で `runway_task_id` カラムを持つ。
Topaz Enhancement は固有のカラム（`model`, `target_width`, `target_height`, `topaz_request_id`, `estimated_credits_min/max`）が必要であり、
既存スキーマとの互換性がないため、専用テーブルとして分離する。

---

## Topaz Video API Enhancement仕様

### 利用可能モデル

| モデル名 | モデルID | 用途 | 推奨ユースケース |
|----------|----------|------|-----------------|
| **Proteus** | `prob-4` | 汎用Enhancement | 低〜中画質のアップスケール、ノイズ除去（推奨デフォルト） |
| **Artemis HQ** | `ahq-12` | 高画質Enhancement | 高画質素材のさらなる向上 |
| **Artemis MQ** | `amq-13` | 中画質Enhancement | 中程度の画質改善 |
| **Artemis LQ** | `alq-13` | 低画質Enhancement | 低画質素材の復元 |
| **Gaia HQ** | `ghq-5` | 高画質バランス型 | ディテール・ノイズのバランス |
| **Gaia CG** | `gcg-5` | CG/アニメ向け | CG映像・アニメーションの高画質化 |
| **Nyx** | `nyk-3` | 高解像度デノイズ | ノイズ多めの映像向け |
| **Rhea** | `rhea-1` | 4xアップスケール特化 | 高精度な4倍拡大 |
| **Iris** | `iris-3` | 顔特化Enhancement | 人物映像の顔ディテール復元 |
| **Theia Detail** | `thd-3` | ディテール強化 | シャープ化・細部の強調 |
| **Theia Fine** | `thf-4` | 微細ディテール | 高画質映像のさらなるシャープ化 |

### APIリクエスト形式（Enhancement用）

```json
{
  "source": {
    "container": "mp4",
    "size": 50000000,
    "duration": 10.0,
    "frameCount": 300,
    "frameRate": 30.0,
    "resolution": { "width": 1080, "height": 1920 }
  },
  "filters": [{
    "model": "prob-4",
    "auto": "Auto",
    "videoType": "Progressive"
  }],
  "output": {
    "resolution": { "width": 2160, "height": 3840 },
    "frameRate": 30,
    "audioCodec": "AAC",
    "audioTransfer": "Copy",
    "videoEncoder": "H265",
    "dynamicCompressionLevel": "High",
    "container": "mp4"
  }
}
```

**フレーム補間との違い:**
- `filters`: `fps`, `slowmo`, `duplicate` パラメータなし。`model` + `auto` + `videoType` を指定
- `output.resolution`: ソース解像度ではなく **アスペクト比を維持した目標解像度** を指定（倍率ベースで自動計算）
- `output.videoEncoder`: 4K以上のアップスケールでは `H265` を使用（H264は4096x4096上限）

### APIレスポンス形式（Step 1: POST /video/）

```json
{
  "requestId": "UUID",
  "estimates": {
    "cost": [10, 15],
    "time": [120, 180]
  }
}
```

**注意:** `estimatedCredits` フィールドは存在しない。`estimates.cost` は `[下限, 上限]` の配列で、下限値が実際の課金額。

### 6ステップワークフロー（既存と共通）

```
1. POST /video/         → リクエスト作成（estimates.cost を取得）
2. PATCH /video/{id}/accept → アップロードURL取得（urls 配列 + uploadId）
3. PUT (S3 URL)         → 動画をURL数で等分割してアップロード（ストリーミング）
4. PATCH /video/{id}/complete-upload/ → アップロード完了通知（uploadResults）
5. GET /video/{id}/status → ポーリング（10秒間隔、最大20分）
   ステータス値: requested, accepted, initializing, preprocessing, processing, postprocessing, complete, failed
6. GET (download.url)   → 結果ダウンロード（有効期限付きURL、即座にR2へ転送する）
```

---

## 実装計画

### Phase 1: DBマイグレーション（最初に実行 — 他Phaseの前提）

#### 1-1. `user_video_upscales` テーブル

```sql
CREATE TABLE user_video_upscales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_video_id UUID NOT NULL REFERENCES user_videos(id) ON DELETE CASCADE,

    -- 動画URL
    original_video_url TEXT NOT NULL,
    upscaled_video_url TEXT,
    thumbnail_url TEXT,

    -- Topaz設定
    model TEXT NOT NULL DEFAULT 'prob-4',
    target_width INT NOT NULL,
    target_height INT NOT NULL,
    topaz_request_id TEXT,

    -- ステータス管理
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    progress INT DEFAULT 0,                   -- 0-100
    error_message TEXT,
    estimated_credits_min INT,    -- estimates.cost[0] (実際の課金額)
    estimated_credits_max INT,    -- estimates.cost[1]
    estimated_time_min INT,       -- estimates.time[0] (秒)
    estimated_time_max INT,       -- estimates.time[1] (秒)

    -- タイムスタンプ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_video_upscales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_video_upscales_updated_at
    BEFORE UPDATE ON user_video_upscales
    FOR EACH ROW
    EXECUTE FUNCTION update_user_video_upscales_updated_at();

-- RLSポリシー
ALTER TABLE user_video_upscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own upscales"
    ON user_video_upscales FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own upscales"
    ON user_video_upscales FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own upscales"
    ON user_video_upscales FOR DELETE
    USING (auth.uid() = user_id);

-- service_role からのフルアクセス（バックグラウンドタスク用）
-- NOTE: UPDATEはバックグラウンドタスク(service_role)経由のみ。ユーザーからの直接UPDATEは不許可。
CREATE POLICY "Service role full access on user_video_upscales"
    ON user_video_upscales FOR ALL
    USING (auth.role() = 'service_role');

-- インデックス
CREATE INDEX idx_user_video_upscales_user_id ON user_video_upscales(user_id);
CREATE INDEX idx_user_video_upscales_user_video_id ON user_video_upscales(user_video_id);
CREATE INDEX idx_user_video_upscales_status ON user_video_upscales(status);

-- テーブル・カラムコメント
COMMENT ON TABLE user_video_upscales IS 'ユーザーアップロード動画のTopaz Enhancementアップスケールタスク管理テーブル';
COMMENT ON COLUMN user_video_upscales.model IS 'Topaz Enhancementモデル (prob-4, ahq-12, alq-13, ghq-5, gcg-5, nyk-3, rhea-1, iris-3, thd-3, thf-4)';
COMMENT ON COLUMN user_video_upscales.topaz_request_id IS 'Topaz API requestId (キャンセル用)';
```

---

### Phase 2: バックエンドサービス層（`topaz_service.py` 拡張）

#### 2-1. クラスリネーム

`TopazInterpolationService` → `TopazVideoService` にリネームする。
既存の参照箇所（`interpolation_processor.py` の1箇所のみ）も合わせて更新。

#### 2-2. Enhancementモデル Enum（`schemas.py` に1箇所のみ定義）

```python
class EnhanceModel(str, Enum):
    """Topaz Enhancement モデル"""
    PROTEUS = "prob-4"       # 汎用（推奨デフォルト）
    ARTEMIS_HQ = "ahq-12"   # 高画質
    ARTEMIS_MQ = "amq-13"   # 中画質
    ARTEMIS_LQ = "alq-13"   # 低画質復元
    GAIA_HQ = "ghq-5"       # バランス型
    GAIA_CG = "gcg-5"       # CG/アニメ向け
    NYX = "nyk-3"            # デノイズ特化
    RHEA = "rhea-1"          # 4xアップスケール特化
    IRIS = "iris-3"          # 顔特化Enhancement
    THEIA_DETAIL = "thd-3"   # ディテール強化
    THEIA_FINE = "thf-4"     # 微細ディテール
```

#### 2-3. 追加メソッド

```python
class TopazVideoService:
    # ... 既存メソッド（interpolate_to_60fps 等）...

    async def enhance_video(
        self,
        video_url: str,
        model: str = "prob-4",
        scale_factor: int = 2,  # 2x or 4x
        progress_callback: Optional[callable] = None,
    ) -> dict:
        """
        動画をアップスケール（Enhancement）

        Returns:
            dict: {
                "download_url": str,
                "estimated_credits_min": int,
                "estimated_credits_max": int,
                "estimated_time_min": int,
                "estimated_time_max": int,
            }
        """

    async def _create_enhancement_request(
        self,
        video_url: str,
        model: str,
        target_resolution: dict,
        video_metadata: dict,
    ) -> dict:
        """
        Enhancement用リクエスト作成（Step 1）

        Returns:
            dict: {"request_id": str, "estimated_credits_min": int, ...}
        """

    @staticmethod
    def calculate_target_resolution(
        source_width: int,
        source_height: int,
        scale_factor: int = 2,
    ) -> dict:
        """
        アスペクト比を維持した目標解像度を計算。
        偶数に丸め、H265上限(8192x8192)を考慮。
        """
```

**エラーハンドリング**: 既存の `interpolate_to_60fps()` と同じ try/except パターンを実装。
追加で 400 (リクエスト形式不正), 403 (アクセス権限), 404 (リクエスト不明), 503 (メンテナンス中) も処理する。

**再利用するメソッド:**
- `_get_video_metadata()` → そのまま
- `_accept_request()` → そのまま（レスポンスの `urls` フィールドを使用）
- `_upload_video_streaming()` → そのまま
- `_complete_upload()` → そのまま
- `_wait_for_completion()` → そのまま（ステータス `"complete"` で完了判定）
- `_get_headers()` → そのまま
- `_get_client()` → そのまま

---

### Phase 3: バックエンドプロセッサ（`topaz_upscale_processor.py` 新規作成）

#### 3-1. 処理フロー

```python
async def process_topaz_upscale(upscale_id: str) -> None:
    """
    1. DBからタスク取得（user_video_upscales テーブル）
       → レコードが見つからない場合（動画削除済み）: Topazジョブをキャンセルして終了
    2. ステータスを processing に更新
    3. TopazVideoService.enhance_video() 呼び出し
       → topaz_request_id をDBに保存（キャンセル用）
    4. 結果動画をR2にアップロード
       → download.url は有効期限付きのため、即座にR2へ転送
    5. FFmpegでアップスケール済み動画からサムネイル生成（extract_first_frame）
    6. サムネイルをR2にアップロード
    7. ステータスを completed に更新、アップスケールURL・サムネイルURLを保存
    8. user_videos テーブルの upscaled_video_url を更新
    """

async def start_topaz_upscale_processing(upscale_id: str) -> None:
    """バックグラウンドタスクのエントリーポイント"""
    await process_topaz_upscale(upscale_id)
```

#### 3-2. R2保存パス

`r2_upload_user_video()` を使用（`upload_video()` ではない — プレフィックス自動付与を避けるため）:
```
user_videos/{user_id}/upscaled/{uuid}.mp4
user_videos/{user_id}/upscaled/{uuid}_thumb.jpg
```

#### 3-3. 動画削除時の安全対策

プロセッサ内でDBレコード取得失敗時に `TopazVideoService.cancel_task(topaz_request_id)` を呼び出し、
Topaz APIのジョブをキャンセルしてクレジット消費を防止する。

#### 3-4. __init__.py エクスポート

既存パターンに合わせて `process_topaz_upscale` + `start_topaz_upscale_processing` の両方をエクスポート:
```python
from app.tasks.topaz_upscale_processor import process_topaz_upscale, start_topaz_upscale_processing
```

---

### Phase 4: APIエンドポイント（`router.py` + `schemas.py` 追加）

#### 4-1. エンドポイント一覧

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/v1/videos/user-videos/{id}/upscale/estimate` | コスト見積もり（Step 1のみ実行、クレジット消費なし） |
| POST | `/api/v1/videos/user-videos/{id}/upscale` | アップスケール開始 |
| GET | `/api/v1/videos/user-videos/{id}/upscale/status` | ステータス確認 |

#### 4-2. スキーマ

```python
class TopazUpscaleScale(str, Enum):
    """アップスケール倍率"""
    TWO_X = "2x"     # 2倍アップスケール
    FOUR_X = "4x"    # 4倍アップスケール

class UserVideoUpscaleRequest(BaseModel):
    """アップスケールリクエスト"""
    model: EnhanceModel = Field(
        EnhanceModel.PROTEUS,
        description="使用するEnhancementモデル"
    )
    scale: TopazUpscaleScale = Field(
        TopazUpscaleScale.TWO_X,
        description="アップスケール倍率"
    )

class UserVideoUpscaleEstimateResponse(BaseModel):
    """コスト見積もりレスポンス"""
    estimated_credits_min: int
    estimated_credits_max: int
    estimated_time_min: int  # 秒
    estimated_time_max: int  # 秒
    target_width: int
    target_height: int

class UserVideoUpscaleResponse(BaseModel):
    """アップスケール開始レスポンス"""
    id: str
    user_video_id: str
    status: str
    model: str
    target_width: int
    target_height: int
    original_video_url: str
    upscaled_video_url: str | None = None
    progress: int = 0
    estimated_credits_min: int | None = None
    estimated_credits_max: int | None = None
    created_at: datetime

class UserVideoUpscaleStatusResponse(BaseModel):
    """ステータス確認レスポンス"""
    id: str
    status: str
    progress: int
    upscaled_video_url: str | None = None
    thumbnail_url: str | None = None
    error_message: str | None = None
```

#### 4-3. エンドポイント実装概要

```python
@router.post("/user-videos/{user_video_id}/upscale/estimate")
async def estimate_user_video_upscale(
    user_video_id: str,
    request: UserVideoUpscaleRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    1. user_videos テーブルからビデオ取得 + 所有者チェック
    2. 既に目標解像度以上の場合は 400 エラー
    3. TopazVideoService._create_enhancement_request() で見積もり取得（Step 1のみ）
    4. 見積もり結果を返却（クレジット消費なし）
    """

@router.post("/user-videos/{user_video_id}/upscale")
async def upscale_user_video(
    user_video_id: str,
    request: UserVideoUpscaleRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    1. user_videos テーブルからビデオ取得 + 所有者チェック
    2. 重複チェック: 同一動画の pending/processing アップスケールがあれば 409 Conflict
    3. 既に目標解像度以上の場合は 400 エラー
    4. アスペクト比を維持した目標解像度を計算（倍率ベース）
    5. user_video_upscales にレコード挿入
    6. バックグラウンドタスクでTopaz処理開始
    7. レスポンス返却
    """

@router.get("/user-videos/{user_video_id}/upscale/status")
async def get_user_video_upscale_status(
    user_video_id: str,
    current_user: dict = Depends(get_current_user),
):
    """最新のアップスケールステータスを返す"""
```

#### 4-4. user_videos テーブルへの反映

アップスケール完了後、`user_videos` テーブルにも結果を反映する:
```python
# プロセッサ内で完了時に実行
supabase.table("user_videos").update({
    "upscaled_video_url": upscaled_url,
}).eq("id", user_video_id).execute()
```

これにより、ユーザー動画一覧APIで追加クエリなしにアップスケール状態を返せる。

#### 4-5. UserVideoResponse スキーマ拡張

```python
class UserVideoResponse(BaseModel):
    # ... 既存フィールド ...
    upscaled_video_url: str | None = None  # 追加: アップスケール済みURL
```

---

### Phase 5: フロントエンド実装

#### 5-1. ダッシュボード UserVideoCard 拡張

**ファイル:** `movie-maker/app/dashboard/components/video-cards.tsx`

**ステート管理:** 親コンポーネント `page.tsx` で管理（既存のBGMモーダルと同パターン）:
```tsx
const [upscaleModalVideoId, setUpscaleModalVideoId] = useState<string | null>(null);
```

**追加UI要素:**
- アップスケールボタン（ArrowUpCircle アイコン）
- 処理中インジケーター（プログレスバー + %表示）
- 完了後：アップスケール済みバッジ + ダウンロードリンク
- トースト通知（sonner）で完了/失敗を通知

```
┌──────────────────────────┐
│  [サムネイル]              │
│                          │
│  マイ動画.mp4             │
│  1080x1920 | 5.2s | 3MB  │
│                          │
│  [🗑️ 削除] [⬆️ アップスケール] │  ← 新規追加
│                          │
│  ── アップスケール中 ──     │  ← 処理中表示
│  [████████░░] 75%         │
│  モデル: Proteus           │
│                          │
│  ✅ 4K アップスケール済み   │  ← 完了時バッジ
│  [ダウンロード]             │
└──────────────────────────┘
```

#### 5-2. アップスケールモーダル

**トリガー:** アップスケールボタンクリック

**既存モーダルパターン準拠:**
- `fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4`
- `w-full max-w-lg rounded-xl bg-[#2a2a2a] border border-[#404040] p-6`

**内容:**
- 現在の解像度表示（例: 1080x1920）
- 倍率選択（2x / 4x）
- モデル選択（Proteus推奨をデフォルト表示、Artemis HQ、Gaia CG等）
- 推定クレジット表示（`/estimate` APIで事前取得、表示: "10〜15クレジット"）
- 推定処理時間表示（"約2〜3分"）
- 「アップスケール開始」ボタン

#### 5-3. API連携

**ファイル:** `movie-maker/lib/api/client.ts`

既存の `userVideosApi` オブジェクト内に追加（既存命名規則に準拠）:
```typescript
type EnhanceModel = 'prob-4' | 'ahq-12' | 'amq-13' | 'alq-13' | 'ghq-5' | 'gcg-5' | 'nyk-3' | 'rhea-1' | 'iris-3' | 'thd-3' | 'thf-4';
type TopazUpscaleScale = '2x' | '4x';

interface UserVideoUpscaleEstimateResponse { ... }
interface UserVideoUpscaleResponse { ... }
interface UserVideoUpscaleStatusResponse { ... }

export const userVideosApi = {
  // ... 既存 ...
  estimateUpscale: (videoId: string, options: { model?: EnhanceModel; scale?: TopazUpscaleScale }) => ...,
  upscale: (videoId: string, options: { model?: EnhanceModel; scale?: TopazUpscaleScale }) => ...,
  getUpscaleStatus: (videoId: string) => ...,
};
```

#### 5-4. ポーリング

既存パターン（`setTimeout` 再帰、`generate/[id]/page.tsx` と同方式）に準拠:
```typescript
const pollUpscale = async () => {
  const status = await userVideosApi.getUpscaleStatus(videoId);
  if (status.status === 'completed') {
    toast.success('アップスケールが完了しました');
    mutateUserVideos(); // SWR再取得
    return;
  }
  if (status.status === 'failed') {
    toast.error(`アップスケールに失敗しました: ${status.error_message}`);
    return;
  }
  setProgress(status.progress);
  setTimeout(pollUpscale, 5000); // 5秒間隔
};
```

**ブラウザ復帰時:** ダッシュボードマウント時に `user_videos` 一覧API で `upscaled_video_url` の有無を確認。
`pending/processing` のアップスケールが存在する場合は自動的にポーリングを再開する。

#### 5-5. UserVideo型拡張

```typescript
export interface UserVideo {
  // ... 既存フィールド ...
  upscaled_video_url?: string | null;  // 追加
}
```

#### 5-6. プレビュー方針

アップスケール完了後もカードのプレビューはオリジナル動画のまま（4K動画はファイルサイズが大きく帯域を消費するため）。
ダウンロードボタンのみアップスケール済みURLを使用。

---

## ファイル変更一覧

### バックエンド（movie-maker-api）

| ファイル | 変更内容 |
|---------|---------|
| `app/services/topaz_service.py` | クラス名変更 `TopazVideoService`、`enhance_video()`, `_create_enhancement_request()`, `calculate_target_resolution()` 追加、エラーハンドリング拡充(400/403/404/503) |
| `app/tasks/topaz_upscale_processor.py` | **新規作成** - アップスケール処理プロセッサ（サムネイル生成・Topazジョブキャンセル対応含む） |
| `app/tasks/interpolation_processor.py` | クラス名変更への参照更新 |
| `app/tasks/__init__.py` | `process_topaz_upscale`, `start_topaz_upscale_processing` エクスポート追加 |
| `app/videos/schemas.py` | `EnhanceModel`, `TopazUpscaleScale`, `UserVideoUpscaleRequest/Response/EstimateResponse/StatusResponse` 追加、`UserVideoResponse` に `upscaled_video_url` 追加 |
| `app/videos/router.py` | `estimate_user_video_upscale`, `upscale_user_video`, `get_user_video_upscale_status` エンドポイント追加 |
| `app/videos/service.py` | `list_user_videos` のレスポンスに `upscaled_video_url` を含める |

### フロントエンド（movie-maker）

| ファイル | 変更内容 |
|---------|---------|
| `app/dashboard/components/video-cards.tsx` | UserVideoCard にアップスケールボタン・プログレス・完了バッジ追加 |
| `app/dashboard/page.tsx` | アップスケールモーダル + ステート管理 + ポーリング + トースト通知 |
| `lib/api/client.ts` | `userVideosApi` に `estimateUpscale`, `upscale`, `getUpscaleStatus` 追加、`UserVideo` 型拡張 |

### データベース

| ファイル | 変更内容 |
|---------|---------|
| `docs/migrations/20260207_user_video_upscales.sql` | `user_video_upscales` テーブル・RLS・トリガー・インデックス作成 |

**user_videos テーブルへの ALTER:**
```sql
ALTER TABLE user_videos ADD COLUMN IF NOT EXISTS upscaled_video_url TEXT;
```

---

## 実装順序

```
Phase 1: DBマイグレーション (user_video_upscales テーブル + user_videos ALTER)
    ↓
Phase 2: バックエンドサービス層 (topaz_service.py 拡張・リネーム)
    ↓
Phase 3: プロセッサ (topaz_upscale_processor.py 新規作成)
    ↓
Phase 4: スキーマ + APIエンドポイント (schemas.py + router.py)
    ↓
Phase 5: フロントエンド (video-cards.tsx + page.tsx + client.ts)
    ↓
Phase 6: 結合テスト・動作確認
```

**注意:** Phase 1（DB）を最初に実行すること。プロセッサ・エンドポイントはDBテーブルに依存する。

---

## エッジケース対応

| ケース | 対応 |
|--------|------|
| 同じ動画に対して重複アップスケールリクエスト | エンドポイントで pending/processing の既存タスクを確認し 409 Conflict を返す |
| アップスケール中にユーザーが動画を削除 | `ON DELETE CASCADE` でDBレコード削除。プロセッサで取得失敗時に `cancel_task()` でTopazジョブをキャンセル |
| 既に目標解像度以上の動画 | エンドポイントで `width >= target_width and height >= target_height` をチェックし 400 エラー |
| ブラウザを閉じて戻った場合 | ダッシュボードマウント時にユーザー動画一覧を取得。processing 中のアップスケールがあれば自動ポーリング再開 |
| 異なるモデルでの再アップスケール | completed/failed のタスクは重複チェックの対象外。異なるモデル・倍率での再実行は許可 |
| Topazダウンロードの有効期限切れ | `download.url` 取得後、即座にR2へストリーミング転送（プロセッサ内で実装） |

---

## リスク・注意事項

| リスク | 対策 |
|--------|------|
| Topaz EnhancementフィルターのAPIリクエスト形式が公式ドキュメントに不明確 | Phase 2の最初に `prob-4` モデルでテストリクエストを送り、正しいフォーマット（`auto`, `videoType` の必要性）を検証 |
| クレジット消費量が不明 | `/estimate` APIで事前に `estimates.cost` を取得し、モーダルでユーザーに提示してから処理開始 |
| 処理時間が長い（数分〜） | ポーリング + プログレスバー + トースト通知で体験改善。タイムアウトは20分 |
| 大きな動画ファイル（50MB上限） | 既存の `user_videos` 制約（50MB, 10秒, 4K上限）をそのまま適用 |
| アップスケール後のファイルサイズ増大 | `videoEncoder: H265` + `dynamicCompressionLevel: High` で圧縮。必要に応じてFFmpeg再エンコード追加 |
| NyxモデルIDが `nyx-3` か `nyk-3` か不明確 | 公式APIリファレンスでは `nyk-3` — テストリクエストで確認 |

---

## 工数見積もり

| Phase | 内容 | 見積もり |
|-------|------|---------|
| Phase 1 | DBマイグレーション | 極小 |
| Phase 2 | サービス層拡張 | 小 |
| Phase 3 | プロセッサ作成 | 小 |
| Phase 4 | スキーマ + APIエンドポイント | 小 |
| Phase 5 | フロントエンド | 中 |
| Phase 6 | テスト・検証 | 小 |
| **合計** | | **中規模** |
