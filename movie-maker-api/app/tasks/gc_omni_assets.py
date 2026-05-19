"""TTL garbage collector for ``omni_reference_assets`` rows.

Per v3 plan §6.6 / §15.1, this batch:

- Uses the Supabase service-role key (RLS bypass) to query rows whose
  ``expires_at`` is in the past.
- Deletes the underlying R2 object using the exact ``r2_key`` stored in the
  database row (B-42: no double prefix). The historical
  ``upload_video`` / ``upload_audio`` / ``upload_image`` helpers prepend a
  fixed prefix; omni-reference assets are uploaded with ``upload_with_key``
  so the stored ``r2_key`` is already the canonical key.
- Only removes the database row after the R2 delete succeeds, so a failed
  R2 delete can be retried on the next run without orphaning the row.

Scheduling (cron / scheduled jobs) is intentionally out of scope for this
task -- it is handled separately in T3-17c.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.core.supabase import get_supabase
from app.external import r2

logger = logging.getLogger(__name__)


async def gc_expired_omni_assets() -> int:
    """Delete omni_reference_assets whose ``expires_at`` is in the past.

    Returns:
        The number of rows successfully removed from both R2 and the
        database. Rows whose R2 delete failed are left in place so the
        next run can retry them.
    """
    sb = get_supabase()  # service-role: bypasses RLS
    now_iso = datetime.now(timezone.utc).isoformat()

    rows = (
        sb.table("omni_reference_assets")
        .select("id,r2_key")
        .lt("expires_at", now_iso)
        .execute()
    )

    deleted = 0
    for row in rows.data or []:
        asset_id = row["id"]
        r2_key = row["r2_key"]

        try:
            # B-42: pass the DB r2_key verbatim -- no prefix concatenation.
            await r2.delete_file(r2_key)
        except Exception as exc:  # noqa: BLE001 - graceful: log and skip
            logger.error(
                "omni_reference_gc R2 delete failed; skipping DB delete",
                extra={"id": asset_id, "r2_key": r2_key, "error": str(exc)},
            )
            continue

        sb.table("omni_reference_assets").delete().eq("id", asset_id).execute()
        deleted += 1

    logger.info("omni_reference_gc completed", extra={"deleted": deleted})
    return deleted
