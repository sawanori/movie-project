"""
再生成機能のデバッグテスト
"""
import asyncio
import sys
sys.path.insert(0, '.')

from app.videos.schemas import RegenerateVideoRequest

def test_schema():
    """スキーマのテスト"""
    # 空のリクエスト
    req1 = RegenerateVideoRequest()
    print(f"Empty request: prompt={req1.prompt}, video_provider={req1.video_provider}")

    # プロンプト付きリクエスト
    req2 = RegenerateVideoRequest(prompt="test prompt 123")
    print(f"With prompt: prompt={req2.prompt}, video_provider={req2.video_provider}")

    # JSONからパース
    import json
    json_data = '{"prompt": "json test prompt", "video_provider": "runway"}'
    req3 = RegenerateVideoRequest.model_validate_json(json_data)
    print(f"From JSON: prompt={req3.prompt}, video_provider={req3.video_provider}")

    print("\nSchema test passed!")

def test_task_function():
    """タスク関数のシグネチャ確認"""
    from app.tasks import start_single_scene_regeneration
    import inspect
    sig = inspect.signature(start_single_scene_regeneration)
    print(f"\nstart_single_scene_regeneration signature: {sig}")
    print(f"Parameters: {list(sig.parameters.keys())}")

if __name__ == "__main__":
    print("=== Testing RegenerateVideoRequest Schema ===\n")
    test_schema()

    print("\n=== Testing Task Function ===")
    test_task_function()
