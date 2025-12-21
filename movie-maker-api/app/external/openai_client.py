import openai
from app.core.config import settings


async def optimize_prompt(user_prompt: str, template_id: str) -> str:
    """ユーザーのプロンプトをKlingAI用に最適化"""
    # TODO: テンプレートのprompt_templateを取得して組み合わせ

    if not settings.OPENAI_API_KEY:
        # APIキーがない場合はそのまま返す
        return user_prompt

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    system_prompt = """あなたは動画生成AIのプロンプトエンジニアです。
ユーザーの短い説明を、KlingAI（Image-to-Video AI）が理解しやすい詳細なプロンプトに変換してください。
- 動きの詳細を追加
- カメラワークを指定
- 5秒の動画に適した内容に
- 英語で出力"""

    response = await client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=300,
    )

    return response.choices[0].message.content or user_prompt
