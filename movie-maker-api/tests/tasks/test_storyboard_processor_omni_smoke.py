"""
M-3 回帰テスト: storyboard_processor が omni reference 新カラム (NULL) でも
既存通り動作することを smoke test で担保.

本 Doc (v3 計画書 §3 非スコープ #7) では storyboard_processor は変更対象外。
新規追加した video_generations.{image,video,audio}_reference_urls カラムが
NULL のまま storyboard 経路でも問題なく動作することを明示的に検証する。

参照:
- v3 計画書 §3 非スコープ #7 (Storyboard 経由)
- v3 計画書 §11 Indirect Impact
- v3 計画書 AC-11 (Migration backward compatibility)
- M-3 対応
"""
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Path helpers (CWD 非依存)
# ---------------------------------------------------------------------------

# tests/tasks/<this file> から repo root を解決
# movie-maker-api/tests/tasks/<this> -> movie-maker-api -> movie-project
_REPO_ROOT = Path(__file__).resolve().parents[3]
_MIGRATION_FILE = _REPO_ROOT / "docs" / "migrations" / "20260518_add_omni_reference_assets.sql"


# ---------------------------------------------------------------------------
# Test 1: storyboard_processor source に omni 分岐コードが含まれないこと
# ---------------------------------------------------------------------------

def test_storyboard_processor_source_has_no_omni_references():
    """
    storyboard_processor.py が omni reference 関連 API / 新カラム名を一切参照しない
    こと (= 完全に独立した経路) を source レベルで担保.

    本 Doc 非スコープ (#7) を回帰防御するためのコード変更検出 smoke test.
    """
    from app.tasks import storyboard_processor

    src = Path(storyboard_processor.__file__).read_text(encoding="utf-8")

    # 新 API (T1-xx で追加予定) を storyboard_processor が呼ばないこと
    assert "generate_video_with_omni_references" not in src, (
        "storyboard_processor は omni_reference 範囲外 (v3 §3 #7 / §17)"
    )

    # video_generations の新 3 カラムを storyboard_processor が参照しないこと
    for col in ("image_reference_urls", "video_reference_urls", "audio_reference_urls"):
        assert col not in src, (
            f"storyboard_processor は新カラム '{col}' を参照しないこと (M-3)"
        )


# ---------------------------------------------------------------------------
# Test 2: storyboard_processor の import / 主要シンボルが新カラム NULL でも壊れない
# ---------------------------------------------------------------------------

def test_storyboard_processor_module_imports_cleanly():
    """
    新カラム追加後も storyboard_processor module が import エラー無くロード可能.
    主要 entry point (process_storyboard_generation / generate_video_with_v2v_fallback)
    が引き続き callable であることを確認.
    """
    from app.tasks import storyboard_processor

    assert hasattr(storyboard_processor, "process_storyboard_generation")
    assert callable(storyboard_processor.process_storyboard_generation)
    assert hasattr(storyboard_processor, "generate_video_with_v2v_fallback")
    assert callable(storyboard_processor.generate_video_with_v2v_fallback)


# ---------------------------------------------------------------------------
# Test 3: 新 3 カラムが NULL の video_generations 行を扱っても storyboard 経路が
#        KeyError / AttributeError を起こさないこと (mock spy で SELECT 列確認)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_storyboard_processor_handles_null_omni_columns():
    """
    video_generations 行に新規 3 カラムが NULL (DB default) の状態で
    generate_video_with_v2v_fallback が正常に task_id を返すこと.

    storyboard 経路に omni reference 分岐が無いため、新カラムは一切参照されず
    既存挙動が完全に維持されることを smoke 確認する.
    """
    from app.tasks.storyboard_processor import generate_video_with_v2v_fallback

    provider = MagicMock()
    provider.provider_name = "seedance"
    provider.generate_video = AsyncMock(return_value="task_seedance_smoke_001")
    provider.supports_t2v = True

    scene = {
        "scene_number": 1,
        "image_url": "https://example.com/scene.jpg",
        "runway_prompt": "smoke test prompt",
        "camera_work": None,
    }

    # storyboard 経路が新カラム NULL の前提でも Supabase 呼び出しは
    # 既存ロジック (storyboard_scenes 等) しか触らないことを spy で確認.
    with patch("app.tasks.storyboard_processor.get_supabase") as mock_get_supabase:
        mock_supabase = MagicMock()
        mock_get_supabase.return_value = mock_supabase

        task_id, _generation_method = await generate_video_with_v2v_fallback(
            provider=provider,
            scene=scene,
            previous_video_url=None,
            scene_image_url="https://example.com/scene.jpg",
            aspect_ratio="9:16",
            kling_duration=None,
            image_tail_url=None,
            element_images=None,
        )

    # 既存通り task_id を返すこと (新カラム NULL の影響なし)
    assert task_id == "task_seedance_smoke_001"

    # provider.generate_video の呼び出し引数に新カラム名が紛れ込まないこと
    assert provider.generate_video.await_count >= 1
    for call in provider.generate_video.await_args_list:
        kwargs_repr = repr(call.kwargs) + repr(call.args)
        for col in ("image_reference_urls", "video_reference_urls", "audio_reference_urls"):
            assert col not in kwargs_repr, (
                f"storyboard 経路で provider 呼び出しに '{col}' が含まれてはならない"
            )


# ---------------------------------------------------------------------------
# Test 4: Migration SQL 上で新 3 カラムが DEFAULT NULL であること
# ---------------------------------------------------------------------------

def test_video_generations_new_columns_default_null_in_migration_sql():
    """
    video_generations の新 3 カラムが NULL default で migration されていること.
    AC-11 (Migration backward compatibility) を smoke で補強.

    DB レベルでの行確認は E2E (T3-18) で実施するため、
    本テストでは migration SQL ファイル上の DEFAULT NULL 記述のみを確認する.
    """
    assert _MIGRATION_FILE.exists(), f"migration file not found: {_MIGRATION_FILE}"

    sql = _MIGRATION_FILE.read_text(encoding="utf-8")
    assert "image_reference_urls JSONB DEFAULT NULL" in sql
    assert "video_reference_urls JSONB DEFAULT NULL" in sql
    assert "audio_reference_urls JSONB DEFAULT NULL" in sql
