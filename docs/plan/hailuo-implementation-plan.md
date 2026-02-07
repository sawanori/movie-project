# HailuoAI (MiniMax) 動画生成プロバイダー実装計画書

## 概要

| 項目 | 内容 |
|------|------|
| 目的 | MiniMax HailuoAI を新しい動画生成プロバイダーとして追加 |
| プロバイダー名 | `hailuo` |
| 対応モデル | MiniMax-Hailuo-02, MiniMax-Hailuo-2.3 |
| 主要機能 | Text-to-Video, Image-to-Video, First/Last Frame, Camera Control |

---

## 0. 環境変数設定（実装前に準備）

### 0.1 MiniMax APIキー取得手順

1. [MiniMax Platform](https://platform.minimax.io) にアクセス
2. アカウント作成/ログイン
3. **Account Management > API Keys** からAPIキーを生成
4. クレジット残高を確認（動画生成には残高が必要）

### 0.2 .env ファイル設定

**追加する環境変数:**

```bash
# ============================================
# HailuoAI (MiniMax) Video Generation API
# ============================================
# MiniMax Platform から取得: https://platform.minimax.io
# Account Management > API Keys で生成
HAILUO_API_KEY=your-minimax-api-key-here

# 使用モデル（オプション、デフォルト: MiniMax-Hailuo-02）
# - MiniMax-Hailuo-02: First/Last Frame対応、高品質
# - MiniMax-Hailuo-2.3: 最新版、複雑な指示に強い
HAILUO_MODEL=MiniMax-Hailuo-02

# プロンプト最適化（オプション、デフォルト: false）
# - true: APIがプロンプトを自動最適化（一般用途向け）
# - false: カメラ制御時は必ずfalse（精密制御のため）
HAILUO_PROMPT_OPTIMIZER=false
```

### 0.3 .env.example への追記内容

```bash
# HailuoAI (MiniMax) Video Generation API
HAILUO_API_KEY=your-minimax-api-key
HAILUO_MODEL=MiniMax-Hailuo-02
HAILUO_PROMPT_OPTIMIZER=false
```

### 0.4 APIキー設定確認コマンド

```bash
# バックエンド起動時に確認
cd movie-maker-api
source venv/bin/activate
python -c "from app.core.config import settings; print('HAILUO_API_KEY:', 'SET' if settings.HAILUO_API_KEY else 'NOT SET')"
```

---

## 1. API調査結果

### 1.1 サポート機能一覧

| 機能 | サポート状況 | 備考 |
|------|-------------|------|
| Text-to-Video | ✅ | `POST /v1/video_generation` |
| Image-to-Video | ✅ | `first_frame_image` パラメータ |
| End Frame | ✅ | `last_frame_image` パラメータ (Hailuo-02のみ) |
| V2V (extend_video) | ⚠️ 代替実装 | 直接APIなし、First/Last Frame方式で対応 |
| Camera Control | ✅ | プロンプト内 `[command]` 構文 |

### 1.2 API仕様詳細

| 項目 | 値 |
|------|-----|
| ベースURL | `https://api.minimax.io` |
| 認証 | `Authorization: Bearer {API_KEY}` |
| Content-Type | `application/json` |
| 動画生成エンドポイント | `POST /v1/video_generation` |
| ステータス確認エンドポイント | `GET /v1/query/video_generation?task_id={task_id}` |

### 1.3 レスポンス構造

**生成リクエスト成功時:**
```json
{
  "task_id": "401047179385389059",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

**ステータス確認成功時:**
```json
{
  "task_id": "401047179385389059",
  "status": "Success",
  "video_url": "https://cdn.hailuoai.com/prod/video_xxx.mp4",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

**エラーコード一覧:**

| コード | 意味 | 対処法 |
|--------|------|--------|
| 0 | 成功 | - |
| 1002 | レート制限 | 待機後リトライ |
| 1004 | 認証失敗 | APIキー確認 |
| 1008 | 残高不足 | クレジット追加 |
| 1026 | 不適切コンテンツ検出 | プロンプト修正 |
| 2013 | パラメータ不正 | リクエスト確認 |
| 2049 | 無効なAPIキー | APIキー再生成 |

### 1.4 カメラコントロール対応表

HailuoAIは15種類のカメラコマンドをサポート:

| カテゴリ | コマンド | 記法 |
|---------|---------|------|
| Truck | 左/右 | `[Truck left]`, `[Truck right]` |
| Pan | 左/右 | `[Pan left]`, `[Pan right]` |
| Push | イン/アウト | `[Push in]`, `[Pull out]` |
| Pedestal | 上/下 | `[Pedestal up]`, `[Pedestal down]` |
| Tilt | 上/下 | `[Tilt up]`, `[Tilt down]` |
| Zoom | イン/アウト | `[Zoom in]`, `[Zoom out]` |
| その他 | シェイク/トラッキング/静止 | `[Shake]`, `[Tracking shot]`, `[Static shot]` |

**使用ルール:**
- 同時実行: `[Pan left, Zoom in, Tilt up]` (最大3コマンド推奨)
- 順次実行: `[Push in], then [Pull out]`
- `prompt_optimizer: false` で精密制御

### 1.5 制限事項

| 項目 | 制限 |
|------|------|
| 動画長さ | **6秒 or 10秒のみ**（5秒は非対応→6秒に自動変換） |
| 解像度 | 720P, 768P, 1080P |
| プロンプト長 | 最大2000文字 |
| 画像サイズ | 20MB以下 |
| アスペクト比 | 2:5 〜 5:2 |
| 生成時間 | 6秒動画: 4-5分, 10秒動画: 8-9分 |

---

## 2. アーキテクチャ設計

### 2.1 ファイル構成

```
movie-maker-api/
├── app/
│   ├── core/
│   │   └── config.py                    # 環境変数追加 (3行)
│   └── external/
│       ├── video_provider.py            # ファクトリー関数更新 (5行)
│       └── hailuo_provider.py           # 【新規】HailuoAIプロバイダー (~300行)
│
docs/prompt/
├── story/
│   └── hailuo_api_template.md           # 【新規】ストーリー用テンプレート
└── scene/
    ├── person/
    │   └── hailuo_api_template.md       # 【新規】人物シーン用
    ├── object/
    │   └── hailuo_api_template.md       # 【新規】物体シーン用
    └── anime/
        ├── 2d/hailuo/                   # 【新規】2Dアニメ用 (4ファイル)
        └── 3d/hailuo/                   # 【新規】3Dアニメ用 (4ファイル)

movie-maker/
└── lib/
    ├── types/
    │   └── video.ts                     # VideoProvider型更新 (2行)
    └── camera/
        └── types.ts                     # VideoProvider型更新 (1行)
```

### 2.2 型定義の重複問題（要注意）

⚠️ **エラーの温床:** VideoProvider型が2箇所で定義されている

| ファイル | 用途 | 更新必須 |
|----------|------|----------|
| `lib/types/video.ts` | プロバイダー選択UI | ✅ |
| `lib/camera/types.ts` | カメラワークフィルタリング | ✅ |

**両方を同時に更新しないとTypeScriptエラーが発生する。**

---

## 3. 実装ステップ（エラー防止設計）

### Phase 1: 基盤準備（エラー発生リスク: 低）

#### Step 1.1: 環境変数追加
**ファイル:** `movie-maker-api/app/core/config.py`

```python
# 追加する設定（Settings クラス内）
# HailuoAI (MiniMax)
HAILUO_API_KEY: str = ""
HAILUO_MODEL: str = "MiniMax-Hailuo-02"
HAILUO_PROMPT_OPTIMIZER: bool = False
```

**検証ポイント:**
- [ ] `.env.example` にも追加済み
- [ ] `uvicorn app.main:app --reload` でエラーなく起動
- [ ] 環境変数が正しく読み込まれる

#### Step 1.2: フロントエンド型定義更新（2箇所同時更新必須）

**ファイル1:** `movie-maker/lib/types/video.ts`

```typescript
// 変更前
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling';

// 変更後
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';

// VIDEO_PROVIDERS配列に追加
{
  value: "hailuo",
  label: "Hailuo AI",
  description: "MiniMax製・シネマ品質・カメラ制御対応",
},
```

**ファイル2:** `movie-maker/lib/camera/types.ts`

```typescript
// 変更前
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling';

// 変更後
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';
```

**検証ポイント:**
- [ ] `npm run dev` でエラーなく起動
- [ ] TypeScript型エラーがないことを確認（`npm run build`）
- [ ] プロバイダー選択UIに表示されることを確認

---

### Phase 2: プロバイダー実装（エラー発生リスク: 中）

#### Step 2.1: HailuoProvider クラス作成
**ファイル:** `movie-maker-api/app/external/hailuo_provider.py`

**実装順序（依存関係を考慮）:**

1. **インポートと定数定義**
```python
import httpx
import logging
from typing import Optional

from app.core.config import settings
from app.external.video_provider import (
    VideoProviderInterface,
    VideoProviderError,
    VideoStatus,
    VideoGenerationStatus,
)

logger = logging.getLogger(__name__)

HAILUO_BASE_URL = "https://api.minimax.io"

# カメラワークマッピング（既存のカメラワーク名 → Hailuoコマンド）
HAILUO_CAMERA_MAPPING: dict[str, str] = {
    # 基本移動
    "dolly_in": "[Push in]",
    "dolly_out": "[Pull out]",
    "push_in": "[Push in]",
    "pull_out": "[Pull out]",
    "truck_left": "[Truck left]",
    "truck_right": "[Truck right]",
    "pan_left": "[Pan left]",
    "pan_right": "[Pan right]",
    "tilt_up": "[Tilt up]",
    "tilt_down": "[Tilt down]",
    "pedestal_up": "[Pedestal up]",
    "pedestal_down": "[Pedestal down]",
    "zoom_in": "[Zoom in]",
    "zoom_out": "[Zoom out]",
    # 複合・特殊
    "tracking_shot": "[Tracking shot]",
    "static_shot": "[Static shot]",
    "shake": "[Shake]",
    # 組み合わせ
    "arc_left": "[Truck left, Pan right]",
    "arc_right": "[Truck right, Pan left]",
    "crane_up": "[Pedestal up, Tilt down]",
    "crane_down": "[Pedestal down, Tilt up]",
}
```

2. **クラス骨格（認証ヘッダー含む）**
```python
class HailuoProvider(VideoProviderInterface):
    """HailuoAI (MiniMax) 動画生成プロバイダー"""

    def __init__(self):
        self.api_key = getattr(settings, 'HAILUO_API_KEY', None)
        self.model = getattr(settings, 'HAILUO_MODEL', 'MiniMax-Hailuo-02')
        self.prompt_optimizer = getattr(settings, 'HAILUO_PROMPT_OPTIMIZER', False)

        if not self.api_key:
            raise ValueError("HAILUO_API_KEY must be configured")

    @property
    def provider_name(self) -> str:
        return "hailuo"

    @property
    def supports_v2v(self) -> bool:
        """First/Last Frame方式で代替実装のためTrue"""
        return True

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得（Bearer Token形式）"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
```

3. **generate_video メソッド**
```python
async def generate_video(
    self,
    image_url: str,
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    camera_work: Optional[str] = None,
    last_frame_image_url: Optional[str] = None,
) -> str:
    """
    Hailuo API で画像から動画を生成

    Args:
        image_url: 入力画像URL（開始フレーム）
        prompt: 動画生成プロンプト（最大2000文字）
        duration: 動画長さ（5→6秒, 6以上→10秒に変換）
        aspect_ratio: アスペクト比（"9:16", "16:9", "1:1"）
        camera_work: カメラワーク名（オプション）
        last_frame_image_url: 終了フレーム画像URL（オプション、Hailuo-02のみ）

    Returns:
        str: タスクID

    Raises:
        VideoProviderError: 生成開始に失敗した場合
    """
    try:
        # 1. プロンプト長さ制限（2000文字）
        if len(prompt) > 2000:
            prompt = prompt[:1997] + "..."
            logger.warning("Prompt truncated to 2000 chars")

        # 2. カメラコマンドをプロンプトに追加
        if camera_work and camera_work in HAILUO_CAMERA_MAPPING:
            camera_command = HAILUO_CAMERA_MAPPING[camera_work]
            prompt = f"{camera_command} {prompt}"
            logger.info(f"Added camera command: {camera_command}")

        # 3. duration調整（6秒 or 10秒のみ対応）
        # 5秒以下→6秒、6秒以上→10秒
        effective_duration = 6 if duration <= 6 else 10

        # 4. リクエストボディ構築
        request_body = {
            "model": self.model,
            "prompt": prompt,
            "first_frame_image": image_url,
            "duration": effective_duration,
            "prompt_optimizer": self.prompt_optimizer,
        }

        # 5. End Frame対応（Hailuo-02のみ）
        if last_frame_image_url and self.model == "MiniMax-Hailuo-02":
            request_body["last_frame_image"] = last_frame_image_url
            logger.info("Using First/Last Frame mode")

        logger.info(f"Hailuo request: model={self.model}, duration={effective_duration}")

        # 6. API呼び出し
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{HAILUO_BASE_URL}/v1/video_generation",
                headers=self._get_headers(),
                json=request_body,
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()

        # 7. レスポンス解析
        base_resp = result.get("base_resp", {})
        if base_resp.get("status_code") != 0:
            error_msg = base_resp.get("status_msg", "Unknown error")
            raise VideoProviderError(f"Hailuo API エラー: {error_msg}")

        task_id = result.get("task_id")
        if not task_id:
            raise VideoProviderError("Hailuo APIからtask_idが返されませんでした")

        logger.info(f"Hailuo task created: {task_id}")
        return task_id

    except httpx.HTTPStatusError as e:
        logger.error(f"Hailuo HTTP error: {e.response.status_code} - {e.response.text}")
        self._handle_http_error(e)
    except VideoProviderError:
        raise
    except Exception as e:
        logger.exception(f"Hailuo video generation failed: {e}")
        raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

def _handle_http_error(self, e: httpx.HTTPStatusError):
    """HTTPエラーをユーザーフレンドリーなメッセージに変換"""
    try:
        error_data = e.response.json()
        base_resp = error_data.get("base_resp", {})
        status_code = base_resp.get("status_code", 0)
        status_msg = base_resp.get("status_msg", "")

        error_messages = {
            1002: "レート制限に達しました。しばらく待ってから再試行してください。",
            1004: "認証に失敗しました。APIキーを確認してください。",
            1008: "MiniMaxのクレジットが不足しています。",
            1026: "不適切なコンテンツが検出されました。プロンプトを修正してください。",
            2013: "パラメータが不正です。入力を確認してください。",
            2049: "無効なAPIキーです。APIキーを再生成してください。",
        }

        if status_code in error_messages:
            raise VideoProviderError(error_messages[status_code])
        raise VideoProviderError(f"Hailuo API エラー: {status_msg or e.response.status_code}")
    except VideoProviderError:
        raise
    except Exception:
        raise VideoProviderError(f"Hailuo API エラー: {e.response.status_code}")
```

4. **check_status メソッド**
```python
async def check_status(self, task_id: str) -> VideoStatus:
    """
    動画生成タスクの進捗を確認

    Args:
        task_id: タスクID

    Returns:
        VideoStatus: 現在のステータス情報
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{HAILUO_BASE_URL}/v1/query/video_generation",
                headers=self._get_headers(),
                params={"task_id": task_id},
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        # ステータス文字列（大文字小文字混在の可能性あり）
        status_str = result.get("status", "").lower()

        # ステータスマッピング
        status_mapping = {
            "success": VideoGenerationStatus.COMPLETED,
            "processing": VideoGenerationStatus.PROCESSING,
            "pending": VideoGenerationStatus.PENDING,
            "queueing": VideoGenerationStatus.PENDING,
            "fail": VideoGenerationStatus.FAILED,
            "failed": VideoGenerationStatus.FAILED,
        }
        internal_status = status_mapping.get(status_str, VideoGenerationStatus.PROCESSING)

        # 進捗計算
        progress_map = {
            VideoGenerationStatus.PENDING: 10,
            VideoGenerationStatus.PROCESSING: 50,
            VideoGenerationStatus.COMPLETED: 100,
            VideoGenerationStatus.FAILED: 0,
        }
        progress = progress_map.get(internal_status, 50)

        video_url = None
        error_message = None

        if internal_status == VideoGenerationStatus.COMPLETED:
            # video_url は直接レスポンスに含まれる
            video_url = result.get("video_url")
            if video_url:
                logger.info(f"Hailuo task completed: {video_url}")
            else:
                logger.warning(f"Hailuo completed but no video_url found: {result}")

        elif internal_status == VideoGenerationStatus.FAILED:
            base_resp = result.get("base_resp", {})
            error_message = base_resp.get("status_msg", "動画生成に失敗しました")
            logger.error(f"Hailuo task failed: {error_message}")

        return VideoStatus(
            status=internal_status,
            progress=progress,
            video_url=video_url,
            error_message=error_message,
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"Hailuo status check HTTP error: {e.response.status_code}")
        return VideoStatus(
            status=VideoGenerationStatus.FAILED,
            progress=0,
            error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
        )
    except Exception as e:
        logger.exception(f"Hailuo status check failed: {e}")
        return VideoStatus(
            status=VideoGenerationStatus.FAILED,
            progress=0,
            error_message=f"ステータス確認に失敗しました: {str(e)}",
        )
```

5. **get_video_url / extend_video / download_video_bytes メソッド**
```python
async def get_video_url(self, task_id: str) -> Optional[str]:
    """完了したタスクの動画URLを取得"""
    status = await self.check_status(task_id)
    return status.video_url

async def extend_video(
    self,
    video_url: str,
    prompt: str,
    aspect_ratio: str = "9:16",
) -> str:
    """
    V2V代替実装: 動画の最終フレームを抽出してFirst Frameとして使用

    注意: この実装には事前に動画からフレーム抽出が必要
    呼び出し元（video_processor.py）で以下を実行:
    1. ffmpegで最終フレーム抽出
    2. R2にアップロード
    3. generate_video(first_frame_image=抽出画像URL) を呼び出し
    """
    raise NotImplementedError(
        "Hailuo extend_video requires pre-extracted last frame. "
        "Use generate_video with extracted frame URL instead."
    )

async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
    """完了した動画をバイト形式でダウンロード"""
    video_url = await self.get_video_url(task_id)
    if not video_url:
        return None

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(video_url, timeout=120.0)
            response.raise_for_status()
            return response.content
    except Exception as e:
        logger.exception(f"Failed to download video: {e}")
        return None
```

**検証ポイント:**
- [ ] 単体テストで各メソッドが正常動作することを確認
- [ ] APIキーなしでValueErrorが発生することを確認
- [ ] カメラマッピングが正しく動作することを確認
- [ ] 認証ヘッダーが `Bearer` 形式になっていることを確認

#### Step 2.2: ファクトリー関数更新
**ファイル:** `movie-maker-api/app/external/video_provider.py`

```python
def get_video_provider(provider_name: Optional[str] = None) -> VideoProviderInterface:
    # ... 既存コード ...

    # piapi_kling の後に追加
    elif provider_name == "hailuo":
        from app.external.hailuo_provider import HailuoProvider
        logger.info("Using Hailuo video provider")
        return HailuoProvider()

    # ... 既存のrunway（デフォルト） ...
```

**検証ポイント:**
- [ ] `get_video_provider("hailuo")` でHailuoProviderが返ることを確認
- [ ] import文が正しいことを確認

---

### Phase 3: プロンプトテンプレート作成（エラー発生リスク: 低）

#### Step 3.1: ストーリー用テンプレート
**ファイル:** `docs/prompt/story/hailuo_api_template.md`

既存のKlingテンプレートをベースに、Hailuo固有の調整:
- カメラコマンド `[command]` 構文の使用
- `prompt_optimizer: false` 前提のプロンプト設計
- 2000文字制限への対応

#### Step 3.2: シーン用テンプレート（person/object）
**ファイル:**
- `docs/prompt/scene/person/hailuo_api_template.md`
- `docs/prompt/scene/object/hailuo_api_template.md`

#### Step 3.3: アニメ用テンプレート
**ディレクトリ構造:**
- `docs/prompt/scene/anime/2d/hailuo/` (4ファイル)
- `docs/prompt/scene/anime/3d/hailuo/` (4ファイル)

---

### Phase 4: カメラワーク統合（エラー発生リスク: 中）

#### Step 4.1: カメラワークマッピング完成
**ファイル:** `movie-maker-api/app/external/hailuo_provider.py`

既存の122種類のカメラワークをHailuoの15コマンドにマッピング。

**マッピング戦略:**
1. 直接対応するものはそのまま使用
2. 複合動作は最大3コマンドの組み合わせで表現
3. 対応不可のものは最も近いコマンドにフォールバック

#### Step 4.2: フロントエンドカメラワークフィルタリング（任意）

カメラワークに `providers` を設定してHailuo非対応のものをフィルタリングする場合:

```typescript
// camera-works.ts の該当カメラワークに追加
{
  id: 99,
  name: 'example_runway_only',
  // ...
  providers: ['runway'],  // Hailuo非対応
}
```

---

### Phase 5: 統合テスト（エラー発生リスク: 高）

#### Step 5.1: 単体テスト作成
**ファイル:** `movie-maker-api/tests/external/test_hailuo_provider.py`

```python
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.external.hailuo_provider import HailuoProvider, HAILUO_CAMERA_MAPPING


class TestHailuoProvider:
    @pytest.fixture
    def mock_settings(self):
        with patch('app.external.hailuo_provider.settings') as mock:
            mock.HAILUO_API_KEY = 'test_key'
            mock.HAILUO_MODEL = 'MiniMax-Hailuo-02'
            mock.HAILUO_PROMPT_OPTIMIZER = False
            yield mock

    @pytest.fixture
    def provider(self, mock_settings):
        return HailuoProvider()

    def test_provider_name(self, provider):
        assert provider.provider_name == "hailuo"

    def test_supports_v2v(self, provider):
        assert provider.supports_v2v is True

    def test_get_headers_bearer_format(self, provider):
        headers = provider._get_headers()
        assert "Authorization" in headers
        assert headers["Authorization"].startswith("Bearer ")
        assert "Content-Type" in headers

    def test_camera_mapping_exists(self):
        assert "dolly_in" in HAILUO_CAMERA_MAPPING
        assert HAILUO_CAMERA_MAPPING["dolly_in"] == "[Push in]"
        assert HAILUO_CAMERA_MAPPING["zoom_in"] == "[Zoom in]"

    def test_missing_api_key_raises_error(self):
        with patch('app.external.hailuo_provider.settings') as mock:
            mock.HAILUO_API_KEY = ''
            with pytest.raises(ValueError, match="HAILUO_API_KEY"):
                HailuoProvider()

    @pytest.mark.asyncio
    async def test_generate_video_success(self, provider):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task_123",
            "base_resp": {"status_code": 0, "status_msg": "success"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            task_id = await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
            )

            assert task_id == "test_task_123"

    @pytest.mark.asyncio
    async def test_duration_conversion(self, provider):
        """5秒→6秒、10秒→10秒に変換されることを確認"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task",
            "base_resp": {"status_code": 0}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_post = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value.post = mock_post

            await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test",
                duration=5,  # 5秒指定
            )

            # リクエストボディを確認
            call_args = mock_post.call_args
            request_body = call_args.kwargs['json']
            assert request_body['duration'] == 6  # 6秒に変換

    @pytest.mark.asyncio
    async def test_check_status_completed(self, provider):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "task_id": "test_task",
            "status": "Success",
            "video_url": "https://cdn.hailuoai.com/video.mp4",
            "base_resp": {"status_code": 0}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task")

            from app.external.video_provider import VideoGenerationStatus
            assert status.status == VideoGenerationStatus.COMPLETED
            assert status.video_url == "https://cdn.hailuoai.com/video.mp4"
            assert status.progress == 100
```

---

## 4. 発見した問題点と修正内容

### 4.1 重大な誤り（修正済み）

| 問題 | 元の設計 | 修正後 |
|------|---------|--------|
| 認証ヘッダー | 未定義 | `Authorization: Bearer {API_KEY}` |
| ステータスレスポンス | `file_id` | `video_url` が直接返る |
| ステータス文字列 | 小文字想定 | 大文字小文字混在対応 |
| duration | 5秒対応 | 6秒/10秒のみ（5秒→6秒変換） |

### 4.2 潜在的なエラーの温床（対策済み）

| 問題 | 対策 |
|------|------|
| VideoProvider型の重複定義 | 2箇所同時更新を明記 |
| APIキー未設定時の起動 | `__init__` でValueError発生 |
| エラーコードのハンドリング | `_handle_http_error` で全コード対応 |
| プロンプト長超過 | 2000文字で自動切り詰め |

---

## 5. Supabaseマイグレーション

### 5.1 マイグレーション不要の確認

現在のスキーマ確認結果:
- `video_generations.video_provider`: TEXT型、CHECK制約なし → **マイグレーション不要**
- `storyboards.video_provider`: TEXT型、CHECK制約なし → **マイグレーション不要**

'hailuo' は追加設定なしで使用可能。

---

## 6. エラー防止チェックリスト

### 6.1 実装前チェック
- [ ] HAILUO_API_KEY が取得済み
- [ ] MiniMax開発者アカウントが有効
- [ ] APIクレジット残高の確認
- [ ] `.env` にAPIキーを設定済み

### 6.2 各Phase完了時チェック

#### Phase 1 完了時
- [ ] `uvicorn app.main:app --reload` でエラーなく起動
- [ ] `npm run dev` でエラーなく起動
- [ ] `npm run build` でTypeScriptエラーなし
- [ ] 環境変数が正しく読み込まれる

#### Phase 2 完了時
- [ ] `pytest tests/external/test_hailuo_provider.py -v` 全テストパス
- [ ] `get_video_provider("hailuo")` が正常動作
- [ ] 認証ヘッダーが `Bearer` 形式
- [ ] duration=5 が 6 に変換される

#### Phase 3 完了時
- [ ] 全テンプレートファイルが作成済み
- [ ] テンプレート読み込みエラーなし

#### Phase 4 完了時
- [ ] カメラワーク選択UIが正常表示
- [ ] カメラコマンドがプロンプトに追加される

#### Phase 5 完了時
- [ ] 全テストパス
- [ ] 実際の動画生成が成功（手動テスト）

---

## 7. ロールバック計画

### 7.1 即時ロールバック

問題発生時は以下の順序で切り戻し:

1. **フロントエンド**: `VIDEO_PROVIDERS` から hailuo を削除
2. **バックエンド**: `get_video_provider` から hailuo 分岐を削除
3. デプロイ実行

### 7.2 部分的無効化

```python
# config.py に機能フラグ追加
HAILUO_ENABLED: bool = False  # Falseで無効化
```

---

## 8. 実装スケジュール

| Phase | 作業内容 | 依存関係 |
|-------|---------|---------|
| 0 | APIキー取得・.env設定 | なし |
| 1 | 基盤準備（環境変数・型定義） | Phase 0 |
| 2 | HailuoProvider実装 | Phase 1 |
| 3 | プロンプトテンプレート作成 | なし（並行可） |
| 4 | カメラワーク統合 | Phase 2 |
| 5 | 統合テスト | Phase 2, 3, 4 |

---

## 9. 参考リソース

- [MiniMax API Documentation](https://platform.minimax.io/docs/api-reference/video-generation-t2v)
- [Hailuo-02 Start & End Frames Feature](https://www.minimax.io/news/minimax-hailuo-02-start-end-frames-feature-is-now-live)
- [AI/ML API Hailuo Documentation](https://docs.aimlapi.com/api-references/video-models/minimax/hailuo-02)

---

*Last Updated: 2026-01-09*
*Author: Claude Code*
*Reviewed: 2026-01-09 - 認証ヘッダー・レスポンス構造・duration変換を修正*
