---
id: T1-4
phase: 1
title: 3.0 Omni I2V 経路に @image_i 付加と config.service_mode 追加
depends_on:
  - T1-3
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/piapi_kling_provider.py
---

## 目的

`generate_video` メソッドの 3.0 Omni 経路 (L376-407) を修正し、以下を実現する。

1. `_inject_image_references_into_prompt` を呼び出してプロンプト末尾に `@image_i` を自動付加
2. `config: {"service_mode": "public"}` ブロックを request body に追加

Design Doc §6-2 の「修正後」diff を適用する。

## 前提

- T1-3 完了済み (`_inject_image_references_into_prompt` が利用可能)
- 変更範囲は **`if self.version.startswith("3"):` ブランチの内側のみ**。L409 以降の else ブランチには触れない

## 変更内容

`piapi_kling_provider.py` の I2V `generate_video` 内、3.0 Omni ブランチ (L376-408) を以下のように変更する。

```python
if self.version.startswith("3"):
    # === 3.0 Omni ===
    # images 配列に変換
    if element_images and len(element_images) > 0:
        images_for_request = element_images[:4]
    else:
        images_for_request = [image_url]

    # ▼ NEW: プロンプトに @image_i を自動付加 (既存記載がある場合はスキップ)
    effective_prompt = _inject_image_references_into_prompt(
        prompt,
        len(images_for_request),
    )

    request_body = {
        "model": "kling",
        "task_type": "omni_video_generation",
        "input": {
            "prompt": effective_prompt,          # ← NEW: effective_prompt を使用
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "version": "3.0",
            "resolution": self.resolution,
            "enable_audio": self.enable_audio,
            "images": images_for_request,        # ← NEW: 上で組み立てた配列を使う
        },
        # ▼ NEW: 公式サンプルに合わせ service_mode を明示
        "config": {
            "service_mode": "public",
        },
    }

    # 3.0 非対応パラメータのログ警告 (既存ロジック維持)
    if camera_work or camera_control:
        logger.warning("Kling 3.0 does not support camera_control. Ignoring.")
    if image_tail_url:
        logger.warning("Kling 3.0 does not support image_tail_url. Ignoring.")
    if mode:
        logger.warning("Kling 3.0 does not support mode (std/pro). Ignoring.")

    logger.info(f"PiAPI Kling request body: {json.dumps(request_body, indent=2)}")
    logger.info(
        f"PiAPI Kling request: version={self.version}, "
        f"resolution={self.resolution}, enable_audio={self.enable_audio}, "
        f"aspect_ratio={aspect_ratio}, num_images={len(images_for_request)}"
    )
```

**差分ポイント**:
- `prompt` → `effective_prompt` (ヘルパー経由)
- `request_body["input"]["images"]` を `images_for_request` に統一 (既存の `element_images[:4]` / `[image_url]` ロジックを変数化)
- `request_body` に `"config": {"service_mode": "public"}` を追加

## 完了条件 (AC)

- [x] `grep -n "service_mode" movie-maker-api/app/external/piapi_kling_provider.py` で I2V 経路の `config.service_mode` が確認できる
- [x] `grep -n "_inject_image_references_into_prompt" movie-maker-api/app/external/piapi_kling_provider.py` で呼び出し箇所が確認できる
- [x] `grep -n "effective_prompt" movie-maker-api/app/external/piapi_kling_provider.py` で I2V 経路での使用が確認できる
- [x] `pytest movie-maker-api/` が新たに失敗しない (後方互換性維持)
- [x] element_images なし時 (`images_for_request = [image_url]`) で `_inject_image_references_into_prompt` に `num_images=1` が渡り `@image_1` が付加されること (手動確認 or T1-7 で検証)

## テスト

正式テストは T1-7 で実施。この時点で基本的な動作確認を行う。

```bash
cd movie-maker-api
pytest -q --tb=short 2>&1 | tail -10
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §6-2: 3.0 Omni 経路への差分 (擬似 diff)
- Design Doc §3-2: 修正前後の request body 差分
- `movie-maker-api/app/external/piapi_kling_provider.py` L376-407 (変更対象)
- T1-3: `_inject_image_references_into_prompt` ヘルパー (依存タスク)
