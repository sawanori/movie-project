# [B-1] Photorealistic - フォトリアル プロンプトテンプレート

**スタイル解説**:
実写と見分けがつかないほどの写実性を追求したスタイル。映画のVFXや実写映像との合成に最適。肌の質感、光の反射、物理演算に基づいたリアルな動きが重要です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法とカメラワークのみを指定してください。

---

## スタイルキーワード

`photorealistic`, `cinematic lighting`, `subsurface scattering`, `realistic physics`, `film quality`, `natural motion`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION] (appearance inherited from input image)
Motion: [PHOTOREALISTIC MOVEMENT: natural body mechanics, realistic physics, subtle micro-movements]
Camera: [CAMERA MOVEMENT + FRAMING + CINEMATIC TECHNIQUES]
Style: photorealistic, cinematic lighting, subsurface scattering, realistic physics
Must include: [REALISTIC DETAILS: natural skin texture, realistic eye movement, physical weight]
Final note: Prioritize photorealistic quality, natural motion, cinematic look throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ anime, cartoon, stylized, illustrated
❌ flat, 2D, cel-shading, vector
❌ low poly, pixelated, retro
❌ exaggerated, deformed, unrealistic motion
```

---

## 実例とサンプルプロンプト

### サンプル1：繊細な動き

CLIP SPECIFIC:
Scene: Intimate atmosphere, contemplative mood
Subject: Subtle facial expression change
Motion: Natural eye movement, gentle breathing, micro-expressions
Camera: Slow push in, shallow depth of field
Style: photorealistic, cinematic lighting, subsurface scattering, natural skin texture
Must include: Realistic skin rendering, natural eye moisture, subtle breathing
Final note: Photorealistic quality, natural human movement

### サンプル2：動的な動き

CLIP SPECIFIC:
Scene: Cinematic atmosphere, dynamic mood
Subject: Walking forward, natural movement
Motion: Natural body movement, realistic weight distribution
Camera: Tracking shot, dolly movement
Style: photorealistic, cinematic lighting, volumetric fog, film grain
Must include: Realistic walking mechanics, natural arm swing, physical weight
Final note: Film-quality realism, natural motion throughout

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| 人物の外見・服装 | 動作・表情変化 |
| 背景・環境 | カメラワーク |
| 既存の照明 | レンダリング品質 |
| 構図 | ポストエフェクト（フォグ、グレイン等） |
