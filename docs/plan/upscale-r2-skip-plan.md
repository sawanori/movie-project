# アップスケール動画の解像度別処理実装計画書

## 概要

アップスケール処理を解像度によって分岐させ、効率的な処理を実現する。

- **HD (1080p)**: FFmpegでアップスケール → R2に保存（Runwayクレジット不使用）
- **4K**: Runway Upscale APIでアップスケール → Runway URL直接使用（R2スキップ）

## 実装済み (2026-01-04)

## 背景

### 現状の問題点

1. **ストレージコストの増大**
   - 720p → HD (1080p): 約2.25倍のファイルサイズ
   - 720p → 4K (2160p): 約9倍のファイルサイズ
   - 多数のユーザーがアップスケールを利用するとR2コストが急増

2. **冗長なデータ保存**
   - ユーザーは通常、ダウンロード後ローカルに保存
   - R2に保存したファイルは再ダウンロードされることが稀
   - 特にProRes変換用の一時的な利用では不要

### 変更の目的

- R2ストレージコストの削減
- 処理時間の短縮（R2アップロードをスキップ）
- システムリソースの効率化

## 現状のフロー

```
┌─────────────────────────────────────────────────────────────┐
│  現状のアップスケール処理フロー                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ユーザーがHD/4Kアップスケールをリクエスト                │
│                    ↓                                        │
│  2. Runway Upscale API呼び出し                              │
│                    ↓                                        │
│  3. ポーリングで完了待機                                    │
│                    ↓                                        │
│  4. Runwayから動画をダウンロード ← 不要になる               │
│                    ↓                                        │
│  5. R2にアップロード ← 削除対象                             │
│                    ↓                                        │
│  6. R2のURLをDBに保存・返却                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 変更後のフロー

```
┌─────────────────────────────────────────────────────────────┐
│  変更後のアップスケール処理フロー                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ユーザーがHD/4Kアップスケールをリクエスト                │
│                    ↓                                        │
│  2. Runway Upscale API呼び出し                              │
│                    ↓                                        │
│  3. ポーリングで完了待機                                    │
│                    ↓                                        │
│  4. RunwayのURLをそのままDBに保存・返却                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 変更対象ファイル

### バックエンド

| ファイル | 変更内容 |
|----------|----------|
| `movie-maker-api/app/tasks/upscale_processor.py` | R2アップロード処理を削除、Runway URLを直接使用 |

## 実装詳細

### 変更前のコード

```python
# movie-maker-api/app/tasks/upscale_processor.py (lines 86-108)

# 動画をダウンロード
logger.info(f"Downloading upscaled video from {video_url}")
video_content = await provider.download_video_bytes(task_id)

if not video_content:
    raise Exception("アップスケール動画のダウンロードに失敗しました")

# R2にアップロード
timestamp = int(time.time())
if concat_id:
    filename = f"{user_id}/concat_{concat_id}_upscaled_{resolution}_{timestamp}.mp4"
else:
    filename = f"{user_id}/storyboard_{storyboard_id}_upscaled_{resolution}_{timestamp}.mp4"
r2_url = await upload_video(video_content, filename)

logger.info(f"Upscaled video uploaded to R2: {r2_url}")

# 完了に更新
supabase.table("video_upscales").update({
    "status": "completed",
    "progress": 100,
    "upscaled_video_url": r2_url,
}).eq("id", upscale_id).execute()
```

### 変更後のコード

```python
# movie-maker-api/app/tasks/upscale_processor.py

# Runway URLをそのまま使用（R2アップロードをスキップ）
logger.info(f"Using Runway URL directly: {video_url}")

# 完了に更新（Runway URLを直接保存）
supabase.table("video_upscales").update({
    "status": "completed",
    "progress": 100,
    "upscaled_video_url": video_url,  # Runway URLを直接使用
}).eq("id", upscale_id).execute()
```

## 注意事項

### Runway URLの有効期限

- Runway APIから返されるURLには有効期限がある（通常24時間〜数日）
- ユーザーはアップスケール完了後、速やかにダウンロードする必要がある
- 期限切れ後は再度アップスケールが必要（Runwayクレジット消費）

### フロントエンドへの影響

- **影響なし**: フロントエンドは `upscaled_video_url` を使用してダウンロードするだけ
- URLがR2かRunwayかは区別不要

### DBスキーマへの影響

- **影響なし**: `video_upscales.upscaled_video_url` カラムの用途は変わらない
- 保存されるURLがR2からRunwayに変わるだけ

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| URL期限切れでダウンロード不可 | 中 | UIで「すぐにダウンロードしてください」と案内 |
| Runway障害時にURLアクセス不可 | 低 | 再アップスケールを案内 |
| 再ダウンロード時に再課金 | 低 | ユーザーはローカル保存が前提 |

## 実装手順

### Phase 1: バックエンド変更

1. [ ] `upscale_processor.py` のR2アップロード処理を削除
2. [ ] Runway URLを直接DBに保存するように変更
3. [ ] 不要になったimport文を削除

### Phase 2: テスト

4. [ ] アップスケール処理の動作確認
5. [ ] ダウンロードが正常に動作することを確認
6. [ ] ProRes + アップスケール連携の動作確認

### Phase 3: クリーンアップ（オプション）

7. [ ] 既存のR2に保存されたアップスケール動画の削除検討
   - パターン: `*_upscaled_hd_*.mp4`, `*_upscaled_4k_*.mp4`

## 削減効果の試算

### 前提条件
- 平均動画サイズ: 720p = 10MB
- アップスケール比率: HD = 2.25倍、4K = 9倍
- 月間アップスケール数: 100件（HD: 70件、4K: 30件）

### 月間ストレージ削減量
```
HD:  70件 × 10MB × 2.25 = 1,575 MB
4K:  30件 × 10MB × 9.00 = 2,700 MB
────────────────────────────────
合計: 4,275 MB (約4.2GB/月)
```

### 年間削減量
```
4.2GB × 12ヶ月 = 約50GB/年
```

## 関連ファイル

- `/movie-maker-api/app/tasks/upscale_processor.py` - アップスケール処理
- `/movie-maker-api/app/services/ffmpeg_service.py` - FFmpeg処理（upscale_to_hd追加）
- `/movie-maker-api/app/external/runway_provider.py` - Runway API連携
- `/movie-maker-api/app/external/r2.py` - R2ストレージ連携
- `/docs/prores-upscale-integration-plan.md` - ProRes+アップスケール実装計画

## 実装詳細（2026-01-04更新）

### 問題の発見

ユーザーがProRes FullHD（prores_hd）を選択したところ、出力解像度が2304x4096となり期待した1080pではなかった。

**原因**: Runway Upscale v1 APIは解像度パラメータをサポートしておらず、常に4倍アップスケール（最大4096px）を行う。

### 採用した解決策

| 解像度 | 処理方法 | 出力 | クレジット |
|--------|----------|------|-----------|
| HD (1080p) | Runway AI → FFmpegダウンスケール | R2に保存 | 2クレジット/秒 |
| 4K | Runway API | Runway URL直接 | 2クレジット/秒 |

**両方ともRunway AI品質を使用**することで、単なる補間ではなくAIによるディテール生成を実現。

### FFmpegによるHDダウンスケール

`ffmpeg_service.py`に`downscale_to_hd()`関数を追加:

```python
async def downscale_to_hd(self, video_path: str, output_path: str) -> str:
    """4K → 1080p (FullHD) にダウンスケール"""
    # Runway AI品質を維持しつつ1080pに縮小
    scale_filter = f"scale={out_width}:{out_height}:flags=lanczos"
```

- 縦長動画: 2304x4096 → 1080x1920
- 横長動画: 4096x2304 → 1920x1080
- 正方形: 4096x4096 → 1080x1080

### 処理フロー

```
┌─────────────────────────────────────────────────────────────┐
│  HD (1080p) アップスケール処理フロー                         │
├─────────────────────────────────────────────────────────────┤
│  1. ユーザーがHDアップスケールをリクエスト                  │
│                    ↓                                        │
│  2. Runway Upscale API呼び出し（4K出力）                    │
│                    ↓                                        │
│  3. ポーリングで完了待機                                    │
│                    ↓                                        │
│  4. Runway 4K動画をダウンロード                             │
│                    ↓                                        │
│  5. FFmpegで1080pにダウンスケール（AI品質維持）             │
│                    ↓                                        │
│  6. R2にアップロード                                        │
│                    ↓                                        │
│  7. R2のURLをDBに保存・返却                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  4K アップスケール処理フロー                                │
├─────────────────────────────────────────────────────────────┤
│  1. ユーザーが4Kアップスケールをリクエスト                  │
│                    ↓                                        │
│  2. Runway Upscale API呼び出し                              │
│                    ↓                                        │
│  3. ポーリングで完了待機                                    │
│                    ↓                                        │
│  4. RunwayのURLをそのままDBに保存・返却                     │
└─────────────────────────────────────────────────────────────┘
```

### メリット

1. **両方AI品質**: HD/4K共にRunway AIによるディテール生成
2. **正確な解像度**: HD選択時は確実に1080p出力
3. **4KはR2ストレージ節約**: 大容量4K動画はRunway URLを直接使用
4. **HD URLは有効期限なし**: R2保存のため永続的にアクセス可能
