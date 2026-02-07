# [A-2] Ghibli Style - 温かみ・ジブリ風 プロンプトテンプレート

**スタイル解説**:
スタジオジブリ作品に代表される、手書きの温かみが特徴のスタイル。水彩画のような柔らかい色彩、穏やかな動きが魅力です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法と動きのみを指定してください。

---

## スタイルキーワード

`hand-drawn aesthetic`, `Studio Ghibli inspired`, `soft watercolor textures`, `gentle animation`, `painterly style`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION] (appearance inherited from input image)
Motion: [GHIBLI-STYLE MOVEMENT: wind-blown hair, flowing clothes, natural gestures]
Camera: [CAMERA MOVEMENT + FRAMING]
Style: hand-drawn aesthetic, Studio Ghibli inspired, soft watercolor textures, gentle animation
Must include: [NATURAL GHIBLI MOTION: wind physics, fabric flow, breathing motion]
Final note: Prioritize Ghibli aesthetic, gentle motion, warm atmosphere throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ digital, sharp lines, high contrast, modern anime
❌ 3D render, CGI, photorealistic
❌ dark, moody, dramatic lighting
❌ fast motion, action-heavy, intense
```

---

## 実例とサンプルプロンプト

### サンプル1：穏やかな動き

CLIP SPECIFIC:
Scene: Peaceful atmosphere, warm nostalgic mood
Subject: Gentle movement, relaxed expression
Motion: Hair and clothes flowing softly in breeze, peaceful breathing
Camera: Slow pan, static wide shot
Style: hand-drawn aesthetic, Studio Ghibli inspired, soft watercolor textures, gentle animation
Must include: Wind-blown hair physics, fabric sway, natural eye movement
Final note: Maintain Ghibli warmth, gentle transitions

### サンプル2：歩く動作

CLIP SPECIFIC:
Scene: Serene atmosphere, curious exploratory mood
Subject: Walking forward with natural stride
Motion: Looking around curiously, natural walking motion
Camera: Camera follows from behind, gentle tracking
Style: hand-drawn aesthetic, Studio Ghibli inspired, gentle animation, nostalgic atmosphere
Must include: Realistic walking physics, head turning, arm swing
Final note: Ghibli-style naturalistic movement, character consistency

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| キャラクターの外見 | 動作・アクション |
| 背景・風景 | カメラワーク |
| 色彩・光の質感 | レンダリングスタイル |
| 構図・配置 | 雰囲気（穏やか、ノスタルジック等） |
