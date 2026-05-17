"""
tests/external/test_gemini_translate_story.py

translate_story_prompt / _extract_prompt_components / _extract_dialogues_via_regex
/ _sanitize_reserve_typo の単体テスト。

N6 対応: Gemini API 実呼び出しを避けるため _run_gemini_translation を
monkeypatch / patch で置き換える。asyncio.to_thread の mock は
_extract_prompt_components のフォールバックパスのテストでのみ使用する。

asyncio_mode=auto (pytest.ini) のため @pytest.mark.asyncio は不要。
"""
import json
import logging
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.external.gemini_client import (
    translate_story_prompt,
    TranslateStoryPromptInput,
    ExtractedComponents,
    _extract_prompt_components,
    _extract_dialogues_via_regex,
    _sanitize_reserve_typo,
)


# ============================================================
# ヘルパー
# ============================================================

def _make_ai_response(data: dict) -> MagicMock:
    """asyncio.to_thread が返す Gemini レスポンス風 mock。"""
    m = MagicMock()
    m.text = json.dumps(data)
    return m


def _extraction_mock(
    subject_visual: str = "test subject",
    action: str = "move",
    camera: str = "",
    dialogue: str = "",
    micro_expression: str = "",
    lighting: str = "",
    other: str = "",
    must_include: str = "",
) -> AsyncMock:
    """AI 抽出レスポンス用 asyncio.to_thread mock。"""
    return AsyncMock(return_value=_make_ai_response({
        "subject_visual": subject_visual,
        "action": action,
        "camera": camera,
        "dialogue": dialogue,
        "micro_expression": micro_expression,
        "lighting": lighting,
        "other": other,
        "must_include": must_include,
    }))


# ============================================================
# 1. typo サニタイズ: 純関数テスト (AC-A1)
# ============================================================

def test_translate_story_prompt_typo_reserve_sanitized():
    """AC-A1: _sanitize_reserve_typo が Reserve → Preserve に置換する。"""
    text = "Reserve exact appearance from reference. Reserve the subject identity."
    cleaned = _sanitize_reserve_typo(text)

    assert "Reserve exact appearance" not in cleaned
    assert "Reserve the subject" not in cleaned
    assert "Preserve exact appearance" in cleaned
    assert "Preserve the subject" in cleaned


def test_sanitize_reserve_typo_does_not_affect_unrelated_reserve():
    """_sanitize_reserve_typo は固定フレーズのみ置換し、無関係な 'reserve' は触れない。"""
    text = "Reserve a table. Preserve exact appearance."
    cleaned = _sanitize_reserve_typo(text)

    # "Reserve a table" は置換対象フレーズに一致しないので保持
    assert "Reserve a table" in cleaned
    # "Preserve exact appearance" は既に正しいので保持
    assert "Preserve exact appearance" in cleaned


# ============================================================
# 2. 正規表現セリフ抽出: 純関数テスト (AC-C1, C2, C8)
# ============================================================

def test_extract_dialogues_via_regex_single():
    """AC-C1: 「」内の単一セリフを抽出する。"""
    result = _extract_dialogues_via_regex("キャラクターが「ちょっとまって…」と言う")
    assert result == "ちょっとまって…"


def test_extract_dialogues_via_regex_multiple():
    """AC-C2: 複数セリフを改行区切りで結合する。"""
    result = _extract_dialogues_via_regex("「あ…」と言ってから「やめて…」と続ける")

    assert result is not None
    assert "あ…" in result
    assert "やめて…" in result
    assert "\n" in result


def test_extract_dialogues_via_regex_nested_brackets():
    """AC-C8: 異種ネストカッコ「彼は『やめて』と叫んだ」の挙動を固定。

    採用案 a: KAGI と DOUBLE_KAGI を別々抽出して改行で結合。
    結果: "彼は『やめて』と叫んだ\nやめて"
    """
    result = _extract_dialogues_via_regex("「彼は『やめて』と叫んだ」")

    assert result is not None
    assert "彼は『やめて』と叫んだ" in result
    assert "やめて" in result
    assert "\n" in result


def test_extract_dialogues_via_regex_no_brackets_returns_none():
    """セリフカッコがない場合 None を返す。"""
    result = _extract_dialogues_via_regex("女性が振り向く")
    assert result is None


def test_extract_dialogues_via_regex_empty_brackets_returns_none():
    """10-5 対応: 空の「」は除外して None を返す。"""
    result = _extract_dialogues_via_regex("キャラクターが「」と言う")
    assert result is None


# ============================================================
# 3. _extract_prompt_components のフォールバック (N6)
# ============================================================

async def test_translate_story_prompt_softlimit_1200_warning_only(
    monkeypatch, caplog
):
    """AC-B2: 1500 文字超の出力でも 500 にならず warning ログのみ (ハード上限なし)。"""
    # 1500 文字超の疑似レスポンスを返す
    long_prompt = "Preserve design. " + "A" * 1500

    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        _extraction_mock(),
    )
    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(return_value=long_prompt),
    ):
        params = TranslateStoryPromptInput(description_ja="テスト入力")
        with caplog.at_level(logging.WARNING, logger="app.external.gemini_client"):
            result_en, _ = await translate_story_prompt(params)

    # 例外を送出せず、文字列として返る
    assert isinstance(result_en, str)
    assert len(result_en) > 1200
    # warning ログが記録されている
    assert any("soft target" in r.message or "exceeded" in r.message for r in caplog.records)


async def test_translate_story_prompt_subject_type_propagation(monkeypatch):
    """AC-B3: subject_type が _build_translate_system_prompt に正しく伝播する。

    subject_type='person' の場合、人物フレーズが参照指示に含まれる。
    """
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        _extraction_mock(subject_visual="young woman, long dark hair"),
    )
    captured_system_prompt: list[str] = []

    async def mock_translate(system_prompt: str, user_input: str) -> str:
        captured_system_prompt.append(system_prompt)
        return "Preserve subject's identity. CLIP SPECIFIC: Subject: woman."

    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=mock_translate,
    ):
        params = TranslateStoryPromptInput(
            description_ja="若い女性が微笑む",
            subject_type="person",
        )
        result_en, _ = await translate_story_prompt(params)

    assert len(captured_system_prompt) == 1
    # person 向けシステムプロンプトにはフレーズが含まれる
    assert "person" in captured_system_prompt[0]
    assert isinstance(result_en, str)


async def test_translate_story_prompt_act_two_phase1_warning_only(
    monkeypatch, caplog
):
    """AC-B4: use_act_two=True でも 500 にならず warning ログのみ。"""
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        _extraction_mock(),
    )
    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(return_value="Preserve identity. CLIP SPECIFIC: Action: turn."),
    ):
        params = TranslateStoryPromptInput(
            description_ja="女性が振り向く",
            subject_type="person",
            use_act_two=True,
            motion_type="natural",
            expression_intensity=4,
            body_control=True,
        )
        with caplog.at_level(logging.WARNING, logger="app.external.gemini_client"):
            result_en, _ = await translate_story_prompt(params)

    assert isinstance(result_en, str)
    assert len(result_en) > 0
    assert any("Act-Two mode is not supported" in r.message for r in caplog.records)


# ============================================================
# 4. セリフ抽出統合 (AC-C1 / AC-C2 経由)
# ============================================================

async def test_extract_dialogues_via_regex_single_integration(monkeypatch):
    """AC-C1 統合: セリフが extracted_dialogue に返り、english_prompt 本文に混入しない。"""
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        _extraction_mock(subject_visual="character", dialogue="ちょっとまって…"),
    )
    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(
            return_value=(
                "Preserve character design. CLIP SPECIFIC:\n"
                "Subject: Character\nAction: Speak\nCamera: Static\n"
                "Must include: natural motion, subtle lip-sync motion"
            )
        ),
    ):
        params = TranslateStoryPromptInput(
            description_ja="キャラクターが「ちょっとまって…」と言う",
        )
        result_en, dialogue = await translate_story_prompt(params)

    # 正規表現でセリフが取れる入力なので dialogue は str
    assert dialogue == "ちょっとまって…"
    # 英語プロンプト本文に日本語セリフが混入しない
    assert "ちょっとまって" not in result_en


async def test_extract_dialogues_via_regex_multiple_integration(monkeypatch):
    """AC-C2 統合: 複数セリフが extracted_dialogue に改行結合で返る。"""
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        _extraction_mock(subject_visual="character"),
    )
    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(return_value="Preserve character design. Action: speak multiple lines."),
    ):
        params = TranslateStoryPromptInput(
            description_ja="「あ…」と言ってから「やめて…」と続ける",
        )
        result_en, dialogue = await translate_story_prompt(params)

    assert dialogue is not None
    assert "あ…" in dialogue
    assert "やめて…" in dialogue
    assert "\n" in dialogue


# ============================================================
# 5. translate_story_prompt 統合 (Gemini mock)
# ============================================================

async def test_translate_story_prompt_object_excludes_person_terms(monkeypatch):
    """AC-B1 / AC-B3: subject_type='object' で 'Same face' 等の人物フレーズが混入しない。"""
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        _extraction_mock(subject_visual="beige knit sweater, no limbs"),
    )
    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(
            return_value=(
                "Preserve object design. CLIP SPECIFIC:\n"
                "Subject: Beige knit sweater, no limbs, hung on hanger\n"
                "Action: Slight forward tilt\n"
                "Camera: Static\n"
                "Must include: natural knit fiber movement"
            )
        ),
    ):
        params = TranslateStoryPromptInput(
            description_ja="ベージュのニットセーター (手足なし)",
            subject_type="object",
        )
        result_en, dialogue = await translate_story_prompt(params)

    assert "Same face" not in result_en
    assert "Same hair" not in result_en
    assert "Same clothing" not in result_en
    assert dialogue is None


async def test_translate_scene_to_runway_prompt_backward_compat():
    """AC-D1: 既存 translate_scene_to_runway_prompt が壊れていない (後方互換確認)。

    Gemini API 呼び出し部分は patch で差し替え、シグネチャと戻り値型を確認する。
    """
    from app.external.gemini_client import translate_scene_to_runway_prompt

    mock_response = MagicMock()
    mock_response.text = "Preserve identity. Action: walk. Camera: static."

    with patch(
        "app.external.gemini_client.asyncio.to_thread",
        new=AsyncMock(return_value=mock_response),
    ):
        result = await translate_scene_to_runway_prompt(
            description_ja="女性が歩く",
            scene_number=1,
        )

    # 戻り値は str
    assert isinstance(result, str)
    assert len(result) > 0


def test_extracted_dialogue_none_serialization():
    """AC-D2: extracted_dialogue=None で TranslateStoryPromptResponse が serialize 可能。"""
    from app.videos.schemas import TranslateStoryPromptResponse

    response = TranslateStoryPromptResponse(
        english_prompt="Preserve design. Action: walk.",
        extracted_dialogue=None,
    )
    serialized = response.model_dump()

    assert serialized["english_prompt"] == "Preserve design. Action: walk."
    assert serialized["extracted_dialogue"] is None

    # JSON シリアライズも可能
    json_str = response.model_dump_json()
    assert "extracted_dialogue" in json_str
    assert "null" in json_str
