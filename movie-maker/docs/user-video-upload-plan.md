# ユーザー動画アップロード機能 実装計画書

## 概要

ユーザーが自分で撮影した動画素材をアップロードし、CM作成や動画連結で使用できるようにする機能。

### 要件

| 項目 | 制限値 |
|------|--------|
| 対応フォーマット | MP4, MOV |
| 最大解像度 | 4K (3840x2160) |
| 最大尺 | 10秒 |
| 最大ファイルサイズ | 50MB |
| 推奨コーデック | H.264 |

### 前提条件（実装前に確認）

- [x] `react-dropzone` パッケージのインストール: `npm install react-dropzone`
- [x] DBに `update_updated_at_column()` トリガー関数が存在すること（なければPhase 1で作成）

---

## アーキテクチャ

### システム構成図

```
[Frontend]                    [Backend]                     [Storage]
     │                            │                             │
     │  POST /upload-video        │                             │
     ├───────────────────────────>│                             │
     │                            │  1. バリデーション            │
     │                            │  2. FFprobe メタデータ取得    │
     │                            │  3. サムネイル生成            │
     │                            │                             │
     │                            │  PUT user_videos/...        │
     │                            ├────────────────────────────>│ R2
     │                            │                             │
     │                            │  INSERT user_videos         │
     │                            ├────────────────────────────>│ Supabase
     │                            │                             │
     │  UserVideoResponse         │                             │
     │<───────────────────────────┤                             │
```

### R2ストレージ構造

```
bucket/
├── images/{user_id}/{uuid}.{ext}           # 既存: ユーザー画像
├── videos/{filename}.mp4                    # 既存: 生成動画
├── bgm/{user_id}/{uuid}.{ext}              # 既存: ユーザーBGM
├── motions/{category}/{motion_id}.mp4      # 既存: Act-Twoモーション
└── user_videos/                            # 新規
    └── {user_id}/
        ├── {uuid}.mp4                      # アップロード動画
        └── {uuid}_thumb.jpg                # サムネイル
```

---

## Phase 1: データベース

### 1.1 テーブル定義

**ファイル**: Supabase Migration

```sql
-- Migration: create_user_videos_table
-- Description: ユーザーアップロード動画を管理するテーブル

-- トリガー関数が存在しない場合は作成（冪等性確保）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE user_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 基本情報
  title TEXT NOT NULL,
  description TEXT,

  -- ストレージ
  r2_key TEXT NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,

  -- メタデータ
  duration_seconds FLOAT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4', 'video/quicktime')),

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- コメント
COMMENT ON TABLE user_videos IS 'ユーザーがアップロードした動画素材';
COMMENT ON COLUMN user_videos.duration_seconds IS '動画の長さ（秒）。最大10秒';
COMMENT ON COLUMN user_videos.width IS '動画の幅（px）。最大3840';
COMMENT ON COLUMN user_videos.height IS '動画の高さ（px）。最大2160';

-- インデックス
CREATE INDEX idx_user_videos_user_id ON user_videos(user_id);
CREATE INDEX idx_user_videos_created_at ON user_videos(created_at DESC);

-- RLS（Row Level Security）
ALTER TABLE user_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos"
  ON user_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own videos"
  ON user_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos"
  ON user_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos"
  ON user_videos FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at 自動更新トリガー
CREATE TRIGGER update_user_videos_updated_at
  BEFORE UPDATE ON user_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Phase 2: バックエンドAPI

### 2.1 スキーマ定義

**ファイル**: `movie-maker-api/app/videos/schemas.py` に追加

```python
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserVideoResponse(BaseModel):
    """ユーザー動画レスポンス"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    description: Optional[str] = None
    video_url: str
    thumbnail_url: Optional[str] = None
    duration_seconds: float
    width: int
    height: int
    file_size_bytes: int
    mime_type: str
    created_at: datetime
    updated_at: datetime


class UserVideoListResponse(BaseModel):
    """ユーザー動画一覧レスポンス"""
    videos: list[UserVideoResponse]
    total: int
    page: int
    per_page: int
    has_next: bool
```

### 2.2 サービス層

**ファイル**: `movie-maker-api/app/videos/service.py` に追加

```python
import tempfile
import os
import uuid as uuid_lib
from typing import Optional
from supabase import Client
from app.services.ffmpeg_service import get_ffmpeg_service
from app.external.r2 import upload_user_video as r2_upload_user_video, delete_file

# ユーザー動画アップロード制限（router.pyでも使用するためexport）
USER_VIDEO_MAX_SIZE_MB = 50
USER_VIDEO_MAX_DURATION_SEC = 10
USER_VIDEO_MAX_WIDTH = 3840
USER_VIDEO_MAX_HEIGHT = 2160
USER_VIDEO_ALLOWED_TYPES = {"video/mp4", "video/quicktime"}


async def upload_user_video(
    db: Client,
    user_id: str,
    content: bytes,  # ルーターで読み取ったファイル内容
    filename: str,
    mime_type: str,
    title: Optional[str] = None,
) -> dict:
    """
    ユーザー動画をアップロード

    1. 一時ファイルに保存
    2. FFprobeでメタデータ取得・バリデーション
    3. サムネイル生成
    4. R2にアップロード
    5. DBに保存
    """
    ffmpeg_service = get_ffmpeg_service()

    # 拡張子を取得
    ext = filename.split(".")[-1].lower() if "." in filename else "mp4"

    with tempfile.TemporaryDirectory() as tmp_dir:
        # 一時ファイルに保存
        video_path = os.path.join(tmp_dir, f"input.{ext}")
        with open(video_path, "wb") as f:
            f.write(content)

        # メタデータ取得
        metadata = await ffmpeg_service.get_video_metadata(video_path)

        # バリデーション
        if metadata["duration"] > USER_VIDEO_MAX_DURATION_SEC:
            raise ValueError(
                f"動画が長すぎます。最大{USER_VIDEO_MAX_DURATION_SEC}秒までアップロード可能です。"
                f"（現在: {metadata['duration']:.1f}秒）"
            )

        if metadata["width"] > USER_VIDEO_MAX_WIDTH or metadata["height"] > USER_VIDEO_MAX_HEIGHT:
            raise ValueError(
                f"解像度が大きすぎます。最大4K (3840x2160) までアップロード可能です。"
                f"（現在: {metadata['width']}x{metadata['height']}）"
            )

        # サムネイル生成
        thumb_path = os.path.join(tmp_dir, "thumbnail.jpg")
        await ffmpeg_service.extract_first_frame(video_path, thumb_path)

        # R2にアップロード
        video_uuid = str(uuid_lib.uuid4())
        video_key = f"user_videos/{user_id}/{video_uuid}.{ext}"
        thumb_key = f"user_videos/{user_id}/{video_uuid}_thumb.jpg"

        video_url = await r2_upload_user_video(content, video_key, mime_type)

        with open(thumb_path, "rb") as f:
            thumb_content = f.read()
        thumb_url = await r2_upload_user_video(thumb_content, thumb_key, "image/jpeg")

        # DBに保存
        result = db.table("user_videos").insert({
            "user_id": user_id,
            "title": title or filename.rsplit(".", 1)[0],
            "r2_key": video_key,
            "video_url": video_url,
            "thumbnail_url": thumb_url,
            "duration_seconds": metadata["duration"],
            "width": metadata["width"],
            "height": metadata["height"],
            "file_size_bytes": len(content),
            "mime_type": mime_type,
        }).execute()

        return result.data[0]


async def get_user_videos(
    db: Client,
    user_id: str,
    page: int = 1,
    per_page: int = 20,
) -> dict:
    """ユーザー動画一覧を取得"""
    offset = (page - 1) * per_page

    # 総数を取得
    count_result = db.table("user_videos").select("*", count="exact").eq("user_id", user_id).execute()
    total = count_result.count or 0

    # ページネーション付きで取得
    result = db.table("user_videos") \
        .select("*") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .range(offset, offset + per_page - 1) \
        .execute()

    return {
        "videos": result.data,
        "total": total,
        "page": page,
        "per_page": per_page,
        "has_next": offset + per_page < total,
    }


async def delete_user_video(
    db: Client,
    user_id: str,
    video_id: str,
) -> bool:
    """ユーザー動画を削除（R2 + DB）"""
    # 動画情報を取得
    result = db.table("user_videos") \
        .select("r2_key") \
        .eq("id", video_id) \
        .eq("user_id", user_id) \
        .execute()

    if not result.data:
        return False

    r2_key = result.data[0]["r2_key"]

    # R2から削除
    await delete_file(r2_key)
    # サムネイルも削除
    thumb_key = r2_key.replace(f".{r2_key.split('.')[-1]}", "_thumb.jpg")
    await delete_file(thumb_key)

    # DBから削除
    db.table("user_videos").delete().eq("id", video_id).eq("user_id", user_id).execute()

    return True
```

### 2.3 FFmpegサービス拡張

**ファイル**: `movie-maker-api/app/services/ffmpeg_service.py` に追加

> **注意**: 既存の `ffmpeg_service.py` には `get_video_info()` や `extract_first_frame()` など必要な関数が既に存在します。
> 追加が必要な場合は、既存のパターンに合わせて `asyncio.create_subprocess_exec` を使用してください。

```python
# 既存のffmpeg_service.pyのパターンに合わせた実装例
# （get_video_metadataが存在しない場合のみ追加）

import asyncio
import json


async def get_video_metadata(self, file_path: str) -> dict:
    """
    FFprobeで動画メタデータを取得（非同期版）

    Returns:
        {
            "duration": 5.5,
            "width": 1920,
            "height": 1080,
            "codec": "h264",
            "bitrate": 5000000,
        }
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]

    # 既存パターンに合わせてasyncio.create_subprocess_execを使用
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise ValueError(f"FFprobe failed: {stderr.decode()}")

    data = json.loads(stdout.decode())
    video_stream = next(
        (s for s in data["streams"] if s["codec_type"] == "video"),
        None
    )

    if not video_stream:
        raise ValueError("No video stream found")

    return {
        "duration": float(data["format"].get("duration", 0)),
        "width": video_stream.get("width", 0),
        "height": video_stream.get("height", 0),
        "codec": video_stream.get("codec_name", "unknown"),
        "bitrate": int(data["format"].get("bit_rate", 0)),
    }
```

**既存関数の確認**: `ffmpeg_service.py` には以下の関数が既にあるため、再利用可能です：
- `get_video_info()` - 動画情報取得
- `extract_first_frame()` - サムネイル生成
- `_get_video_duration()` - 動画長取得

### 2.4 R2ストレージ拡張

**ファイル**: `movie-maker-api/app/external/r2.py` に追加

```python
async def upload_user_video(file_content: bytes, key: str, content_type: str) -> str:
    """ユーザー動画をR2にアップロード（keyを直接指定）"""
    client = get_r2_client()

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
    )

    return get_public_url(key)
```

### 2.5 APIエンドポイント

**ファイル**: `movie-maker-api/app/videos/router.py` に追加

```python
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query
from pathlib import Path
from typing import Optional
from supabase import Client

from app.videos.schemas import UserVideoResponse, UserVideoListResponse
from app.videos import service
from app.videos.service import USER_VIDEO_ALLOWED_TYPES, USER_VIDEO_MAX_SIZE_MB
from app.core.dependencies import get_current_user, get_supabase


@router.post("/upload-video", response_model=UserVideoResponse)
async def upload_user_video_endpoint(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """
    ユーザー動画をアップロード

    制限:
    - ファイル形式: MP4, MOV
    - 最大サイズ: 50MB
    - 最大解像度: 4K (3840x2160)
    - 最大尺: 10秒
    """
    # Content-Type チェック
    if file.content_type not in USER_VIDEO_ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="対応していないファイル形式です。MP4またはMOVをアップロードしてください。"
        )

    # ファイルサイズチェック（ストリーミング読み込み）
    content = await file.read()
    file_size = len(content)

    if file_size > USER_VIDEO_MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"ファイルサイズが大きすぎます。最大{USER_VIDEO_MAX_SIZE_MB}MBまでアップロード可能です。"
        )

    # タイトル自動生成
    video_title = title or (Path(file.filename).stem if file.filename else "マイ動画")

    try:
        result = await service.upload_user_video(
            db=db,
            user_id=current_user["id"],
            content=content,
            filename=file.filename or "video.mp4",
            mime_type=file.content_type,
            title=video_title,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user-videos", response_model=UserVideoListResponse)
async def list_user_videos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """ユーザー動画一覧を取得"""
    return await service.get_user_videos(
        db=db,
        user_id=current_user["id"],
        page=page,
        per_page=per_page,
    )


@router.delete("/user-videos/{video_id}")
async def delete_user_video(
    video_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """ユーザー動画を削除"""
    success = await service.delete_user_video(
        db=db,
        user_id=current_user["id"],
        video_id=video_id,
    )

    if not success:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    return {"success": True}
```

---

## Phase 3: フロントエンド

### 3.0 依存関係のインストール（必須）

```bash
cd movie-maker
npm install react-dropzone
# 型定義は react-dropzone に含まれているため別途インストール不要
```

### 3.1 APIクライアント

**ファイル**: `movie-maker/lib/api/client.ts` に追加

> **重要**: FormData を送信する場合、`Content-Type` ヘッダーを手動設定しないこと。
> ブラウザが自動的に `multipart/form-data; boundary=...` を設定します。

```typescript
// 型定義
export interface UserVideo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  width: number;
  height: number;
  file_size_bytes: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface UserVideoListResponse {
  videos: UserVideo[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

// APIメソッド
export const userVideosApi = {
  /**
   * ユーザー動画をアップロード
   */
  async upload(file: File, title?: string): Promise<UserVideo> {
    const formData = new FormData();
    formData.append("file", file);
    if (title) {
      formData.append("title", title);
    }

    const response = await fetchWithAuth(`${API_BASE}/videos/upload-video`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "アップロードに失敗しました");
    }

    return response.json();
  },

  /**
   * ユーザー動画一覧を取得
   */
  async list(page = 1, perPage = 20): Promise<UserVideoListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    const response = await fetchWithAuth(
      `${API_BASE}/videos/user-videos?${params}`
    );

    if (!response.ok) {
      throw new Error("動画一覧の取得に失敗しました");
    }

    return response.json();
  },

  /**
   * ユーザー動画を削除
   */
  async delete(videoId: string): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE}/videos/user-videos/${videoId}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      throw new Error("削除に失敗しました");
    }
  },
};
```

### 3.2 アップロードコンポーネント

**ファイル**: `movie-maker/components/video/user-video-uploader.tsx`

```tsx
"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, Film, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { userVideosApi, UserVideo } from "@/lib/api/client";

interface UserVideoUploaderProps {
  onUploadComplete: (video: UserVideo) => void;
  onCancel?: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_TYPES = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
};

export function UserVideoUploader({
  onUploadComplete,
  onCancel,
}: UserVideoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    // ファイルサイズチェック
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("ファイルサイズが大きすぎます。最大50MBまでアップロード可能です。");
      return;
    }

    setFile(selectedFile);
    setError(null);

    // プレビュー用URL生成
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    disabled: uploading,
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // プログレス表示（実際のXHRプログレスは別途実装）
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const result = await userVideosApi.upload(file);

      clearInterval(progressInterval);
      setProgress(100);

      onUploadComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      {!file && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50"
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">
            動画をドラッグ＆ドロップ
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            または クリックしてファイルを選択
          </p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>対応形式: MP4, MOV</p>
            <p>最大サイズ: 50MB / 最大尺: 10秒 / 最大解像度: 4K</p>
          </div>
        </div>
      )}

      {/* プレビュー */}
      {file && preview && (
        <div className="relative rounded-xl overflow-hidden bg-zinc-900">
          <video
            src={preview}
            className="w-full aspect-video object-contain"
            controls
            muted
          />
          {!uploading && (
            <button
              onClick={handleClear}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* ファイル情報 */}
          <div className="p-3 bg-zinc-800 flex items-center gap-3">
            <Film className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          </div>

          {/* プログレスバー */}
          {uploading && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* アクションボタン */}
      {file && (
        <div className="flex gap-3">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={uploading}>
              キャンセル
            </Button>
          )}
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="flex-1"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                アップロード中...
              </>
            ) : (
              "アップロード"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
```

### 3.3 CM作成への統合

**ファイル**: `movie-maker/components/video/ad-video-selector-modal.tsx` を更新

```tsx
// タブで「生成動画」「マイ動画」を切り替え
const [activeTab, setActiveTab] = useState<"generated" | "uploaded">("generated");

// マイ動画タブの内容
{activeTab === "uploaded" && (
  <div className="space-y-4">
    {/* アップロードボタン */}
    <Button variant="outline" onClick={() => setShowUploader(true)}>
      <Upload className="w-4 h-4 mr-2" />
      新規アップロード
    </Button>

    {/* マイ動画一覧 */}
    <div className="grid grid-cols-3 gap-2">
      {userVideos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          onSelect={() => handleSelectUserVideo(video)}
        />
      ))}
    </div>
  </div>
)}
```

---

## Phase 4: 統合・テスト

### 4.1 統合チェックリスト

- [x] DBマイグレーション実行（Supabase MCP apply_migration で完了）
- [x] バックエンドAPI動作確認
  - [x] アップロードエンドポイント（POST /api/v1/videos/upload-video）
  - [x] 一覧取得エンドポイント（GET /api/v1/videos/user-videos）
  - [x] 削除エンドポイント（DELETE /api/v1/videos/user-videos/{video_id}）
- [x] pytest バックエンドテスト完了（10件パス）
- [x] フロントエンドビルド確認（Next.js build 成功）
- [ ] E2E動作確認（要手動テスト）
  - [ ] ドラッグ&ドロップ
  - [ ] バリデーションエラー表示
  - [ ] アップロード進捗表示
- [ ] CM作成フローでの統合確認
- [ ] 動画連結フローでの統合確認

### 4.2 テストケース

```python
# バックエンドテスト例
class TestUserVideoUpload:
    async def test_upload_valid_mp4(self):
        """有効なMP4ファイルをアップロード"""
        pass

    async def test_upload_too_large_file(self):
        """50MB超過ファイルはエラー"""
        pass

    async def test_upload_too_long_video(self):
        """10秒超過動画はエラー"""
        pass

    async def test_upload_invalid_format(self):
        """非対応フォーマットはエラー"""
        pass

    async def test_upload_over_4k_resolution(self):
        """4K超過解像度はエラー"""
        pass
```

---

## 実装スケジュール

| Phase | 内容 | 工数目安 |
|-------|------|----------|
| Phase 1 | DBテーブル作成 | 0.5日 |
| Phase 2 | バックエンドAPI | 1.5日 |
| Phase 3 | フロントエンド | 1.5日 |
| Phase 4 | 統合・テスト | 0.5日 |
| **合計** | | **4日** |

---

## 将来の拡張

1. **ストレージ容量制限**: プランごとに保存可能な容量を制限
2. **動画トリミング**: アップロード後にブラウザ上でトリム編集
3. **動画フォーマット変換**: MOV → MP4自動変換
4. **バッチアップロード**: 複数ファイル一括アップロード
5. **タグ・カテゴリ**: 動画の整理機能
6. **V2V入力**: Video-to-Video生成の参照素材として使用

---

## 付録: レビュー時に修正した問題点

### 修正済み問題

| 問題 | 修正内容 |
|------|----------|
| `react-dropzone` 未インストール | Phase 3.0 に npm install コマンドを追加 |
| DBトリガー関数の存在確認不足 | Phase 1.1 に `CREATE OR REPLACE FUNCTION` を追加 |
| Pydantic v1形式のConfig | `model_config = ConfigDict(...)` に変更 |
| FFmpeg同期パターン使用 | `asyncio.create_subprocess_exec` に変更 |
| Service関数シグネチャ不一致 | `content`, `filename`, `mime_type` パラメータを追加 |
| R2アップロード関数未定義 | Phase 2.4 に `upload_user_video` 関数を追加 |
| Router Importの不足 | 必要なimport文を明示 |
| FormData Content-Type設定 | 注意書きを追加（ブラウザ自動設定に任せる） |

### 実装時の注意点

1. **既存FFmpeg関数の確認**: `ffmpeg_service.py` には `get_video_info()` や `extract_first_frame()` が存在する可能性があるため、重複実装を避けること
2. **Supabase RLS**: INSERT/UPDATE/DELETE は全て `auth.uid() = user_id` でガード済み
3. **R2 CORS設定**: フロントエンドからの直接アクセスが必要な場合は別途設定が必要
4. **メモリ使用量**: 50MBファイルを `await file.read()` で全読み込みするため、同時アップロード数に注意

### 実装手順

1. **Phase 1: DB** - Supabase MCP の `apply_migration` を使用してマイグレーション実行
2. **Phase 2: Backend** - API実装後、pytest でユニットテスト実施
3. **Phase 3: Frontend** - `npm install react-dropzone` 後、コンポーネント実装
4. **Phase 4: 統合テスト** - E2Eでアップロードフロー確認

---

## 実装完了ファイル一覧（2025-01-06）

### バックエンド

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker-api/app/videos/schemas.py` | `UserVideoResponse`, `UserVideoListResponse` 追加 |
| `movie-maker-api/app/videos/service.py` | `upload_user_video`, `get_user_uploaded_videos`, `delete_user_uploaded_video` 追加 |
| `movie-maker-api/app/external/r2.py` | `upload_user_video` 関数追加 |
| `movie-maker-api/app/videos/router.py` | `/upload-video`, `/user-videos`, `/user-videos/{video_id}` エンドポイント追加 |
| `movie-maker-api/tests/videos/test_user_video.py` | 新規作成（10テストケース） |

### フロントエンド

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker/lib/api/client.ts` | `userVideosApi`, `UserVideo`, `UserVideoListResponse` 追加 |
| `movie-maker/components/video/user-video-uploader.tsx` | 新規作成（react-dropzone ベース） |
| `movie-maker/components/video/user-video-list.tsx` | 新規作成（動画一覧表示） |

### データベース

- Supabase マイグレーション `create_user_videos_table` 適用済み
