# KlingAI Multi-Image API 改修実装計画書

## 1. 概要

### 1.1 目的
KlingAI APIを単一画像入力（Image to Video）から複数画像入力（Multi-Image to Video）に対応させ、最大4枚の画像を使用した動画生成を可能にする。

### 1.2 改修サマリー

| 項目 | 現状 | 改修後 |
|------|------|--------|
| APIエンドポイント | `/v1/videos/image2video` | `/v1/videos/multi-image2video` |
| 画像パラメータ | `image: "url"` | `image_list: [{"image": "url"}, ...]` |
| モデル | 未指定（デフォルト） | `kling-v1-6` |
| 対応画像数 | 1枚 | 1〜4枚 |
| ステータス確認 | `/v1/videos/image2video/{task_id}` | `/v1/videos/multi-image2video/{task_id}` |

---

## 2. 影響範囲

### 2.1 変更対象ファイル

| ファイル | 変更内容 | 優先度 |
|----------|----------|--------|
| `app/external/kling.py` | API呼び出しロジック変更 | 高 |
| `app/videos/schemas.py` | スキーマを複数画像対応に変更 | 高 |
| `app/videos/service.py` | 画像リスト処理ロジック追加 | 高 |
| `app/videos/router.py` | 複数画像アップロード対応 | 高 |
| `app/tasks/video_processor.py` | 画像リスト受け渡し対応 | 中 |
| `tests/videos/test_router.py` | テストケース追加・修正 | 中 |

### 2.2 DB影響（Supabase）

`video_generations` テーブルのカラム変更:

| 変更種別 | カラム名 | 型 | 説明 |
|----------|----------|-----|------|
| 新規追加 | `image_urls` | `text[]` (配列) | 入力画像URLリスト |
| 既存維持 | `original_image_url` | `text` | 後方互換性のため維持（配列の1番目を格納） |

---

## 3. 実装ステップ

### Phase 1: バックエンド基盤改修

#### TASK-1: KlingAIクライアント改修
**ファイル:** `app/external/kling.py`

```python
# 変更前
async def generate_video(image_url: str, prompt: str) -> Optional[str]:
    ...
    json={
        "image": image_url,
        "prompt": prompt,
        "duration": "5",
        ...
    }

# 変更後
async def generate_video(image_urls: list[str], prompt: str) -> Optional[str]:
    """
    KlingAI Multi-Image to Video APIを呼び出し

    Args:
        image_urls: 入力画像URLのリスト（1〜4枚）
        prompt: 動画生成プロンプト

    Returns:
        str: タスクID（成功時）、None（失敗時）
    """
    if not 1 <= len(image_urls) <= 4:
        raise ValueError("Image count must be between 1 and 4")

    image_list = [{"image": url} for url in image_urls]

    json={
        "model_name": "kling-v1-6",
        "image_list": image_list,
        "prompt": prompt,
        "duration": "5",
        "aspect_ratio": "9:16",
        "mode": "std",
    }
```

**エンドポイント変更:**
- 生成: `https://api.klingai.com/v1/videos/image2video` → `https://api.klingai.com/v1/videos/multi-image2video`
- ステータス: `https://api.klingai.com/v1/videos/image2video/{task_id}` → `https://api.klingai.com/v1/videos/multi-image2video/{task_id}`

---

#### TASK-2: スキーマ変更
**ファイル:** `app/videos/schemas.py`

```python
# 変更前
class VideoCreate(BaseModel):
    image_url: str = Field(..., description="アップロード済み画像のURL")
    ...

# 変更後
class VideoCreate(BaseModel):
    image_urls: list[str] = Field(
        ...,
        min_length=1,
        max_length=4,
        description="アップロード済み画像のURLリスト（1〜4枚）"
    )
    prompt: str = Field(..., min_length=1, max_length=500)
    template_id: str | None = None
    bgm_track_id: str | None = None
    overlay: OverlaySettings | None = None


class VideoResponse(BaseModel):
    ...
    image_urls: list[str]  # 新規追加
    original_image_url: str  # 後方互換性のため維持（image_urls[0]）
    ...
```

---

#### TASK-3: サービスレイヤー変更
**ファイル:** `app/videos/service.py`

```python
async def create_video(user_id: str, request: VideoCreate) -> dict:
    ...
    video_data = {
        "user_id": user_id,
        "template_id": request.template_id,
        "image_urls": request.image_urls,  # 新規: 画像配列
        "original_image_url": request.image_urls[0],  # 後方互換
        "user_prompt": request.prompt,
        "optimized_prompt": optimized_prompt,
        "status": VideoStatus.PENDING.value,
        ...
    }
```

---

#### TASK-4: 動画処理タスク変更
**ファイル:** `app/tasks/video_processor.py`

```python
# 変更前
kling_task_id = await generate_video(
    image_url=video_data["original_image_url"],
    prompt=video_data["optimized_prompt"] or video_data["user_prompt"],
)

# 変更後
image_urls = video_data.get("image_urls") or [video_data["original_image_url"]]
kling_task_id = await generate_video(
    image_urls=image_urls,
    prompt=video_data["optimized_prompt"] or video_data["user_prompt"],
)
```

---

### Phase 2: API・フロントエンド対応

#### TASK-5: 複数画像アップロードエンドポイント
**ファイル:** `app/videos/router.py`

```python
@router.post("/upload-images")
async def upload_images_endpoint(
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """複数画像をアップロード（最大4枚）"""
    if len(files) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 images allowed")

    image_urls = []
    for file in files:
        # サイズ・MIMEチェック
        contents = await file.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File {file.filename} exceeds 10MB")

        # R2にアップロード
        filename = f"{current_user['user_id']}/{uuid.uuid4()}.{file.filename.split('.')[-1]}"
        url = await upload_image(contents, filename)
        image_urls.append(url)

    return {"image_urls": image_urls}
```

---

### Phase 3: DBマイグレーション

#### TASK-6: Supabaseマイグレーション

```sql
-- video_generationsテーブルに image_urls カラムを追加
ALTER TABLE video_generations
ADD COLUMN image_urls text[] DEFAULT ARRAY[]::text[];

-- 既存データの移行（original_image_url → image_urls）
UPDATE video_generations
SET image_urls = ARRAY[original_image_url]
WHERE image_urls = ARRAY[]::text[] OR image_urls IS NULL;

-- インデックス追加（オプション）
CREATE INDEX idx_video_generations_image_urls ON video_generations USING GIN (image_urls);
```

---

### Phase 4: テスト

#### TASK-7: ユニットテスト追加
**ファイル:** `tests/videos/test_router.py`

```python
class TestCreateVideoMultiImage:
    def test_create_video_single_image(self, auth_client, mock_supabase):
        """1枚画像での動画生成"""
        response = auth_client.post("/api/v1/videos", json={
            "image_urls": ["https://example.com/image1.jpg"],
            "prompt": "A cat walking"
        })
        assert response.status_code == 201

    def test_create_video_multiple_images(self, auth_client, mock_supabase):
        """複数画像での動画生成"""
        response = auth_client.post("/api/v1/videos", json={
            "image_urls": [
                "https://example.com/image1.jpg",
                "https://example.com/image2.jpg",
                "https://example.com/image3.jpg"
            ],
            "prompt": "A cat running and jumping"
        })
        assert response.status_code == 201

    def test_create_video_exceeds_max_images(self, auth_client):
        """5枚以上はエラー"""
        response = auth_client.post("/api/v1/videos", json={
            "image_urls": ["url1", "url2", "url3", "url4", "url5"],
            "prompt": "test"
        })
        assert response.status_code == 422  # Validation Error
```

---

## 4. 後方互換性

### 4.1 既存APIの維持
- `image_url` パラメータでの単一画像リクエストも引き続きサポート
- 内部で `image_urls: [image_url]` に変換

```python
class VideoCreate(BaseModel):
    image_urls: list[str] | None = None
    image_url: str | None = None  # 後方互換

    @model_validator(mode='after')
    def validate_images(self):
        if not self.image_urls and not self.image_url:
            raise ValueError("Either image_urls or image_url is required")
        if self.image_url and not self.image_urls:
            self.image_urls = [self.image_url]
        return self
```

### 4.2 DBの後方互換
- `original_image_url` カラムは維持
- 常に `image_urls[0]` の値を同期

---

## 5. 実装順序とチェックリスト

```
Phase 1: バックエンド基盤 (推定: 2-3時間)
├── [ ] TASK-1: kling.py 改修
├── [ ] TASK-2: schemas.py 変更
├── [ ] TASK-3: service.py 変更
└── [ ] TASK-4: video_processor.py 変更

Phase 2: API拡張 (推定: 1時間)
└── [ ] TASK-5: 複数画像アップロードエンドポイント

Phase 3: DB (推定: 30分)
└── [ ] TASK-6: Supabaseマイグレーション

Phase 4: テスト (推定: 1時間)
└── [ ] TASK-7: テスト追加・実行
```

---

## 6. ロールバック手順

問題発生時は以下の手順でロールバック:

1. **APIエンドポイントを戻す**
   - `kling.py` のエンドポイントを `/v1/videos/image2video` に戻す
   - `image_list` → `image` パラメータに戻す

2. **スキーマを戻す**
   - `image_urls` → `image_url` に戻す

3. **DBは維持**
   - `image_urls` カラムは削除せず、使用を停止するのみ

---

## 7. 注意事項

1. **API制限**: KlingAI の `multi-image2video` は画像1〜4枚まで
2. **モデル指定**: `kling-v1-6` を明示的に指定（推奨モデル）
3. **duration**: 複数画像の場合、`10`秒を推奨（フレーム間の遷移時間確保）
4. **画像順序**: `image_list` の順序がフレーム順序に影響する可能性あり

---

## 8. 参考資料

- 元ドキュメント: `docs/klingAI API_image_re.md`
- KlingAI公式ドキュメント: https://docs.klingai.com/
