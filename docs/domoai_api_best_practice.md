# DomoAI API 実装における網羅的ベストプラクティス

## 1. はじめに

このドキュメントは、DomoAI Enterprise APIを効果的かつ安全に実装するためのベストプラクティスを網羅的に解説するものです。認証、エラーハンドリング、パフォーマンス最適化、コスト管理など、開発のライフサイクル全体を通じて考慮すべき重要な指針を提供します。

## 2. 認証とセキュリティ

APIキーは、アプリケーションのアイデンティティであり、最も重要な認証情報です。その管理には最大限の注意を払う必要があります。

### 2.1. APIキーの安全な保管

- **サーバーサイドでの保管**: APIキーは、**絶対にクライアントサイド（ブラウザ、モバイルアプリなど）のコードにハードコーディングしないでください**。必ずサーバーサイドの環境変数や、AWS Secrets Manager、Google Cloud Secret Manager、HashiCorp Vaultなどの専用シークレット管理サービスに保管してください。

- **アクセス制御**: APIキーへのアクセスは、必要最小限の権限を持つサーバープロセスや開発者に限定してください。本番環境のキーにアクセスできる担当者を制限することが重要です。

### 2.2. 定期的なキーのローテーション

- **定期的な再発行**: 万が一の漏洩に備え、APIキーを定期的に（例: 90日ごと）ローテーション（無効化と再発行）する運用を検討してください。DomoAIのダッシュボードから新しいキーを生成し、古いキーを削除します。

### 2.3. 通信の暗号化

- **HTTPSの強制**: DomoAI APIへのリクエストは、常にHTTPS経由で行う必要があります。これにより、通信経路でのデータの盗聴や改ざんを防ぎます。

## 3. APIワークフローとタスク管理

DomoAI APIは非同期で動作するため、効率的なタスク管理ワークフローの構築が不可欠です。

### 3.1. 非同期処理の実装

- **コールバックURLの活用**: ビデオ生成は数秒から数分かかる場合があるため、同期的に結果を待つ（ポーリング）のは非効率です。代わりに、ビデオ生成API（`text2video`, `image2video`, `template2video`）を呼び出す際に`callback_url`パラメータを指定し、非同期で結果を受け取ることを強く推奨します。

> **コールバックの利点**:
> - **リソース効率**: ポーリングによる不要なHTTPリクエストを削減し、サーバー負荷を軽減します。
> - **リアルタイム性**: タスク完了後、即座に通知を受け取ることができます。
> - **シンプルな実装**: 複雑なポーリングロジックや状態管理を簡素化できます。

- **Webhookエンドポイントの堅牢化**: コールバックを受け取るエンドポイントは、DomoAIからのリクエストを確実に処理できるように設計する必要があります。リクエストの検証（例: 署名検証、IPアドレス制限など）や、リクエストが集中した場合に備えたキューイングシステムの導入を検討してください。

### 3.2. タスクステータスの追跡

- **データベースでの状態管理**: 生成リクエスト時に返される`task_id`と、ユーザーIDやその他の関連情報をデータベースに保存し、タスクのライフサイクルを追跡できるようにします。コールバック受信時に、この`task_id`をキーにしてステータスを更新します。

- **フォールバックとしてのポーリング**: コールバックが何らかの理由で失敗した場合に備え、`GET /v1/tasks/{task_id}`エンドポイントを使用した限定的なポーリング（例: 指数バックオフ付きで数回リトライ）をフォールバック戦略として用意しておくと、システムの堅牢性が向上します。

## 4. エラーハンドリングと耐障害性

堅牢なアプリケーションを構築するためには、予期せぬエラーに適切に対処する仕組みが不可欠です。

### 4.1. HTTPステータスコードの適切な処理

DomoAI APIは標準的なHTTPステータスコードを返します。それぞれに応じた処理を実装してください。

| ステータスコード | 意味 | 推奨される対応 |
|---|---|---|
| `200 OK` | 成功 | レスポンスボディを処理します。 |
| `400 Bad Request` | リクエスト不正 | リクエストパラメータ（プロンプトの長さ、画像形式など）が仕様を満たしているか確認し、ユーザーに修正を促します。 |
| `401 Unauthorized` | 認証エラー | APIキーが正しいか、ヘッダーの形式が`Bearer <KEY>`になっているか確認します。 |
| `402 Payment Required` | 支払いエラー | アカウントのクレジット残高を確認し、必要に応じてチャージするようユーザーに通知します。 |
| `429 Too Many Requests` | レート制限超過 | アカウントのティアを確認し、リクエスト頻度を調整します。`Retry-After`ヘッダーが返される場合は、その指示に従います。 |
| `5xx Server Error` | サーバーエラー | 一時的な問題の可能性があるため、指数バックオフ（Exponential Backoff）を用いたリトライ処理を実装します。数回リトライしても失敗する場合は、エラーを記録し、ユーザーに通知します。 |

### 4.2. 指数バックオフによるリトライ

- **ネットワークエラーや5xxエラー**が発生した場合、即座にリトライするとサーバーに過剰な負荷をかける可能性があります。`1秒`, `2秒`, `4秒`, `8秒`... のように、リトライ間隔を指数関数的に増加させる**指数バックオフ**を実装してください。

## 5. パフォーマンスとコストの最適化

APIの利用はコストに直結するため、パフォーマンスとコストのバランスを考慮した設計が重要です。

### 5.1. モデルとパラメータの賢い選択

- **`faster` vs `advanced`**: `advanced`モデルは高品質ですが、`faster`モデルの2.5倍のクレジットを消費します。プロトタイピングやプレビュー用途では`faster`モデルを使用し、最終的な高品質な出力が必要な場合にのみ`advanced`モデルを選択するなど、ユースケースに応じた使い分けがコスト削減に繋がります。

- **動画の長さ**: 必要最小限の動画の長さを指定することで、クレジット消費を抑えることができます。

### 5.2. リクエストの重複防止

- **リクエストのキャッシュ**: ユーザーが短時間のうちに全く同じリクエストを複数回送信した場合、2回目以降は新規にAPIを呼び出すのではなく、最初のタスクの結果を返すようなキャッシュ機構を検討してください。これにより、不要なクレジット消費を防ぎます。

### 5.3. ティアレベルの監視

- **利用状況のモニタリング**: アプリケーションの利用が拡大し、頻繁にレート制限に達するようになった場合は、アカウントのティアを確認し、必要に応じてDomoAIサポートに連絡して上位ティアへの移行を検討してください。計画的なティア管理により、サービスの機会損失を防ぎます。

## 6. データ管理

生成されたコンテンツの管理も重要な要素です。

### 6.1. 生成されたビデオの永続化

- **自社ストレージへの保存**: APIから返されるビデオURLは**8時間で失効**します。生成されたビデオを永続的に利用する場合は、必ずダウンロードし、Amazon S3やGoogle Cloud Storageなどの自社のストレージソリューションに保存してください。その際、`task_id`やユーザーIDと紐付けて管理することを推奨します。

### 6.2. 入力データの管理

- **画像データの最適化**: `image2video` APIに送信する画像は、APIの要件（JPEG, PNGなど）を満たし、かつファイルサイズが大きすぎないように最適化してください。不要に大きな画像を送信すると、アップロード時間や処理時間に影響を与える可能性があります。

## 7. まとめ

DomoAI APIを効果的に実装するには、単にAPIを呼び出すだけでなく、セキュリティ、非同期ワークフロー、エラーハンドリング、コスト管理といった多角的な視点からの設計が不可欠です。このドキュメントで概説したベストプラクティスを実践することで、堅牢でスケーラブル、かつコスト効率の高いアプリケーションを構築することが可能になります。


---

## 付録A: 実装サンプルコード

以下に、ベストプラクティスを反映したPythonによる実装例を示します。

### A.1. 基本的なAPIクライアントクラス

```python
import os
import time
import base64
import requests
from typing import Optional, Dict, Any

class DomoAIClient:
    """
    DomoAI Enterprise API クライアント
    ベストプラクティスに基づいた実装例
    """
    
    BASE_URL = "https://api.domoai.app"
    
    def __init__(self, api_key: Optional[str] = None):
        """
        クライアントを初期化
        
        Args:
            api_key: APIキー。指定しない場合は環境変数から取得
        """
        self.api_key = api_key or os.environ.get("DOMOAI_API_KEY")
        if not self.api_key:
            raise ValueError("APIキーが設定されていません。環境変数 DOMOAI_API_KEY を設定するか、コンストラクタに渡してください。")
        
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        })
    
    def _request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict[str, Any]] = None,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        APIリクエストを実行（指数バックオフ付きリトライ）
        
        Args:
            method: HTTPメソッド
            endpoint: APIエンドポイント
            data: リクエストボディ
            max_retries: 最大リトライ回数
        
        Returns:
            APIレスポンス
        
        Raises:
            DomoAIError: API呼び出しに失敗した場合
        """
        url = f"{self.BASE_URL}{endpoint}"
        
        for attempt in range(max_retries):
            try:
                response = self.session.request(method, url, json=data)
                
                # 成功
                if response.status_code == 200:
                    return response.json()
                
                # クライアントエラー（リトライ不要）
                if response.status_code in [400, 401, 402]:
                    error_data = response.json()
                    raise DomoAIClientError(
                        status_code=response.status_code,
                        message=error_data.get("message", "Unknown error")
                    )
                
                # レート制限
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    print(f"レート制限に達しました。{retry_after}秒後にリトライします...")
                    time.sleep(retry_after)
                    continue
                
                # サーバーエラー（リトライ対象）
                if response.status_code >= 500:
                    if attempt < max_retries - 1:
                        wait_time = (2 ** attempt)  # 指数バックオフ: 1, 2, 4秒
                        print(f"サーバーエラー ({response.status_code})。{wait_time}秒後にリトライします...")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise DomoAIServerError(
                            status_code=response.status_code,
                            message="サーバーエラーが継続しています"
                        )
                        
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt)
                    print(f"ネットワークエラー。{wait_time}秒後にリトライします...")
                    time.sleep(wait_time)
                    continue
                else:
                    raise DomoAINetworkError(str(e))
        
        raise DomoAIError("最大リトライ回数を超えました")
    
    def text_to_video(
        self,
        prompt: str,
        seconds: int = 5,
        model: str = "t2v-2.4-faster",
        style: Optional[str] = None,
        aspect_ratio: str = "1:1",
        callback_url: Optional[str] = None
    ) -> str:
        """
        テキストからビデオを生成
        
        Args:
            prompt: 動画生成のプロンプト
            seconds: 動画の長さ（1-10秒）
            model: 使用するモデル
            style: ビジュアルスタイル
            aspect_ratio: アスペクト比
            callback_url: コールバックURL
        
        Returns:
            task_id: 生成タスクのID
        """
        data = {
            "prompt": prompt,
            "seconds": seconds,
            "model": model,
            "aspect_ratio": aspect_ratio
        }
        
        if style:
            data["style"] = style
        if callback_url:
            data["callback_url"] = callback_url
        
        response = self._request("POST", "/v1/video/text2video", data)
        return response["data"]["task_id"]
    
    def image_to_video(
        self,
        image_path: str,
        seconds: int = 5,
        model: str = "animate-2.4-faster",
        prompt: Optional[str] = None,
        callback_url: Optional[str] = None
    ) -> str:
        """
        画像からビデオを生成
        
        Args:
            image_path: 画像ファイルのパス
            seconds: 動画の長さ（1-10秒）
            model: 使用するモデル
            prompt: アニメーションをガイドするプロンプト
            callback_url: コールバックURL
        
        Returns:
            task_id: 生成タスクのID
        """
        # 画像をBase64エンコード
        with open(image_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode("utf-8")
        
        data = {
            "image": {
                "bytes_base64_encoded": image_base64
            },
            "seconds": seconds,
            "model": model
        }
        
        if prompt:
            data["prompt"] = prompt
        if callback_url:
            data["callback_url"] = callback_url
        
        response = self._request("POST", "/v1/video/image2video", data)
        return response["data"]["task_id"]
    
    def template_to_video(
        self,
        template: str,
        image_path: str,
        seconds: int = 5,
        callback_url: Optional[str] = None
    ) -> str:
        """
        テンプレートを使用してビデオを生成
        
        Args:
            template: テンプレート名
            image_path: 画像ファイルのパス
            seconds: 動画の長さ（1-10秒）
            callback_url: コールバックURL
        
        Returns:
            task_id: 生成タスクのID
        """
        with open(image_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode("utf-8")
        
        data = {
            "template": template,
            "images": [{"bytes_base64_encoded": image_base64}],
            "seconds": seconds
        }
        
        if callback_url:
            data["callback_url"] = callback_url
        
        response = self._request("POST", "/v1/video/template2video", data)
        return response["data"]["task_id"]
    
    def get_task(self, task_id: str) -> Dict[str, Any]:
        """
        タスクのステータスと結果を取得
        
        Args:
            task_id: タスクID
        
        Returns:
            タスク情報
        """
        response = self._request("GET", f"/v1/tasks/{task_id}")
        return response["data"]
    
    def wait_for_completion(
        self, 
        task_id: str, 
        timeout: int = 300,
        poll_interval: int = 5
    ) -> Dict[str, Any]:
        """
        タスクの完了を待機（ポーリング）
        
        Args:
            task_id: タスクID
            timeout: タイムアウト秒数
            poll_interval: ポーリング間隔
        
        Returns:
            完了したタスク情報
        
        Raises:
            TimeoutError: タイムアウトした場合
            DomoAIError: タスクが失敗した場合
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            task = self.get_task(task_id)
            status = task.get("status")
            
            if status == "SUCCESS":
                return task
            elif status == "FAILED":
                raise DomoAIError(f"タスクが失敗しました: {task.get('error', 'Unknown error')}")
            
            time.sleep(poll_interval)
        
        raise TimeoutError(f"タスク {task_id} がタイムアウトしました")


# カスタム例外クラス
class DomoAIError(Exception):
    """DomoAI API基底例外"""
    pass

class DomoAIClientError(DomoAIError):
    """クライアントエラー (4xx)"""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"[{status_code}] {message}")

class DomoAIServerError(DomoAIError):
    """サーバーエラー (5xx)"""
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"[{status_code}] {message}")

class DomoAINetworkError(DomoAIError):
    """ネットワークエラー"""
    pass
```

### A.2. コールバック受信サーバー（Flask）

```python
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route("/webhook/domoai", methods=["POST"])
def domoai_callback():
    """
    DomoAI APIからのコールバックを受信するエンドポイント
    """
    try:
        data = request.get_json()
        
        task_id = data.get("task_id")
        status = data.get("status")
        
        logger.info(f"コールバック受信: task_id={task_id}, status={status}")
        
        if status == "SUCCESS":
            # 成功時の処理
            output_videos = data.get("output_videos", [])
            for video in output_videos:
                video_url = video.get("url")
                # ビデオをダウンロードして永続化する処理
                # download_and_store_video(task_id, video_url)
                logger.info(f"ビデオURL: {video_url}")
        
        elif status == "FAILED":
            # 失敗時の処理
            error = data.get("error", "Unknown error")
            logger.error(f"タスク失敗: {error}")
            # エラー通知処理など
        
        return jsonify({"status": "received"}), 200
        
    except Exception as e:
        logger.exception("コールバック処理中にエラーが発生しました")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
```

### A.3. 使用例

```python
# 環境変数にAPIキーを設定
# export DOMOAI_API_KEY="your-api-key-here"

from domoai_client import DomoAIClient

# クライアントを初期化
client = DomoAIClient()

# --- Text to Video ---
task_id = client.text_to_video(
    prompt="A beautiful sunset over the ocean with gentle waves",
    seconds=5,
    model="t2v-2.4-faster",
    style="realistic",
    callback_url="https://your-server.com/webhook/domoai"
)
print(f"Text to Video タスク開始: {task_id}")

# --- Image to Video ---
task_id = client.image_to_video(
    image_path="/path/to/your/image.jpg",
    seconds=5,
    model="animate-2.4-faster",
    prompt="Make the character smile and wave",
    callback_url="https://your-server.com/webhook/domoai"
)
print(f"Image to Video タスク開始: {task_id}")

# --- Template to Video ---
task_id = client.template_to_video(
    template="zoom_in",
    image_path="/path/to/your/image.jpg",
    seconds=5,
    callback_url="https://your-server.com/webhook/domoai"
)
print(f"Template to Video タスク開始: {task_id}")

# --- ポーリングで結果を待つ場合（コールバックを使わない場合） ---
try:
    result = client.wait_for_completion(task_id, timeout=300)
    print(f"生成完了: {result['output_videos'][0]['url']}")
except TimeoutError:
    print("タイムアウトしました")
except Exception as e:
    print(f"エラー: {e}")
```

---

## 付録B: チェックリスト

実装時に確認すべき項目のチェックリストです。

### B.1. セキュリティ

| 項目 | 確認 |
|------|------|
| APIキーは環境変数またはシークレット管理サービスに保管されているか | ☐ |
| APIキーがクライアントサイドのコードに含まれていないか | ☐ |
| すべてのAPI通信はHTTPS経由で行われているか | ☐ |
| APIキーのローテーション計画があるか | ☐ |

### B.2. エラーハンドリング

| 項目 | 確認 |
|------|------|
| 各HTTPステータスコードに対する適切な処理が実装されているか | ☐ |
| 指数バックオフによるリトライ処理が実装されているか | ☐ |
| レート制限（429）への対応が実装されているか | ☐ |
| エラーログが適切に記録されているか | ☐ |

### B.3. タスク管理

| 項目 | 確認 |
|------|------|
| コールバックURLを使用した非同期処理が実装されているか | ☐ |
| task_idがデータベースで管理されているか | ☐ |
| コールバック失敗時のフォールバック（ポーリング）があるか | ☐ |

### B.4. データ管理

| 項目 | 確認 |
|------|------|
| 生成されたビデオを自社ストレージに永続化しているか | ☐ |
| 一時URL（8時間で失効）をエンドユーザーに直接公開していないか | ☐ |
| 入力画像のサイズが最適化されているか | ☐ |

### B.5. コスト管理

| 項目 | 確認 |
|------|------|
| 用途に応じてfaster/advancedモデルを使い分けているか | ☐ |
| 重複リクエストを防ぐキャッシュ機構があるか | ☐ |
| 利用状況のモニタリングが行われているか | ☐ |
| ティアレベルと制限を把握しているか | ☐ |

---

## 付録C: 利用可能なパラメータ一覧

### C.1. モデル一覧

| API | モデル名 | 特徴 | クレジット/秒 |
|-----|---------|------|--------------|
| Text to Video | `t2v-2.4-faster` | 高速生成 | 2 |
| Text to Video | `t2v-2.4-advanced` | 高品質 | 5 |
| Image to Video | `animate-2.4-faster` | 高速生成 | 2 |
| Image to Video | `animate-2.4-advanced` | 高品質 | 5 |

### C.2. スタイル一覧（Text to Video）

| スタイル名 | 説明 |
|-----------|------|
| `japanese_anime` | 日本アニメ風 |
| `realistic` | 写実的 |
| `pixel` | ピクセルアート |
| `cartoon_game` | カートゥーン/ゲーム風 |
| `flat_color_anime` | フラットカラーアニメ |
| `90s_style` | 90年代風 |

### C.3. テンプレート一覧（Template to Video）

| テンプレート名 | 説明 |
|---------------|------|
| `kissing_screen` | 画面にキス |
| `looping_animation` | ループアニメーション |
| `hug` | ハグ |
| `groove_dance` | グルーヴダンス |
| `kiss` | キス |
| `french_kiss` | フレンチキス |
| `360_view` | 360度ビュー |
| `zoom_in` | ズームイン |
| `crane_up` | クレーンアップ |

### C.4. アスペクト比一覧

| アスペクト比 | 用途例 |
|-------------|-------|
| `1:1` | Instagram投稿、正方形 |
| `16:9` | YouTube、横長動画 |
| `9:16` | TikTok、Instagram Reels、縦長動画 |
| `4:3` | 従来のテレビ比率 |
| `3:4` | ポートレート |

---

**作成者**: Manus AI  
**最終更新日**: 2026年1月3日
