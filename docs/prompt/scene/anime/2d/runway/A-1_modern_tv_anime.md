# [A-1] Modern TV Anime - モダン・TVアニメ風 プロンプトテンプレート

**スタイル解説**:
現在の日本で主流のTVアニメスタイル。デジタル作画によるシャープな線、高コントラストな影（セルルック）が特徴。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法と動きのみを指定してください。

---

## スタイルキーワード

`modern anime style`, `sharp cel-shading`, `digital line art`, `high contrast shadows`, `clean anime aesthetic`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION] (appearance inherited from input image)
Motion: [ANIME-STYLE MOVEMENT: hair flow, fabric sway, expression shift]
Camera: [CAMERA MOVEMENT + FRAMING]
Style: modern anime style, sharp cel-shading, digital line art, high contrast shadows
Must include: [NATURAL ANIME MOTION: hair physics, cloth dynamics, subtle breathing]
Final note: Prioritize anime aesthetic, smooth motion, clean lines throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ watercolor, oil painting, sketch, hand-drawn texture
❌ 3D render, CGI, photorealistic, live action
❌ retro, vintage, 90s style, classic anime, film grain
❌ low resolution, pixelated, blurry
```

---

## 実例とサンプルプロンプト

### サンプル1：静かな動き

CLIP SPECIFIC:
Scene: Peaceful atmosphere, gentle ambient mood
Subject: Subtle smile forming, relaxed pose
Motion: Hair gently swaying, soft expression change, natural blink
Camera: Slow push in, soft focus transition
Style: modern anime style, sharp cel-shading, digital line art, high contrast shadows
Must include: Hair physics, subtle breathing motion, eye movement
Final note: Maintain clean anime aesthetic, smooth transitions

### サンプル2：アクション

CLIP SPECIFIC:
Scene: Dynamic atmosphere, intense mood
Subject: Powerful motion, determined expression
Motion: Fast movement with motion blur, dynamic pose shift
Camera: Tracking shot following action, dramatic angle
Style: modern anime style, sharp cel-shading, digital line art, high contrast shadows
Must include: Speed lines effect, cloth dynamics, impact frames
Final note: Anime action aesthetic, maintain character consistency

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| キャラクターの外見 | 動作・アクション |
| 背景・シーン | カメラワーク |
| 色彩・配色 | レンダリングスタイル |
| 構図 | ポストエフェクト |
