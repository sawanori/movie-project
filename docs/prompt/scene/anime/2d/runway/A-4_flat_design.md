# [A-4] Flat Design - ゆるキャラ・フラット プロンプトテンプレート

**スタイル解説**:
企業のPRキャラクターや教育系アニメーションでよく見られる、シンプルで親しみやすいスタイル。太くはっきりした線、ベタ塗り、最小限のディテールが特徴です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法と動きのみを指定してください。

---

## スタイルキーワード

`flat vector style`, `bold outlines`, `minimalist 2D animation`, `simple shapes`, `clean graphic style`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION/GESTURE] (appearance inherited from input image)
Motion: [FLAT DESIGN MOVEMENT: simple gestures, smooth transitions, bouncy animation]
Camera: [CAMERA MOVEMENT + FRAMING]
Style: flat vector style, bold outlines, minimalist 2D animation, simple shapes
Must include: [FLAT DESIGN MOTION: smooth transitions, clean keyframes, consistent line weight]
Final note: Prioritize flat design aesthetic, clean motion, simple shapes throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ detailed, complex, intricate, realistic
❌ shadows, gradients, 3D shading
❌ photorealistic, cinematic, dramatic
❌ textured, grainy, noisy
```

---

## 実例とサンプルプロンプト

### サンプル1：シンプルなジェスチャー

CLIP SPECIFIC:
Scene: Friendly atmosphere, welcoming mood
Subject: Waving hand, nodding head
Motion: Simple friendly gesture, smooth animation
Camera: Static centered shot
Style: flat vector style, bold outlines, minimalist 2D animation, smooth motion
Must include: Clean keyframe transitions, consistent line weight, bouncy feel
Final note: Maintain flat design aesthetic, friendly approachable motion

### サンプル2：説明的な動き

CLIP SPECIFIC:
Scene: Educational atmosphere, engaging mood
Subject: Pointing gesture, explaining motion
Motion: Looking at viewer, clear instructional movement
Camera: Slight zoom in
Style: flat vector style, bold outlines, minimalist 2D animation, clean transitions
Must include: Clear gesture timing, smooth ease-in-out, readable motion
Final note: Flat design aesthetic, professional animation quality

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| キャラクターデザイン | 動作・ジェスチャー |
| 背景・配色 | カメラワーク |
| 線の太さ・スタイル | アニメーションの質感 |
| 構図 | トランジション効果 |
