---
id: T1-7
phase: 1
title: Backend 単体テスト追加 (helper 5 ケース + I2V 1 ケース + T2V 1 ケース)
depends_on:
  - T1-3
  - T1-4
  - T1-5
  - T1-6
estimated_effort: M
files_touched:
  - movie-maker-api/tests/external/test_piapi_kling_provider.py
---

## 目的

Design Doc §10-1 で定義された 3 種類のテストを実装する。

1. `test_inject_image_references_into_prompt` — ヘルパー関数の 5 ケース (B3 全エッジケース含む)
2. `test_generate_video_omni_with_elements` — I2V 経路: prompt 付加 + service_mode + images 配列
3. `test_generate_video_from_text_omni_includes_service_mode` — T2V 経路: service_mode のみ + images 不在

## 前提

- T1-3〜T1-6 が全て完了済み
- テストファイルが存在しない場合は新規作成。既存の場合は追記
- `pytest-asyncio` と `pytest-mock` が利用可能であることを確認: `pip show pytest-asyncio pytest-mock`
- テストファイルパス: `movie-maker-api/tests/external/test_piapi_kling_provider.py`

## 変更内容

### テストファイルの内容

```python
"""PiAPI Kling Provider テスト — Kling 3.0 Omni Elements 対応"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ========== Test: _inject_image_references_into_prompt ==========

from app.external.piapi_kling_provider import _inject_image_references_into_prompt


class TestInjectImageReferencesIntoPrompt:
    """Design Doc §10-1-1: 5 ケース (B3 全エッジケース)"""

    def test_num_images_zero_returns_prompt_unchanged(self):
        """ケース 1: 画像 0 枚 → no-op"""
        assert _inject_image_references_into_prompt("A cat", 0) == "A cat"

    def test_one_image_appends_image_1(self):
        """ケース 2: 画像 1 枚 → @image_1 を付加"""
        assert _inject_image_references_into_prompt("A cat", 1) == "A cat @image_1"

    def test_four_images_appends_all_tags(self):
        """ケース 3: 画像 4 枚 (上限) → @image_1〜@image_4 を付加"""
        result = _inject_image_references_into_prompt("A cat", 4)
        assert result == "A cat @image_1 @image_2 @image_3 @image_4"

    def test_existing_image_ref_not_duplicated(self):
        """ケース 4 (B3): prompt に既に @image_1 があれば付加しない"""
        result = _inject_image_references_into_prompt("@image_1 walks", 2)
        assert result == "@image_1 walks"

    def test_trailing_whitespace_stripped_before_append(self):
        """ケース 5 (B3): 末尾余分な空白は rstrip してから付加"""
        result = _inject_image_references_into_prompt("A cat   ", 2)
        assert result == "A cat @image_1 @image_2"

    def test_empty_prompt_returns_tags_only(self):
        """B3 エッジケース: 空 prompt → 頭空白なしで tags のみ"""
        result = _inject_image_references_into_prompt("", 3)
        assert result == "@image_1 @image_2 @image_3"

    def test_image_ref_exceeds_num_images_emits_warning(self, caplog):
        """B3 エッジケース: @image_K > num_images → prompt そのまま + WARNING ログ"""
        import logging
        with caplog.at_level(logging.WARNING, logger="app.external.piapi_kling_provider"):
            result = _inject_image_references_into_prompt("@image_5 walks", 3)
        assert result == "@image_5 walks"
        assert any("PiAPI validation" in r.message for r in caplog.records), \
            "WARNING ログが出力されていない"


# ========== Test: generate_video (I2V, 3.0 Omni) ==========

@pytest.mark.asyncio
async def test_generate_video_omni_with_elements(mocker):
    """Design Doc §10-1-2: 3.0 Omni I2V 経路 — Elements 送信時の検証

    - config.service_mode: "public" が付与される
    - input.images に element_images が格納される
    - input.prompt に @image_1 @image_2 @image_3 が自動付加される
    """
    # Arrange
    mocker.patch.dict(
        "os.environ",
        {"PIAPI_API_KEY": "test-key", "PIAPI_KLING_VERSION": "3.0"},
    )

    captured_body = {}

    async def mock_post(url, **kwargs):
        captured_body.update(kwargs.get("json", {}))
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"data": {"task_id": "T-123"}}
        return mock_resp

    mocker.patch("httpx.AsyncClient.post", new=mock_post)

    from app.external.piapi_kling_provider import PiAPIKlingProvider
    from app.core.config import settings
    # バージョンを強制設定
    original_version = settings.PIAPI_KLING_VERSION
    settings.PIAPI_KLING_VERSION = "3.0"

    try:
        provider = PiAPIKlingProvider()
        provider.version = "3.0"

        task_id = await provider.generate_video(
            image_url="https://example.com/ignored.jpg",
            prompt="走る犬",
            element_images=["u1", "u2", "u3"],
            duration=5,
            aspect_ratio="9:16",
        )
    finally:
        settings.PIAPI_KLING_VERSION = original_version

    # Assert
    assert task_id == "T-123"
    assert captured_body["task_type"] == "omni_video_generation"
    assert captured_body["input"]["prompt"] == "走る犬 @image_1 @image_2 @image_3"
    assert captured_body["input"]["images"] == ["u1", "u2", "u3"]
    assert captured_body["config"]["service_mode"] == "public"


# ========== Test: generate_video_from_text (T2V, 3.0 Omni) ==========

@pytest.mark.asyncio
async def test_generate_video_from_text_omni_includes_service_mode(mocker):
    """Design Doc §10-1-3: T2V 3.0 Omni 経路 — service_mode 付与 + images 不在の検証"""
    captured_body = {}

    async def mock_post(url, **kwargs):
        captured_body.update(kwargs.get("json", {}))
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"data": {"task_id": "T-456"}}
        return mock_resp

    mocker.patch("httpx.AsyncClient.post", new=mock_post)
    mocker.patch.dict("os.environ", {"PIAPI_API_KEY": "test-key"})

    from app.external.piapi_kling_provider import PiAPIKlingProvider
    from app.core.config import settings
    original_version = settings.PIAPI_KLING_VERSION
    settings.PIAPI_KLING_VERSION = "3.0"

    try:
        provider = PiAPIKlingProvider()
        provider.version = "3.0"

        task_id = await provider.generate_video_from_text(
            prompt="走る犬",
            duration=5,
            aspect_ratio="9:16",
        )
    finally:
        settings.PIAPI_KLING_VERSION = original_version

    # Assert
    assert task_id == "T-456"
    assert captured_body["task_type"] == "omni_video_generation"
    assert captured_body["config"]["service_mode"] == "public"
    assert "images" not in captured_body["input"], \
        "T2V 経路には images キーが存在してはならない"
```

## 完了条件 (AC)

- [x] `pytest movie-maker-api/tests/external/test_piapi_kling_provider.py -v` で全テストが **PASS**
- [x] B3 エッジケース — 空 prompt テストが PASS: `test_empty_prompt_returns_tags_only`
- [x] B3 エッジケース — `@image_K > num_images` 警告テストが PASS: `test_image_ref_exceeds_num_images_emits_warning`
- [x] `test_generate_video_omni_with_elements` で以下 3 点が全て検証済み:
  - `captured_body["input"]["prompt"] == "走る犬 @image_1 @image_2 @image_3"` (自動付加確認)
  - `captured_body["config"]["service_mode"] == "public"` (service_mode 確認)
  - `captured_body["input"]["images"] == ["u1", "u2", "u3"]` (images 配列確認)
- [x] `test_generate_video_from_text_omni_includes_service_mode` で `"images" not in captured_body["input"]` が確認済み
- [x] `pytest movie-maker-api/ -q` 全体で既存テストの PASS が維持されている (リグレッションなし)

## テスト実行コマンド

```bash
cd movie-maker-api
# 対象テストのみ
pytest tests/external/test_piapi_kling_provider.py -v

# 全体リグレッション確認
pytest -q --tb=short 2>&1 | tail -15
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §10-1: Backend テスト計画 (全 3 テストの仕様)
- Design Doc §10-1-1: `test_inject_image_references_into_prompt` 5 ケース
- Design Doc §10-1-2: `test_generate_video_omni_with_elements`
- Design Doc §10-1-3: `test_generate_video_from_text_omni_includes_service_mode`
- T1-3: `_inject_image_references_into_prompt` ヘルパー (テスト対象)
- T1-4: I2V 3.0 Omni 経路 (テスト対象)
- T1-5: T2V 3.0 Omni 経路 (テスト対象)
