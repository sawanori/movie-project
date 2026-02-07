# DomoAI API 実装計画書

## 概要

DomoAI Enterprise APIをシーン生成に追加実装する計画書。
既存のRunway/Veoと同じ動画生成フローに統合する。

## 実装方針

- **追加型変更のみ**: 既存のRunway/Veoコードパスは変更しない
- **共通インターフェース準拠**: `VideoProviderInterface`を実装
- **段階的実装**: Phase 1でシーン生成の基本機能を実装

---

## 影響分析

### 既存APIへの影響

| コンポーネント | 影響 | 詳細 |
|---------------|------|------|
| RunwayProvider | なし | 変更不要 |
| VeoProvider | なし | 変更不要 |
| VideoProviderInterface | なし | 変更不要 |
| DBスキーマ | なし | マイグレーション不要 |
| フロントエンド | 任意 | UI追加は別途対応 |

### DBスキーマ確認

```sql
-- storyboardsテーブル
video_provider TEXT  -- "runway", "veo", "domoai" が入る（文字列型のため追加OK）

-- storyboard_scenesテーブル
runway_task_id TEXT  -- DomoAIのtask_idも保存可能
runway_prompt TEXT   -- DomoAIのpromptも保存可能
```

**結論: Supabaseマイグレーション不要**

> 注: 将来的にDomoAI固有のカラム（スタイル、テンプレート等）を追加する場合は、
> Supabase MCPを使用して `apply_migration` でマイグレーションを実行する。

---

## Phase 1: バックエンド基盤（シーン生成対応）

### 1.1 環境変数追加

**ファイル**: `app/core/config.py`

```python
# DomoAI API
DOMOAI_API_KEY: str = ""
```

**ファイル**: `.env.example`

```env
# DomoAI API
DOMOAI_API_KEY=
```

---

### 1.2 VideoProvider Enum追加

**ファイル**: `app/videos/schemas.py`

```python
class VideoProvider(str, Enum):
    """動画生成プロバイダー"""
    RUNWAY = "runway"      # Runway Gen-4 Turbo（安価・5秒）
    VEO = "veo"            # Google Veo 3.1（高品質・音声付き・8秒）
    DOMOAI = "domoai"      # DomoAI Enterprise（アニメスタイル対応）
```

---

### 1.3 DomoAIProvider クラス作成

**ファイル**: `app/external/domoai_provider.py`（新規作成）

```python
"""
DomoAI Enterprise API Provider for Video Generation

VideoProviderInterfaceを実装したDomoAI APIプロバイダー
"""

import logging
import base64
from typing import Optional
import httpx

from app.core.config import settings
from app.external.video_provider import (
    VideoProviderInterface,
    VideoStatus,
    VideoGenerationStatus,
    VideoProviderError,
    build_prompt_with_camera,
)

logger = logging.getLogger(__name__)

# DomoAI API設定
DOMOAI_API_BASE = "https://api.domoai.com"


class DomoAIProvider(VideoProviderInterface):
    """DomoAI Enterprise API を使用した動画生成プロバイダー"""

    @property
    def provider_name(self) -> str:
        return "domoai"

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得"""
        return {
            "Authorization": f"Bearer {settings.DOMOAI_API_KEY}",
            "Content-Type": "application/json",
        }

    def _convert_aspect_ratio(self, aspect_ratio: str) -> str:
        """
        アスペクト比をDomoAI API形式に変換
        DomoAIは "9:16", "16:9", "1:1" をそのまま受け付ける
        """
        return aspect_ratio

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        DomoAI API で画像から動画を生成 (image2video)

        Args:
            image_url: 入力画像URL
            prompt: 動画生成プロンプト
            duration: 動画長さ（1-10秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9", "1:1")
            camera_work: カメラワーク名（オプション）

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            # カメラワークをプロンプトに追加
            full_prompt = build_prompt_with_camera(prompt, camera_work, provider="domoai")

            # 画像をダウンロードしてBase64エンコード
            async with httpx.AsyncClient(follow_redirects=True) as client:
                image_response = await client.get(image_url, timeout=60.0)
                image_response.raise_for_status()
                image_bytes = image_response.content
                image_base64 = base64.b64encode(image_bytes).decode("utf-8")

            request_body = {
                "model": "animate-2.4-faster",  # 高速モデル（コスト効率）
                "image": {
                    "bytes_base64_encoded": image_base64
                },
                "prompt": full_prompt,
                "seconds": min(max(duration, 1), 10),  # 1-10秒に制限
                "aspect_ratio": self._convert_aspect_ratio(aspect_ratio),
            }

            logger.info(f"DomoAI request: model={request_body['model']}, seconds={request_body['seconds']}, aspect_ratio={request_body['aspect_ratio']}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{DOMOAI_API_BASE}/v1/video/image2video",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"DomoAI image2video response: {result}")

                task_id = result.get("data", {}).get("task_id")
                if task_id:
                    logger.info(f"DomoAI task created: {task_id}")
                    return task_id

                raise VideoProviderError("DomoAI APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"DomoAI HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                error_msg = error_data.get("message", "Unknown error")

                if e.response.status_code == 401:
                    raise VideoProviderError("DomoAI APIキーが無効です。")
                if e.response.status_code == 402:
                    raise VideoProviderError("DomoAIのクレジットが不足しています。")
                if e.response.status_code == 429:
                    raise VideoProviderError("DomoAIのレート制限に達しました。しばらく待ってから再試行してください。")
                raise VideoProviderError(f"DomoAI API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"DomoAI API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"DomoAI video generation failed: {e}")
            raise VideoProviderError(f"動画生成に失敗しました: {str(e)}")

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
                    f"{DOMOAI_API_BASE}/v1/tasks/{task_id}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

                data = result.get("data", {})
                domoai_status = data.get("status", "").upper()

                # DomoAIのステータスを内部ステータスに変換
                status_mapping = {
                    "PENDING": VideoGenerationStatus.PENDING,
                    "PROCESSING": VideoGenerationStatus.PROCESSING,
                    "SUCCESS": VideoGenerationStatus.COMPLETED,
                    "FAILED": VideoGenerationStatus.FAILED,
                }

                internal_status = status_mapping.get(domoai_status, VideoGenerationStatus.PROCESSING)

                # 進捗を推定
                progress = 0
                if internal_status == VideoGenerationStatus.PENDING:
                    progress = 10
                elif internal_status == VideoGenerationStatus.PROCESSING:
                    progress = 50
                elif internal_status == VideoGenerationStatus.COMPLETED:
                    progress = 100

                video_url = None
                error_message = None

                if internal_status == VideoGenerationStatus.COMPLETED:
                    output_videos = data.get("output_videos", [])
                    if output_videos and len(output_videos) > 0:
                        video_url = output_videos[0].get("url")
                        logger.info(f"DomoAI task completed: {video_url}")
                elif internal_status == VideoGenerationStatus.FAILED:
                    error_message = data.get("error", "動画生成に失敗しました")
                    logger.error(f"DomoAI task failed: {error_message}")

                return VideoStatus(
                    status=internal_status,
                    progress=progress,
                    video_url=video_url,
                    error_message=error_message,
                )

        except httpx.HTTPStatusError as e:
            logger.error(f"DomoAI status check HTTP error: {e.response.status_code}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"DomoAI status check failed: {e}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {str(e)}",
            )

    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画URLを取得

        Args:
            task_id: タスクID

        Returns:
            str: 動画URL（未完了の場合はNone）
        """
        status = await self.check_status(task_id)
        return status.video_url

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了したタスクの動画をダウンロード

        Note:
            DomoAIの動画URLは8時間で失効するため、
            取得後すぐにR2に永続化する必要がある。
        """
        try:
            video_url = await self.get_video_url(task_id)
            if not video_url:
                logger.warning(f"No video URL for task {task_id}")
                return None

            async with httpx.AsyncClient(follow_redirects=True) as client:
                response = await client.get(video_url, timeout=120.0)
                response.raise_for_status()
                return response.content

        except Exception as e:
            logger.exception(f"Failed to download video for task {task_id}: {e}")
            return None
```

---

### 1.4 ファクトリー関数更新

**ファイル**: `app/external/video_provider.py`

```python
def get_video_provider(provider_name: Optional[str] = None) -> VideoProviderInterface:
    """
    設定に応じた動画生成プロバイダーを返すファクトリー関数

    Args:
        provider_name: プロバイダー名（"runway", "veo", "domoai"）
                       指定がなければ環境変数 VIDEO_PROVIDER を使用

    Returns:
        VideoProviderInterface: 動画生成プロバイダーインスタンス
    """
    if provider_name is None:
        from app.core.config import settings
        provider_name = getattr(settings, 'VIDEO_PROVIDER', 'runway')

    provider_name = provider_name.lower()

    if provider_name == "domoai":
        from app.external.domoai_provider import DomoAIProvider
        logger.info("Using DomoAI video provider")
        return DomoAIProvider()
    elif provider_name == "veo":
        from app.external.veo_provider import VeoProvider
        logger.info("Using Veo video provider")
        return VeoProvider()
    else:
        from app.external.runway_provider import RunwayProvider
        logger.info("Using Runway video provider")
        return RunwayProvider()
```

---

### 1.5 カメラワークマッピング追加（任意）

**ファイル**: `app/external/video_provider.py`

```python
# DomoAI用カメラワークマッピング
DOMOAI_CAMERA_PROMPT_MAPPING = {
    "zoom_in": "slowly zoom in on the subject",
    "zoom_out": "camera zooms out to reveal the scene",
    "pan_left": "camera pans left across the scene",
    "pan_right": "camera pans right across the scene",
    "static": "static camera, no movement",
    # ... Runwayと同じマッピングを使用可能
}
```

---

## Phase 2: テスト・検証

### 2.1 単体テスト作成

**ファイル**: `tests/external/test_domoai_provider.py`（新規作成）

```python
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from app.external.domoai_provider import DomoAIProvider
from app.external.video_provider import VideoGenerationStatus


class TestDomoAIProvider:
    """DomoAIProvider のテスト"""

    def test_provider_name(self):
        """プロバイダー名が正しいこと"""
        provider = DomoAIProvider()
        assert provider.provider_name == "domoai"

    def test_supports_v2v_is_false(self):
        """V2Vはサポートしない"""
        provider = DomoAIProvider()
        assert provider.supports_v2v == False

    @pytest.mark.asyncio
    async def test_generate_video_success(self):
        """動画生成が成功すること"""
        # モック設定
        # ...

    @pytest.mark.asyncio
    async def test_check_status_completed(self):
        """ステータス確認が正しく動作すること"""
        # モック設定
        # ...
```

---

### 2.2 統合テスト

```bash
# 環境変数を設定
export DOMOAI_API_KEY="your-api-key"
export VIDEO_PROVIDER="domoai"

# サーバー起動
uvicorn app.main:app --reload --port 8000

# テスト実行
pytest tests/external/test_domoai_provider.py -v
```

---

## Phase 3: 拡張機能（任意）

### 3.1 スタイル選択対応

DomoAI固有のスタイルパラメータを追加する場合：

```python
# schemas.py
class DomoAIStyle(str, Enum):
    JAPANESE_ANIME = "japanese_anime"
    REALISTIC = "realistic"
    PIXEL = "pixel"
    CARTOON_GAME = "cartoon_game"
    FLAT_COLOR_ANIME = "flat_color_anime"
    NINETIES_STYLE = "90s_style"
```

### 3.2 faster/advancedモデル切替

```python
class DomoAIModel(str, Enum):
    FASTER = "animate-2.4-faster"      # 2クレジット/秒
    ADVANCED = "animate-2.4-advanced"  # 5クレジット/秒
```

### 3.3 Supabaseマイグレーション（拡張機能用）

スタイルやモデル設定をDBに保存する場合は、Supabase MCPを使用：

```python
# Claude Code内で実行
mcp__supabase__apply_migration(
    project_id="your-project-id",
    name="add_domoai_style_column",
    query="""
        ALTER TABLE storyboard_scenes
        ADD COLUMN domoai_style TEXT DEFAULT NULL;

        ALTER TABLE storyboard_scenes
        ADD COLUMN domoai_model TEXT DEFAULT 'animate-2.4-faster';
    """
)
```

---

## チェックリスト

### Phase 1（必須）

- [ ] `app/core/config.py` に `DOMOAI_API_KEY` 追加
- [ ] `.env.example` に `DOMOAI_API_KEY` 追加
- [ ] `app/videos/schemas.py` に `VideoProvider.DOMOAI` 追加
- [ ] `app/external/domoai_provider.py` 新規作成
- [ ] `app/external/video_provider.py` の `get_video_provider()` 更新
- [ ] 単体テスト作成・実行

### Phase 2（検証）

- [ ] `.env` に実際の `DOMOAI_API_KEY` 設定
- [ ] `VIDEO_PROVIDER=domoai` でサーバー起動
- [ ] シーン生成APIでDomoAI動画生成テスト
- [ ] エラーハンドリング確認（401, 402, 429）

### Phase 3（任意）

- [ ] スタイル選択UI追加
- [ ] モデル切替（faster/advanced）対応
- [ ] フロントエンドプロバイダー選択UI

---

## 工数見積もり

| Phase | タスク | 工数 |
|-------|--------|------|
| Phase 1 | バックエンド基盤 | 3-4時間 |
| Phase 2 | テスト・検証 | 1-2時間 |
| Phase 3 | 拡張機能 | 任意 |

**合計: 約半日で基本動作可能**

---

## 注意事項

1. **動画URL有効期限**: DomoAIの動画URLは8時間で失効するため、R2への永続化は必須
2. **クレジット管理**: fasterモデル（2クレジット/秒）を基本とし、advancedは明示的な選択時のみ
3. **レート制限**: 429エラー時は`Retry-After`ヘッダーに従う
4. **既存フロー影響**: 本実装は追加型変更のみ、既存Runway/Veoへの影響なし

---

**作成日**: 2026年1月3日
**最終更新**: 2026年1月3日
