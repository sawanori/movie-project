# PiAPI Kling API 実装計画

## 概要

PiAPI経由でKling AIの動画生成機能を利用するための実装計画。
既存の `VideoProviderInterface` パターンに従い、新しいプロバイダーとして追加する。

## 料金比較

| サービス | モデル | 5秒動画 | 4シーン（20秒） |
|----------|--------|---------|----------------|
| **PiAPI Kling 2.6 std** | 最新・標準 | 約30円 | 約120円 |
| PiAPI Kling 2.6 pro | 最新・高品質 | 約51円 | 約204円 |
| Runway Gen-3 Turbo | 高速 | 約39円 | 約156円 |
| Runway Gen-3 Alpha | 高品質 | 約78円 | 約312円 |

## アーキテクチャ

### 現在の構成
```
app/external/
├── video_provider.py      # VideoProviderInterface 抽象クラス
├── runway_provider.py     # Runway実装（参考実装）
├── veo_provider.py        # Veo実装
├── domoai_provider.py     # DomoAI実装
└── kling.py               # 旧Kling実装（公式API直接、非推奨）
```

### 追加するファイル
```
app/external/
└── piapi_kling_provider.py  # PiAPI Kling実装（新規）
```

## 既存インターフェース確認

### VideoProviderInterface（必須実装）
```python
class VideoProviderInterface(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @abstractmethod
    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,  # 文字列名（dictではない）
    ) -> str: ...  # task_id を返す

    @abstractmethod
    async def check_status(self, task_id: str) -> VideoStatus: ...

    @abstractmethod
    async def get_video_url(self, task_id: str) -> Optional[str]: ...

    @property
    def supports_v2v(self) -> bool: ...  # デフォルト False

    async def extend_video(...) -> str: ...  # V2V用（オプション）

    async def download_video_bytes(task_id: str) -> Optional[bytes]: ...
```

### VideoStatus（戻り値）
```python
@dataclass
class VideoStatus:
    status: VideoGenerationStatus  # Enum
    progress: int  # 0-100
    video_url: Optional[str] = None
    error_message: Optional[str] = None

class VideoGenerationStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
```

## 実装フェーズ

### Phase 1: 基盤実装（優先度: 高）

#### 1.1 環境変数の追加

**ファイル: `.env.example`, `.env`**
```env
# PiAPI Configuration
PIAPI_API_KEY=your_piapi_api_key_here
PIAPI_KLING_VERSION=2.6
PIAPI_KLING_MODE=std
```

**ファイル: `app/core/config.py`**
```python
# PiAPI Settings
PIAPI_API_KEY: str | None = None
PIAPI_KLING_VERSION: str = "2.6"
PIAPI_KLING_MODE: str = "std"  # "std" or "pro"
```

#### 1.2 PiAPI Kling プロバイダーの実装

**ファイル: `app/external/piapi_kling_provider.py`**

```python
"""
PiAPI Kling Video Provider

PiAPI経由でKling AIの動画生成機能を利用するプロバイダー。
VideoProviderInterface を実装。
"""
import httpx
import logging
from typing import Optional

from app.core.config import settings
from app.external.video_provider import (
    VideoProviderInterface,
    VideoStatus,
    VideoGenerationStatus,
    VideoProviderError,
)

logger = logging.getLogger(__name__)

PIAPI_BASE_URL = "https://api.piapi.ai/api/v1"


# ============================================================================
# カメラワーク名 → PiAPI Kling camera_control 形式マッピング
# ============================================================================
# 既存の kling.py から完全移植（PiAPI形式に変換）
# 値: {"type": "simple", "config": {...}} または None（カメラ制御なし）

def _make_camera_control(horizontal: int = 0, vertical: int = 0, pan: int = 0,
                         tilt: int = 0, roll: int = 0, zoom: int = 0) -> dict:
    """カメラ制御dictを生成するヘルパー"""
    return {
        "type": "simple",
        "config": {
            "horizontal": horizontal,
            "vertical": vertical,
            "pan": pan,
            "tilt": tilt,
            "roll": roll,
            "zoom": zoom,
        }
    }

CAMERA_CONTROL_MAPPING: dict[str, dict | None] = {
    # ==========================================
    # 静止 (static) - カメラを動かさない
    # ==========================================
    "static_shot": None,
    "over_the_shoulder": None,

    # ==========================================
    # 近づく・離れる (approach) - zoom, vertical を使用
    # ==========================================
    "zoom_in": _make_camera_control(zoom=5),
    "zoom_out": _make_camera_control(zoom=-5),
    "quick_zoom_in": _make_camera_control(zoom=10),
    "quick_zoom_out": _make_camera_control(zoom=-10),
    "dolly_in": _make_camera_control(vertical=5),
    "dolly_out": _make_camera_control(vertical=-5),
    "push_in": _make_camera_control(vertical=7),
    "pull_out": _make_camera_control(vertical=-7),
    "zoom_in_background": _make_camera_control(zoom=6),
    "zoom_out_landscape": _make_camera_control(zoom=-6),
    "dolly_in_tilt_up": _make_camera_control(vertical=5, tilt=4),
    "dolly_zoom_in": _make_camera_control(vertical=5, zoom=-3),
    "dolly_zoom_out": _make_camera_control(vertical=-5, zoom=3),
    "vertigo_in": _make_camera_control(vertical=6, zoom=-4),
    "vertigo_out": _make_camera_control(vertical=-6, zoom=4),
    "rapid_face_approach": _make_camera_control(vertical=10),
    "dolly_diagonal": _make_camera_control(horizontal=4, vertical=4),
    "slow_approach_building": _make_camera_control(vertical=3),
    "backward_from_character": _make_camera_control(vertical=-5),
    "dolly_out_doorway": _make_camera_control(vertical=-6),
    "zoom_eyes": _make_camera_control(zoom=8),

    # ==========================================
    # 左右に動く (horizontal) - horizontal, pan を使用
    # ==========================================
    "pan_left": _make_camera_control(pan=-5),
    "pan_right": _make_camera_control(pan=5),
    "truck_left": _make_camera_control(horizontal=-5),
    "truck_right": _make_camera_control(horizontal=5),
    "track_left": _make_camera_control(horizontal=-6),
    "track_right": _make_camera_control(horizontal=6),
    "diagonal_up_right": _make_camera_control(horizontal=4, tilt=4),
    "diagonal_down_left": _make_camera_control(horizontal=-4, tilt=-4),
    "pan_quick_left": _make_camera_control(pan=-10),
    "move_through_crowd": _make_camera_control(horizontal=5, vertical=3),
    "curved_path_right": _make_camera_control(horizontal=5, vertical=2, pan=3),
    "curved_path_left": _make_camera_control(horizontal=-5, vertical=2, pan=-3),
    "pan_face_to_surrounding": _make_camera_control(pan=6, zoom=-2),
    "slow_pan_horizon": _make_camera_control(pan=3),

    # ==========================================
    # 上下に動く (vertical) - vertical, tilt を使用
    # ==========================================
    "tilt_up": _make_camera_control(tilt=5),
    "tilt_down": _make_camera_control(tilt=-5),
    "pedestal_up": _make_camera_control(tilt=6),
    "pedestal_down": _make_camera_control(tilt=-6),
    "crane_up": _make_camera_control(tilt=7),
    "crane_down": _make_camera_control(tilt=-7),
    "through_tree_canopy": _make_camera_control(tilt=5),
    "through_branches": _make_camera_control(tilt=6),
    "tilt_feet_to_head": _make_camera_control(tilt=6),
    "tilt_reveal_hidden": _make_camera_control(tilt=-5),
    "tilt_reveal_path": _make_camera_control(tilt=-6),
    "tilt_over_cityscape": _make_camera_control(tilt=-4),
    "quick_tilt_up_sky": _make_camera_control(tilt=10),
    "quick_tilt_down_ground": _make_camera_control(tilt=-10),
    "tilt_zoom_combo": _make_camera_control(tilt=5, zoom=4),
    "jib_up_tilt_down": _make_camera_control(tilt=3),
    "jib_down_tilt_up": _make_camera_control(tilt=5),
    "tilt_head_to_object": _make_camera_control(tilt=-6),

    # ==========================================
    # 回り込む (orbit) - pan, horizontal, roll を組み合わせ
    # ==========================================
    "orbit_clockwise": _make_camera_control(horizontal=5, pan=5),
    "orbit_counterclockwise": _make_camera_control(horizontal=-5, pan=-5),
    "circle_slow": _make_camera_control(horizontal=3, pan=3),
    "orbit_shot": _make_camera_control(horizontal=5, pan=5),
    "360_shot": _make_camera_control(horizontal=7, pan=7),
    "arc_shot": _make_camera_control(horizontal=4, pan=4),
    "arc_left_tilt_up": _make_camera_control(horizontal=-5, pan=-4, tilt=4),
    "arc_right_tilt_down": _make_camera_control(horizontal=5, pan=4, tilt=-4),
    "rotate_vertical": _make_camera_control(tilt=6, roll=3),
    "rotate_left_45": _make_camera_control(horizontal=-3, pan=-3),
    "rotate_right_45": _make_camera_control(horizontal=3, pan=3),
    "rotate_360": _make_camera_control(horizontal=8, pan=8),
    "rotate_looking_up": _make_camera_control(horizontal=5, pan=5, tilt=4),
    "orbit_group": _make_camera_control(horizontal=5, pan=4),
    "circle_statue": _make_camera_control(horizontal=4, pan=4),
    "rotate_table_conversation": _make_camera_control(horizontal=4, pan=4),
    "circle_duel": _make_camera_control(horizontal=6, pan=6),

    # ==========================================
    # 追いかける (follow) - 様々な組み合わせ
    # ==========================================
    "handheld": _make_camera_control(horizontal=1, vertical=1, pan=1, tilt=1, roll=1),
    "shake": _make_camera_control(horizontal=2, vertical=2, roll=2),
    "shake_explosion": _make_camera_control(horizontal=3, vertical=2, roll=3),
    "shake_earthquake": _make_camera_control(horizontal=5, vertical=3, roll=4),
    "steadicam": _make_camera_control(horizontal=3, vertical=3),
    "drone": _make_camera_control(tilt=6, zoom=-3),
    "pov": _make_camera_control(horizontal=2, vertical=3),
    "tracking": _make_camera_control(horizontal=5, vertical=3),
    "follow_behind": _make_camera_control(vertical=4),
    "follow_side": _make_camera_control(horizontal=5, vertical=2),
    "track_hand": _make_camera_control(horizontal=2, tilt=-3, zoom=3),
    "follow_bird": _make_camera_control(tilt=6),
    "track_car": _make_camera_control(horizontal=6, vertical=3, pan=3),
    "follow_running": _make_camera_control(vertical=5),
    "push_narrow": _make_camera_control(vertical=5),
    "backward_hallway": _make_camera_control(vertical=-5),
    "backward_forest": _make_camera_control(vertical=-4),
    "glide_lake": _make_camera_control(horizontal=5, vertical=2),
    "glide_river": _make_camera_control(horizontal=4, vertical=3),
    "glide_desert": _make_camera_control(horizontal=5, vertical=2),
    "glide_ocean_sunset": _make_camera_control(horizontal=4, vertical=2),
    "follow_eye_level": _make_camera_control(horizontal=3, vertical=3),
    "follow_ball": _make_camera_control(horizontal=4, vertical=2, pan=3, tilt=-2),
    "dolly_up_climbing": _make_camera_control(tilt=5),
    "diagonal_through_crowd": _make_camera_control(horizontal=4, vertical=3, pan=2),

    # ==========================================
    # ドラマ演出 (dramatic) - 様々な組み合わせ
    # ==========================================
    "top_shot": _make_camera_control(tilt=-8),
    "hero_shot": _make_camera_control(tilt=5),
    "dutch_angle": _make_camera_control(roll=5),
    "reveal_shot": _make_camera_control(horizontal=4, pan=4),
    "slow_motion": _make_camera_control(zoom=2),
    "zoom_object": _make_camera_control(zoom=6),
    "dramatic_zoom": _make_camera_control(zoom=10),
    "zoom_out_eye_scene": _make_camera_control(zoom=-7),
    "zoom_out_to_crowd": _make_camera_control(zoom=-8),
    "pan_face_surrounding": _make_camera_control(pan=6, zoom=-2),
    "tilt_up_fireworks": _make_camera_control(tilt=7),
    "rotational_shot": _make_camera_control(roll=7),
    "zoom_news_headline": _make_camera_control(zoom=8),
    "slow_motion_leaves": _make_camera_control(tilt=-2, zoom=3),
    "pan_battlefield": _make_camera_control(pan=7),
    "pan_sunset_skyline": _make_camera_control(pan=-5),
    "pan_painting": _make_camera_control(pan=3),
    "pull_back_wide_to_medium": _make_camera_control(vertical=-4),
    "pull_focus_distant": _make_camera_control(zoom=3),
    "rack_focus_fg_bg": _make_camera_control(zoom=2),
    "rack_focus_bg_fg": _make_camera_control(zoom=-2),
    "rack_focus_characters": _make_camera_control(horizontal=3, pan=2),

    # ==========================================
    # 時間表現 (timelapse) - 様々な組み合わせ
    # ==========================================
    "timelapse": _make_camera_control(pan=2),
    "motion_timelapse": _make_camera_control(horizontal=3, pan=3),
    "hyperlapse": _make_camera_control(horizontal=4, vertical=4, pan=2),
}


def _get_camera_control(camera_work: Optional[str]) -> Optional[dict]:
    """カメラワーク名からPiAPI形式のcamera_controlを取得"""
    if not camera_work:
        return None
    return CAMERA_CONTROL_MAPPING.get(camera_work)


class PiAPIKlingProvider(VideoProviderInterface):
    """PiAPI Kling 動画生成プロバイダー"""

    def __init__(self):
        self.api_key = getattr(settings, 'PIAPI_API_KEY', None)
        self.version = getattr(settings, 'PIAPI_KLING_VERSION', '2.6')
        self.mode = getattr(settings, 'PIAPI_KLING_MODE', 'std')

        if not self.api_key:
            raise ValueError("PIAPI_API_KEY must be configured")

    @property
    def provider_name(self) -> str:
        return "piapi_kling"

    @property
    def supports_v2v(self) -> bool:
        """PiAPI Kling は extend_video をサポート"""
        return True

    def _get_headers(self) -> dict:
        """API認証ヘッダーを取得"""
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        PiAPI Kling API で画像から動画を生成

        Args:
            image_url: 入力画像URL
            prompt: 動画生成プロンプト（最大2500文字）
            duration: 動画長さ（5 or 10秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9", "1:1")
            camera_work: カメラワーク名（オプション）

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            # プロンプト長さ制限（2500文字）
            if len(prompt) > 2500:
                prompt = prompt[:2497] + "..."
                logger.warning("Prompt truncated to 2500 chars")

            # リクエストボディを構築
            request_body = {
                "model": "kling",
                "task_type": "video_generation",
                "input": {
                    "prompt": prompt,
                    "image_url": image_url,
                    "duration": duration,
                    "aspect_ratio": aspect_ratio,
                    "mode": self.mode,
                    "version": self.version,
                }
            }

            # カメラ制御を追加（camera_work文字列からdict形式に変換）
            camera_control = _get_camera_control(camera_work)
            if camera_control:
                request_body["input"]["camera_control"] = camera_control
                logger.info(f"Using camera_control for {camera_work}: {camera_control}")

            logger.info(f"PiAPI Kling request: version={self.version}, mode={self.mode}, aspect_ratio={aspect_ratio}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{PIAPI_BASE_URL}/task",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()

                task_id = result.get("data", {}).get("task_id")
                if task_id:
                    logger.info(f"PiAPI Kling task created: {task_id}")
                    return task_id

                logger.error(f"PiAPI response missing task_id: {result}")
                raise VideoProviderError("PiAPI Kling APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI HTTP error: {e.response.status_code} - {e.response.text}")
            try:
                error_data = e.response.json()
                error_msg = error_data.get("message", "")
                if "credit" in error_msg.lower():
                    raise VideoProviderError("PiAPIのクレジットが不足しています。")
                if "rate" in error_msg.lower() or "limit" in error_msg.lower():
                    raise VideoProviderError("PiAPIのレート制限に達しました。しばらく待ってから再試行してください。")
                raise VideoProviderError(f"PiAPI Kling API エラー: {error_msg}")
            except VideoProviderError:
                raise
            except Exception:
                raise VideoProviderError(f"PiAPI Kling API エラー: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"PiAPI Kling generation failed: {e}")
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
                    f"{PIAPI_BASE_URL}/task/{task_id}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                result = response.json()

            data = result.get("data", {})
            status_str = data.get("status", "")

            # PiAPIステータス → VideoGenerationStatus 変換
            status_mapping = {
                "Completed": VideoGenerationStatus.COMPLETED,
                "Processing": VideoGenerationStatus.PROCESSING,
                "Pending": VideoGenerationStatus.PENDING,
                "Staged": VideoGenerationStatus.PENDING,
                "Failed": VideoGenerationStatus.FAILED,
            }
            internal_status = status_mapping.get(status_str, VideoGenerationStatus.PROCESSING)

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
                # PiAPI Kling のレスポンス構造から動画URLを取得
                # 注意: 実際のレスポンス構造は要確認（複数パターンに対応）
                output = data.get("output", {})
                video_url = (
                    output.get("video_url") or
                    output.get("video", {}).get("url") or
                    (output.get("works", [{}])[0].get("video", {}).get("url") if output.get("works") else None)
                )
                if video_url:
                    logger.info(f"PiAPI Kling task completed: {video_url}")
                else:
                    logger.warning(f"PiAPI Kling completed but no video_url found: {output}")

            elif internal_status == VideoGenerationStatus.FAILED:
                error_data = data.get("error", {})
                error_message = error_data.get("message", "動画生成に失敗しました")
                logger.error(f"PiAPI Kling task failed: {error_message}")

            return VideoStatus(
                status=internal_status,
                progress=progress,
                video_url=video_url,
                error_message=error_message,
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI status check HTTP error: {e.response.status_code}")
            return VideoStatus(
                status=VideoGenerationStatus.FAILED,
                progress=0,
                error_message=f"ステータス確認に失敗しました: {e.response.status_code}",
            )
        except Exception as e:
            logger.exception(f"PiAPI status check failed: {e}")
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

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        PiAPI Kling の Video Extend 機能を使用

        Args:
            video_url: 入力動画のURL
            prompt: 動画生成プロンプト
            aspect_ratio: アスペクト比

        Returns:
            str: タスクID

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        try:
            request_body = {
                "model": "kling",
                "task_type": "extend_video",
                "input": {
                    "prompt": prompt,
                    "video_url": video_url,
                    "aspect_ratio": aspect_ratio,
                    "mode": self.mode,
                    "version": self.version,
                }
            }

            logger.info(f"PiAPI Kling extend_video request: aspect_ratio={aspect_ratio}")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{PIAPI_BASE_URL}/task",
                    headers=self._get_headers(),
                    json=request_body,
                    timeout=60.0,
                )
                response.raise_for_status()
                result = response.json()

                task_id = result.get("data", {}).get("task_id")
                if task_id:
                    logger.info(f"PiAPI Kling extend task created: {task_id}")
                    return task_id

                raise VideoProviderError("PiAPI Kling Extend APIからタスクIDが返されませんでした")

        except httpx.HTTPStatusError as e:
            logger.error(f"PiAPI extend HTTP error: {e.response.status_code} - {e.response.text}")
            raise VideoProviderError(f"動画延長に失敗しました: {e.response.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            logger.exception(f"PiAPI Kling extend failed: {e}")
            raise VideoProviderError(f"動画延長に失敗しました: {str(e)}")

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了した動画をバイト形式でダウンロード

        Args:
            task_id: タスクID

        Returns:
            bytes: 動画コンテンツ（失敗時はNone）
        """
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

#### 1.3 プロバイダー登録

**ファイル: `app/external/video_provider.py`**

`get_video_provider()` 関数を修正:

```python
def get_video_provider(provider_name: Optional[str] = None) -> VideoProviderInterface:
    """
    設定に応じた動画生成プロバイダーを返すファクトリー関数

    Args:
        provider_name: プロバイダー名（"runway", "veo", "domoai", "piapi_kling"）
    """
    if provider_name is None:
        from app.core.config import settings
        provider_name = getattr(settings, 'VIDEO_PROVIDER', 'runway')

    provider_name = provider_name.lower()

    if provider_name == "piapi_kling":
        from app.external.piapi_kling_provider import PiAPIKlingProvider
        logger.info("Using PiAPI Kling video provider")
        return PiAPIKlingProvider()
    elif provider_name == "domoai":
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

### Phase 2: フロントエンド対応（優先度: 中）

#### 2.1 プロバイダー選択UIの更新

**ファイル: `movie-maker/lib/types/video.ts`**

```typescript
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling';

export const VIDEO_PROVIDERS = {
  runway: { label: 'Runway Gen-3', description: '高品質・安定' },
  veo: { label: 'Google Veo', description: 'Google製・実験的' },
  domoai: { label: 'DomoAI', description: 'アニメ特化' },
  piapi_kling: { label: 'Kling AI', description: '低コスト・高品質' },
} as const;
```

### Phase 3: テスト（優先度: 高）

#### 3.1 単体テスト

**ファイル: `tests/external/test_piapi_kling_provider.py`**

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.external.piapi_kling_provider import PiAPIKlingProvider, _get_camera_control
from app.external.video_provider import VideoGenerationStatus


class TestCameraControlMapping:
    """カメラ制御マッピングのテスト"""

    def test_zoom_in(self):
        result = _get_camera_control("zoom_in")
        assert result is not None
        assert result["type"] == "simple"
        assert result["config"]["zoom"] == 5

    def test_unknown_camera_work(self):
        result = _get_camera_control("unknown_camera")
        assert result is None

    def test_none_camera_work(self):
        result = _get_camera_control(None)
        assert result is None


class TestPiAPIKlingProvider:
    """PiAPIKlingProvider のテスト"""

    @pytest.fixture
    def mock_settings(self):
        with patch('app.external.piapi_kling_provider.settings') as mock:
            mock.PIAPI_API_KEY = "test_api_key"
            mock.PIAPI_KLING_VERSION = "2.6"
            mock.PIAPI_KLING_MODE = "std"
            yield mock

    @pytest.fixture
    def provider(self, mock_settings):
        return PiAPIKlingProvider()

    def test_provider_name(self, provider):
        assert provider.provider_name == "piapi_kling"

    def test_supports_v2v(self, provider):
        assert provider.supports_v2v is True

    @pytest.mark.asyncio
    async def test_generate_video_success(self, provider):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {"task_id": "test_task_123"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            task_id = await provider.generate_video(
                image_url="https://example.com/image.jpg",
                prompt="Test prompt",
                aspect_ratio="9:16",
            )

            assert task_id == "test_task_123"

    @pytest.mark.asyncio
    async def test_check_status_completed(self, provider):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "Completed",
                "output": {"video_url": "https://example.com/video.mp4"}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.COMPLETED
            assert status.video_url == "https://example.com/video.mp4"
            assert status.progress == 100

    @pytest.mark.asyncio
    async def test_check_status_failed(self, provider):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "code": 200,
            "data": {
                "status": "Failed",
                "error": {"message": "Generation failed"}
            }
        }
        mock_response.raise_for_status = MagicMock()

        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            status = await provider.check_status("test_task_123")

            assert status.status == VideoGenerationStatus.FAILED
            assert "Generation failed" in status.error_message
```

#### 3.2 統合テスト（手動実行用）

```python
# tests/external/test_piapi_kling_integration.py

import pytest
import os
import asyncio

@pytest.mark.skipif(
    not os.getenv("PIAPI_API_KEY"),
    reason="PIAPI_API_KEY not set"
)
class TestPiAPIKlingIntegration:
    """実際のAPIを使った統合テスト（手動実行用）"""

    @pytest.mark.asyncio
    async def test_real_video_generation(self):
        from app.external.piapi_kling_provider import PiAPIKlingProvider

        provider = PiAPIKlingProvider()

        # テスト用の画像URL（実際の画像URLに置き換え）
        test_image_url = "https://your-test-image-url.jpg"

        task_id = await provider.generate_video(
            image_url=test_image_url,
            prompt="A gentle breeze moves through the scene, cinematic quality",
            aspect_ratio="9:16",
            camera_work="zoom_in",
        )

        assert task_id is not None
        print(f"Task ID: {task_id}")

        # ステータス確認（完了まで待機しない）
        status = await provider.check_status(task_id)
        print(f"Status: {status}")
        assert status.status in [
            VideoGenerationStatus.PENDING,
            VideoGenerationStatus.PROCESSING,
        ]
```

## 実装スケジュール

| フェーズ | 作業内容 | 見積もり |
|---------|---------|---------|
| Phase 1 | 基盤実装（プロバイダー + 設定 + 登録） | 1.5-2時間 |
| Phase 2 | フロントエンド対応 | 30分 |
| Phase 3 | テスト | 1時間 |
| **合計** | | **3-3.5時間** |

## 切り替え方法

### 環境変数で切り替え

```env
# デフォルトプロバイダーを変更
VIDEO_PROVIDER=piapi_kling
```

### リクエストごとに切り替え

フロントエンドからプロバイダーを指定:
```typescript
storyboardApi.generate(storyboardId, {
  video_provider: 'piapi_kling',
  // ...
});
```

## リスクと対策

| リスク | 対策 |
|--------|------|
| PiAPI サービス障害 | フォールバックでRunwayに切り替え |
| レート制限 | 同時実行数を制限（Free: 2, Creator: 5） |
| 動画品質の差異 | proモードへの切り替えオプション |
| 透かし（ウォーターマーク） | Creator以上のプランで削除可能 |
| レスポンス構造の変更 | 複数パターンに対応、ログ出力で監視 |

## 実装前チェックリスト

- [ ] PiAPI アカウント作成
- [ ] API Key 取得
- [ ] PiAPI ドキュメントで最新レスポンス構造を確認
- [ ] テスト用クレジットで動作確認
- [ ] 本番環境の環境変数設定

## 次のステップ

1. PiAPI でアカウント作成・API Key 取得
2. Phase 1 の実装開始
3. 単体テスト実行
4. テスト環境で統合テスト
5. 本番デプロイ

---

*作成日: 2026-01-06*
*更新日: 2026-01-06（レビュー後修正：API仕様検証、カメラマッピング完全移植）*
