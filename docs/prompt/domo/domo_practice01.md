# DomoAI Enterprise API 実装・運用バイブル

プロンプトエンジニアリングからシステム統合までの包括的ベストプラクティス

---

## 1. 序論：生成AI映像革命におけるDomoAIの独自性

### 1.1 DomoAIとDomo (BI) の決定的な相違点

現代のテクノロジーランドスケープにおいて、名称の類似性はしばしば重大な誤解を招く要因となる。

| 項目 | Domo (BI) | DomoAI |
|------|-----------|--------|
| **分野** | ビジネスインテリジェンス | 生成AI映像 |
| **目的** | データの集約・可視化・分析 | クリエイティブの自動化と拡張 |
| **API用途** | データエンジニアリング | 映像・画像生成 |
| **強み** | ダッシュボード自動生成 | アニメーション、物理演算シミュレーション |

**DomoAIの主要機能:**
- 静止画から動画への変換（Image-to-Video）
- テキストからの動画生成（Text-to-Video）
- 既存動画のスタイル変換（Video-to-Video）

### 1.2 動画生成APIのアーキテクチャ概要

DomoAI Enterprise APIは、**RESTfulな設計原則**に基づき、**非同期処理モデル**を採用している。

**基本フロー:**
1. 認証された状態でタスク生成エンドポイントにリクエスト送信
2. サーバーが即座に `task_id` を返却
3. バックグラウンドでGPUクラスターによるレンダリング開始
4. `task_id` を用いてステータス確認エンドポイントをポーリング
5. 処理完了時に生成された動画のURLを取得

---

## 2. 認証とセキュリティの包括的実装ガイド

### 2.1 APIキーのライフサイクル管理

APIキーは、**Organization（組織）単位**で発行され、**ベアラートークン（Bearer Token）方式**でHTTPヘッダーに含まれる。

> **重要:** 生成されたキーは生成直後の画面に一度だけ表示され、再表示は不可能。

**ベストプラクティス:**

| 対策 | 詳細 |
|------|------|
| **環境変数への隔離** | `.env`ファイルやシークレットマネージャーを使用 |
| **最小権限の原則** | プロジェクトごとに異なるAPIキーを発行 |
| **ローテーション計画** | 定期的なキーの無効化と再生成 |

### 2.2 HTTPヘッダー構成

```http
Content-Type: application/json
Authorization: Bearer <YOUR_API_KEY>
```

> **注意:** `Bearer` と APIキーの間には**必ず半角スペース**が必要。欠落すると `401 Unauthorized` エラーとなる。

---

## 3. APIエンドポイントの詳細仕様

### 3.1 Text-to-Video (T2V)

**エンドポイント:** `POST /v1/video/text2video`

#### 必須パラメータ

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `prompt` | string | 動画内容の記述（最大2000文字） |
| `model` | string | 使用モデル（`t2v-2.4-faster`, `t2v-2.4-advanced`） |
| `seconds` | integer | 動画の長さ（1〜10秒） |

#### オプションパラメータ

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `aspect_ratio` | enum | `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| `callback_url` | string | Webhook URL（最大2083文字） |

### 3.2 Image-to-Video (I2V)

**エンドポイント:** `POST /v1/video/image2video`

#### 画像入力の技術的要件

**サポートフォーマット:**
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- WebP (`image/webp`)
- AVIF (`image/avif`)

**Base64エンコーディング例（Python）:**

```python
import base64

with open("image.jpg", "rb") as image_file:
    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
```

### 3.3 Template-to-Video

**エンドポイント:** `POST /v1/video/template2video`

#### 利用可能なテンプレート

| テンプレートID | 効果 | ユースケース |
|---------------|------|-------------|
| `kissing_screen` | 画面に向かってキス | ファンサービス |
| `looping_animation` | ループ動画 | 背景動画、GIF |
| `hug` | ハグ動作 | 親愛表現 |
| `groove_dance` | リズミカルなダンス | エンターテインメント |
| `kiss`, `french_kiss` | キスアニメーション | ロマンスシーン |
| `360_view` | 360度回転 | 商品紹介 |
| `zoom_in` | ズームイン | 注目シーンの強調 |
| `zoom_out` | ズームアウト | 全体像の提示 |
| `crane_up` | クレーンアップ | 壮大なシーン演出 |

---

## 4. プロンプトエンジニアリングの深層

### 4.1 プロンプトの構造化と優先順位

プロンプトの**先頭にある単語ほど強く影響**を受ける特性がある。

**推奨構成:**

1. **Subject（主題）**: 映像の主役
   - 例: `A cyberpunk samurai`, `A cute cat`
2. **Action（動作）**: 何をしているか
   - 例: `drawing a katana`, `running in the rain`
3. **Environment（環境）**: 背景や場所
   - 例: `in a neon city`, `white background`
4. **Lighting & Atmosphere**: トーン
   - 例: `cinematic lighting`, `sunset`
5. **Style & Quality**: 画風・品質
   - 例: `anime style`, `4k`, `masterpiece`

### 4.2 Magic Words（品質向上修飾語）

**解像度・ディテール:**
```
4k, 8k, highly detailed, sharp focus, intricate details
```

**美的評価:**
```
masterpiece, best quality, award winning, trending on artstation
```

**照明効果:**
```
cinematic lighting, volumetric lighting, ray tracing, studio lighting
```

**カメラワーク:**
```
wide angle, close up, depth of field, bokeh
```

### 4.3 ネガティブプロンプト

**汎用ネガティブプロンプトセット:**

```
low quality, blurry, pixelated, low res, bad art, amateur, grainy,
distorted, watermark, text, logo, signature, copyright, extra fingers,
missing hands, ugly, bad proportions, extra limbs, disfigured,
deformed, bad anatomy, duplicate, multiple people
```

### 4.4 一貫性の維持

| テクニック | 説明 |
|-----------|------|
| **Seed値の固定** | 同じプロンプトから同じ初期ノイズを生成 |
| **スタイル指定の統一** | `Ghibli style`などを常に含める |
| **Image-to-Video活用** | Text-to-Videoより一貫性が高い |

---

## 5. エラーハンドリングと運用設計

### 5.1 HTTPステータスコードと対応策

| コード | 意味 | 対応策 |
|--------|------|--------|
| `200` | 成功 | `task_id`を保存してステータス確認へ |
| `400` | 不正リクエスト | パラメータ確認、バリデーション見直し |
| `401` | 認証失敗 | APIキー・ヘッダー形式を確認 |
| `402` | 支払い必要 | クレジット残高確認、プラン見直し |
| `403` | アクセス拒否 | 権限・IP制限を確認 |
| `429` | レート制限超過 | 指数バックオフでリトライ |
| `500` | サーバーエラー | 数秒待ってリトライ |
| `503` | サービス利用不可 | `Retry-After`ヘッダーに従う |

### 5.2 ポーリング戦略

- **初期間隔:** 3〜5秒
- **適応的ポーリング:** 時間経過で間隔を広げる（10秒、15秒...）
- **タイムアウト:** 5分経過で処理打ち切り

### 5.3 実装例（Python）

```python
import time
import base64
import requests
import os

# 設定
API_KEY = os.getenv("DOMOAI_API_KEY")
BASE_URL = "https://api.domoai.com/v1"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def encode_image(image_path):
    """画像をBase64エンコードする"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def create_task(endpoint, payload):
    """タスク作成リクエストを送信する"""
    url = f"{BASE_URL}{endpoint}"
    response = requests.post(url, json=payload, headers=HEADERS)
    response.raise_for_status()
    return response.json()['data']['task_id']

def wait_for_completion(task_id, timeout=300):
    """タスク完了までポーリングする"""
    url = f"{BASE_URL}/tasks/{task_id}"
    start_time = time.time()

    while time.time() - start_time < timeout:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        data = response.json()['data']
        status = data['status']

        print(f"Task {task_id} Status: {status}")

        if status == "SUCCESS":
            return data['output_videos'][0]['url']
        elif status == "FAILED":
            raise Exception(f"Task Failed: {data.get('error', 'Unknown')}")

        time.sleep(5)

    raise Exception("Task Timed Out")

# 使用例
def main():
    image_data = encode_image("input.jpg")
    payload = {
        "image": {"bytes_base64_encoded": image_data},
        "prompt": "A cyberpunk girl, neon lights, rain, high quality",
        "model": "animate-2.4-faster",
        "seconds": 5
    }

    task_id = create_task("/video/image2video", payload)
    print(f"Task Started: {task_id}")

    video_url = wait_for_completion(task_id)
    print(f"Video URL: {video_url}")

if __name__ == "__main__":
    main()
```

---

## 6. 運用コストとTier管理

### 6.1 Tierシステム

| Tier | 条件 | 1日あたり上限 | 最大月間利用額 |
|------|------|--------------|---------------|
| Tier 1 | デフォルト | 50回 | $100 |
| Tier 2 | $50利用の1日後 | 500回 | $500 |
| Tier 3 | $100利用の7日後 | 1,000回 | $2,000 |
| Tier 4 | $1,000利用の14日後 | 5,000回 | $20,000 |
| Tier 5 | $5,000利用の7日後 | 25,000回 | $100,000 |

### 6.2 料金プラン

| プラン | 月額 | クレジット |
|--------|------|-----------|
| Basic | $9.99 | 500 |
| Standard | $19.99 | 1,200 |
| Pro | $49.99 | 3,000 |

**クレジット消費目安:**
- 画像生成: 約1クレジット/枚
- 動画生成（Fast Mode）: 約15〜20クレジット/本（5秒）

---

## 7. 競合比較

| 特徴 | DomoAI | Midjourney | Runway | Pika |
|------|--------|------------|--------|------|
| **得意分野** | アニメスタイル変換 | 静止画の芸術性 | リアルな実写映像 | アニメーション |
| **API提供** | あり | なし | あり | あり |
| **I2V性能** | 非常に高い | - | 高い | 高い |

**DomoAIを選ぶ理由:**
- アニメ調動画の生成に特化
- 既存キャラクター画像の動画化が得意
- 公式Enterprise APIによるビジネス統合が容易

---

## 8. 結論

DomoAI Enterprise API活用の成功の鍵は以下の3点:

1. **プロンプトエンジニアリングの習熟**
   - 英語による構造的な記述
   - Magic Wordsの活用
   - ネガティブプロンプトによる品質管理

2. **堅牢なシステム設計**
   - 非同期処理の理解
   - 適切なポーリング実装
   - Tierシステムを考慮したスケーラビリティ

3. **適材適所のモデル選定**
   - Faster vs Advancedの使い分け
   - コストと品質のバランス

---

*最終更新: 2026年1月3日*
