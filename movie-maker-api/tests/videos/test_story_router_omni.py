"""
T1-7: POST /api/v1/videos/story の omni_reference 解決テスト (v3 §15.1)

カバレッジ:
  - 正常系: image+video+audio asset_ids → 201 + DB に snapshot URL 保存
  - B-35 (cross-user): 他ユーザーの asset_id → 422
  - B-36 (TTL): expires_at < now → 422
  - B-36b (media_type 不一致): → 422
  - B-43 (audio 合計 16s): → 422
  - B-43b (audio 合計 14s): → 201
  - 存在しない asset_id: → 422
  - omni 未指定 (既存後方互換): → 201 (新 JSONB カラムは None)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest


MOCK_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "other-user-00000000-0000-0000-0000-000000000099"
BASE_IMAGE_URL = "https://cdn.example.com/base/image.jpg"


def _future_iso(hours: int = 24) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _past_iso(hours: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def _omni_row(
    asset_id: str,
    media_type: str,
    *,
    user_id: str = MOCK_USER_ID,
    duration_seconds: float | None = None,
    expires_at: str | None = None,
    public_url: str | None = None,
) -> dict:
    """omni_reference_assets テーブルの 1 行を再現する dict を組み立てる。"""
    return {
        "id": asset_id,
        "public_url": public_url or f"https://cdn.example.com/omni-references/{user_id}/{asset_id}.bin",
        "user_id": user_id,
        "expires_at": expires_at or _future_iso(24),
        "media_type": media_type,
        "duration_seconds": duration_seconds,
    }


class _SupabaseMock:
    """create_story_video が要求する Supabase chain を再現する MagicMock ラッパ。

    使い方:
        sb = _SupabaseMock(omni_rows=[...])
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb.mock)
        ... TestClient.post ...
        assert sb.captured_insert is not None  # video_generations 行
    """

    def __init__(self, omni_rows: list[dict] | None = None):
        self.omni_rows: list[dict] = omni_rows or []
        self.captured_insert: dict | None = None
        self.mock = MagicMock()
        self.mock.table.side_effect = self._table_side_effect
        # rpc / usage_logs 用 fallback
        self.mock.rpc.return_value.execute.return_value = MagicMock(data=None)

    def _table_side_effect(self, name: str):
        table_mock = MagicMock()
        if name == "omni_reference_assets":
            # .select(...).in_("id", ids).execute() chain
            select_mock = MagicMock()
            in_mock = MagicMock()
            in_mock.execute.return_value = MagicMock(data=list(self.omni_rows))
            select_mock.in_.return_value = in_mock
            table_mock.select.return_value = select_mock
        elif name == "video_generations":
            def _insert_side_effect(payload):
                self.captured_insert = payload
                exec_mock = MagicMock()
                inserted = dict(payload)
                exec_mock.execute.return_value = MagicMock(data=[inserted])
                return exec_mock

            table_mock.insert.side_effect = _insert_side_effect
        else:
            # usage_logs など: insert().execute() を素通り
            table_mock.insert.return_value.execute.return_value = MagicMock(data=None)
        return table_mock


def _patch_router(monkeypatch, sb: _SupabaseMock):
    from app.videos import router as router_module

    monkeypatch.setattr(router_module, "get_supabase", lambda: sb.mock)
    # BG タスクは起動させない (本テストは Router INSERT 層のみ検証)
    monkeypatch.setattr(router_module, "start_story_processing", lambda *a, **kw: None)


def _base_payload(**overrides) -> dict:
    """POST /videos/story の最小ペイロード。"""
    payload = {
        "image_url": BASE_IMAGE_URL,
        "story_text": "テストストーリー",
        "aspect_ratio": "9:16",
        "video_provider": "seedance",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# 正常系: image+video+audio asset_ids → 201 + snapshot 保存
# ---------------------------------------------------------------------------

class TestOmniAllMediaTypesSuccess:
    def test_image_video_audio_resolves_and_snapshots(self, auth_client, monkeypatch):
        image_id = str(uuid4())
        video_id = str(uuid4())
        audio_id = str(uuid4())
        omni_rows = [
            _omni_row(image_id, "image",
                     public_url="https://cdn.example.com/img-ref.jpg"),
            _omni_row(video_id, "video", duration_seconds=5.0,
                     public_url="https://cdn.example.com/vid-ref.mp4"),
            _omni_row(audio_id, "audio", duration_seconds=8.0,
                     public_url="https://cdn.example.com/aud-ref.mp3"),
        ]
        sb = _SupabaseMock(omni_rows=omni_rows)
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(
                image_reference_asset_ids=[image_id],
                video_reference_asset_ids=[video_id],
                audio_reference_asset_ids=[audio_id],
            ),
        )

        assert response.status_code == 201, response.text
        assert sb.captured_insert is not None
        snapshot = sb.captured_insert
        assert snapshot["image_reference_urls"] == ["https://cdn.example.com/img-ref.jpg"]
        assert snapshot["video_reference_urls"] == ["https://cdn.example.com/vid-ref.mp4"]
        assert snapshot["audio_reference_urls"] == ["https://cdn.example.com/aud-ref.mp3"]


# ---------------------------------------------------------------------------
# B-35: cross-user 拒否
# ---------------------------------------------------------------------------

class TestB35CrossUserRejection:
    def test_other_user_asset_id_returns_422(self, auth_client, monkeypatch):
        asset_id = str(uuid4())
        omni_rows = [
            _omni_row(asset_id, "image", user_id=OTHER_USER_ID),
        ]
        sb = _SupabaseMock(omni_rows=omni_rows)
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(image_reference_asset_ids=[asset_id]),
        )

        assert response.status_code == 422
        assert "他ユーザー" in response.json()["detail"]
        # 解決失敗時は INSERT が呼ばれていない
        assert sb.captured_insert is None


# ---------------------------------------------------------------------------
# B-36: expires_at < now 拒否
# ---------------------------------------------------------------------------

class TestB36ExpiredAssetRejection:
    def test_expired_asset_id_returns_422(self, auth_client, monkeypatch):
        asset_id = str(uuid4())
        omni_rows = [
            _omni_row(asset_id, "image", expires_at=_past_iso(2)),
        ]
        sb = _SupabaseMock(omni_rows=omni_rows)
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(image_reference_asset_ids=[asset_id]),
        )

        assert response.status_code == 422
        assert "期限切れ" in response.json()["detail"]
        assert sb.captured_insert is None


# ---------------------------------------------------------------------------
# B-36b: media_type 不一致拒否
# ---------------------------------------------------------------------------

class TestB36bMediaTypeMismatchRejection:
    def test_media_type_mismatch_returns_422(self, auth_client, monkeypatch):
        asset_id = str(uuid4())
        # DB 上は audio だが video として参照しようとする
        omni_rows = [_omni_row(asset_id, "audio", duration_seconds=3.0)]
        sb = _SupabaseMock(omni_rows=omni_rows)
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(video_reference_asset_ids=[asset_id]),
        )

        assert response.status_code == 422
        assert "media_type" in response.json()["detail"]


# ---------------------------------------------------------------------------
# B-43: audio 合計 16s → 422
# ---------------------------------------------------------------------------

class TestB43AudioTotalDurationRejection:
    def test_audio_total_16s_returns_422(self, auth_client, monkeypatch):
        a1, a2, a3 = str(uuid4()), str(uuid4()), str(uuid4())
        omni_rows = [
            _omni_row(a1, "audio", duration_seconds=6.0),
            _omni_row(a2, "audio", duration_seconds=5.0),
            _omni_row(a3, "audio", duration_seconds=5.0),
        ]
        sb = _SupabaseMock(omni_rows=omni_rows)
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(audio_reference_asset_ids=[a1, a2, a3]),
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "audio" in detail
        assert "15" in detail  # 上限値 15s が含まれる
        assert sb.captured_insert is None


# ---------------------------------------------------------------------------
# B-43b: audio 合計 14s → 201
# ---------------------------------------------------------------------------

class TestB43bAudioTotalUnderLimitAccepted:
    def test_audio_total_14s_returns_201(self, auth_client, monkeypatch):
        a1, a2 = str(uuid4()), str(uuid4())
        omni_rows = [
            _omni_row(a1, "audio", duration_seconds=7.0,
                     public_url="https://cdn.example.com/a1.mp3"),
            _omni_row(a2, "audio", duration_seconds=7.0,
                     public_url="https://cdn.example.com/a2.mp3"),
        ]
        sb = _SupabaseMock(omni_rows=omni_rows)
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(audio_reference_asset_ids=[a1, a2]),
        )

        assert response.status_code == 201, response.text
        # 順序保持で 2 件分の URL が保存される
        assert sb.captured_insert["audio_reference_urls"] == [
            "https://cdn.example.com/a1.mp3",
            "https://cdn.example.com/a2.mp3",
        ]


# ---------------------------------------------------------------------------
# 存在しない asset_id → 422
# ---------------------------------------------------------------------------

class TestNonExistentAssetIdRejection:
    def test_unknown_asset_id_returns_422(self, auth_client, monkeypatch):
        unknown_id = str(uuid4())
        sb = _SupabaseMock(omni_rows=[])  # DB に何も無い
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(image_reference_asset_ids=[unknown_id]),
        )

        assert response.status_code == 422
        assert "not found" in response.json()["detail"].lower()
        assert sb.captured_insert is None


# ---------------------------------------------------------------------------
# omni 未指定: 既存 i2v 経路の完全後方互換
# ---------------------------------------------------------------------------

class TestOmniNotSpecifiedBackwardCompat:
    def test_no_omni_refs_returns_201_with_null_snapshot(self, auth_client, monkeypatch):
        sb = _SupabaseMock(omni_rows=[])
        _patch_router(monkeypatch, sb)

        response = auth_client.post(
            "/api/v1/videos/story",
            json=_base_payload(),  # *_reference_asset_ids 全て未指定
        )

        assert response.status_code == 201, response.text
        assert sb.captured_insert is not None
        # 新 JSONB カラムは None (snapshot 保存対象なし)
        assert sb.captured_insert["image_reference_urls"] is None
        assert sb.captured_insert["video_reference_urls"] is None
        assert sb.captured_insert["audio_reference_urls"] is None
        # 既存フィールド (例: image_urls) は維持
        assert sb.captured_insert["image_urls"] == [BASE_IMAGE_URL]
