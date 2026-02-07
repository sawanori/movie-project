# Veo AI プロンプトテンプレート集: 2D & 3D スタイル完全ガイド

**作成日**: 2025年12月30日

---

## 目次

- [テンプレート一覧](#テンプレート一覧)
- [A. 2D (Anime / Illustration)](#a-2d-anime--illustration)
  - [① モダン・VTuber風](#-モダンvtuber風ホロライブにじさんじ風)
  - [② 温かみ・ジブリ風](#-温かみジブリ風手書きの質感)
  - [③ 90年代レトロ・セル画風](#-90年代レトロセル画風エモい質感)
  - [④ ゆるキャラ・フラット](#-ゆるキャラフラットシンプル)
- [B. 3D (CGI / Game)](#b-3d-cgi--game)
  - [① フォトリアル](#-フォトリアル映画実写融合)
  - [② ゲーム・UE5風](#-ゲームue5風高精細)
  - [③ デフォルメ（ピクサー風）](#-デフォルメピクサー風)
  - [④ ローポリ・レトロ](#-ローポリレトロps1風)
- [クイックリファレンス](#クイックリファレンス)

---

## テンプレート一覧

| カテゴリ | スタイル | 主要キーワード | 推奨AR | 推奨解像度 |
|---------|---------|---------------|--------|-----------|
| **2D** | モダン・VTuber風 | `modern anime style`, `sharp cel-shading` | 16:9 | 1080p |
| **2D** | ジブリ風 | `hand-drawn aesthetic`, `soft watercolor textures` | 16:9 | 1080p |
| **2D** | 90年代レトロ | `90s retro anime aesthetic`, `vintage VHS look` | 4:3 | 720p |
| **2D** | ゆるキャラ・フラット | `simple flat vector illustration`, `bold outlines` | 16:9 | 1080p |
| **3D** | フォトリアル | `photorealistic`, `cinematic lighting`, `8k` | 16:9 | 1080p |
| **3D** | ゲーム・UE5風 | `Unreal Engine 5 render`, `ray tracing` | 16:9 | 1080p |
| **3D** | ピクサー風 | `stylized 3D`, `Disney/Pixar aesthetic` | 16:9 | 1080p |
| **3D** | ローポリ・レトロ | `low poly`, `PS1 / N64 aesthetic` | 4:3 | 480p |

---

# A. 2D (Anime / Illustration)

---

## ① モダン・VTuber風（ホロライブ、にじさんじ風）

### スタイルの特徴

デジタル作画を前提とした、シャープで高彩度な現代的なアニメスタイルです。クリアな線画、はっきりとした影（セルシェーディング）、鮮やかな色彩が特徴で、VTuberのLive2Dモデルや最近のテレビアニメで広く採用されています。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `modern anime style`, `sharp cel-shading`, `digital line art`, `high contrast`, `vibrant colors` |
| **Character** | `large expressive eyes`, `detailed hair with highlights`, `clean character design` |
| **Effects** | `glowing particles`, `lens flare`, `chromatic aberration` |
| **Quality** | `4k resolution`, `high quality animation`, `smooth motion` |

### プロンプト構造

```
[Subject: キャラクター詳細], [Action: アイドルらしいポーズや表情], [Scene: 未来的なステージや配信部屋].

Style: modern anime style, sharp cel-shading, digital line art, high contrast, vibrant colors, large expressive eyes, detailed hair with highlights.

Camera: [カメラワーク], [レンズ効果].

Lighting: [照明効果、例: glowing stage lights, rim lighting].

Audio: [J-POPやエレクトロニックなBGM], [キャラクターボイス].

Negatives: no blurry lines, no muted colors, no realistic textures.

[16:9], [1080p], [8s].
```

### 具体例

#### 例1: ライブパフォーマンス

```
A beautiful anime girl with long silver hair and glowing blue eyes, singing on a futuristic stage, making a heart pose with her hands.

Style: modern anime style, sharp cel-shading, digital line art, high contrast, vibrant colors, large expressive eyes, detailed hair with highlights, hololive inspired.

Camera: medium shot, slow dolly-in, subtle lens flare.

Lighting: glowing pink and blue stage lights, strong rim lighting on her hair.

Audio: upbeat J-POP music, clear singing voice, cheering crowd in the background.

Negatives: no blurry lines, no muted colors, no realistic textures.

16:9, 1080p, 8s.
```

#### 例2: ゲーム配信

```
An energetic anime boy with spiky red hair, wearing a headset and laughing, sitting in a high-tech gaming chair in front of multiple monitors.

Style: modern anime style, sharp cel-shading, digital line art, high contrast, vibrant colors, expressive face, nijisanji inspired.

Camera: close-up on his face, slight dutch angle.

Lighting: monitor glow illuminating his face, neon lights in the background.

Audio: excited shouting, keyboard clicking sounds, in-game sound effects.

Negatives: no motion blur, no grainy textures.

16:9, 1080p, 6s.
```

---

## ② 温かみ・ジブリ風（手書きの質感）

### スタイルの特徴

手書きの質感と自然の美しさを重視した、ノスタルジックで温かみのあるスタイルです。水彩絵の具のような柔らかいテクスチャ、自然光の優しい表現、細部まで描き込まれた背景が特徴です。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `hand-drawn aesthetic`, `Studio Ghibli inspired`, `soft watercolor textures`, `gentle natural lighting` |
| **Character** | `simple and expressive character design`, `rosy cheeks`, `nostalgic feel` |
| **Environment** | `lush green landscapes`, `detailed backgrounds`, `beautiful cloudscapes` |
| **Quality** | `painterly style`, `subtle film grain` |

### プロンプト構造

```
[Subject: 素朴なキャラクター], [Action: 日常的な、自然と触れ合う動作], [Scene: 美しい田園風景や古い町並み].

Style: hand-drawn aesthetic, Studio Ghibli inspired, soft watercolor textures, painterly style.

Camera: [静かでゆっくりとしたカメラワーク].

Lighting: gentle natural lighting, warm sunlight filtering through trees, golden hour.

Audio: [穏やかなピアノやオーケストラのBGM], [自然の環境音].

Negatives: no sharp digital lines, no high contrast, no neon colors.

[16:9], [1080p], [8s].
```

### 具体例

#### 例1: 草原を駆ける少女

```
A young girl with short brown hair and a white dress, running joyfully through a vast green meadow filled with wildflowers, chasing a butterfly.

Style: hand-drawn aesthetic, Studio Ghibli inspired, soft watercolor textures, painterly style, beautiful cloudscapes in the background.

Camera: wide shot, slow tracking shot from the side.

Lighting: warm golden hour sunlight, creating long soft shadows.

Audio: gentle orchestral music, sound of wind blowing, birds chirping.

Negatives: no sharp digital lines, no neon colors, no CGI look.

16:9, 1080p, 8s.
```

#### 例2: 雨宿り

```
A boy and a giant fluffy creature are sitting together at a bus stop in the rain, the creature is holding a large leaf as an umbrella.

Style: hand-drawn aesthetic, Hayao Miyazaki inspired, soft watercolor textures, nostalgic and heartwarming feel.

Camera: static medium shot.

Lighting: soft, diffused light from the overcast sky, reflections on the wet pavement.

Audio: calming sound of rain, distant rumble of thunder, no music.

Negatives: no harsh shadows, no overly saturated colors.

16:9, 1080p, 8s.
```

---

## ③ 90年代レトロ・セル画風（エモい質感）

### スタイルの特徴

1990年代のテレビアニメで主流だったセル画の質感を再現したスタイルです。アナログ制作ならではの少しぼやけた輪郭、独特の色彩感覚、フィルムグレインやVHSノイズが「エモい」雰囲気を醸し出します。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `90s retro anime aesthetic`, `classic cel-shading`, `vintage VHS look`, `film grain`, `4:3 aspect ratio` |
| **Character** | `sharp angular character designs`, `less detailed eyes`, `distinctive 90s fashion` |
| **Color** | `slightly desaturated colors`, `limited color palette`, `analog color warmth` |
| **Effects** | `light bleed`, `subtle chromatic aberration`, `VHS tracking lines` |

### プロンプト構造

```
[Subject: 90年代風のキャラクター], [Action: 当時を象徴するような行動], [Scene: 90年代の都市や学校].

Style: 90s retro anime aesthetic, classic cel-shading, vintage VHS look, film grain, sharp angular character designs.

Camera: [当時のアニメで多用されたカメラワーク、例: static shots, quick zooms].

Lighting: [シンプルで硬めの照明].

Audio: [90年代風のシティポップやシンセサイザー音楽], [少しこもったような音質].

Negatives: no modern CGI effects, no smooth gradients, no perfect digital lines.

[4:3], [720p], [6s].
```

### 具体例

#### 例1: 夕暮れの街

```
An anime girl in a school uniform with fluffy brown hair, standing on a pedestrian overpass, looking at the city skyline at sunset. A train passes below.

Style: 90s retro anime aesthetic, classic cel-shading, vintage VHS look, film grain, slightly desaturated colors, beautiful sunset colors.

Camera: static medium shot, focus on the character's melancholic expression.

Lighting: warm glow from the setting sun, creating a strong silhouette.

Audio: distant sound of the city, train sounds, nostalgic city pop music in the background.

Negatives: no CGI, no lens flare, no high-definition details.

4:3, 720p, 8s.
```

#### 例2: 変身シーン

```
A magical girl transforming, with ribbons of light swirling around her. Her silhouette is visible against a patterned background.

Style: 90s retro anime aesthetic, classic cel-shading, bold colors, film grain, light bleed effect, inspired by Sailor Moon.

Camera: quick zoom-in to her face as she opens her eyes.

Lighting: bright, flashing colored lights.

Audio: dramatic synthesizer music, sparkling sound effects.

Negatives: no smooth animation, no realistic physics.

4:3, 720p, 6s.
```

---

## ④ ゆるキャラ・フラット（シンプル）

### スタイルの特徴

線と面で構成された、シンプルで親しみやすいフラットデザインのスタイルです。太い輪郭線、ベタ塗り、最小限のディテールが特徴で、広告、教育コンテンツ、ゆるキャラのアニメーションなどに適しています。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `simple flat vector illustration`, `bold outlines`, `minimalist 2D animation`, `solid colors` |
| **Character** | `cute and simple character`, `chibi style`, `minimal facial features` |
| **Movement** | `smooth and bouncy animation`, `looping animation`, `motion graphics` |
| **Background** | `plain color background`, `simple geometric shapes` |

### プロンプト構造

```
[Subject: シンプルで可愛いキャラクター], [Action: 楽しくて分かりやすい動き], [Scene: 無地またはシンプルな背景].

Style: simple flat vector illustration, bold outlines, minimalist 2D animation, solid colors, cute and simple character design.

Camera: [正面からの固定カメラ].

Lighting: [影のないフラットな照明].

Audio: [軽快なウクレレや木琴のBGM], [可愛い効果音].

Negatives: no shadows, no gradients, no complex textures, no realistic details.

[16:9], [1080p], [4s].
```

### 具体例

#### 例1: 歩くキャラクター

```
A cute, round, yellow mascot character with two simple eyes, walking happily from left to right, waving its hand.

Style: simple flat vector illustration, bold outlines, minimalist 2D animation, solid colors, looping animation.

Camera: static medium shot, centered.

Lighting: flat lighting, no shadows.

Audio: cheerful and simple ukulele music, bouncy sound effect for each step.

Negatives: no shadows, no gradients, no background details.

16:9, 1080p, 4s.
```

#### 例2: アイコンアニメーション

```
A simple flat icon of a lightbulb turns on with a pop. A simple checkmark icon appears next to it.

Style: motion graphics, simple flat vector illustration, bold outlines, solid colors, smooth and clean animation.

Camera: static close-up shot.

Lighting: flat lighting.

Audio: satisfying 'pop' sound effect, a subtle 'swoosh' and 'ding' for the checkmark.

Negatives: no 3D effects, no textures, no complex shapes.

1:1, 1080p, 3s.
```

---

# B. 3D (CGI / Game)

---

## ① フォトリアル（映画・実写融合）

### スタイルの特徴

現実と見分けがつかないほどのリアリティを追求したスタイルです。映画のVFXや実写との合成を想定しており、光の挙動、物質の質感、物理法則を忠実に再現します。肌の質感や布のしわなど、細部へのこだわりが重要です。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `photorealistic`, `cinematic lighting`, `8k`, `ultra realistic`, `VFX` |
| **Material** | `subsurface scattering` (肌の質感), `PBR materials`, `realistic textures` |
| **Camera** | `shot on ARRI Alexa`, `35mm anamorphic lens`, `shallow depth of field` |
| **Physics** | `realistic physics`, `natural motion`, `fluid simulation` |

### プロンプト構造

```
[Subject: 現実的な人物やオブジェクト], [Action: 物理的に正確な動き], [Scene: 実在するような場所].

Style: photorealistic, cinematic, ultra realistic, 8k, shot on ARRI Alexa.

Camera: [映画的なカメラワーク], [レンズ設定].

Lighting: [現実的な照明、例: natural sunlight, soft bounce light].

Material: subsurface scattering for skin, PBR materials for objects.

Physics: realistic physics simulation.

Audio: [リアルな環境音], [映画的なサウンドデザイン].

Negatives: no cartoon effects, no stylized look, no uncanny valley.

[16:9], [1080p], [8s].
```

### 具体例

#### 例1: 雨の中の人物

```
A portrait of a woman with wet hair, rain drops running down her face, standing under a neon sign in a dark city street at night.

Style: photorealistic, cinematic, ultra realistic, 8k, emotional and moody.

Camera: close-up shot, 50mm lens, shallow depth of field, focus on her eyes.

Lighting: strong neon light from the side, reflections on the wet ground.

Material: realistic skin with subsurface scattering, wet clothes texture.

Audio: heavy rain sound, distant city hum, subtle melancholic synth pad.

Negatives: no dry spots, no cartoonish look.

16:9, 1080p, 8s.
```

#### 例2: 恐竜

```
A hyperrealistic Tyrannosaurus Rex roaring in a dense jungle. Its breath fogs in the humid air. Saliva drips from its teeth.

Style: photorealistic, VFX, cinematic, inspired by Jurassic Park.

Camera: low-angle shot, shaky handheld camera feel to add tension.

Lighting: dappled sunlight filtering through the jungle canopy, creating dynamic shadows.

Physics: realistic muscle movement, skin jiggle.

Audio: deafening roar, jungle ambient sounds, heavy footsteps.

Negatives: no stylized features, no robotic movement.

16:9, 1080p, 6s.
```

---

## ② ゲーム・UE5風（高精細）

### スタイルの特徴

Unreal Engine 5に代表される、現代のハイエンドゲームのグラフィックスタイルです。リアルタイムレンダリングでありながら、非常に高精細なテクスチャ、動的なライティングとシャドウ、高度なエフェクトが特徴です。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `Unreal Engine 5 render`, `dynamic shadows`, `highly detailed textures`, `ray tracing` |
| **Lighting** | `Lumen global illumination`, `dynamic lighting`, `volumetric fog` |
| **Character** | `next-gen game character`, `detailed armor`, `realistic hair simulation` |
| **Environment** | `Nanite virtualized geometry`, `mega-scanned environment` |

### プロンプト構造

```
[Subject: ゲームキャラクター], [Action: ゲーム内でのアクション], [Scene: ファンタジーやSFの世界].

Style: Unreal Engine 5 render, next-gen graphics, highly detailed textures, ray tracing reflections.

Camera: [ゲームでよく使われるカメラワーク、例: third-person action camera, dynamic tracking shot].

Lighting: Lumen global illumination, volumetric fog, god rays.

Audio: [壮大なゲーム音楽], [アクションに応じた効果音].

Negatives: no flat lighting, no low-resolution textures, no pre-rendered look.

[16:9], [1080p], [8s].
```

### 具体例

#### 例1: ファンタジーの騎士

```
A knight in intricately detailed silver armor, holding a glowing sword, stands on a cliff overlooking a vast fantasy kingdom.

Style: Unreal Engine 5 render, next-gen graphics, highly detailed textures on the armor, ray tracing reflections on the metal.

Camera: epic wide shot, slowly orbiting the character.

Lighting: dramatic sunset lighting, Lumen global illumination, god rays breaking through the clouds.

Audio: epic orchestral fantasy music, wind howling.

Negatives: no blurry textures, no static lighting.

16:9, 1080p, 8s.
```

#### 例2: サイバーパンクの街

```
A cyberpunk character with glowing cybernetic implants, walking through a crowded, rainy, neon-lit city street. Drones fly overhead.

Style: Unreal Engine 5 render, cyberpunk aesthetic, highly detailed wet street textures, screen space reflections from puddles, ray tracing.

Camera: third-person tracking shot from behind the character.

Lighting: vibrant neon lights, volumetric fog, dynamic shadows from passing vehicles.

Audio: futuristic city ambience, rain sounds, synthwave music.

Negatives: no clean streets, no daytime setting.

16:9, 1080p, 8s.
```

---

## ③ デフォルメ（ピクサー風）

### スタイルの特徴

PixarやDisneyのアニメーション映画に代表される、親しみやすく感情豊かなデフォルメ3Dスタイルです。現実をベースにしながらも、キャラクターの目や表情を大きく誇張し、柔らかく触りたくなるような質感が特徴です。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `stylized 3D`, `Disney/Pixar aesthetic`, `soft toy-like textures`, `expressive faces` |
| **Character** | `appealing character design`, `large expressive eyes`, `exaggerated animations` |
| **Lighting** | `soft and warm lighting`, `colorful lighting`, `bounce light` |
| **Environment** | `charming and whimsical world`, `simplified shapes` |

### プロンプト構造

```
[Subject: 可愛らしいデフォルメキャラクター], [Action: 感情豊かな、コミカルな動き], [Scene: カラフルで魅力的な世界].

Style: stylized 3D, Disney/Pixar aesthetic, appealing character design, large expressive eyes.

Camera: [ストーリーを語るための標準的なカメラワーク].

Lighting: soft and warm lighting, creating a friendly and inviting mood.

Audio: [陽気でオーケストラルな音楽], [コミカルな効果音].

Negatives: no photorealism, no sharp edges, no dark or scary mood.

[16:9], [1080p], [6s].
```

### 具体例

#### 例1: 好奇心旺盛なモンスター

```
A small, fluffy, blue monster with big curious eyes discovers a glowing butterfly in a magical forest. It reaches out its paw gently.

Style: stylized 3D, Disney/Pixar aesthetic, soft toy-like fur texture, expressive face showing wonder and excitement.

Camera: medium close-up, focusing on the interaction between the monster and the butterfly.

Lighting: magical, glowing light from the butterfly, soft ambient light in the forest.

Audio: whimsical and gentle orchestral music, sparkling sound effects.

Negatives: no realistic animal features, no scary elements.

16:9, 1080p, 8s.
```

#### 例2: しゃべる野菜

```
A group of cute, stylized 3D vegetables with faces (a carrot, a broccoli, a tomato) are having an animated conversation on a kitchen counter.

Style: stylized 3D, Pixar aesthetic, appealing and simple character designs, exaggerated and bouncy animations.

Camera: static medium shot at their eye-level.

Lighting: bright and clean kitchen lighting, soft shadows.

Audio: funny high-pitched voices, playful background music.

Negatives: no realistic food textures, no dark lighting.

16:9, 1080p, 6s.
```

---

## ④ ローポリ・レトロ（PS1風）

### スタイルの特徴

PlayStation 1やNINTENDO 64時代の、ポリゴン数が少ない（ローポリ）3Dグラフィックスを再現したスタイルです。カクカクしたモデル、低解像度のテクスチャ、テクスチャの歪み（warping）や頂点の揺れ（vertex jitter）が、独特のノスタルジーと不気味さを醸し出します。

### 基本キーワード

| カテゴリ | キーワード |
|---------|-----------|
| **Core** | `low poly`, `pixelated textures`, `PS1 / N64 aesthetic`, `retro 3D` |
| **Graphics** | `vertex jitter`, `texture warping`, `no anti-aliasing`, `low resolution render` |
| **Lighting** | `no shadows` or `simple hard shadows`, `flat lighting` |
| **Animation** | `jerky animation`, `low frame rate animation` |

### プロンプト構造

```
[Subject: ローポリのキャラクターやオブジェクト], [Action: 当時のゲームのようなぎこちない動き], [Scene: シンプルで不気味な空間].

Style: low poly, pixelated textures, PS1 aesthetic, retro 3D, vertex jitter, texture warping.

Camera: [固定カメラやシンプルな追跡カメラ].

Lighting: flat lighting, no shadows, or simple projected hard shadows.

Audio: [16-bitシンセサイザーのBGM], [低品質な効果音].

Negatives: no high-resolution textures, no smooth models, no realistic lighting, no anti-aliasing.

[4:3], [480p], [6s].
```

### 具体例

#### 例1: ホラーゲーム風

```
A low poly character, holding a flashlight, walks slowly down a dark, narrow hallway. The character model is slightly shaking.

Style: low poly, pixelated textures, PS1 horror game aesthetic, retro 3D, vertex jitter, texture warping, low resolution render.

Camera: fixed camera angle from the end of the hallway, creating a sense of dread.

Lighting: only light comes from the character's flashlight, creating a single hard shadow.

Audio: eerie and repetitive 16-bit synth music, distorted footstep sounds.

Negatives: no smooth animation, no detailed environment.

4:3, 480p, 8s.
```

#### 例2: レースゲーム風

```
A low poly retro racing car, drifting around a corner on a simple race track. The textures on the car and road are blurry and warped.

Style: low poly, pixelated textures, N64 aesthetic, retro 3D, texture warping, jerky animation.

Camera: third-person camera from behind the car.

Lighting: bright, flat, unrealistic lighting with no shadows.

Audio: upbeat 16-bit electronic racing music, low-quality engine and tire screeching sounds.

Negatives: no realistic physics, no detailed car model, no shadows.

4:3, 480p, 5s.
```

---

# クイックリファレンス

## 2D スタイル キーワード早見表

| スタイル | 必須キーワード | 推奨Negatives |
|---------|---------------|---------------|
| **モダン・VTuber風** | `modern anime style`, `sharp cel-shading`, `digital line art`, `high contrast`, `vibrant colors` | `no blurry lines`, `no muted colors`, `no realistic textures` |
| **ジブリ風** | `hand-drawn aesthetic`, `Studio Ghibli inspired`, `soft watercolor textures`, `gentle natural lighting` | `no sharp digital lines`, `no high contrast`, `no neon colors` |
| **90年代レトロ** | `90s retro anime aesthetic`, `classic cel-shading`, `vintage VHS look`, `film grain` | `no modern CGI effects`, `no smooth gradients`, `no perfect digital lines` |
| **ゆるキャラ・フラット** | `simple flat vector illustration`, `bold outlines`, `minimalist 2D animation`, `solid colors` | `no shadows`, `no gradients`, `no complex textures`, `no realistic details` |

## 3D スタイル キーワード早見表

| スタイル | 必須キーワード | 推奨Negatives |
|---------|---------------|---------------|
| **フォトリアル** | `photorealistic`, `cinematic lighting`, `8k`, `subsurface scattering`, `realistic physics` | `no cartoon effects`, `no stylized look`, `no uncanny valley` |
| **ゲーム・UE5風** | `Unreal Engine 5 render`, `dynamic shadows`, `highly detailed textures`, `ray tracing` | `no flat lighting`, `no low-resolution textures`, `no pre-rendered look` |
| **ピクサー風** | `stylized 3D`, `Disney/Pixar aesthetic`, `soft toy-like textures`, `expressive faces` | `no photorealism`, `no sharp edges`, `no dark or scary mood` |
| **ローポリ・レトロ** | `low poly`, `pixelated textures`, `PS1 / N64 aesthetic`, `retro 3D` | `no high-resolution textures`, `no smooth models`, `no realistic lighting`, `no anti-aliasing` |

---

## 汎用プロンプトテンプレート

```
[Subject: 被写体の詳細], [Action: 動作], [Scene: シーン/環境].

Style: [スタイルキーワード].

Camera: [ショットタイプ], [カメラ動作], [レンズ].

Lighting: [照明の詳細].

Audio: [アンビエンス], [SFX], [音楽].

Negatives: [除外要素].

[アスペクト比], [解像度], [長さ].
```

---

**このテンプレート集を活用して、Veo AIで様々なスタイルの動画を効率的に生成してください。**
