from google import genai
from google.genai import types
from PIL import Image
import asyncio
import re
import io
import json
import httpx
import logging
from pathlib import Path

from dataclasses import dataclass
from typing import Optional, Literal

from app.core.config import settings

logger = logging.getLogger(__name__)

SubjectType = Literal["person", "object", "animation"]
AnimationCategory = Literal["2d", "3d"]


@dataclass
class TranslateStoryPromptInput:
    """translate_story_prompt の引数集約 dataclass。

    引数増加に伴うシグネチャ複雑化を防ぐ。フロント (TypeScript)
    からの JSON request body をそのまま展開して構築できる構造。
    """
    description_ja: str
    video_provider: str = "runway"
    subject_type: SubjectType = "person"
    camera_work: Optional[str] = None
    animation_category: Optional[AnimationCategory] = None
    animation_template: Optional[str] = None
    # Act-Two 関連 (Phase 1 では未使用、Phase 2 で利用)
    use_act_two: bool = False
    motion_type: Optional[str] = None
    expression_intensity: int = 3
    body_control: bool = True


@dataclass
class ExtractedComponents:
    """_extract_prompt_components の戻り値 contract (B3 対応)。

    型を統一して TypeError / AttributeError リスクを排除:
    - 文字列フィールドは常に str (空なら "")。None は許容しない。
    - dialogue のみ Optional[str]。null は「セリフなし」を表現。
    """
    subject_visual: str   # 必ず str (空なら "")
    action: str           # 必ず str (空なら "")
    camera: str           # 必ず str (空なら "")
    micro_expression: str  # 必ず str (空なら "")
    lighting: str         # 必ず str (空なら "")
    other: str            # 必ず str (空なら "")
    must_include: str     # 必ず str (空なら "")
    dialogue: Optional[str] = None  # 唯一 None 許容


def _build_reference_instruction(subject_type: str) -> str:
    """B2 / B3 対応: subject_type に応じた Reference Instruction 1 行を返す。

    subject_type='object' / 'animation' 時は人物前提フレーズ
    ("Same face, same hair, same clothing") を除外した表現を使用。
    """
    if subject_type == "person":
        return (
            "Preserve subject's identity, facial features, outfit, and pose "
            "from source image. Maintain the exact character appearance."
        )
    if subject_type == "object":
        return (
            "Preserve subject design, materials, configuration, and proportions "
            "from source image. Maintain the exact object appearance."
        )
    if subject_type == "animation":
        return (
            "Preserve character design, art style, color palette, and visual "
            "features from source image. Maintain the exact stylistic identity."
        )
    # フォールバック (未知の subject_type)
    return (
        "Preserve the visual identity and characteristics from source image."
    )


def _build_translate_system_prompt(
    extracted: ExtractedComponents,
    reference_instruction: str,
    params: TranslateStoryPromptInput,
) -> str:
    """システムプロンプト構築。ExtractedComponents の str 統一に依存。

    B3 対応: extracted.* は常に str。.strip() 直接呼び出し可能で None ガード不要。
    A 案: CRITICAL RULES に "Preserve" typo 禁止を明示 (2 層防御の第 1 層)。
    B 案: 必須 4 軸 + オプション 3 軸の新テンプレ (1200 文字目標)。
    """
    # 既に ExtractedComponents は str 統一なので .strip() で空判定のみ
    subject_visual_hint = extracted.subject_visual.strip()
    action_hint = extracted.action.strip()
    camera_hint = (params.camera_work or extracted.camera).strip()
    expression_hint = extracted.micro_expression.strip()
    lighting_hint = extracted.lighting.strip()
    has_dialogue = extracted.dialogue is not None  # 唯一 Optional[str]

    # オプション軸の構築 (該当する記述があるときのみ含める)
    optional_lines = []
    if expression_hint:
        optional_lines.append(f"Micro-expression: {{translate: {expression_hint}}}")
    if lighting_hint:
        optional_lines.append(f"Lighting: {{translate: {lighting_hint}}}")
    if has_dialogue:
        optional_lines.append(
            "Must include (in addition): subtle lip-sync motion as if "
            "the subject is speaking. Do NOT include the dialogue text itself."
        )

    optional_block = "\n".join(optional_lines) if optional_lines else ""

    # subject_type 別の CRITICAL RULE 4 (人物前提フレーズ禁止の例示を条件化)
    if params.subject_type == "person":
        subject_type_rule = (
            f'Subject type is "{params.subject_type}". Human-specific phrases are allowed.'
        )
    else:
        subject_type_rule = (
            f'Subject type is "{params.subject_type}". Do NOT use human-body phrases '
            f'(face, hair, clothing, outfit, etc.) — they do not apply to this subject.'
        )

    return f"""\
You are a prompt engineer for video generation AI ({params.video_provider}).

GOAL: Convert the Japanese description into a compact English prompt
that the model can execute reliably. Follow the structure below EXACTLY.

CRITICAL RULES:
1. The verb MUST be spelled "Preserve" (capital P, starts with Pr-). Do NOT use any
   spelling that starts with "Re-" — that is a forbidden typo that reverses the meaning.
2. The Subject field MUST include ALL visual attributes the user provided
   (colors, materials, shape, distinctive features). DO NOT omit them as
   "inheritable from image" -- they are required for the model to anchor.
3. Keep total length under 1200 characters. Be concise but specific.
4. {subject_type_rule}
5. Dialogue lines (extracted separately) MUST NOT appear in the prompt body.
   Only the meta-instruction "subtle lip-sync motion" is allowed.

OUTPUT TEMPLATE (use this EXACT structure):

{reference_instruction}

CLIP SPECIFIC:
Subject: {{translate to English, include ALL visual attributes from: {subject_visual_hint}}}
Action: {{translate to English: {action_hint}}}
Camera: {{translate to English or use as-is: {camera_hint or "natural framing"}}}
Must include: {{natural motion, subtle physics appropriate to the subject}}
{optional_block}

OUTPUT: Return ONLY the prompt text following the template above.
No explanations, no quotes, no markdown code fences.
"""


def _sanitize_reserve_typo(text: str) -> str:
    """A 案安全網 (第 2 層): Reserve -> Preserve に置換 (固定フレーズのみ)。

    Gemini が "Reserve" を誤生成した場合の最終防御。
    特定フレーズのみ置換することで意図しない書き換えを避ける。
    """
    return (
        text
        .replace("Reserve exact appearance", "Preserve exact appearance")
        .replace("Reserve the subject", "Preserve the subject")
        .replace("Reserve the source", "Preserve the source")
    )


async def _run_gemini_translation(system_prompt: str, user_input: str) -> str:
    """N5 / N6 対応: 翻訳実行を分離関数化 (テストで monkeypatch しやすい)。

    Gemini SDK の generate_content は同期 API のため asyncio.to_thread で
    event loop のブロックを回避する。

    Args:
        system_prompt: システム指示プロンプト (テンプレート込み)
        user_input: ユーザー入力の日本語テキスト

    Returns:
        Gemini が生成した英語プロンプト文字列 (strip 済)

    Raises:
        Exception: Gemini API 呼び出し失敗時はそのまま上位に伝播
    """
    client = get_gemini_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.0-flash",
        contents=user_input,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.6,
        ),
    )
    text = response.text
    if text is None:
        # Gemini が空応答を返した場合 (safety filter, max_tokens 超過, structured output 失敗等)
        logger.error(
            "Gemini returned None text. Response candidates: %s, finish_reason: %s",
            getattr(response, 'candidates', None),
            getattr(response.candidates[0] if response.candidates else None, 'finish_reason', None) if response.candidates else None,
        )
        raise ValueError("Gemini returned empty response. Possibly blocked by safety filter or token limit exceeded.")
    return text.strip()


def _extract_dialogues_via_regex(text: str) -> Optional[str]:
    """B1 対応: 「」/ 『』 内のセリフを正規表現で抽出して結合する。

    挙動 (B1 採用案 a: 1 階層厳密対応):
        - KAGI_BRACKET_PATTERN で「...」(内部に「」を含まない) を抽出
        - DOUBLE_KAGI_BRACKET_PATTERN で『...』(内部に『』を含まない) を抽出
        - 両者を結合して改行区切りで返す

    異種ネスト例 「彼は『やめて』と叫んだ」:
        → KAGI: ["彼は『やめて』と叫んだ"]
        → DOUBLE_KAGI: ["やめて"]
        → 結合: "彼は『やめて』と叫んだ\nやめて" (AC-C8 で固定)

    空文字列 「」 は strip() フィルタで除外される。
    """
    inner_kagi = KAGI_BRACKET_PATTERN.findall(text)
    inner_double_kagi = DOUBLE_KAGI_BRACKET_PATTERN.findall(text)

    # 空文字フィルタ (10-5 対応: 「」内が空の場合を除外)
    all_dialogues = [d for d in (inner_kagi + inner_double_kagi) if d.strip()]

    return "\n".join(all_dialogues) if all_dialogues else None


async def _extract_prompt_components(description_ja: str) -> ExtractedComponents:
    """日本語プロンプトから視覚情報・動き・セリフを構造化抽出する。
    AI による抽出 + 正規表現でのダブルチェック (セリフのみ)。

    Returns:
        ExtractedComponents (B3 対応: 戻り値 contract 統一済)
        - 文字列フィールドは常に str (失敗時も空文字)。
        - dialogue のみ Optional[str]。

    Raises:
        なし。AI 失敗時は正規表現フォールバックで ExtractedComponents を返す。
    """
    # 1. 正規表現で一次抽出 (AI を待たずに使える)
    regex_dialogue = _extract_dialogues_via_regex(description_ja)

    # 2. AI による構造化抽出 (gemini-2.0-flash, temperature=0.3)
    client = get_gemini_client()
    extraction_prompt = f"""\
Extract structured information from this Japanese video prompt.

Input:
{description_ja}

Return ONLY a single valid JSON OBJECT (not an array, not wrapped in markdown code blocks).
The output MUST start with {{ and end with }}.

Keys (all values are strings, empty "" if absent):
- subject_visual: Visual attributes of the main subject
  (colors, materials, shape, distinctive features). Include ALL visual
  descriptors mentioned, including non-human characteristics
  (e.g. "no limbs", "hung on hanger", "beige knit sweater texture").
- action: What the subject does (motion, posture changes).
- camera: Camera work if explicitly mentioned, else "".
- dialogue: Text inside 「」 or 『』 brackets, joined by newlines if multiple.
  Empty "" if no brackets present.
- micro_expression: Facial / emotional expression if mentioned, else "".
- lighting: Lighting conditions if mentioned, else "".
- other: Any other contextual hints, else "".
- must_include: Specific keywords user marked as required, else "".

Example output:
{{"subject_visual": "...", "action": "...", "camera": "", "dialogue": "...", "micro_expression": "...", "lighting": "", "other": "", "must_include": ""}}
"""
    try:
        # N5 対応: Gemini SDK の非同期化 (asyncio.to_thread で event loop ブロック回避)
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.0-flash",
            contents=extraction_prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        if response.text is None:
            logger.warning(
                "Component extraction: Gemini returned None text (safety filter or token limit). "
                "finish_reason: %s",
                getattr(response.candidates[0] if response.candidates else None, 'finish_reason', None) if response.candidates else None,
            )
            raise ValueError("Gemini returned None text for component extraction.")
        cleaned_text = re.sub(
            r'^```(json)?\s*|\s*```$', '', response.text.strip(), flags=re.MULTILINE
        )
        raw = json.loads(cleaned_text)
        if not isinstance(raw, dict):
            raise ValueError(
                f"Expected JSON object from Gemini, got {type(raw).__name__}: "
                f"{str(raw)[:100]}"
            )
    except Exception as e:
        logger.warning(
            "Component extraction failed, using regex fallback: %s", e
        )
        # フォールバック: description_ja をそのまま subject_visual に
        return ExtractedComponents(
            subject_visual=description_ja,
            action="",
            camera="",
            micro_expression="",
            lighting="",
            other="",
            must_include="",
            dialogue=regex_dialogue,  # 正規表現抽出結果は活かす
        )

    # 3. AI 結果を ExtractedComponents に変換 (型統一: None / 欠落は "" に変換)
    def _str(v) -> str:
        if v is None:
            return ""
        return str(v).strip()

    ai_dialogue = _str(raw.get("dialogue"))
    # セリフのみ正規表現結果を信頼ソースに優先 (10-8)
    final_dialogue: Optional[str]
    if regex_dialogue:
        final_dialogue = regex_dialogue
    elif ai_dialogue:
        final_dialogue = ai_dialogue
    else:
        final_dialogue = None

    return ExtractedComponents(
        subject_visual=_str(raw.get("subject_visual")) or description_ja,
        action=_str(raw.get("action")),
        camera=_str(raw.get("camera")),
        micro_expression=_str(raw.get("micro_expression")),
        lighting=_str(raw.get("lighting")),
        other=_str(raw.get("other")),
        must_include=_str(raw.get("must_include")),
        dialogue=final_dialogue,
    )


async def translate_story_prompt(
    params: TranslateStoryPromptInput,
) -> tuple[str, Optional[str]]:
    """PromptNode 用: 日本語プロンプトを英語に翻訳し、セリフを分離抽出する。

    Args:
        params: 翻訳パラメータ (dataclass で集約)

    Returns:
        tuple[english_prompt: str, extracted_dialogue: Optional[str]]
        - english_prompt: 常に str (失敗時は例外送出、空文字は返さない)
        - extracted_dialogue: 「」/『』検出時のみ str、未検出時 None

    Raises:
        Exception: Gemini 翻訳呼び出し失敗時 (フォールバックなし、呼び出し元でハンドリング)
    """
    # B4 対応: Phase 1 では Act-Two 引数を未使用、警告ログのみ
    if params.use_act_two:
        logger.warning(
            "Act-Two mode is not supported in translate_story_prompt yet. "
            "Phase 2 will add _build_act_two_instruction(). "
            "Falling back to standard translation for now. "
            "use_act_two=%s motion_type=%s expression_intensity=%s body_control=%s",
            params.use_act_two,
            params.motion_type,
            params.expression_intensity,
            params.body_control,
        )

    # --- Phase 1: 構造化抽出 ---
    extracted: ExtractedComponents = await _extract_prompt_components(
        params.description_ja
    )

    # --- Phase 2: 翻訳 + テンプレ整形 ---
    reference_instruction = _build_reference_instruction(params.subject_type)
    system_prompt = _build_translate_system_prompt(
        extracted=extracted,
        reference_instruction=reference_instruction,
        params=params,
    )

    english_prompt = await _run_gemini_translation(system_prompt, params.description_ja)

    # --- Phase 3: typo サニタイズ (A 案安全網、第 2 層) ---
    english_prompt = _sanitize_reserve_typo(english_prompt)

    # B5 対応: 1200 文字超過時は warning ログのみ (ハード上限なし)
    if len(english_prompt) > 1200:
        logger.warning(
            "translate_story_prompt output exceeded soft target: %d chars "
            "(target <= 1200). Kling 2500-char truncate acts as hard limit.",
            len(english_prompt),
        )

    return english_prompt, extracted.dialogue


# プロジェクトルートディレクトリ（movie-maker-api の親 = movie-project）
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent  # movie-project/

# B1 対応: モジュールスコープでパターン定数化
# ネストカッコは別々に抽出して結合する (採用案 a: 1 階層厳密)
KAGI_BRACKET_PATTERN = re.compile(r"「([^「」]*?)」")
DOUBLE_KAGI_BRACKET_PATTERN = re.compile(r"『([^『』]*?)』")


def load_prompt_template(
    provider: str,
    mode: str = "story",
    subject_type: str | None = None,
    animation_category: str | None = None,
    animation_template: str | None = None
) -> dict:
    """
    動画生成プロバイダーとモードに応じたプロンプトテンプレートを読み込む

    Args:
        provider: "runway", "veo", "domoai", または "piapi_kling"
        mode: "story"（ストーリーボード用・連続性重視）または "scene"（シーン生成用・インパクト重視）
        subject_type: "person"/"object"/"animation"（sceneモード時のみ使用）
        animation_category: "2d" または "3d"（animation選択時のみ使用）
        animation_template: "A-1"〜"B-4"（animation選択時のみ使用）

    Returns:
        dict: {
            "reference_rule": str,
            "clip_specific_template": str,
            "negative_prompt": str | None,
            "style_keywords": str | None  # アニメーションテンプレートのみ
        }
    """
    # アニメーションテンプレートの場合
    if subject_type == "animation" and animation_category and animation_template:
        return _load_animation_template(animation_category, animation_template, provider)

    # モードに応じたディレクトリを選択
    if mode not in ("story", "scene"):
        mode = "story"  # デフォルトはstory

    # sceneモードの場合、subject_typeに応じたサブディレクトリを使用
    if mode == "scene":
        if subject_type in ("person", "object"):
            template_dir = PROJECT_ROOT / "docs" / "prompt" / mode / subject_type
        elif subject_type == "animation":
            # animation選択でテンプレート未指定の場合はpersonをフォールバック
            template_dir = PROJECT_ROOT / "docs" / "prompt" / mode / "person"
            logger.info(f"Animation without template, falling back to person template")
        else:
            template_dir = PROJECT_ROOT / "docs" / "prompt" / mode / "person"
    else:
        template_dir = PROJECT_ROOT / "docs" / "prompt" / mode

    # プロバイダー別テンプレートファイル名
    provider_template_map = {
        "veo": "veo_api_template.md",
        "domoai": "domoai_api_template.md",
        "piapi_kling": "kling_api_template.md",
    }
    template_filename = provider_template_map.get(provider, "runway_api_template.md")
    template_path = template_dir / template_filename

    if not template_path.exists():
        logger.warning(f"Template file not found: {template_path}, using default")
        return {
            "reference_rule": "",
            "clip_specific_template": "",
            "negative_prompt": None,
            "style_keywords": None,
            "quality_boosters": None
        }

    content = template_path.read_text(encoding="utf-8")

    result = {
        "reference_rule": "",
        "clip_specific_template": "",
        "negative_prompt": None,
        "style_keywords": None,
        "quality_boosters": None
    }

    # REFERENCE RULE または SINGLE IMAGE RULE セクションを抽出
    if "REFERENCE RULE" in content:
        start = content.find("REFERENCE RULE")
        end = content.find("CLIP SPECIFIC", start)
        if end > start:
            result["reference_rule"] = content[start:end].strip()
    elif "SINGLE IMAGE RULE" in content:
        # シーン用テンプレート（1枚の画像用）
        start = content.find("SINGLE IMAGE RULE")
        end = content.find("CLIP SPECIFIC", start)
        if end > start:
            result["reference_rule"] = content[start:end].strip()

    # CLIP SPECIFIC テンプレートを抽出
    if "CLIP SPECIFIC" in content:
        start = content.find("CLIP SPECIFIC (edit only this block):")
        if start != -1:
            # 次のセクション（---）まで取得
            end = content.find("---", start)
            if end == -1:
                end = content.find("## NEGATIVE PROMPT", start)
            if end == -1:
                end = content.find("## 例", start)
            if end > start:
                result["clip_specific_template"] = content[start:end].strip()

    # NEGATIVE PROMPT を抽出（Runwayのみ）
    if "NEGATIVE PROMPT" in content:
        start = content.find("## NEGATIVE PROMPT")
        if start != -1:
            # セクション内容を取得
            lines_start = content.find("\n", start) + 1
            end = content.find("---", lines_start)
            if end > lines_start:
                result["negative_prompt"] = content[lines_start:end].strip()

    logger.info(f"Loaded prompt template for provider: {provider}, mode: {mode}, subject_type: {subject_type}")
    return result


def _load_animation_template(category: str, template_id: str, provider: str = "runway") -> dict:
    """
    アニメーションスタイルテンプレートを読み込む

    Args:
        category: "2d" または "3d"
        template_id: "A-1"〜"A-4"（2D）または "B-1"〜"B-4"（3D）
        provider: "runway", "veo", "domoai", または "piapi_kling"

    Returns:
        dict: {
            "reference_rule": str,
            "clip_specific_template": str,
            "negative_prompt": str | None,
            "style_keywords": str
        }
    """
    import re

    # プロバイダー別ファイル名マッピング
    template_file_maps = {
        "runway": {
            "A-1": "A-1_modern_tv_anime.md",
            "A-2": "A-2_ghibli_style.md",
            "A-3": "A-3_90s_retro.md",
            "A-4": "A-4_flat_design.md",
            "B-1": "B-1_photorealistic.md",
            "B-2": "B-2_game_ue5.md",
            "B-3": "B-3_pixar_style.md",
            "B-4": "B-4_low_poly_ps1.md",
        },
        "veo": {
            "A-1": "A-1_modern_vtuber.md",
            "A-2": "A-2_ghibli.md",
            "A-3": "A-3_90s_retro.md",
            "A-4": "A-4_flat_simple.md",
            "B-1": "B-1_photorealistic.md",
            "B-2": "B-2_ue5_game.md",
            "B-3": "B-3_pixar.md",
            "B-4": "B-4_low_poly_ps1.md",
        },
        "domoai": {
            "A-1": "A-1_japanese_anime.md",
            "A-2": "A-2_flat_color_anime.md",
            "A-3": "A-3_90s_retro.md",
            "A-4": "A-4_pixel_art.md",
            "B-1": "B-1_realistic.md",
            "B-2": "B-2_cartoon_game.md",
            "B-3": "B-3_3d_anime.md",
            "B-4": "B-4_chibi_deformed.md",
        },
        "piapi_kling": {
            "A-1": "A-1_modern_tv_anime.md",
            "A-2": "A-2_ghibli_style.md",
            "A-3": "A-3_90s_retro.md",
            "A-4": "A-4_flat_design.md",
            "B-1": "B-1_photorealistic.md",
            "B-2": "B-2_game_ue5.md",
            "B-3": "B-3_pixar_style.md",
            "B-4": "B-4_low_poly_ps1.md",
        },
    }

    # プロバイダー別のディレクトリ名マッピング（フォルダ名が異なる場合）
    provider_folder_map = {
        "runway": "runway",
        "veo": "veo",
        "domoai": "domo",  # DomoAIはdomoフォルダを使用
        "piapi_kling": "kling",  # PiAPI Klingはklingフォルダを使用
    }

    # プロバイダーに応じたマッピングを取得（不明な場合はrunway）
    file_map = template_file_maps.get(provider, template_file_maps["runway"])
    filename = file_map.get(template_id)
    folder_name = provider_folder_map.get(provider, provider)

    if not filename:
        logger.warning(f"Unknown animation template ID: {template_id}")
        return {
            "reference_rule": "",
            "clip_specific_template": "",
            "negative_prompt": None,
            "style_keywords": ""
        }

    template_path = PROJECT_ROOT / "docs" / "prompt" / "scene" / "anime" / category / folder_name / filename

    if not template_path.exists():
        logger.warning(f"Animation template file not found: {template_path}")
        return {
            "reference_rule": "",
            "clip_specific_template": "",
            "negative_prompt": None,
            "style_keywords": ""
        }

    content = template_path.read_text(encoding="utf-8")

    result = {
        "reference_rule": "",
        "clip_specific_template": "",
        "negative_prompt": None,
        "style_keywords": "",
        "quality_boosters": ""  # DomoAI用の品質向上ブースター
    }

    # 品質向上ブースター（Magic Words）を抽出（DomoAI用）
    if "## 品質向上ブースター" in content:
        start = content.find("## 品質向上ブースター")
        end = content.find("---", start)
        if end > start:
            booster_section = content[start:end]
            # コードブロック内のキーワードを抽出
            code_blocks = re.findall(r'```\n?(.*?)\n?```', booster_section, re.DOTALL)
            if code_blocks:
                # 最初の2つのコードブロックを結合（一般 + スタイル特化）
                boosters = []
                for block in code_blocks[:2]:
                    boosters.append(block.strip())
                result["quality_boosters"] = ", ".join(boosters)

    # スタイルキーワードを抽出
    if "## スタイルキーワード" in content:
        start = content.find("## スタイルキーワード")
        end = content.find("---", start)
        if end > start:
            keywords_section = content[start:end]
            # バッククォート内のキーワードを抽出
            keywords = re.findall(r'`([^`]+)`', keywords_section)
            result["style_keywords"] = ", ".join(keywords)

    # TEXT PROMPT セクションから SINGLE IMAGE RULE と CLIP SPECIFIC を抽出
    if "## TEXT PROMPT" in content:
        start = content.find("## TEXT PROMPT")
        end = content.find("---", start)
        if end > start:
            template_section = content[start:end]

            # SINGLE IMAGE RULE を抽出
            if "SINGLE IMAGE RULE" in template_section:
                rule_start = template_section.find("SINGLE IMAGE RULE")
                rule_end = template_section.find("CLIP SPECIFIC", rule_start)
                if rule_end > rule_start:
                    result["reference_rule"] = template_section[rule_start:rule_end].strip()

            # CLIP SPECIFIC テンプレートを抽出
            if "CLIP SPECIFIC" in template_section:
                clip_start = template_section.find("CLIP SPECIFIC (edit only this block):")
                if clip_start != -1:
                    # Final note: の行まで取得（セクション終了）
                    clip_section = template_section[clip_start:]
                    # Final note で終わる行を見つける
                    final_note_match = re.search(r'Final note:.*', clip_section)
                    if final_note_match:
                        clip_end = final_note_match.end()
                        result["clip_specific_template"] = clip_section[:clip_end].strip()
                    else:
                        result["clip_specific_template"] = clip_section.strip()

    # 旧フォーマット対応（フォールバック）
    elif "## プロンプトテンプレート" in content:
        start = content.find("## プロンプトテンプレート")
        end = content.find("---", start)
        if end > start:
            template_section = content[start:end]
            # コードブロック内のテンプレートを抽出
            code_start = template_section.find("```")
            code_end = template_section.rfind("```")
            if code_start != -1 and code_end > code_start:
                template_text = template_section[code_start+3:code_end].strip()
                if template_text.startswith("\n"):
                    template_text = template_text[1:]
                result["clip_specific_template"] = template_text

    # ネガティブキーワードを抽出
    if "## ネガティブキーワード" in content:
        start = content.find("## ネガティブキーワード")
        end = content.find("---", start)
        if end == -1:
            end = content.find("## 注意事項", start)
        if end == -1:
            end = content.find("## 実例", start)
        if end > start:
            neg_section = content[start:end]
            # ❌で始まる行を抽出
            negatives = re.findall(r'❌\s*(.+)', neg_section)
            if negatives:
                result["negative_prompt"] = "Avoid: " + ", ".join(negatives)

    # reference_rule が空の場合のフォールバック
    if not result["reference_rule"]:
        result["reference_rule"] = f"""SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.
Animation style: {template_id} ({category.upper()})
Style keywords: {result["style_keywords"]}"""

    logger.info(f"Loaded animation template: {template_id} (category: {category}, provider: {provider}, folder: {folder_name}, quality_boosters: {bool(result['quality_boosters'])})")
    return result


def get_gemini_client() -> genai.Client:
    """Initialize Gemini client."""
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


async def optimize_prompt(prompt: str, template_id: str | None = None) -> str:
    """
    Optimize prompt for video generation using Gemini 3 Flash.
    
    Args:
        prompt (str): User input prompt.
        template_id (str | None): Template ID to add context (optional).
        
    Returns:
        str: Optimized prompt.
    """
    client = get_gemini_client()
    
    system_instruction = (
        "You are an expert prompt engineer for video generation AI (like KlingAI, Sora). "
        "Your task is to expand the user's input into a detailed, descriptive prompt suitable for generating a high-quality 5-second video. "
        "Focus on visual details, lighting, camera movement, and atmosphere. "
        "Keep the output in English, even if the input is in Japanese. "
        "Do not include any explanations, just return the optimized prompt string."
    )

    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            )
        )
        
        return response.text
    except Exception as e:
        print(f"Gemini optimization failed: {e}")
        return prompt  # Fallback to original prompt


async def generate_image(
    prompt: str,
    reference_image_urls: list[str] | None = None
) -> Image.Image | None:
    """
    Generate an image using Gemini 3 Pro (Nano Banana Pro).

    Args:
        prompt (str): Image generation prompt.
        reference_image_urls (list[str] | None): Optional reference image URLs (max 3).
            When provided, Gemini will use these images as style/content references,
            blending their visual characteristics in the generated image.

    Returns:
        Image.Image | None: Generated PIL Image or None if failed.
    """
    client = get_gemini_client()

    try:
        # コンテンツを構築
        contents = []

        # 参照画像がある場合はマルチモーダル入力として渡す（最大3枚）
        if reference_image_urls and len(reference_image_urls) > 0:
            loaded_images = []
            for i, img_url in enumerate(reference_image_urls[:3]):  # 最大3枚
                logger.info(f"Downloading reference image {i+1} for image generation: {img_url}")
                try:
                    async with httpx.AsyncClient() as http_client:
                        img_response = await http_client.get(img_url, timeout=30.0)
                        img_response.raise_for_status()
                        image_data = img_response.content

                    # 参照画像をコンテンツに追加
                    contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))
                    loaded_images.append(i + 1)
                except Exception as e:
                    logger.warning(f"Failed to download reference image {i+1}: {e}")

            if loaded_images:
                # 参照画像の枚数に応じてプロンプトを調整
                if len(loaded_images) == 1:
                    edit_prompt = f"""Based on the provided reference image, generate a new image with the following modifications while preserving the core visual style, colors, and aesthetic of the original:

{prompt}

IMPORTANT:
- Maintain the same color palette and lighting style as the reference image
- Keep the same photographic quality and artistic style
- Preserve the overall mood and atmosphere
- Apply the requested changes while keeping visual consistency with the reference"""
                else:
                    # 複数画像の場合は掛け合わせを指示
                    edit_prompt = f"""You are provided with {len(loaded_images)} reference images. Generate a new image that intelligently COMBINES and BLENDS elements from ALL provided reference images according to the following instructions:

{prompt}

MULTI-REFERENCE BLENDING RULES:
- Image 1: Use as the PRIMARY style/aesthetic reference (color palette, lighting, mood)
- Image 2: Extract key visual elements, subjects, or compositional ideas to incorporate
{"- Image 3: Additional style influence or detail reference" if len(loaded_images) >= 3 else ""}

IMPORTANT:
- Create a COHESIVE blend that feels natural, not collaged
- Maintain consistent lighting and color grading across all blended elements
- Preserve the photographic quality from Image 1
- Intelligently merge subjects/elements from other images
- The final result should look like a single, professionally composed image"""

                contents.append(edit_prompt)
                logger.info(f"{len(loaded_images)} reference image(s) added to image generation request")
            else:
                contents = [prompt]
        else:
            contents = [prompt]

        # Use Gemini 3 Pro Image (Nano Banana Pro) model
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["image", "text"],
            )
        )

        for part in response.parts:
            if part.inline_data:
                return part.as_image()

        return None

    except Exception as e:
        logger.error(f"Gemini image generation failed: {e}")
        return None


# ===== AI主導ストーリーテリング用関数 =====

async def suggest_stories_from_image(image_url: str) -> list[str]:
    """
    画像からストーリー候補を5つ生成

    Args:
        image_url: 分析対象の画像URL

    Returns:
        list[str]: 日本語のストーリー候補リスト
    """
    client = get_gemini_client()

    system_prompt = """
この画像を分析して、5秒間の短い動画にできそうなストーリーを5つ提案してください。

ルール:
- 画像に写っている人物/動物/物の動きを想像する
- シンプルで実現可能な動きにする（大きな場面転換は避ける）
- 日本語で、1文で簡潔に書く（15〜25文字程度）
- 動きや変化を具体的に描写する

JSON配列形式で出力（説明や前置きは不要）:
["ストーリー1", "ストーリー2", "ストーリー3", "ストーリー4", "ストーリー5"]
"""

    try:
        # 画像をダウンロード
        async with httpx.AsyncClient() as http_client:
            img_response = await http_client.get(image_url, timeout=30.0)
            img_response.raise_for_status()
            image_data = img_response.content

        # Geminiに送信
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                system_prompt
            ],
            config=types.GenerateContentConfig(temperature=0.8)
        )

        # JSONをパース
        result_text = response.text.strip()
        # ```json ... ``` を除去
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]

        return json.loads(result_text)

    except Exception as e:
        logger.exception(f"Story suggestion failed: {e}")
        # フォールバック
        return [
            "ゆっくりとカメラ目線になる",
            "風で髪がなびく",
            "微笑みから驚いた表情に変わる",
            "手を振る動作をする",
            "深呼吸してリラックスする"
        ]


async def analyze_image_for_base_prompt(image_url: str) -> str:
    """
    画像を解析してベースプロンプトを生成（Identity Anchor付き）

    Args:
        image_url: 分析対象の画像URL

    Returns:
        str: キャラクター、背景、画風を含む詳細な説明（英語）
              Identity Anchor（絶対変更禁止項目）を含む
    """
    client = get_gemini_client()

    system_prompt = """
Analyze this image with EXTREME PRECISION for use as an "Identity Anchor" in AI video generation.

Your description will be used to ensure the EXACT same subject appears in all generated frames.
ANY deviation in the generated content will be considered a CRITICAL FAILURE.

Describe with MAXIMUM DETAIL:

【IDENTITY ANCHOR - ABSOLUTELY UNCHANGEABLE】
1. FACE (if human/animal):
   - Exact facial structure (face shape, jawline, cheekbones)
   - Eye details (shape, color, size, spacing, eyelid type)
   - Nose details (shape, size, bridge)
   - Mouth/lips details (shape, size, color)
   - Eyebrows (shape, thickness, color)
   - Skin tone (exact shade)
   - Any distinctive features (moles, freckles, scars)
   - Apparent age and gender

2. HAIR:
   - Exact color (include highlights, roots if visible)
   - Length and style
   - Texture (straight, wavy, curly)
   - Parting and arrangement

3. BODY:
   - Body type and proportions
   - Visible skin areas

4. CLOTHING & ACCESSORIES:
   - Every piece of clothing with colors and patterns
   - All accessories (jewelry, glasses, bags, etc.)
   - Textures and materials

5. BACKGROUND ELEMENTS:
   - Location type
   - All visible objects
   - Colors and atmosphere

6. TECHNICAL:
   - Photography style (portrait, candid, etc.)
   - Lighting direction and quality
   - Color grading/tone

Format your response as:
---IDENTITY_ANCHOR_START---
[Your detailed description here as one comprehensive paragraph]
---IDENTITY_ANCHOR_END---

PROTECTION_LEVEL: MAXIMUM
WARNING: Any AI-generated frames MUST preserve EVERY detail listed above.
The subject's identity, appearance, and all visual elements are LOCKED and IMMUTABLE.
"""

    try:
        async with httpx.AsyncClient() as http_client:
            img_response = await http_client.get(image_url, timeout=30.0)
            img_response.raise_for_status()
            image_data = img_response.content

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                system_prompt
            ],
            config=types.GenerateContentConfig(temperature=0.2)  # 低めで精度重視
        )

        return response.text.strip()

    except Exception as e:
        logger.exception(f"Image analysis failed: {e}")
        raise


async def generate_storyboard_prompts(base_prompt: str, story_text: str) -> list[dict]:
    """
    ベースプロンプトとストーリーから3フレーム分の構造化プロンプトを生成

    Args:
        base_prompt: 画像解析から得たベースプロンプト（Identity Anchor含む）
        story_text: ユーザーのストーリー

    Returns:
        list[dict]: 3つの構造化プロンプト（各フレーム）
    """
    client = get_gemini_client()

    system_prompt = f"""
You are an expert prompt engineer for AI image generation with STRICT identity preservation requirements.

Based on the following Identity Anchor and story, create 3 sequential frame prompts.

═══════════════════════════════════════════════════════════════
【IDENTITY ANCHOR - PROTECTED ELEMENTS (DO NOT MODIFY)】
{base_prompt}
═══════════════════════════════════════════════════════════════

【Story (the ONLY thing that can change)】
{story_text}

════════════════════════════════════════════════════════════════
⚠️ CRITICAL PROTECTION RULES - VIOLATION = FAILURE ⚠️
════════════════════════════════════════════════════════════════

🔒 ABSOLUTELY LOCKED (Cannot change across ANY frame):
- Face structure, features, and all facial details
- Eye color, shape, and characteristics
- Hair color, length, style, and texture
- Skin tone and any distinctive marks
- Body type and proportions
- ALL clothing items and their colors/patterns
- ALL accessories (jewelry, glasses, bags, etc.)
- Background location and objects
- Art style, lighting quality, and color grading

✅ ALLOWED TO CHANGE (Only these):
- Facial expression (smile, surprise, etc.)
- Eye direction (looking left, right, up, down)
- Head angle (slight tilt or turn)
- Body pose (arm position, stance)
- Natural movements (blinking, breathing)

════════════════════════════════════════════════════════════════

CRITICAL RULES FOR HUMAN SUBJECTS:
- ALWAYS include "natural blinking" or "subtle eye blink" in [Action]
- This ensures realistic human movement in video

For each frame, create a structured prompt:

[Scene] COPY EXACTLY from Identity Anchor - same background
[Element] COPY EXACTLY from Identity Anchor - same subject with ALL details
[Action] ONLY pose/expression change - NOTHING else
[Style] cinematic, photorealistic, SAME lighting as original

Frame progression:
- Frame 1: EXACT match to original image
- Frame 2: Slight movement (same identity, small action change)
- Frame 3: Final pose (same identity, story conclusion)

VERIFICATION CHECKLIST (apply to each frame):
□ Face identical to original? ✓
□ Hair identical to original? ✓
□ Clothing identical to original? ✓
□ Accessories identical to original? ✓
□ Background identical to original? ✓
□ Only pose/expression changed? ✓

Output as JSON array with 3 objects:
[
  {{
    "frame": 1,
    "scene": "...",
    "element": "...",
    "action": "...",
    "style": "...",
    "full_prompt": "[Scene] ... [Element] ... [Action] ... [Style] ... IMPORTANT: Preserve exact identity from reference."
  }},
  ...
]

Output JSON only.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=system_prompt,
            config=types.GenerateContentConfig(temperature=0.7)
        )

        result_text = response.text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]

        prompts = json.loads(result_text)

        if len(prompts) != 3:
            raise ValueError(f"Expected 3 prompts, got {len(prompts)}")

        return prompts

    except Exception as e:
        logger.exception(f"Storyboard generation failed: {e}")
        raise


async def generate_4scene_storyboard(
    image_url: str,
    mood: str | None = None,
    video_provider: str = "runway"
) -> dict:
    """
    【映画監督モード】1枚の画像から起承転結4シーンのストーリーボードを生成

    世界最高峰の映画監督兼動画生成APIプロンプトエンジニアとして、
    ユーザーの画像を解析し、20秒間（5秒×4シーン）の構成案を作成。

    Args:
        image_url: 分析対象の画像URL
        mood: ユーザーが選択したテーマ/ムード（例：楽しい、感動、ロマンチック）
        video_provider: 動画生成プロバイダー（"runway", "veo", "domoai", "piapi_kling"）

    Returns:
        dict: {
            "title": str,
            "theme": str,
            "scenes": [
                {
                    "scene_number": int,
                    "act": str,  # 起/承/転/結
                    "description_ja": str,
                    "runway_prompt": str,
                    "camera_work": str,
                    "mood": str,
                    "duration_seconds": int
                }
            ]
        }
    """
    client = get_gemini_client()

    # プロバイダー別テンプレートを読み込み
    template = load_prompt_template(video_provider)
    provider_name = "Google Veo 2" if video_provider == "veo" else "Runway Gen-3 Alpha"

    # ムード指定がある場合の追加プロンプト
    mood_instruction = ""
    if mood:
        mood_instruction = f"""
═══════════════════════════════════════════════════════════════════════════════
🎭 USER'S REQUESTED MOOD/THEME: {mood}
═══════════════════════════════════════════════════════════════════════════════

CRITICAL: The user wants a "{mood}" style video. You MUST:
- Match the overall tone and atmosphere to this mood
- Choose camera movements that enhance this feeling
- Write prompts that evoke this emotional quality
- Ensure the 4-scene arc builds toward and resolves this mood

Mood-specific guidelines:
- 楽しい/ポップ (Happy/Pop): Bright colors, dynamic movement, upbeat energy, smiles
- 感動/切ない (Emotional/Sad): Soft lighting, gentle movements, contemplative moments
- ロマンチック (Romantic): Warm tones, intimate framing, soft focus, tender expressions
- エネルギッシュ (Energetic): Fast camera moves, dynamic action, high contrast
- 穏やか/癒し (Calm/Healing): Slow movements, natural lighting, peaceful scenes
- Custom mood: Interpret and apply the user's specific request creatively

"""

    # テンプレート情報をプロンプトに組み込み
    template_instruction = ""
    if template["reference_rule"] or template["clip_specific_template"]:
        template_instruction = f"""
═══════════════════════════════════════════════════════════════════════════════
📋 PROMPT TEMPLATE STRUCTURE (FOLLOW THIS FORMAT)
═══════════════════════════════════════════════════════════════════════════════

{template["reference_rule"]}

{template["clip_specific_template"]}
"""
        if template["negative_prompt"] and video_provider == "runway":
            template_instruction += f"""
NEGATIVE PROMPT (include in output for Runway):
{template["negative_prompt"]}
"""

    # 世界最高峰の映画監督としてのシステムプロンプト
    system_prompt = mood_instruction + template_instruction + f"""
═══════════════════════════════════════════════════════════════════════════════
🎬 DIRECTOR'S MODE: WORLD-CLASS FILM DIRECTOR & {provider_name.upper()} EXPERT
═══════════════════════════════════════════════════════════════════════════════

You are a world-renowned film director and {provider_name} prompt engineering master.
Your mission: Transform this single image into a compelling 20-second short film (4 scenes × 5 seconds).

═══════════════════════════════════════════════════════════════════════════════
📜 THE FOUR-ACT STRUCTURE (起承転結 - Kishōtenketsu)
═══════════════════════════════════════════════════════════════════════════════

【起 (KI) - INTRODUCTION】Scene 1
- Establish the world, subject, and atmosphere
- Camera: SLOW, contemplative (Slow Zoom In, Static Wide, Gentle Pan)
- Movement: Minimal, breathing, subtle environmental motion
- Purpose: Draw viewer into the frame, create intimacy

【承 (SHŌ) - DEVELOPMENT】Scene 2
- Build upon the introduction, add narrative momentum
- Camera: TRACKING, following movement (Dolly, Arc Shot, Push In)
- Movement: Subject begins to move, interact, or respond
- Purpose: Deepen engagement, hint at what's to come

【転 (TEN) - TWIST/CLIMAX】Scene 3
- The pivotal moment, peak of visual/emotional intensity
- Camera: DYNAMIC, impactful (Whip Pan, Quick Zoom, Dutch Angle, Crane)
- Movement: Dramatic gesture, revelation, peak action
- Purpose: Create the "wow" moment, maximum visual impact

【結 (KETSU) - CONCLUSION】Scene 4
- Resolution, emotional landing, lingering impression
- Camera: SLOW, reflective (Slow Zoom Out, Wide, Fade)
- Movement: Return to stillness, contemplative pose, environmental response
- Purpose: Leave lasting impression, invite rewatching

═══════════════════════════════════════════════════════════════════════════════
🎯 {provider_name.upper()} OPTIMIZATION RULES
═══════════════════════════════════════════════════════════════════════════════

【CRITICAL: Follow the PROMPT TEMPLATE STRUCTURE above for runway_prompt output】

【MUST INCLUDE in every prompt】
- REFERENCE RULE section (for image reference continuity)
- CLIP SPECIFIC section with: Scene, Subject, Micro-expression, Camera, Lighting, Must include, Final note
- Subject description with FIXED attributes (same person/object across all scenes)
- "Same [subject] from previous scene" for scenes 2-4

【AVOID】
- Abstract concepts without visual anchor
- Multiple scene changes within one prompt
- Conflicting motion directions
- Overcomplicated scenarios
- PHYSICALLY IMPOSSIBLE MOVEMENTS (see constraints below)

═══════════════════════════════════════════════════════════════════════════════
⚠️ PHYSICAL CONSTRAINTS - MANDATORY (Even for Animation)
═══════════════════════════════════════════════════════════════════════════════

【HUMAN BODY RANGE OF MOTION - STRICTLY ENFORCE】
- HEAD/NECK: Maximum rotation ~80° left/right (NOT 360°!), tilt ~45° side, ~45° forward/back
- SHOULDERS: Maximum rotation ~180° forward, ~60° backward
- ELBOWS: Bend 0°-145° only, NO hyperextension, NO backward bending
- WRISTS: Rotation ~180° total, flex ~80°, extend ~70°
- SPINE: Gradual curves only, NO sudden 90° bends, NO impossible twists
- HIPS: ~120° flexion, ~30° extension, ~45° abduction
- KNEES: Bend 0°-140° only, NO backward bending

【FORBIDDEN MOVEMENTS - NEVER GENERATE】
❌ Head rotating 360° or more than 90° in either direction
❌ Limbs bending in wrong direction (knees bending forward, elbows bending backward)
❌ Spine twisting unnaturally or folding at sharp angles
❌ Fingers bending backward or in impossible directions
❌ Body parts detaching, stretching unnaturally, or passing through each other
❌ Instantaneous teleportation or position changes without transition
❌ Floating or defying gravity without clear artistic intent

【BODY PART PERSISTENCE - CRITICAL】
All body parts must remain visible and consistent throughout the entire video:
- FINGERS: All 5 fingers on each hand must be visible when hands are shown. Never let fingers disappear, merge, or change count mid-animation.
- HANDS: Both hands must remain attached and visible. If one hand is shown, it must stay visible or naturally move out of frame (not vanish).
- LIMBS: Arms and legs must not disappear or phase in/out during movement.
- FACIAL FEATURES: Eyes, nose, mouth, ears must remain consistent. No morphing or disappearing.
- HAIR: Hair volume and style must remain consistent (no sudden bald patches or style changes).

【PROMPT KEYWORDS FOR BODY PERSISTENCE】
Always include these phrases when hands/fingers are involved:
✓ "maintaining all five fingers visible"
✓ "hands remain fully formed throughout"
✓ "consistent body structure"
✓ "no missing or morphing body parts"

【EVEN FOR STYLIZED ANIMATION】
- Exaggerated movements are OK, but must respect basic joint mechanics
- Squash and stretch is OK, but body structure must remain coherent
- Fast movements are OK, but must have proper anticipation and follow-through
- Always maintain skeletal integrity - bones don't bend, joints have limits

【SAFE MOTION KEYWORDS】
✓ "natural head turn", "gentle nod", "subtle glance"
✓ "smooth arm raise", "natural gesture", "relaxed pose shift"
✓ "realistic walk cycle", "believable movement", "anatomically correct motion"

【STYLE KEYWORDS that work well】
- cinematic, film grain, shallow depth of field
- natural lighting, golden hour, blue hour
- photorealistic, high detail, 4K quality
- smooth motion, fluid movement
- dramatic, intimate, contemplative

═══════════════════════════════════════════════════════════════════════════════
🎨 SUBJECT CONSISTENCY - CRITICAL
═══════════════════════════════════════════════════════════════════════════════

For HUMAN subjects, lock these attributes across ALL 4 scenes:
- Exact clothing colors and style
- Hair color, length, and style
- Accessories (jewelry, glasses, bags)
- Approximate age and build
- Skin tone

For OBJECT/ANIMAL subjects:
- Exact colors and patterns
- Size and proportions
- Distinctive features
- Material/texture

Include phrase: "maintaining exact appearance from scene 1" in scenes 2-4

═══════════════════════════════════════════════════════════════════════════════
📤 OUTPUT FORMAT (JSON)
═══════════════════════════════════════════════════════════════════════════════

{{
  "title": "Short evocative Japanese title (2-6 characters)",
  "theme": "One-line theme in Japanese",
  "scenes": [
    {{
      "scene_number": 1,
      "act": "起",
      "description_ja": "Japanese description for user (1-2 sentences, natural)",
      "runway_prompt": "English prompt optimized for {provider_name} (50-100 words)",
      "camera_work": "slow_zoom_in|tracking|dynamic_pan|slow_zoom_out|static|arc_shot|dolly_in|crane_up|whip_pan",
      "mood": "calm|building|intense|reflective|mysterious|joyful|melancholic",
      "duration_seconds": 5
    }},
    // ... scenes 2, 3, 4
  ]
}}

Output ONLY valid JSON. No explanations, no markdown code blocks.
"""

    try:
        # 画像をダウンロード
        async with httpx.AsyncClient() as http_client:
            img_response = await http_client.get(image_url, timeout=30.0)
            img_response.raise_for_status()
            image_data = img_response.content

        # Geminiに送信
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                system_prompt
            ],
            config=types.GenerateContentConfig(temperature=0.8)
        )

        # JSONをパース
        result_text = response.text.strip()
        # ```json ... ``` を除去
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            result_text = "\n".join(lines[1:-1])

        storyboard = json.loads(result_text)

        # バリデーション
        if "scenes" not in storyboard or len(storyboard["scenes"]) != 4:
            raise ValueError(f"Expected 4 scenes, got {len(storyboard.get('scenes', []))}")

        return storyboard

    except Exception as e:
        logger.exception(f"4-scene storyboard generation failed: {e}")
        # フォールバック：基本的なストーリーボードを返す
        return {
            "title": "物語",
            "theme": "静かな瞬間の美しさ",
            "scenes": [
                {
                    "scene_number": 1,
                    "act": "起",
                    "description_ja": "静かに佇む姿。カメラがゆっくりと近づいていく。",
                    "runway_prompt": "A person standing still, peaceful expression, soft natural lighting, camera slowly zooms in, cinematic, photorealistic, 5 seconds",
                    "camera_work": "slow_zoom_in",
                    "mood": "calm",
                    "duration_seconds": 5
                },
                {
                    "scene_number": 2,
                    "act": "承",
                    "description_ja": "わずかに動き始める。視線が動き、何かに気づいたような表情。",
                    "runway_prompt": "Same person from scene 1, slight head turn, eyes looking to the side, subtle movement, tracking shot, cinematic, 5 seconds",
                    "camera_work": "tracking",
                    "mood": "building",
                    "duration_seconds": 5
                },
                {
                    "scene_number": 3,
                    "act": "転",
                    "description_ja": "表情が変わる瞬間。感情が表に出る。",
                    "runway_prompt": "Same person from scene 1, emotional expression change, dynamic camera movement, dramatic lighting, cinematic moment, 5 seconds",
                    "camera_work": "dynamic_pan",
                    "mood": "intense",
                    "duration_seconds": 5
                },
                {
                    "scene_number": 4,
                    "act": "結",
                    "description_ja": "穏やかな表情に戻り、カメラが引いていく。余韻を残す。",
                    "runway_prompt": "Same person from scene 1, peaceful resolution, soft smile, camera slowly zooms out, lingering shot, cinematic, 5 seconds",
                    "camera_work": "slow_zoom_out",
                    "mood": "reflective",
                    "duration_seconds": 5
                }
            ]
        }


async def generate_story_frame_image(
    prompt: str,
    reference_image_url: str | None = None,
    previous_scene_image_url: str | None = None,
    aspect_ratio: str = "9:16",
) -> bytes | None:
    """
    元画像と直前のシーン画像を参照しながら、プロンプトに基づいて新しい画像を生成
    （厳格なIdentity Preservation付き）

    Args:
        prompt: 画像生成プロンプト
        reference_image_url: 参照元の画像URL（主役の一貫性を保つため）
        previous_scene_image_url: 直前のシーンの画像URL（シーン間の連続性を保つため）
        aspect_ratio: アスペクト比（デフォルト: "9:16" 縦長ポートレート）

    Returns:
        bytes: 生成された画像のバイトデータ、失敗時はNone
    """
    client = get_gemini_client()

    try:
        contents = []

        # 元画像がある場合は参照として渡す（Image 1: Identity Anchor）
        if reference_image_url:
            async with httpx.AsyncClient() as http_client:
                img_response = await http_client.get(reference_image_url, timeout=30.0)
                img_response.raise_for_status()
                image_data = img_response.content

            contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))

        # 直前のシーン画像がある場合も参照として渡す（Image 2: Previous Scene）
        if previous_scene_image_url:
            async with httpx.AsyncClient() as http_client:
                img_response = await http_client.get(previous_scene_image_url, timeout=30.0)
                img_response.raise_for_status()
                prev_image_data = img_response.content

            contents.append(types.Part.from_bytes(data=prev_image_data, mime_type="image/jpeg"))

            # 2枚の参照画像がある場合のプロンプト
            if previous_scene_image_url:
                enhanced_prompt = f"""
════════════════════════════════════════════════════════════════
⚠️ DUAL-REFERENCE IDENTITY PRESERVATION MODE ⚠️
════════════════════════════════════════════════════════════════

REFERENCE IMAGES PROVIDED:
- IMAGE 1 (First): Original/Source image - The IDENTITY ANCHOR (ground truth for appearance)
- IMAGE 2 (Second): Previous scene image - The CONTINUITY REFERENCE (for scene flow)

CRITICAL IMAGE FORMAT REQUIREMENT:
- Aspect ratio: {aspect_ratio} (portrait/vertical orientation)
- Generate a TALL, VERTICAL image suitable for short-form video (TikTok/Reels style)
- Width should be LESS than height (portrait mode)

YOUR TASK:
Generate the NEXT SCENE in this video sequence that:
1. Preserves EXACT identity from IMAGE 1 (original)
2. Follows naturally from IMAGE 2 (previous scene)
3. Applies the new prompt instructions below

🔒 IDENTITY PRESERVATION (From IMAGE 1 - IMMUTABLE):
- Face structure, features, all facial details
- Eye color, shape, characteristics
- Hair color, length, style, texture
- Skin tone and distinctive marks
- Clothing colors, patterns, materials
- All accessories

🔄 CONTINUITY (From IMAGE 2 - Flow naturally from this):
- Overall pose progression should feel natural
- Lighting consistency
- Emotional arc continuity
- Camera perspective similarity

✅ WHAT CAN CHANGE (Per the prompt below):
- Facial expression
- Eye direction
- Head angle (slight)
- Body pose
- Natural movement

════════════════════════════════════════════════════════════════
GENERATION PROMPT:
{prompt}
════════════════════════════════════════════════════════════════

Generate an image that seamlessly continues from the previous scene.
A viewer must immediately recognize this as the SAME PERSON progressing through a story.
"""
            else:
                # 元画像のみの場合のプロンプト
                enhanced_prompt = f"""
════════════════════════════════════════════════════════════════
⚠️ STRICT IDENTITY PRESERVATION MODE ⚠️
════════════════════════════════════════════════════════════════

CRITICAL IMAGE FORMAT REQUIREMENT:
- Aspect ratio: {aspect_ratio} (portrait/vertical orientation)
- Generate a TALL, VERTICAL image suitable for short-form video (TikTok/Reels style)
- Width should be LESS than height (portrait mode)

You are generating the NEXT FRAME in a video sequence.
The reference image above is the GROUND TRUTH.
Your generated image MUST be indistinguishable in identity from the reference.

🔒 ABSOLUTE REQUIREMENTS (FAILURE IF VIOLATED):

1. FACE IDENTITY - EXACT MATCH REQUIRED:
   - Same person/character - no exceptions
   - Identical facial structure, features, proportions
   - Same eye color, shape, and characteristics
   - Same nose, mouth, and facial details
   - Same skin tone and any distinctive marks

2. HAIR - EXACT MATCH REQUIRED:
   - Same color (including any highlights)
   - Same length and style
   - Same texture and arrangement

3. BODY - EXACT MATCH REQUIRED:
   - Same body type and proportions
   - Same skin tone on visible areas

4. CLOTHING & ACCESSORIES - EXACT MATCH REQUIRED:
   - Every piece of clothing must be identical
   - Same colors, patterns, and materials
   - All accessories in same position

5. BACKGROUND - EXACT MATCH REQUIRED:
   - Same location and environment
   - Same objects and atmosphere
   - Same lighting direction

✅ ONLY THESE CAN CHANGE:
- Facial expression
- Eye direction
- Head angle (slight)
- Body pose
- Natural blink

════════════════════════════════════════════════════════════════
GENERATION PROMPT:
{prompt}
════════════════════════════════════════════════════════════════

Generate an image that is the NEXT VIDEO FRAME.
A viewer must immediately recognize this as the SAME PERSON in the SAME SCENE.
If you cannot preserve identity exactly, DO NOT generate - this is CRITICAL.
"""
            contents.append(enhanced_prompt)
        else:
            # 参照画像なしの場合もアスペクト比を指定
            aspect_prompt = f"""
CRITICAL IMAGE FORMAT REQUIREMENT:
- Aspect ratio: {aspect_ratio} (portrait/vertical orientation)
- Generate a TALL, VERTICAL image suitable for short-form video (TikTok/Reels style)
- Width should be LESS than height (portrait mode)

{prompt}
"""
            contents.append(aspect_prompt)

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["image", "text"],
            )
        )

        for part in response.parts:
            if part.inline_data:
                return part.inline_data.data

        return None

    except Exception as e:
        logger.exception(f"Story frame image generation failed: {e}")
        return None


async def translate_scene_to_runway_prompt(
    description_ja: str,
    scene_number: int,
    base_image_context: str | None = None,
    video_provider: str = "runway",
    scene_act: str | None = None,
    template_mode: str = "story",
    subject_type: str | None = None,
    camera_work: str | None = None,
    animation_category: str | None = None,
    animation_template: str | None = None,
) -> str:
    """
    日本語のシーン説明をAPI用の英語プロンプトに変換（テンプレート構造を維持）

    Args:
        description_ja: 日本語のシーン説明
        scene_number: シーン番号（1-16、サブシーン含む）
        base_image_context: 元画像の説明（オプション）
        video_provider: 動画生成プロバイダー（"runway", "veo", "domoai", "piapi_kling"）
        scene_act: シーンのact（起/承/転/結）- サブシーンの場合はDBから取得
        template_mode: テンプレートモード（"story"=連続性重視, "scene"=インパクト重視）
        subject_type: 被写体タイプ（"person"/"object"/"animation"）- sceneモード時のみ使用
        camera_work: ユーザー選択のカメラワーク（例: "slow zoom in", "pan left"）
        animation_category: アニメーションカテゴリ（"2d"/"3d"）- animation選択時のみ
        animation_template: アニメーションテンプレートID（"A-1"〜"B-4"）- animation選択時のみ

    Returns:
        str: API用の英語プロンプト（テンプレート構造付き）
    """
    client = get_gemini_client()

    # テンプレートを読み込み（モードと被写体タイプに応じて異なるテンプレートを使用）
    template = load_prompt_template(
        video_provider,
        mode=template_mode,
        subject_type=subject_type,
        animation_category=animation_category,
        animation_template=animation_template
    )
    provider_name = "Google Veo 2" if video_provider == "veo" else "Runway Gen-3 Alpha"

    # actから適切な名前を決定（サブシーンもサポート）
    act_to_name = {
        "起": "起 (Introduction)",
        "承": "承 (Development)",
        "転": "転 (Climax)",
        "結": "結 (Conclusion)",
    }
    scene_number_to_act = {1: "起", 2: "承", 3: "転", 4: "結"}

    if scene_act:
        # DBから取得したactを使用（サブシーン対応）
        act_name = act_to_name.get(scene_act, f"Scene {scene_number}")
    else:
        # 従来の方法（scene_number 1-4の場合）
        act = scene_number_to_act.get(scene_number)
        act_name = act_to_name.get(act, f"Scene {scene_number}") if act else f"Scene {scene_number}"

    # テンプレート構造の説明
    template_structure = template.get("clip_specific_template", "")

    # サブシーンかどうかを判定
    is_sub_scene = scene_number > 4
    scene_label = f"Scene {scene_number} (continuation)" if is_sub_scene else f"Scene {scene_number} of 4"

    # カメラワーク指示を構築
    camera_instruction = ""
    if camera_work:
        camera_instruction = f"""
IMPORTANT - USER SELECTED CAMERA WORK:
The user has explicitly selected this camera movement: "{camera_work}"
You MUST use this exact camera work in the Camera field. Do not override or change it.
"""

    # アニメーションモード用のシステムプロンプト
    if subject_type == "animation" and animation_template:
        style_keywords = template.get("style_keywords", "")
        quality_boosters = template.get("quality_boosters", "")

        # DomoAI用の品質ブースターが存在する場合はそちらを優先
        motion_quality = quality_boosters if quality_boosters else style_keywords
        if not motion_quality:
            # フォールバック：デフォルトの品質ブースター
            motion_quality = "smooth fluid motion, high quality animation"

        # カメラワーク指示（staticの場合も被写体は動く）
        if camera_work and camera_work.lower() in ["static", "static shot"]:
            camera_prompt = "static camera"
        elif camera_work:
            camera_prompt = camera_work
        else:
            camera_prompt = "slow gentle push in"

        system_prompt = f"""
You are an expert prompt engineer for {provider_name} Image-to-Video generation.

Convert the Japanese description into a CONCISE English prompt for animation-style video.

Japanese: {description_ja}
Animation Style: {animation_template}
Provider: {video_provider}

CRITICAL RULES (Image-to-Video):
- The image already shows: character design, background, colors
- DO NOT describe appearance, clothing, hair color, setting
- ONLY describe: action, motion, camera movement
- SUBJECT MUST ALWAYS ANIMATE (breathing, blinking, subtle movements)

QUALITY BOOSTERS (MUST include at end):
{motion_quality}

OUTPUT FORMAT (follow exactly):
[Atmosphere/mood]. [Action description]. [ANIMATED details: expression, eyes blinking, hair swaying, breathing]. {camera_prompt}. {motion_quality}.

CRITICAL - ANIMATION REQUIREMENTS:
- NEVER say "remains still" or "no movement"
- ALWAYS include at least 3 types of motion: facial expression + body movement + hair/clothing
- Motion words to use: "slowly", "gently", "subtly shifts", "gradually", "breathing rhythm"
- Even for calm scenes, include: natural breathing, slow blinks, micro-expressions
- ALWAYS end with the quality boosters: {motion_quality}

EXAMPLE OUTPUT:
Mischievous mood. Subtle smirk spreading, head tilting slightly. Eyes blinking innocently, gentle breathing rhythm visible, hair swaying softly. {camera_prompt}. {motion_quality}.

Return ONLY the prompt text. No quotes, no explanations. Do not end with extra periods.
"""
    else:
        # 通常モード（person/object）用のシステムプロンプト
        system_prompt = f"""
You are an expert prompt engineer for {provider_name} video generation API.

Convert the following Japanese scene description into an optimized English prompt
that follows the EXACT template structure below.

Scene: {act_name} ({scene_label})
Japanese Description: {description_ja}
{camera_instruction}
═══════════════════════════════════════════════════════════════════════════════
REQUIRED OUTPUT TEMPLATE STRUCTURE (FOLLOW THIS EXACTLY):
═══════════════════════════════════════════════════════════════════════════════

{template.get("reference_rule", "")}

{template_structure}

═══════════════════════════════════════════════════════════════════════════════
RULES:
═══════════════════════════════════════════════════════════════════════════════
1. Output MUST follow the CLIP SPECIFIC template structure above
2. Fill in each field (Scene, Subject, Micro-expression, Camera, Lighting, Must include, Final note)
3. Translate the Japanese meaning, not word-by-word
4. Keep subject identity consistent across scenes
5. For scenes 2-4, emphasize continuity with "Same [subject] from previous scene"
6. Add cinematic details appropriate for each field
7. If user selected a camera work, use it EXACTLY in the Camera field

OUTPUT FORMAT:
Return ONLY the structured prompt following the template above.
Start with "REFERENCE RULE" section, then "CLIP SPECIFIC" section.
No additional explanations or quotes.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=system_prompt,
            config=types.GenerateContentConfig(temperature=0.7)
        )

        result = response.text.strip()
        # 余分なクォートや改行を削除
        result = result.strip('"\'')
        return result

    except Exception as e:
        logger.exception(f"Translation failed: {e}")
        # フォールバック: 基本的なテンプレート構造
        return f"""REFERENCE RULE (do not remove):
Use Image A as MASTER for identity, wardrobe, and world design.
{"Use Image B as PREVIOUS for continuity: exact outfit details, props, and layout." if scene_number > 1 else ""}
Keep the same person and same environment as a continuous scene.

CLIP SPECIFIC (edit only this block):
Scene: {description_ja}
Subject: Same subject maintaining appearance
Micro-expression: natural expression
Camera: cinematic framing, smooth movement
Lighting: natural lighting
Must include: continuity with previous scenes
Final note: Minimal motion, continuity over novelty, keep realism."""


async def generate_sub_scene_prompt(
    parent_prompt: str,
    parent_description_ja: str,
    sub_scene_order: int,
    camera_work: str | None = None,
    video_provider: str = "runway",
) -> dict:
    """
    親シーンから連続性のあるサブシーンプロンプトを生成

    親シーンの動画の「続き」として自然に繋がるプロンプトを生成する。
    映画のカット割りのように、同一シーン内での別アングルや動きの継続を表現。

    Args:
        parent_prompt: 親シーンのRunway/Veoプロンプト
        parent_description_ja: 親シーンの日本語説明
        sub_scene_order: サブシーン順序（1, 2, 3）
        camera_work: カメラワーク指定（省略時は自動選択）
        video_provider: 動画生成プロバイダー

    Returns:
        {
            "description_ja": "日本語説明",
            "runway_prompt": "英語プロンプト（連続性付き）"
        }
    """
    client = get_gemini_client()

    # テンプレートを読み込み
    template = load_prompt_template(video_provider)
    provider_name = "Google Veo 2" if video_provider == "veo" else "Runway Gen-3 Alpha"

    # サブシーンの時間的位置を表現
    temporal_hints = {
        1: "moments later, continuing the action",
        2: "a beat later, the scene progresses",
        3: "following through, completing the motion",
    }
    temporal_hint = temporal_hints.get(sub_scene_order, "continuing seamlessly")

    system_prompt = f"""
You are an expert cinematographer creating seamless scene continuations for {provider_name}.

Given a parent scene, generate a natural CONTINUATION that feels like the next cut in a film.
This is sub-scene #{sub_scene_order} after the parent scene.

═══════════════════════════════════════════════════════════════════════════════
PARENT SCENE (Reference - DO NOT repeat, but CONTINUE from this):
═══════════════════════════════════════════════════════════════════════════════
Japanese Description: {parent_description_ja}

Runway Prompt:
{parent_prompt}

═══════════════════════════════════════════════════════════════════════════════
CONTINUATION REQUIREMENTS:
═══════════════════════════════════════════════════════════════════════════════
1. Temporal Flow: {temporal_hint}
2. Camera Work: {camera_work if camera_work else "Select appropriate continuation camera movement"}
3. Visual Continuity: Same subject, same lighting, same environment
4. Motion Continuity: Continue or complete the motion from parent scene
5. Do NOT restart the action - this is a continuation, not a new scene

═══════════════════════════════════════════════════════════════════════════════
TEMPLATE STRUCTURE TO FOLLOW:
═══════════════════════════════════════════════════════════════════════════════
{template.get("clip_specific_template", "")}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON):
═══════════════════════════════════════════════════════════════════════════════
Return ONLY valid JSON with these two fields:
{{
    "description_ja": "Japanese description (1-2 sentences describing the continuation)",
    "runway_prompt": "Full prompt following the template structure above, with [Seamless continuation] prefix"
}}

IMPORTANT:
- The runway_prompt MUST start with "[Seamless continuation from previous cut]"
- Keep the same subject identity: "Same [subject] continuing..."
- Reference the previous frame: "Following the previous motion..."
- Do NOT use quotes around the JSON keys/values that would break parsing
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=system_prompt,
            config=types.GenerateContentConfig(temperature=0.7)
        )

        result_text = response.text.strip()

        # JSONとしてパース
        import json
        import re

        # コードブロックを除去
        result_text = re.sub(r'^```json\s*', '', result_text)
        result_text = re.sub(r'\s*```$', '', result_text)
        result_text = result_text.strip()

        try:
            result = json.loads(result_text)
            return {
                "description_ja": result.get("description_ja", f"（{parent_description_ja}の続き）"),
                "runway_prompt": result.get("runway_prompt", f"[Seamless continuation] {parent_prompt}"),
            }
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse JSON, using fallback: {result_text[:200]}")
            # フォールバック
            return {
                "description_ja": f"（{parent_description_ja}の続き - カット{sub_scene_order}）",
                "runway_prompt": f"""[Seamless continuation from previous cut]

REFERENCE RULE (do not remove):
Use previous frame as MASTER for identity, wardrobe, and world design.
Continue the exact same scene - same person, same environment, same moment.

CLIP SPECIFIC (edit only this block):
Scene: Continuation of previous action, {temporal_hint}
Subject: Same subject from previous frame, continuing motion
Camera: {camera_work if camera_work else "Smooth continuation"}
Lighting: Maintain consistent lighting from previous cut
Must include: Visual continuity, motion flow from previous frame
Final note: Seamless transition, minimal jarring changes, maintain realism.""",
            }

    except Exception as e:
        logger.exception(f"Sub-scene prompt generation failed: {e}")
        # エラー時のフォールバック
        return {
            "description_ja": f"（{parent_description_ja}の続き）",
            "runway_prompt": f"""[Seamless continuation from previous cut]

REFERENCE RULE (do not remove):
Continue from the previous frame. Same subject, same environment.

CLIP SPECIFIC:
Scene: Continuation - {temporal_hint}
Subject: Same subject continuing the action
Camera: {camera_work if camera_work else "Smooth hold or gentle movement"}
Lighting: Consistent with previous
Must include: Motion continuity
Final note: Seamless, natural progression.""",
        }


async def generate_ad_script(
    description: str,
    target_duration: int | None = None,
    aspect_ratio: str = "9:16"
) -> dict:
    """
    広告の説明からCM構成（カット割り）を生成

    広告クリエイティブディレクターとして、適切な広告理論を選択し、
    効果的なカット構成を自動生成する。

    Args:
        description: 広告の内容（どんな広告を作りたいか）
        target_duration: 希望の尺（秒）。15, 30, 60 または None（おまかせ）
        aspect_ratio: アスペクト比（"9:16" または "16:9"）

    Returns:
        dict: {
            "id": str,
            "theory": str,
            "theory_label": str,
            "total_duration": int,
            "cuts": [
                {
                    "id": str,
                    "cut_number": int,
                    "scene_type": str,
                    "scene_type_label": str,
                    "description_ja": str,
                    "description_en": str,
                    "duration": int
                }
            ]
        }
    """
    import uuid

    client = get_gemini_client()

    # 尺の指示
    duration_instruction = ""
    if target_duration:
        duration_instruction = f"""
目標尺: {target_duration}秒
- 合計秒数が{target_duration}秒に近くなるようにカット構成を調整してください
- 各カットは最低2秒、最大10秒の範囲で設定してください
"""
    else:
        duration_instruction = """
目標尺: おまかせ（AIが最適な尺を判断）
- 広告内容に応じて最適な尺を決定してください
- 短い商品紹介 → 15秒程度（3-4カット）
- 標準的な広告 → 30秒程度（4-6カット）
- ストーリー性のある広告 → 45-60秒程度（5-8カット）
"""

    system_prompt = f"""
あなたは世界トップクラスの広告クリエイティブディレクターです。
与えられた広告の説明から、効果的なCM構成（カット割り）を提案してください。

═══════════════════════════════════════════════════════════════════════════════
📝 広告の内容
═══════════════════════════════════════════════════════════════════════════════
{description}

═══════════════════════════════════════════════════════════════════════════════
⏱️ 尺の設定
═══════════════════════════════════════════════════════════════════════════════
{duration_instruction}

═══════════════════════════════════════════════════════════════════════════════
📐 アスペクト比
═══════════════════════════════════════════════════════════════════════════════
{aspect_ratio}（{"縦長・ショート動画向け" if aspect_ratio == "9:16" else "横長・YouTube等向け"}）

═══════════════════════════════════════════════════════════════════════════════
🎯 広告理論の選択基準
═══════════════════════════════════════════════════════════════════════════════

以下の中から、広告内容に最も適した理論を1つ選択してください：

【AIDA法】aida - 注目→興味→欲求→行動
- シンプルな商品紹介向け
- 新商品のローンチ、機能訴求
- カット例: attention（注目）→ interest（興味）→ desire（欲求）→ action（行動）

【PASONA法】pasona - 問題→共感→解決→提案→絞込→行動
- 課題解決型商品向け
- 悩み解決、ビフォーアフター訴求
- カット例: problem（問題）→ affinity（共感）→ solution（解決）→ offer（提案）→ narrow（絞込）→ action（行動）

【起承転結】kishoutenketsu - 導入→展開→転換→結末
- ストーリー重視の広告向け
- ブランドストーリー、感動系
- カット例: ki（導入）→ sho（展開）→ ten（転換）→ ketsu（結末）

【ストーリーテリング型】storytelling - フック→課題→旅→発見→変化→CTA
- 感情訴求向け
- ライフスタイル提案、体験型広告
- カット例: hook（フック）→ challenge（課題）→ journey（旅）→ discovery（発見）→ transformation（変化）→ cta（行動喚起）

═══════════════════════════════════════════════════════════════════════════════
📤 出力形式 (JSON)
═══════════════════════════════════════════════════════════════════════════════

{{
  "theory": "aida|pasona|kishoutenketsu|storytelling",
  "theory_label": "AIDA法（注目→興味→欲求→行動）",
  "total_duration": 30,
  "cuts": [
    {{
      "cut_number": 1,
      "scene_type": "attention",
      "scene_type_label": "注目",
      "description_ja": "忙しい朝、時間がなくて朝食を抜いてしまう女性",
      "description_en": "A busy woman rushing in the morning, skipping breakfast due to lack of time",
      "duration": 4
    }},
    // ... 以下同様
  ]
}}

═══════════════════════════════════════════════════════════════════════════════
⚠️ 重要な注意事項
═══════════════════════════════════════════════════════════════════════════════

1. description_en は動画生成AI（Runway/Veo）向けのプロンプトとして使える形式で記述
   - 視覚的に具体的な描写を含める
   - カメラワークの指示を含めても良い
   - 50-100語程度で詳細に

2. 各カットのdurationは内容に応じて最適化
   - 導入カット: 2-4秒（短めで印象的に）
   - 説明カット: 4-6秒（理解に必要な時間）
   - クライマックス: 4-8秒（インパクトを与える時間）
   - CTAカット: 2-4秒（行動を促す）

3. カット数は内容に応じて最適化（通常3-8カット）

4. scene_type_labelは必ず日本語で記述

出力はJSONのみ。説明や前置きは不要。
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=system_prompt,
            config=types.GenerateContentConfig(temperature=0.8)
        )

        result_text = response.text.strip()

        # ```json ... ``` を除去
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            result_text = "\n".join(lines[1:-1])

        script_data = json.loads(result_text)

        # IDを生成
        script_id = f"script_{uuid.uuid4().hex[:12]}"

        # カットにIDを付与
        cuts_with_ids = []
        for i, cut in enumerate(script_data.get("cuts", [])):
            cut_with_id = {
                "id": f"cut_{uuid.uuid4().hex[:8]}",
                "cut_number": cut.get("cut_number", i + 1),
                "scene_type": cut.get("scene_type", "unknown"),
                "scene_type_label": cut.get("scene_type_label", "シーン"),
                "description_ja": cut.get("description_ja", ""),
                "description_en": cut.get("description_en", ""),
                "duration": cut.get("duration", 5),
            }
            cuts_with_ids.append(cut_with_id)

        # 合計秒数を計算
        total_duration = sum(cut["duration"] for cut in cuts_with_ids)

        # theoryを小文字に正規化（Geminiが大文字で返す場合があるため）
        theory_raw = script_data.get("theory", "aida")
        theory = theory_raw.lower() if isinstance(theory_raw, str) else "aida"

        # 有効な理論かチェック
        valid_theories = ["aida", "pasona", "kishoutenketsu", "storytelling"]
        if theory not in valid_theories:
            theory = "aida"

        return {
            "id": script_id,
            "theory": theory,
            "theory_label": script_data.get("theory_label", "AIDA法"),
            "total_duration": total_duration,
            "cuts": cuts_with_ids,
        }

    except Exception as e:
        logger.exception(f"Ad script generation failed: {e}")
        # フォールバック: 基本的なAIDA構成を返す
        import uuid
        script_id = f"script_{uuid.uuid4().hex[:12]}"
        fallback_duration = target_duration or 30

        return {
            "id": script_id,
            "theory": "aida",
            "theory_label": "AIDA法（注目→興味→欲求→行動）",
            "total_duration": fallback_duration,
            "cuts": [
                {
                    "id": f"cut_{uuid.uuid4().hex[:8]}",
                    "cut_number": 1,
                    "scene_type": "attention",
                    "scene_type_label": "注目",
                    "description_ja": "視聴者の注意を引くインパクトのあるシーン",
                    "description_en": "Eye-catching opening scene that grabs viewer attention, dynamic camera movement",
                    "duration": max(3, fallback_duration // 4),
                },
                {
                    "id": f"cut_{uuid.uuid4().hex[:8]}",
                    "cut_number": 2,
                    "scene_type": "interest",
                    "scene_type_label": "興味",
                    "description_ja": "商品やサービスに興味を持たせるシーン",
                    "description_en": "Scene showcasing the product or service features, building curiosity",
                    "duration": max(4, fallback_duration // 4),
                },
                {
                    "id": f"cut_{uuid.uuid4().hex[:8]}",
                    "cut_number": 3,
                    "scene_type": "desire",
                    "scene_type_label": "欲求",
                    "description_ja": "商品を欲しいと思わせるシーン",
                    "description_en": "Scene creating desire, showing benefits and positive outcomes",
                    "duration": max(4, fallback_duration // 4),
                },
                {
                    "id": f"cut_{uuid.uuid4().hex[:8]}",
                    "cut_number": 4,
                    "scene_type": "action",
                    "scene_type_label": "行動",
                    "description_ja": "行動を促すCTA（コール・トゥ・アクション）",
                    "description_en": "Call to action with product display and purchase prompt",
                    "duration": max(3, fallback_duration - (fallback_duration // 4) * 3),
                },
            ],
        }



# ===== Text-to-Image 翻訳・変換関数 =====

# ドロップダウン値の英語マッピング（schemas.pyと同期）
_POSITION_EN_MAP = {
    "center": "centered in frame",
    "left": "positioned left of center",
    "right": "positioned right of center",
    "upper": "positioned at upper third",
    "lower": "positioned at lower third",
    "rule_of_thirds": "following rule of thirds",
}

_LIGHTING_EN_MAP = {
    "soft_natural": "soft natural daylight",
    "dramatic": "dramatic directional lighting",
    "studio": "professional studio lighting",
    "backlit": "backlighting with rim highlights",
    "golden_hour": "warm golden hour lighting",
    "moody": "moody low-key lighting",
}

_MOOD_EN_MAP = {
    "luxury": "sophisticated luxury aesthetic",
    "energetic": "dynamic energetic feel",
    "calm": "calm serene atmosphere",
    "playful": "playful whimsical mood",
    "professional": "clean professional look",
    "nostalgic": "nostalgic vintage feel",
}


def _is_likely_english(text: str) -> bool:
    """
    テキストが英語かどうかを簡易判定
    ASCII比率が80%以上なら英語と判定
    """
    if not text:
        return True
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    return ascii_chars / len(text) > 0.8


async def _translate_text_to_english(text: str) -> str:
    """
    日本語テキストを英語に翻訳
    """
    client = get_gemini_client()

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"Translate the following Japanese text to English. Return ONLY the English translation, nothing else:\n\n{text}",
            config=types.GenerateContentConfig(temperature=0.3)
        )
        result = response.text.strip()
        # クォートを除去
        result = result.strip('"\'')
        return result
    except Exception as e:
        logger.warning(f"Translation failed, using original text: {e}")
        return text


async def translate_structured_input_to_english(structured_input: dict) -> dict:
    """
    構造化入力の日本語フィールドを英語に翻訳

    - テキストフィールド（subject, background, color_palette, additional_notes）は翻訳
    - ドロップダウン値（subject_position, lighting, mood）は事前定義の英語値を使用
    - 既に英語の場合はそのまま返す

    Args:
        structured_input: 構造化入力辞書

    Returns:
        dict: 英語に変換された構造化入力
    """
    result = structured_input.copy()

    # ドロップダウン値は事前定義の英語に変換
    if result.get("subject_position"):
        result["subject_position"] = _POSITION_EN_MAP.get(
            result["subject_position"],
            result["subject_position"]
        )

    if result.get("lighting"):
        result["lighting"] = _LIGHTING_EN_MAP.get(
            result["lighting"],
            result["lighting"]
        )

    if result.get("mood"):
        result["mood"] = _MOOD_EN_MAP.get(
            result["mood"],
            result["mood"]
        )

    # テキストフィールドは翻訳（日本語の場合のみ）
    text_fields = ["subject", "background", "color_palette", "additional_notes"]

    for field in text_fields:
        value = result.get(field)
        if value and not _is_likely_english(value):
            result[field] = await _translate_text_to_english(value)
            logger.info(f"Translated {field}: {value} -> {result[field]}")

    return result


async def generate_image_prompt_from_scene(
    description_ja: str | None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16",
    structured_input: dict | None = None,
    reference_image_url: str | None = None,
    image_look: str = "cinematic",
) -> tuple[str, str]:
    """
    脚本または構造化入力から画像生成用プロンプトを生成

    Args:
        description_ja: カットの脚本（日本語）- 従来モード用
        dialogue: カットのセリフ（オプション）- 従来モード用
        aspect_ratio: アスペクト比
        structured_input: 構造化入力（Text-to-Image用、英語に翻訳済み）
        reference_image_url: 参照画像URL（オプション、マルチモーダル入力用）

    Returns:
        tuple[str, str]: (日本語プロンプト, 英語プロンプト)
    """
    client = get_gemini_client()

    # アスペクト比の説明
    aspect_desc = "縦長（9:16）" if aspect_ratio == "9:16" else "横長（16:9）"

    # 構造化入力がある場合は新しいモードを使用
    if structured_input:
        return await _generate_prompt_from_structured_input(
            client, structured_input, aspect_ratio, aspect_desc, reference_image_url
        )

    # 従来モード: description_ja + dialogue
    return await _generate_prompt_from_description(
        client, description_ja, dialogue, aspect_ratio, aspect_desc, image_look=image_look
    )


async def _generate_prompt_from_structured_input(
    client,
    structured_input: dict,
    aspect_ratio: str,
    aspect_desc: str,
    reference_image_url: str | None = None,
) -> tuple[str, str]:
    """
    構造化入力からプロンプトを生成（Text-to-Image用）
    参照画像がある場合はマルチモーダル入力として渡す
    """
    # 構造化入力から情報を抽出
    subject = structured_input.get("subject", "")
    subject_position = structured_input.get("subject_position", "centered in frame")
    background = structured_input.get("background", "")
    lighting = structured_input.get("lighting", "soft natural daylight")
    color_palette = structured_input.get("color_palette", "")
    mood = structured_input.get("mood", "")
    additional_notes = structured_input.get("additional_notes", "")

    # 構造化入力を整形
    input_parts = [f"Subject: {subject}"]
    if subject_position:
        input_parts.append(f"Position: {subject_position}")
    if background:
        input_parts.append(f"Background: {background}")
    if lighting:
        input_parts.append(f"Lighting: {lighting}")
    if color_palette:
        input_parts.append(f"Color palette: {color_palette}")
    if mood:
        input_parts.append(f"Mood: {mood}")
    if additional_notes:
        input_parts.append(f"Additional notes: {additional_notes}")

    input_text = "\n".join(input_parts)

    # ARRI カメラ・レンズルックの必須フレーズ
    arri_look_phrase = """Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail."""

    # 参照画像の有無でシステムプロンプトを切り替え
    if reference_image_url:
        system_prompt = f"""
You are a professional advertising creative director specializing in luxury brand imagery.
Create high-quality prompts for generating scene images with ARRI cinematic look.

## MANDATORY: Camera & Lens Look
ALL generated prompts MUST include this camera specification:
{arri_look_phrase}

## IMPORTANT: Reference Image Analysis
You are provided with a REFERENCE IMAGE (referred to as [INPUT_IMAGE]).
The subject in this image is referred to as [INPUT_IMAGE_SUBJECT].

You MUST:
1. Carefully analyze [INPUT_IMAGE] for: subject, style, colors, lighting, composition, textures
2. Preserve the visual identity and aesthetic of [INPUT_IMAGE]
3. Use [INPUT_IMAGE_SUBJECT] as the hero element in the generated scene
4. Match the lighting direction and quality from [INPUT_IMAGE]

## Input Variables
- [INPUT_IMAGE]: The reference image you are analyzing
- [INPUT_IMAGE_SUBJECT]: The main subject extracted from the reference image

## Structured Input Fields
- Subject: Main subject description (use this to understand [INPUT_IMAGE_SUBJECT])
- Position: Subject's position in frame (e.g., "centered at 50% horizontal, 52% vertical")
- Background: Setting/environment to create around [INPUT_IMAGE_SUBJECT]
- Lighting: Light type and direction (must match [INPUT_IMAGE])
- Color palette: Main colors (incorporate colors from [INPUT_IMAGE])
- Mood: Emotional atmosphere
- Additional notes: Extra instructions

## Output: 5-Stage Nanobanana Structure

### 1. Main Concept (1-2 sentences)
"This image employs [technique] to create [environment] for [INPUT_IMAGE_SUBJECT]. Shot on ARRI ALEXA 35 with ARRI Signature Prime lens."
→ Describe the visual concept integrating [INPUT_IMAGE_SUBJECT]

### 2. Visual Signature (1 sentence)
"[Composition description] with [INPUT_IMAGE_SUBJECT] at [position], surrounded by [elements], [color/composition from INPUT_IMAGE]."
→ Incorporate colors, textures, and composition from [INPUT_IMAGE]

### 3. Technical Approach (1-2 sentences)
"[Photography type] with [techniques], matching the lighting of [INPUT_IMAGE]. ArriRaw to Rec709 color conversion applied."
→ Match the photographic style of [INPUT_IMAGE]

### 4. Subject Treatment (2-3 sentences)
"The [INPUT_IMAGE_SUBJECT] is positioned at [exact position %, e.g., 50% horizontal, 52% vertical]. [State, stability, motion characteristics]. The [INPUT_IMAGE_SUBJECT] retains its original texture and details but is integrated into this environment via matching lighting and color grading."
→ Specify exact numerical positions

### 5. Lighting & Color (2-3 sentences)
"[Light type] from [exact direction], [effect]. Key light adapted to match [INPUT_IMAGE] direction. Color palette: [specific hex colors from INPUT_IMAGE], [tonal range], delivering cinematic skin tones with characteristic ARRI color science."
→ MUST specify exact lighting direction and colors from [INPUT_IMAGE]

## Critical Rules
- ALWAYS include the ARRI camera/lens phrase
- Use [INPUT_IMAGE_SUBJECT] variable throughout (never replace with actual subject name)
- Specify positions as percentages (e.g., "positioned at 60% frame height")
- Include specific hex color codes when possible
- Avoid vague expressions:
  ❌ "beautiful" → ✅ "sophisticated luxury aesthetic with warm amber tones"
  ❌ "nice lighting" → ✅ "soft directional lighting from upper-left at 45° angle"
- 180-220 words (max 1800 characters) for prompt_en (IMPORTANT: Generate detailed, comprehensive prompts)
- Describe a still image moment
- No negative expressions
"""
    else:
        system_prompt = f"""
You are a professional advertising creative director specializing in luxury brand imagery.
Create high-quality prompts for generating scene images with ARRI cinematic look.

## MANDATORY: Camera & Lens Look
ALL generated prompts MUST include this camera specification:
{arri_look_phrase}

## Input
You will receive structured input with the following fields:
- Subject: Main subject to photograph
- Position: Subject's position in frame (e.g., "centered at 50% horizontal, 52% vertical")
- Background: Setting/environment
- Lighting: Light type and direction
- Color palette: Main colors (use hex codes when possible)
- Mood: Emotional atmosphere
- Additional notes: Extra instructions

## Output: 5-Stage Nanobanana Structure

### 1. Main Concept (1-2 sentences)
"This image employs [technique] to create [environment] for [subject]. Shot on ARRI ALEXA 35 with ARRI Signature Prime lens."
→ Include ARRI camera specification

### 2. Visual Signature (1 sentence)
"[Subject] at [exact position %], surrounded by [elements], [color scheme with hex codes]."
→ Use specific percentages for positions

### 3. Technical Approach (1-2 sentences)
"[Photography type] with [techniques]. ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones and characteristic ARRI color science."
→ Include ARRI color science

### 4. Subject Treatment (2-3 sentences)
"The subject is positioned at [exact position %, e.g., 50% horizontal, 52% vertical]. [State: upright/tilted/floating], [stability: stable/dynamic], [motion: static/blur amount]. Maximum sharpness with crisp edges, detail visibility preserved."
→ Specify exact numerical positions

### 5. Lighting & Color (2-3 sentences)
"[Light type: softbox/key light/rim light] from [exact direction: upper-left at 45°], creating [effect: sculptural shadows/rim highlights]. Color palette: [hex codes], [tonal range: cool/warm], smooth roll-off in highlights and rich shadow detail."
→ Specify exact lighting angles and hex colors

## Critical Rules
- ALWAYS include the ARRI camera/lens phrase in the prompt
- Specify positions as percentages (e.g., "positioned at 60% frame height, 50% horizontal")
- Include specific hex color codes (e.g., "#3d5a6b steel blue")
- Specify lighting angles (e.g., "from upper-left at 45° angle")
- Avoid vague expressions:
  ❌ "beautiful" → ✅ "sophisticated luxury aesthetic with warm amber #CC8844 tones"
  ❌ "nice lighting" → ✅ "soft directional lighting from upper-left at 45° angle"
  ❌ "centered" → ✅ "positioned at 50% horizontal, 48% vertical"
- 180-220 words (max 1800 characters) for prompt_en (IMPORTANT: Generate detailed, comprehensive prompts)
- Describe a still image moment
- No negative expressions
"""

    # 参照画像の有無でユーザープロンプトを切り替え
    if reference_image_url:
        user_prompt = f"""
[INPUT_IMAGE PROVIDED - This is [INPUT_IMAGE]. Analyze carefully.]

The subject in [INPUT_IMAGE] is [INPUT_IMAGE_SUBJECT].
Use structured input below to understand what [INPUT_IMAGE_SUBJECT] represents:

Structured Input:
{input_text}
Aspect ratio: {aspect_ratio} ({aspect_desc})

## Task
Generate image prompts that:
1. Use [INPUT_IMAGE_SUBJECT] variable to refer to the subject (do NOT replace with actual name)
2. Match the lighting, colors, and style from [INPUT_IMAGE]
3. Create an environment around [INPUT_IMAGE_SUBJECT] as specified in structured input
4. Include the ARRI camera/lens look phrase

Output in JSON format:
{{
  "prompt_ja": "参照画像のスタイルを活かした[INPUT_IMAGE_SUBJECT]の説明（1-2文）",
  "prompt_en": "Detailed 5-stage prompt using [INPUT_IMAGE_SUBJECT] variable, 180-220 words (max 1800 characters), MUST include ARRI camera phrase"
}}

IMPORTANT: In prompt_en, keep [INPUT_IMAGE_SUBJECT] as a literal variable, not replaced with actual subject name.
"""
    else:
        user_prompt = f"""
{input_text}
Aspect ratio: {aspect_ratio} ({aspect_desc})

Generate image prompts following the 5-stage nanobanana structure.
MUST include the ARRI camera/lens phrase in prompt_en.

Output in JSON format:
{{
  "prompt_ja": "日本語での簡潔な説明（1-2文）",
  "prompt_en": "Detailed 5-stage prompt, 180-220 words (max 1800 characters), MUST include: Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. ArriRaw to Rec709 color conversion applied..."
}}
"""

    try:
        # コンテンツを構築（参照画像がある場合はマルチモーダル）
        contents = []

        if reference_image_url:
            # 参照画像をダウンロード
            logger.info(f"Downloading reference image for prompt generation: {reference_image_url}")
            try:
                async with httpx.AsyncClient() as http_client:
                    img_response = await http_client.get(reference_image_url, timeout=30.0)
                    img_response.raise_for_status()
                    image_data = img_response.content

                # 画像をコンテンツに追加
                contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))
                logger.info("Reference image added to prompt generation request")
            except Exception as e:
                logger.warning(f"Failed to download reference image, proceeding without it: {e}")

        # テキストプロンプトを追加
        contents.append(user_prompt)

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
            )
        )

        result_text = response.text.strip()
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            result_text = "\n".join(lines[1:-1])

        result = json.loads(result_text)

        if isinstance(result, list):
            result = result[0] if result else {}

        prompt_ja = result.get("prompt_ja", subject)
        prompt_en = result.get("prompt_en", "")

        if not prompt_en:
            # フォールバック: 構造化入力から直接プロンプト構築
            prompt_en = _build_fallback_prompt_from_structured(structured_input, aspect_ratio)

        logger.info(f"Generated image prompt from structured input: {prompt_en[:100]}...")
        return prompt_ja, prompt_en

    except Exception as e:
        logger.exception(f"Failed to generate image prompt from structured input: {e}")
        prompt_ja = subject
        prompt_en = _build_fallback_prompt_from_structured(structured_input, aspect_ratio)
        return prompt_ja, prompt_en


def _build_fallback_prompt_from_structured(structured_input: dict, aspect_ratio: str) -> str:
    """構造化入力からフォールバックプロンプトを構築（ARRI look含む）"""
    subject = structured_input.get("subject", "subject")
    position = structured_input.get("subject_position", "positioned at 50% horizontal, 50% vertical")
    background = structured_input.get("background", "clean studio background")
    lighting = structured_input.get("lighting", "soft directional lighting from upper-left at 45° angle")
    color_palette = structured_input.get("color_palette", "neutral tones with subtle warm highlights")
    mood = structured_input.get("mood", "sophisticated professional aesthetic")

    return (
        f"This image employs precision studio photography to create a {mood} scene featuring {subject}. "
        f"Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. "
        f"The subject is {position} with {background}. "
        f"ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, "
        f"natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail. "
        f"The subject is sharp and well-defined with crisp edges, maximum detail visibility. "
        f"{lighting} creating sculptural shadows. "
        f"Color palette: {color_palette}. "
        f"High quality, 8K resolution, {aspect_ratio} aspect ratio."
    )


LOOK_SYSTEM_INSTRUCTIONS: dict[str, str | None] = {
    "cinematic": None,  # None = 既存のARRIルックプロンプトをそのまま使用
    "realistic": (
        "You are an expert commercial photographer. Generate a photorealistic image prompt.\n"
        "Style: Professional photography with natural lighting.\n"
        "Camera: Shot on Canon EOS R5 with RF 50mm f/1.2L.\n"
        "Post-processing: Minimal retouching, natural color grading.\n"
        "Focus on: Sharp details, natural skin tones, realistic textures and materials."
    ),
    "anime": (
        "You are a professional anime art director. Generate an anime-style image prompt.\n"
        "Style: Modern Japanese anime, cel-shaded illustration.\n"
        "Characteristics: Clean outlines, vibrant saturated colors, expressive character design.\n"
        "Background: Detailed painted backgrounds in anime style.\n"
        "Avoid: Photorealistic elements, film grain, camera references."
    ),
    "illustration": (
        "You are a digital illustration art director. Generate a professional illustration prompt.\n"
        "Style: Clean digital artwork with precise linework.\n"
        "Characteristics: Bold colors, well-defined shapes, professional composition.\n"
        "Technique: Digital painting with clean vector-like quality.\n"
        "Avoid: Photorealistic textures, camera references, film effects."
    ),
    "watercolor": (
        "You are a watercolor art director. Generate a watercolor painting prompt.\n"
        "Style: Traditional watercolor with translucent washes.\n"
        "Characteristics: Soft color bleeding, visible paper texture, wet-on-wet effects.\n"
        "Palette: Delicate, luminous colors with white paper showing through.\n"
        "Avoid: Sharp edges, digital effects, camera references."
    ),
    "3d_render": (
        "You are a 3D art director. Generate a 3D rendered image prompt.\n"
        "Style: High-quality 3D CGI, Pixar/Disney aesthetic.\n"
        "Characteristics: Smooth surfaces, subsurface scattering, volumetric lighting.\n"
        "Materials: Clean plastic-like textures, soft shadows, global illumination.\n"
        "Avoid: Photorealistic film grain, camera lens references."
    ),
    "flat_design": (
        "You are a graphic design director. Generate a flat design illustration prompt.\n"
        "Style: Modern flat design, minimal vector art.\n"
        "Characteristics: Bold geometric shapes, limited color palette, no gradients or shadows.\n"
        "Composition: Clean layout with clear visual hierarchy.\n"
        "Avoid: Realistic textures, shadows, 3D effects, camera references."
    ),
    "oil_painting": (
        "You are a classical art director. Generate an oil painting style prompt.\n"
        "Style: Traditional oil painting with rich, layered textures.\n"
        "Characteristics: Visible brushstrokes, warm color palette, chiaroscuro lighting.\n"
        "Technique: Impasto highlights, glazed shadows, classical composition.\n"
        "Avoid: Digital effects, clean lines, camera references."
    ),
}

async def _generate_prompt_from_description(
    client,
    description_ja: str | None,
    dialogue: str | None,
    aspect_ratio: str,
    aspect_desc: str,
    image_look: str = "cinematic",
) -> tuple[str, str]:
    """
    従来モード: 脚本とセリフからプロンプトを生成
    """
    # 入力テキストの構築（脚本がメイン、セリフは補助）
    input_parts = []
    if description_ja:
        input_parts.append(f"脚本: {description_ja}")
    if dialogue:
        input_parts.append(f"セリフ: {dialogue}")

    input_text = "\n".join(input_parts) if input_parts else "（入力なし）"

    # ルック別のシステムプロンプト分岐
    look_instruction = LOOK_SYSTEM_INSTRUCTIONS.get(image_look)
    if look_instruction is None:
        # cinematic: 既存のARRIルック system_prompt をそのまま使用
        system_prompt = """
あなたはラグジュアリーブランド専門の広告クリエイティブディレクターです。
CM用のシーン画像を生成するための高品質なプロンプトを作成してください。

## 必須: Camera & Lens Look
すべてのプロンプトに以下のカメラ仕様を必ず含めてください:
"Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail."

## 入力
- 脚本: シーンの状況説明（メイン）
- セリフ: キャラクターが話す台詞（あれば参考に）

## 出力
1. prompt_ja: シーンの視覚的な説明（日本語、1-2文）
2. prompt_en: 5段階構造に基づいた詳細な英語プロンプト（180-220語（最大1800文字）、ARRI look必須）

## 5段階構造テンプレート（prompt_en用）

英語プロンプトは以下の構造を1つの段落として連結して出力してください：

### 1. Main Concept（1-2文）
「This image employs [technique] to create [environment/effect]. Shot on ARRI ALEXA 35 with ARRI Signature Prime lens.」
→ ARRIカメラ仕様を含める

### 2. Visual Signature（1文）
「[Primary element] at [exact position %, e.g., 50% horizontal, 48% vertical], [surrounded by/featuring] [secondary elements] [color scheme with hex codes].」
→ 位置はパーセンテージで指定

### 3. Technical Approach（1-2文）
「[Photography type] with [techniques]. ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones and characteristic ARRI color science.」
→ ARRIカラーサイエンスを含める

### 4. Subject Treatment（2-3文）
- 被写体の正確な位置（例: positioned at 50% horizontal, 52% vertical）
- 状態、安定性、モーション特性
- エッジの質、詳細の視認性

### 5. Lighting & Color（2-3文）
- 照明: 「[Light type: softbox/key light] from [exact direction: upper-left at 45°], creating [effect]」
- カラー: 「Color palette: [hex codes], [tonal range], smooth roll-off in highlights and rich shadow detail」
→ 正確な照明角度とHEXカラーを指定

## 重要なルール
- 必ずARRIカメラ/レンズフレーズを含める
- 曖昧な表現を避ける:
  ❌ "beautiful" → ✅ "sophisticated luxury aesthetic with warm amber #CC8844 tones"
  ❌ "nice lighting" → ✅ "soft directional lighting from upper-left at 45° angle"
  ❌ "centered" → ✅ "positioned at 50% horizontal, 48% vertical"
- 配置は必ずパーセンテージで指定
- 照明は角度を明示（例: from upper-left at 45° angle）
- 色はHEXコードを含める（例: #3d5a6b steel blue）
- 180-220語（最大1800文字）
- 静止画として成立する瞬間を描写
"""
    else:
        # 非シネマティック: ルック別プロンプトに切り替え
        system_prompt = f"""あなたはプロの広告クリエイティブディレクターです。
{look_instruction}

以下のシーン情報から、画像生成AIに渡す高品質なプロンプトを作成してください。
アスペクト比は{aspect_desc}です。

以下のJSON形式で出力してください:
{{"prompt_ja": "日本語プロンプト", "prompt_en": "英語プロンプト"}}

重要:
- 英語プロンプトは画像生成AIが直接使用します
- 具体的で詳細な視覚描写を含めてください
- シーンの雰囲気、色調、構図を明確に指定してください
"""

    user_prompt = f"""
{input_text}
アスペクト比: {aspect_ratio}（{aspect_desc}）

上記から画像生成用のプロンプトを生成してください。
prompt_enには必ずARRIカメラ/レンズフレーズを含めてください。

JSON形式で出力:
{{
  "prompt_ja": "シーンの視覚的説明（1-2文）",
  "prompt_en": "5段階構造の詳細プロンプト（180-220語（最大1800文字））。必ず含める: Shot on ARRI ALEXA 35 with ARRI Signature Prime lens..."
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
            )
        )

        result_text = response.text.strip()
        # ```json ... ``` を除去
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            result_text = "\n".join(lines[1:-1])

        result = json.loads(result_text)

        # レスポンスがリストの場合は最初の要素を使用
        if isinstance(result, list):
            result = result[0] if result else {}

        prompt_ja = result.get("prompt_ja", description_ja or dialogue or "シーン画像")
        prompt_en = result.get("prompt_en", "")

        if not prompt_en:
            # 英語プロンプトが空の場合のフォールバック（ARRI look含む）
            prompt_en = (
                f"This image employs cinematic photography to create a sophisticated scene depicting {prompt_ja}. "
                f"Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. "
                f"The subject is positioned at 50% horizontal, 48% vertical with balanced composition. "
                f"ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, "
                f"natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail. "
                f"Soft directional lighting from upper-left at 45° angle creating sculptural shadows. "
                f"Warm neutral color palette with subtle highlights, high quality, 8K resolution."
            )

        logger.info(f"Generated image prompt: {prompt_en[:100]}...")
        return prompt_ja, prompt_en

    except Exception as e:
        logger.exception(f"Failed to generate image prompt: {e}")
        # フォールバック: ARRI look含む
        fallback_ja = description_ja or dialogue or "シーン画像"
        fallback_en = (
            f"This image employs cinematic photography to create a sophisticated scene depicting {fallback_ja}. "
            f"Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. "
            f"The subject is positioned at 50% horizontal, 48% vertical with balanced composition. "
            f"ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, "
            f"natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail. "
            f"Soft directional lighting from upper-left at 45° angle creating sculptural shadows. "
            f"Warm neutral color palette with subtle highlights, high quality, 8K resolution."
        )
        return fallback_ja, fallback_en


async def convert_to_flux_json_prompt(
    description_ja: str,
    negative_prompt_ja: str | None = None,
    aspect_ratio: str = "9:16"
) -> dict:
    """
    日本語の説明文をFLUX.2用のJSON構造化プロンプト（英語）に変換

    Args:
        description_ja: 日本語の画像説明
        negative_prompt_ja: 日本語のネガティブプロンプト（オプション）
        aspect_ratio: アスペクト比 ("9:16" or "16:9")

    Returns:
        dict: {
            "json_prompt": str,  # JSON形式の英語プロンプト
            "negative_prompt_en": str | None,  # 英語のネガティブプロンプト
            "preview": dict  # パース済みのJSONオブジェクト（プレビュー用）
        }
    """
    client = get_gemini_client()

    # アスペクト比に応じた構図ヒント
    composition_hint = "vertical portrait composition, 9:16 aspect ratio" if aspect_ratio == "9:16" else "horizontal landscape composition, 16:9 aspect ratio"

    system_prompt = f"""You are an expert prompt engineer for FLUX.2 image generation.
Convert the Japanese description into a structured JSON prompt in English.

IMPORTANT RULES:
1. Output ONLY valid JSON, no markdown code blocks or explanations
2. All values must be in English
3. Be specific and detailed in descriptions
4. Include cinematic/photography terms for professional quality
5. The composition should be: {composition_hint}

JSON Structure (use exactly these keys):
{{
  "scene": "Environment/setting description",
  "subject": "Main subject with detailed appearance",
  "style": "Visual style (e.g., cinematic, editorial, fine art)",
  "camera": "Camera settings (lens, angle, depth of field)",
  "lighting": "Lighting setup and quality",
  "color_palette": "Color scheme description or hex codes",
  "mood": "Emotional atmosphere",
  "quality": "Technical quality descriptors"
}}

Example output:
{{
  "scene": "Modern Tokyo cafe interior, large windows with morning sunlight",
  "subject": "Young Japanese woman in her 20s, wearing a cream knit sweater, holding a ceramic coffee cup, gentle smile, looking slightly off-camera",
  "style": "Editorial photography, natural and authentic, lifestyle aesthetic",
  "camera": "85mm f/1.4 lens, eye-level angle, shallow depth of field, subject in sharp focus",
  "lighting": "Soft natural window light from the left, subtle rim light, no harsh shadows",
  "color_palette": "Warm neutrals, cream #F5E6D3, soft brown #8B7355, white #FFFFFF",
  "mood": "Calm, contemplative, inviting warmth",
  "quality": "8K resolution, professional photography, high detail, clean composition"
}}"""

    try:
        # メインプロンプトの変換
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{system_prompt}\n\nJapanese description to convert:\n{description_ja}",
            config=types.GenerateContentConfig(temperature=0.4)
        )

        json_text = response.text.strip()
        # マークダウンコードブロックを除去
        if json_text.startswith("```"):
            json_text = json_text.split("```")[1]
            if json_text.startswith("json"):
                json_text = json_text[4:]
            json_text = json_text.strip()

        # JSONとしてパース（検証）
        try:
            preview = json.loads(json_text)
        except json.JSONDecodeError:
            logger.warning(f"JSON parse failed, attempting to fix: {json_text[:100]}")
            # 修復を試みる
            json_text = json_text.replace("'", '"')
            preview = json.loads(json_text)

        logger.info(f"Converted to FLUX JSON prompt: {json_text[:100]}...")

        # ネガティブプロンプトの変換（指定がある場合）
        negative_prompt_en = None
        if negative_prompt_ja and negative_prompt_ja.strip():
            neg_response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=(
                    "Translate the following Japanese negative prompt to English. "
                    "Return ONLY a comma-separated list of terms to avoid in image generation. "
                    "Keep it concise and technical.\n\n"
                    f"Japanese: {negative_prompt_ja}"
                ),
                config=types.GenerateContentConfig(temperature=0.2)
            )
            negative_prompt_en = neg_response.text.strip()
            negative_prompt_en = negative_prompt_en.strip('"\'')
            logger.info(f"Converted negative prompt: {negative_prompt_en[:50]}...")

        return {
            "json_prompt": json_text,
            "negative_prompt_en": negative_prompt_en,
            "preview": preview
        }

    except Exception as e:
        logger.exception(f"Failed to convert to FLUX JSON prompt: {e}")
        raise ValueError(f"プロンプト変換に失敗しました: {str(e)}")
