# [B-2] Game UE5 Style - ゲーム・UE5風 プロンプトテンプレート

**スタイル解説**:
最新のAAA級ゲームで見られるUnreal Engine 5のようなスタイル。フォトリアルでありながらゲーム的なカッコよさが強調。レイトレーシングによるリアルな反射が特徴。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法とエフェクトのみを指定してください。

---

## スタイルキーワード

`Unreal Engine 5 render`, `ray tracing`, `dynamic shadows`, `PBR materials`, `game cinematic quality`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION/POSE] (appearance inherited from input image)
Motion: [GAME CINEMATIC MOVEMENT: heroic poses, dynamic gestures, impactful transitions]
Camera: [CAMERA MOVEMENT + FRAMING + GAME CINEMATIC ANGLES]
Style: Unreal Engine 5 render, ray tracing, dynamic shadows, game cinematic quality
Must include: [UE5 EFFECTS: ray tracing reflections, dynamic shadows, particle effects]
Final note: Prioritize UE5 game aesthetic, cinematic quality, dramatic presentation throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ anime, cartoon, 2D, hand-drawn
❌ low poly, PS1, retro, pixelated
❌ soft, gentle, dreamy, ethereal
❌ watercolor, sketch, illustration
```

---

## 実例とサンプルプロンプト

### サンプル1：ヒロイックな動き

CLIP SPECIFIC:
Scene: Epic atmosphere, heroic triumphant mood
Subject: Heroic pose transition, powerful stance
Motion: Dramatic gesture, powerful movement
Camera: Low-angle shot, slow orbit around subject
Style: Unreal Engine 5 render, ray tracing reflections, dynamic shadows, god rays
Must include: Ray tracing reflections, volumetric god rays, dramatic lighting
Final note: UE5 game cinematic quality, heroic presentation

### サンプル2：戦闘的な動き

CLIP SPECIFIC:
Scene: Intense atmosphere, combat-ready mood
Subject: Combat stance, readying weapon
Motion: Intense focus, battle preparation
Camera: Over-the-shoulder shot, depth of field
Style: Unreal Engine 5 render, ray tracing, particle effects, motion blur
Must include: Dynamic particle effects, motion blur on movement, dramatic shadows
Final note: AAA game quality, intense cinematic action

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| キャラクターデザイン | 動作・ポーズ変化 |
| 装備・武器 | カメラワーク |
| 背景・環境 | レンダリング技法 |
| 既存のライティング | エフェクト（パーティクル等） |
