"""
Suno API 実際のテストスクリプト

使用方法:
  source venv/bin/activate
  python test_suno_api.py
"""
import asyncio
import sys
from app.external.suno_client import suno_client, SunoAPIError


async def test_health_check():
    """ヘルスチェック"""
    print("=" * 50)
    print("1. ヘルスチェック")
    print("=" * 50)

    try:
        is_healthy = await suno_client.health_check()
        if is_healthy:
            print("✅ Suno API接続成功")
            return True
        else:
            print("❌ Suno API接続失敗")
            return False
    except Exception as e:
        print(f"❌ エラー: {e}")
        return False


async def test_generate_music():
    """音楽生成テスト（コールバック方式）"""
    print("\n" + "=" * 50)
    print("2. 音楽生成テスト")
    print("=" * 50)

    prompt = "upbeat electronic music, synth, 120 BPM, energetic, instrumental, 10 seconds"
    test_bgm_id = "test-bgm-id-12345"  # テスト用ID

    print(f"プロンプト: {prompt}")
    print(f"BGM生成ID: {test_bgm_id}")

    try:
        result = await suno_client.generate_music(
            prompt=prompt,
            bgm_generation_id=test_bgm_id,
            make_instrumental=True,
            model="V3_5",
        )

        print(f"✅ 生成リクエスト送信成功")
        print(f"   Task ID: {result.task_id}")
        print(f"   Status: {result.status}")
        print(f"")
        print(f"   ⚠️  コールバック方式のため、結果はWebhookで受信します")
        print(f"   コールバックURL: {suno_client._get_callback_url(test_bgm_id)}")
        print(f"")
        print(f"   ⚠️  ローカル環境ではWebhookを受信できません。")
        print(f"      本番環境では BACKEND_URL を設定してください。")

        return result.task_id

    except SunoAPIError as e:
        print(f"❌ Suno APIエラー: {e}")
        return None
    except Exception as e:
        print(f"❌ 予期しないエラー: {e}")
        return None


async def main():
    print("\n" + "#" * 50)
    print("#  Suno API 統合テスト (コールバック方式)")
    print("#" * 50)

    # 1. ヘルスチェック
    if not await test_health_check():
        print("\n⚠️ ヘルスチェック失敗。APIキーを確認してください。")
        sys.exit(1)

    # 2. 音楽生成
    task_id = await test_generate_music()
    if not task_id:
        print("\n⚠️ 音楽生成リクエストに失敗しました。")
        sys.exit(1)

    print("\n" + "#" * 50)
    print("#  テスト完了!")
    print("#")
    print("#  SunoAPI.orgはコールバック方式のため、")
    print("#  生成完了はWebhookで通知されます。")
    print("#  本番環境でBACKEND_URLを正しく設定してください。")
    print("#" * 50)


if __name__ == "__main__":
    asyncio.run(main())
