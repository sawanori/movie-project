# HLS アダプティブストリーミング実装計画書

## 概要

動画配信の品質向上と帯域最適化のため、HLS (HTTP Live Streaming) アダプティブストリーミングを実装する。

| 項目 | 内容 |
|------|------|
| 目的 | 帯域に応じた動的品質切替、シーク・再開対応 |
| 効果 | 低速回線でも再生可能、バッファリング削減、UX向上 |
| 推定工数 | 3-5日 |
| 対象 | Backend (FFmpeg, R2) + Frontend (hls.js) + DB |

---

## 1. HLS とは

### 1.1 基本概念

HLS は Apple が開発したストリーミングプロトコル。動画を小さなセグメント（通常2-10秒）に分割し、プレイリスト（m3u8）で管理する。

```
master.m3u8 (マスタープレイリスト)
├── 720p/
│   ├── playlist.m3u8
│   ├── init.mp4
│   ├── segment_000.m4s
│   ├── segment_001.m4s
│   └── ...
└── 360p/
    ├── playlist.m3u8
    ├── init.mp4
    ├── segment_000.m4s
    └── ...
```

### 1.2 メリット

| メリット | 説明 |
|----------|------|
| アダプティブビットレート | 帯域に応じて自動的に品質切替 |
| シーク対応 | セグメント単位でシーク可能 |
| 再開対応 | 途中からの再生再開が容易 |
| CDN親和性 | 静的ファイルとしてCDN配信可能 |
| 広範なサポート | iOS/Safari はネイティブ、他はhls.jsで対応 |

### 1.3 デメリット・考慮点

| 項目 | 説明 | 対策 |
|------|------|------|
| ストレージ増加 | 複数品質分のファイル | 重要な動画のみHLS化、または2品質に絞る |
| エンコード時間増加 | 複数品質のエンコード | 非同期バックグラウンド処理 |
| 初期遅延 | プレイリスト読み込み | プリロード、短いセグメント長 |

---

## 2. アーキテクチャ設計

### 2.1 全体フロー

```
[動画生成完了]
      ↓
[FFmpeg: HLS変換タスク（非同期）]
      ↓
  ┌───┴───┐
  ↓       ↓
[720p]  [360p]  ← 2品質に絞る（ストレージ・処理時間のバランス）
  ↓       ↓
[セグメント生成 (.ts)]
      ↓
[プレイリスト生成 (.m3u8)]
      ↓
[R2 アップロード]
      ↓
[DB更新: hls_master_url]
      ↓
[Frontend: hls.js で再生]
```

### 2.2 品質レベル設定

> ⚠️ **重要**: 本プロジェクトは縦型ショート動画（9:16）のため、品質は2レベルに絞る

| 品質 | 解像度 | ビットレート | 用途 |
|------|--------|-------------|------|
| high | 720x1280 | 2500kbps | WiFi / 4G |
| low | 360x640 | 800kbps | 3G / 低速回線 |

### 2.3 セグメント設定

| 項目 | 値 | 理由 |
|------|-----|------|
| セグメント長 | 2秒 | 5秒動画なので短めに設定 |
| フォーマット | fMP4 (.m4s) | ts より効率的、iOS 10+対応 |

---

## 3. データベース設計

### 3.1 スキーマ変更

> ⚠️ **マイグレーション実行**: `mcp__supabase__apply_migration` を使用

以下のテーブルに HLS URL カラムを追加する。

#### 対象テーブル

| テーブル | 追加カラム | 説明 |
|----------|-----------|------|
| `video_generations` | `hls_master_url` | HLS マスタープレイリストURL |
| `storyboards` | `hls_master_url` | ストーリーボード最終動画のHLS URL |
| `storyboard_scenes` | `hls_master_url` | シーン動画のHLS URL |
| `video_concatenations` | `hls_master_url` | 結合動画のHLS URL |
| `user_videos` | `hls_master_url` | ユーザーアップロード動画のHLS URL |

#### マイグレーション SQL

```sql
-- Migration: add_hls_streaming_columns
-- Description: Add HLS master playlist URL columns for adaptive streaming

-- video_generations テーブル
ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS hls_master_url TEXT;

-- storyboards テーブル
ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS hls_master_url TEXT;

-- storyboard_scenes テーブル
ALTER TABLE storyboard_scenes
ADD COLUMN IF NOT EXISTS hls_master_url TEXT;

-- video_concatenations テーブル
ALTER TABLE video_concatenations
ADD COLUMN IF NOT EXISTS hls_master_url TEXT;

-- user_videos テーブル
ALTER TABLE user_videos
ADD COLUMN IF NOT EXISTS hls_master_url TEXT;

-- コメント追加
COMMENT ON COLUMN video_generations.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN storyboards.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN storyboard_scenes.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN video_concatenations.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN user_videos.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
```

#### マイグレーション実行手順

```python
# Claude Code で実行:
mcp__supabase__apply_migration(
    project_id="qhwgvahnccpqudxtnvat",
    name="add_hls_streaming_columns",
    query="上記SQL"
)
```

---

## 4. Backend 実装

### 4.1 FFmpeg HLS 変換サービス

**新規ファイル**: `movie-maker-api/app/services/hls_service.py`

```python
import asyncio
import os
import logging
from typing import Any

logger = logging.getLogger(__name__)


class HLSConfig:
    """HLS変換設定"""
    SEGMENT_DURATION = 2  # 秒

    # 品質設定（縦型動画 9:16 用）
    # ⚠️ 注意: FFmpeg scale フィルターは width:height の順
    QUALITIES = [
        {
            "name": "720p",
            "width": 720,
            "height": 1280,
            "bitrate": "2500k",
            "maxrate": "3000k",
            "bufsize": "5000k",
        },
        {
            "name": "360p",
            "width": 360,
            "height": 640,
            "bitrate": "800k",
            "maxrate": "1000k",
            "bufsize": "1600k",
        },
    ]


class HLSConversionError(Exception):
    """HLS変換エラー"""
    pass


async def convert_to_hls(
    input_path: str,
    output_dir: str,
    video_id: str,
) -> dict[str, str]:
    """
    動画をHLS形式に変換

    Args:
        input_path: 入力動画パス
        output_dir: 出力ディレクトリ
        video_id: 動画ID（ファイル名に使用）

    Returns:
        {
            "master_playlist": "path/to/master.m3u8",
            "720p_playlist": "path/to/720p/playlist.m3u8",
            "360p_playlist": "path/to/360p/playlist.m3u8",
        }

    Raises:
        HLSConversionError: FFmpegエラー時
    """
    results: dict[str, str] = {}

    for quality in HLSConfig.QUALITIES:
        quality_dir = os.path.join(output_dir, quality["name"])
        os.makedirs(quality_dir, exist_ok=True)

        playlist_path = os.path.join(quality_dir, "playlist.m3u8")
        segment_pattern = os.path.join(quality_dir, "segment_%03d.m4s")

        # ⚠️ 重要: FFmpeg scale フィルターは width:height の順
        # force_original_aspect_ratio=decrease でアスペクト比を維持
        # pad でターゲットサイズにパディング（レターボックス）
        scale_filter = (
            f"scale={quality['width']}:{quality['height']}:"
            f"force_original_aspect_ratio=decrease,"
            f"pad={quality['width']}:{quality['height']}:(ow-iw)/2:(oh-ih)/2:black"
        )

        # FFmpeg コマンド構築
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", scale_filter,
            "-c:v", "libx264",
            "-preset", "fast",
            "-profile:v", "main",  # 互換性のため main プロファイル
            "-level", "4.0",
            "-b:v", quality["bitrate"],
            "-maxrate", quality["maxrate"],
            "-bufsize", quality["bufsize"],
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2",  # ステレオ
            "-f", "hls",
            "-hls_time", str(HLSConfig.SEGMENT_DURATION),
            "-hls_playlist_type", "vod",
            "-hls_segment_type", "fmp4",
            "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", segment_pattern,
            "-movflags", "+faststart",
            playlist_path,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"HLS conversion failed for {quality['name']}: {error_msg}")
            raise HLSConversionError(f"HLS conversion failed for {quality['name']}: {error_msg}")

        results[f"{quality['name']}_playlist"] = playlist_path
        logger.info(f"HLS conversion completed for {quality['name']}")

    # マスタープレイリスト生成
    master_path = os.path.join(output_dir, "master.m3u8")
    _generate_master_playlist(master_path, HLSConfig.QUALITIES)
    results["master_playlist"] = master_path

    return results


def _generate_master_playlist(
    output_path: str,
    qualities: list[dict[str, Any]],
) -> None:
    """マスタープレイリスト生成（同期関数）"""

    # 帯域幅計算（ビットレート + オーディオ 128kbps）
    bandwidth_map = {
        "720p": 2628000,  # 2500k video + 128k audio
        "360p": 928000,   # 800k video + 128k audio
    }

    lines = ["#EXTM3U", "#EXT-X-VERSION:6", ""]

    for quality in qualities:
        name = quality["name"]
        bandwidth = bandwidth_map.get(name, 1000000)
        # HLS RESOLUTION は width x height の順
        resolution = f"{quality['width']}x{quality['height']}"

        lines.append(
            f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},'
            f'RESOLUTION={resolution},'
            f'CODECS="avc1.4d401f,mp4a.40.2",'
            f'NAME="{name}"'
        )
        lines.append(f"{name}/playlist.m3u8")
        lines.append("")

    content = "\n".join(lines)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)


def _upload_file_to_r2_sync(
    client: Any,
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
    cache_control: str,
) -> None:
    """R2へのファイルアップロード（同期、to_thread用）"""
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType=content_type,
        CacheControl=cache_control,
    )


async def upload_hls_to_r2(
    output_dir: str,
    video_id: str,
) -> str:
    """
    HLSファイルをR2にアップロード（非同期）

    ⚠️ 注意: boto3 put_object は同期処理のため asyncio.to_thread でラップ

    Args:
        output_dir: HLSファイルが格納されたディレクトリ
        video_id: 動画ID

    Returns:
        マスタープレイリストのURL
    """
    from app.external.r2 import get_r2_client, get_public_url, settings

    client = get_r2_client()
    base_key = f"hls/{video_id}"

    # アップロードタスクを収集
    upload_tasks = []

    for root, _dirs, files in os.walk(output_dir):
        for file in files:
            local_path = os.path.join(root, file)
            relative_path = os.path.relpath(local_path, output_dir)
            r2_key = f"{base_key}/{relative_path}"

            # Content-Type 決定
            if file.endswith(".m3u8"):
                content_type = "application/vnd.apple.mpegurl"
            elif file.endswith(".m4s"):
                content_type = "video/iso.segment"
            elif file.endswith(".mp4"):
                content_type = "video/mp4"
            else:
                content_type = "application/octet-stream"

            # ファイル読み込み
            with open(local_path, "rb") as f:
                file_content = f.read()

            # 非同期アップロードタスクを追加
            task = asyncio.to_thread(
                _upload_file_to_r2_sync,
                client,
                settings.R2_BUCKET_NAME,
                r2_key,
                file_content,
                content_type,
                "public, max-age=31536000, immutable",
            )
            upload_tasks.append(task)

    # 並列アップロード実行
    await asyncio.gather(*upload_tasks)

    master_url = get_public_url(f"{base_key}/master.m3u8")
    logger.info(f"HLS files uploaded to R2: {master_url}")
    return master_url
```

### 4.2 HLS 変換タスク

**修正ファイル**: `movie-maker-api/app/tasks/video_processor.py`

動画生成完了後に HLS 変換を非同期で実行する。

> ⚠️ **重要**: この関数は動画生成完了後にバックグラウンドで呼び出す。
> HLS変換は時間がかかるため、ユーザーへのレスポンスをブロックしないこと。

```python
import os
import tempfile
import logging
import httpx
from app.services.hls_service import convert_to_hls, upload_hls_to_r2, HLSConversionError

logger = logging.getLogger(__name__)


async def process_hls_conversion(
    video_id: str,
    video_url: str,
    supabase_client,
    table_name: str = "video_generations",
) -> str | None:
    """
    動画をHLS形式に変換してR2にアップロード

    Args:
        video_id: 動画ID
        video_url: 元動画のURL
        supabase_client: Supabaseクライアント
        table_name: 更新対象テーブル名（デフォルト: video_generations）

    Returns:
        HLSマスタープレイリストのURL、失敗時はNone

    Note:
        この関数は動画生成完了後にバックグラウンドで呼び出される。
        失敗してもユーザー体験に影響しない（MP4フォールバックあり）。
    """
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # 元動画をストリーミングダウンロード（メモリ効率化）
            input_path = os.path.join(temp_dir, "input.mp4")

            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
                async with client.stream("GET", video_url) as response:
                    response.raise_for_status()
                    with open(input_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            f.write(chunk)

            logger.info(f"Downloaded video for HLS conversion: {video_id}")

            # HLS変換
            output_dir = os.path.join(temp_dir, "hls")
            os.makedirs(output_dir, exist_ok=True)

            await convert_to_hls(input_path, output_dir, video_id)

            # R2にアップロード
            master_url = await upload_hls_to_r2(output_dir, video_id)

            # DB更新
            await supabase_client.table(table_name).update({
                "hls_master_url": master_url
            }).eq("id", video_id).execute()

            logger.info(f"HLS conversion completed for video {video_id}: {master_url}")
            return master_url

    except HLSConversionError as e:
        logger.error(f"HLS conversion failed for video {video_id}: {e}")
        return None
    except httpx.HTTPError as e:
        logger.error(f"Failed to download video {video_id} for HLS conversion: {e}")
        return None
    except Exception as e:
        logger.exception(f"Unexpected error during HLS conversion for video {video_id}: {e}")
        return None


# 呼び出し例（video_processor.py 内の適切な場所に追加）
# ⚠️ 重要: create_task でバックグラウンド実行し、レスポンスをブロックしない
#
# import asyncio
#
# async def on_video_generation_complete(video_id: str, video_url: str, supabase_client):
#     """動画生成完了時のコールバック"""
#     # HLS変換をバックグラウンドで開始（結果を待たない）
#     asyncio.create_task(
#         process_hls_conversion(video_id, video_url, supabase_client)
#     )
```

### 4.3 スキーマ更新

**修正ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
# VideoResponse に追加
class VideoResponse(BaseModel):
    # ... 既存フィールド
    final_video_url: str | None = None
    hls_master_url: str | None = None  # 追加

# StoryboardSceneResponse に追加
class StoryboardSceneResponse(BaseModel):
    # ... 既存フィールド
    video_url: str | None = None
    hls_master_url: str | None = None  # 追加

# UserVideoResponse に追加
class UserVideoResponse(BaseModel):
    # ... 既存フィールド
    video_url: str | None = None
    hls_master_url: str | None = None  # 追加
```

---

## 5. Frontend 実装

### 5.1 hls.js インストール

```bash
cd movie-maker
npm install hls.js
```

### 5.2 HLS プレイヤーコンポーネント

**新規ファイル**: `movie-maker/components/video/hls-player.tsx`

> ⚠️ **注意点**:
> - useEffect のクリーンアップで状態をリセット
> - Safari/iOS のネイティブ HLS を優先
> - エラー時は MP4 へフォールバック

```tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface HLSPlayerProps {
  /** HLS マスタープレイリストURL */
  hlsUrl: string | null | undefined;
  /** フォールバック用の通常動画URL */
  fallbackUrl: string | null | undefined;
  /** ポスター画像 */
  poster?: string;
  /** 自動再生 */
  autoPlay?: boolean;
  /** ミュート */
  muted?: boolean;
  /** ループ再生 */
  loop?: boolean;
  /** className */
  className?: string;
  /** コントロール表示 */
  controls?: boolean;
  /** preload設定 */
  preload?: 'none' | 'metadata' | 'auto';
  /** 再生エラー時のコールバック */
  onError?: (error: Error) => void;
}

export function HLSPlayer({
  hlsUrl,
  fallbackUrl,
  poster,
  autoPlay = false,
  muted = true,
  loop = false,
  className,
  controls = true,
  preload = 'metadata',
  onError,
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isHLSActive, setIsHLSActive] = useState(false);

  // フォールバック処理
  const fallbackToMp4 = useCallback(() => {
    const video = videoRef.current;
    if (video && fallbackUrl) {
      video.src = fallbackUrl;
      setIsHLSActive(false);
    }
  }, [fallbackUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // クリーンアップ関数
    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsHLSActive(false);
    };

    // HLS URLがない場合はフォールバック
    if (!hlsUrl) {
      cleanup();
      if (fallbackUrl) {
        video.src = fallbackUrl;
      }
      return cleanup;
    }

    // Safari/iOS はネイティブHLSサポート（優先）
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      cleanup();
      video.src = hlsUrl;
      setIsHLSActive(true);
      return cleanup;
    }

    // hls.js サポートチェック
    if (Hls.isSupported()) {
      // 既存のインスタンスをクリーンアップ
      cleanup();

      const hls = new Hls({
        // 品質自動切替設定
        autoStartLoad: true,
        startLevel: -1, // 自動選択
        capLevelToPlayerSize: true, // プレイヤーサイズに合わせる
        // バッファ設定（短い動画用に最適化）
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        maxBufferSize: 30 * 1000 * 1000, // 30MB
        // エラーリカバリー
        enableWorker: true,
        lowLatencyMode: false,
        // フラグメント読み込み設定
        fragLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 3,
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsHLSActive(true);
        if (autoPlay) {
          video.play().catch((e) => {
            // 自動再生がブロックされた場合（ブラウザポリシー）
            console.warn('Autoplay was prevented:', e);
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data.type, data.details);

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // ネットワークエラー時はリトライ
              console.log('HLS network error, attempting recovery...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              // メディアエラー時はリカバリー
              console.log('HLS media error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              // 回復不能エラー時はフォールバック
              console.log('HLS unrecoverable error, falling back to MP4...');
              hls.destroy();
              hlsRef.current = null;
              fallbackToMp4();
              onError?.(new Error(`HLS error: ${data.type} - ${data.details}`));
              break;
          }
        }
      });

      hlsRef.current = hls;

      return cleanup;
    }

    // hls.js 非サポート時はフォールバック
    if (fallbackUrl) {
      video.src = fallbackUrl;
    }

    return cleanup;
  }, [hlsUrl, fallbackUrl, autoPlay, fallbackToMp4, onError]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      controls={controls}
      preload={preload}
      playsInline
      className={className}
    />
  );
}

// HLS インスタンスへのアクセスが必要な場合のフック
export function useHLSInstance(videoRef: React.RefObject<HTMLVideoElement>) {
  const hlsRef = useRef<Hls | null>(null);
  return hlsRef;
}
```

### 5.3 品質セレクターコンポーネント（オプション）

**新規ファイル**: `movie-maker/components/video/quality-selector.tsx`

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface QualitySelectorProps {
  hls: Hls | null;
}

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  name: string;
}

export function QualitySelector({ hls }: QualitySelectorProps) {
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto

  const updateLevels = useCallback(() => {
    if (!hls) return;
    const hlsLevels = hls.levels.map((level, index) => ({
      index,
      height: level.height,
      bitrate: level.bitrate,
      name: `${level.height}p`,
    }));
    setLevels(hlsLevels);
  }, [hls]);

  const handleLevelSwitch = useCallback((_: unknown, data: { level: number }) => {
    setCurrentLevel(data.level);
  }, []);

  useEffect(() => {
    if (!hls) return;

    hls.on(Hls.Events.MANIFEST_PARSED, updateLevels);
    hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitch);

    // ⚠️ 重要: 全てのイベントリスナーを解除
    return () => {
      hls.off(Hls.Events.MANIFEST_PARSED, updateLevels);
      hls.off(Hls.Events.LEVEL_SWITCHED, handleLevelSwitch);
    };
  }, [hls, updateLevels, handleLevelSwitch]);

  const handleQualityChange = (level: number) => {
    if (hls) {
      hls.currentLevel = level;
      setCurrentLevel(level);
    }
  };

  if (levels.length === 0) return null;

  return (
    <select
      value={currentLevel}
      onChange={(e) => handleQualityChange(Number(e.target.value))}
      className="bg-black/50 text-white text-sm px-2 py-1 rounded"
      aria-label="Video quality"
    >
      <option value={-1}>Auto</option>
      {levels.map((level) => (
        <option key={level.index} value={level.index}>
          {level.name}
        </option>
      ))}
    </select>
  );
}
```

### 5.4 API Client 型更新

**修正ファイル**: `movie-maker/lib/api/client.ts`

```typescript
// Video 型に追加
export interface Video {
  // ... 既存フィールド
  final_video_url: string | null;
  hls_master_url?: string | null;  // 追加
}

// StoryboardScene 型に追加
export interface StoryboardScene {
  // ... 既存フィールド
  video_url: string | null;
  hls_master_url?: string | null;  // 追加
}

// UserVideo 型に追加
export interface UserVideo {
  // ... 既存フィールド
  video_url: string | null;
  hls_master_url?: string | null;  // 追加
}
```

### 5.5 既存コンポーネントの更新

**修正例**: `movie-maker/app/generate/[id]/page.tsx`

```tsx
import { HLSPlayer } from '@/components/video/hls-player';

// 既存の <video> タグを HLSPlayer に置き換え
<HLSPlayer
  hlsUrl={video.hls_master_url}
  fallbackUrl={video.final_video_url}
  poster={video.original_image_url}
  controls
  autoPlay={false}
  muted={false}
  loop
  className="w-full h-full object-cover"
/>
```

---

## 6. R2 / Cloudflare CORS 設定

> ⚠️ **重要**: HLS セグメントを異なるドメインから読み込む場合、CORS 設定が必要

### 6.1 R2 CORS 設定

Cloudflare R2 の CORS 設定は Cloudflare Dashboard または API で行う。

**Cloudflare Dashboard での設定手順**:
1. Cloudflare Dashboard → R2 → バケット選択 → Settings
2. CORS Policy を追加:

```json
[
  {
    "AllowedOrigins": [
      "https://your-frontend-domain.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range"],
    "MaxAgeSeconds": 86400
  }
]
```

### 6.2 必要なヘッダー

HLS 再生に必要なレスポンスヘッダー:

| ヘッダー | 値 | 用途 |
|---------|-----|------|
| `Access-Control-Allow-Origin` | フロントエンドドメイン | CORS |
| `Content-Type` | `application/vnd.apple.mpegurl` (m3u8), `video/mp4` (init), `video/iso.segment` (m4s) | メディアタイプ |
| `Cache-Control` | `public, max-age=31536000, immutable` | CDN キャッシュ |

---

## 7. 実装チェックリスト

### Phase 1: データベース準備

- [ ] **Supabase マイグレーション実行** (`mcp__supabase__apply_migration` 使用)
  - [ ] `video_generations.hls_master_url`
  - [ ] `storyboards.hls_master_url`
  - [ ] `storyboard_scenes.hls_master_url`
  - [ ] `video_concatenations.hls_master_url`
  - [ ] `user_videos.hls_master_url`

### Phase 2: インフラ準備

- [ ] **R2 CORS 設定**（Cloudflare Dashboard）
  - [ ] フロントエンドドメインを許可
  - [ ] localhost:3000 を開発用に許可

### Phase 3: Backend 実装

- [ ] `movie-maker-api/app/services/hls_service.py` 新規作成
  - [ ] `HLSConfig` クラス
  - [ ] `HLSConversionError` 例外クラス
  - [ ] `convert_to_hls()` 関数
  - [ ] `_generate_master_playlist()` 関数
  - [ ] `upload_hls_to_r2()` 関数（非同期・並列アップロード）
- [ ] `movie-maker-api/app/tasks/video_processor.py` 修正
  - [ ] `process_hls_conversion()` 関数追加
  - [ ] 動画生成完了時にバックグラウンドで HLS 変換を呼び出し
- [ ] `movie-maker-api/app/videos/schemas.py` 修正
  - [ ] 各 Response に `hls_master_url` 追加
- [ ] Backend テスト確認 (`pytest`)

### Phase 4: Frontend 実装

- [ ] `npm install hls.js`
- [ ] `movie-maker/components/video/hls-player.tsx` 新規作成
- [ ] `movie-maker/components/video/quality-selector.tsx` 新規作成（オプション）
- [ ] `movie-maker/lib/api/client.ts` 型更新
- [ ] 既存ページの video タグを HLSPlayer に置き換え
  - [ ] `app/generate/[id]/page.tsx`
  - [ ] `app/generate/storyboard/page.tsx`
  - [ ] その他必要なページ
- [ ] Frontend ビルド確認 (`npm run build`)

### Phase 5: 統合テスト

- [ ] 新規動画生成 → HLS 変換 → 再生確認
- [ ] 低速回線エミュレーション → 品質自動切替確認
- [ ] Safari/iOS でのネイティブHLS再生確認
- [ ] Chrome/Firefox での hls.js 再生確認
- [ ] フォールバック（HLS URL なし）の動作確認
- [ ] CORS エラーが発生しないことを確認

---

## 8. 段階的ロールアウト戦略

### 8.1 Phase A: 新規動画のみ（推奨）

1. 新規生成動画からHLS変換を開始
2. 既存動画は従来通りMP4で配信
3. `hls_master_url` が存在する場合のみHLSプレイヤーを使用

### 8.2 Phase B: 既存動画のバッチ変換（オプション）

```python
# バッチ変換スクリプト
async def batch_convert_to_hls():
    # hls_master_url が NULL の動画を取得
    videos = await supabase.table("video_generations") \
        .select("id, final_video_url") \
        .is_("hls_master_url", None) \
        .not_.is_("final_video_url", None) \
        .limit(100) \
        .execute()

    for video in videos.data:
        await process_hls_conversion(
            video["id"],
            video["final_video_url"],
            supabase
        )
```

---

## 9. 期待される効果

| 指標 | 改善見込み |
|------|-----------|
| 低速回線での再生成功率 | 50% → 95% |
| バッファリング時間 | 60% 削減 |
| 初回再生開始時間 | 変化なし〜微増 |
| ストレージ使用量 | 約2倍（2品質分） |

---

## 10. 将来の拡張

1. **DASH 対応**: より広範なブラウザサポート
2. **DRM 対応**: コンテンツ保護が必要な場合
3. **ライブストリーミング**: リアルタイム配信が必要な場合
4. **Cloudflare Stream / Mux 連携**: マネージドサービスへの移行

---

## 11. 参考資料

- [Apple HLS Authoring Specification](https://developer.apple.com/documentation/http-live-streaming)
- [hls.js Documentation](https://github.com/video-dev/hls.js)
- [FFmpeg HLS Muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2)
