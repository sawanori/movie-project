# CONTENT STUDIO プロンプト クイックリファレンス

## 5段階構造の概要

```
1. Main Concept
   ↓
2. Visual Signature
   ↓
3. Technical Approach
   ↓
4. Detailed Image Understanding
   ↓
5. Constructed Prompt
```

---

## 各セクションの簡潔なガイド

### 1️⃣ Main Concept（1-3文）
**何を作るのか？**
- 技法：「This image uses/employs/creates...」
- 効果：「...to create/achieve/suggest...」
- インパクト：「...resulting in/conveying/suggesting...」

**テンプレート:**
```
This image [uses/employs/creates] [technique/concept]
to [achieve effect] for [INPUT_IMAGE_SUBJECT]. [Emotional outcome].
```

**変数使用例:**
```
This image employs dramatic architectural lighting with sweeping metallic
sculptural elements to create a futuristic, high-tech environment for
[INPUT_IMAGE_SUBJECT]. The subject is positioned at the exact center
as the hero element.
```

---

### 2️⃣ Visual Signature（1文）
**見た目は？**
- 主要要素：「[INPUT_IMAGE_SUBJECT] at [size/position]」
- 補助要素：「surrounded by/featuring/with [elements]」
- スタイル：「[color scheme/composition]」

**テンプレート:**
```
[INPUT_IMAGE_SUBJECT] [size/position],
[surrounded by/featuring] [secondary elements]
[color/composition characteristics]
```

**変数使用例:**
```
Centered luxury product photography with dramatic diagonal metallic
architectural elements, monochromatic blue-grey palette, studio lighting
creating sharp highlights on brushed metal surfaces surrounding the
[INPUT_IMAGE_SUBJECT]
```

---

### 3️⃣ Technical Approach（1-2文）
**どうやって作るのか？**
- 撮影タイプ：「Studio/Location/Composite photography」
- 技術：「with [key techniques]」
- ポストプロダクション：「combined with [post-production]」
- 入力画像参照：「matching the lighting of the [INPUT_IMAGE]」

**テンプレート:**
```
[Photography type] with [key techniques]
combined with [post-production methods]
matching the lighting of the [INPUT_IMAGE]
```

**変数使用例:**
```
Controlled studio environment with large-scale sculptural props or CGI
architectural elements, precision product photography, dramatic directional
lighting to create metallic reflections matching the lighting of the
[INPUT_IMAGE]
```

---

### 🎬 Camera & Lens Look（必須）
**全ての画像に以下のカメラ・レンズルックを適用すること**

| 項目 | 指定値 |
|------|--------|
| **Camera** | ARRI ALEXA 35 |
| **Lens** | ARRI Signature Prime |
| **Color Science** | ArriRaw → Rec709 conversion |

**必須フレーズ（プロンプトに含める）:**
```
Shot on ARRI ALEXA 35 with ARRI Signature Prime lens.
ArriRaw to Rec709 color conversion applied,
delivering cinematic skin tones, natural color rendition,
and characteristic ARRI color science with smooth roll-off
in highlights and rich shadow detail.
```

**ルックの特徴:**
- シネマティックなスキントーン
- 自然な色再現
- ハイライトの滑らかなロールオフ
- シャドウのリッチなディテール
- ARRIカラーサイエンスの特徴的な質感

---

### 📌 必須変数（INPUT_IMAGE参照）
**プロンプト内で必ず以下の変数を使用すること**

| 変数名 | 説明 | 使用例 |
|--------|------|--------|
| `[INPUT_IMAGE]` | 入力画像への参照（ライティング・アングル等の参照元） | "matching the lighting of the [INPUT_IMAGE]" |
| `[INPUT_IMAGE_SUBJECT]` | 入力画像の被写体（製品・人物等） | "The [INPUT_IMAGE_SUBJECT] is positioned at center" |

**変数の使用ルール:**
1. すべてのセクションで適切に変数を参照する
2. 被写体の配置・サイズ・ライティングは `[INPUT_IMAGE]` を基準にする
3. 被写体への言及は必ず `[INPUT_IMAGE_SUBJECT]` を使用する
4. 変数はそのまま出力し、実際の値に置換しない

**各セクションでの使用例:**

```
Main Concept:
"...to create a futuristic environment for [INPUT_IMAGE_SUBJECT]..."

Visual Signature:
"...surrounding the [INPUT_IMAGE_SUBJECT]..."

Technical Approach:
"...matching the lighting of the [INPUT_IMAGE]..."

Detailed Understanding:
"The image features the object from [INPUT_IMAGE] as the central subject..."

Constructed Prompt:
"Use [INPUT_IMAGE] as the reference for the hero object..."
```

---

### 4️⃣ Detailed Image Understanding（150-300語）
**詳細な分析**

| 要素 | 説明 | 変数使用 |
|------|------|----------|
| 被写体 | 何が見えるか、どこにあるか | `[INPUT_IMAGE_SUBJECT]` で参照 |
| 構成 | 配置、フレーミング、視線の流れ | `[INPUT_IMAGE]` の配置を基準 |
| 照明 | 光の方向、質、効果 | `[INPUT_IMAGE]` のライティングを維持 |
| 色 | パレット、トーン、コントラスト | 被写体の元色を保持 |
| テクスチャ | 表面、素材、質感 | `[INPUT_IMAGE_SUBJECT]` のテクスチャを保持 |
| 背景 | 環境、雰囲気、深さ | 新規背景と `[INPUT_IMAGE_SUBJECT]` を統合 |
| ムード | 感情、ブランド、ターゲット | - |

**変数使用例:**
```
The image serves as a high-end luxury advertisement featuring the object
from [INPUT_IMAGE] as the central subject. The subject is positioned
precisely at the center of the frame, occupying approximately 35-40%
of the vertical space. The [INPUT_IMAGE_SUBJECT] itself retains its
original texture and details but is integrated into this environment
via matching lighting and color grading.
```

---

### 5️⃣ Constructed Prompt（実装可能な指示）

#### セクションA: Subject Treatment（被写体処理）
```
The [INPUT_IMAGE_SUBJECT] is [state/position], [stability],
[motion characteristics], [edge quality].
[Support method]. [Detail visibility].
Use [INPUT_IMAGE] as the reference for the hero object.
```

#### セクションB: Surrounding Elements
```
[Element type] [arrangement] [layering].
[Interaction with [INPUT_IMAGE_SUBJECT]]. [Visibility].
```

#### セクションC: Container or Environment
```
[Setting] with [features]. [Color/gradient].
[Background treatment]. [Atmosphere].
Subject integration: [INPUT_IMAGE_SUBJECT] receives [ambient effect] for integration.
```

#### セクションD: Lighting Setup
```
[Light type] from [direction], [effect].
[Highlights]. [Shadows]. [Background lighting].
Key light adapted to match [INPUT_IMAGE] direction.
```

#### セクションE: Color Palette
```
[Primary colors], [tonal range].
[Gradients]. [Harmony].
[INPUT_IMAGE_SUBJECT] retains original colors with [integration effect].
```

#### セクションF: Material Effects
```
[Material] shows [characteristics],
[reflectivity]. [Depth effects]. [Realism].
The [INPUT_IMAGE_SUBJECT] maintains natural material behavior.
```

---

## よく使うフレーズ集

### Main Conceptで使う動詞
- uses / employs / creates / demonstrates
- transforms / elevates / emphasizes
- captures / freezes / isolates

### Visual Signatureで使う表現
- positioned at [%] frame [location]
- surrounded by / featuring / with
- against [background] background
- creating [effect] effect

### Technical Approachで使う表現
- Studio photography with
- Location photography with
- Composite photography with
- combined with post-production
- enhanced with [technique]

### Detailed Understandingで使う表現
- The primary focal point is
- The lighting appears to be
- The color palette is dominated by
- The overall mood is
- The composition uses
- The technical execution shows

### Constructed Promptで使う表現
- The product is [state]
- Positioned [location]
- Creating [effect]
- Emphasizing [aspect]
- Avoiding [negative aspect]

---

## 色指定の標準フォーマット

### 基本色
- Pure white: #FFFFFF
- Pure black: #000000
- Burnt orange: #CC5500
- Deep navy: #001F3F
- Soft pink: #FFB3D9

### 色の説明方法
- 「monochromatic [color] color scheme」
- 「gradient from [color] to [color]」
- 「[color] dominance with [accent color] highlights」
- 「warm [color] family」
- 「cool [color] tones」

---

## 配置の数値化

### フレーム内の位置
- 「at [%] frame height」
- 「positioned [%] from left edge」
- 「occupies [%] of frame」
- 「centered / left-of-center / right-of-center」

### 深さの表現
- 「foreground / midground / background」
- 「shallow depth of field」
- 「layered composition」
- 「360-degree arrangement」

---

## 照明の標準表現

### 光の方向
- from upper-left / upper-right
- from left / right
- from above / below
- backlighting / rim lighting / fill lighting

### 光の質
- soft and diffused
- dramatic and directional
- even and controlled
- natural daylight
- studio lighting

### 効果
- creating sculptural shadows
- emphasizing dimensionality
- maintaining detail
- creating depth
- avoiding harsh shadows

---

## チェックリスト

### プロンプト作成時の確認事項

- [ ] Main Conceptは1-3文か？
- [ ] Visual Signatureは1文か？
- [ ] Technical Approachは1-2文か？
- [ ] Detailed Understandingは150-300語か？
- [ ] Constructed Promptは6セクション全て含まれているか？
- [ ] 色は具体的に指定されているか？
- [ ] 配置は数値化されているか？
- [ ] 照明は明確に説明されているか？
- [ ] セクション間に矛盾がないか？
- [ ] 指示は実装可能か？

---

## よくある間違いと修正

### ❌ 曖昧な表現
- 「beautiful image」→ ✅ 「sophisticated luxury aesthetic with warm amber tones」
- 「nice lighting」→ ✅ 「soft directional lighting from upper-left creating rim highlights」
- 「colorful」→ ✅ 「monochromatic burnt orange palette with subtle tonal variations」

### ❌ 矛盾した指示
- 「sharp focus throughout」と「heavy background blur」→ ✅ 「sharp focus on subject, heavy blur on background」
- 「minimalist」と「many elements」→ ✅ 「minimalist with only essential elements」

### ❌ 実装不可能な指示
- 「perfect」→ ✅ 「pristine and flawless」
- 「very」→ ✅ 「[具体的な数値や説明]」
- 「realistic」→ ✅ 「maintaining natural material behavior」

---

## セクション間の関係性

```
Main Concept
    ↓
    ├─→ Visual Signature（見た目を定義）
    ├─→ Technical Approach（作り方を定義）
    └─→ Detailed Understanding（詳細を説明）
            ↓
            └─→ Constructed Prompt（実装可能に変換）
```

### 一貫性の確認
1. Main Conceptで述べた技法が、Technical Approachで実装されているか？
2. Visual Signatureの要素が、Detailed Understandingで詳しく説明されているか？
3. Detailed Understandingの詳細が、Constructed Promptで実装可能な指示に変換されているか？

---

## 実践例：コーヒー広告

### Main Concept
This image creates a powerful visual metaphor using typography as the primary design element, with a coffee cup serving as the "ON" indicator in a power toggle switch design.

### Visual Signature
Bold sans-serif typography forming geometric shapes with strategic coffee cup placement against vibrant red background.

### Technical Approach
Minimalist graphic design with precise typography layout and strategic product photography integration.

### Detailed Image Understanding
A minimalist advertising design on striking red background featuring handwritten-style typography. The composition uses a rounded white rectangle in the upper left quadrant containing a coffee cup photographed from above. Bold white sans-serif letters "ON" and "OFF" create a visual toggle switch effect. The tagline "In this winter, Switch on instantly with a cup of coffee" appears below in clean typography. The color palette is deliberately limited—vibrant red background, white elements, and warm brown coffee tones. The overall mood is energetic yet sophisticated, using the universal power switch symbol to represent coffee's energizing properties.

### Constructed Prompt

**Product Treatment:**
The coffee cup is photographed from directly above, perfectly centered in the white rounded rectangle. The cup contains dark espresso with visible crema. The cup is upright and stable with zero motion blur and crisp edges.

**Surrounding Elements:**
The white rounded rectangle serves as both negative space and the foundation for the design concept, positioned in the upper left quadrant occupying approximately 25% of frame height.

**Container or Environment:**
Pure vibrant red background (#DC143C) fills the entire frame, providing maximum contrast and visual impact against white elements.

**Lighting Setup:**
Soft, even lighting from above eliminates harsh shadows on the coffee cup. The lighting emphasizes the coffee's dark color and visible crema while maintaining the clean aesthetic.

**Color Palette:**
Vibrant red background, pure white typography and shapes, warm brown coffee tones, with yellow circular logo accent.

**Material Effects:**
The coffee cup shows realistic material properties with visible liquid inside. The espresso surface shows natural crema texture. The white background maintains clean, flat appearance.

---

## 次のステップ

1. テンプレートを選択
2. 各セクションを埋める
3. チェックリストで確認
4. AI画像生成ツールで実装
5. 結果を評価して調整

---

## 📋 JSON出力形式（必須）

**プロンプト生成時は必ず以下のJSON形式で出力すること**

```json
{
  "concept_analysis": {
    "main_concept": "This image employs [technique] to create [environment] for [INPUT_IMAGE_SUBJECT]. The subject is positioned [position] as the hero element. Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail.",
    "visual_signature": "[Composition description] surrounding the [INPUT_IMAGE_SUBJECT]",
    "technical_approach": "[Photography type] with [techniques], matching the lighting of the [INPUT_IMAGE]",
    "detailed_image_understanding": "The image features the object from [INPUT_IMAGE] as the central subject. The [INPUT_IMAGE_SUBJECT] is positioned [position], occupying approximately [%] of the frame. The [INPUT_IMAGE_SUBJECT] retains its original texture and details but is integrated into this environment via matching lighting and color grading. [Full description 150-300 words]"
  },
  "exact_specifications": {
    "dimensions": "[aspect ratio] ([resolution])",
    "color_palette": {
      "primary": "#XXXXXX ([color name])",
      "secondary": "#XXXXXX ([color name])",
      "highlights": "#XXXXXX ([color name])",
      "shadows": "#XXXXXX ([color name])",
      "background": "[gradient/solid description]",
      "subject_integration": "[INPUT_IMAGE_SUBJECT] retains original colors but receives [ambient effect] for integration"
    },
    "subject_specifications": {
      "source": "Derived strictly from [INPUT_IMAGE]",
      "size": "[%] of frame height",
      "position": "Positioned at [%] horizontal, [%] vertical",
      "sharpness": "Maximum sharpness on the [INPUT_IMAGE_SUBJECT]",
      "lighting": "Key light adapted to match [INPUT_IMAGE] direction, enhanced with [additional lighting]"
    },
    "motion_effects": {
      "type": "[motion description]",
      "blur_amount": "[blur specification]"
    }
  },
  "detailed_template": {
    "scene_setup": "1. Place [INPUT_IMAGE_SUBJECT] at [position]. 2. [Additional scene elements]. 3. [Background specification].",
    "hero_placement": "Use [INPUT_IMAGE] as the reference for the hero object. Position at [coordinates]. Maintain the angle and perspective of the original input image but refine lighting to match the scene.",
    "effect_layers": "Layer 1: [INPUT_IMAGE_SUBJECT] with maximum sharpness. Layer 2: [Additional layers]. Layer N: Color grading overlay to unify [INPUT_IMAGE_SUBJECT] and background.",
    "text_placement": "[Text specification or 'No additional text overlay']"
  },
  "technical_execution": {
    "camera_settings": "ARRI ALEXA 35, ARRI Signature Prime, Aperture [f-stop], Focus on [INPUT_IMAGE_SUBJECT]",
    "lighting_setup": "[Detailed lighting description matching [INPUT_IMAGE]]",
    "post_production_steps": [
      "Isolate subject from [INPUT_IMAGE]",
      "Composite [INPUT_IMAGE_SUBJECT] into the environment",
      "Apply ArriRaw to Rec709 color conversion",
      "Color grade background to specified palette",
      "Apply subtle ambient occlusion shadows under the [INPUT_IMAGE_SUBJECT]",
      "[Additional post-production steps]"
    ]
  },
  "application_guidelines": {
    "best_category_fit": "[Comma-separated category list]",
    "critical_success_factors": "Seamless integration of [INPUT_IMAGE] into the environment, matching lighting direction, [additional success factors]"
  }
}
```

---

## 完全な実践例：ラグジュアリープロダクト広告（JSON形式）

```json
{
  "concept_analysis": {
    "main_concept": "This image employs dramatic architectural lighting with sweeping metallic sculptural elements to create a futuristic, high-tech environment for [INPUT_IMAGE_SUBJECT]. The subject is positioned at the exact center as the hero element, surrounded by massive curved metallic blades that create dynamic diagonal lines and reflected light. Shot on ARRI ALEXA 35 with ARRI Signature Prime lens. ArriRaw to Rec709 color conversion applied, delivering cinematic skin tones, natural color rendition, and characteristic ARRI color science with smooth roll-off in highlights and rich shadow detail.",
    "visual_signature": "Centered luxury product photography with dramatic diagonal metallic architectural elements, monochromatic blue-grey palette, studio lighting creating sharp highlights on brushed metal surfaces surrounding the [INPUT_IMAGE_SUBJECT]",
    "technical_approach": "Controlled studio environment with large-scale sculptural props or CGI architectural elements, precision product photography, dramatic directional lighting to create metallic reflections matching the lighting of the [INPUT_IMAGE]",
    "detailed_image_understanding": "The image serves as a high-end luxury advertisement featuring the object from [INPUT_IMAGE] as the central subject. The subject is positioned precisely at the center of the frame, occupying approximately 35-40% of the vertical space. The composition is a carefully constructed studio shot with the subject positioned on a reflective surface. The background features massive sculptural metallic elements - specifically large curved blades or panels with brushed metal finish that sweep diagonally across the frame. These architectural elements create strong leading lines and add dynamic movement. The lighting setup is sophisticated, with key lights positioned to create highlights along the edges of the metallic blades. The [INPUT_IMAGE_SUBJECT] itself retains its original texture and details but is integrated into this environment via matching lighting and color grading. The color palette is strictly controlled monochromatic blue-grey (Navy to Steel Blue), creating a cohesive, premium aesthetic."
  },
  "exact_specifications": {
    "dimensions": "3:4 aspect ratio (2160x2880px)",
    "color_palette": {
      "primary": "#3d5a6b (steel blue)",
      "secondary": "#5a7a8f (lighter steel blue)",
      "highlights": "#c5d5e0 (metallic highlight)",
      "shadows": "#1a2834 (deep navy)",
      "background": "Gradient from #2a3d4d (top) to #3d5a6b (center) to #4a6274 (bottom)",
      "subject_integration": "[INPUT_IMAGE_SUBJECT] retains original colors but receives subtle blue-grey ambient reflection for integration"
    },
    "subject_specifications": {
      "source": "Derived strictly from [INPUT_IMAGE]",
      "size": "35-40% of frame height",
      "position": "Centered horizontally at 50%, positioned at 52% from top",
      "sharpness": "Maximum sharpness on the [INPUT_IMAGE_SUBJECT]",
      "lighting": "Key light adapted to match [INPUT_IMAGE] direction, enhanced with rim light from top"
    },
    "motion_effects": {
      "type": "No motion blur on subject - static precision photography",
      "blur_amount": "Selective focus on background metallic elements"
    }
  },
  "detailed_template": {
    "scene_setup": "1. Place [INPUT_IMAGE_SUBJECT] at exact center on reflective surface (black acrylic or glass). 2. Construct large-scale metallic sculptural elements - primary curved blade starting upper left extending to lower right. 3. Blades should be 8-12x larger than the subject. 4. Main blade positioned behind the subject plane. 5. Background should be seamless gradient backdrop in blue-grey tones.",
    "hero_placement": "Use [INPUT_IMAGE] as the reference for the hero object. Position at 50% horizontal, 52% vertical. Maintain the angle and perspective of the original input image but refine lighting to match the scene.",
    "effect_layers": "Layer 1: [INPUT_IMAGE_SUBJECT] with maximum sharpness. Layer 2: Reflection beneath subject with 30% opacity. Layer 3: Primary metallic blade with partial focus. Layer 4: Background gradient. Layer 5: Blue-grey color grading overlay to unify [INPUT_IMAGE_SUBJECT] and background.",
    "text_placement": "No additional text overlay."
  },
  "technical_execution": {
    "camera_settings": "ARRI ALEXA 35, ARRI Signature Prime, Aperture f/11-f/16, Focus on [INPUT_IMAGE_SUBJECT]",
    "lighting_setup": "Key light: Large softbox upper left. Rim light: Strip box directly above for subject separation. Background light: Two strip boxes behind metallic elements with blue gel.",
    "post_production_steps": [
      "Isolate subject from [INPUT_IMAGE]",
      "Composite [INPUT_IMAGE_SUBJECT] into the metallic environment",
      "Apply ArriRaw to Rec709 color conversion",
      "Color grade background to specified Blue-Grey palette",
      "Apply subtle ambient occlusion shadows under the [INPUT_IMAGE_SUBJECT]",
      "Enhance metallic highlights on background elements"
    ]
  },
  "application_guidelines": {
    "best_category_fit": "Luxury Product Display, High-Tech Gadgets, Cosmetics, Automotive Parts",
    "critical_success_factors": "Seamless integration of [INPUT_IMAGE] into the metallic environment, matching lighting direction, maintaining the monochromatic blue-grey background aesthetic while keeping [INPUT_IMAGE_SUBJECT] distinct."
  }
}
```

---

## チェックリスト（更新版）

### プロンプト作成時の確認事項

- [ ] Main Conceptは1-3文か？
- [ ] Visual Signatureは1文か？
- [ ] Technical Approachは1-2文か？
- [ ] Detailed Understandingは150-300語か？
- [ ] **`[INPUT_IMAGE]` 変数が適切に使用されているか？**
- [ ] **`[INPUT_IMAGE_SUBJECT]` 変数が適切に使用されているか？**
- [ ] **Camera & Lens Look（ARRI ALEXA 35 + ARRI Signature Prime）が含まれているか？**
- [ ] **JSON形式で出力されているか？**
- [ ] 色は具体的に指定されているか？
- [ ] 配置は数値化されているか？
- [ ] 照明は明確に説明されているか？
- [ ] セクション間に矛盾がないか？
- [ ] 指示は実装可能か？

