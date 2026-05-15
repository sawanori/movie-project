---
id: T1-6
phase: 1
title: videos/schemas.py の element_images max_length を 3 から 4 に緩和
depends_on: []
estimated_effort: S
files_touched:
  - movie-maker-api/app/videos/schemas.py
---

## 目的

`StoryVideoCreate.element_images`、`StoryboardVideoCreate.element_images`、`StoryboardGenerateRequest.element_images` の `max_length=3` を `max_length=4` に緩和する。  
FE 側が 4 枚送信できるよう BE の受信制約を先に緩和し、T2-1 の FE 変更に対応する。

## 前提

- T1-3、T1-4 と独立して実装可能
- `piapi_kling_provider.py:393` の `element_images[:4]` slice は既に 4 を使用しているため、schema 緩和後も変更不要 (Design Doc §6-4 整合性確認より)
- `ElementImage` モデル自体 (L119-125) の変更は不要

## 変更内容

`movie-maker-api/app/videos/schemas.py` の以下 3 箇所を変更する。

### 箇所 1: `StoryVideoCreate.element_images` (L301-305)

```python
# 修正前
element_images: list[ElementImage] | None = Field(
    default=None,
    max_length=3,
    description="一貫性向上用の追加画像（最大3枚）。Kling専用機能"
)

# 修正後
element_images: list[ElementImage] | None = Field(
    default=None,
    max_length=4,
    description="一貫性向上用の追加画像（最大4枚、Kling 3.0 Omni Elements）"
)
```

### 箇所 2: `StoryboardVideoCreate.element_images` (L798-802)

```python
# 修正前
element_images: list[ElementImage] | None = Field(
    default=None,
    max_length=3,
    description="一貫性向上用の追加画像（最大3枚、ベース画像と合わせて最大4枚）。Kling専用機能"
)

# 修正後
element_images: list[ElementImage] | None = Field(
    default=None,
    max_length=4,
    description="一貫性向上用の追加画像（最大4枚、Kling 3.0 Omni Elements）"
)
```

### 箇所 3: `StoryboardGenerateRequest.element_images` (L815-819)

```python
# 修正前
element_images: list[ElementImage] | None = Field(
    default=None,
    max_length=3,
    description="一貫性向上用の追加画像（ストーリーボード保存値を上書き）。Kling専用機能"
)

# 修正後
element_images: list[ElementImage] | None = Field(
    default=None,
    max_length=4,
    description="一貫性向上用の追加画像（最大4枚、ストーリーボード保存値を上書き）。Kling 3.0 Omni Elements"
)
```

> **注意**: Design Doc では `StoryVideoCreate` のみ言及しているが、grep の結果、同ファイルに同様の `max_length=3` が 3 箇所存在する。整合性のために全箇所を同時に更新する。

## 完了条件 (AC)

- [x] `grep -n "max_length=3" movie-maker-api/app/videos/schemas.py` でゼロ件 (element_images 関連の `max_length=3` が全て消える)
- [x] `grep -n "max_length=4" movie-maker-api/app/videos/schemas.py` で 3 件以上 (各スキーマの element_images)
- [x] 4 枚の element_images を含む JSON が validation を通過することを確認:
  ```bash
  cd movie-maker-api
  python -c "
  from app.videos.schemas import StoryVideoCreate, ElementImage
  req = StoryVideoCreate(
      image_url='http://example.com/img.jpg',
      prompt='test',
      element_images=[
          ElementImage(image_url='http://example.com/1.jpg'),
          ElementImage(image_url='http://example.com/2.jpg'),
          ElementImage(image_url='http://example.com/3.jpg'),
          ElementImage(image_url='http://example.com/4.jpg'),
      ]
  )
  print('4枚 PASS:', len(req.element_images))
  "
  ```
- [x] 5 枚は validation エラーになることを確認:
  ```bash
  python -c "
  from pydantic import ValidationError
  from app.videos.schemas import StoryVideoCreate, ElementImage
  try:
      StoryVideoCreate(
          image_url='http://example.com/img.jpg',
          prompt='test',
          element_images=[ElementImage(image_url=f'http://example.com/{i}.jpg') for i in range(5)]
      )
      print('FAIL: 5枚が通ってしまった')
  except ValidationError:
      print('5枚 PASS: ValidationError')
  "
  ```
- [x] `pytest movie-maker-api/` が新たに失敗しない

## テスト

```bash
cd movie-maker-api
pytest -q --tb=short 2>&1 | tail -10
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §6-4: スキーマ拡張 (`videos/schemas.py`)
- Design Doc §6-5: 整合性チェック箇所
- `movie-maker-api/app/videos/schemas.py` L301-305, L798-802, L815-819
