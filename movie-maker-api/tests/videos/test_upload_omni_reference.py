"""
Omni Reference Upload API テスト (T1-4, v3 §15.1)

Endpoints:
  - POST /api/v1/videos/upload-omni-video-reference
  - POST /api/v1/videos/upload-omni-audio-reference
  - POST /api/v1/videos/upload-omni-image-reference

Test ID coverage (v3 §15.1):
  B-21 : MP4 5s + consent=true → 200
  B-22 : PNG を video endpoint → 422 (Content-Type)
  B-23 : MP4 20s → 422 (duration)
  B-24 : MP3 10s → 200
  B-25 : MP3 20s 単体 → 422 (duration)
  B-26 : 60MB video → 413 (size)
  B-33 : consent_accepted=false → 422
  B-41 : response.url の path 部 == DB r2_key (二重 prefix なし)
  +    : Image 上限超過 (11MB) → 413
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import urlparse
from uuid import uuid4

import pytest


MOCK_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"
FUTURE_EXPIRES = (datetime.now(timezone.utc) + timedelta(hours=72)).isoformat()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_supabase_insert_mock(
    asset_id: str,
    r2_key: str,
    public_url: str,
    media_type: str,
    content_type: str,
    duration_seconds: float | None,
    file_size: int,
):
    """Supabase の `table().insert().execute()` chain mock を生成。

    INSERT 完了時に DB が返す 1 行 (expires_at は DB default 72h) を再現。
    """
    mock_sb = MagicMock()
    inserted_row = {
        "id": asset_id,
        "user_id": MOCK_USER_ID,
        "r2_key": r2_key,
        "public_url": public_url,
        "media_type": media_type,
        "content_type": content_type,
        "duration_seconds": duration_seconds,
        "file_size_bytes": file_size,
        "consent_accepted": True,
        "expires_at": FUTURE_EXPIRES,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[inserted_row]
    )
    return mock_sb


def _patch_stack(
    monkeypatch,
    *,
    probe_return: float | None,
    r2_url: str,
    sb_mock,
):
    """`probe_upload_duration` / `r2.upload_with_key` / `get_supabase` を patch。"""
    from app.videos import router as router_module

    async def _fake_probe(_content: bytes) -> float | None:
        return probe_return

    async def _fake_upload(_content: bytes, key: str, _content_type: str) -> str:
        # path 部が r2_key と一致するように URL を組み立てる (B-41 検証)
        return f"https://cdn.example.com/{key}"

    monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
    monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
    monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)


# ---------------------------------------------------------------------------
# B-21: MP4 5s + consent=true → 200
# ---------------------------------------------------------------------------

class TestB21VideoUploadSuccess:
    def test_mp4_5s_consent_true_returns_200(self, auth_client, monkeypatch):
        from app.videos import router as router_module

        captured: dict = {}

        async def _fake_upload(content: bytes, key: str, content_type: str) -> str:
            captured["key"] = key
            captured["content_type"] = content_type
            captured["len"] = len(content)
            return f"https://cdn.example.com/{key}"

        async def _fake_probe(_content: bytes) -> float:
            return 5.0

        sb_mock = MagicMock()

        def _insert_side_effect(payload):
            captured["insert_payload"] = payload
            inserted = dict(payload)
            inserted["expires_at"] = FUTURE_EXPIRES
            mock_exec = MagicMock()
            mock_exec.execute.return_value = MagicMock(data=[inserted])
            return mock_exec

        sb_mock.table.return_value.insert.side_effect = _insert_side_effect

        monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
        monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)

        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("clip.mp4", b"\x00" * 1024, "video/mp4")},
            data={"consent_accepted": "true"},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["media_type"] == "video"
        assert body["duration_seconds"] == 5.0
        assert body["content_type"] == "video/mp4"
        assert body["file_size_bytes"] == 1024
        # URL contains the R2 key
        assert captured["key"] in body["url"]
        # INSERT payload: consent_accepted は True で永続化
        assert captured["insert_payload"]["consent_accepted"] is True
        assert captured["insert_payload"]["media_type"] == "video"
        assert captured["insert_payload"]["r2_key"].startswith(
            f"omni-references/{MOCK_USER_ID}/"
        )


# ---------------------------------------------------------------------------
# B-22: PNG を video endpoint → 422
# ---------------------------------------------------------------------------

class TestB22VideoContentTypeRejection:
    def test_png_to_video_endpoint_returns_422(self, auth_client):
        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("photo.png", b"\x89PNG\r\n", "image/png")},
            data={"consent_accepted": "true"},
        )
        assert response.status_code == 422
        assert "Content-Type" in response.json()["detail"]


# ---------------------------------------------------------------------------
# B-23: MP4 20s → 422 (duration)
# ---------------------------------------------------------------------------

class TestB23VideoDurationRejection:
    def test_mp4_20s_returns_422(self, auth_client, monkeypatch):
        sb_mock = MagicMock()
        _patch_stack(
            monkeypatch,
            probe_return=20.0,
            r2_url="ignored",
            sb_mock=sb_mock,
        )

        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("clip.mp4", b"\x00" * 4096, "video/mp4")},
            data={"consent_accepted": "true"},
        )
        assert response.status_code == 422
        assert "duration" in response.json()["detail"].lower() or "15.4" in response.json()["detail"]


# ---------------------------------------------------------------------------
# B-24: MP3 10s → 200
# ---------------------------------------------------------------------------

class TestB24AudioUploadSuccess:
    def test_mp3_10s_returns_200(self, auth_client, monkeypatch):
        sb_mock = MagicMock()
        from app.videos import router as router_module

        captured: dict = {}

        async def _fake_upload(content: bytes, key: str, content_type: str) -> str:
            captured["key"] = key
            return f"https://cdn.example.com/{key}"

        async def _fake_probe(_content: bytes) -> float:
            return 10.0

        def _insert_side_effect(payload):
            captured["payload"] = payload
            inserted = dict(payload)
            inserted["expires_at"] = FUTURE_EXPIRES
            mock_exec = MagicMock()
            mock_exec.execute.return_value = MagicMock(data=[inserted])
            return mock_exec

        sb_mock.table.return_value.insert.side_effect = _insert_side_effect

        monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
        monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)

        response = auth_client.post(
            "/api/v1/videos/upload-omni-audio-reference",
            files={"file": ("voice.mp3", b"ID3" + b"\x00" * 2048, "audio/mpeg")},
            data={"consent_accepted": "true"},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["media_type"] == "audio"
        assert body["duration_seconds"] == 10.0
        assert body["content_type"] == "audio/mpeg"
        assert captured["payload"]["media_type"] == "audio"


# ---------------------------------------------------------------------------
# B-25: MP3 20s 単体 → 422
# ---------------------------------------------------------------------------

class TestB25AudioDurationRejection:
    def test_mp3_20s_returns_422(self, auth_client, monkeypatch):
        sb_mock = MagicMock()
        _patch_stack(
            monkeypatch,
            probe_return=20.0,
            r2_url="ignored",
            sb_mock=sb_mock,
        )

        response = auth_client.post(
            "/api/v1/videos/upload-omni-audio-reference",
            files={"file": ("voice.mp3", b"\x00" * 2048, "audio/mpeg")},
            data={"consent_accepted": "true"},
        )
        assert response.status_code == 422
        assert "15" in response.json()["detail"]


# ---------------------------------------------------------------------------
# B-26: 60MB video → 413
# ---------------------------------------------------------------------------

class TestB26VideoSizeRejection:
    def test_60mb_video_returns_413(self, auth_client):
        # 51MB > 50MB limit
        big_payload = b"\x00" * (51 * 1024 * 1024)
        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("big.mp4", big_payload, "video/mp4")},
            data={"consent_accepted": "true"},
        )
        assert response.status_code == 413


# ---------------------------------------------------------------------------
# B-33: consent_accepted=false → 422
# ---------------------------------------------------------------------------

class TestB33ConsentRejection:
    def test_video_consent_false_returns_422(self, auth_client):
        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("clip.mp4", b"\x00" * 1024, "video/mp4")},
            data={"consent_accepted": "false"},
        )
        assert response.status_code == 422
        assert "著作権同意" in response.json()["detail"]

    def test_audio_consent_false_returns_422(self, auth_client):
        response = auth_client.post(
            "/api/v1/videos/upload-omni-audio-reference",
            files={"file": ("voice.mp3", b"\x00" * 1024, "audio/mpeg")},
            data={"consent_accepted": "false"},
        )
        assert response.status_code == 422

    def test_image_consent_false_returns_422(self, auth_client):
        response = auth_client.post(
            "/api/v1/videos/upload-omni-image-reference",
            files={"file": ("photo.jpg", b"\xff\xd8\xff" + b"\x00" * 1024, "image/jpeg")},
            data={"consent_accepted": "false"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# B-41: response.url path == DB r2_key (no double prefix)
# ---------------------------------------------------------------------------

class TestB41NoDoublePrefix:
    def test_video_url_path_equals_r2_key(self, auth_client, monkeypatch):
        from app.videos import router as router_module

        captured: dict = {}

        async def _fake_upload(content: bytes, key: str, content_type: str) -> str:
            captured["key"] = key
            # Public URL is exactly the key under host
            return f"https://cdn.example.com/{key}"

        async def _fake_probe(_content: bytes) -> float:
            return 3.0

        sb_mock = MagicMock()

        def _insert_side_effect(payload):
            captured["payload"] = payload
            inserted = dict(payload)
            inserted["expires_at"] = FUTURE_EXPIRES
            mock_exec = MagicMock()
            mock_exec.execute.return_value = MagicMock(data=[inserted])
            return mock_exec

        sb_mock.table.return_value.insert.side_effect = _insert_side_effect

        monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
        monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)

        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("clip.mp4", b"\x00" * 256, "video/mp4")},
            data={"consent_accepted": "true"},
        )

        assert response.status_code == 200
        body = response.json()

        url_path = urlparse(body["url"]).path.lstrip("/")
        db_key = captured["payload"]["r2_key"]
        assert url_path == db_key, (
            f"二重 prefix bug: url_path={url_path!r} != r2_key={db_key!r}"
        )
        # 重要: omni-references/ は 1 回のみ登場すべし
        assert url_path.count("omni-references/") == 1


# ---------------------------------------------------------------------------
# Image happy path & size rejection (AC coverage)
# ---------------------------------------------------------------------------

class TestImageUpload:
    def test_jpeg_upload_returns_200_with_null_duration(self, auth_client, monkeypatch):
        from app.videos import router as router_module

        captured: dict = {}

        async def _fake_upload(content: bytes, key: str, content_type: str) -> str:
            captured["key"] = key
            return f"https://cdn.example.com/{key}"

        # Should NOT be called for images, but provide a safe default
        async def _fake_probe(_content: bytes) -> float | None:
            return None

        sb_mock = MagicMock()

        def _insert_side_effect(payload):
            captured["payload"] = payload
            inserted = dict(payload)
            inserted["expires_at"] = FUTURE_EXPIRES
            mock_exec = MagicMock()
            mock_exec.execute.return_value = MagicMock(data=[inserted])
            return mock_exec

        sb_mock.table.return_value.insert.side_effect = _insert_side_effect

        monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
        monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)

        response = auth_client.post(
            "/api/v1/videos/upload-omni-image-reference",
            files={"file": ("photo.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 512, "image/jpeg")},
            data={"consent_accepted": "true"},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["media_type"] == "image"
        assert body["duration_seconds"] is None
        assert body["content_type"] == "image/jpeg"
        # ext check
        assert captured["key"].endswith(".jpg")
        # duration_seconds not set in payload (image)
        assert captured["payload"]["duration_seconds"] is None

    def test_image_oversize_returns_413(self, auth_client):
        big_payload = b"\x00" * (11 * 1024 * 1024)
        response = auth_client.post(
            "/api/v1/videos/upload-omni-image-reference",
            files={"file": ("big.jpg", big_payload, "image/jpeg")},
            data={"consent_accepted": "true"},
        )
        assert response.status_code == 413

    def test_invalid_image_content_type_returns_422(self, auth_client):
        response = auth_client.post(
            "/api/v1/videos/upload-omni-image-reference",
            files={"file": ("clip.mp4", b"\x00" * 64, "video/mp4")},
            data={"consent_accepted": "true"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# H-NEW-1: R2 orphan prevention — rollback on Supabase INSERT failure
# ---------------------------------------------------------------------------

class TestRollbackOnInsertFailure:
    """Supabase INSERT 失敗時に R2 オブジェクトを delete_file で削除すること."""

    def _setup_mocks(
        self,
        monkeypatch,
        *,
        endpoint_probe_return: float | None,
        insert_exc: Exception,
        delete_outcome: str = "ok",
    ):
        """共通: r2.upload_with_key / probe / supabase.insert / r2.delete_file をパッチ.

        delete_outcome:
          - "ok": delete_file returns True
          - "false": delete_file returns False (rollback failure path)
          - "raise": delete_file raises Exception (rollback failure path)
        """
        from app.videos import router as router_module

        captured: dict = {"uploaded_keys": [], "deleted_keys": []}

        async def _fake_probe(_content: bytes) -> float | None:
            return endpoint_probe_return

        async def _fake_upload(_content: bytes, key: str, _ct: str) -> str:
            captured["uploaded_keys"].append(key)
            return f"https://cdn.example.com/{key}"

        async def _fake_delete(key: str) -> bool:
            captured["deleted_keys"].append(key)
            if delete_outcome == "raise":
                raise RuntimeError("simulated R2 delete error")
            return delete_outcome == "ok"

        sb_mock = MagicMock()
        # insert(...).execute() raises insert_exc
        execute_mock = MagicMock()
        execute_mock.execute.side_effect = insert_exc
        sb_mock.table.return_value.insert.return_value = execute_mock

        monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
        monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
        monkeypatch.setattr(router_module.r2, "delete_file", _fake_delete)
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)
        return captured

    def test_video_insert_failure_triggers_r2_delete(
        self, auth_client, monkeypatch, caplog
    ):
        import logging as _logging

        captured = self._setup_mocks(
            monkeypatch,
            endpoint_probe_return=5.0,
            insert_exc=RuntimeError("DB down"),
            delete_outcome="ok",
        )

        with caplog.at_level(_logging.WARNING, logger="app.videos.router"):
            response = auth_client.post(
                "/api/v1/videos/upload-omni-video-reference",
                files={"file": ("clip.mp4", b"\x00" * 1024, "video/mp4")},
                data={"consent_accepted": "true"},
            )

        assert response.status_code == 500
        assert "アップロード保存に失敗" in response.json()["detail"]
        # R2 delete was called with the uploaded key
        assert len(captured["uploaded_keys"]) == 1
        assert captured["deleted_keys"] == captured["uploaded_keys"]
        # warning log present
        warning_msgs = [
            r.getMessage() for r in caplog.records if r.levelno == _logging.WARNING
        ]
        assert any("R2 rolled back" in m for m in warning_msgs), warning_msgs

    def test_audio_insert_failure_triggers_r2_delete(
        self, auth_client, monkeypatch, caplog
    ):
        import logging as _logging

        captured = self._setup_mocks(
            monkeypatch,
            endpoint_probe_return=10.0,
            insert_exc=RuntimeError("DB down"),
            delete_outcome="ok",
        )

        with caplog.at_level(_logging.WARNING, logger="app.videos.router"):
            response = auth_client.post(
                "/api/v1/videos/upload-omni-audio-reference",
                files={"file": ("voice.mp3", b"\x00" * 1024, "audio/mpeg")},
                data={"consent_accepted": "true"},
            )

        assert response.status_code == 500
        assert captured["deleted_keys"] == captured["uploaded_keys"]
        assert len(captured["deleted_keys"]) == 1
        warning_msgs = [
            r.getMessage() for r in caplog.records if r.levelno == _logging.WARNING
        ]
        assert any("R2 rolled back" in m for m in warning_msgs)

    def test_image_insert_failure_triggers_r2_delete(
        self, auth_client, monkeypatch, caplog
    ):
        import logging as _logging

        captured = self._setup_mocks(
            monkeypatch,
            endpoint_probe_return=None,  # image doesn't probe
            insert_exc=RuntimeError("DB down"),
            delete_outcome="ok",
        )

        with caplog.at_level(_logging.WARNING, logger="app.videos.router"):
            response = auth_client.post(
                "/api/v1/videos/upload-omni-image-reference",
                files={"file": ("photo.jpg", b"\xff\xd8\xff" + b"\x00" * 512, "image/jpeg")},
                data={"consent_accepted": "true"},
            )

        assert response.status_code == 500
        assert captured["deleted_keys"] == captured["uploaded_keys"]
        assert len(captured["deleted_keys"]) == 1

    def test_empty_insert_result_also_triggers_rollback(
        self, auth_client, monkeypatch
    ):
        """`result.data` が空のケースも rollback されること."""
        from app.videos import router as router_module

        captured: dict = {"uploaded_keys": [], "deleted_keys": []}

        async def _fake_probe(_content: bytes) -> float:
            return 5.0

        async def _fake_upload(_content: bytes, key: str, _ct: str) -> str:
            captured["uploaded_keys"].append(key)
            return f"https://cdn.example.com/{key}"

        async def _fake_delete(key: str) -> bool:
            captured["deleted_keys"].append(key)
            return True

        sb_mock = MagicMock()
        sb_mock.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[]
        )

        monkeypatch.setattr(router_module, "_probe_upload_duration", _fake_probe)
        monkeypatch.setattr(router_module.r2, "upload_with_key", _fake_upload)
        monkeypatch.setattr(router_module.r2, "delete_file", _fake_delete)
        monkeypatch.setattr(router_module, "get_supabase", lambda: sb_mock)

        response = auth_client.post(
            "/api/v1/videos/upload-omni-video-reference",
            files={"file": ("clip.mp4", b"\x00" * 1024, "video/mp4")},
            data={"consent_accepted": "true"},
        )

        assert response.status_code == 500
        assert captured["deleted_keys"] == captured["uploaded_keys"]
        assert len(captured["deleted_keys"]) == 1

    def test_rollback_delete_raises_logs_error_and_returns_500(
        self, auth_client, monkeypatch, caplog
    ):
        """R2 delete_file が例外を投げても 500 を返し、error ログを残すこと."""
        import logging as _logging

        captured = self._setup_mocks(
            monkeypatch,
            endpoint_probe_return=5.0,
            insert_exc=RuntimeError("DB down"),
            delete_outcome="raise",
        )

        with caplog.at_level(_logging.ERROR, logger="app.videos.router"):
            response = auth_client.post(
                "/api/v1/videos/upload-omni-video-reference",
                files={"file": ("clip.mp4", b"\x00" * 1024, "video/mp4")},
                data={"consent_accepted": "true"},
            )

        # original error → still 500
        assert response.status_code == 500
        assert "アップロード保存に失敗" in response.json()["detail"]
        # delete was attempted with the uploaded key
        assert captured["deleted_keys"] == captured["uploaded_keys"]
        # error log present mentioning orphan
        error_msgs = [
            r.getMessage() for r in caplog.records if r.levelno == _logging.ERROR
        ]
        assert any("orphan" in m for m in error_msgs), error_msgs

    def test_rollback_delete_returns_false_logs_error(
        self, auth_client, monkeypatch, caplog
    ):
        """R2 delete_file が False (ClientError 内部キャッチ) の場合も error ログ."""
        import logging as _logging

        captured = self._setup_mocks(
            monkeypatch,
            endpoint_probe_return=5.0,
            insert_exc=RuntimeError("DB down"),
            delete_outcome="false",
        )

        with caplog.at_level(_logging.ERROR, logger="app.videos.router"):
            response = auth_client.post(
                "/api/v1/videos/upload-omni-video-reference",
                files={"file": ("clip.mp4", b"\x00" * 1024, "video/mp4")},
                data={"consent_accepted": "true"},
            )

        assert response.status_code == 500
        assert captured["deleted_keys"] == captured["uploaded_keys"]
        error_msgs = [
            r.getMessage() for r in caplog.records if r.levelno == _logging.ERROR
        ]
        assert any("orphan" in m for m in error_msgs), error_msgs
