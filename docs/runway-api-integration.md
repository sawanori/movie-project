# Runway API Integration Guide

KlingAI代替として Runway API を使用するための実装ガイド。

## 目次

1. [概要](#概要)
2. [認証・セットアップ](#認証セットアップ)
3. [APIエンドポイント](#apiエンドポイント)
4. [Image-to-Video 実装](#image-to-video-実装)
5. [カメラコントロール](#カメラコントロール)
6. [ベストプラクティス](#ベストプラクティス)
7. [移行計画](#移行計画)

---

## 概要

### 利用可能なモデル

| モデル | 用途 | 特徴 |
|--------|------|------|
| `gen4_turbo` | Image-to-Video | 高速、カメラ制御対応 |
| `gen3a_turbo` | Image-to-Video | 明示的カメラパラメータ対応 |
| `veo3.1` | Image/Text-to-Video | 高品質 |
| `veo3.1_fast` | Image/Text-to-Video | 高速版 |
| `gen4_image` | Text-to-Image | 参照画像対応 |

### KlingAIとの比較

| 機能 | KlingAI | Runway |
|------|---------|--------|
| Image-to-Video | ✅ | ✅ |
| カメラコントロール | API制限あり (pro + v1-5のみ) | promptTextで柔軟に指定 |
| 複数画像入力 | ✅ (multi-image2video) | ❌ (単一画像のみ) |
| 動画の長さ | 5-10秒 | 2-10秒 |
| アスペクト比 | 自由指定 | プリセット指定 |

---

## 認証・セットアップ

### 1. APIキー取得

1. [Runway Developer Portal](https://dev.runwayml.com) でアカウント作成
2. APIキーを取得
3. 環境変数に設定:

```bash
# .env
RUNWAY_API_KEY=your_api_key_here
```

### 2. SDK インストール

```bash
# Python
pip install runwayml

# Node.js
npm install --save @runwayml/sdk
```

### 3. 認証ヘッダー

```
Authorization: Bearer $RUNWAY_API_KEY
X-Runway-Version: 2024-11-06
```

---

## APIエンドポイント

### Image-to-Video

**POST** `/v1/image_to_video`

```python
import httpx

async def generate_video_runway(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "720:1280"  # 9:16 縦型
) -> str:
    """
    Runway API で画像から動画を生成

    Args:
        image_url: 入力画像URL
        prompt: 動画生成プロンプト（カメラ動作含む）
        duration: 動画長さ（2-10秒）
        ratio: アスペクト比

    Returns:
        task_id: タスクID
    """
    headers = {
        "Authorization": f"Bearer {RUNWAY_API_KEY}",
        "X-Runway-Version": "2024-11-06",
        "Content-Type": "application/json",
    }

    request_body = {
        "model": "gen4_turbo",
        "promptImage": image_url,
        "promptText": prompt,
        "duration": duration,
        "ratio": ratio,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.dev.runwayml.com/v1/image_to_video",
            headers=headers,
            json=request_body,
            timeout=60.0,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("id")
```

### タスク状態確認

**GET** `/v1/tasks/{id}`

```python
async def check_task_status(task_id: str) -> dict:
    """
    タスクの状態を確認

    Returns:
        dict: {
            "status": "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED",
            "output": ["video_url"] (成功時)
        }
    """
    headers = {
        "Authorization": f"Bearer {RUNWAY_API_KEY}",
        "X-Runway-Version": "2024-11-06",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.dev.runwayml.com/v1/tasks/{task_id}",
            headers=headers,
        )
        response.raise_for_status()
        return response.json()
```

### ステータス値

| Status | 説明 |
|--------|------|
| `PENDING` | 処理待ち |
| `RUNNING` | 処理中 |
| `SUCCEEDED` | 完了 |
| `FAILED` | 失敗 |
| `THROTTLED` | レート制限 |

**注意**: ポーリング間隔は最低5秒

---

## Image-to-Video 実装

### リクエストパラメータ

| パラメータ | 必須 | 型 | 説明 |
|-----------|------|-----|------|
| `model` | ✅ | string | `gen4_turbo`, `gen3a_turbo`, `veo3.1`等 |
| `promptImage` | ✅ | string | 画像URL (HTTPS, data URI, Runway URI) |
| `ratio` | ✅ | string | アスペクト比 (例: `720:1280`) |
| `promptText` | ❌ | string | プロンプト (最大1000文字) |
| `duration` | ❌ | int | 動画長さ (2-10秒) |
| `seed` | ❌ | int | 再現性用シード値 |

### アスペクト比プリセット

```python
ASPECT_RATIOS = {
    "9:16": "720:1280",   # 縦型ショート動画
    "16:9": "1280:720",   # 横型
    "1:1": "1024:1024",   # 正方形
    "4:3": "1024:768",    # 標準
    "3:4": "768:1024",    # 縦型標準
}
```

---

## カメラコントロール

### Gen-4 のカメラ制御

Gen-4では**promptText内でカメラ動作を指定**します。明示的なパラメータではなく、自然言語で指示。

### カメラ動作プロンプト例

| KlingAI カメラワーク | Runway promptText |
|---------------------|-------------------|
| `zoom_in` | `"slowly zoom in on the subject"` |
| `zoom_out` | `"camera zooms out to reveal the scene"` |
| `pan_left` | `"camera pans left across the scene"` |
| `pan_right` | `"camera pans right"` |
| `tilt_up` | `"camera tilts up to reveal"` |
| `tilt_down` | `"camera tilts down"` |
| `crane_up` | `"crane shot moving upward"` |
| `crane_down` | `"crane shot moving downward"` |
| `dolly_in` | `"dolly in toward the subject"` |
| `dolly_out` | `"dolly out from the subject"` |
| `orbit_left` | `"camera orbits left around subject"` |
| `orbit_right` | `"camera orbits right around subject"` |
| `tracking_shot` | `"tracking shot following the subject"` |
| `static` | `"static camera, locked shot"` |

### カメラプロンプト構築関数

```python
CAMERA_PROMPT_MAPPING = {
    "zoom_in": "slowly zoom in on the subject",
    "zoom_out": "camera zooms out to reveal the scene",
    "pan_left": "camera pans left across the scene",
    "pan_right": "camera pans right across the scene",
    "tilt_up": "camera tilts up",
    "tilt_down": "camera tilts down",
    "crane_up": "crane shot moving upward",
    "crane_down": "crane shot moving downward, looking down at subject",
    "dolly_in": "dolly in toward the subject",
    "dolly_out": "dolly out from the subject",
    "orbit_left": "camera orbits left around the subject",
    "orbit_right": "camera orbits right around the subject",
    "tracking": "tracking shot following the subject",
    "static": "static camera, locked shot",
    "handheld": "handheld camera with subtle movement",
}

def build_prompt_with_camera(
    base_prompt: str,
    camera_work: str | None = None
) -> str:
    """
    ベースプロンプトにカメラ動作を追加

    Args:
        base_prompt: 元のプロンプト
        camera_work: カメラワーク名

    Returns:
        カメラ指示を含むプロンプト
    """
    if not camera_work:
        return base_prompt

    camera_prompt = CAMERA_PROMPT_MAPPING.get(camera_work, "")
    if not camera_prompt:
        return base_prompt

    return f"{base_prompt}. Camera: {camera_prompt}."
```

### Gen-3 Alpha Turbo の明示的カメラ制御

Gen-3 Alpha Turboでは数値パラメータでカメラを制御可能:

- **6つの移動方向オプション**
- **Static Camera チェックボックス**
- **速度・強度の数値指定** (デフォルト0 = 非アクティブ)

---

## ベストプラクティス

### 1. プロンプト設計

```python
# ✅ 良い例: シンプルで明確
prompt = "A woman smiles and waves. Camera: gentle dolly in."

# ❌ 悪い例: 複数のカメラ動作を同時指定
prompt = "dolly + pan + tilt + rack focus"  # 混乱を招く
```

**原則**: 1つの動画に1つのカメラ動作

### 2. プロンプト構造

```
[主題の説明] + [アクション] + [Camera: カメラ動作]
```

例:
```
"A young man sits at a table looking melancholic at a stack of pancakes.
He sighs and pushes the plate away.
Camera: crane shot moving downward."
```

### 3. アイデンティティ保持

```python
IDENTITY_PREFIX = (
    "CRITICAL: Preserve exact identity of subject - "
    "same face, same hair, same clothing, same accessories. "
    "Only pose/expression can change. "
)

prompt = IDENTITY_PREFIX + user_prompt
```

### 4. エラーハンドリング

```python
async def generate_with_retry(
    image_url: str,
    prompt: str,
    max_retries: int = 3
) -> str | None:
    for attempt in range(max_retries):
        try:
            task_id = await generate_video_runway(image_url, prompt)
            return task_id
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                # レート制限: 指数バックオフ
                await asyncio.sleep(2 ** attempt)
            elif e.response.status_code >= 500:
                # サーバーエラー: リトライ
                await asyncio.sleep(5)
            else:
                raise
    return None
```

### 5. ポーリング間隔

```python
# 最低5秒間隔を守る
POLL_INTERVAL = 10  # 秒
MAX_ATTEMPTS = 60   # 10分タイムアウト

for attempt in range(MAX_ATTEMPTS):
    await asyncio.sleep(POLL_INTERVAL)
    status = await check_task_status(task_id)

    if status["status"] == "SUCCEEDED":
        return status["output"][0]
    elif status["status"] == "FAILED":
        raise Exception(f"Generation failed: {status}")
```

---

## 移行計画

### Phase 1: クライアント作成

```
app/external/runway_client.py
```

### Phase 2: 抽象化レイヤー

```python
# app/external/video_generator.py

from enum import Enum

class VideoProvider(Enum):
    KLING = "kling"
    RUNWAY = "runway"

async def generate_video(
    provider: VideoProvider,
    image_url: str,
    prompt: str,
    camera_work: str | None = None,
) -> str:
    if provider == VideoProvider.RUNWAY:
        return await runway_generate(image_url, prompt, camera_work)
    elif provider == VideoProvider.KLING:
        return await kling_generate(image_url, prompt, camera_work)
```

### Phase 3: 設定で切り替え

```python
# app/core/config.py

class Settings(BaseSettings):
    VIDEO_PROVIDER: str = "runway"  # or "kling"
```

### 実装ファイル構成

```
movie-maker-api/
├── app/
│   └── external/
│       ├── kling.py           # 既存
│       ├── runway_client.py   # 新規作成
│       └── video_generator.py # 抽象化レイヤー
```

---

## 料金比較

| 項目 | KlingAI | Runway |
|------|---------|--------|
| Standard 5秒 | ~$0.14 | ~$0.25 |
| Pro 5秒 | ~$0.35 | ~$0.50 |
| 課金単位 | 生成毎 | 秒数 |

---

## 参考リンク

- [Runway API Documentation](https://docs.dev.runwayml.com/)
- [Runway API Reference](https://docs.dev.runwayml.com/api/)
- [Runway Academy - Gen-4 Image to Video](https://academy.runwayml.com/gen4/gen4-image-to-video)
- [Gen-4 Prompting Guide](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide)

---

## 次のステップ

1. [ ] Runway Developer アカウント作成
2. [ ] APIキー取得・環境変数設定
3. [ ] `runway_client.py` 実装
4. [ ] カメラワークマッピング更新
5. [ ] 既存フローとの統合テスト
6. [ ] 本番切り替え
