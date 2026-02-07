# 動画結合機能 実装計画

> **ステータス**: 実装完了

## 概要

5秒の動画を複数繋ぎ合わせて1本の動画として出力する機能を実装する。

## 現状分析

### 既存の構成
- **動画生成**: Runway API で5秒の動画を生成
- **後処理**: `FFmpegService` でテキストオーバーレイ、LUT、フィルムグレイン、BGM追加
- **ストレージ**: Cloudflare R2 に保存

### 不足している機能
- 複数動画の結合（concat）機能

---

## 実装計画

### Phase 1: FFmpegService に結合機能を追加

#### 1.1 `concat_videos` メソッドの追加

**ファイル**: `movie-maker-api/app/services/ffmpeg_service.py`

```python
async def concat_videos(
    self,
    video_paths: list[str],
    output_path: str,
    transition: str | None = None,  # "fade", "dissolve", None
    transition_duration: float = 0.5,
) -> None:
    """
    複数の動画を結合して1本の動画を作成

    Args:
        video_paths: 結合する動画ファイルのパスリスト（順番通りに結合）
        output_path: 出力先パス
        transition: トランジション効果（オプション）
        transition_duration: トランジション時間（秒）
    """
```

**FFmpegコマンド例**（シンプル結合）:
```bash
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
```

**FFmpegコマンド例**（フェードトランジション付き）:
```bash
ffmpeg -i video1.mp4 -i video2.mp4 \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v];[0:a][1:a]acrossfade=d=0.5[a]" \
  -map "[v]" -map "[a]" output.mp4
```

---

### Phase 2: API エンドポイントの追加

#### 2.1 スキーマ定義

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class ConcatVideoRequest(BaseModel):
    """動画結合リクエスト"""
    video_ids: list[str]  # 結合する動画IDのリスト（順番通り）
    transition: str | None = None  # "fade", "dissolve", None
    transition_duration: float = 0.5
    output_name: str | None = None  # 出力ファイル名（オプション）

class ConcatVideoResponse(BaseModel):
    """動画結合レスポンス"""
    id: str  # 新しい動画ID
    status: str  # "pending", "processing", "completed", "failed"
    source_video_ids: list[str]
    estimated_duration: float  # 推定秒数
```

#### 2.2 エンドポイント

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
@router.post("/concat", response_model=ConcatVideoResponse)
async def concat_videos(
    request: ConcatVideoRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    複数の動画を結合して1本の動画を作成

    - 2〜10本の動画を結合可能
    - 各動画は同じユーザーが所有している必要がある
    - バックグラウンドで処理
    """
```

---

### Phase 3: バックグラウンド処理

#### 3.1 結合処理タスク

**ファイル**: `movie-maker-api/app/tasks/video_concat_processor.py`（新規作成）

```python
async def process_video_concatenation(concat_job_id: str) -> None:
    """
    動画結合のバックグラウンド処理

    1. 結合する動画をR2からダウンロード
    2. FFmpegで結合
    3. 後処理（必要に応じてLUT、BGMなど）
    4. R2にアップロード
    5. ステータス更新
    """
```

---

### Phase 4: データベーススキーマ

#### 4.1 結合ジョブテーブル

**Supabase Migration**:

```sql
CREATE TABLE video_concatenations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    source_video_ids UUID[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    transition TEXT,
    transition_duration FLOAT DEFAULT 0.5,
    final_video_url TEXT,
    total_duration FLOAT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLSポリシー
ALTER TABLE video_concatenations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own concatenations"
    ON video_concatenations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own concatenations"
    ON video_concatenations FOR INSERT
    WITH CHECK (auth.uid() = user_id);
```

---

### Phase 5: フロントエンド対応

#### 5.1 API クライアント

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
export async function concatVideos(params: {
  videoIds: string[];
  transition?: 'fade' | 'dissolve' | null;
  transitionDuration?: number;
}): Promise<ConcatVideoResponse> {
  return apiClient.post('/videos/concat', {
    video_ids: params.videoIds,
    transition: params.transition,
    transition_duration: params.transitionDuration,
  });
}
```

#### 5.2 UI コンポーネント

- 動画選択UI（チェックボックスで複数選択）
- 並び順の変更（ドラッグ&ドロップ）
- トランジション効果の選択
- プレビュー（サムネイル並び）

---

## 実装優先順位

| 優先度 | タスク | 概要 |
|--------|--------|------|
| 1 | FFmpegService.concat_videos | 基本的な結合機能 |
| 2 | DBマイグレーション | video_concatenationsテーブル作成 |
| 3 | APIエンドポイント | POST /videos/concat |
| 4 | バックグラウンド処理 | 結合タスク実装 |
| 5 | フロントエンドUI | 動画選択・結合UI |
| 6 | トランジション対応 | フェード等の効果追加 |

---

## 技術的考慮事項

### 動画フォーマットの統一
- 結合する動画は同じ解像度・フレームレートである必要がある
- 必要に応じて事前に正規化処理を行う

```python
async def normalize_video(
    self,
    input_path: str,
    output_path: str,
    target_resolution: str = "720:1280",
    target_fps: int = 24,
) -> None:
    """動画を指定の解像度・FPSに正規化"""
```

### エラーハンドリング
- 動画が見つからない場合
- フォーマットが異なる場合
- 結合に失敗した場合

### 制限事項
- 最大結合数: 10本
- 最大合計時間: 60秒
- 対応フォーマット: MP4のみ

---

## 見積もり工数

| フェーズ | 作業内容 |
|----------|----------|
| Phase 1 | FFmpeg結合機能実装 |
| Phase 2 | APIスキーマ・エンドポイント |
| Phase 3 | バックグラウンド処理 |
| Phase 4 | DBマイグレーション |
| Phase 5 | フロントエンド |

---

## 将来の拡張案

1. **トランジション効果の追加**: fade, dissolve, wipe, slide 等
2. **動画間にテキストスライド挿入**: 章タイトル等
3. **BGM自動調整**: 結合後の長さに合わせてBGMをフェードアウト
4. **AI自動編集**: シーン検出による自動カット・結合
