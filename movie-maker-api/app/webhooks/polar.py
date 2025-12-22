import hmac
import hashlib
from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

from app.core.config import settings
from app.core.supabase import get_supabase

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Polar Webhook署名を検証"""
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


@router.post("/polar")
async def polar_webhook(
    request: Request,
    x_polar_signature: Optional[str] = Header(None, alias="X-Polar-Signature"),
):
    """Polar Webhookを処理"""
    body = await request.body()

    # 署名検証（本番環境では必須）
    if settings.POLAR_WEBHOOK_SECRET and x_polar_signature:
        if not verify_webhook_signature(body, x_polar_signature, settings.POLAR_WEBHOOK_SECRET):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = await request.json()
    event_type = payload.get("type")

    supabase = get_supabase()

    # イベントタイプに応じた処理
    if event_type == "subscription.created":
        await handle_subscription_created(supabase, payload)

    elif event_type == "subscription.updated":
        await handle_subscription_updated(supabase, payload)

    elif event_type == "subscription.canceled":
        await handle_subscription_canceled(supabase, payload)

    elif event_type == "subscription.active":
        await handle_subscription_active(supabase, payload)

    return {"status": "ok"}


async def handle_subscription_created(supabase, payload: dict):
    """サブスクリプション作成時の処理"""
    data = payload.get("data", {})
    user_email = data.get("user", {}).get("email")
    subscription_id = data.get("id")
    plan_id = data.get("product", {}).get("id")

    if not user_email:
        return

    # プランIDからプランタイプを決定
    plan_type = _get_plan_type_from_product(plan_id)

    # ユーザーのプランを更新
    supabase.table("users").update({
        "plan_type": plan_type,
        "subscription_id": subscription_id,
    }).eq("email", user_email).execute()


async def handle_subscription_updated(supabase, payload: dict):
    """サブスクリプション更新時の処理"""
    data = payload.get("data", {})
    subscription_id = data.get("id")
    plan_id = data.get("product", {}).get("id")

    plan_type = _get_plan_type_from_product(plan_id)

    supabase.table("users").update({
        "plan_type": plan_type,
    }).eq("subscription_id", subscription_id).execute()


async def handle_subscription_canceled(supabase, payload: dict):
    """サブスクリプションキャンセル時の処理"""
    data = payload.get("data", {})
    subscription_id = data.get("id")

    # freeプランに戻す
    supabase.table("users").update({
        "plan_type": "free",
        "subscription_id": None,
    }).eq("subscription_id", subscription_id).execute()


async def handle_subscription_active(supabase, payload: dict):
    """サブスクリプションアクティブ時の処理"""
    # subscription.createdと同様の処理
    await handle_subscription_created(supabase, payload)


def _get_plan_type_from_product(product_id: str) -> str:
    """Polar商品IDからプランタイプを取得"""
    # 実際の商品IDに応じてマッピング
    # TODO: 環境変数または設定ファイルで管理
    plan_mapping = {
        "starter_product_id": "starter",
        "pro_product_id": "pro",
        "business_product_id": "business",
    }
    return plan_mapping.get(product_id, "starter")
