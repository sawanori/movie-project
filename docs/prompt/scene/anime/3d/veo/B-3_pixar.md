# [B-3] デフォルメ（ピクサー風） - Veo プロンプトテンプレート

**スタイル解説**:
PixarやDisneyのアニメーション映画に代表される、親しみやすく感情豊かなデフォルメ3Dスタイル。現実をベースにしながらも、キャラクターの目や表情を大きく誇張し、柔らかく触りたくなるような質感が特徴です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`stylized 3D`, `Disney/Pixar aesthetic`, `soft toy-like textures`, `expressive faces`, `appealing character design`, `exaggerated animations`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: smiling widely, jumping with joy, curious head tilt]
Camera: [CAMERA MOVEMENT - 例: medium close-up, slow push-in]
Style: stylized 3D, Disney/Pixar aesthetic, appealing design, expressive face
Lighting: [LIGHTING - 例: soft and warm lighting, colorful bounce light]
Audio: [SOUND - 例: whimsical orchestral music, playful sound effects]
Negatives: no photorealism, no sharp edges, no dark or scary mood

16:9, 1080p, 6s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no photorealism
❌ no sharp edges
❌ no dark or scary mood
❌ no realistic animal features
❌ no scary elements
```

---

## 実例とサンプルプロンプト

### サンプル1：好奇心旺盛なキャラクター

CLIP SPECIFIC:
Action: Eyes widening with wonder, reaching out gently, curious expression
Camera: medium close-up, focusing on the interaction
Style: stylized 3D, Disney/Pixar aesthetic, soft toy-like texture, expressive face showing wonder
Lighting: magical glowing light, soft ambient light
Audio: whimsical and gentle orchestral music, sparkling sound effects
Negatives: no realistic features, no scary elements

16:9, 1080p, 8s.

### サンプル2：楽しい会話

CLIP SPECIFIC:
Action: Animated talking, bouncy gestures, laughing
Camera: static medium shot at eye-level
Style: stylized 3D, Pixar aesthetic, exaggerated and bouncy animations
Lighting: bright and clean lighting, soft shadows
Audio: funny voices, playful background music
Negatives: no dark lighting, no realistic textures

16:9, 1080p, 6s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターデザイン | 動作・表情変化 |
| 色・質感 | カメラワーク |
| 背景・世界観 | スタイルキーワード |
| 構図 | 照明効果・オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。

**推奨**: ピクサーらしい誇張された動きを出すため、`exaggerated animations`や`bouncy`を含めてください。
