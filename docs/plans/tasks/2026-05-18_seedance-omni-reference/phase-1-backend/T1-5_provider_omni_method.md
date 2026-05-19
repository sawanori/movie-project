---
id: T1-5
phase: 1
title: PiAPISeedanceProvider.generate_video_with_omni_references() + tests
depends_on: [T1-1]
parallel_with: [T1-3, T1-17a]
estimated_effort: M
files_touched:
  - movie-maker-api/app/external/piapi_seedance_provider.py
  - movie-maker-api/tests/external/test_piapi_seedance_omni_reference.py
wave: 2
agent: backend
---

## 目的

v3 計画書 §6.1 / §6.2 に従い、`PiAPISeedanceProvider` に新規メソッド `generate_video_with_omni_references()` を追加。VIP 必須チェック、各個別上限 (image≤9, video≤3, audio≤3) validate、`input.{image_urls, video_urls, audio_urls}` payload 構築。**`input.mode` は送信しない**、**task_type は既存をそのまま使用**。

## 前提

- 依存タスク: T1-1 (DB schema、本実装は DB アクセスなしだが Phase 完了制約)
- 並列実行可: T1-3, T1-17a
- 参照箇所: `movie-maker-api/app/external/piapi_seedance_provider.py` 既存実装

## 変更内容

### `movie-maker-api/app/external/piapi_seedance_provider.py`

#### 定数追加

```python
MAX_IMAGE_URLS = 9
MAX_VIDEO_URLS = 3
MAX_AUDIO_URLS = 3
MAX_VIDEO_TOTAL_SECONDS = 15.4
MAX_AUDIO_TOTAL_SECONDS = 15.0  # v3: PiAPI 公式 spec (合計)
```

#### 新規メソッド

```python
async def generate_video_with_omni_references(
    self,
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    mode: Optional[str] = None,
    image_urls: Optional[list[str]] = None,
    video_urls: Optional[list[str]] = None,
    audio_urls: Optional[list[str]] = None,
) -> str:
    task_type = self._resolve_task_type(mode)
    if not task_type.endswith("-vip"):
        raise VideoProviderError(
            "omni_reference 用途は VIP モデル必須です "
            "(PIAPI_SEEDANCE_TASK_TYPE に -vip suffix 必須)"
        )

    image_urls = image_urls or []
    video_urls = video_urls or []
    audio_urls = audio_urls or []

    if len(image_urls) > MAX_IMAGE_URLS:
        raise VideoProviderError(f"image_urls は最大 {MAX_IMAGE_URLS} 個")
    if len(video_urls) > MAX_VIDEO_URLS:
        raise VideoProviderError(f"video_urls は最大 {MAX_VIDEO_URLS} 個")
    if len(audio_urls) > MAX_AUDIO_URLS:
        raise VideoProviderError(f"audio_urls は最大 {MAX_AUDIO_URLS} 個")

    # 防御コード (Router で事前検証済)
    if not image_urls and not video_urls and audio_urls:
        raise VideoProviderError("audio_urls 単独不可。image_urls か video_urls が必要 (防御)")
    if not image_urls and not video_urls and not audio_urls:
        raise VideoProviderError("参照素材を 1 つ以上指定 (防御)")

    input_payload: dict = {
        "prompt": prompt[:4000],
        "duration": int(duration),
        "aspect_ratio": aspect_ratio,
        "resolution": self.resolution,
    }
    if image_urls:
        input_payload["image_urls"] = image_urls
    if video_urls:
        input_payload["video_urls"] = video_urls
    if audio_urls:
        input_payload["audio_urls"] = audio_urls
    # input.mode は送信しない (preview 系統不要)

    payload = {
        "model": "seedance",
        "task_type": task_type,
        "input": input_payload,
        "config": {"service_mode": "public"},
    }
    return await self._post_task(payload)
```

`_post_task()` ヘルパーが未存在の場合は既存 `generate_video()` から共通化抽出 (Refactor フェーズ)。

### 新規テスト: `tests/external/test_piapi_seedance_omni_reference.py`

v3 計画書 §15.1 から B-1〜B-12, B-29〜B-31 を実装。

| # | テスト | 種別 |
|---|--------|------|
| B-1 | image + video → image_urls/video_urls 送信 | httpx mock |
| B-2 | audio + image → audio_urls/image_urls 送信 | httpx mock |
| B-3 | 3 種 mix | httpx mock |
| B-4 | mode=None → task_type=`seedance-2-preview-vip` | httpx mock |
| B-5 | mode='fast' → task_type=`seedance-2-fast-preview-vip` | httpx mock |
| B-6 | env 非 VIP → VideoProviderError | unit |
| B-7 | 全 0 個 → VideoProviderError | unit |
| B-9 | audio のみ → VideoProviderError (防御) | unit |
| B-10 | image=[] + video=[v] → OK | httpx mock |
| B-11 | prompt 4001 文字 → 4000 切詰 | httpx mock |
| B-12 | duration=15 → input.duration=15 | httpx mock |
| B-29 | 契約: input に image_urls/video_urls/audio_urls キー | httpx mock |
| B-30 | 契約: input に mode キー無し | httpx mock |
| B-31 | 契約: task_type 既存通り | httpx mock |

## 完了条件 (AC)

- [x] `generate_video_with_omni_references` メソッドが存在
- [x] 上限定数 5 個が定義済 (`MAX_*`)
- [x] `pytest tests/external/test_piapi_seedance_omni_reference.py -v` 全 pass (17 件)
- [x] 既存 `generate_video` / `generate_video_from_text` シグネチャ不変
- [x] 既存テスト 764+ 件への回帰なし
- [x] payload に `input.mode` が含まれないことが B-30 で確認

## ロールバック

追加メソッド / 定数 / テストファイル削除。`_post_task` 抽出していれば revert。

## 参照

- v3 計画書 §6.1, §6.2 (Provider 仕様)
- v3 計画書 §15.1 (テスト B-1〜B-12, B-29〜B-31)
- v3 計画書 AC-5, AC-8
