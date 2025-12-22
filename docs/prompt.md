# 動画生成AI プロンプト構造化マニュアル

## 1. 概要

本文書は、動画生成AIへの指示（プロンプト）を機械的に生成・拡張するための構造化マニュアルである。各AIプラットフォームの特性に基づき、パラメータ、構造、利用可能な値を定義する。この形式は、他のAIが解釈し、特定の目的に応じたプロンプトを動的に構築することを目的とする。

## 2. 基本プロンプトオブジェクト構造 (Base Prompt Object)

すべてのプロンプトは、以下の基本構造を持つオブジェクトとして定義される。具体的な値は各プラットフォームのセクションで詳述する。

```yaml
# 基本プロンプトオブジェクトの構造定義
platform: [string] # 対象プラットフォーム名 (e.g., 'kling', 'runway')
version: [string] # 対象プラットフォームのバージョン (e.g., '2.6', 'gen-4')
mode: [string] # 生成モード (e.g., 'text-to-video', 'image-to-video')

# プロンプトの構成要素
components:
  scene: [string] # シーン・場所・背景
  subject: [string] # 被写体・キャラクター・オブジェクト
  action: [string] # 動作・インタラクション
  cinematography: [string] # カメラワーク・アングル・レンズ
  style: [string] # 全体のスタイル・雰囲気・照明
  audio: # 音声関連の要素
    dialogue: [list] # セリフのリスト
      - character: [string]
        emotion: [string]
        speed: [string]
        text: [string]
    sfx: [list] # 効果音のリスト
    ambience: [string] # 環境音
    music: [string] # BGM

# プラットフォーム固有のパラメータ
parameters:
  aspect_ratio: [string] # アスペクト比 (e.g., '16:9')
  duration: [integer] # 生成時間（秒）
  quality: [string] # 品質 (e.g., 'standard', 'high')
  negative_prompt: [string] # ネガティブプロンプト
  # ... その他プラットフォーム固有のパラメータ

# 最終的にAIに渡すプロンプト文字列の構築テンプレート
# 各コンポーネントを結合する際のフォーマットを示す
output_template: [string]
```

## 3. パラメータ共通定義 (Common Parameter Definitions)

複数のプラットフォームで共通して使用されるパラメータの標準値を定義する。

### 3.1. カメラワーク (Cinematography)

| カテゴリ | キーワード | 説明 |
| :--- | :--- | :--- |
| **アングル** | `eye-level shot`, `low-angle shot`, `high-angle shot`, `dutch angle` | 目線の高さ、煽り、俯瞰、斜め |
| **ショットサイズ** | `extreme close-up`, `close-up`, `medium shot`, `full shot`, `wide shot` | 大写し、接写、半身、全身、広角 |
| **カメラ移動** | `static shot`, `dolly in/out`, `tracking shot`, `crane shot`, `pan left/right` | 固定、前後移動、追跡、上下移動、左右回転 |
| **レンズ効果** | `shallow depth of field`, `deep depth of field`, `lens flare`, `macro lens` | 浅い被写界深度、深い被写界深度、レンズフレア、マクロ |

### 3.2. スタイル (Style)

| カテゴリ | キーワード例 |
| :--- | :--- |
| **美的感覚** | `cinematic`, `photorealistic`, `ultra realistic`, `anime style`, `documentary style` |
| **照明** | `dramatic lighting`, `soft lighting`, `backlit`, `golden hour`, `neon lighting` |
| **雰囲気** | `mysterious`, `peaceful`, `energetic`, `melancholic`, `suspenseful` |
| **時代/様式** | `1980s film look`, `vintage`, `futuristic`, `cyberpunk`, `German Expressionism` |
| **監督風** | `in the style of Wes Anderson`, `in the style of Quentin Tarantino` |

---

## 4. プラットフォーム別プロファイル (Platform Profiles)

### 4.1. Kling

- **概要:** 物理的リアリズムと最大2分の長尺動画生成、高度な音声同期機能に強みを持つ。
- **参照元:** [9]

```yaml
platform: kling
version: '2.6'
mode: [text-to-video, image-to-video]

components:
  scene: [string]
  subject: [string] # image-to-videoモードでは "Keep original style" のような指示が有効
  action: [string]
  cinematography: [string]
  style: [string]
  audio:
    dialogue:
      - character: [string] # (e.g., 'Girl A', 'Man')
        emotion: [string] # (e.g., 'angry', 'friendly', 'exhausted')
        speed: [string] # (e.g., 'fast', 'medium', 'slow')
        text: [string] # 英語または中国語を推奨
    sfx: [list] # (e.g., 'A wooden door slams with a loud \"BANG\".')
    ambience: [string] # (e.g., 'continuous rainfall, distant city ambience')
    music: [string]

parameters:
  aspect_ratio: ['16:9', '9:16', '1:1', '4:3', '3:4']
  duration: [5, 10] # 秒
  quality: ['standard', 'high']
  audio_visual_sync: [boolean] # 音声同期機能のON/OFF

# 出力テンプレート: 各要素を角括弧で囲み、改行で区切る形式を推奨
output_template: |
  [Scene] {scene}
  [Element] {subject}
  [Action] {action} {cinematography}
  [Audio - dialogue] {dialogue}
  [Audio - sfx] {sfx}
  [Audio - ambience] {ambience}
  [Others - style] {style}, {aspect_ratio}, {duration}s, Audio-Visual Sync {audio_visual_sync}
```

### 4.2. Runway

- **概要:** シンプルな操作性と高速生成が特徴。動き(Motion)の記述に特化することで高品質な結果を得やすい。
- **参照元:** [4], [5]

```yaml
platform: runway
version: 'gen-4'
mode: [text-to-video, image-to-video]

components:
  scene: [string]
  subject: [string] # 詳細な再記述は不要。動きの対象として簡潔に。
  action: [string] # **最重要項目。** 具体的な物理的アクションを記述。
  cinematography: [string]
  style: [string]
  audio: # Runwayは音声生成に非対応
    dialogue: null
    sfx: null
    ambience: null
    music: null

parameters:
  aspect_ratio: ['16:9', '9:16', '1:1', '4:3', '3:4']
  duration: [integer] # UI上でスライダー等で調整
  motion_strength: [integer] # 1-10の範囲 (仮説: UI上のMotionスライダーに対応)
  seed: [integer]
  upscale: [boolean]
  negative_prompt: null # 非対応

# 出力テンプレート: 構造化された文章形式を推奨
output_template: |
  {cinematography}: {scene}. {subject} {action}. {style}.
```

### 4.3. Google Veo

- **概要:** Geminiとの連携によるプロンプト拡張、マルチモーダルな制御、ネガティブプロンプトへの対応が特徴。
- **参照元:** [2]

```yaml
platform: google-veo
version: '1.0' # (仮)
mode: [text-to-video, image-to-video]

components:
  scene: [string]
  subject: [string]
  action: [string]
  cinematography: [string]
  style: [string]
  audio:
    dialogue:
      - text: [string]
    sfx: [list] # (e.g., 'SFX: thunder cracks in the distance.')
    ambience: [string] # (e.g., 'Ambient noise: the quiet hum of a starship bridge.')
    music: [string]

parameters:
  aspect_ratio: [string]
  duration: [integer]
  quality: [string]
  negative_prompt: [string] # 具体的な排除対象を記述 (e.g., 'no buildings, no roads')

# 出力テンプレート: 全ての要素を自然な文章として結合
output_template: |
  {cinematography}, {subject} {action} in {scene}. {style}. {dialogue} {sfx} {ambience} {music} --neg {negative_prompt}
```

### 4.4. OpenAI Sora 2

- **概要:** 自然言語の深い理解力と物語性の表現に優れる。日本語の解釈能力が高い。
- **参照元:** [6]

```yaml
platform: openai-sora
version: '2.0'
mode: [text-to-video]

components:
  scene: [string] # 物語の舞台設定
  subject: [string] # 登場人物
  action: [string] # 物語のプロットやキャラクターの感情の動きを含む
  cinematography: [string]
  style: [string]
  audio:
    dialogue:
      - text: [string] # 日本語のセリフも自然に生成可能
    sfx: [list]
    ambience: [string]
    music: [string]

parameters:
  aspect_ratio: [string]
  duration: [integer] # 最大20秒程度
  quality: [string]

# 出力テンプレート: 物語を語るような自由な文章形式
output_template: |
  {subject} {action} in {scene}. The camera {cinematography}. The overall style is {style}.
```

### 4.5. Vidu AI

- **概要:** キャラクターの一貫性維持と、複数要素の統合に特化。`@`構文による複数キャラ制御が強力。
- **参照元:** [7]

```yaml
platform: vidu-ai
version: 'Q2 Reference'
mode: [text-to-video, image-to-video, reference-to-video]

components:
  scene: [string]
  subject: [string] # '@a(description)' のようにラベル付け可能
  action: [string]
  cinematography: [string]
  style: [string]
  audio: # 限定的な対応
    dialogue: null
    sfx: null
    ambience: null
    music: null

parameters:
  aspect_ratio: [string]
  duration: [integer]
  # reference_images: [list] # reference-to-videoモードで使用

# 出力テンプレート: シンプルな構造化文章
output_template: |
  {subject} {action} in {scene}. {cinematography}. {style}.
```

## 5. 汎用シナリオテンプレート (Generic Scenario Templates)

特定の用途に応じたプロンプトを効率的に生成するため、プラットフォーム非依存の汎用テンプレートを定義する。生成AIは、これらのテンプレートに具体的な情報を埋め込み、ターゲットプラットフォームのプロファイルに従って最終的なプロンプトを構築する。

### 5.1. 製品プロモーション (Product Promotion)

```yaml
# テンプレート名: product_promotion
scenario: "製品プロモーションビデオ"

components:
  scene: "A clean, minimalist studio background with soft, abstract light patterns."
  subject: "A sleek, new {product_category} named {product_name} with a {product_feature}."
  action: "The product rotates slowly, showcasing its design. Light glints off its polished surfaces."
  cinematography: "Macro shot focusing on the product details, transitioning to a slow-motion rotating shot of the product."
  style: "Modern commercial style, clean and elegant, soft studio lighting, shallow depth of field, high-end and luxurious mood."
  audio:
    music: "Minimalist electronic background music."
    sfx: ["a subtle, satisfying click sound when the product is placed on a surface."]

# プレースホルダー: このテンプレートを使用する際に埋めるべき情報
placeholders:
  - product_category: [string] # (e.g., 'smartphone', 'watch')
  - product_name: [string]
  - product_feature: [string] # (e.g., 'glossy finish', 'titanium body')
```

### 5.2. シネマティックトレーラー (Cinematic Trailer)

```yaml
# テンプレート名: cinematic_trailer
scenario: "映画の予告編風映像"

components:
  scene: "A dramatic, {environment_type} at {time_of_day}. {weather_conditions}."
  subject: "A lone figure in a {clothing_description}, standing on {location_feature}."
  action: "The figure slowly raises their head to look at the sky as wind whips their cloak around them."
  cinematography: "Epic wide shot, slow dolly-in towards the subject."
  style: "Cinematic, dramatic lighting with {light_effect}, {mood} mood, shot on 35mm film, anamorphic lens flare."
  audio:
    ambience: "a low, ominous hum."
    sfx: ["roaring wind", "crashing waves", "distant thunder"]

placeholders:
  - environment_type: [string] # (e.g., 'stormy coastline', 'desert ruin')
  - time_of_day: [string] # (e.g., 'dusk', 'midnight')
  - weather_conditions: [string] # (e.g., 'Crashing waves below, dark clouds gathering overhead')
  - clothing_description: [string] # (e.g., 'dark, hooded cloak')
  - location_feature: [string] # (e.g., 'the edge of a cliff')
  - light_effect: [string] # (e.g., 'flashes of lightning')
  - mood: [string] # (e.g., 'suspenseful and epic')
```

## 6. マニュアル利用ガイドライン (for AI)

このマニュアルを用いてプロンプトを生成する際の処理フローを以下に示す。

1.  **目的の特定:** ユーザーからの要求（例：「スマートフォン`X-Phone`のプロモーションビデオを作りたい」）を解析し、対応する`scenario`（`product_promotion`）を特定する。

2.  **テンプレートの選択:** `5. 汎用シナリオテンプレート`から、特定した`scenario`に合致するテンプレートオブジェクト（`product_promotion`）を選択する。

3.  **情報抽出と埋め込み:** ユーザーの要求からプレースホルダーに対応する情報を抽出し（`product_category: 'smartphone'`, `product_name: 'X-Phone'`, `product_feature: 'matte black finish'`）、テンプレートに埋め込む。

4.  **プラットフォームの選択:** ターゲットとなる動画生成AIプラットフォーム（例：`kling`）を決定する。

5.  **プロファイルの参照:** `4. プラットフォーム別プロファイル`から、選択したプラットフォームのプロファイル（`4.1. Kling`）を読み込む。

6.  **プロンプトの構築:** 埋め込み済みの汎用テンプレートオブジェクトの各`components`を、プラットフォームプロファイルの`output_template`に従ってフォーマットする。この際、プラットフォームが対応していないコンポーネント（例：Runwayの`audio`）は無視する。

7.  **パラメータの設定:** プラットフォームプロファイルで定義された`parameters`（`aspect_ratio`, `duration`など）をユーザーの要求やデフォルト値に基づいて設定する。

8.  **最終出力:** 最終的にフォーマットされたプロンプト文字列と、設定されたパラメータのセットを生成し、動画生成AIへのAPIコールやUIへの入力値として使用する。


## 7. 追加シナリオテンプレート (Additional Scenario Templates)

### 7.1. キャラクター紹介 (Character Introduction)

```yaml
# テンプレート名: character_introduction
scenario: "アニメ風キャラクター紹介"

components:
  scene: "In front of a {background_description}."
  subject: "A {character_age} {character_type} with {hair_description}, wearing {clothing_description}."
  action: "{action_verb} and {secondary_action}."
  cinematography: "Dynamic close-up shot, quickly panning to a full body shot."
  style: "{art_style}, {color_palette}, {mood} mood, lens flare effects."
  audio:
    music: "{music_style} music in the background."
    sfx: ["{sfx_description}"]

placeholders:
  - background_description: [string]
  - character_age: [string]
  - character_type: [string]
  - hair_description: [string]
  - clothing_description: [string]
  - action_verb: [string]
  - secondary_action: [string]
  - art_style: [string]
  - color_palette: [string]
  - mood: [string]
  - music_style: [string]
  - sfx_description: [string]
```

### 7.2. 建築・不動産ビジュアライゼーション (Architectural Visualization)

```yaml
# テンプレート名: architectural_viz
scenario: "建築物のビジュアライゼーション"

components:
  scene: "A {building_type} with {architectural_features}."
  subject: "The interior/exterior space showcasing {key_elements}."
  action: "The camera glides through the space, showing {details_to_highlight}."
  cinematography: "Smooth, slow panning shot moving through the space."
  style: "Architectural visualization, {realism_level}, {lighting_type} lighting, {mood} mood, photorealistic rendering."
  audio:
    ambience: "{ambient_sound}"

placeholders:
  - building_type: [string]
  - architectural_features: [string]
  - key_elements: [string]
  - details_to_highlight: [string]
  - realism_level: [string]
  - lighting_type: [string]
  - mood: [string]
  - ambient_sound: [string]
```

### 7.3. 料理・ASMR (Cooking / ASMR)

```yaml
# テンプレート名: cooking_asmr
scenario: "料理調理シーンのASMR"

components:
  scene: "A {kitchen_type} counter."
  subject: "{ingredient_description} in a {cookware_type}."
  action: "{cooking_action}. {sensory_detail}."
  cinematography: "Overhead shot (top-down view) with some close-up shots of the ingredients."
  style: "Food videography style, {color_description} colors, {lighting_description} lighting, shallow depth of field focusing on the food, {mood} mood."
  audio:
    sfx: ["{cooking_sound_1}", "{cooking_sound_2}"]
    music: "{music_description}"

placeholders:
  - kitchen_type: [string]
  - ingredient_description: [string]
  - cookware_type: [string]
  - cooking_action: [string]
  - sensory_detail: [string]
  - color_description: [string]
  - lighting_description: [string]
  - mood: [string]
  - cooking_sound_1: [string]
  - cooking_sound_2: [string]
  - music_description: [string]
```

## 8. 拡張メカニズム (Extension Mechanism)

このマニュアルは、新しいプラットフォームやシナリオが出現した際に拡張されることを前提に設計されている。以下の手順に従い、新しい要素を追加する。

### 8.1. 新しいプラットフォームの追加

新しい動画生成AIプラットフォームが登場した場合、`4. プラットフォーム別プロファイル`に以下の構造で新しいセクションを追加する：

1.  プラットフォーム名と概要
2.  YAMLフォーマットでのプロファイル定義（`components`, `parameters`, `output_template`を含む）
3.  参照元（公式ドキュメントやガイド）

### 8.2. 新しいシナリオテンプレートの追加

新しいユースケースが出現した場合、`5. 汎用シナリオテンプレート`または`7. 追加シナリオテンプレート`に以下の構造で新しいテンプレートを追加する：

1.  テンプレート名（スネークケース）
2.  シナリオの説明
3.  YAMLフォーマットでのテンプレート定義（`components`, `placeholders`を含む）

### 8.3. パラメータの拡張

新しいパラメータが必要になった場合、`3. パラメータ共通定義`に新しいサブセクションを追加し、カテゴリ、キーワード、説明をテーブル形式で定義する。

---

## 参考文献

[1] Google Cloud Blog. "Ultimate prompting guide for Veo 3.1". https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1

[2] Google Cloud Blog. "Ultimate prompting guide for Veo 3.1". https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1

[3] ImagineArt. "Kling 2.1 Video Generation Prompt Guide". https://www.imagine.art/blogs/kling-2-1-prompting-guide

[4] RUNWAY Help Center. "Gen-3 Alpha Prompting Guide". https://help.runwayml.com/hc/en-us/articles/30586818553107-Gen-3-Alpha-Prompting-Guide

[5] RUNWAY Help Center. "Gen-4 Video Prompting Guide". https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide

[6] romptn Magazine. "Sora 2のプロンプト完全ガイド". https://romptn.com/article/54141

[7] Qiita. "Vidu AIで動画生成｜効果的なプロンプトの書き方完全ガイド". https://qiita.com/GeneLab_999/items/313b9d1c8e5dd4039fd5

[8] SHIFT AI. "動画生成AIプロンプト完全ガイド". https://ai-keiei.shift-ai.co.jp/video-ai-prompt/

[9] note.com. "Kling 2.6リリース速報：進化した内容とプロンプトの書き方". https://note.com/seiiiru/n/n83a6e5c0d72b

[10] note.com. "【AI美女 × 世界の街】最強に絵になる"都市別プロンプト15選"". https://note.com/nikohulu/n/n8381dc99a140
