# [A-2] 温かみ・ジブリ風 - Veo プロンプトテンプレート

**スタイル解説**:
スタジオジブリ作品に代表される、手書きの温かみと豊かな自然描写が特徴のスタイル。水彩画のような柔らかい色彩、緻密に描き込まれた背景、キャラクターの自然な表情や仕草が魅力です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`hand-drawn aesthetic`, `Studio Ghibli inspired`, `soft watercolor textures`, `gentle natural lighting`, `painterly style`, `nostalgic feel`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: running joyfully, looking up at the sky, hair blowing in wind]
Camera: [CAMERA MOVEMENT - 例: wide shot, slow tracking from the side]
Style: hand-drawn aesthetic, Studio Ghibli inspired, soft watercolor textures, painterly style
Lighting: [LIGHTING - 例: warm golden hour sunlight, soft diffused light]
Audio: [SOUND - 例: gentle orchestral music, birds chirping, wind blowing]
Negatives: no sharp digital lines, no high contrast, no neon colors

16:9, 1080p, 8s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no sharp digital lines
❌ no high contrast
❌ no neon colors
❌ no CGI look
❌ no harsh shadows
❌ no overly saturated colors
```

---

## 実例とサンプルプロンプト

### サンプル1：草原を駆ける

CLIP SPECIFIC:
Action: Running joyfully, arms spread wide, hair flowing in the wind
Camera: wide shot, slow tracking shot from the side
Style: hand-drawn aesthetic, Studio Ghibli inspired, soft watercolor textures, painterly style
Lighting: warm golden hour sunlight, creating long soft shadows
Audio: gentle orchestral music, sound of wind blowing, birds chirping
Negatives: no sharp digital lines, no neon colors, no CGI look

16:9, 1080p, 8s.

### サンプル2：雨宿り

CLIP SPECIFIC:
Action: Sitting quietly, looking at the rain, occasional blink
Camera: static medium shot
Style: hand-drawn aesthetic, Hayao Miyazaki inspired, soft watercolor textures, nostalgic feel
Lighting: soft diffused light from overcast sky, reflections on wet ground
Audio: calming sound of rain, distant rumble of thunder
Negatives: no harsh shadows, no overly saturated colors

16:9, 1080p, 8s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターデザイン | 動作・仕草 |
| 服装・髪型 | カメラワーク |
| 背景・風景 | スタイルキーワード |
| 構図 | 照明効果・オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。
