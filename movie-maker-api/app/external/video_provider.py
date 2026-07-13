"""
動画生成プロバイダー共通インターフェース

Runway API と Google Veo API を統一的に扱うための抽象化レイヤー
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional
import asyncio
import logging

logger = logging.getLogger(__name__)


class VideoGenerationStatus(str, Enum):
    """動画生成ステータス"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class VideoStatus:
    """動画生成ステータス情報"""
    status: VideoGenerationStatus
    progress: int  # 0-100
    video_url: Optional[str] = None
    error_message: Optional[str] = None


class VideoProviderError(Exception):
    """動画生成プロバイダーエラー（ユーザー向けメッセージ付き）"""
    pass


class VideoProviderInterface(ABC):
    """動画生成プロバイダーの共通インターフェース"""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """プロバイダー名を返す"""
        pass

    @abstractmethod
    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        動画生成を開始

        Args:
            image_url: 入力画像のURL
            prompt: 動画生成プロンプト
            duration: 動画長さ（秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9")
            camera_work: カメラワーク指定（オプション）

        Returns:
            str: task_id（ポーリング用識別子）

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        pass

    @abstractmethod
    async def check_status(self, task_id: str) -> VideoStatus:
        """
        生成状況を確認

        Args:
            task_id: generate_video()で返されたタスクID

        Returns:
            VideoStatus: 現在のステータス情報
        """
        pass

    @abstractmethod
    async def get_video_url(self, task_id: str) -> Optional[str]:
        """
        完了したタスクの動画URLを取得

        Args:
            task_id: タスクID

        Returns:
            str: 動画URL（未完了の場合はNone）
        """
        pass

    @property
    def supports_v2v(self) -> bool:
        """
        Video-to-Video (V2V) 生成のサポート有無

        Returns:
            bool: V2Vをサポートする場合True
        """
        return False

    @property
    def supports_t2v(self) -> bool:
        """
        Text-to-Video (T2V) 生成のサポート有無

        Returns:
            bool: T2Vをサポートする場合True
        """
        return False

    async def generate_video_from_text(
        self,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        テキストプロンプトのみから動画を生成（画像不要）

        Args:
            prompt: 動画生成プロンプト
            duration: 動画長さ（秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9")

        Returns:
            str: task_id（ポーリング用識別子）

        Raises:
            NotImplementedError: T2Vをサポートしないプロバイダーの場合
            VideoProviderError: 生成開始に失敗した場合
        """
        raise NotImplementedError(
            f"T2V not supported by {self.provider_name}"
        )

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """
        V2V: 前の動画から継続して動画を生成

        Args:
            video_url: 入力動画のURL（前のシーンの動画）
            prompt: 動画生成プロンプト
            aspect_ratio: アスペクト比 ("9:16", "16:9")

        Returns:
            str: task_id（ポーリング用識別子）

        Raises:
            NotImplementedError: V2Vをサポートしないプロバイダーの場合
            VideoProviderError: 生成開始に失敗した場合

        Note:
            - Runway: gen4_aleph モデルで実装（5秒固定）
            - VEO: 将来対応予定
        """
        raise NotImplementedError(
            f"V2V is not supported by {self.provider_name} provider"
        )

    async def download_video_bytes(self, task_id: str) -> Optional[bytes]:
        """
        完了した動画をバイト形式でダウンロード

        Args:
            task_id: タスクID

        Returns:
            bytes: 動画コンテンツ（未対応/失敗時はNone）

        Note:
            デフォルト実装はget_video_url()のURLからダウンロード。
            Veoなど認証が必要なプロバイダーはオーバーライド必須。
        """
        import httpx

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


def get_video_provider(provider_name: Optional[str] = None) -> VideoProviderInterface:
    """
    設定に応じた動画生成プロバイダーを返すファクトリー関数

    Args:
        provider_name: プロバイダー名（"runway", "veo", "domoai", "piapi_kling", "hailuo", "seedance"）。
                       指定がなければ環境変数 VIDEO_PROVIDER を使用

    環境変数:
    - GATEWAY_ENABLED=True の場合: GatewayRouter を経由してルーティング
    - GATEWAY_ENABLED=False (デフォルト): 従来の直接プロバイダー選択
    - VIDEO_PROVIDER: デフォルトプロバイダー（"runway", "veo", "domoai", "piapi_kling", "hailuo", "seedance"）

    Returns:
        VideoProviderInterface: 動画生成プロバイダーインスタンス
    """
    from app.core.config import settings

    # GATEWAY_ENABLED=True の場合はゲートウェイ経由でルーティング
    if getattr(settings, 'GATEWAY_ENABLED', False):
        from app.external.gateway_init import get_gateway
        gateway = get_gateway()
        priority = getattr(settings, 'GATEWAY_DEFAULT_PRIORITY', 'quality')
        return gateway._router.route(
            priority=priority,
            capability="i2v",
            preferred_provider=provider_name,
        )

    # 以下は従来の直接プロバイダー選択（GATEWAY_ENABLED=False のデフォルト動作）
    # パラメータ指定があればそれを使用、なければ環境変数から
    if provider_name is None:
        provider_name = getattr(settings, 'VIDEO_PROVIDER', 'runway')

    provider_name = provider_name.lower()

    if provider_name == "piapi_kling":
        from app.external.piapi_kling_provider import PiAPIKlingProvider
        logger.info("Using PiAPI Kling video provider")
        return PiAPIKlingProvider()
    elif provider_name == "seedance":
        from app.external.piapi_seedance_provider import PiAPISeedanceProvider
        logger.info("Using PiAPI Seedance video provider")
        return PiAPISeedanceProvider()
    elif provider_name == "domoai":
        from app.external.domoai_provider import DomoAIProvider
        logger.info("Using DomoAI video provider")
        return DomoAIProvider()
    elif provider_name == "veo":
        from app.external.veo_provider import VeoProvider
        logger.info("Using Veo video provider")
        return VeoProvider()
    elif provider_name == "hailuo":
        from app.external.hailuo_provider import HailuoProvider
        logger.info("Using Hailuo video provider")
        return HailuoProvider()
    else:
        from app.external.runway_provider import RunwayProvider
        logger.info("Using Runway video provider")
        return RunwayProvider()


# ===== おまかせモデル選択 (priority ベース解決) + 送信時フォールバック =====
#
# router で priority ("quality"|"speed"|"cost") を具体的なプロバイダー名に潰し、
# 従来の video_provider フローに乗せる。送信時 (generate_video) の失敗に対して
# 1 回だけランキング次点へフォールバックする。
#
# メタデータ (品質/速度スコア・コスト) の定義は gateway_init.build_registry() に
# 一元化されている。GATEWAY_ENABLED とは独立に動作する (get_video_provider の
# GATEWAY_ENABLED 分岐は変更しない)。

# 送信 (generate_video) 1 回あたりの明示的なタイムアウト (秒)。
# 各プロバイダー内部の submit 用 httpx タイムアウトは 30-60s
# (piapi_seedance=30s, piapi_kling/runway=60s)。それより短い上限を課すことで、
# 応答が滞る第一候補を待ち続けず速やかに次点へフォールバックする。
_FALLBACK_SEND_TIMEOUT_SECONDS = 15.0


def _ranked_provider_names(priority: str, capability: str) -> list[str]:
    """priority/capability でランキングしたプロバイダー名リストを返す。

    gateway_init.build_registry() のメタデータ（唯一の定義箇所）を用いる。
    該当なしなら空リスト。
    """
    from app.external.gateway_init import build_registry

    registry = build_registry()
    return [m.name for m in registry.rank_metadata(priority, capability)]


def _get_provider_for_fallback(name: str) -> VideoProviderInterface:
    """名前からプロバイダーインスタンスを取得する（既存ファクトリーに委譲）。"""
    return get_video_provider(name)


def resolve_provider_with_priority(priority: str, capability: str = "i2v") -> str:
    """優先度に基づいて具体的なプロバイダー名を解決する。

    router 時点で priority ("quality"|"speed"|"cost") を具体名に潰すために使う。
    gateway_init.build_registry() の find_best_metadata で最上位を選ぶ。

    Args:
        priority: 優先基準 ("quality" | "speed" | "cost")
        capability: 必要な機能 ("i2v" | "v2v" | "t2v")

    Returns:
        str: 解決されたプロバイダー名。該当プロバイダーが存在しない場合は
             環境変数 VIDEO_PROVIDER（従来デフォルト）にフォールバックする。
    """
    from app.core.config import settings
    from app.external.gateway_init import build_registry

    registry = build_registry()
    best = registry.find_best_metadata(priority, capability)
    if best is None:
        fallback = getattr(settings, "VIDEO_PROVIDER", "runway").lower()
        logger.warning(
            f"resolve_provider_with_priority: no provider for "
            f"priority={priority}, capability={capability}; "
            f"falling back to VIDEO_PROVIDER={fallback}"
        )
        return fallback
    return best.name


async def submit_with_fallback(
    provider_name: str,
    priority: str,
    capability: str = "i2v",
    *,
    generate_kwargs: dict,
) -> tuple[str, str, bool]:
    """第一候補で動画生成を送信し、送信時例外なら次点で 1 回だけ再送信する。

    フォールバックは「送信時 (generate_video)」のみ。ポーリング中の失敗は対象外。
    次点は priority ランキングで第一候補の次に来るプロバイダー 1 つ。
    次点に渡すのは汎用引数 (generate_kwargs) のみ（プロバイダー固有 extra_params は
    別プロバイダーで解釈できないため story_processor 側で汎用経路のみを通す）。

    Args:
        provider_name: 第一候補プロバイダー名（router で解決済みの具体名）
        priority: 次点選択に使う優先基準 ("quality"|"speed"|"cost")
        capability: ランキング絞り込み用 capability
        generate_kwargs: generate_video に渡す汎用引数
            (image_url, prompt, duration, aspect_ratio, camera_work)

    Returns:
        tuple[str, str, bool]: (task_id, 実使用プロバイダー名, フォールバック発生有無)

    Raises:
        VideoProviderError / Exception: 第一候補・次点の両方が失敗した場合
            （最後に発生した例外を送出）。フォールバックは 1 回だけ。
    """
    provider = _get_provider_for_fallback(provider_name)
    try:
        task_id = await asyncio.wait_for(
            provider.generate_video(**generate_kwargs),
            timeout=_FALLBACK_SEND_TIMEOUT_SECONDS,
        )
        return task_id, provider_name, False
    except asyncio.TimeoutError as first_error:
        logger.warning(
            f"submit_with_fallback: primary provider '{provider_name}' send "
            f"timed out after {_FALLBACK_SEND_TIMEOUT_SECONDS}s; attempting fallback"
        )
    except Exception as first_error:  # noqa: BLE001 - 送信時失敗は次点へフォールバック
        logger.warning(
            f"submit_with_fallback: primary provider '{provider_name}' send "
            f"failed ({first_error}); attempting fallback"
        )

    # 次点を決定（ランキングで第一候補の次）
    ranked = _ranked_provider_names(priority, capability)
    fallback_name = next((n for n in ranked if n != provider_name), None)
    if fallback_name is None:
        logger.error(
            f"submit_with_fallback: no fallback provider available after "
            f"'{provider_name}' failed (priority={priority}, capability={capability})"
        )
        raise VideoProviderError(
            f"動画生成の送信に失敗しました（{provider_name}）。"
            "利用可能な代替プロバイダーがありません。"
        )

    logger.info(
        f"submit_with_fallback: falling back {provider_name} -> {fallback_name}"
    )
    fallback_provider = _get_provider_for_fallback(fallback_name)
    task_id = await asyncio.wait_for(
        fallback_provider.generate_video(**generate_kwargs),
        timeout=_FALLBACK_SEND_TIMEOUT_SECONDS,
    )
    return task_id, fallback_name, True


# VEO非対応カメラワーク → 対応カメラワークへのフォールバック変換
# VEOは「1クリップ1動詞」ルールのため、複合動作をシンプルな動作に変換
VEO_CAMERA_FALLBACK = {
    # orbit系 → arc/dolly に変換（VEOは360°回転が不安定）
    "360_shot": "slow arc shot around subject",
    "orbit_clockwise": "slow arc right around subject",
    "orbit_counterclockwise": "slow arc left around subject",
    "circle_slow": "slow arc around subject",
    "orbit_shot": "slow arc around subject",
    "rotate_360": "slow arc shot around subject",
    "rotate_vertical": "slow tilt up",
    "rotate_looking_up": "slow crane up",
    "rotate_left_45": "slow arc left",
    "rotate_right_45": "slow arc right",
    "orbit_group": "slow arc around subjects",
    "circle_statue": "slow arc around subject",
    "rotate_table_conversation": "slow arc around subjects",
    "circle_duel": "slow arc around subjects",

    # 複合動作 → シンプル動作に変換
    "dolly_zoom_in": "slow dolly in",
    "dolly_zoom_out": "slow dolly out",
    "dolly_in_tilt_up": "slow dolly in",
    "arc_left_tilt_up": "slow arc left",
    "arc_right_tilt_down": "slow arc right",
    "jib_up_tilt_down": "slow crane up",
    "jib_down_tilt_up": "slow crane down",
    "tilt_zoom_combo": "slow zoom in",

    # 特殊効果系 → static/シンプルに変換
    "rotational_shot": "static shot with subtle movement",
    "dutch_angle": "static shot with slight tilt",

    # 追従系 → tracking に統一
    "steadicam": "smooth tracking shot following subject",
    "handheld": "static shot with subtle natural movement",
}


def get_veo_compatible_camera(camera_work: str) -> str:
    """
    VEO用にカメラワークを互換性のある形式に変換

    Args:
        camera_work: 元のカメラワーク名

    Returns:
        str: VEO互換のカメラワーク（変換不要の場合は元の値）
    """
    fallback = VEO_CAMERA_FALLBACK.get(camera_work)
    if fallback:
        logger.info(f"VEO camera fallback: {camera_work} → {fallback}")
        return fallback
    return camera_work


# カメラワーク → プロンプトテキスト マッピング（Runway用）
CAMERA_PROMPT_MAPPING = {
    # ズーム系
    "zoom_in": "slowly zoom in on the subject",
    "zoom_out": "camera zooms out to reveal the scene",
    "slow_zoom_in": "very slow zoom in on the subject",
    "slow_zoom_out": "very slow zoom out from the subject",

    # パン系
    "pan_left": "camera pans left across the scene",
    "pan_right": "camera pans right across the scene",
    "slow_pan_left": "camera slowly pans left",
    "slow_pan_right": "camera slowly pans right",

    # ティルト系
    "tilt_up": "camera tilts up",
    "tilt_down": "camera tilts down",

    # クレーン系
    "crane_up": "crane shot moving upward",
    "crane_down": "crane shot moving downward, looking down at subject",

    # ドリー系
    "dolly_in": "dolly in toward the subject",
    "dolly_out": "dolly out from the subject",
    "dolly_forward": "camera moves forward through the scene",
    "dolly_backward": "camera moves backward through the scene",

    # オービット系
    "orbit_left": "camera orbits left around the subject",
    "orbit_right": "camera orbits right around the subject",

    # 特殊系
    "static": "static camera, locked shot, no movement",
    "handheld": "handheld camera with subtle natural movement",
    "push_in": "camera pushes in toward the subject",
    "pull_out": "camera pulls out from the subject",
    "tracking_shot": "tracking shot following the subject",
    "whip_pan": "whip pan camera movement",
    "dynamic_pan": "dynamic pan camera movement",
    "arc_shot": "arc shot around the subject",
}

# VEO用カメラワークマッピング（VEOマニュアルに準拠したフォーマット）
# VEOは「1クリップ1動詞」ルールで、時間指定付きの具体的な動作を好む
VEO_CAMERA_PROMPT_MAPPING = {
    # ズーム系
    "zoom_in": "slow zoom in over 6s",
    "zoom_out": "slow zoom out over 6s",
    "slow_zoom_in": "very slow zoom in ~10% over 8s",
    "slow_zoom_out": "very slow zoom out ~10% over 8s",

    # パン系
    "pan_left": "slow pan left over 8s",
    "pan_right": "slow pan right over 8s",
    "slow_pan_left": "very slow pan left over 8s",
    "slow_pan_right": "very slow pan right over 8s",

    # ティルト系
    "tilt_up": "slow tilt up over 6s",
    "tilt_down": "slow tilt down over 6s",

    # クレーン系
    "crane_up": "slow vertical rise over 6s",
    "crane_down": "slow vertical descent over 6s",

    # ドリー系
    "dolly_in": "slow dolly-in ~10% over 6s",
    "dolly_out": "slow dolly-out ~10% over 6s",
    "dolly_forward": "slow dolly forward over 6s",
    "dolly_backward": "slow dolly backward over 6s",

    # オービット系（VEOは360度回転が不安定なのでarcに変換）
    "orbit_left": "slow arc left over 8s",
    "orbit_right": "slow arc right over 8s",

    # 特殊系
    "static": "locked-off camera, tripod-steady",
    "handheld": "subtle handheld movement",
    "push_in": "slow push in over 6s",
    "pull_out": "slow pull out over 6s",
    "tracking_shot": "tracking shot parallel at walking speed",
    "whip_pan": "quick pan left",
    "dynamic_pan": "dynamic pan movement",
    "arc_shot": "slow arc shot over 8s",
}


def build_prompt_with_camera(
    base_prompt: str,
    camera_work: Optional[str] = None,
    provider: str = "runway"
) -> str:
    """
    カメラワークをプロンプトに追加（プロバイダー対応）

    Args:
        base_prompt: ベースプロンプト
        camera_work: カメラワーク名またはプロンプトテキスト
        provider: 動画生成プロバイダー（"runway", "veo", "domoai", "piapi_kling"）

    Returns:
        str: カメラワーク情報を含むプロンプト
    """
    if not camera_work:
        return base_prompt

    # VEOの場合
    if provider == "veo":
        # フォールバック変換を適用
        camera_work = get_veo_compatible_camera(camera_work)

        # VEO用マッピングを試す
        camera_text = VEO_CAMERA_PROMPT_MAPPING.get(camera_work)
        if camera_text:
            # VEOはカメラワークをシーン記述の先頭に自然に統合
            # 例: "Medium shot, slow dolly-in over 6s. [ベースプロンプト]"
            logger.info(f"VEO camera prompt: {camera_text}")
            return f"Medium shot, {camera_text}. {base_prompt}"
        else:
            # マッピングにない場合（生のプロンプトテキストが渡された場合）
            # VEOマニュアル形式に合わせて統合
            logger.info(f"VEO using raw camera_work: {camera_work}")
            # "slow zoom in on the protagonist" のような形式をそのまま使用
            return f"Medium shot, {camera_work}. {base_prompt}"

    # Runway/その他の場合
    camera_text = CAMERA_PROMPT_MAPPING.get(camera_work)
    if camera_text:
        return f"{base_prompt} Camera: {camera_text}."
    else:
        # マッピングにない場合はそのまま使用
        logger.info(f"Using camera_work as raw prompt: {camera_work}")
        return f"{base_prompt} Camera: {camera_work}."
