# 動画スクリーンショット機能 実装計画書

## 概要

生成した動画やアップロードした動画から任意のフレームをスクリーンショットとして抽出し、動画生成のソース画像として再利用できる機能を実装する。

## 実装難易度: 低〜中

### 理由
- FFmpegのフレーム抽出機能（`extract_first_frame`, `extract_last_frame`）が既に実装済み
- R2への画像アップロード機能が完備
- 画像→動画生成のパイプラインが既存

---

## 1. データベース設計

### 新規テーブル: `video_screenshots` (✅ マイグレーション完了)

```sql
CREATE TABLE video_screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ソース情報（いずれか1つが設定される）
    source_video_generation_id UUID REFERENCES video_generations(id) ON DELETE SET NULL,
    source_storyboard_scene_id UUID REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
    source_user_video_id UUID REFERENCES user_videos(id) ON DELETE SET NULL,
    source_video_url TEXT,  -- URLから直接抽出した場合

    -- 抽出情報
    timestamp_seconds FLOAT NOT NULL,  -- 抽出位置（秒）

    -- 画像情報
    image_url TEXT NOT NULL,           -- R2に保存された画像URL
    r2_key TEXT NOT NULL,              -- R2のキー
    width INTEGER,                     -- 画像の幅
    height INTEGER,                    -- 画像の高さ

    -- メタデータ
    title TEXT,                        -- ユーザーが付けた名前（オプション）

    -- タイムスタンプ
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX idx_video_screenshots_user_id ON video_screenshots(user_id);
CREATE INDEX idx_video_screenshots_created_at ON video_screenshots(created_at DESC);

-- RLS ポリシー（SELECT/INSERT/UPDATE/DELETE）
ALTER TABLE video_screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own screenshots"
    ON video_screenshots FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own screenshots"
    ON video_screenshots FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own screenshots"
    ON video_screenshots FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own screenshots"
    ON video_screenshots FOR DELETE USING (auth.uid() = user_id);
```

---

## 2. バックエンドAPI設計

### 2.1 エンドポイント一覧

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/videos/screenshots` | スクリーンショット抽出 |
| GET | `/api/v1/videos/screenshots` | スクリーンショット一覧 |
| GET | `/api/v1/videos/screenshots/{id}` | スクリーンショット詳細 |
| DELETE | `/api/v1/videos/screenshots/{id}` | スクリーンショット削除 |

> **注意**: 既存の `/api/v1/videos` ルーターに追加するため、パスは `/api/v1/videos/screenshots` となる

### 2.2 スキーマ定義

```python
# app/videos/schemas.py に追加

class ScreenshotSource(str, Enum):
    """スクリーンショットのソースタイプ"""
    VIDEO_GENERATION = "video_generation"  # 生成動画
    STORYBOARD_SCENE = "storyboard_scene"  # ストーリーボードシーン
    USER_VIDEO = "user_video"              # アップロード動画
    URL = "url"                            # 外部URL


class ScreenshotCreateRequest(BaseModel):
    """スクリーンショット作成リクエスト"""
    source_type: ScreenshotSource
    source_id: str | None = Field(None, description="ソースのID（URLの場合は不要）")
    source_url: str | None = Field(None, description="動画URL（source_type=urlの場合のみ）")
    timestamp_seconds: float = Field(..., ge=0.0, description="抽出位置（秒）")
    title: str | None = Field(None, max_length=100, description="スクリーンショット名")

    @model_validator(mode='after')
    def validate_source(self) -> Self:
        if self.source_type == ScreenshotSource.URL:
            if not self.source_url:
                raise ValueError("source_url is required when source_type is 'url'")
        else:
            if not self.source_id:
                raise ValueError("source_id is required for this source_type")
        return self


class ScreenshotResponse(BaseModel):
    """スクリーンショットレスポンス"""
    id: str
    user_id: str
    source_type: str  # DBには保存されない。レスポンス生成時に計算
    source_id: str | None = None
    source_video_url: str | None = None
    timestamp_seconds: float
    image_url: str
    width: int | None = None
    height: int | None = None
    title: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScreenshotListResponse(BaseModel):
    """スクリーンショット一覧レスポンス"""
    screenshots: list[ScreenshotResponse]
    total: int
    page: int
    per_page: int
```

### 2.3 既存メソッドの活用（新規メソッド不要）

既存の `FFmpegService.extract_first_frame` メソッドは `offset_seconds` パラメータを持っているため、**新規メソッドの追加は不要**。

```python
# 既存メソッド（ffmpeg_service.py:1592-1634）
async def extract_first_frame(
    self,
    video_path: str,
    output_path: str,
    offset_seconds: float = 0.0,  # ← これを使う
) -> str:
    """動画の指定位置からフレームを画像として抽出"""
```

### 2.4 画像サイズ取得用ヘルパー関数

`get_video_info` は ffprobe を使うため画像にも対応可能だが、返り値のパースが必要：

```python
# app/videos/service.py に追加

async def get_image_dimensions(image_path: str) -> tuple[int | None, int | None]:
    """ffprobeで画像のサイズを取得"""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        image_path
    ]
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await process.communicate()

    if process.returncode == 0 and stdout:
        parts = stdout.decode().strip().split(",")
        if len(parts) >= 2:
            return int(parts[0]), int(parts[1])
    return None, None
```

### 2.5 ルーター実装（修正版）

```python
# app/videos/router.py に追加

from app.external.r2 import download_file, delete_file, get_r2_client, get_public_url
from app.services.ffmpeg_service import get_ffmpeg_service
from uuid import uuid4

# ===== スクリーンショット用ヘルパー関数 =====

async def _resolve_video_url(
    request: ScreenshotCreateRequest,
    user_id: str,
    db
) -> str:
    """ソースタイプに応じて動画URLを解決"""
    if request.source_type == ScreenshotSource.URL:
        return request.source_url

    if request.source_type == ScreenshotSource.VIDEO_GENERATION:
        result = db.table("video_generations").select("final_video_url").eq(
            "id", request.source_id
        ).eq("user_id", user_id).single().execute()
        if not result.data or not result.data.get("final_video_url"):
            raise HTTPException(404, "Video not found or not ready")
        return result.data["final_video_url"]

    if request.source_type == ScreenshotSource.STORYBOARD_SCENE:
        result = db.table("storyboard_scenes").select(
            "video_url, storyboard_id"
        ).eq("id", request.source_id).single().execute()
        if not result.data or not result.data.get("video_url"):
            raise HTTPException(404, "Scene video not found or not ready")
        # 権限チェック: ストーリーボードの所有者か確認
        sb_result = db.table("storyboards").select("user_id").eq(
            "id", result.data["storyboard_id"]
        ).single().execute()
        if not sb_result.data or sb_result.data["user_id"] != user_id:
            raise HTTPException(403, "Not authorized to access this scene")
        return result.data["video_url"]

    if request.source_type == ScreenshotSource.USER_VIDEO:
        result = db.table("user_videos").select("video_url").eq(
            "id", request.source_id
        ).eq("user_id", user_id).single().execute()
        if not result.data:
            raise HTTPException(404, "User video not found")
        return result.data["video_url"]

    raise HTTPException(400, "Invalid source type")


def _get_source_columns(request: ScreenshotCreateRequest) -> dict:
    """リクエストからDBカラム用のソース情報を生成"""
    if request.source_type == ScreenshotSource.VIDEO_GENERATION:
        return {"source_video_generation_id": request.source_id}
    if request.source_type == ScreenshotSource.STORYBOARD_SCENE:
        return {"source_storyboard_scene_id": request.source_id}
    if request.source_type == ScreenshotSource.USER_VIDEO:
        return {"source_user_video_id": request.source_id}
    if request.source_type == ScreenshotSource.URL:
        return {"source_video_url": request.source_url}
    return {}


def _db_row_to_response(row: dict) -> ScreenshotResponse:
    """DBの行データをレスポンスモデルに変換（source_typeを計算）"""
    source_type = "url"
    source_id = None

    if row.get("source_video_generation_id"):
        source_type = "video_generation"
        source_id = row["source_video_generation_id"]
    elif row.get("source_storyboard_scene_id"):
        source_type = "storyboard_scene"
        source_id = row["source_storyboard_scene_id"]
    elif row.get("source_user_video_id"):
        source_type = "user_video"
        source_id = row["source_user_video_id"]

    return ScreenshotResponse(
        id=row["id"],
        user_id=row["user_id"],
        source_type=source_type,
        source_id=source_id,
        source_video_url=row.get("source_video_url"),
        timestamp_seconds=row["timestamp_seconds"],
        image_url=row["image_url"],
        width=row.get("width"),
        height=row.get("height"),
        title=row.get("title"),
        created_at=row["created_at"],
    )


# ===== スクリーンショットエンドポイント =====

@router.post("/screenshots", response_model=ScreenshotResponse)
async def create_screenshot(
    request: ScreenshotCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """動画からスクリーンショットを抽出"""
    user_id = current_user["id"]
    db = get_supabase()
    ffmpeg = get_ffmpeg_service()

    # 1. ソース動画URLを解決
    video_url = await _resolve_video_url(request, user_id, db)

    # 2. 動画をダウンロード
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "source.mp4")
        video_content = await download_file(video_url)
        with open(video_path, "wb") as f:
            f.write(video_content)

        # 3. タイムスタンプのバリデーション
        duration = await ffmpeg._get_video_duration(video_path)
        if duration is None:
            raise HTTPException(400, "Failed to get video duration")
        if request.timestamp_seconds > duration:
            raise HTTPException(
                400,
                f"Timestamp ({request.timestamp_seconds}s) exceeds video duration ({duration:.1f}s)"
            )

        # 4. フレーム抽出（既存メソッドを使用）
        image_path = os.path.join(tmp_dir, "screenshot.jpg")
        await ffmpeg.extract_first_frame(
            video_path,
            image_path,
            offset_seconds=request.timestamp_seconds
        )

        # 5. 画像サイズ取得
        width, height = await get_image_dimensions(image_path)

        # 6. R2にアップロード
        r2_key = f"screenshots/{user_id}/{uuid4()}.jpg"
        with open(image_path, "rb") as f:
            image_content = f.read()

        client = get_r2_client()
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
            Body=image_content,
            ContentType="image/jpeg",
        )
        image_url = get_public_url(r2_key)

        # 7. DBに保存
        data = {
            "user_id": user_id,
            "timestamp_seconds": request.timestamp_seconds,
            "image_url": image_url,
            "r2_key": r2_key,
            "width": width,
            "height": height,
            "title": request.title,
            **_get_source_columns(request)
        }

        result = db.table("video_screenshots").insert(data).execute()
        return _db_row_to_response(result.data[0])


@router.get("/screenshots", response_model=ScreenshotListResponse)
async def list_screenshots(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """スクリーンショット一覧を取得"""
    user_id = current_user["id"]
    db = get_supabase()

    # 総数取得
    count_result = db.table("video_screenshots").select(
        "*", count="exact"
    ).eq("user_id", user_id).execute()
    total = count_result.count or 0

    # ページネーション
    offset = (page - 1) * per_page
    result = db.table("video_screenshots").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    return ScreenshotListResponse(
        screenshots=[_db_row_to_response(row) for row in result.data],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/screenshots/{screenshot_id}", response_model=ScreenshotResponse)
async def get_screenshot(
    screenshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """スクリーンショット詳細を取得"""
    user_id = current_user["id"]
    db = get_supabase()

    result = db.table("video_screenshots").select("*").eq(
        "id", screenshot_id
    ).eq("user_id", user_id).single().execute()

    if not result.data:
        raise HTTPException(404, "Screenshot not found")

    return _db_row_to_response(result.data)


@router.delete("/screenshots/{screenshot_id}")
async def delete_screenshot(
    screenshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """スクリーンショットを削除（R2からも削除）"""
    user_id = current_user["id"]
    db = get_supabase()

    # 存在確認とr2_key取得
    result = db.table("video_screenshots").select("r2_key").eq(
        "id", screenshot_id
    ).eq("user_id", user_id).single().execute()

    if not result.data:
        raise HTTPException(404, "Screenshot not found")

    r2_key = result.data["r2_key"]

    # R2から削除
    await delete_file(r2_key)

    # DBから削除
    db.table("video_screenshots").delete().eq("id", screenshot_id).execute()

    return {"message": "Screenshot deleted successfully"}
```

---

## 3. フロントエンド実装

### 3.1 スクリーンショットボタンコンポーネント

```tsx
// components/video/screenshot-button.tsx

"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";

// 型定義
interface Screenshot {
  id: string;
  user_id: string;
  source_type: string;
  source_id: string | null;
  source_video_url: string | null;
  timestamp_seconds: number;
  image_url: string;
  width: number | null;
  height: number | null;
  title: string | null;
  created_at: string;
}

interface ScreenshotButtonProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  sourceType: "video_generation" | "storyboard_scene" | "user_video";
  sourceId: string;
  onScreenshotCreated?: (screenshot: Screenshot) => void;
}

export function ScreenshotButton({
  videoRef,
  sourceType,
  sourceId,
  onScreenshotCreated,
}: ScreenshotButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleScreenshot = async () => {
    const video = videoRef.current;
    if (!video) return;

    const timestamp = video.currentTime;

    setIsLoading(true);
    try {
      // APIパスは /api/v1/videos/screenshots
      const response = await apiClient.post("/videos/screenshots", {
        source_type: sourceType,
        source_id: sourceId,
        timestamp_seconds: timestamp,
      });

      toast.success("スクリーンショットを保存しました");
      onScreenshotCreated?.(response.data);
    } catch (error) {
      console.error("Screenshot error:", error);
      toast.error("スクリーンショットの保存に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleScreenshot}
      disabled={isLoading}
    >
      <Camera className="w-4 h-4 mr-2" />
      {isLoading ? "保存中..." : "スクリーンショット"}
    </Button>
  );
}
```

### 3.2 スクリーンショット一覧コンポーネント

```tsx
// components/video/screenshot-gallery.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Trash2, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";

interface Screenshot {
  id: string;
  image_url: string;
  timestamp_seconds: number;
  title: string | null;
  created_at: string;
  source_type: string;
}

interface ScreenshotGalleryProps {
  onSelectForGeneration?: (imageUrl: string) => void;
}

export function ScreenshotGallery({ onSelectForGeneration }: ScreenshotGalleryProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadScreenshots = useCallback(async () => {
    try {
      // APIパスは /api/v1/videos/screenshots
      const response = await apiClient.get("/videos/screenshots");
      setScreenshots(response.data.screenshots);
    } catch (error) {
      console.error("Failed to load screenshots:", error);
      toast.error("スクリーンショットの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScreenshots();
  }, [loadScreenshots]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.delete(`/videos/screenshots/${id}`);
      setScreenshots(prev => prev.filter(s => s.id !== id));
      toast.success("スクリーンショットを削除しました");
    } catch (error) {
      console.error("Failed to delete screenshot:", error);
      toast.error("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUseForGeneration = (imageUrl: string) => {
    onSelectForGeneration?.(imageUrl);
    toast.success("画像を選択しました");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>スクリーンショットがありません</p>
        <p className="text-sm mt-1">動画再生中に「スクリーンショット」ボタンを押すと保存できます</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {screenshots.map((screenshot) => (
        <div key={screenshot.id} className="relative group">
          <Image
            src={screenshot.image_url}
            alt={screenshot.title || "Screenshot"}
            width={200}
            height={112}
            className="rounded-lg object-cover w-full aspect-video"
            unoptimized  // R2のURLはNext.js Image Optimizationの対象外
          />

          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleUseForGeneration(screenshot.image_url)}
              title="動画生成に使用"
            >
              <ImagePlus className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(screenshot.id)}
              disabled={deletingId === screenshot.id}
              title="削除"
            >
              {deletingId === screenshot.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-1">
            {screenshot.timestamp_seconds.toFixed(1)}秒
          </p>
        </div>
      ))}
    </div>
  );
}
```

### 3.3 動画プレーヤーへの統合

```tsx
// app/generate/[id]/page.tsx の VideoPlayer に追加

<div className="flex items-center gap-2 mt-4">
  <ScreenshotButton
    videoRef={videoRef}
    sourceType="video_generation"
    sourceId={video.id}
  />
  {/* 既存のボタン */}
</div>
```

---

## 4. 実装手順

### Phase 1: バックエンド基盤（1日目）
1. [x] Supabaseマイグレーション実行（`video_screenshots`テーブル作成）
2. [ ] FFmpegサービスに`extract_frame_at`メソッド追加
3. [ ] スキーマ定義追加
4. [ ] APIエンドポイント実装（POST/GET/DELETE）

### Phase 2: フロントエンド実装（2日目）
1. [ ] `ScreenshotButton`コンポーネント作成
2. [ ] 動画プレーヤーにボタン統合
3. [ ] `ScreenshotGallery`コンポーネント作成
4. [ ] 動画生成フォームへの統合（画像選択UI）

### Phase 3: テスト＆調整（3日目）
1. [ ] APIエンドポイントのユニットテスト
2. [ ] E2Eテスト（スクリーンショット作成→動画生成フロー）
3. [ ] エラーハンドリングの確認
4. [ ] UIの調整

---

## 5. テスト計画

### 5.1 APIテスト

```python
# tests/videos/test_screenshots.py

import pytest
from httpx import AsyncClient

# ヘルパー関数
async def create_test_video(client: AsyncClient, auth_headers: dict) -> dict:
    """テスト用動画を作成（モックまたは事前準備）"""
    # 実際のテストでは事前に存在する動画IDを使用するか、
    # テスト用のfixtureで動画を準備する
    # ここではモックとして既存の動画を想定
    response = await client.get("/api/v1/videos", headers=auth_headers)
    if response.json()["videos"]:
        return response.json()["videos"][0]
    raise pytest.skip("No test video available")


async def create_test_screenshot(client: AsyncClient, auth_headers: dict) -> dict:
    """テスト用スクリーンショットを作成"""
    video = await create_test_video(client, auth_headers)
    response = await client.post(
        "/api/v1/videos/screenshots",
        json={
            "source_type": "video_generation",
            "source_id": video["id"],
            "timestamp_seconds": 0.5,
        },
        headers=auth_headers
    )
    return response.json()


@pytest.mark.asyncio
async def test_create_screenshot(client: AsyncClient, auth_headers: dict):
    """スクリーンショット作成テスト"""
    video = await create_test_video(client, auth_headers)

    response = await client.post(
        "/api/v1/videos/screenshots",
        json={
            "source_type": "video_generation",
            "source_id": video["id"],
            "timestamp_seconds": 2.5,
            "title": "テストスクリーンショット"
        },
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["timestamp_seconds"] == 2.5
    assert data["image_url"].startswith("https://")
    assert data["source_type"] == "video_generation"
    assert data["source_id"] == video["id"]


@pytest.mark.asyncio
async def test_screenshot_timestamp_validation(client: AsyncClient, auth_headers: dict):
    """タイムスタンプが動画長を超える場合のエラー"""
    video = await create_test_video(client, auth_headers)  # 5秒の動画

    response = await client.post(
        "/api/v1/videos/screenshots",
        json={
            "source_type": "video_generation",
            "source_id": video["id"],
            "timestamp_seconds": 100.0,  # 動画長を超える
        },
        headers=auth_headers
    )

    assert response.status_code == 400
    assert "exceeds video duration" in response.json()["detail"]


@pytest.mark.asyncio
async def test_screenshot_invalid_source(client: AsyncClient, auth_headers: dict):
    """存在しないソースIDでのエラー"""
    response = await client.post(
        "/api/v1/videos/screenshots",
        json={
            "source_type": "video_generation",
            "source_id": "00000000-0000-0000-0000-000000000000",
            "timestamp_seconds": 1.0,
        },
        headers=auth_headers
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_screenshots(client: AsyncClient, auth_headers: dict):
    """スクリーンショット一覧取得テスト"""
    response = await client.get("/api/v1/videos/screenshots", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert "screenshots" in data
    assert "total" in data
    assert "page" in data
    assert "per_page" in data


@pytest.mark.asyncio
async def test_list_screenshots_pagination(client: AsyncClient, auth_headers: dict):
    """スクリーンショット一覧のページネーションテスト"""
    response = await client.get(
        "/api/v1/videos/screenshots?page=1&per_page=5",
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 1
    assert data["per_page"] == 5


@pytest.mark.asyncio
async def test_get_screenshot(client: AsyncClient, auth_headers: dict):
    """スクリーンショット詳細取得テスト"""
    screenshot = await create_test_screenshot(client, auth_headers)

    response = await client.get(
        f"/api/v1/videos/screenshots/{screenshot['id']}",
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == screenshot["id"]


@pytest.mark.asyncio
async def test_delete_screenshot(client: AsyncClient, auth_headers: dict):
    """スクリーンショット削除テスト"""
    screenshot = await create_test_screenshot(client, auth_headers)

    # 削除
    response = await client.delete(
        f"/api/v1/videos/screenshots/{screenshot['id']}",
        headers=auth_headers
    )

    assert response.status_code == 200

    # 削除後に取得できないことを確認
    response = await client.get(
        f"/api/v1/videos/screenshots/{screenshot['id']}",
        headers=auth_headers
    )
    assert response.status_code == 404
```

### 5.2 E2Eテスト

```typescript
// tests/e2e/screenshot-flow.spec.ts

import { test, expect } from "@playwright/test";

test("スクリーンショットから動画生成フロー", async ({ page }) => {
  // 1. ログイン
  await page.goto("/login");
  // ... ログイン処理

  // 2. 既存の動画を表示
  await page.goto("/generate/[video-id]");

  // 3. 動画を再生して特定位置に移動
  const video = page.locator("video");
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 2.5;
  });

  // 4. スクリーンショットボタンをクリック
  await page.click('button:has-text("スクリーンショット")');

  // 5. 成功トーストを確認
  await expect(page.locator("text=スクリーンショットを保存しました")).toBeVisible();

  // 6. ダッシュボードでスクリーンショットを確認
  await page.goto("/dashboard");
  await page.click('button:has-text("スクリーンショット")');

  // 7. スクリーンショットを動画生成に使用
  await page.click('button[aria-label="動画生成に使用"]');

  // 8. 動画生成フォームに画像がセットされていることを確認
  await expect(page.locator("img[alt='Selected image']")).toBeVisible();
});
```

---

## 6. 注意事項・エラー防止

### 6.1 バックエンド注意点

| 項目 | 内容 | 対策 |
|------|------|------|
| **タイムスタンプ** | 動画長を超えるとFFmpegがエラー | `_get_video_duration` で事前チェック |
| **ダウンロードタイムアウト** | 大きな動画のダウンロードが遅い | httpxの`timeout=120.0`で対応（既存実装） |
| **一時ファイル** | ディスク溢れの可能性 | `tempfile.TemporaryDirectory`で自動削除 |
| **R2アップロード** | キー重複 | `uuid4()`でユニークなキー生成 |
| **権限チェック** | 他ユーザーの動画アクセス | DB側でRLS + API側でuser_idチェック |
| **削除時のクリーンアップ** | R2に孤児ファイルが残る | 削除API内で`delete_file(r2_key)`を呼ぶ |

### 6.2 潜在的なエラーと対策

```python
# 1. Supabase single()でデータがない場合の例外
# 対策: try-exceptまたは結果チェック
result = db.table("video_screenshots").select("*").eq("id", id).single().execute()
if not result.data:
    raise HTTPException(404, "Not found")

# 2. FFmpegの-ssオプションの位置
# 入力ファイル「前」に置くと高速シーク（キーフレームベース）
# 入力ファイル「後」に置くと正確だが遅い
# 現在の実装（extract_first_frame）は「前」なので高速だが数フレームずれる可能性あり
# → 許容範囲内（スクリーンショット用途では問題なし）

# 3. get_image_dimensions の戻り値チェック
width, height = await get_image_dimensions(image_path)
# → None, None が返る可能性があるのでDBにはNULLABLEで設計済み

# 4. R2 URL期限切れ（署名付きURLの場合）
# → get_public_url()は署名なしの永続URLを返すため問題なし
```

### 6.3 フロントエンド注意点

| 項目 | 内容 | 対策 |
|------|------|------|
| **Next.js Image** | R2のURLはデフォルトでは最適化対象外 | `unoptimized`プロパティを使用 |
| **video.currentTime** | 動画がロードされていないと0を返す | `loadedmetadata`イベント後に使用 |
| **削除の競合** | 複数タブで同時削除 | 楽観的UIではなく削除後に再取得 |

### 6.4 Next.js設定（必要な場合）

R2のドメインを画像ソースとして許可する必要がある場合：

```javascript
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',  // または具体的なバケットドメイン
      },
    ],
  },
}
```

---

## 7. 実装チェックリスト

### Phase 1: バックエンド基盤
- [x] Supabaseマイグレーション実行（`video_screenshots`テーブル）
- [x] `app/videos/schemas.py` にスキーマ追加
  - [x] `ScreenshotSource` Enum
  - [x] `ScreenshotCreateRequest` モデル
  - [x] `ScreenshotResponse` モデル
  - [x] `ScreenshotListResponse` モデル
- [x] `app/videos/service.py` にヘルパー関数追加
  - [x] `get_image_dimensions()` 関数
- [x] `app/videos/router.py` にエンドポイント追加
  - [x] `_resolve_video_url()` ヘルパー
  - [x] `_get_source_columns()` ヘルパー
  - [x] `_db_row_to_response()` ヘルパー
  - [x] `POST /screenshots` エンドポイント
  - [x] `GET /screenshots` エンドポイント
  - [x] `GET /screenshots/{id}` エンドポイント
  - [x] `DELETE /screenshots/{id}` エンドポイント

### Phase 2: フロントエンド
- [x] `components/video/screenshot-button.tsx` 作成
- [x] `components/video/screenshot-gallery.tsx` 作成
- [x] `lib/api/client.ts` にスクリーンショットAPI追加
- [ ] 動画詳細ページにボタン統合（手動統合が必要）
- [ ] ダッシュボードにギャラリー統合（手動統合が必要）
- [ ] 動画生成フォームに画像選択機能追加（手動統合が必要）

### Phase 3: テスト
- [ ] `tests/videos/test_screenshots.py` 作成
- [x] 既存APIテスト実行（11 passed）
- [ ] E2Eテスト実行（オプション）
- [ ] 手動テスト
  - [ ] 生成動画からスクリーンショット
  - [ ] ストーリーボードシーンからスクリーンショット
  - [ ] アップロード動画からスクリーンショット
  - [ ] スクリーンショットから動画生成

---

## 8. 将来の拡張案

1. **フロントエンドプレビュー**: Canvas APIでサーバー不要の即座プレビュー
2. **バッチ抽出**: 複数タイムスタンプを一度に指定して連続抽出
3. **自動サムネイル**: 動画生成完了時に自動でベストフレームを抽出
4. **画像編集**: 抽出後にクロップや明るさ調整
5. **キャプション付き保存**: AIで画像を分析してタイトルを自動生成

---

## 9. テスト実行コマンド

```bash
# バックエンドテスト
cd movie-maker-api
pytest tests/videos/test_screenshots.py -v

# 全テスト
pytest -v

# フロントエンドE2Eテスト（Playwright）
cd movie-maker
npx playwright test tests/e2e/screenshot-flow.spec.ts
```
