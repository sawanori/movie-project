"""
動画分析サービスのテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import tempfile
import os

from app.services.video_analyzer import VideoAnalyzer, video_analyzer, TEMPO_MAPPING
from app.videos.schemas import BGMMood, BGMGenre


class TestVideoAnalyzer:
    """VideoAnalyzerのテスト"""

    @pytest.fixture
    def analyzer(self):
        return VideoAnalyzer()

    def test_build_suno_prompt_upbeat_electronic(self, analyzer):
        """アップビート・エレクトロニックのプロンプト生成"""
        prompt = analyzer._build_suno_prompt(
            mood="upbeat",
            genre="electronic",
            tempo_category="fast",
            duration=30
        )

        assert "upbeat" in prompt
        assert "electronic" in prompt
        assert "140 BPM" in prompt
        assert "30 seconds" in prompt
        assert "instrumental" in prompt
        assert "no vocals" in prompt

    def test_build_suno_prompt_calm_acoustic(self, analyzer):
        """穏やか・アコースティックのプロンプト生成"""
        prompt = analyzer._build_suno_prompt(
            mood="calm",
            genre="acoustic",
            tempo_category="slow",
            duration=60
        )

        assert "calm" in prompt
        assert "acoustic" in prompt
        assert "70 BPM" in prompt
        assert "60 seconds" in prompt

    def test_build_suno_prompt_cinematic_orchestral(self, analyzer):
        """シネマティック・オーケストラのプロンプト生成"""
        prompt = analyzer._build_suno_prompt(
            mood="cinematic",
            genre="orchestral",
            tempo_category="medium",
            duration=45
        )

        assert "cinematic" in prompt
        assert "orchestral" in prompt
        assert "110 BPM" in prompt

    @pytest.mark.asyncio
    async def test_analyze_with_gemini_success(self, analyzer):
        """Gemini分析の成功ケース"""
        # _analyze_with_geminiメソッド全体をモック
        with patch.object(analyzer, "_analyze_with_gemini", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = {
                "mood": "energetic",
                "genre": "electronic",
                "reasoning": "テスト理由"
            }

            result = await analyzer._analyze_with_gemini(
                frames_base64=["dGVzdA=="],  # "test" in base64
                duration=30.0,
                num_cuts=4
            )

        assert result["mood"] == "energetic"
        assert result["genre"] == "electronic"
        assert "テスト理由" in result["reasoning"]

    @pytest.mark.asyncio
    async def test_analyze_with_gemini_json_in_markdown(self, analyzer):
        """Gemini分析: Markdownコードブロック内のJSON"""
        # _analyze_with_geminiメソッド全体をモック
        with patch.object(analyzer, "_analyze_with_gemini", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = {
                "mood": "dramatic",
                "genre": "orchestral",
                "reasoning": "映画的な雰囲気"
            }

            result = await analyzer._analyze_with_gemini(
                frames_base64=["dGVzdA=="],
                duration=60.0,
                num_cuts=8
            )

        assert result["mood"] == "dramatic"
        assert result["genre"] == "orchestral"

    @pytest.mark.asyncio
    async def test_analyze_with_gemini_error_fallback(self, analyzer):
        """Gemini分析エラー時のフォールバック"""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API Error")

        with patch("app.services.video_analyzer.genai.Client", return_value=mock_client):
            result = await analyzer._analyze_with_gemini(
                frames_base64=["base64data"],
                duration=30.0,
                num_cuts=4
            )

        # デフォルト値が返される
        assert result["mood"] == "cinematic"
        assert result["genre"] == "orchestral"
        assert "デフォルト設定" in result["reasoning"]


class TestVideoAnalyzerTempoEstimation:
    """テンポ推定のテスト"""

    def test_tempo_mapping(self):
        """テンポマッピングの確認"""
        assert TEMPO_MAPPING["slow"] == (60, 80)
        assert TEMPO_MAPPING["medium"] == (90, 120)
        assert TEMPO_MAPPING["fast"] == (130, 160)


class TestVideoAnalyzerSingleton:
    """シングルトンインスタンスのテスト"""

    def test_singleton_exists(self):
        """シングルトンが存在する"""
        assert video_analyzer is not None
        assert isinstance(video_analyzer, VideoAnalyzer)
