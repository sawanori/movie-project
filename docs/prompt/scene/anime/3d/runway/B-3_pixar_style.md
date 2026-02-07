# [B-3] Pixar Style - デフォルメ（ピクサー風） プロンプトテンプレート

**スタイル解説**:
ディズニーやピクサーのアニメーション映画に見られる親しみやすいデフォルメスタイル。滑らかな曲線、柔らかい質感、感情豊かな動きが特徴です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法と感情表現のみを指定してください。

---

## スタイルキーワード

`stylized 3D animation`, `Pixar aesthetic`, `soft rendering`, `expressive animation`, `smooth motion`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION/EMOTION] (appearance inherited from input image)
Motion: [PIXAR-STYLE MOVEMENT: expressive gestures, squash and stretch, emotional acting]
Camera: [CAMERA MOVEMENT + FRAMING]
Style: stylized 3D animation, Pixar aesthetic, soft rendering, expressive animation
Must include: [PIXAR ANIMATION PRINCIPLES: squash and stretch, anticipation, follow-through]
Final note: Prioritize Pixar aesthetic, expressive emotion, appealing motion throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ photorealistic, realistic, hyperrealistic
❌ dark, moody, dramatic, scary
❌ anime, manga, cel-shading, 2D
❌ low poly, pixelated, retro, PS1
```

---

## 実例とサンプルプロンプト

### サンプル1：感情豊かな動き

CLIP SPECIFIC:
Scene: Joyful atmosphere, celebratory mood
Subject: Joyful expression, enthusiastic gesture
Motion: Bouncy happy movement, expressive animation
Camera: Medium shot, playful camera movement
Style: stylized 3D animation, Pixar aesthetic, soft rendering, squash and stretch
Must include: Squash and stretch principles, expressive eyes, bouncy follow-through
Final note: Pixar-quality animation, joyful energy

### サンプル2：静かな感情表現

CLIP SPECIFIC:
Scene: Quiet atmosphere, thoughtful mood
Subject: Thoughtful expression, gentle movement
Motion: Gentle head tilt, soft sigh, contemplative gesture
Camera: Slow push in, focus on face
Style: stylized 3D animation, Pixar aesthetic, soft lighting, subtle animation
Must include: Subtle eye movement, breathing animation, emotional depth
Final note: Pixar emotional storytelling, subtle expressive animation

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| キャラクターデザイン | 感情表現・動き |
| 背景・環境 | カメラワーク |
| 色彩・照明 | アニメーション技法 |
| 構図 | 動きの質感（bouncy, subtle等） |
