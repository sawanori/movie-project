"""
動画分析サービス（BGMプロンプト生成用）

動画のフレームを分析してBGM生成に適したプロンプトを生成します。
"""

import logging
import os
import tempfile
import base64
from typing import Optional

import httpx
from google import genai
from google.genai import types

from app.videos.schemas import BGMPromptSuggestion, BGMMood, BGMGenre

logger = logging.getLogger(__name__)

# BPM推定用のマッピング
TEMPO_MAPPING = {
    "slow": (60, 80),
    "medium": (90, 120),
    "fast": (130, 160),
}


class VideoAnalyzer:
    """動画分析サービス"""

    async def analyze_for_bgm(
        self,
        video_path: str,
        cut_points: list[float],
        video_duration: float,
    ) -> BGMPromptSuggestion:
        """
        動画を分析してBGM生成用プロンプトを生成

        Args:
            video_path: 動画ファイルパス
            cut_points: カット位置（秒）のリスト
            video_duration: 動画の総時間（秒）

        Returns:
            BGMPromptSuggestion: BGM生成用の提案
        """
        from app.services.ffmpeg_service import get_ffmpeg_service
        ffmpeg = get_ffmpeg_service()

        # フレーム抽出
        with tempfile.TemporaryDirectory() as temp_dir:
            frame_paths = await self._extract_frames(video_path, temp_dir, num_frames=4)

            # フレームを読み込みBase64エンコード
            frames_base64 = []
            for path in frame_paths:
                with open(path, "rb") as f:
                    frames_base64.append(base64.b64encode(f.read()).decode())

        # カット間隔からテンポを推定
        if len(cut_points) > 1:
            avg_cut_interval = video_duration / len(cut_points)
            if avg_cut_interval < 2.0:
                tempo_category = "fast"
            elif avg_cut_interval < 4.0:
                tempo_category = "medium"
            else:
                tempo_category = "slow"
        else:
            tempo_category = "medium"

        tempo_range = TEMPO_MAPPING[tempo_category]
        estimated_bpm = (tempo_range[0] + tempo_range[1]) // 2

        # Geminiで動画内容を分析
        analysis = await self._analyze_with_gemini(
            frames_base64, video_duration, len(cut_points)
        )

        # プロンプト生成
        prompt = self._build_suno_prompt(
            mood=analysis["mood"],
            genre=analysis["genre"],
            tempo_category=tempo_category,
            duration=int(video_duration),
        )

        return BGMPromptSuggestion(
            mood=BGMMood(analysis["mood"]),
            genre=BGMGenre(analysis["genre"]),
            tempo_bpm=estimated_bpm,
            prompt=prompt,
            reasoning=analysis["reasoning"],
        )

    async def _extract_frames(
        self,
        video_path: str,
        output_dir: str,
        num_frames: int = 4,
    ) -> list[str]:
        """
        動画から等間隔でフレームを抽出

        Args:
            video_path: 入力動画パス
            output_dir: 出力ディレクトリ
            num_frames: 抽出フレーム数

        Returns:
            list[str]: 抽出したフレームのパスリスト
        """
        import subprocess
        import json

        # 動画の長さを取得
        probe_cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            video_path
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        duration = float(data["format"]["duration"])

        interval = duration / (num_frames + 1)

        frame_paths = []
        for i in range(1, num_frames + 1):
            timestamp = interval * i
            output_path = os.path.join(output_dir, f"frame_{i:02d}.jpg")

            cmd = [
                "ffmpeg", "-y",
                "-ss", str(timestamp),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",
                output_path
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            frame_paths.append(output_path)

        return frame_paths

    async def _analyze_with_gemini(
        self,
        frames_base64: list[str],
        duration: float,
        num_cuts: int,
    ) -> dict:
        """Geminiで動画フレームを分析"""
        from app.core.config import settings

        prompt = f"""
あなたは映像のBGM選定の専門家です。
以下の動画フレーム（{len(frames_base64)}枚）を分析し、適切なBGMの特徴を提案してください。

動画情報:
- 長さ: {duration:.1f}秒
- カット数: {num_cuts}

以下のJSON形式で回答してください。JSON以外の文字は含めないでください:
{{
    "mood": "upbeat" | "calm" | "dramatic" | "energetic" | "melancholic" | "cinematic",
    "genre": "electronic" | "acoustic" | "orchestral" | "pop" | "rock" | "ambient",
    "reasoning": "選択理由（日本語、50文字以内）"
}}
"""

        try:
            client = genai.Client(api_key=settings.GOOGLE_API_KEY)

            # 画像パーツを作成
            parts = [prompt]
            for img_b64 in frames_base64:
                img_bytes = base64.b64decode(img_b64)
                parts.append(types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"))

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=parts,
                config=types.GenerateContentConfig(temperature=0.3)
            )

            response_text = response.text.strip()

            # JSONを抽出（Markdownコードブロックを除去）
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            import json
            return json.loads(response_text)

        except Exception as e:
            logger.exception(f"Failed to analyze video with Gemini: {e}")
            # パースに失敗したらデフォルト値
            return {
                "mood": "cinematic",
                "genre": "orchestral",
                "reasoning": "デフォルト設定を使用"
            }

    def _build_suno_prompt(
        self,
        mood: str,
        genre: str,
        tempo_category: str,
        duration: int,
    ) -> str:
        """Suno用のプロンプトを構築"""

        tempo_desc = {
            "slow": "slow tempo, 70 BPM",
            "medium": "medium tempo, 110 BPM",
            "fast": "fast tempo, 140 BPM",
        }

        # ムードとジャンルの組み合わせに基づく詳細プロンプト
        mood_descriptions = {
            "upbeat": "bright, cheerful, positive energy",
            "calm": "peaceful, relaxing, gentle flow",
            "dramatic": "intense, building tension, powerful",
            "energetic": "high energy, driving beat, exciting",
            "melancholic": "emotional, nostalgic, bittersweet",
            "cinematic": "epic, sweeping, movie-like grandeur",
        }

        genre_descriptions = {
            "electronic": "synthesizers, electronic drums, modern production",
            "acoustic": "real instruments, organic sound, natural warmth",
            "orchestral": "strings, brass, woodwinds, full orchestra",
            "pop": "catchy melodies, modern sound, radio-friendly",
            "rock": "guitars, drums, powerful riffs",
            "ambient": "atmospheric textures, spacious, ethereal",
        }

        mood_desc = mood_descriptions.get(mood, mood)
        genre_desc = genre_descriptions.get(genre, genre)

        return (
            f"{mood} {genre} music, {mood_desc}, {genre_desc}, "
            f"{tempo_desc[tempo_category]}, instrumental, "
            f"{duration} seconds, professional production quality, "
            f"suitable for video background, no vocals"
        )

    async def analyze_video_url(
        self,
        video_url: str,
        cut_points: list[float],
    ) -> BGMPromptSuggestion:
        """
        URLから動画を取得して分析

        Args:
            video_url: 動画のURL
            cut_points: カット位置のリスト

        Returns:
            BGMPromptSuggestion: BGM生成用の提案
        """
        import subprocess
        import json

        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "video.mp4")

            # ダウンロード
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                response = await client.get(video_url)
                response.raise_for_status()
                with open(video_path, "wb") as f:
                    f.write(response.content)

            # 動画の長さを取得
            probe_cmd = [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                video_path
            ]
            result = subprocess.run(probe_cmd, capture_output=True, text=True)
            data = json.loads(result.stdout)
            duration = float(data["format"]["duration"])

            return await self.analyze_for_bgm(video_path, cut_points, duration)


# シングルトン
video_analyzer = VideoAnalyzer()
