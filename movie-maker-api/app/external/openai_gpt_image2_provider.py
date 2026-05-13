"""
OpenAI GPT Image 2 画像生成プロバイダー

公式 openai Python SDK を使用して gpt-image-2 モデルで画像生成する。
レスポンスは base64 のみのため、R2へのアップロードが必須。

前提条件:
- OPENAI_API_KEY が設定済みであること
- OpenAI 組織の Org Verification が完了していること（未確認時は 403 エラー）

API仕様: https://platform.openai.com/docs/api-reference/images
"""
import base64
import logging
from typing import Optional
from uuid import uuid4

import openai
from botocore.exceptions import ClientError

from app.core.config import settings
from app.external.r2 import upload_image
from app.external.video_provider import VideoProviderError

logger = logging.getLogger(__name__)

# gpt-image-2 でサポートされるサイズ
SUPPORTED_SIZES = {
    "1024x1024", "1536x1024", "1024x1536",
    "2048x2048", "2048x1152", "3840x2160", "2160x3840", "auto",
}

# アスペクト比 → デフォルトサイズ マッピング
ASPECT_RATIO_TO_SIZE: dict[str, str] = {
    "9:16": "1024x1536",
    "16:9": "1536x1024",
    "1:1": "1024x1024",
}


class OpenAIGPTImage2Provider:
    """OpenAI GPT Image 2 画像生成プロバイダー"""

    def __init__(self) -> None:
        self.api_key: str = settings.OPENAI_API_KEY
        self.model: str = settings.OPENAI_IMAGE_MODEL
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY must be configured")

    async def generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        quality: str = "auto",
        output_format: str = "png",
        size: Optional[str] = None,
        n: int = 1,
    ) -> str:
        """
        GPT Image 2 で画像を生成し R2 URL を返す

        Args:
            prompt: 英語プロンプト（事前翻訳済み）
            aspect_ratio: アスペクト比 ("9:16", "16:9", "1:1")
            quality: 品質 ("low", "medium", "high", "auto")
            output_format: 出力形式 ("png", "jpeg", "webp")
            size: サイズ（Noneの場合 aspect_ratio から自動決定）
            n: 生成枚数

        Returns:
            str: R2 にアップロードされた画像の公開 URL

        Raises:
            ValueError: 生成失敗 / モデレーション拒否 / Org未確認
        """
        try:
            client = openai.AsyncOpenAI(api_key=self.api_key)
            resolved_size = self._resolve_size(aspect_ratio, size)
            response = await client.images.generate(
                model=self.model,
                prompt=prompt,
                n=n,
                size=resolved_size,
                quality=quality,
                output_format=output_format,
            )
            b64 = response.data[0].b64_json
            image_bytes = base64.b64decode(b64)
            return await self._upload_to_r2(image_bytes, output_format)

        except openai.PermissionDeniedError:
            raise ValueError(
                "OpenAI の組織確認が完了していません。OpenAI ダッシュボードで Org Verification を完了してください。"
            )
        except openai.BadRequestError as e:
            # gpt-image-2 のモデレーションコード: "moderation_blocked"
            # 旧 DALL-E / 他モデルの互換: "content_policy_violation"
            error_code = str(getattr(e, "code", "") or "")
            if error_code in ("moderation_blocked", "content_policy_violation"):
                raise ValueError(
                    "画像の生成がコンテンツポリシーにより拒否されました。プロンプトを変更して再試行してください。"
                )
            raise ValueError(f"GPT Image 2 API エラー: {e.status_code}")
        except openai.RateLimitError:
            raise ValueError(
                "OpenAI API のレート制限に達しました。しばらく待ってから再試行してください。"
            )
        except openai.APIStatusError as e:
            raise ValueError(f"GPT Image 2 API エラー: {e.status_code}")
        except VideoProviderError:
            raise
        except Exception as e:
            raise ValueError(f"画像生成に失敗しました: {str(e)}")

    async def _upload_to_r2(self, image_bytes: bytes, output_format: str) -> str:
        """
        画像バイトを R2 にアップロードし公開 URL を返す

        Args:
            image_bytes: base64デコード済みバイト列
            output_format: 拡張子決定用 ("png", "jpeg", "webp")

        Returns:
            str: R2 公開 URL
        """
        filename = f"generated/gpt2_{uuid4().hex}.{output_format}"
        try:
            url = await upload_image(image_bytes, filename)
        except ClientError as e:
            logger.error(f"R2 upload failed: {e}")
            raise VideoProviderError("生成された画像のアップロードに失敗しました。再試行してください。")
        return url

    def _resolve_size(self, aspect_ratio: str, size: Optional[str]) -> str:
        """アスペクト比またはサイズ指定を解決する"""
        if size and size in SUPPORTED_SIZES:
            return size
        return ASPECT_RATIO_TO_SIZE.get(aspect_ratio, "auto")
