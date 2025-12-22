from unittest.mock import patch, MagicMock
from app.external.gemini_client import get_gemini_client, optimize_prompt

def test_gemini_client_initialization():
    with patch("app.external.gemini_client.settings") as mock_settings:
        mock_settings.GOOGLE_API_KEY = "test-key"
        client = get_gemini_client()
        assert client is not None

async def test_optimize_prompt_mock():
    with patch("app.external.gemini_client.get_gemini_client") as mock_get_client:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Optimized prompt"
        mock_client.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client
        
        result = await optimize_prompt("test prompt")
        assert result == "Optimized prompt"
