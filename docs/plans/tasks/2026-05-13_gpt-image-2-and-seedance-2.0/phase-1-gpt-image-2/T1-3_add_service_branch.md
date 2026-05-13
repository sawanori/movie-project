---
id: T1-3
phase: 1
title: service.py への openai_gpt_image2 分岐追加
depends_on:
  - T1-2
estimated_effort: S
files_touched:
  - movie-maker-api/app/videos/service.py
---

## 目的

`generate_image_from_text()` 関数に `image_provider == "openai_gpt_image2"` の分岐を追加し、`OpenAIGPTImage2Provider` を呼び出すルーティングを有効にする。

## 前提

- T1-2 完了 (`OpenAIGPTImage2Provider` が存在する)
- `movie-maker-api/app/videos/service.py` の `generate_image_from_text()` 関数の構造を確認すること
- `bfl_flux2_pro` ブロック (line 886 付近) が参照パターン

## 変更内容

### `movie-maker-api/app/videos/service.py`

`generate_image_from_text()` 内の `if image_provider == "bfl_flux2_pro":` ブロックの**前**に以下を挿入する (Design Doc §3.3 のコードブロックをそのまま使用):

```python
# OpenAI GPT Image 2 プロバイダー
if image_provider == "openai_gpt_image2":
    from app.external.openai_gpt_image2_provider import OpenAIGPTImage2Provider

    # 1. 入力テキストを決定
    if free_text_description:
        prompt_ja = free_text_description
    elif structured_input:
        prompt_ja = _structured_input_to_text(structured_input)
    else:
        raise ValueError("プロンプトが指定されていません")

    # 2. 日本語→英語翻訳
    prompt_en = await _translate_text_to_english(prompt_ja)

    # 3. GPT Image 2 で画像生成（R2 URL が返る）
    provider = OpenAIGPTImage2Provider()
    image_url = await provider.generate_image(
        prompt=prompt_en,
        aspect_ratio=aspect_ratio,
    )

    # 4. R2 key の抽出（URLからパス部分を逆算）
    r2_key = image_url.split("/", 3)[-1] if "/" in image_url else f"generated/gpt2_{uuid4().hex}.png"

    logger.info(f"GPT Image 2 generation completed: {image_url}")
    return {
        "image_url": image_url,
        "generated_prompt_ja": prompt_ja,
        "generated_prompt_en": prompt_en,
        "r2_key": r2_key,
        "width": None,
        "height": None,
        "aspect_ratio": aspect_ratio,
        "image_provider": image_provider,
    }
```

挿入後に `bfl_flux2_pro` ブロックが続くことを確認する。

## 完了条件 (AC)

- [ ] `generate_image_from_text(image_provider="openai_gpt_image2", ...)` を呼ぶと `OpenAIGPTImage2Provider.generate_image()` が実行される
- [ ] 戻り値 dict のキーが `image_url`, `generated_prompt_ja`, `generated_prompt_en`, `r2_key`, `width`, `height`, `aspect_ratio`, `image_provider` を含む
- [ ] `bfl_flux2_pro` ブロックへの既存フローが壊れていない
- [ ] `pytest tests/videos/ -v` が PASS する (既知 2 件失敗を除く)

## テスト

既存の `tests/videos/test_text_to_image.py` のテストが引き続き PASS することを確認する。

新規テストは T1-4 で追加する。

## ロールバック

追加した `if image_provider == "openai_gpt_image2":` ブロックを削除する。

## 参照

- Design Doc §3.3 (`app/videos/service.py:886` 追記コード)
- Design Doc §2a (シーケンス図)
