"""
モーションアップロードエンドポイントのテスト
"""
import sys
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
import io

# アプリをインポート
from app.main import app
from app.core.dependencies import get_current_user

# モックユーザー
MOCK_USER = {
    "user_id": "test-user",
    "email": "test@example.com",
    "display_name": "Test User",
    "plan_type": "free",
    "video_count_this_month": 0,
}

# 依存関係をオーバーライド
async def mock_get_current_user():
    return MOCK_USER

app.dependency_overrides[get_current_user] = mock_get_current_user

client = TestClient(app)

print("=" * 60)
print("モーションアップロード機能テスト")
print("=" * 60)

# テスト1: モーション一覧取得
print("\n--- Test 1: GET /motions (一覧取得) ---")
response = client.get("/api/v1/videos/motions")
print(f"Status: {response.status_code}")
test1_pass = False
if response.status_code == 200:
    motions = response.json()
    print(f"取得したモーション数: {len(motions)}")
    if motions:
        print(f"最初のモーション: {motions[0]['name_ja']} ({motions[0]['id']})")
        print(f"カテゴリ: {motions[0]['category']}")
        first_motion_id = motions[0]['id']
        test1_pass = True
else:
    print(f"Error: {response.text[:200]}")
    first_motion_id = "smile_gentle"

# テスト2: 特定モーション取得
print("\n--- Test 2: GET /motions/{id} (詳細取得) ---")
response = client.get(f"/api/v1/videos/motions/{first_motion_id}")
print(f"Status: {response.status_code}")
test2_pass = False
if response.status_code == 200:
    motion = response.json()
    print(f"モーション: {motion.get('name_ja', 'N/A')}")
    print(f"カテゴリ: {motion.get('category', 'N/A')}")
    print(f"URL: {motion.get('motion_url', 'N/A')}")
    test2_pass = True
else:
    print(f"Error: {response.text[:200]}")

# テスト3: カテゴリでフィルタ
print("\n--- Test 3: GET /motions?category=expression (カテゴリフィルタ) ---")
response = client.get("/api/v1/videos/motions?category=expression")
print(f"Status: {response.status_code}")
test3_pass = False
if response.status_code == 200:
    motions = response.json()
    print(f"expressionカテゴリのモーション数: {len(motions)}")
    for m in motions:
        print(f"  - {m['name_ja']} ({m['id']})")
    test3_pass = True
else:
    print(f"Error: {response.text[:200]}")

# テスト4: 全カテゴリのモーション数を確認
print("\n--- Test 4: カテゴリ別モーション数 ---")
categories = ["expression", "gesture", "action", "speaking"]
test4_pass = True
for cat in categories:
    response = client.get(f"/api/v1/videos/motions?category={cat}")
    if response.status_code == 200:
        count = len(response.json())
        print(f"  {cat}: {count}件")
    else:
        print(f"  {cat}: エラー")
        test4_pass = False

# テスト5: モーションアップロード（ダミーファイル）
print("\n--- Test 5: POST /motions/upload (アップロード) ---")

# ダミーのMP4ファイルを作成（最小限のMP4ヘッダー）
mp4_header = bytes([
    0x00, 0x00, 0x00, 0x14,  # box size
    0x66, 0x74, 0x79, 0x70,  # 'ftyp'
    0x69, 0x73, 0x6F, 0x6D,  # 'isom'
    0x00, 0x00, 0x00, 0x00,  # version
    0x69, 0x73, 0x6F, 0x6D,  # compatible brand
])

dummy_video = io.BytesIO(mp4_header)

# R2クライアントをモック
mock_r2_client = MagicMock()
mock_r2_client.put_object = MagicMock(return_value={"ResponseMetadata": {"HTTPStatusCode": 200}})

test5_pass = False
with patch('app.external.r2.get_r2_client', return_value=mock_r2_client):
    response = client.post(
        "/api/v1/videos/motions/upload",
        files={"file": ("test_motion.mp4", dummy_video, "video/mp4")},
        data={
            "category": "action",
            "motion_id": "test_custom_action",
            "name_ja": "テストアクション",
            "name_en": "Test Action",
            "duration_seconds": "5"
        },
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"アップロード成功!")
        print(f"  Motion ID: {result.get('motion_id')}")
        print(f"  Category: {result.get('category')}")
        print(f"  R2 Key: {result.get('r2_key')}")
        print(f"  Motion URL: {result.get('motion_url')}")
        test5_pass = True
    else:
        print(f"Error: {response.text[:500]}")

# テスト6: 無効なカテゴリでアップロード
print("\n--- Test 6: POST /motions/upload (無効なカテゴリ) ---")
dummy_video.seek(0)
test6_pass = False
with patch('app.external.r2.get_r2_client', return_value=mock_r2_client):
    response = client.post(
        "/api/v1/videos/motions/upload",
        files={"file": ("test.mp4", dummy_video, "video/mp4")},
        data={
            "category": "invalid_category",
            "motion_id": "test",
            "name_ja": "テスト",
            "name_en": "Test",
        },
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 400:
        print("正しくバリデーションエラーが返されました")
        print(f"Error: {response.json().get('detail')}")
        test6_pass = True
    else:
        print(f"Response: {response.text[:200]}")

# テスト7: 無効なファイル形式でアップロード
print("\n--- Test 7: POST /motions/upload (無効なファイル形式) ---")
dummy_text = io.BytesIO(b"This is not a video file")
test7_pass = False
with patch('app.external.r2.get_r2_client', return_value=mock_r2_client):
    response = client.post(
        "/api/v1/videos/motions/upload",
        files={"file": ("test.txt", dummy_text, "text/plain")},
        data={
            "category": "action",
            "motion_id": "test",
            "name_ja": "テスト",
            "name_en": "Test",
        },
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 400:
        print("正しくバリデーションエラーが返されました")
        print(f"Error: {response.json().get('detail')}")
        test7_pass = True
    else:
        print(f"Response: {response.text[:200]}")

# テスト8: 存在しないモーションIDを取得
print("\n--- Test 8: GET /motions/{id} (存在しないID) ---")
response = client.get("/api/v1/videos/motions/nonexistent_motion")
print(f"Status: {response.status_code}")
test8_pass = False
if response.status_code == 404:
    print("正しく404エラーが返されました")
    test8_pass = True
else:
    print(f"Response: {response.text[:200]}")

print("\n" + "=" * 60)
print("テスト結果サマリー")
print("=" * 60)
results = [
    ("Test 1: モーション一覧取得", test1_pass),
    ("Test 2: モーション詳細取得", test2_pass),
    ("Test 3: カテゴリフィルタ", test3_pass),
    ("Test 4: 全カテゴリ確認", test4_pass),
    ("Test 5: アップロード", test5_pass),
    ("Test 6: 無効カテゴリ拒否", test6_pass),
    ("Test 7: 無効ファイル形式拒否", test7_pass),
    ("Test 8: 存在しないID", test8_pass),
]

passed = sum(1 for _, p in results if p)
for name, p in results:
    status = "PASS" if p else "FAIL"
    print(f"  {status}: {name}")

print(f"\n結果: {passed}/8 テスト成功")
print("=" * 60)

# 依存関係オーバーライドをクリア
app.dependency_overrides.clear()

# 全テストがパスしたら正常終了
if passed == 8:
    sys.exit(0)
else:
    sys.exit(1)
