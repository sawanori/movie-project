"""
fal.ai Background Removal Provider

fal.ai のキュー型 API 経由で動画・画像の背景削除を行うプロバイダー。

API フロー:
1. POST https://queue.fal.run/{model_id} → {request_id, status_url, response_url}
2. GET {status_url} をポーリング → IN_QUEUE | IN_PROGRESS | COMPLETED
3. GET {response_url} → 結果 JSON（動画/画像 URL）

API Documentation: https://docs.fal.ai/model-apis/queue
"""
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

FAL_QUEUE_BASE_URL = "https://queue.fal.run"

# status_url / response_url の読み戻し時に許可するホスト
# （DB に永続化した URL を使うため、ホスト検証で外部 URL 注入を防止する）
FAL_ALLOWED_HOST = "queue.fal.run"

# 結果ファイルのダウンロード時に許可するホスト（fal.ai の配信ドメイン）
# ※ これに加えて *.fal.media のサブドメインも許可する
# ※ temp.bria.ai: Bria はパートナーモデルのため結果を自社 CDN で配信する（実 API で確認済み）
RESULT_URL_ALLOWED_HOSTS = ("fal.media", "v3.fal.media", "queue.fal.run", "temp.bria.ai")

# 結果 JSON から再帰探索で抽出するメディア URL の拡張子
KNOWN_MEDIA_EXTENSIONS = (
    ".webm",
    ".mp4",
    ".mov",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
)

# タイムアウト設定
SUBMIT_TIMEOUT_SECONDS = 60.0
STATUS_TIMEOUT_SECONDS = 30.0


# 5xx エラーメッセージに含める detail の最大文字数
ERROR_DETAIL_MAX_LENGTH = 100


class FalProviderError(Exception):
    """fal.ai プロバイダーのエラー（ユーザー向けメッセージに人間化済み）

    Attributes:
        retryable: True の場合は一時エラー（同一リクエストの再投入で回復する可能性がある）
    """

    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


@dataclass
class FalJobRef:
    """fal.ai キュージョブの参照情報（submit レスポンスの URL をそのまま保持）"""
    request_id: str
    status_url: str
    response_url: str


@dataclass
class FalJobStatus:
    """fal.ai ジョブのステータス"""
    status: str                          # "pending" | "processing" | "completed" | "failed"
    progress: int                        # IN_QUEUE=0, IN_PROGRESS=50, COMPLETED=100（擬似値）
    result_url: Optional[str] = None     # 完了時のみ
    error_message: Optional[str] = None


def _humanize_http_error(e: httpx.HTTPStatusError) -> FalProviderError:
    """HTTP エラーをユーザー向けの日本語メッセージに変換する"""
    status_code = e.response.status_code

    if status_code in (401, 403):
        return FalProviderError("fal.aiのAPIキーが無効か、残高が不足しています")
    if status_code in (402, 429):
        return FalProviderError("fal.aiのクレジット不足またはレート制限です")
    if status_code == 422:
        detail = ""
        try:
            detail = str(e.response.json().get("detail", e.response.text))
        except Exception:
            detail = e.response.text
        return FalProviderError(f"fal.aiへのリクエストが不正です: {detail}")
    if status_code >= 500:
        # fal.ai 側の一時障害（再投入で回復する場合がある）→ retryable=True
        # レスポンス body に detail があればメッセージに含める
        detail = ""
        try:
            payload = e.response.json()
            if isinstance(payload, dict):
                detail = str(payload.get("detail") or "").strip()
        except Exception:
            detail = ""
        if detail:
            return FalProviderError(
                f"fal.ai側のエラーが発生しました（{detail[:ERROR_DETAIL_MAX_LENGTH]}）",
                retryable=True,
            )
        return FalProviderError("fal.ai側のエラーが発生しました", retryable=True)
    return FalProviderError(f"fal.ai APIエラー: {status_code}")


def validate_result_url(url: str) -> None:
    """
    結果ファイル URL のホストが fal.ai の配信ドメインであることを検証する

    許可: fal.media / v3.fal.media / *.fal.media / queue.fal.run
    （結果 JSON 内の URL をそのままダウンロードするため、SSRF を防止する）
    """
    hostname = urlparse(url).hostname or ""
    if hostname in RESULT_URL_ALLOWED_HOSTS or hostname.endswith(".fal.media"):
        return
    logger.warning(f"fal result URL rejected (host not allowed): {url}")
    raise FalProviderError("fal.aiから不正な結果URLが返されました")


def _match_media_url(value: Any) -> Optional[str]:
    """既知のメディア拡張子で終わる http(s) URL ならそのまま返す（内部用）"""
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        # クエリ / フラグメントを除いたパス部分で拡張子を判定
        path = urlparse(value).path.lower()
        if path.endswith(KNOWN_MEDIA_EXTENSIONS):
            return value
    return None


def _known_key_candidates(result: dict) -> list:
    """結果 JSON の既知のキー形状から URL 候補を優先順で列挙する（内部用）"""
    candidates = []

    video = result.get("video")
    if isinstance(video, dict):
        candidates.append(video.get("url"))

    image = result.get("image")
    if isinstance(image, dict):
        candidates.append(image.get("url"))

    images = result.get("images")
    if isinstance(images, list) and images and isinstance(images[0], dict):
        candidates.append(images[0].get("url"))

    candidates.append(result.get("video_url"))
    candidates.append(result.get("image_url"))

    return [c for c in candidates if c]


def _search_media_url(data: Any) -> Optional[str]:
    """結果 JSON を再帰探索し、既知のメディア拡張子で終わる http(s) URL を抽出する（内部用）"""
    if isinstance(data, str):
        return _match_media_url(data)

    if isinstance(data, dict):
        for value in data.values():
            found = _search_media_url(value)
            if found:
                return found
        return None

    if isinstance(data, list):
        for item in data:
            found = _search_media_url(item)
            if found:
                return found
        return None

    return None


def _extract_media_url(data: Any) -> Optional[str]:
    """
    結果 JSON からメディア URL を抽出する

    既知のキー形状（video.url / image.url / images[0].url / video_url / image_url）を
    優先的に探索し、見つからない場合のみ再帰探索にフォールバックする
    （入力パラメータのエコーバック等を誤って拾わないため）。
    """
    if isinstance(data, dict):
        for candidate in _known_key_candidates(data):
            found = _match_media_url(candidate)
            if found:
                return found

    return _search_media_url(data)


class FalBackgroundRemovalProvider:
    """fal.ai 背景削除プロバイダー"""

    provider_name = "fal"

    def __init__(self):
        self.api_key = settings.FAL_KEY
        self.mock_enabled = settings.BG_REMOVAL_MOCK

        # モックモード用: request_id → source_url の対応表
        self._mock_sources: dict[str, str] = {}

        if not self.api_key and not self.mock_enabled:
            raise ValueError("FAL_KEY must be configured")

    def _get_headers(self) -> dict:
        """API 認証ヘッダーを取得"""
        return {
            "Authorization": f"Key {self.api_key}",
            "Content-Type": "application/json",
        }

    def _validate_fal_url(self, url: str) -> None:
        """status_url / response_url のホストが queue.fal.run であることを検証する"""
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != FAL_ALLOWED_HOST:
            logger.warning(f"fal URL rejected (host not allowed): {url}")
            raise FalProviderError(
                f"不正なfal.ai URLです（{FAL_ALLOWED_HOST} 以外へのアクセスは許可されません）"
            )

    def _make_mock_ref(self, source_url: str) -> FalJobRef:
        """モックモード用のダミー FalJobRef を生成する（外部通信なし）"""
        request_id = f"mock-{uuid.uuid4()}"
        self._mock_sources[request_id] = source_url
        return FalJobRef(
            request_id=request_id,
            status_url="mock",
            response_url="mock",
        )

    async def _submit(self, model_id: str, body: dict) -> FalJobRef:
        """fal.ai キューへジョブを投入し、参照情報を返す（内部用）"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{FAL_QUEUE_BASE_URL}/{model_id}",
                    headers=self._get_headers(),
                    json=body,
                    timeout=SUBMIT_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                result = response.json()

            request_id = result.get("request_id")
            status_url = result.get("status_url")
            response_url = result.get("response_url")

            if not request_id or not status_url or not response_url:
                logger.error(f"fal submit response missing fields: {result}")
                raise FalProviderError("fal.aiからジョブ情報が返されませんでした")

            logger.info(f"fal job submitted: model={model_id}, request_id={request_id}")
            return FalJobRef(
                request_id=request_id,
                status_url=status_url,
                response_url=response_url,
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"fal submit HTTP error: {e.response.status_code} - {e.response.text}")
            raise _humanize_http_error(e)
        except FalProviderError:
            raise
        except httpx.TransportError as e:
            # タイムアウト / 接続エラーは一時的な障害として retryable=True
            logger.exception(f"fal submit transport error: {e}")
            raise FalProviderError(
                f"fal.aiへのジョブ投入に失敗しました: {str(e)}", retryable=True
            )
        except Exception as e:
            logger.exception(f"fal submit failed: {e}")
            raise FalProviderError(f"fal.aiへのジョブ投入に失敗しました: {str(e)}")

    async def submit_video(self, video_url: str) -> FalJobRef:
        """
        動画の背景削除ジョブを投入する

        出力は常に WebM（VP9 アルファ付き）を要求する。
        ※ Bria 側の ProRes 出力（mov_proresks）は内部エラーが頻発し不安定なため
          使用しない。ProRes 4444 が必要な場合は WebM 結果をアルファマットとして
          オリジナルマスターとローカルの ffmpeg で合成する
          （FFmpegService.composite_master_with_alpha_matte を参照）。

        Args:
            video_url: 入力動画の URL

        Returns:
            FalJobRef: ジョブ参照情報
        """
        if self.mock_enabled:
            return self._make_mock_ref(video_url)

        body: dict = {
            "video_url": video_url,
            "background_color": "Transparent",
        }
        return await self._submit(settings.FAL_BG_REMOVAL_VIDEO_MODEL, body)

    async def submit_image(self, image_url: str) -> FalJobRef:
        """
        画像の背景削除ジョブを投入する

        Args:
            image_url: 入力画像の URL

        Returns:
            FalJobRef: ジョブ参照情報
        """
        if self.mock_enabled:
            return self._make_mock_ref(image_url)

        body = {"image_url": image_url}
        return await self._submit(settings.FAL_BG_REMOVAL_IMAGE_MODEL, body)

    async def check_status(self, ref: FalJobRef) -> FalJobStatus:
        """
        ジョブのステータスを確認する

        COMPLETED の場合は response_url から結果を取得し result_url を抽出する。

        Args:
            ref: ジョブ参照情報

        Returns:
            FalJobStatus: 現在のステータス情報
        """
        if self.mock_enabled:
            # モックモード: 即完了として source_url をそのまま結果に返す
            return FalJobStatus(
                status="completed",
                progress=100,
                result_url=self._mock_sources.get(ref.request_id),
                error_message=None,
            )

        try:
            self._validate_fal_url(ref.status_url)

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    ref.status_url,
                    headers=self._get_headers(),
                    timeout=STATUS_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                result = response.json()

            fal_status = result.get("status", "")

            if fal_status == "IN_QUEUE":
                return FalJobStatus(status="pending", progress=0)

            if fal_status == "IN_PROGRESS":
                return FalJobStatus(status="processing", progress=50)

            if fal_status == "COMPLETED":
                result_url = await self._fetch_result_url(ref)
                return FalJobStatus(
                    status="completed",
                    progress=100,
                    result_url=result_url,
                )

            # 未知のステータスは処理中として扱う
            logger.warning(f"fal unknown status: {fal_status} (request_id={ref.request_id})")
            return FalJobStatus(status="processing", progress=50)

        except httpx.HTTPStatusError as e:
            logger.error(f"fal status check HTTP error: {e.response.status_code}")
            raise _humanize_http_error(e)
        except FalProviderError:
            raise
        except httpx.TransportError as e:
            # タイムアウト / 接続エラーは一時的な障害として retryable=True
            logger.exception(f"fal status check transport error: {e}")
            raise FalProviderError(
                f"fal.aiのステータス確認に失敗しました: {str(e)}", retryable=True
            )
        except Exception as e:
            logger.exception(f"fal status check failed: {e}")
            raise FalProviderError(f"fal.aiのステータス確認に失敗しました: {str(e)}")

    async def _fetch_result_url(self, ref: FalJobRef) -> str:
        """response_url から結果 JSON を取得し、メディア URL を抽出する（内部用）"""
        self._validate_fal_url(ref.response_url)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                ref.response_url,
                headers=self._get_headers(),
                timeout=STATUS_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            result = response.json()

        result_url = _extract_media_url(result)
        if not result_url:
            logger.error(f"fal result missing media URL: {result}")
            raise FalProviderError("fal.aiの結果から出力ファイルのURLを取得できませんでした")

        logger.info(f"fal job completed: request_id={ref.request_id}, result_url={result_url}")
        return result_url
