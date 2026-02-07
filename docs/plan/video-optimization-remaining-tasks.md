# 動画読み込み最適化 - 未実装タスク一覧

> 作成日: 2026-01-14
> 関連計画書: video-lazy-loading-network-webp-optimization.md

## 概要

動画読み込み速度最適化の計画書に記載されているが、まだ実装されていない項目の一覧。

---

## 1. Backend: WebP アップロード関数の適用

### 現状
- `upload_image_with_webp()` 関数は `app/external/r2.py` に実装済み
- しかし、実際の画像アップロード処理では古い `upload_image()` を使用中

### 変更が必要な箇所

#### `app/videos/service.py` (7箇所)

| 行番号 | 現在 | 変更後 |
|--------|------|--------|
| L636 | `from app.external.r2 import upload_image` | `from app.external.r2 import upload_image_with_webp` |
| L752 | `image_url = await upload_image(...)` | `image_url, webp_url = await upload_image_with_webp(...)` |
| L812 | `from app.external.r2 import upload_image` | `from app.external.r2 import upload_image_with_webp` |
| L956 | `image_url = await upload_image(...)` | `image_url, webp_url = await upload_image_with_webp(...)` |
| L990 | `from app.external.r2 import upload_image` | `from app.external.r2 import upload_image_with_webp` |
| L998 | `return await upload_image(...)` | WebP URLも返すように変更 |

#### `app/videos/router.py` (4箇所)

| 行番号 | 現在 | 変更後 |
|--------|------|--------|
| L64 | `from app.external.r2 import upload_image, ...` | `upload_image_with_webp` を追加 |
| L961 | `image_url = await upload_image(...)` | `image_url, webp_url = await upload_image_with_webp(...)` |
| L1619 | `scene_image_url = await upload_image(...)` | WebP URLも保存 |
| L2993 | `image_url = await upload_image(...)` | WebP URLも返す |

### DB更新も必要

WebP URLをDBに保存する処理を追加：
- `original_image_webp_url`
- `scene_image_webp_url`
- `source_image_webp_url`
- `thumbnail_webp_url`

---

## 2. Frontend: WebP 画像配信の適用

### 現状
- `useWebPSupport` フック: ✅ `lib/hooks/use-webp-support.ts` に実装済み
- `getOptimizedImageUrl` 関数: ✅ 同ファイルに実装済み
- **各ページでの使用: ❌ 未使用**

### 変更が必要な箇所

#### `app/dashboard/components/video-cards.tsx`

各カードコンポーネントで `poster` 属性にWebP URLを使用：

```tsx
import { useWebPSupport, getOptimizedImageUrl } from '@/lib/hooks/use-webp-support';

function StoryboardCard({ storyboard }: StoryboardCardProps) {
  const supportsWebP = useWebPSupport();
  const posterUrl = getOptimizedImageUrl(
    storyboard.source_image_url,
    storyboard.source_image_webp_url,
    supportsWebP
  );

  return (
    <video
      poster={posterUrl}
      // ...
    />
  );
}
```

対象コンポーネント:
- [ ] `StoryboardCard` - `source_image_webp_url`
- [ ] `VideoItemCard` - `original_image_webp_url`
- [ ] `AdProjectCard` - `thumbnail_webp_url`
- [ ] `UserVideoCard` - `thumbnail_webp_url`

#### 他のページ

- [ ] `app/history/components/HistoryVideoCard.tsx`
- [ ] `app/concat/history/components/concat-video-card.tsx`
- [ ] `app/generate/storyboard/history/page.tsx`
- [ ] `app/generate/[id]/page.tsx`
- [ ] `app/generate/storyboard/page.tsx`

---

## 3. Frontend: 低速回線警告の追加

### 現状
- `SlowNetworkWarning` コンポーネント: ✅ `components/ui/slow-network-warning.tsx` に実装済み
- `app/dashboard/page.tsx`: ✅ 使用中
- **他のページ: ❌ 未使用**

### 追加が必要なページ

| ページ | 優先度 | 理由 |
|--------|--------|------|
| `app/generate/storyboard/page.tsx` | 高 | 動画編集中、低速だとプレビュー遅延 |
| `app/history/page.tsx` | 中 | 一覧ページ、多数の動画読み込み |
| `app/concat/history/page.tsx` | 中 | 一覧ページ |
| `app/generate/storyboard/history/page.tsx` | 低 | 一覧ページ |

### 実装例

```tsx
import { SlowNetworkWarning } from "@/components/ui/slow-network-warning";

export default function StoryboardPage() {
  return (
    <div>
      <SlowNetworkWarning className="mb-4" />
      {/* 既存のコンテンツ */}
    </div>
  );
}
```

---

## 4. R2 CORS設定（手動作業）

### 現状
- HLS実装: ✅ 完了
- CORS設定: ❌ 未設定

### 設定方法

1. https://dash.cloudflare.com/ にログイン
2. R2 Object Storage → `movie-maker` バケット
3. Settings → CORS Policy → Edit

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "Content-Range"],
    "MaxAgeSeconds": 86400
  }
]
```

---

## 実装優先順位

1. **R2 CORS設定** - HLSが即座に有効化される
2. **Backend WebP適用** - 新規アップロードからWebP生成開始
3. **Frontend WebP配信** - 画像サイズ25-35%削減
4. **低速警告追加** - UX向上（オプション）

---

## チェックリスト

### Backend
- [ ] `service.py` の `upload_image` を `upload_image_with_webp` に変更
- [ ] `router.py` の `upload_image` を `upload_image_with_webp` に変更
- [ ] WebP URLをDBに保存する処理を追加
- [ ] テスト確認 (`pytest`)

### Frontend
- [ ] `video-cards.tsx` で `useWebPSupport` を使用
- [ ] 他のカードコンポーネントで WebP URL を使用
- [ ] `storyboard/page.tsx` に `SlowNetworkWarning` 追加
- [ ] ビルド確認 (`npm run build`)

### インフラ
- [ ] R2 CORS設定（Cloudflareダッシュボード）

---

## 関連ファイル

- 計画書: `docs/plan/video-lazy-loading-network-webp-optimization.md`
- WebP変換: `movie-maker-api/app/external/r2.py`
- WebPフック: `movie-maker/lib/hooks/use-webp-support.ts`
- 低速警告: `movie-maker/components/ui/slow-network-warning.tsx`
