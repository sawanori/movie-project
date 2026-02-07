# 動画配信最適化 Phase 2: 遅延読み込み・ネットワーク検出・WebP変換

## 概要

Phase 1（faststart, Cache-Control, preload, poster）に続く追加最適化として、以下の3つの機能を実装する。

| # | 機能 | 対象 | 効果 |
|---|------|------|------|
| 1 | IntersectionObserver 遅延読み込み | Frontend | 初期ロード軽量化、帯域節約 |
| 2 | Network Information API | Frontend | 低速回線対応、ユーザー体験向上 |
| 3 | WebP サムネイル変換 | Backend + DB | 画像サイズ25-35%削減 |

---

## 1. IntersectionObserver 遅延読み込み

### 1.1 目的

- ビューポート外の `<video>` タグは `src` を設定せず、表示領域に入ったときに初めてロードを開始する
- ダッシュボードや履歴ページなど、多数の動画が一覧表示されるページで効果大

### 1.2 実装方針

> ⚠️ **重要**: 現在の実装では `<video>` タグが `.map()` ループ内にあるため、**React Hooks を直接使用できない**。
> 解決策として、**カードコンポーネントを分離**し、各コンポーネント内でフックを使用する。

カスタムフック `useLazyVideo` を作成し、**分離したカードコンポーネント**で使用する。

### 1.3 対象ファイル

| ファイル | `<video>` 数 | 遅延読み込み対象 | 実装方法 |
|---------|-------------|-----------------|---------|
| `app/dashboard/page.tsx` | 4 | ストーリーボード一覧、動画一覧、プロジェクト一覧、モーション | カードコンポーネント分離 |
| `app/history/page.tsx` | 1 | 動画履歴一覧 | カードコンポーネント分離 |
| `app/concat/history/page.tsx` | 1 | 結合動画履歴 | カードコンポーネント分離 |
| `app/generate/storyboard/history/page.tsx` | 1 | ストーリーボード履歴 | カードコンポーネント分離 |

**対象外**（常に表示されるため）:
- `app/generate/[id]/page.tsx` - 単一動画の詳細表示
- `app/generate/storyboard/page.tsx` - 編集中のシーン（アクティブ）
- `components/video/*` - 既に表示されているコンポーネント

### 1.4 実装詳細

#### 1.4.1 カスタムフック作成

**新規ファイル**: `movie-maker/lib/hooks/use-lazy-video.ts`

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';

interface UseLazyVideoOptions {
  /** ビューポートに入る前にロードを開始するマージン (デフォルト: "200px") */
  rootMargin?: string;
  /** 表示割合の閾値 (デフォルト: 0) */
  threshold?: number;
}

interface UseLazyVideoReturn {
  /** video要素に付与するref */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 動画をロードするべきかどうか */
  shouldLoad: boolean;
  /** ビューポートに入ったかどうか */
  isIntersecting: boolean;
}

/**
 * 動画の遅延読み込みを制御するカスタムフック
 *
 * ⚠️ 注意: このフックは .map() ループ内で直接使用できません。
 * 必ず分離したコンポーネント内で使用してください。
 *
 * @example
 * // ❌ NG: .map() 内で直接使用
 * {videos.map(v => {
 *   const { videoRef } = useLazyVideo(); // エラー！
 * })}
 *
 * // ✅ OK: 分離したコンポーネント内で使用
 * function VideoCard({ video }) {
 *   const { videoRef, shouldLoad } = useLazyVideo();
 *   return <video ref={videoRef} src={shouldLoad ? video.url : undefined} />;
 * }
 * {videos.map(v => <VideoCard key={v.id} video={v} />)}
 */
export function useLazyVideo(options: UseLazyVideoOptions = {}): UseLazyVideoReturn {
  const { rootMargin = '200px', threshold = 0 } = options;
  // React 19: RefObject<T | null> が推奨
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // SSR安全性: window/IntersectionObserver が存在しない場合は即座にロード
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // 一度ロード開始したら監視を終了
    if (shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(video);

    return () => observer.disconnect();
  }, [rootMargin, threshold, shouldLoad]);

  return { videoRef, shouldLoad, isIntersecting };
}
```

#### 1.4.2 コンポーネント分離と修正例

> ⚠️ **必須**: `.map()` ループ内の `<video>` は、必ず別コンポーネントに分離すること

**`app/dashboard/page.tsx` (ストーリーボード一覧)**

```tsx
// ===== STEP 1: カードコンポーネントを分離 =====
// ファイル上部または別ファイルに定義

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useLazyVideo } from '@/lib/hooks/use-lazy-video';

interface StoryboardCardProps {
  storyboard: Storyboard;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

function StoryboardCard({ storyboard, onDelete }: StoryboardCardProps) {
  const { videoRef, shouldLoad } = useLazyVideo();

  return (
    <div className="group relative rounded-xl bg-[#2a2a2a] border border-[#404040] p-4 transition-all hover:border-[#505050]">
      <div className="absolute right-2 top-2 z-10 ...">
        <button onClick={(e) => onDelete(e, storyboard.id)} ...>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Link href={`/generate/storyboard?id=${storyboard.id}`}>
        <div className="aspect-[9/16] overflow-hidden rounded-lg bg-[#1a1a1a]">
          {storyboard.final_video_url ? (
            <video
              ref={videoRef}
              src={shouldLoad ? storyboard.final_video_url : undefined}
              poster={storyboard.source_image_url}
              preload="none"
              className="h-full w-full object-cover"
              muted
              onMouseEnter={(e) => shouldLoad && e.currentTarget.play()}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : (
            <img src={storyboard.source_image_url} alt="" className="..." />
          )}
        </div>
        {/* ... 残りのUI ... */}
      </Link>
    </div>
  );
}

// ===== STEP 2: .map() 内で分離したコンポーネントを使用 =====
{storyboards.map((storyboard) => (
  <StoryboardCard
    key={storyboard.id}
    storyboard={storyboard}
    onDelete={handleDeleteStoryboard}
  />
))}
```

### 1.5 実装ステップ

1. `movie-maker/lib/hooks/use-lazy-video.ts` を作成
2. **`app/dashboard/page.tsx`**:
   - `StoryboardCard` コンポーネントを分離（ファイル内 or 別ファイル）
   - `VideoCard` コンポーネントを分離
   - `ProjectCard` コンポーネントを分離
   - `MotionCard` コンポーネントを分離
   - 各 `.map()` で分離したコンポーネントを使用
3. **`app/history/page.tsx`**: `HistoryVideoCard` を分離
4. **`app/concat/history/page.tsx`**: `ConcatVideoCard` を分離
5. **`app/generate/storyboard/history/page.tsx`**: `StoryboardHistoryCard` を分離
6. TypeScript ビルド確認 (`npm run build`)

---

## 2. Network Information API

### 2.1 目的

- ユーザーの回線速度を検出し、低速時は動画品質を下げるなどの最適化を行う
- `navigator.connection.effectiveType` で 4g/3g/2g/slow-2g を判定
- `navigator.connection.saveData` でデータセーバーモードを検出

### 2.2 実装方針

カスタムフック `useNetworkStatus` を作成し、グローバルに回線状況を提供する。

> ⚠️ **重要: SSR安全性**
> - `navigator` はサーバーサイドでは `undefined`
> - `typeof window !== 'undefined'` でガードする必要がある
> - 初期値は「高品質」として、クライアントサイドで実際の値に更新する

> ⚠️ **ブラウザ互換性**
> - **Chrome/Edge/Opera**: 完全サポート
> - **Firefox**: 部分サポート（`effectiveType`なし、`saveData`のみ）
> - **Safari/iOS Safari**: 非サポート → `unknown` として高品質モードにフォールバック
> - APIが利用不可の場合は安全なデフォルト（高品質）を使用するため、UXに悪影響なし

### 2.3 対象ファイル

| ファイル | 用途 |
|---------|------|
| `movie-maker/lib/hooks/use-network-status.ts` | 新規作成 |
| `movie-maker/components/providers/network-provider.tsx` | 新規作成（オプション） |
| `app/dashboard/page.tsx` | 低速時に autoPlay 無効化 |
| `app/generate/storyboard/page.tsx` | 低速時にプレビュー品質低下警告 |

### 2.4 実装詳細

#### 2.4.1 カスタムフック作成

**新規ファイル**: `movie-maker/lib/hooks/use-network-status.ts`

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';

/** 回線タイプ */
export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

/** 回線品質レベル */
export type NetworkQuality = 'high' | 'medium' | 'low';

interface NetworkStatus {
  /** 回線タイプ (4g, 3g, 2g, slow-2g) */
  effectiveType: EffectiveConnectionType;
  /** データセーバーモードが有効か */
  saveData: boolean;
  /** 推定下り速度 (Mbps) */
  downlink: number | null;
  /** 推定RTT (ms) */
  rtt: number | null;
  /** 回線品質レベル (high/medium/low) */
  quality: NetworkQuality;
  /** オンライン状態 */
  isOnline: boolean;
  /** クライアントサイドで初期化済みか */
  isInitialized: boolean;
}

// Network Information API の型定義（TypeScriptに標準定義がないため）
interface NetworkInformation extends EventTarget {
  effectiveType?: EffectiveConnectionType;
  saveData?: boolean;
  downlink?: number;
  rtt?: number;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

/**
 * effectiveType と saveData から品質レベルを判定
 */
function getQualityLevel(
  effectiveType: EffectiveConnectionType,
  saveData: boolean
): NetworkQuality {
  if (saveData) return 'low';

  switch (effectiveType) {
    case '4g':
      return 'high';
    case '3g':
      return 'medium';
    case '2g':
    case 'slow-2g':
      return 'low';
    default:
      return 'high'; // 不明な場合は高品質を仮定
  }
}

// SSR安全なデフォルト値
const DEFAULT_STATUS: NetworkStatus = {
  effectiveType: 'unknown',
  saveData: false,
  downlink: null,
  rtt: null,
  quality: 'high', // SSR時は高品質を仮定（ハイドレーション後に更新）
  isOnline: true,
  isInitialized: false,
};

/**
 * Network Information API を使用して回線状況を監視
 *
 * ⚠️ SSR安全: サーバーサイドでは DEFAULT_STATUS を返す
 *
 * @example
 * const { quality, saveData, isOnline, isInitialized } = useNetworkStatus();
 * // isInitialized が false の場合はまだクライアントサイドで初期化されていない
 * if (isInitialized && quality === 'low') {
 *   // 低品質モードで動画を配信
 * }
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(DEFAULT_STATUS);

  const updateStatus = useCallback(() => {
    // SSR安全性チェック
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const connection = navigator.connection ||
                       navigator.mozConnection ||
                       navigator.webkitConnection;

    const effectiveType: EffectiveConnectionType =
      connection?.effectiveType || 'unknown';
    const saveData = connection?.saveData || false;
    const downlink = connection?.downlink ?? null;
    const rtt = connection?.rtt ?? null;

    setStatus({
      effectiveType,
      saveData,
      downlink,
      rtt,
      quality: getQualityLevel(effectiveType, saveData),
      isOnline: navigator.onLine,
      isInitialized: true,
    });
  }, []);

  useEffect(() => {
    // SSR安全性チェック
    if (typeof window === 'undefined') {
      return;
    }

    // 初期状態を取得
    updateStatus();

    // Network Information API のイベントリスナー
    const connection = navigator.connection ||
                       navigator.mozConnection ||
                       navigator.webkitConnection;

    if (connection) {
      connection.addEventListener('change', updateStatus);
    }

    // オンライン/オフライン状態の監視
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      if (connection) {
        connection.removeEventListener('change', updateStatus);
      }
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, [updateStatus]);

  return status;
}

/**
 * 回線品質に基づいて動画のpreload値を決定
 */
export function getPreloadForQuality(
  quality: NetworkQuality,
  isAutoPlay: boolean
): 'none' | 'metadata' | 'auto' {
  if (isAutoPlay) {
    // autoPlay の場合でも低品質時は metadata に留める
    return quality === 'low' ? 'metadata' : 'auto';
  }

  // 通常は none（遅延読み込みと組み合わせる）
  return 'none';
}

/**
 * 低速回線かどうかを判定
 */
export function isSlowConnection(quality: NetworkQuality): boolean {
  return quality === 'low';
}
```

#### 2.4.2 使用例

**`app/dashboard/page.tsx`**

```tsx
import { useNetworkStatus, isSlowConnection } from '@/lib/hooks/use-network-status';

function Dashboard() {
  const { quality, saveData } = useNetworkStatus();
  const isSlow = isSlowConnection(quality);

  return (
    <>
      {isSlow && (
        <div className="bg-yellow-500/20 text-yellow-400 text-sm p-2 rounded mb-4">
          低速回線を検出しました。動画のプレビューが制限されます。
        </div>
      )}

      <video
        src={video.url}
        preload={isSlow ? 'none' : 'metadata'}
        // 低速時は hover でも再生しない
        onMouseEnter={(e) => !isSlow && e.currentTarget.play()}
      />
    </>
  );
}
```

### 2.5 実装ステップ

1. `movie-maker/lib/hooks/use-network-status.ts` を作成
2. `app/dashboard/page.tsx` に低速回線警告を追加
3. 低速時の動画自動再生を無効化
4. TypeScript ビルド確認

---

## 3. WebP サムネイル変換

### 3.1 目的

- サムネイル画像をWebP形式に変換し、ファイルサイズを25-35%削減
- 既存のJPEG/PNG URLはそのまま保持し、WebP URLを追加で保存
- ブラウザのWebP対応を検出し、適切なフォーマットを配信

### 3.2 実装方針

**アプローチ**: 既存カラムはそのままに、WebP URL用の新カラムを追加

> ⚠️ **重要: 正しいテーブル名**（Supabase実際のスキーマに基づく）
> - `video_generations` テーブル（NOT `videos`）→ `original_image_webp_url`
> - `storyboards` テーブル → `source_image_webp_url`
> - `storyboard_scenes` テーブル → `scene_image_webp_url`
> - `ad_creator_projects` テーブル → `thumbnail_webp_url`
> - `user_videos` テーブル → `thumbnail_webp_url`
> - ~~`concat_videos`~~ → 実在しない（`video_concatenations` にはサムネイルなし）

### 3.3 Supabase マイグレーション

> **注意**: 以下のスキーマ変更は Supabase MCP (`mcp__supabase__apply_migration`) を使用して実行する

#### 3.3.1 マイグレーション SQL

```sql
-- Migration: add_webp_image_columns
-- Description: Add WebP image URL columns for optimized image delivery
--
-- ⚠️ 注意: テーブル名は Supabase スキーマに基づく正確な名前を使用
-- - video_generations (NOT videos)
-- - video_concatenations (NOT concat_videos) - ただしサムネイルカラムなし

-- video_generations テーブル（動画生成）
ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS original_image_webp_url TEXT;

-- storyboards テーブル（ストーリーボード）
ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS source_image_webp_url TEXT;

-- storyboard_scenes テーブル（シーン）
ALTER TABLE storyboard_scenes
ADD COLUMN IF NOT EXISTS scene_image_webp_url TEXT;

-- ad_creator_projects テーブル（広告クリエイター）
ALTER TABLE ad_creator_projects
ADD COLUMN IF NOT EXISTS thumbnail_webp_url TEXT;

-- user_videos テーブル（ユーザーアップロード動画）
ALTER TABLE user_videos
ADD COLUMN IF NOT EXISTS thumbnail_webp_url TEXT;

-- コメント追加
COMMENT ON COLUMN video_generations.original_image_webp_url IS 'WebP format of original image for optimized delivery';
COMMENT ON COLUMN storyboards.source_image_webp_url IS 'WebP format of source image for optimized delivery';
COMMENT ON COLUMN storyboard_scenes.scene_image_webp_url IS 'WebP format of scene image for optimized delivery';
COMMENT ON COLUMN ad_creator_projects.thumbnail_webp_url IS 'WebP format of thumbnail for optimized delivery';
COMMENT ON COLUMN user_videos.thumbnail_webp_url IS 'WebP format of thumbnail for optimized delivery';
```

#### 3.3.2 マイグレーション実行手順

```bash
# Claude Code で実行する場合:
# 1. まずプロジェクトIDを確認
mcp__supabase__list_projects

# 2. マイグレーションを適用（project_id: qhwgvahnccpqudxtnvat）
mcp__supabase__apply_migration(
  project_id="qhwgvahnccpqudxtnvat",
  name="add_webp_image_columns",
  query="上記SQL"
)

# 3. テーブル確認
mcp__supabase__list_tables(project_id="qhwgvahnccpqudxtnvat", schemas=["public"])
```

### 3.4 Backend 実装

#### 3.4.1 WebP 変換関数

**修正ファイル**: `movie-maker-api/app/external/r2.py`

> ⚠️ **重要: 同期/非同期の整合性**
> - PIL (Pillow) の画像処理は**同期処理**
> - `convert_to_webp` は同期関数として定義
> - 非同期コンテキストから呼び出す場合は `asyncio.to_thread()` を使用

```python
from PIL import Image, UnidentifiedImageError
import io
import asyncio
import logging

logger = logging.getLogger(__name__)


class WebPConversionError(Exception):
    """WebP変換エラー"""
    pass


def convert_to_webp(
    image_content: bytes,
    quality: int = 85,
    max_size: tuple[int, int] | None = None
) -> bytes:
    """
    画像をWebP形式に変換（同期関数）

    ⚠️ 注意: PILは同期処理のため、この関数も同期です。
    非同期コンテキストから呼び出す場合は asyncio.to_thread() を使用してください。

    Args:
        image_content: 元画像のバイトデータ
        quality: WebP品質 (1-100, デフォルト85)
        max_size: リサイズする最大サイズ (width, height)

    Returns:
        WebP形式の画像バイトデータ

    Raises:
        WebPConversionError: 画像の読み込みまたは変換に失敗した場合
    """
    try:
        img = Image.open(io.BytesIO(image_content))
    except UnidentifiedImageError as e:
        logger.warning(f"Failed to identify image format: {e}")
        raise WebPConversionError(f"Invalid or corrupted image: {e}") from e
    except Exception as e:
        logger.warning(f"Failed to open image: {e}")
        raise WebPConversionError(f"Failed to open image: {e}") from e

    try:
        # RGBA の場合の処理
        if img.mode == 'RGBA':
            # アルファチャンネルを持つ場合はそのままWebPに（WebPは透過サポート）
            pass
        elif img.mode == 'P' and 'transparency' in img.info:
            # パレットモードで透過がある場合はRGBAに変換
            img = img.convert('RGBA')
        elif img.mode not in ('RGB', 'RGBA'):
            # その他のモードはRGBに変換
            img = img.convert('RGB')

        # リサイズ（オプション）
        if max_size:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)

        # WebP に変換
        output = io.BytesIO()
        img.save(output, format='WEBP', quality=quality, method=6)
        output.seek(0)

        return output.read()
    except Exception as e:
        logger.warning(f"Failed to convert image to WebP: {e}")
        raise WebPConversionError(f"Failed to convert image to WebP: {e}") from e


def _get_base_filename(filename: str) -> str:
    """
    ファイル名から拡張子を除いたベース名を取得

    Args:
        filename: ファイル名（拡張子あり or なし）

    Returns:
        拡張子を除いたベース名
    """
    if '.' in filename:
        return filename.rsplit('.', 1)[0]
    # 拡張子がない場合はそのまま返す
    return filename


def _upload_to_r2_sync(
    client,
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
    cache_control: str
) -> None:
    """
    R2へのアップロード（同期、スレッドプールで呼び出し用）

    boto3のput_objectは同期処理のため、この関数をasyncio.to_thread()で呼び出す
    """
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType=content_type,
        CacheControl=cache_control,
    )


async def upload_image_with_webp(
    file_content: bytes,
    filename: str
) -> tuple[str, str]:
    """
    画像をオリジナルとWebP両方でアップロード

    Args:
        file_content: 画像のバイトデータ
        filename: ファイル名

    Returns:
        (original_url, webp_url) のタプル

    Raises:
        WebPConversionError: WebP変換に失敗した場合（オリジナルはアップロード済み）
    """
    client = get_r2_client()

    # オリジナル画像をアップロード
    original_key = f"images/{filename}"
    content_type = "image/jpeg"
    if filename.lower().endswith(".png"):
        content_type = "image/png"
    elif filename.lower().endswith(".webp"):
        content_type = "image/webp"
    elif filename.lower().endswith(".gif"):
        content_type = "image/gif"

    # ⚠️ boto3 put_object は同期処理なので asyncio.to_thread() でブロッキングを回避
    await asyncio.to_thread(
        _upload_to_r2_sync,
        client,
        settings.R2_BUCKET_NAME,
        original_key,
        file_content,
        content_type,
        "public, max-age=31536000, immutable",
    )
    original_url = get_public_url(original_key)

    # WebP に変換してアップロード（スレッドプールで実行）
    # ⚠️ PILは同期処理なので asyncio.to_thread() でブロッキングを回避
    webp_content = await asyncio.to_thread(convert_to_webp, file_content)

    # 拡張子なしファイル名にも対応
    base_filename = _get_base_filename(filename)
    webp_filename = f"{base_filename}.webp"
    webp_key = f"images/webp/{webp_filename}"

    await asyncio.to_thread(
        _upload_to_r2_sync,
        client,
        settings.R2_BUCKET_NAME,
        webp_key,
        webp_content,
        "image/webp",
        "public, max-age=31536000, immutable",
    )
    webp_url = get_public_url(webp_key)

    return original_url, webp_url


# 既存の upload_image との後方互換性のため、オプショナルなラッパーも用意
async def upload_image_optional_webp(
    file_content: bytes,
    filename: str,
    generate_webp: bool = True
) -> tuple[str, str | None]:
    """
    画像アップロード（WebP生成はオプション）

    Args:
        file_content: 画像のバイトデータ
        filename: ファイル名
        generate_webp: WebPも生成するか（デフォルト: True）

    Returns:
        (original_url, webp_url or None) のタプル

    Note:
        WebP変換に失敗した場合でも、オリジナル画像はアップロードされ、
        webp_url は None として返される（エラーにはならない）
    """
    if generate_webp:
        try:
            return await upload_image_with_webp(file_content, filename)
        except WebPConversionError as e:
            # WebP変換失敗時はオリジナルのみアップロード
            logger.warning(f"WebP conversion failed, uploading original only: {e}")
            original_url = await upload_image(file_content, filename)
            return original_url, None
    else:
        original_url = await upload_image(file_content, filename)
        return original_url, None
```

#### 3.4.2 スキーマ更新

**修正ファイル**: `movie-maker-api/app/videos/schemas.py`

> ⚠️ **注意**: 既存フィールドの後に追加すること（順序を維持）

```python
# VideoResponse に追加（約186行目付近）
class VideoResponse(BaseModel):
    # ... 既存フィールド
    original_image_url: str
    original_image_webp_url: str | None = None  # 追加

# StoryboardResponse に追加（約748行目付近）
class StoryboardResponse(BaseModel):
    # ... 既存フィールド
    source_image_url: str
    source_image_webp_url: str | None = None  # 追加

# StoryboardSceneResponse に追加（約605行目付近）
class StoryboardSceneResponse(BaseModel):
    # ... 既存フィールド
    scene_image_url: str | None = Field(None, description="シーンごとの画像URL")
    scene_image_webp_url: str | None = Field(None, description="シーンごとのWebP画像URL")  # 追加

# UserVideoResponse に追加（存在する場合）
class UserVideoResponse(BaseModel):
    # ... 既存フィールド
    thumbnail_url: str | None = None
    thumbnail_webp_url: str | None = None  # 追加

# AdCreatorProjectResponse に追加（約1579行目付近）
class AdCreatorProjectResponse(BaseModel):
    # ... 既存フィールド
    thumbnail_url: str | None = Field(None, description="サムネイルURL")
    thumbnail_webp_url: str | None = Field(None, description="サムネイルWebP URL")  # 追加
```

#### 3.4.3 サービス層更新

**修正ファイル**: `movie-maker-api/app/videos/service.py`

画像アップロード時に `upload_image_with_webp` を使用し、両方のURLをDBに保存する。

> ⚠️ **影響箇所（grep結果より）**:
> - `app/videos/router.py:961` - 画像アップロードエンドポイント
> - `app/videos/router.py:1619` - シーン画像抽出
> - `app/videos/router.py:2993` - 別の画像アップロード
> - `app/videos/service.py:752` - サービス内画像保存
> - `app/videos/service.py:956` - サービス内画像保存
> - `app/videos/service.py:998` - サービス内画像保存
> - `app/tasks/storyboard_processor.py:214` - ストーリーボード処理

**移行戦略**:
1. 新規アップロードからWebPを生成開始
2. 既存データはマイグレーションスクリプトで一括変換（オプション）
3. WebP URLがnullの場合はオリジナルURLにフォールバック

### 3.5 Frontend 実装

#### 3.5.1 WebP サポート検出フック

**新規ファイル**: `movie-maker/lib/hooks/use-webp-support.ts`

```typescript
'use client';

import { useState, useEffect } from 'react';

/**
 * ブラウザのWebPサポートを検出
 */
export function useWebPSupport(): boolean {
  const [supportsWebP, setSupportsWebP] = useState(true); // 楽観的にtrue

  useEffect(() => {
    const checkWebPSupport = async () => {
      const webpData =
        'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

      const img = new Image();
      img.onload = () => setSupportsWebP(true);
      img.onerror = () => setSupportsWebP(false);
      img.src = webpData;
    };

    checkWebPSupport();
  }, []);

  return supportsWebP;
}

/**
 * WebP URLがあればそれを、なければオリジナルを返す
 */
export function getOptimizedImageUrl(
  originalUrl: string | null | undefined,
  webpUrl: string | null | undefined,
  supportsWebP: boolean
): string | undefined {
  if (!originalUrl) return undefined;

  if (supportsWebP && webpUrl) {
    return webpUrl;
  }

  return originalUrl;
}
```

#### 3.5.2 型定義更新

**修正ファイル**: `movie-maker/lib/api/client.ts`

> ⚠️ **注意**: 既存の型定義に追加フィールドを挿入

```typescript
// Video 型に追加（約??? 行目）
// ※ client.ts で "Video" を検索して該当箇所を特定
export interface Video {
  // ... 既存フィールド
  original_image_url: string;
  original_image_webp_url?: string | null;  // 追加
}

// Storyboard 型に追加（約518行目付近: source_image_url の後）
export interface Storyboard {
  // ... 既存フィールド
  source_image_url: string;
  source_image_webp_url?: string | null;  // 追加
}

// StoryboardScene 型に追加（約498行目付近: scene_image_url の後）
export interface StoryboardScene {
  // ... 既存フィールド
  scene_image_url: string | null;
  scene_image_webp_url?: string | null;  // 追加
}

// UserVideo 型に追加（存在する場合）
export interface UserVideo {
  // ... 既存フィールド
  thumbnail_url: string | null;
  thumbnail_webp_url?: string | null;  // 追加
}

// AdCreatorProject 型に追加（約1330行目付近）
export interface AdCreatorProject {
  // ... 既存フィールド
  thumbnail_url: string | null;
  thumbnail_webp_url?: string | null;  // 追加
}
```

#### 3.5.3 使用例

**`app/dashboard/page.tsx`**

```tsx
import { useWebPSupport, getOptimizedImageUrl } from '@/lib/hooks/use-webp-support';

function VideoCard({ video }: { video: Video }) {
  const supportsWebP = useWebPSupport();
  const posterUrl = getOptimizedImageUrl(
    video.original_image_url,
    video.original_image_webp_url,
    supportsWebP
  );

  return (
    <video
      src={video.video_url}
      poster={posterUrl}
      preload="none"
    />
  );
}
```

### 3.6 実装ステップ

1. **Supabase マイグレーション実行** (MCP使用)
   ```
   mcp__supabase__apply_migration で上記SQLを実行
   ```

2. **Backend**
   - `movie-maker-api/app/external/r2.py` に `convert_to_webp`, `upload_image_with_webp` 追加
   - `movie-maker-api/app/videos/schemas.py` にWebP URLフィールド追加
   - `movie-maker-api/app/videos/service.py` でアップロードロジック更新

3. **Frontend**
   - `movie-maker/lib/hooks/use-webp-support.ts` 作成
   - `movie-maker/lib/api/client.ts` 型定義更新
   - 各ページで `getOptimizedImageUrl` を使用

4. **テスト・ビルド確認**
   - Backend: `pytest`
   - Frontend: `tsc --noEmit`, `npm run build`

---

## 実装順序とチェックリスト

### Phase 2-1: IntersectionObserver (推定工数: 1日)

> ⚠️ **重要**: `.map()` 内のコンポーネント分離が必要

- [ ] `movie-maker/lib/hooks/use-lazy-video.ts` 作成
- [ ] **`app/dashboard/page.tsx`**:
  - [ ] `StoryboardCard` コンポーネント分離
  - [ ] `VideoCard` コンポーネント分離
  - [ ] `ProjectCard` コンポーネント分離
  - [ ] `MotionCard` コンポーネント分離
- [ ] **`app/history/page.tsx`**: `HistoryVideoCard` 分離
- [ ] **`app/concat/history/page.tsx`**: `ConcatVideoCard` 分離
- [ ] **`app/generate/storyboard/history/page.tsx`**: `StoryboardHistoryCard` 分離
- [ ] TypeScript ビルド確認 (`npm run build`)

### Phase 2-2: Network Information API (推定工数: 0.5日)

> ⚠️ **重要**: SSR安全性を考慮した実装

- [ ] `movie-maker/lib/hooks/use-network-status.ts` 作成
  - [ ] SSR安全性チェック（`typeof window !== 'undefined'`）
  - [ ] `isInitialized` フラグの追加
  - [ ] TypeScript型定義（`declare global`）
- [ ] `app/dashboard/page.tsx` に低速警告追加
- [ ] 低速時の autoPlay 無効化（分離したカードコンポーネント内）
- [ ] TypeScript ビルド確認

### Phase 2-3: WebP サムネイル変換 (推定工数: 1.5日)

> ⚠️ **重要**:
> - テーブル名: `video_generations` (NOT `videos`), `video_concatenations` (NOT `concat_videos`)
> - `convert_to_webp` は同期関数として実装
> - boto3 `put_object` も同期処理のため `asyncio.to_thread()` でラップ
> - 破損画像の例外処理を含める（`WebPConversionError`）
> - 拡張子なしファイル名のエッジケースに対応

**Backend**:
- [ ] **Supabase マイグレーション実行** (`mcp__supabase__apply_migration` 使用)
  - [ ] `video_generations.original_image_webp_url`
  - [ ] `storyboards.source_image_webp_url`
  - [ ] `storyboard_scenes.scene_image_webp_url`
  - [ ] `ad_creator_projects.thumbnail_webp_url`
  - [ ] `user_videos.thumbnail_webp_url`
- [ ] `movie-maker-api/app/external/r2.py`:
  - [ ] `WebPConversionError` 例外クラス追加
  - [ ] `convert_to_webp()` 同期関数追加（例外処理含む）
  - [ ] `_get_base_filename()` ヘルパー関数追加
  - [ ] `_upload_to_r2_sync()` ヘルパー関数追加
  - [ ] `upload_image_with_webp()` 非同期関数追加（`asyncio.to_thread` 使用）
  - [ ] `upload_image_optional_webp()` フォールバック付きラッパー追加
- [ ] `movie-maker-api/app/videos/schemas.py` にWebPフィールド追加
- [ ] `movie-maker-api/app/videos/service.py` 更新（7箇所）
- [ ] Backend テスト確認 (`pytest`)

**Frontend**:
- [ ] `movie-maker/lib/hooks/use-webp-support.ts` 作成
- [ ] `movie-maker/lib/api/client.ts` 型更新（5つのインターフェース）
- [ ] 各ページで `getOptimizedImageUrl()` を使用
- [ ] Frontend ビルド確認 (`npm run build`)

---

## 期待される効果

| 最適化 | 指標 | 改善見込み |
|--------|------|-----------|
| IntersectionObserver | 初期ロード時間 | 40-60%削減（一覧ページ） |
| Network Information API | 低速回線のUX | 離脱率改善 |
| WebP変換 | 画像転送量 | 25-35%削減 |

---

## 検証方法

### Chrome DevTools での確認

1. **Network タブ**
   - 遅延読み込み: スクロールするまで動画リクエストが発生しないこと
   - WebP: Response Headers の Content-Type が `image/webp` であること

2. **Performance タブ**
   - 初期ロード時の Total Blocking Time が減少していること

3. **Application タブ > Network conditions**
   - Slow 3G に設定して低速警告が表示されること

### 回線エミュレーション

```javascript
// Console で Network Information API をテスト
console.log(navigator.connection?.effectiveType);
console.log(navigator.connection?.saveData);
```
