# ProRes + アップスケール統合実装計画書

## 概要

Runwayアップスケール機能（HD/4K）とProRes変換を組み合わせ、高解像度化した動画を編集用ProResフォーマットでダウンロードできるようにする。

## 背景

- 現在のProRes変換は**オリジナル解像度（720p）の8bit動画**に対して行われている
- 8bitソースを10bit ProResに変換しても本質的な画質向上は限定的
- **アップスケール後の高解像度動画**に対してProRes変換を行うことで、より意味のある高品質出力が可能になる

## 現在の実装状態

### ダウンロードオプション（現在）
```
○ オリジナル (720p)           → 即時ダウンロード
○ フルHD (1080p)              → Runwayアップスケール → ダウンロード
○ 4K (2160p)                  → Runwayアップスケール → ダウンロード
○ ProRes 422 HQ               → FFmpeg変換 → ダウンロード（720p）
```

### ダウンロードオプション（実装後）
```
○ オリジナル (720p)           → 即時ダウンロード
○ フルHD (1080p)              → Runwayアップスケール → ダウンロード
○ 4K (2160p)                  → Runwayアップスケール → ダウンロード
○ ProRes 422 HQ (720p)        → FFmpeg変換 → ダウンロード
○ ProRes 422 HQ (フルHD)      → アップスケール → ProRes変換 → ダウンロード [新規]
○ ProRes 422 HQ (4K)          → アップスケール → ProRes変換 → ダウンロード [新規]
```

## 処理フロー

```
┌─────────────────────────────────────────────────────────────────┐
│  ProRes + アップスケール処理フロー                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ユーザーが「ProRes 422 HQ (フルHD)」を選択                   │
│                    ↓                                            │
│  2. フロントエンド: アップスケールAPI呼び出し                     │
│     POST /api/v1/videos/{id}/upscale (resolution: "hd")         │
│                    ↓                                            │
│  3. バックエンド: Runwayアップスケール実行                       │
│     720p → 1080p (約1-2分)                                      │
│                    ↓                                            │
│  4. フロントエンド: ポーリングで完了を待機                       │
│     GET /api/v1/videos/{id}/upscale/status                      │
│                    ↓                                            │
│  5. 完了後: upscaled_video_url を取得                           │
│                    ↓                                            │
│  6. フロントエンド: ProRes変換API呼び出し                        │
│     POST /api/v1/videos/download/prores                         │
│     body: { video_url: upscaled_video_url }                     │
│                    ↓                                            │
│  7. バックエンド: FFmpegでProRes変換                             │
│     gradfun (デバンド) + ProRes 422 HQ (10bit)                  │
│                    ↓                                            │
│  8. ダウンロード完了                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 変更対象ファイル

### フロントエンド

| ファイル | 変更内容 |
|----------|----------|
| `movie-maker/app/concat/page.tsx` | 新しい解像度オプション追加、2段階処理ロジック |
| `movie-maker/app/concat/history/page.tsx` | 同上 |
| `movie-maker/app/generate/[id]/page.tsx` | 同上 |
| `movie-maker/app/generate/storyboard/page.tsx` | 同上（最終動画・シーン両方） |

### バックエンド

変更不要（既存APIの組み合わせで実現可能）

## 実装詳細

### 1. 型定義の更新

```typescript
// 現在
type ResolutionOption = 'original' | 'hd' | '4k' | 'prores';

// 変更後
type ResolutionOption =
  | 'original'
  | 'hd'
  | '4k'
  | 'prores'           // ProRes (720p)
  | 'prores_hd'        // ProRes (フルHD) [新規]
  | 'prores_4k';       // ProRes (4K) [新規]
```

### 2. 状態管理の追加

```typescript
// 追加する状態
const [upscaleForProResProgress, setUpscaleForProResProgress] = useState(0);
const [proResConversionPhase, setProResConversionPhase] = useState<
  'idle' | 'upscaling' | 'converting'
>('idle');
```

### 3. ダウンロードハンドラーの更新

```typescript
const handleDownload = async () => {
  // ... 既存のoriginal, hd, 4k, prores処理 ...

  // ProRes + アップスケール処理
  if (selectedResolution === 'prores_hd' || selectedResolution === 'prores_4k') {
    const targetResolution = selectedResolution === 'prores_hd' ? 'hd' : '4k';

    // フェーズ1: アップスケール
    setProResConversionPhase('upscaling');
    setUpscaleForProResProgress(0);

    try {
      // アップスケール開始
      const upscaleResponse = await videosApi.upscaleVideo(videoId, targetResolution);

      // ポーリングで完了待機
      let upscaledUrl: string | null = null;
      while (!upscaledUrl) {
        const status = await videosApi.getVideoUpscaleStatus(videoId);
        setUpscaleForProResProgress(status.progress);

        if (status.status === 'completed') {
          upscaledUrl = status.upscaled_video_url;
        } else if (status.status === 'failed') {
          throw new Error(status.message || 'アップスケールに失敗しました');
        }

        await new Promise(r => setTimeout(r, 3000));
      }

      // フェーズ2: ProRes変換
      setProResConversionPhase('converting');

      const blob = await videosApi.downloadAsProRes(upscaledUrl);

      // ダウンロード実行
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
      a.download = `video_prores_${targetResolution}_${timestamp}.mov`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setShowDownloadModal(false);
    } catch (err) {
      console.error("ProRes + Upscale failed:", err);
      setUpscaleError(err instanceof Error ? err.message : "処理に失敗しました");
    } finally {
      setProResConversionPhase('idle');
    }
    return;
  }
};
```

### 4. UIオプションの追加

```tsx
{/* ProRes (720p) - 既存 */}
<label className={...}>
  <input type="radio" value="prores" ... />
  <div className="flex-1">
    <div className="flex items-center gap-2 font-medium">
      ProRes 422 HQ
      <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
        編集用
      </span>
    </div>
    <div className="text-sm text-zinc-500">
      10bit・デバンド処理済み（約30秒〜1分）
    </div>
  </div>
  ...
</label>

{/* ProRes (フルHD) - 新規 */}
<label className={...}>
  <input type="radio" value="prores_hd" ... />
  <div className="flex-1">
    <div className="flex items-center gap-2 font-medium">
      ProRes 422 HQ (フルHD)
      <span className="rounded bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-xs text-white">
        高解像度編集用
      </span>
    </div>
    <div className="text-sm text-zinc-500">
      1080p・10bit・デバンド処理（約2〜3分）
    </div>
  </div>
  ...
</label>

{/* ProRes (4K) - 新規 */}
<label className={...}>
  <input type="radio" value="prores_4k" ... />
  <div className="flex-1">
    <div className="flex items-center gap-2 font-medium">
      ProRes 422 HQ (4K)
      <span className="rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 text-xs text-white">
        最高品質編集用
      </span>
    </div>
    <div className="text-sm text-zinc-500">
      2160p・10bit・デバンド処理（約3〜5分）
    </div>
  </div>
  ...
</label>
```

### 5. ローディング表示の更新

```tsx
{(isUpscaling || isConvertingProRes || proResConversionPhase !== 'idle') && (
  <div className="py-8 text-center">
    <Loader2 className="mx-auto h-12 w-12 animate-spin text-purple-500" />
    <p className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
      {proResConversionPhase === 'upscaling' && 'アップスケール中...'}
      {proResConversionPhase === 'converting' && 'ProRes変換中...'}
      {isConvertingProRes && proResConversionPhase === 'idle' && 'ProRes変換中...'}
      {isUpscaling && 'アップスケール中...'}
    </p>
    <p className="mt-2 text-sm text-zinc-500">
      {proResConversionPhase === 'upscaling' && `ステップ 1/2: 高解像度化 (${upscaleForProResProgress}%)`}
      {proResConversionPhase === 'converting' && 'ステップ 2/2: ProRes変換中...'}
      {/* ... */}
    </p>

    {/* プログレスバー */}
    {proResConversionPhase === 'upscaling' && (
      <div className="mx-auto mt-6 w-full max-w-xs">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
            style={{ width: `${upscaleForProResProgress}%` }}
          />
        </div>
      </div>
    )}
  </div>
)}
```

## 実装手順

### Phase 1: フロントエンド基盤（4ファイル共通）

1. [ ] 型定義を更新（`'prores_hd'`, `'prores_4k'` 追加）
2. [ ] 状態変数を追加（`proResConversionPhase`, `upscaleForProResProgress`）
3. [ ] `handleDownload` に ProRes+アップスケール処理を追加

### Phase 2: UI更新（4ファイル共通）

4. [ ] ダウンロードモーダルに新オプション追加
5. [ ] ローディング表示を2段階表示に対応
6. [ ] モーダル閉じるボタンの条件を更新

### Phase 3: 対象ファイル別実装

7. [ ] `concat/page.tsx`
8. [ ] `concat/history/page.tsx`
9. [ ] `generate/[id]/page.tsx`
10. [ ] `generate/storyboard/page.tsx`（最終動画）
11. [ ] `generate/storyboard/page.tsx`（シーンダウンロード）

### Phase 4: テスト

12. [ ] TypeScriptビルド確認
13. [ ] 動作テスト（各ダウンロードポイント）

## 所要時間見積もり

| フェーズ | 見積もり |
|----------|----------|
| Phase 1 | 基盤実装 |
| Phase 2 | UI実装 |
| Phase 3 | 各ファイル適用 |
| Phase 4 | テスト |

## 注意事項

1. **処理時間**: アップスケール（1-2分）+ ProRes変換（30秒-1分）= 合計2-5分程度
2. **エラーハンドリング**: 各フェーズでのエラーを適切にキャッチし、ユーザーにわかりやすく表示
3. **キャンセル対応**: 長時間処理のため、処理中はモーダルを閉じれないようにする
4. **メモリ使用量**: 4K ProResは大きなファイルになるため、ブラウザのメモリ制限に注意

## 関連ファイル

- `/movie-maker-api/app/services/ffmpeg_service.py` - ProRes変換処理
- `/movie-maker-api/app/tasks/upscale_processor.py` - アップスケール処理
- `/movie-maker-api/app/videos/router.py` - APIエンドポイント
- `/movie-maker/lib/api/client.ts` - フロントエンドAPIクライアント
