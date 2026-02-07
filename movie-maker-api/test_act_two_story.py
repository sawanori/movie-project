#!/usr/bin/env python3
"""
Act-Two Story Video API Test Script
"""
import os
import sys
import requests
import time
from dotenv import load_dotenv

load_dotenv()

API_URL = "http://localhost:8000/api/v1"

# Supabase認証情報
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def get_auth_token():
    """テスト用のアクセストークンを取得"""
    # Supabase REST APIでログイン
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"

    # テスト用ユーザー情報（環境変数から取得）
    email = os.getenv("TEST_USER_EMAIL", "test@example.com")
    password = os.getenv("TEST_USER_PASSWORD", "testpassword")

    response = requests.post(
        auth_url,
        headers={
            "apikey": SUPABASE_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": email,
            "password": password
        }
    )

    if response.status_code != 200:
        print(f"Auth failed: {response.status_code} - {response.text}")
        return None

    data = response.json()
    return data.get("access_token")


def test_act_two_story():
    """Act-Twoストーリー動画生成テスト"""
    print("=" * 60)
    print("Act-Two Story Video API Test")
    print("=" * 60)

    # 1. 認証トークン取得
    print("\n[1] Getting auth token...")
    token = get_auth_token()
    if not token:
        print("ERROR: Failed to get auth token. Please set TEST_USER_EMAIL and TEST_USER_PASSWORD")
        sys.exit(1)
    print(f"✓ Token obtained: {token[:20]}...")

    headers = {"Authorization": f"Bearer {token}"}

    # 2. モーション一覧取得
    print("\n[2] Fetching available motions...")
    response = requests.get(f"{API_URL}/videos/motions", headers=headers)
    if response.status_code != 200:
        print(f"ERROR: Failed to fetch motions: {response.status_code} - {response.text}")
        sys.exit(1)

    motions = response.json()
    print(f"✓ Found {len(motions)} motions:")
    for m in motions:
        print(f"  - {m['id']}: {m['name_ja']} ({m['motion_url'][:50]}...)")

    if not motions:
        print("ERROR: No motions available. Please upload a motion first.")
        sys.exit(1)

    motion_id = motions[0]["id"]
    print(f"\n✓ Using motion: {motion_id}")

    # 3. テスト用画像URL（既存の画像を使用）
    # 実際のテストでは画像をアップロードする必要があるが、ここでは既存のものを使用
    print("\n[3] Checking for existing images...")

    # 最近の動画生成から画像URLを取得
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    supabase.auth.sign_in_with_password({"email": os.getenv("TEST_USER_EMAIL"), "password": os.getenv("TEST_USER_PASSWORD")})

    result = supabase.table("video_generations").select("original_image_url").order("created_at", desc=True).limit(1).execute()

    if not result.data or not result.data[0].get("original_image_url"):
        print("ERROR: No existing image found. Please generate a video first to have an image URL.")
        sys.exit(1)

    image_url = result.data[0]["original_image_url"]
    print(f"✓ Using image: {image_url[:60]}...")

    # 4. Act-Twoストーリー動画リクエスト
    print("\n[4] Creating Act-Two story video request...")

    story_request = {
        "image_url": image_url,
        "story_text": "キャラクターが驚いた表情をする",
        "subject_type": "animation",
        "video_provider": "runway",
        "animation_category": "2d",
        "animation_template": "A-1",
        "aspect_ratio": "9:16",
        "use_act_two": True,
        "motion_type": motion_id,
        "expression_intensity": 5,
        "body_control": True,
    }

    print(f"Request payload:")
    for k, v in story_request.items():
        print(f"  {k}: {v}")

    response = requests.post(
        f"{API_URL}/videos/story",
        headers={**headers, "Content-Type": "application/json"},
        json=story_request
    )

    if response.status_code != 201:
        print(f"\nERROR: Failed to create story video: {response.status_code}")
        print(f"Response: {response.text}")
        sys.exit(1)

    video_data = response.json()
    video_id = video_data["id"]
    print(f"\n✓ Story video created: {video_id}")

    # 5. 進捗確認
    print("\n[5] Polling for video completion...")
    max_attempts = 60  # 5分
    for i in range(max_attempts):
        response = requests.get(f"{API_URL}/videos/{video_id}/status", headers=headers)
        if response.status_code != 200:
            print(f"ERROR: Failed to get status: {response.status_code}")
            break

        status_data = response.json()
        status = status_data.get("status")
        progress = status_data.get("progress", 0)

        print(f"  [{i+1}/{max_attempts}] Status: {status}, Progress: {progress}%")

        if status == "completed":
            print(f"\n✓ Video completed!")
            print(f"  URL: {status_data.get('final_video_url', 'N/A')}")
            break
        elif status == "failed":
            print(f"\n✗ Video failed: {status_data.get('error_message', 'Unknown error')}")
            break

        time.sleep(5)
    else:
        print("\n✗ Timeout waiting for video completion")

    # 6. DBで保存されたパラメータ確認
    print("\n[6] Verifying Act-Two parameters in database...")
    result = supabase.table("video_generations").select("use_act_two, motion_type, expression_intensity, body_control").eq("id", video_id).single().execute()

    if result.data:
        print(f"  use_act_two: {result.data.get('use_act_two')}")
        print(f"  motion_type: {result.data.get('motion_type')}")
        print(f"  expression_intensity: {result.data.get('expression_intensity')}")
        print(f"  body_control: {result.data.get('body_control')}")

        if result.data.get('use_act_two') and result.data.get('motion_type'):
            print("\n✓ Act-Two parameters correctly saved to database!")
        else:
            print("\n✗ Act-Two parameters NOT saved correctly")

    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)


if __name__ == "__main__":
    test_act_two_story()
