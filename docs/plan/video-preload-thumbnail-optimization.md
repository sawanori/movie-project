# 動画プリロード・サムネイル最適化 実装計画書

## 概要

動画の読み込み体験を向上させるため、以下2つの最適化を実装する：

1. **フロントエンドのプリロード設定** - `<video preload="...">` で適切なデータ読み込みを制御
2. **サムネイル画像の活用** - `poster`属性でサムネイルを表示し、動画ロード前に視覚的フィードバックを提供

## 背景

### 現状の課題
- 多くの`<video>`タグで`preload`属性が未設定（ブラウザデフォルトに依存）
- サムネイル（`poster`属性）が活用されていない箇所がある
- 動画一覧ページで全動画のデータを読み込もうとしてパフォーマンス低下

### 期待される効果
- 動画メタデータの先読みによる再生開始の高速化
- サムネイル表示による体感速度の向上
- 不要なデータ転送の削減（`preload="none"`の活用）

## 影響範囲

### 変更対象ファイル

#### フロントエンド（movie-maker/）- 全22箇所の`<video>`タグ

| # | ファイル | `<video>`数 | 変更内容 |
|---|----------|-------------|----------|
| 1 | `app/dashboard/page.tsx` | 4 | preload, poster属性追加 |
| 2 | `app/history/page.tsx` | 1 | preload, poster属性追加 |
| 3 | `app/concat/page.tsx` | 3 | preload属性追加（poster部分的） |
| 4 | `app/concat/history/page.tsx` | 1 | preload属性追加（posterなし） |
| 5 | `app/generate/storyboard/page.tsx` | 5 | preload, poster属性追加 |
| 6 | `app/generate/storyboard/history/page.tsx` | 1 | preload, poster属性追加 |
| 7 | `app/generate/[id]/page.tsx` | 1 | preload, poster属性追加 |
| 8 | `components/video/ad-cut-card.tsx` | 1 | preload, poster属性追加 |
| 9 | `components/video/video-trim-card.tsx` | 1 | preload, poster属性追加 |
| 10 | `components/video/scene-trim-card.tsx` | 1 | preload, poster属性追加 |
| 11 | `components/video/ad-preview-player.tsx` | 1 | preload属性追加（posterなし） |
| 12 | `components/ui/motion-selector.tsx` | 1 | preload属性追加（posterなし） |

### データベースへの影響
- **Supabaseマイグレーション: 不要**
- 既存のフィールドを活用するのみ

> **注意**: 将来的にマイグレーションが発生する場合は、Supabase MCPツール（`mcp__supabase__apply_migration`）を使用して実行すること。

## 実装詳細

### 1. エンティティ別のposter属性フィールド

各データ型で利用可能なサムネイルフィールド：

| エンティティ | poster用フィールド | 備考 |
|--------------|-------------------|------|
| Video (単一動画) | `original_image_url` | 元画像 |
| Storyboard | `source_image_url` | ソース画像 |
| StoryboardScene | `scene_image_url` | シーン画像 |
| UserVideo | `thumbnail_url` | サムネイル |
| AdCreatorProject | `thumbnail_url` | サムネイル |
| ConcatItem | **なし** | posterなしでpreload依存 |
| Motion | **なし** | posterなしでpreload依存 |

### 2. preload属性の使い分け

| 値 | 用途 | 使用場面 |
|----|------|----------|
| `none` | データを先読みしない | 一覧ページ（多数表示）、ホバー再生 |
| `metadata` | メタデータのみ先読み | 詳細ページ、編集画面、controls付き |
| `auto` | 全体を先読み | autoPlay付きプレビュー |

### 3. 各ファイルの具体的な変更

---

#### 3.1 `app/dashboard/page.tsx` (4箇所)

**L524: Storyboardカード**
```tsx
// 変更前
<video
  src={storyboard.final_video_url}
  className="h-full w-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>

// 変更後
<video
  src={storyboard.final_video_url}
  poster={storyboard.source_image_url}
  preload="none"
  className="h-full w-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

**L624: Videoカード**
```tsx
// 変更後
<video
  src={video.final_video_url}
  poster={video.original_image_url}
  preload="none"
  className="h-full w-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

**L708: AdCreatorProjectカード**
```tsx
// 変更後
<video
  src={project.final_video_url}
  poster={project.thumbnail_url || undefined}
  preload="none"
  className="h-full w-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

**L815: Motionプレビュー**
```tsx
// 変更後（posterなし）
<video
  src={motion.motion_url}
  preload="none"
  className="h-full w-full object-contain bg-black"
  muted
  loop
  playsInline
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

---

#### 3.2 `app/history/page.tsx` (1箇所)

**L183: 動画履歴一覧**
```tsx
// 変更後
<video
  src={video.final_video_url}
  poster={video.original_image_url}
  preload="none"
  className="h-full w-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

---

#### 3.3 `app/concat/page.tsx` (3箇所)

**L1490: メインプレビュー（autoPlay付き）**
```tsx
// 変更後
<video
  src={videoWithBgmUrl || concatStatus.video_url}
  preload="auto"
  controls
  autoPlay
  muted
  className="w-full h-full"
  style={{ aspectRatio: selectedAspectRatio?.replace(":", "/") || "9/16" }}
/>
```

**L1819: 動画選択モーダル（Video）**
```tsx
// 変更後
<video
  src={video.final_video_url}
  poster={video.original_image_url}
  preload="none"
  className="w-full h-full object-cover"
  muted
/>
```

**L1909: 動画選択モーダル（Storyboard）**
```tsx
// 変更後
<video
  src={storyboard.final_video_url}
  poster={storyboard.source_image_url}
  preload="none"
  className="w-full h-full object-cover"
  muted
/>
```

---

#### 3.4 `app/concat/history/page.tsx` (1箇所)

**L286: 結合履歴一覧（posterなし）**
```tsx
// 変更後
<video
  src={concat.final_video_url}
  preload="none"
  className="w-full h-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

---

#### 3.5 `app/generate/storyboard/page.tsx` (5箇所)

**L3728: シーンプレビューミニ（autoPlay付き）**
```tsx
// 変更後
<video
  key={scene.video_url}
  src={getVideoCacheBustedUrl(scene.video_url)}
  poster={scene.scene_image_url || undefined}
  preload="auto"
  className="h-full w-full object-contain"
  muted
  autoPlay
  loop
/>
```

**L3818: シーン編集プレビュー（controls付き）**
```tsx
// 変更後
<video
  key={scene.video_url}
  ref={(el) => { sceneVideoRefs.current[scene.id] = el; }}
  src={getVideoCacheBustedUrl(scene.video_url)}
  poster={scene.scene_image_url || undefined}
  preload="metadata"
  className="h-full w-full object-contain"
  controls
  muted
  loop
/>
```

**L4143: サムネイル表示**
```tsx
// 変更後
<video
  key={scene.video_url}
  src={getVideoCacheBustedUrl(scene.video_url)}
  poster={scene.scene_image_url || undefined}
  preload="none"
  className="h-full w-full object-cover"
  muted
/>
```

**L4176: 最終動画プレビュー（autoPlay付き）**
```tsx
// 変更後
<video
  ref={finalVideoRef}
  key={storyboard.final_video_url}
  src={getVideoCacheBustedUrl(storyboard.final_video_url)}
  poster={storyboard.source_image_url}
  preload="auto"
  className="h-full w-full object-contain"
  controls
  autoPlay
/>
```

**L5236: ソースシーン参照**
```tsx
// 変更後
<video
  src={sourceScene.video_url || undefined}
  poster={sourceScene.scene_image_url || undefined}
  preload="none"
  className="w-20 h-20 object-cover rounded"
  muted
  playsInline
/>
```

---

#### 3.6 `app/generate/storyboard/history/page.tsx` (1箇所)

**L198: ストーリーボード履歴一覧**
```tsx
// 変更後
<video
  src={storyboard.final_video_url}
  poster={storyboard.source_image_url}
  preload="none"
  className="h-full w-full object-cover"
  muted
  onMouseEnter={(e) => e.currentTarget.play()}
  onMouseLeave={(e) => { ... }}
/>
```

---

#### 3.7 `app/generate/[id]/page.tsx` (1箇所)

**L380: 動画詳細ページ（autoPlay付き）**
```tsx
// 変更後
<video
  ref={videoRef}
  src={video.final_video_url}
  poster={video.original_image_url}
  preload="auto"
  controls
  autoPlay
  muted
  loop
  playsInline
  className="h-full w-full object-contain"
/>
```

---

#### 3.8 `components/video/ad-cut-card.tsx` (1箇所)

**L324: カット動画プレビュー**

※ propsからposter用画像を渡す必要があるか確認。`cut.video`の構造を確認：

```tsx
// 変更後（cut.video.thumbnailUrlが存在する場合）
<video
  ref={videoRef}
  src={cut.video.videoUrl}
  poster={cut.video.thumbnailUrl || undefined}
  preload="metadata"
  className="w-full h-full object-cover"
  muted
  playsInline
  onEnded={handleVideoEnded}
/>
```

---

#### 3.9 `components/video/video-trim-card.tsx` (1箇所)

**L180: トリム動画プレビュー**

※ propsの`item`構造を確認：

```tsx
// 変更後（item.thumbnailUrlが存在する場合）
<video
  ref={videoRef}
  src={item.videoUrl}
  poster={item.thumbnailUrl || undefined}
  preload="metadata"
  className="w-full h-full object-cover"
  muted
  playsInline
  onEnded={handleVideoEnded}
/>
```

---

#### 3.10 `components/video/scene-trim-card.tsx` (1箇所)

**L172: シーントリムプレビュー**

propsは`scene: StoryboardScene`で、`scene.scene_image_url`が利用可能：

```tsx
// 変更後
<video
  ref={videoRef}
  src={videoUrl}
  poster={scene.scene_image_url || undefined}
  preload="metadata"
  className="w-full h-full object-contain"
  muted
  playsInline
  onEnded={handleVideoEnded}
/>
```

---

#### 3.11 `components/video/ad-preview-player.tsx` (1箇所)

**L198: 広告プレビュープレイヤー（autoPlay付き、posterなし）**
```tsx
// 変更後
<video
  ref={videoRef}
  src={currentVideo?.videoUrl}
  preload="auto"
  className="w-full h-full object-contain"
  muted={isMuted}
  autoPlay
  playsInline
  onTimeUpdate={handleTimeUpdate}
  onEnded={handleEnded}
  onLoadedData={handleLoadedData}
/>
```

---

#### 3.12 `components/ui/motion-selector.tsx` (1箇所)

**L151: モーションプレビュー（autoPlay付き、posterなし）**
```tsx
// 変更後
<video
  src={previewMotion.motion_url}
  preload="auto"
  className="w-full max-w-xs mx-auto rounded-lg"
  autoPlay
  muted
  loop
  playsInline
/>
```

---

## テスト計画

### 1. 視覚的テスト

- [ ] 各ページでサムネイルが正しく表示されることを確認
- [ ] 動画再生時にサムネイルから動画へスムーズに切り替わることを確認
- [ ] サムネイルがない動画（Concat、Motion）で適切に動作することを確認

### 2. パフォーマンステスト

```bash
# Chrome DevToolsで確認
1. Network タブを開く
2. ダッシュボードページを読み込む
3. preload="none"の動画でリクエストが発生していないことを確認
4. 動画にホバーして再生が開始されることを確認
```

### 3. ビルドテスト

```bash
cd movie-maker
npm run build
npm run lint
```

## 実装手順

### Phase 1: 一覧ページ（preload="none" + poster）

1. `app/dashboard/page.tsx` - 4箇所
2. `app/history/page.tsx` - 1箇所
3. `app/concat/history/page.tsx` - 1箇所（posterなし）
4. `app/generate/storyboard/history/page.tsx` - 1箇所

### Phase 2: 詳細・編集ページ（preload="metadata" または "auto"）

1. `app/generate/[id]/page.tsx` - 1箇所
2. `app/generate/storyboard/page.tsx` - 5箇所
3. `app/concat/page.tsx` - 3箇所

### Phase 3: コンポーネント

1. `components/video/ad-cut-card.tsx` - 1箇所
2. `components/video/video-trim-card.tsx` - 1箇所
3. `components/video/scene-trim-card.tsx` - 1箇所
4. `components/video/ad-preview-player.tsx` - 1箇所
5. `components/ui/motion-selector.tsx` - 1箇所

### Phase 4: 検証

1. フロントエンドビルド確認
2. 各ページで動作確認
3. Chrome DevToolsでNetwork確認

## 注意事項

### 1. preload="none" の注意点
- 動画の長さ（duration）が取得できない場合がある
- `onLoadedMetadata`イベントが再生開始まで発火しない
- 必要に応じて`onCanPlay`や`onPlay`イベントで対応

### 2. poster属性の注意点
- 画像URLがnullの場合は`undefined`を設定（空文字は避ける）
- `poster={url || undefined}` のパターンを使用

### 3. autoPlay時のpreload設定
- `autoPlay`属性がある場合は`preload="auto"`を推奨
- 即座に再生されるため、データの先読みが必要

### 4. ホバー再生の動作
- `preload="none"`でもホバー時の`play()`は正常に動作
- ただし初回再生時に若干の遅延が発生する可能性

### 5. モバイル対応
- iOS Safariでは`preload`が無視される場合がある
- `poster`属性はモバイルでも有効

## ロールバック計画

変更はフロントエンドのみのため、gitで以前のコミットに戻すことで即座にロールバック可能。

```bash
git revert <commit-hash>
```

## 関連ドキュメント

- [MDN: video preload](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video#preload)
- [MDN: video poster](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video#poster)
- [Web.dev: Lazy load video](https://web.dev/articles/lazy-loading-video)
