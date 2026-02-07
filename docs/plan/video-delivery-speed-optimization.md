# 動画配信速度最適化 実装計画書

## 概要

生成した動画の呼び出し速度を向上させるため、以下2つの最適化を実装する：

1. **faststart フラグの追加** - MP4メタデータをファイル先頭に配置し、再生開始を高速化
2. **Cache-Control ヘッダーの設定** - CDNキャッシュを有効活用し、配信を高速化

## 背景

### 現状の課題
- FFmpegでエンコードされた動画に`-movflags +faststart`が設定されていない
- R2アップロード時にCache-Controlヘッダーが設定されていない
- 結果として、動画の再生開始に時間がかかる

### 期待される効果
- 動画再生開始時間の大幅短縮（特に大きいファイルで顕著）
- CDNキャッシュヒット率の向上による配信高速化
- ユーザー体験の向上

## 影響範囲

### 変更対象ファイル
| ファイル | 変更内容 |
|----------|----------|
| `movie-maker-api/app/services/ffmpeg_service.py` | faststart フラグ追加 |
| `movie-maker-api/app/external/r2.py` | Cache-Control ヘッダー追加 |

### データベースへの影響
- **Supabaseマイグレーション: 不要**
- 本実装ではDBスキーマの変更は発生しない

> **注意**: 将来的にマイグレーションが発生する場合は、Supabase MCPツール（`mcp__supabase__apply_migration`）を使用して実行すること。

## 実装詳細

### 1. faststart フラグの追加

#### 対象箇所
`movie-maker-api/app/services/ffmpeg_service.py` 内の **H.264 (libx264) エンコードを行うすべての箇所**

#### 変更パターン

**変更前:**
```python
"-c:v", "libx264",
"-preset", "fast",
"-crf", "23",
output_path,
```

**変更後:**
```python
"-c:v", "libx264",
"-preset", "fast",
"-crf", "23",
"-movflags", "+faststart",
output_path,
```

> **重要**: `-movflags +faststart` は必ず `output_path` の**直前**に配置すること。FFmpegのオプション順序の制約による。

#### 変更が必要な関数一覧（全10箇所）

| # | 関数名 | 行番号 | 用途 |
|---|--------|--------|------|
| 1 | `add_text_overlay` | L162-165 | テキストオーバーレイ |
| 2 | `add_film_grain` | L222-225 | フィルムグレイン追加 |
| 3 | `apply_color_grading` | L385-388 | カラーグレーディング |
| 4 | `apply_promist_effect` | L463-466 | Pro-Mist効果 |
| 5 | `apply_lut` | L540-543 | LUT適用 |
| 6 | `convert_fps` | L704-707 | FPS変換 |
| 7 | `add_logo_watermark` | L779-782 | ロゴウォーターマーク |
| 8 | `trim_video` | L1096-1102 | 動画トリミング |
| 9 | `_concat_with_transition` (音声あり) | L1333-1338 | トランジション結合 |
| 10 | `_concat_with_transition` (音声なし) | L1347-1351 | トランジション結合 |
| 11 | `downscale_to_hd` | L1568-1572 | HDダウンスケール |

#### 変更が**不要**な関数（除外対象）

| 関数名 | 理由 |
|--------|------|
| `add_bgm` | `-c:v copy` を使用（再エンコードなし） |
| `_concat_simple` | `-c copy` を使用（再エンコードなし） |
| `convert_to_prores` | ProRes形式（MOV）はfaststart不要 |
| `convert_to_prores_hd` | ProRes形式（MOV）はfaststart不要 |
| `process_video` 内の最終コピー | `-c copy` を使用 |

#### 具体的な変更例

##### 例1: add_text_overlay (L157-166)
```python
# 変更前
cmd = [
    "ffmpeg", "-y",
    "-i", video_path,
    "-vf", drawtext_filter,
    "-c:a", "copy",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    output_path,
]

# 変更後
cmd = [
    "ffmpeg", "-y",
    "-i", video_path,
    "-vf", drawtext_filter,
    "-c:a", "copy",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-movflags", "+faststart",
    output_path,
]
```

##### 例2: trim_video (L1095-1103)
```python
# 変更前
cmd.extend([
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y",
    output_path,
])

# 変更後
cmd.extend([
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    output_path,
])
```

##### 例3: downscale_to_hd (L1564-1573) - preset/crfが異なる
```python
# 変更前
cmd = [
    "ffmpeg", "-y",
    "-i", video_path,
    "-vf", scale_filter,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-c:a", "copy",
    output_path,
]

# 変更後
cmd = [
    "ffmpeg", "-y",
    "-i", video_path,
    "-vf", scale_filter,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-c:a", "copy",
    "-movflags", "+faststart",
    output_path,
]
```

#### 技術的補足

- `faststart`はMP4のmoov atom（メタデータ）をファイル先頭に移動
- これによりストリーミング再生時、メタデータをすぐに読み込める
- ファイルサイズへの影響はなし
- エンコード時間への影響は軽微（後処理として実行）
- **中間ファイルへの適用について**: `process_video`関数では複数の処理を連鎖するが、中間ファイルにfaststartを追加しても後続処理で再エンコードされるため効果なし。ただし各関数は単独でも使用されるため、すべてに追加する。

### 2. Cache-Control ヘッダーの設定

#### 対象ファイル
`movie-maker-api/app/external/r2.py`

#### 変更対象関数（全5箇所）

| # | 関数名 | 行番号 | 説明 |
|---|--------|--------|------|
| 1 | `upload_image` | L30-49 | 画像アップロード |
| 2 | `upload_video` | L52-64 | 動画アップロード |
| 3 | `upload_audio` | L67-90 | 音声アップロード |
| 4 | `upload_user_video` | L152-163 | ユーザー動画アップロード |
| 5 | `R2Client.upload_file` | L132-149 | 汎用ファイルアップロード |

#### 変更内容

##### upload_video() - 変更前（L52-64）
```python
async def upload_video(file_content: bytes, filename: str) -> str:
    """動画をR2にアップロード"""
    client = get_r2_client()
    key = f"videos/{filename}"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType="video/mp4",
    )

    return get_public_url(key)
```

##### upload_video() - 変更後
```python
async def upload_video(file_content: bytes, filename: str) -> str:
    """動画をR2にアップロード"""
    client = get_r2_client()
    key = f"videos/{filename}"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType="video/mp4",
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)
```

##### upload_image() - 変更後（L30-49）
```python
async def upload_image(file_content: bytes, filename: str) -> str:
    """画像をR2にアップロード"""
    client = get_r2_client()
    key = f"images/{filename}"

    # Content-Typeを推測
    content_type = "image/jpeg"
    if filename.lower().endswith(".png"):
        content_type = "image/png"
    elif filename.lower().endswith(".webp"):
        content_type = "image/webp"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)
```

##### upload_audio() - 変更後（L67-90）
```python
async def upload_audio(file_content: bytes, filename: str) -> str:
    """音声ファイルをR2にアップロード"""
    client = get_r2_client()
    key = f"bgm/{filename}"

    # Content-Typeを推測
    content_type = "audio/mpeg"
    if filename.lower().endswith(".wav"):
        content_type = "audio/wav"
    elif filename.lower().endswith(".ogg"):
        content_type = "audio/ogg"
    elif filename.lower().endswith(".m4a"):
        content_type = "audio/mp4"
    elif filename.lower().endswith(".aac"):
        content_type = "audio/aac"

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)
```

##### upload_user_video() - 変更後（L152-163）
```python
async def upload_user_video(file_content: bytes, key: str, content_type: str) -> str:
    """ユーザー動画をR2にアップロード（keyを直接指定）"""
    client = get_r2_client()

    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=file_content,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )

    return get_public_url(key)
```

##### R2Client.upload_file() - 変更後（L132-149）
```python
async def upload_file(
    self,
    file_data: bytes,
    key: str,
    content_type: str = "application/octet-stream",
) -> str:
    """ファイルをR2にアップロード"""
    try:
        client = get_r2_client()
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=file_data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        return get_public_url(key)
    except ClientError as e:
        raise Exception(f"R2 upload failed: {e}")
```

#### Cache-Control 値の説明
| ディレクティブ | 意味 |
|----------------|------|
| `public` | CDN/プロキシでキャッシュ可能 |
| `max-age=31536000` | 1年間キャッシュ（生成動画は不変のため） |
| `immutable` | コンテンツは変更されないことを明示 |

## テスト計画

### 1. faststart の検証

```bash
# ffprobeでmoov atomの位置を確認
ffprobe -v trace output.mp4 2>&1 | grep -E "moov|mdat"

# 期待結果: moovがmdatより先に出力される
# [mov,mp4,m4a,3gp,3g2,mj2 @ ...] moov atom found
# [mov,mp4,m4a,3gp,3g2,mj2 @ ...] mdat atom found
```

### 2. Cache-Control の検証

```bash
# R2から動画を取得してヘッダーを確認
curl -I "https://your-r2-domain.com/videos/test.mp4"

# 期待結果
# Cache-Control: public, max-age=31536000, immutable
```

### 3. 再生速度の計測

- 変更前後で動画再生開始時間を計測
- Chrome DevToolsのNetworkタブでTTFB（Time To First Byte）を確認

### 4. ユニットテスト

既存のテスト `tests/videos/test_router.py` が通ることを確認。

```bash
cd movie-maker-api
pytest tests/videos/test_router.py -v
```

## ロールバック計画

変更はコード修正のみのため、gitで以前のコミットに戻すことで即座にロールバック可能。

```bash
git revert <commit-hash>
```

## 実装手順

### Phase 1: faststart 追加（推定作業時間: 30分）

1. `ffmpeg_service.py`を開く
2. 以下の10関数に`"-movflags", "+faststart"`を追加:
   - `add_text_overlay`
   - `add_film_grain`
   - `apply_color_grading`
   - `apply_promist_effect`
   - `apply_lut`
   - `convert_fps`
   - `add_logo_watermark`
   - `trim_video`
   - `_concat_with_transition`（2箇所）
   - `downscale_to_hd`
3. ローカルで動画生成をテストし、ffprobeで確認
4. テスト通過後、コミット

### Phase 2: Cache-Control 追加（推定作業時間: 15分）

1. `r2.py`を開く
2. 以下の5関数に`CacheControl`パラメータを追加:
   - `upload_image`
   - `upload_video`
   - `upload_audio`
   - `upload_user_video`
   - `R2Client.upload_file`
3. ローカルでアップロードをテストし、curlでヘッダー確認
4. テスト通過後、コミット

### Phase 3: 検証（推定作業時間: 15分）

1. 本番環境にデプロイ
2. 新規生成した動画で再生開始時間を確認
3. CloudflareダッシュボードでCDNキャッシュヒット率を確認

## 注意事項

### 1. 既存動画への影響
- **faststart**: 既存動画には適用されない（新規生成分から有効）
- **Cache-Control**: 既存動画には適用されない（再アップロードが必要）

### 2. キャッシュの無効化
- 動画を差し替える場合、URLを変更するかCloudflareでキャッシュパージが必要
- 現在のシステムでは動画URLはユニークなため、通常は問題なし

### 3. ProRes/MOVファイルへの影響
- ProRes形式（MOV）にはfaststartは**不要かつ無効**
- MOVコンテナは異なるメタデータ構造を持つため
- `convert_to_prores`, `convert_to_prores_hd`は変更対象外

### 4. エラー発生時の挙動
- faststartオプション追加によるFFmpegエラーは発生しない（標準オプション）
- CacheControlパラメータはboto3の標準パラメータであり、R2でサポート済み

### 5. パフォーマンス影響
- **エンコード時間**: faststart処理は後処理として実行されるため、軽微な増加（1-2秒程度）
- **アップロード時間**: 変更なし

## 関連ドキュメント

- [Cloudflare R2 Cache-Control](https://developers.cloudflare.com/r2/buckets/public-buckets/#cache-control)
- [FFmpeg movflags](https://ffmpeg.org/ffmpeg-formats.html#Options-9)
- [boto3 put_object CacheControl](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/client/put_object.html)
