"""
tests/videos/test_translate_story_integration.py

POST /api/v1/videos/story/translate エンドポイントの End-to-End 統合テスト。
Gemini API 実呼び出しは mock で回避する。

テストケース:
  1. subject_type=object + セリフ入力 → english_prompt に Preserve 含有 / Same face 非含有 +
     extracted_dialogue が返る
  2. subject_type=person (既存フロー回帰) → extracted_dialogue=None でも 200 が返り
     english_prompt が str であること

mock 戦略:
  - asyncio.to_thread: _extract_prompt_components 内の Gemini SDK 同期呼び出しをラップするため
  - app.external.gemini_client._run_gemini_translation: 翻訳フェーズの Gemini 呼び出し

asyncio_mode=auto (pytest.ini) のため @pytest.mark.asyncio は不要。
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ============================================================
# ヘルパー
# ============================================================

def _make_extraction_response(
    subject_visual: str = "test subject",
    action: str = "move",
    camera: str = "",
    dialogue: str = "",
    micro_expression: str = "",
    lighting: str = "",
    other: str = "",
    must_include: str = "",
) -> MagicMock:
    """_extract_prompt_components 内の asyncio.to_thread が返す Gemini レスポンス mock。"""
    m = MagicMock()
    m.text = json.dumps({
        "subject_visual": subject_visual,
        "action": action,
        "camera": camera,
        "dialogue": dialogue,
        "micro_expression": micro_expression,
        "lighting": lighting,
        "other": other,
        "must_include": must_include,
    })
    return m


# ============================================================
# 統合テスト 1: subject_type=object + セリフ入力
# ============================================================

def test_translate_story_object_with_dialogue(auth_client, monkeypatch):
    """
    AC-B1 / AC-C1 統合:
    subject_type=object でセリフ「ちょっと まって…」を含む入力を翻訳した場合、
    - english_prompt に "Preserve" が含まれる
    - english_prompt に "Same face" が含まれない
    - extracted_dialogue が返る (ちょっと まって… を含む)

    Gemini API は monkeypatch / patch で mock。
    """
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        AsyncMock(return_value=_make_extraction_response(
            subject_visual="beige knit sweater character, no limbs, hung on hanger",
            action="Slight forward tilt, bewilderment expression",
            dialogue="ちょっと まって…",
            micro_expression="Bewilderment; raised eyebrows, widened eyes",
        )),
    )

    english_prompt_returned = (
        "Preserve object design. CLIP SPECIFIC:\n"
        "Subject: Beige knit sweater character, no limbs, hung on hanger\n"
        "Action: Slight forward tilt, subtle bunching around shoulders\n"
        "Micro-expression: Bewilderment; raised eyebrows, widened eyes\n"
        "Camera: Static shot, medium framing\n"
        "Must include: NATURAL MOTION: subtle knit fiber movement, slight sway"
    )

    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(return_value=english_prompt_returned),
    ):
        response = auth_client.post(
            "/api/v1/videos/story/translate",
            json={
                "description_ja": (
                    "ベージュのニットセーターのキャラクター（手足はなく、ハンガーで吊られた状態）が"
                    "困惑した表情で「ちょっと まって…」と言う"
                ),
                "subject_type": "object",
                "video_provider": "runway",
            },
        )

    assert response.status_code == 200
    data = response.json()

    # english_prompt: Preserve 含有
    assert "Preserve" in data["english_prompt"]
    # english_prompt: 人物フレーズ非含有
    assert "Same face" not in data["english_prompt"]
    assert "Same hair" not in data["english_prompt"]
    # extracted_dialogue: セリフが返る
    assert data["extracted_dialogue"] is not None
    assert "ちょっと" in data["extracted_dialogue"]


# ============================================================
# 統合テスト 2: subject_type=person 回帰テスト
# ============================================================

def test_translate_story_person_no_dialogue_regression(auth_client, monkeypatch):
    """
    AC-D1 回帰: subject_type=person でセリフなし入力を翻訳した場合、
    - HTTP 200 が返る
    - english_prompt が非空の str である
    - extracted_dialogue が None である

    既存 person フローが壊れていないことを確認。
    """
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        AsyncMock(return_value=_make_extraction_response(
            subject_visual="young woman, long dark hair, red dress",
            action="Wave her hand gently",
            camera="Static shot",
            micro_expression="Cheerful smile",
        )),
    )

    person_prompt = (
        "Preserve subject's identity, facial features, outfit, and pose. "
        "CLIP SPECIFIC:\n"
        "Subject: Young woman, long dark hair, red dress\n"
        "Action: Wave her hand gently\n"
        "Camera: Static shot\n"
        "Micro-expression: Cheerful smile\n"
        "Must include: NATURAL MOTION: subtle fabric movement"
    )

    with patch(
        "app.external.gemini_client._run_gemini_translation",
        new=AsyncMock(return_value=person_prompt),
    ):
        response = auth_client.post(
            "/api/v1/videos/story/translate",
            json={
                "description_ja": "赤いドレスの女性が手を振る",
                "subject_type": "person",
                "video_provider": "runway",
            },
        )

    assert response.status_code == 200
    data = response.json()

    assert isinstance(data["english_prompt"], str)
    assert len(data["english_prompt"]) > 0
    assert data["extracted_dialogue"] is None
