"""
APIエンドポイントの直接テスト
"""
import sys
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import json

# モックを設定
mock_supabase = MagicMock()
mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
    "id": "test-storyboard",
    "status": "completed"
}

# シーンデータ
mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
    "id": "test-scene",
    "status": "completed"
}

with patch('app.core.supabase.get_supabase', return_value=mock_supabase):
    with patch('app.core.dependencies.get_current_user', return_value={"user_id": "test-user"}):
        with patch('app.core.dependencies.check_usage_limit', return_value={"user_id": "test-user"}):
            from app.main import app
            client = TestClient(app)

            print("=== Testing regenerate-video endpoint ===\n")

            # テスト1: プロンプト付きリクエスト
            print("Test 1: Request with prompt")
            response = client.post(
                "/api/v1/videos/storyboard/test-sb/scenes/1/regenerate-video",
                json={"prompt": "TEST_PROMPT_123", "video_provider": "runway"},
                headers={"Authorization": "Bearer test-token"}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text[:200] if response.text else 'empty'}")

            # テスト2: 空のリクエスト
            print("\nTest 2: Empty request")
            response = client.post(
                "/api/v1/videos/storyboard/test-sb/scenes/1/regenerate-video",
                json={},
                headers={"Authorization": "Bearer test-token"}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text[:200] if response.text else 'empty'}")
