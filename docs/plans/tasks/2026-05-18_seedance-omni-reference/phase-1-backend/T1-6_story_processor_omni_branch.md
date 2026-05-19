---
id: T1-6
phase: 1
title: story_processor omni 分岐 (snapshot URL 取得 + Provider 呼出)
depends_on: [T1-7, T1-5]
parallel_with: []
estimated_effort: M
files_touched:
  - movie-maker-api/app/tasks/story_processor.py
  - movie-maker-api/tests/tasks/test_story_processor.py
wave: 4
agent: backend
---

## 目的

v3 計画書 §6.5 に従い、`story_processor.py` に omni 分岐を追加。DB から `image/video/audio_reference_urls` snapshot を取得し、いずれかが非空なら `generate_video_with_omni_references()` を呼出。base `image_url` を `image_urls` の先頭に統合。既存 i2v / t2v 経路は完全互換。

## 前提

- 依存タスク:
  - T1-7 (Router で snapshot 列を保存している)
  - T1-5 (Provider メソッド存在)
- 並列実行可: なし (Wave 4 単独)
- 参照箇所: `movie-maker-api/app/tasks/story_processor.py:115-205`

## 変更内容

### `movie-maker-api/app/tasks/story_processor.py`

既存 provider 分岐 (seedance) 部分を拡張:

```python
# DB から snapshot URL 取得
image_reference_urls = video_data.get("image_reference_urls") or []
video_reference_urls = video_data.get("video_reference_urls") or []
audio_reference_urls = video_data.get("audio_reference_urls") or []

elif provider_name == "seedance":
    if image_reference_urls or video_reference_urls or audio_reference_urls:
        # base image_url を image_urls 先頭に統合
        all_image_urls = (
            ([image_url] if image_url else [])
            + image_reference_urls
        )
        task_id = await provider.generate_video_with_omni_references(
            prompt=prompt,
            duration=duration,
            aspect_ratio=aspect_ratio,
            mode=seedance_mode,
            image_urls=all_image_urls,
            video_urls=video_reference_urls,
            audio_urls=audio_reference_urls,
        )
    else:
        # 既存 i2v 経路 (変更なし)
        task_id = await provider.generate_video(
            prompt=prompt, image_url=image_url, ...
        )
```

エラーハンドリング: `VideoProviderError` (VIP 違反など) は既存パターン通り `video_generations.status='failed'` + `error_message` 設定。

### `tests/tasks/test_story_processor.py` 拡張

v3 §15.1 から B-27, B-28, B-28b を追加。

| # | テスト |
|---|--------|
| B-27 | video_reference_urls=[v] → generate_video_with_omni_references 呼出 |
| B-28 | 全 reference NULL → 既存 generate_video 呼出 (回帰) |
| B-28b | image_url + image_reference_urls=[i2,i3] → omni 呼出時 image_urls=[image_url, i2, i3] 順序保持 |

## 完了条件 (AC)

- [x] omni 分岐実装済
- [x] base image_url + reference urls の順序保持マージ実装済
- [x] `pytest tests/tasks/test_story_processor.py -v` 全 pass (新 3 件 + 既存)
- [x] 既存 i2v / t2v 経路は回帰なし (B-28 が GREEN)
- [x] AC-5, AC-8, AC-10 を E2E パスでカバー可能な状態

## ロールバック

分岐コードと新規 test ケース削除。

## 参照

- v3 計画書 §6.5 (Story Processor 拡張)
- v3 計画書 §15.1 (B-27, B-28, B-28b)
- v3 計画書 AC-5, AC-10
