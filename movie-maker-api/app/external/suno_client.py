"""
Suno API クライアント

サードパーティプロバイダー（SunoAPI.org）を使用してAI音楽を生成します。
公式SunoはAPIを公開していないため、サードパーティを使用。

Note: SunoAPI.orgはコールバック方式のAPIのため、
生成リクエスト後はwebhookでコールバックを受け取り、DBに保存します。
ステータス確認はDBから行います。
"""

import httpx
import logging
from typing import Optional
from pydantic import BaseModel
from app.core.config import settings

logger = logging.getLogger(__name__)


class SunoGenerationResult(BaseModel):
    """Suno生成結果"""
    task_id: str
    status: str  # pending, processing, completed, failed
    audio_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None


class SunoAPIError(Exception):
    """Suno API エラー"""
    pass


class SunoClient:
    """Suno API サードパーティクライアント (SunoAPI.org)"""

    # Supported models
    MODELS = ["V3_5", "V4", "V4_5", "V4_5ALL", "V4_5PLUS", "V5"]

    def __init__(self):
        self.base_url = settings.SUNO_API_BASE_URL.rstrip("/")
        self.api_key = settings.SUNO_API_KEY
        self.backend_url = settings.BACKEND_URL.rstrip("/")
        self.timeout = 60.0

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _get_callback_url(self, bgm_generation_id: str) -> str:
        """Get the callback URL for Suno to send results to."""
        return f"{self.backend_url}/api/v1/webhooks/suno?bgm_id={bgm_generation_id}"

    async def generate_music(
        self,
        prompt: str,
        bgm_generation_id: str,
        make_instrumental: bool = True,
        model: str = "V3_5",
    ) -> SunoGenerationResult:
        """
        BGMを生成

        Args:
            prompt: 音楽の説明（英語推奨）
            bgm_generation_id: BGM生成レコードID（コールバック識別用）
            make_instrumental: インストゥルメンタルのみ（歌詞なし）
            model: 使用モデル（V3_5, V4, V4_5, etc.）

        Returns:
            SunoGenerationResult: タスクID含む結果

        Raises:
            SunoAPIError: API呼び出し失敗時
        """
        if not self.api_key:
            raise SunoAPIError("SUNO_API_KEY が設定されていません")

        if model not in self.MODELS:
            model = "V3_5"

        logger.info(f"Generating music with prompt: {prompt[:100]}...")

        callback_url = self._get_callback_url(bgm_generation_id)
        logger.info(f"Callback URL: {callback_url}")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                payload = {
                    "prompt": prompt,
                    "customMode": False,  # Use description mode
                    "instrumental": make_instrumental,
                    "model": model,
                    "callBackUrl": callback_url,
                }

                response = await client.post(
                    f"{self.base_url}/api/v1/generate",
                    headers=self._get_headers(),
                    json=payload,
                )

                data = response.json()

                # SunoAPI.org returns {"code": 200, "msg": "success", "data": {"taskId": "..."}}
                if data.get("code") != 200:
                    error_msg = data.get("msg", "Unknown error")
                    logger.error(f"Suno API error: {error_msg}")
                    raise SunoAPIError(f"Suno API エラー: {error_msg}")

                task_id = data.get("data", {}).get("taskId")
                if not task_id:
                    raise SunoAPIError("タスクIDが取得できませんでした")

                logger.info(f"Music generation started: task_id={task_id}")

                return SunoGenerationResult(
                    task_id=task_id,
                    status="pending",
                )
        except SunoAPIError:
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"Suno API error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                raise SunoAPIError("Suno APIキーが無効です")
            elif e.response.status_code == 402:
                raise SunoAPIError("Sunoクレジットが不足しています")
            elif e.response.status_code == 429:
                raise SunoAPIError("Sunoレート制限に達しました")
            raise SunoAPIError(f"Suno API エラー: {e.response.status_code}")
        except httpx.TimeoutException:
            logger.error("Suno API timeout")
            raise SunoAPIError("Suno APIがタイムアウトしました")
        except Exception as e:
            logger.exception(f"Suno API call failed: {e}")
            raise SunoAPIError(f"音楽生成に失敗: {str(e)}")

    async def download_audio(self, audio_url: str) -> bytes:
        """
        生成された音声をダウンロード

        Args:
            audio_url: 音声ファイルのURL

        Returns:
            bytes: 音声ファイルのバイナリデータ

        Raises:
            SunoAPIError: ダウンロード失敗時
        """
        try:
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                response = await client.get(audio_url)
                response.raise_for_status()
                logger.info(f"Downloaded audio: {len(response.content)} bytes")
                return response.content
        except Exception as e:
            logger.exception(f"Audio download failed: {e}")
            raise SunoAPIError(f"音声ダウンロードに失敗: {str(e)}")

    async def health_check(self) -> bool:
        """
        API接続確認

        Note: SunoAPI.orgにはヘルスチェックエンドポイントがないため、
        generateエンドポイントにGETリクエストを送り、適切なエラーが返れば接続成功とみなす

        Returns:
            bool: 接続成功の場合True
        """
        if not self.api_key:
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # /api/v1/generate にGETを送ると
                # {"code":404,"msg":"GET request not supported"} が返る
                # これが返れば接続OK
                response = await client.get(
                    f"{self.base_url}/api/v1/generate",
                    headers=self._get_headers(),
                )
                data = response.json()
                # code=404でmsg="GET request not supported"なら接続成功
                if data.get("code") == 404 and "not supported" in data.get("msg", "").lower():
                    return True
                return False
        except Exception as e:
            logger.warning(f"Suno API health check failed: {e}")
            return False


# シングルトンインスタンス
suno_client = SunoClient()
