from google import genai
from google.genai import types
from PIL import Image
import io
import json
import httpx
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


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


async def generate_image(prompt: str) -> Image.Image | None:
    """
    Generate an image using Gemini 3 Pro (Nano Banana Pro).
    
    Args:
        prompt (str): Image generation prompt.
        
    Returns:
        Image.Image | None: Generated PIL Image or None if failed.
    """
    client = get_gemini_client()
    
    try:
        # Use Nano Banana Pro (gemini-3-pro-image-preview) as requested
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["image", "text"],
            )
        )

        for part in response.parts:
            if part.inline_data:
                return part.as_image()
        
        return None

    except Exception as e:
        print(f"Gemini image generation failed: {e}")
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
    画像を解析してベースプロンプトを生成

    Args:
        image_url: 分析対象の画像URL

    Returns:
        str: キャラクター、背景、画風を含む詳細な説明（英語）
    """
    client = get_gemini_client()

    system_prompt = """
Analyze this image and describe it in detail for use as a base prompt for AI image generation.

Include:
- Character details (gender, age, hair, clothing, expression, pose)
- Background (location, atmosphere, objects)
- Art style (photographic, anime, illustration, etc.)
- Lighting and color tones

Output in English, as a single paragraph.
This description will be used to generate similar images that maintain visual consistency.
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
            config=types.GenerateContentConfig(temperature=0.3)
        )

        return response.text.strip()

    except Exception as e:
        logger.exception(f"Image analysis failed: {e}")
        raise


async def generate_storyboard_prompts(base_prompt: str, story_text: str) -> list[dict]:
    """
    ベースプロンプトとストーリーから3フレーム分の構造化プロンプトを生成

    Args:
        base_prompt: 画像解析から得たベースプロンプト
        story_text: ユーザーのストーリー

    Returns:
        list[dict]: 3つの構造化プロンプト（各フレーム）
    """
    client = get_gemini_client()

    system_prompt = f"""
You are an expert prompt engineer for AI image generation.

Based on the following base description and story, create 3 sequential frame prompts.

【Base Description (CRITICAL - preserve these details exactly)】
{base_prompt}

【Story (the action/change to show)】
{story_text}

CRITICAL RULES FOR CHARACTER/SUBJECT CONSISTENCY:
- The [Element] section MUST describe the EXACT same subject in ALL frames
- Copy the character/subject description word-for-word from the base description
- Only the pose, expression, or action should change - NOT the appearance
- Same clothing, same hair, same colors, same body proportions

CRITICAL RULES FOR HUMAN SUBJECTS:
- If the subject is a person, ALWAYS include "natural blinking" or "subtle eye blink" in the [Action] section
- This applies to ALL frames to ensure realistic human movement
- Example: "gentle smile with natural blinking" or "looking at camera, subtle eye blink"

For each frame, create a structured prompt:

[Scene] Background and environment (keep consistent across frames)
[Element] EXACT description of main subject - COPY from base description, do not alter
[Action] Only the pose/expression/movement changes here
[Style] cinematic, photorealistic, consistent lighting

Frame progression:
- Frame 1: Starting pose (matches the original image exactly)
- Frame 2: Slight movement/change (same subject, small action change)
- Frame 3: Final pose (same subject, story conclusion)

Output as JSON array with 3 objects:
[
  {{
    "frame": 1,
    "scene": "...",
    "element": "...",
    "action": "...",
    "style": "...",
    "full_prompt": "[Scene] ... [Element] ... [Action] ... [Style] ..."
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


async def generate_story_frame_image(prompt: str, reference_image_url: str | None = None) -> bytes | None:
    """
    元画像を参照しながら、プロンプトに基づいて新しい画像を生成

    Args:
        prompt: 画像生成プロンプト
        reference_image_url: 参照元の画像URL（主役の一貫性を保つため）

    Returns:
        bytes: 生成された画像のバイトデータ、失敗時はNone
    """
    client = get_gemini_client()

    try:
        contents = []

        # 元画像がある場合は参照として渡す
        if reference_image_url:
            async with httpx.AsyncClient() as http_client:
                img_response = await http_client.get(reference_image_url, timeout=30.0)
                img_response.raise_for_status()
                image_data = img_response.content

            contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))

            # 元画像の主役を維持するよう強調したプロンプト
            enhanced_prompt = f"""
Based on the reference image above, generate a new image following this prompt.

CRITICAL: You MUST keep the EXACT same main subject (person, animal, or object) from the reference image.
- Same face, same body, same clothing, same colors
- Only change the pose/action/expression as described
- Maintain the same art style and quality

{prompt}

Generate an image that looks like the next frame in a video sequence from the reference image.
"""
            contents.append(enhanced_prompt)
        else:
            contents.append(prompt)

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
