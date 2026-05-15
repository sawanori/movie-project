---
id: T1-3
phase: 1
title: _inject_image_references_into_prompt ヘルパー関数の新規追加
depends_on: []
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/piapi_kling_provider.py
---

## 目的

Kling 3.0 Omni のプロンプト末尾に `@image_1`, `@image_2`, ... を自動付加するモジュールスコープのヘルパー関数 `_inject_image_references_into_prompt` を新規追加する。  
B3 全エッジケース (空 prompt、既存 `@image_X` あり、`@image_K > num_images` の警告) に対応する。

## 前提

- T1-1、T1-2 と独立して実装可能
- `import re` を piapi_kling_provider.py の冒頭 import セクションに追加する必要がある (L10 付近)

## 変更内容

### 1. import セクションへの `import re` 追加 (L10 付近)

```python
import re  # ← 追加
```

### 2. モジュールレベル定数の追加 (`_get_camera_control` 関数終端 L210 と `class PiAPIKlingProvider` L213 の間に挿入)

```python
# プロンプト内に既に @image_i が明示されているかを検出する正規表現。
# - @image_\d+ 形式を検出 (大文字小文字を問わない)
_IMAGE_REF_PATTERN = re.compile(r"@image_\d+", re.IGNORECASE)


def _inject_image_references_into_prompt(prompt: str, num_images: int) -> str:
    """
    Kling 3.0 Omni 向けに、プロンプト末尾へ @image_1, ..., @image_N を自動付加する。

    Behavior (B3 全エッジケース対応):
      - num_images <= 0           → prompt をそのまま返す (Elements 未使用)
      - prompt.strip() == ""      → "@image_1 @image_2 ..." だけを返す (頭空白なし)
      - prompt に既に @image_N (N が num_images 以下) が含まれる → そのまま返す
        (ユーザー記述尊重)
      - prompt に @image_K (K > num_images) が含まれる
        → そのまま返すが logger.warning で警告ログを出す
      - 上記以外 → prompt.rstrip() + " " + "@image_1 @image_2 ... @image_N"

    Args:
        prompt: 元プロンプト
        num_images: input.images 配列の枚数 (1〜4 を想定)

    Returns:
        str: @image_i が末尾に付加されたプロンプト
    """
    if num_images <= 0:
        return prompt

    stripped = prompt.strip()
    existing = _IMAGE_REF_PATTERN.findall(stripped)

    if existing:
        max_existing = max(int(m.split('_')[1]) for m in existing)
        if max_existing > num_images:
            logger.warning(
                f"プロンプトに @image_{max_existing} がありますが num_images={num_images} です。"
                "PiAPI validation が失敗する可能性があります。"
            )
        return prompt  # ユーザー記述尊重

    tags = " ".join(f"@image_{i}" for i in range(1, num_images + 1))

    if not stripped:
        return tags  # 空 prompt → 頭空白なしで tags のみ

    return f"{stripped} {tags}"
```

## 完了条件 (AC)

- [x] `grep -n "_inject_image_references_into_prompt\|_IMAGE_REF_PATTERN" movie-maker-api/app/external/piapi_kling_provider.py` で関数と定数が確認できる
- [x] B3 エッジケース — 空プロンプト確認:
  ```bash
  cd movie-maker-api
  python -c "
  from app.external.piapi_kling_provider import _inject_image_references_into_prompt
  assert _inject_image_references_into_prompt('', 3) == '@image_1 @image_2 @image_3', 'empty prompt FAIL'
  print('empty prompt PASS')
  "
  ```
- [x] B3 エッジケース — `@image_K > num_images` 警告確認 (関数は prompt をそのまま返し、WARNING ログが出る):
  ```bash
  python -c "
  import logging; logging.basicConfig(level=logging.WARNING)
  from app.external.piapi_kling_provider import _inject_image_references_into_prompt
  result = _inject_image_references_into_prompt('@image_5 walks', 3)
  assert result == '@image_5 walks', f'expected unchanged, got {result!r}'
  print('K>num_images PASS')
  " 2>&1
  # WARNING ログに 'PiAPI validation が失敗する可能性' が含まれること
  ```
- [x] 既存 `@image_1` あり — 付加しない確認:
  ```bash
  python -c "
  from app.external.piapi_kling_provider import _inject_image_references_into_prompt
  result = _inject_image_references_into_prompt('@image_1 walks', 2)
  assert result == '@image_1 walks', f'FAIL: {result!r}'
  print('existing tag PASS')
  "
  ```
- [x] 末尾余分な空白 — rstrip 確認:
  ```bash
  python -c "
  from app.external.piapi_kling_provider import _inject_image_references_into_prompt
  result = _inject_image_references_into_prompt('A cat   ', 2)
  assert result == 'A cat @image_1 @image_2', f'FAIL: {result!r}'
  print('rstrip PASS')
  "
  ```
- [x] `pytest movie-maker-api/` が新たに失敗しない

## テスト

TDD: T1-7 で正式ユニットテストを実装するが、本タスク内でも上記 AC の手動検証を行う。

```bash
cd movie-maker-api
python -c "
from app.external.piapi_kling_provider import _inject_image_references_into_prompt
# ケース 1: num_images=0 → no-op
assert _inject_image_references_into_prompt('A cat', 0) == 'A cat'
# ケース 2: 1枚
assert _inject_image_references_into_prompt('A cat', 1) == 'A cat @image_1'
# ケース 3: 4枚
assert _inject_image_references_into_prompt('A cat', 4) == 'A cat @image_1 @image_2 @image_3 @image_4'
# ケース 4: 既存 @image_1
assert _inject_image_references_into_prompt('@image_1 walks', 2) == '@image_1 walks'
# ケース 5: rstrip
assert _inject_image_references_into_prompt('A cat   ', 2) == 'A cat @image_1 @image_2'
print('ALL PASS')
"
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §6-1: `_inject_image_references_into_prompt` ヘルパー関数の定義 (全エッジケース定義)
- Design Doc §14: リスク — `@image_i` の番号と `input.images` 配列の順序ズレ
- `movie-maker-api/app/external/piapi_kling_provider.py` L206-212 (挿入位置)
