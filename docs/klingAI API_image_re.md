# klingAI API 複数画像対応システム改修ガイド (for AI)

## 1. 目的 (Objective)

現在、klingAIの`Image to Video` API（単一画像入力）を使用しているシステムを、`Multi-Image to Video` API（最大4枚の画像入力）を使用するように改修する。

## 2. 改修概要 (Summary of Changes)

| 項目 | 変更前 (Current) | 変更後 (Target) |
| :--- | :--- | :--- |
| **APIエンドポイント** | `/v1/videos/image2video` | `/v1/videos/multi-image2video` |
| **画像パラメータ** | `image: "image_url_or_base64"` | `image_list: [{"image": "url_1"}, {"image": "url_2"}, ...]` |
| **主要モデル** | `kling-v1` 等 | `kling-v1-6` |
| **入力形式** | 単一の画像URLまたはBase64文字列 | 画像オブジェクトの配列（最大4つ） |

## 3. 実装ステップ (Implementation Steps)

1.  **APIコール関数の特定:**
    -   klingAI APIへのリクエストを送信している既存の関数またはコードブロックを特定する。
    -   `requests.post` や `fetch` などで `https://.../v1/videos/image2video` を呼び出している箇所が対象となる。

2.  **エンドポイントURLの更新:**
    -   APIリクエストURLを以下の通り変更する。
        -   **変更前:** `https://api-singapore.klingai.com/v1/videos/image2video`
        -   **変更後:** `https://api-singapore.klingai.com/v1/videos/multi-image2video`

3.  **リクエストペイロードの構造変更:**
    -   APIに送信するJSONペイロードの構造を、単一画像用から複数画像用に変更する。
    -   詳細は以下の「4. データ構造の変更点」を参照。

4.  **入力処理の修正:**
    -   システムがユーザーから受け取る画像入力を、単一の画像から画像のリスト（配列）に変更する。
    -   このリストを元に、ステップ3で定義した新しいペイロード構造を動的に生成する。

5.  **パラメータの確認と調整:**
    -   `model_name` を `kling-v1-6` に指定することを推奨する。
    -   `duration` や `mode: "pro"` などのパラメータは、新しいエンドポイントでも同様に利用可能。

## 4. データ構造の変更点 (Data Structure Changes)

### 変更前: `image2video` ペイロード

```json
{
  "model_name": "kling-v1",
  "image": "https://example.com/single_image.jpg",
  "prompt": "A person is walking.",
  "mode": "pro",
  "duration": "5"
}
```

### 変更後: `multi-image2video` ペイロード

```json
{
  "model_name": "kling-v1-6",
  "image_list": [
    { "image": "https://example.com/image_frame_1.jpg" },
    { "image": "https://example.com/image_frame_2.jpg" },
    { "image": "https://example.com/image_frame_3.jpg" },
    { "image": "https://example.com/image_frame_4.jpg" }
  ],
  "prompt": "A person is walking gracefully.",
  "mode": "pro",
  "duration": "10",
  "aspect_ratio": "16:9"
}
```

## 5. Python実装リファレンス (Python Implementation Reference)

以下は、改修後のPython関数の実装例である。この構造を参考に既存コードを修正する。

```python
import requests

def generate_video_from_multiple_images(api_key: str, image_urls: list[str], prompt: str) -> str | None:
    """
    klingAIのMulti-Image to Video APIを呼び出し、動画生成タスクを開始する。

    Args:
        api_key: klingAIのAPIキー。
        image_urls: 入力する画像URLのリスト（1〜4枚）。
        prompt: 動画生成のプロンプト。

    Returns:
        成功した場合はタスクID、失敗した場合はNone。
    """
    
    # 1. エンドポイントの更新
    endpoint_url = "https://api-singapore.klingai.com/v1/videos/multi-image2video"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # 2. ペイロード構造の変更
    # image_urlsリストからimage_listを構築
    if not 1 <= len(image_urls) <= 4:
        raise ValueError("Image count must be between 1 and 4.")
        
    image_list = [{"image": url} for url in image_urls]
    
    payload = {
        "model_name": "kling-v1-6",
        "image_list": image_list,
        "prompt": prompt,
        "mode": "pro",
        "duration": "10",
        "aspect_ratio": "16:9"
    }
    
    try:
        response = requests.post(endpoint_url, headers=headers, json=payload)
        response.raise_for_status()  # HTTPエラーがあれば例外を発生
        
        data = response.json()
        if data.get("code") == 0:
            task_id = data.get("data", {}).get("task_id")
            print(f"Task created successfully. Task ID: {task_id}")
            return task_id
        else:
            print(f"API Error: {data.get(\'message\')}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"HTTP Request failed: {e}")
        return None

# --- 使用例 ---
# api_key = "YOUR_KLING_API_KEY"
# list_of_images = [
#     "https://example.com/image1.jpg",
#     "https://example.com/image2.jpg"
# ]
# user_prompt = "A cat is running and jumping."

# task_id = generate_video_from_multiple_images(api_key, list_of_images, user_prompt)
# if task_id:
#     # 後続のタスクステータス確認処理へ
#     pass
```

## 6. 主要パラメータ定義 (`multi-image2video`)

| パラメータ | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `model_name` | string | - | モデル名。`kling-v1-6` を推奨。 |
| `image_list` | array | ✓ | 画像オブジェクトの配列。`[{"image": "url"}]` の形式。 |
| `prompt` | string | ✓ | ポジティブプロンプト。最大2500文字。 |
| `negative_prompt` | string | - | ネガティブプロンプト。最大2500文字。 |
| `mode` | string | - | `std` (標準) または `pro` (高品質)。 |
| `duration` | string | - | 動画長。`5` または `10` (秒)。 |
| `aspect_ratio` | string | - | `16:9`, `9:16`, `1:1`。 |
