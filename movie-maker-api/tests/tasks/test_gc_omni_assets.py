"""
TDD RED phase tests for the Omni-reference asset GC batch.

Target: app.tasks.gc_omni_assets.gc_expired_omni_assets (NOT yet implemented).

These tests intentionally fail with ModuleNotFoundError until the
implementation lands in T1-17b. Covers v3 plan section 15.1:

- B-37: expired asset is removed from both R2 and DB
- B-38: not-yet-expired asset is preserved
- B-42: r2.delete_file argument equals DB r2_key exactly (no double prefix)

Plus additional safety cases requested by the parent task:

- R2 delete failure is handled gracefully (DB delete skipped, error logged)
- Idempotent: running twice with nothing expired produces no side effects
"""
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

# RED: this import is expected to fail until T1-17b creates the module.
from app.tasks.gc_omni_assets import gc_expired_omni_assets  # noqa: E402


@pytest.fixture
def mock_supabase():
    """Supabase client mock that exposes the omni_reference_assets table chain."""
    sb = MagicMock()
    # default: SELECT ... WHERE expires_at < now() returns no rows
    sb.table.return_value.select.return_value.lt.return_value.execute.return_value.data = []
    sb.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock()
    return sb


@pytest.mark.asyncio
async def test_gc_deletes_expired_assets(mock_supabase):
    """B-37: expires_at < now() rows must be removed from R2 AND the DB."""
    expired_row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "r2_key": "omni-references/u1/abc.mp4",
    }
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = [
        expired_row
    ]

    with patch("app.tasks.gc_omni_assets.get_supabase", return_value=mock_supabase), patch(
        "app.tasks.gc_omni_assets.r2.delete_file", new_callable=AsyncMock, return_value=True
    ) as mock_delete:
        deleted_count = await gc_expired_omni_assets()

    mock_delete.assert_awaited_once_with("omni-references/u1/abc.mp4")
    mock_supabase.table.return_value.delete.return_value.eq.assert_called_with(
        "id", expired_row["id"]
    )
    assert deleted_count == 1


@pytest.mark.asyncio
async def test_gc_keeps_unexpired_assets(mock_supabase):
    """B-38: rows with expires_at >= now() are not queried for delete."""
    # SELECT returns empty (no expired rows) -> nothing should be deleted
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = []

    with patch("app.tasks.gc_omni_assets.get_supabase", return_value=mock_supabase), patch(
        "app.tasks.gc_omni_assets.r2.delete_file", new_callable=AsyncMock
    ) as mock_delete:
        deleted_count = await gc_expired_omni_assets()

    mock_delete.assert_not_awaited()
    mock_supabase.table.return_value.delete.assert_not_called()
    assert deleted_count == 0


@pytest.mark.asyncio
async def test_gc_handles_r2_delete_failure_gracefully(mock_supabase):
    """R2 delete failure must not crash GC. DB DELETE is skipped, error is logged."""
    expired_row = {
        "id": "33333333-3333-3333-3333-333333333333",
        "r2_key": "omni-references/u2/broken.mp4",
    }
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = [
        expired_row
    ]

    with patch("app.tasks.gc_omni_assets.get_supabase", return_value=mock_supabase), patch(
        "app.tasks.gc_omni_assets.r2.delete_file",
        new_callable=AsyncMock,
        side_effect=Exception("R2 unreachable"),
    ) as mock_delete, patch("app.tasks.gc_omni_assets.logger") as mock_logger:
        # Must not raise
        deleted_count = await gc_expired_omni_assets()

    mock_delete.assert_awaited_once_with("omni-references/u2/broken.mp4")
    # DB delete must be skipped when R2 delete fails (avoid orphaning R2 objects)
    mock_supabase.table.return_value.delete.assert_not_called()
    # Error must be logged for observability
    assert mock_logger.error.called or mock_logger.exception.called
    assert deleted_count == 0


@pytest.mark.asyncio
async def test_gc_idempotent(mock_supabase):
    """Running GC twice with no expired rows produces no side effects on either run."""
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = []

    with patch("app.tasks.gc_omni_assets.get_supabase", return_value=mock_supabase), patch(
        "app.tasks.gc_omni_assets.r2.delete_file", new_callable=AsyncMock
    ) as mock_delete:
        first = await gc_expired_omni_assets()
        second = await gc_expired_omni_assets()

    mock_delete.assert_not_awaited()
    mock_supabase.table.return_value.delete.assert_not_called()
    assert first == 0
    assert second == 0


@pytest.mark.asyncio
async def test_gc_delete_call_uses_r2_key_from_db(mock_supabase):
    """B-42: r2.delete_file argument equals DB r2_key exactly (no double prefix bug)."""
    expired_row = {
        "id": "22222222-2222-2222-2222-222222222222",
        "r2_key": "omni-references/user-xyz/uuid-abc.mp3",
    }
    mock_supabase.table.return_value.select.return_value.lt.return_value.execute.return_value.data = [
        expired_row
    ]

    with patch("app.tasks.gc_omni_assets.get_supabase", return_value=mock_supabase), patch(
        "app.tasks.gc_omni_assets.r2.delete_file", new_callable=AsyncMock, return_value=True
    ) as mock_delete:
        await gc_expired_omni_assets()

    assert mock_delete.await_count == 1
    arg = mock_delete.call_args.args[0]
    assert arg == "omni-references/user-xyz/uuid-abc.mp3"
    # Defend against the historical double-prefix bug from r2.upload_video / upload_audio
    assert not arg.startswith("videos/")
    assert not arg.startswith("bgm/")
    assert not arg.startswith("images/")
