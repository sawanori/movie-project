# AI主導ストーリーテリング機能 実装仕様書

## 1. 概要

### 1.1 機能概要
ユーザーが**画像1枚**をアップロードするだけで、AIがストーリーを提案し、連続画像を自動生成して動画を作成する機能。

### 1.2 ユーザーフロー

```
[画像アップロード] → [AIストーリー提案] → [選択/入力] → [自動生成] → [動画完成]
```

### 1.3 画像構成

| フレーム | ソース | 説明 |
|----------|--------|------|
| 1 | ユーザー画像 | オリジナル（物語の始まり） |
| 2 | AI生成 | ストーリー進行 |
| 3 | AI生成 | ストーリー進行 |
| 4 | AI生成 | ストーリー完結 |

---

## 2. データベース変更

### 2.1 `video_generations` テーブル変更

#### 新規カラム

| カラム名 | 型 | デフォルト | 説明 |
|----------|-----|------------|------|
| `generation_mode` | text | 'story' | 生成モード: 'story' (AI主導) / 'manual' (従来) |
| `story_text` | text | NULL | ユーザーが選択/入力したストーリー |
| `base_prompt` | text | NULL | 画像解析で生成されたベースプロンプト |
| `storyboard_prompts` | jsonb | NULL | 4フレーム分のプロンプト配列 |
| `ai_generated_image_urls` | text[] | ARRAY[] | AI生成画像のURL (フレーム2,3,4) |

#### カラム用途の変更

| 既存カラム | 新しい用途 |
|------------|------------|
| `original_image_url` | ユーザーアップロード画像（フレーム1） |
| `user_prompt` | 後方互換のため維持（story_textと同値） |
| `image_urls` | 最終的な4枚の画像URL [original, gen1, gen2, gen3] |

### 2.2 マイグレーションSQL

```sql
-- 新規カラム追加
ALTER TABLE video_generations
ADD COLUMN generation_mode text DEFAULT 'story'
  CHECK (generation_mode IN ('story', 'manual')),
ADD COLUMN story_text text,
ADD COLUMN base_prompt text,
ADD COLUMN storyboard_prompts jsonb,
ADD COLUMN ai_generated_image_urls text[] DEFAULT ARRAY[]::text[];

-- コメント追加
COMMENT ON COLUMN video_generations.generation_mode IS '生成モード: story=AI主導, manual=従来の手動';
COMMENT ON COLUMN video_generations.story_text IS 'ユーザーが選択/入力したストーリー文';
COMMENT ON COLUMN video_generations.base_prompt IS '画像解析から生成されたベースプロンプト';
COMMENT ON COLUMN video_generations.storyboard_prompts IS '4フレーム分のプロンプト (JSON配列)';
COMMENT ON COLUMN video_generations.ai_generated_image_urls IS 'AI生成画像URL (フレーム2,3,4)';

-- 既存データの移行
UPDATE video_generations
SET generation_mode = 'manual',
    story_text = user_prompt
WHERE generation_mode IS NULL;
```

---

## 3. API設計

### 3.1 新規エンドポイント

#### `POST /api/v1/videos/suggest-stories`
画像からストーリー候補を生成

**Request:**
```json
{
  "image_url": "https://..."
}
```

**Response:**
```json
{
  "suggestions": [
    "女性がゆっくり振り返り、驚いた表情になる",
    "風が吹いて髪がなびき、微笑む",
    "カメラに向かって手を振る",
    "目を閉じて深呼吸し、リラックスする",
    "笑顔から真剣な表情に変わる"
  ]
}
```

#### `POST /api/v1/videos/generate-story` (変更)
ストーリー動画生成（既存の`POST /api/v1/videos`を拡張）

**Request:**
```json
{
  "image_url": "https://...",
  "story_text": "女性がゆっくり振り返り、驚いた表情になる",
  "bgm_track_id": "optional-uuid",
  "overlay": {
    "text": "optional overlay text"
  }
}
```

**Response:**
```json
{
  "id": "video-uuid",
  "status": "pending",
  "progress": 0,
  "story_text": "女性がゆっくり振り返り...",
  "original_image_url": "https://...",
  "created_at": "2025-12-22T..."
}
```

### 3.2 進捗ステータス詳細

新しいステータスフロー:

| progress | status | 処理内容 |
|----------|--------|----------|
| 0-5 | pending | リクエスト受付 |
| 5-15 | processing | 画像解析・ベースプロンプト生成 |
| 15-25 | processing | ストーリーボード(4プロンプト)生成 |
| 25-60 | processing | 3枚の画像生成 (各約10%) |
| 60-90 | processing | KlingAI動画生成 |
| 90-100 | processing | 後処理・アップロード |
| 100 | completed | 完了 |

---

## 4. バックエンド実装

### 4.1 ファイル構成

```
app/
├── external/
│   ├── gemini_client.py      # 既存 + 拡張
│   └── kling.py              # 既存
├── videos/
│   ├── router.py             # エンドポイント追加
│   ├── service.py            # ロジック追加
│   └── schemas.py            # スキーマ追加
└── tasks/
    └── story_processor.py    # 新規: ストーリー生成タスク
```

### 4.2 `gemini_client.py` 追加関数

```python
async def analyze_image_for_base_prompt(image_url: str) -> str:
    """
    画像を解析してベースプロンプトを生成

    Returns:
        str: キャラクター、背景、画風を含む詳細な説明
    """
    client = get_gemini_client()

    system_prompt = """
    この画像について、以下の要素を詳細に記述してください：
    - キャラクター（性別、年齢、髪型、服装、表情、ポーズ）
    - 背景（場所、雰囲気、物体）
    - 全体的な画風（写真風、アニメ風、イラスト風など）
    - 照明と色調

    この説明は、後で別のAIが類似の画像を生成するために使用します。
    英語で出力してください。
    """

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[image_url, system_prompt]
    )
    return response.text


async def suggest_stories_from_image(image_url: str) -> list[str]:
    """
    画像からストーリー候補を5つ生成

    Returns:
        list[str]: 日本語のストーリー候補リスト
    """
    client = get_gemini_client()

    system_prompt = """
    この画像を分析して、5秒間の短い動画にできそうなストーリーを5つ提案してください。

    ルール:
    - 画像に写っている人物/動物/物の動きを想像する
    - シンプルで実現可能な動きにする（大きな場面転換は避ける）
    - 日本語で、1文で簡潔に書く（20文字程度）

    JSON配列形式で出力（説明なし）:
    ["ストーリー1", "ストーリー2", "ストーリー3", "ストーリー4", "ストーリー5"]
    """

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[image_url, system_prompt]
    )
    return json.loads(response.text)


async def generate_storyboard_prompts(
    base_prompt: str,
    story_text: str
) -> list[str]:
    """
    ベースプロンプトとストーリーから4フレーム分のプロンプトを生成

    Args:
        base_prompt: 画像解析から得たベースプロンプト
        story_text: ユーザーのストーリー

    Returns:
        list[str]: 4つの画像生成用プロンプト（英語）
    """
    client = get_gemini_client()

    system_prompt = f"""
    以下の【ベース説明】を基に、【ストーリー】を実現するための4つの連続した場面を考えてください。

    【ベース説明】
    {base_prompt}

    【ストーリー】
    {story_text}

    ルール:
    - フレーム1: 元の画像の状態（ストーリーの開始）
    - フレーム2: ストーリーが少し進んだ状態
    - フレーム3: ストーリーがさらに進んだ状態
    - フレーム4: ストーリーの完結
    - 各フレームは前のフレームから少しだけ変化した状態
    - キャラクターの外見、服装、背景は一貫させる
    - 出力は英語の詳細なプロンプト

    JSON配列形式で出力（説明なし）:
    ["frame1 prompt", "frame2 prompt", "frame3 prompt", "frame4 prompt"]
    """

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=system_prompt,
        config=types.GenerateContentConfig(temperature=0.7)
    )
    return json.loads(response.text)


async def generate_story_image(prompt: str) -> str | None:
    """
    プロンプトから画像を生成してURLを返す

    Returns:
        str: 生成された画像のURL（R2にアップロード後）
    """
    client = get_gemini_client()

    response = client.models.generate_content(
        model="gemini-2.0-flash-exp",  # 画像生成対応モデル
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["image", "text"],
        )
    )

    for part in response.parts:
        if part.inline_data:
            # PIL Imageとして取得
            image = part.as_image()
            # R2にアップロードしてURLを返す
            return await upload_generated_image(image)

    return None
```

### 4.3 `story_processor.py` (新規)

```python
async def process_story_generation(video_id: str) -> None:
    """
    ストーリー動画生成のメイン処理

    1. 画像解析 → ベースプロンプト生成
    2. ストーリーボード(4プロンプト)生成
    3. 3枚の画像生成 (フレーム2,3,4)
    4. KlingAI動画生成
    5. 後処理・完了
    """
    supabase = get_supabase()

    try:
        # 動画情報を取得
        video_data = get_video_data(video_id)
        original_image_url = video_data["original_image_url"]
        story_text = video_data["story_text"]

        # Step 1: 画像解析 (5-15%)
        await update_status(video_id, "processing", 5)
        base_prompt = await analyze_image_for_base_prompt(original_image_url)
        await save_base_prompt(video_id, base_prompt)
        await update_status(video_id, "processing", 15)

        # Step 2: ストーリーボード生成 (15-25%)
        storyboard_prompts = await generate_storyboard_prompts(
            base_prompt, story_text
        )
        await save_storyboard_prompts(video_id, storyboard_prompts)
        await update_status(video_id, "processing", 25)

        # Step 3: 3枚の画像生成 (25-60%)
        ai_generated_urls = []
        for i, prompt in enumerate(storyboard_prompts[1:4]):  # フレーム2,3,4
            image_url = await generate_story_image(prompt)
            if not image_url:
                raise Exception(f"Failed to generate image for frame {i+2}")
            ai_generated_urls.append(image_url)
            progress = 25 + ((i + 1) * 12)  # 37, 49, 61
            await update_status(video_id, "processing", progress)

        await save_ai_generated_images(video_id, ai_generated_urls)

        # Step 4: 最終画像配列を構築
        final_image_urls = [original_image_url] + ai_generated_urls
        await save_image_urls(video_id, final_image_urls)

        # Step 5: KlingAI動画生成 (60-90%)
        await update_status(video_id, "processing", 65)
        kling_task_id = await generate_video(
            image_urls=final_image_urls,
            prompt=story_text
        )

        # KlingAIポーリング...
        # (既存のvideo_processor.pyと同様)

        # Step 6: 完了
        await update_status(video_id, "completed", 100)

    except Exception as e:
        await update_status(video_id, "failed", error_message=str(e))
```

---

## 5. フロントエンド実装

### 5.1 新しいUI構成

```
/generate (リニューアル)
├── Step 1: 画像アップロード（1枚のみ）
├── Step 2: ストーリー選択
│   ├── AIが提案する5つの候補
│   └── 自由入力オプション
└── Step 3: オプション設定 & 生成
```

### 5.2 主要コンポーネント

#### ストーリー選択UI

```tsx
interface StorySuggestion {
  text: string;
  selected: boolean;
}

function StorySelector({
  suggestions,
  onSelect,
  onCustomInput
}: {
  suggestions: string[];
  onSelect: (story: string) => void;
  onCustomInput: (story: string) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  return (
    <div className="space-y-4">
      <h3>💡 AIがおすすめするストーリー</h3>

      <div className="grid gap-3">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSelect(suggestion)}
            className="p-4 text-left border rounded-lg hover:border-purple-500"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="pt-4 border-t">
        <button onClick={() => setCustomMode(true)}>
          ✏️ 自分でストーリーを入力する
        </button>

        {customMode && (
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="例：猫がゆっくりテーブルに飛び乗る"
            className="w-full mt-2 p-3 border rounded-lg"
          />
        )}
      </div>
    </div>
  );
}
```

### 5.3 APIクライアント追加

```typescript
// lib/api/client.ts

export const videosApi = {
  // 既存メソッド...

  suggestStories: async (imageUrl: string): Promise<{ suggestions: string[] }> => {
    return fetchWithAuth("/api/v1/videos/suggest-stories", {
      method: "POST",
      body: JSON.stringify({ image_url: imageUrl }),
    });
  },

  createStory: async (data: {
    image_url: string;
    story_text: string;
    bgm_track_id?: string;
    overlay?: { text?: string };
  }) => {
    return fetchWithAuth("/api/v1/videos", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        generation_mode: "story",
      }),
    });
  },
};
```

---

## 6. 処理時間の見積もり

| ステップ | 処理内容 | 推定時間 |
|----------|----------|----------|
| Step 1 | 画像解析 | 2-3秒 |
| Step 2 | ストーリーボード生成 | 2-3秒 |
| Step 3 | 画像生成 x 3 | 15-30秒 |
| Step 4 | KlingAI動画生成 | 60-120秒 |
| Step 5 | 後処理 | 5-10秒 |
| **合計** | | **約2-3分** |

---

## 7. エラーハンドリング

### 7.1 リトライ戦略

| エラー種別 | リトライ回数 | 待機時間 |
|------------|--------------|----------|
| 画像解析失敗 | 2回 | 1秒 |
| ストーリーボード生成失敗 | 2回 | 1秒 |
| 画像生成失敗 | 3回 | 2秒 |
| KlingAI失敗 | 1回 | - |

### 7.2 フォールバック

- 画像生成が一部失敗した場合：
  - 成功した画像のみで動画生成を試みる（最低2枚必要）
  - 全て失敗した場合はユーザーに通知

---

## 8. 実装順序

```
Phase 1: DB & API基盤 (1-2時間)
├── [ ] DBマイグレーション実行
├── [ ] schemas.py 更新
└── [ ] service.py 基本構造

Phase 2: AI機能実装 (2-3時間)
├── [ ] gemini_client.py 拡張
│   ├── [ ] analyze_image_for_base_prompt
│   ├── [ ] suggest_stories_from_image
│   ├── [ ] generate_storyboard_prompts
│   └── [ ] generate_story_image
└── [ ] story_processor.py 新規作成

Phase 3: APIエンドポイント (1時間)
├── [ ] POST /suggest-stories
└── [ ] POST /videos (story mode対応)

Phase 4: フロントエンド (2-3時間)
├── [ ] 新UI実装
├── [ ] APIクライアント更新
└── [ ] 進捗表示更新

Phase 5: テスト (1時間)
├── [ ] ユニットテスト
└── [ ] E2Eテスト
```

---

## 9. 後方互換性

- 既存の`generation_mode: 'manual'`は引き続きサポート
- `POST /api/v1/videos`で`image_urls`を直接指定した場合は従来動作
- フロントエンドは新UIをデフォルトとし、従来モードはオプション提供
