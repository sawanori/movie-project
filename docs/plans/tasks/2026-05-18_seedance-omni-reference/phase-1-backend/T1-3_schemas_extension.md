---
id: T1-3
phase: 1
title: schemas.py 拡張 + omni schema 全所有 (Upload API レスポンス schema 含)
depends_on: [T1-1]
parallel_with: [T1-5, T1-17a]
estimated_effort: M
files_touched:
  - movie-maker-api/app/videos/schemas.py
  - movie-maker-api/tests/videos/test_omni_reference_schema.py
wave: 2
agent: backend
---

## 目的

v3 計画書 §6.4 に従い、`StoryVideoCreate` に omni_reference 3 フィールド (`image_reference_asset_ids` max=8 / `video_reference_asset_ids` max=3 / `audio_reference_asset_ids` max=3) と validator (個別上限、@構文、image 合算 ≤9、外部 URL 拒否) を追加。**Upload API レスポンス schema もこのタスク内で定義** (H-1 解消、後続 T1-4 が schema を独立に再定義する重複を回避)。

## 前提

- 依存タスク: T1-1 (Migration 完了で `omni_reference_assets` テーブルが存在)
- 並列実行可: T1-5 (Provider)、T1-17a (GC RED)
- 参照箇所: v3 計画書 §6.4 (Schema 変更), `movie-maker-api/app/videos/schemas.py:276-353` (StoryVideoCreate)

## 変更内容

### `movie-maker-api/app/videos/schemas.py`

#### 1. Upload API レスポンス schema (H-1 解消: ここで一元定義)

```python
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field

class OmniReferenceAssetResponse(BaseModel):
    id: UUID
    url: str
    media_type: Literal["video", "audio", "image"]
    duration_seconds: Optional[float] = None
    content_type: str
    file_size_bytes: int
    expires_at: datetime
```

#### 2. StoryVideoCreate 拡張

```python
# StoryVideoCreate クラス内に追加
image_reference_asset_ids: Optional[list[UUID]] = Field(
    default=None,
    max_length=8,
    description="omni_reference 用追加画像参照の asset_id。"
                "最大 8 個 (base image_url と合算で PiAPI 上限 9 に収まる)。"
                "外部 URL 直接受付不可 (アップロード API 経由必須)"
)
video_reference_asset_ids: Optional[list[UUID]] = Field(
    default=None,
    max_length=3,
    description="omni_reference 用動画参照の asset_id。最大 3 個、合計 ≤15.4s"
)
audio_reference_asset_ids: Optional[list[UUID]] = Field(
    default=None,
    max_length=3,
    description="omni_reference 用音声参照の asset_id。最大 3 個、**合計** ≤15s (PiAPI 公式)"
)
```

#### 3. cross-validator

```python
from pydantic import model_validator
from typing_extensions import Self

@model_validator(mode='after')
def validate_omni_references(self) -> Self:
    has_video_refs = bool(self.video_reference_asset_ids)
    has_audio_refs = bool(self.audio_reference_asset_ids)
    has_image_refs = bool(self.image_reference_asset_ids)
    if not (has_video_refs or has_audio_refs or has_image_refs):
        return self

    if self.video_provider not in (None, VideoProvider.SEEDANCE):
        raise ValueError("*_reference_asset_ids は video_provider=seedance でのみ利用可能")

    base_image_count = 1 if self.image_url else 0
    image_count = base_image_count + len(self.image_reference_asset_ids or [])
    video_count = len(self.video_reference_asset_ids or [])
    audio_count = len(self.audio_reference_asset_ids or [])

    if image_count > 9:
        raise ValueError(
            f"image_urls 合計は 9 個まで "
            f"(base image_url {base_image_count} + 追加 {len(self.image_reference_asset_ids or [])})"
        )

    # 防御コード (構造的に到達不能)
    if image_count == 0 and video_count == 0 and audio_count > 0:
        raise ValueError("audio 単独不可。image または video を 1 つ以上指定 (防御)")

    # @構文 validate
    import re
    text = self.story_text or ''
    for tag, count in [('image', image_count), ('video', video_count), ('audio', audio_count)]:
        for match in re.finditer(rf'@{tag}(\d+)', text):
            n = int(match.group(1))
            if n < 1 or n > count:
                raise ValueError(f"プロンプト内の @{tag}{n} は範囲外 (指定された {tag} 参照は {count} 個)")
    return self
```

### 新規テスト: `tests/videos/test_omni_reference_schema.py`

v3 計画書 §15.1 から B-13, B-14, B-15, B-16b, B-17a, B-17b, B-18, B-19, B-20, B-32 を実装 (TDD: RED 段階で書く、本タスク内で GREEN まで)。

| # | テスト |
|---|--------|
| B-13 | 3 種正常 → valid |
| B-14 | video 4 個 → 422 |
| B-15 | refs + provider=runway → 422 |
| B-16b | base image_url + audio refs のみ → valid |
| B-17a | image_url + image_refs=8 → valid (合計 9) |
| B-17b | image_refs=9 → 422 (Pydantic max=8) |
| B-18 | @video2 + refs=1 → 422 |
| B-19 | @video1 + refs=1 → valid |
| B-20 | 全省略 → valid |
| B-32 | UUID 文字列以外 ("https://...") → 422 |

## 完了条件 (AC)

- [x] `OmniReferenceAssetResponse` schema が schemas.py に定義済
- [x] `StoryVideoCreate` に 3 つの asset_ids フィールド追加 (型: `Optional[list[UUID]]`)
- [x] image_reference_asset_ids の `max_length=8` (v3 仕様)
- [x] `validate_omni_references` validator 実装済
- [x] `pytest tests/videos/test_omni_reference_schema.py -v` 全 pass
- [x] 既存 schema テスト全件 pass
- [x] AC-13 (UUID 型で外部 URL 直接拒否) が test で検証されている (B-32)

## ロールバック

追加した fields / validator / Schema / test ファイルを削除。

## 参照

- v3 計画書 §6.4 (Schema 詳細)
- v3 計画書 §15.1 (Backend テスト B-13〜B-20, B-32)
- v3 計画書 AC-9, AC-13, AC-23
- H-1 解消: Upload API レスポンス schema を T1-3 で一元化
