# [B-4] Low Poly PS1 Style - ローポリ・レトロ（PS1風） プロンプトテンプレート

**スタイル解説**:
1990年代後半から2000年代初頭の家庭用ゲーム機（PS1、N64）を彷彿とさせるレトロな3Dスタイル。カクカクしたモデル、テクスチャの歪み、独特のノスタルジーが特徴。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトではレンダリング技法とカメラスタイルのみを指定してください。

---

## スタイルキーワード

`low poly 3D`, `PS1 aesthetic`, `pixelated textures`, `retro 3D graphics`, `fixed camera angle`, `texture warping`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Preserve the character design, art style, and color palette from the input image.
Focus on motion and camera work only - do NOT describe character appearance.

CLIP SPECIFIC (edit only this block):
Scene: [ATMOSPHERE + MOOD] (setting inherited from input image)
Subject: [SIMPLE ACTION] (appearance inherited from input image)
Motion: [PS1-STYLE MOVEMENT: stiff animation, limited frames, jerky transitions]
Camera: [CAMERA MOVEMENT + RETRO GAME CAMERA STYLE]
Style: low poly 3D, PS1 aesthetic, pixelated textures, retro 3D graphics
Must include: [PS1 EFFECTS: texture warping, limited animation frames, fixed camera feel]
Final note: Prioritize PS1/N64 aesthetic, retro game feel, nostalgic quality throughout.

---

## ネガティブキーワード（避けるべき表現）

```
❌ photorealistic, high resolution, 4K, 8K
❌ smooth, detailed, intricate, complex
❌ ray tracing, dynamic shadows, volumetric
❌ modern, next-gen, cutting-edge
```

---

## 実例とサンプルプロンプト

### サンプル1：ホラーゲーム風

CLIP SPECIFIC:
Scene: Eerie atmosphere, unsettling mood
Subject: Slow walking, nervous movement
Motion: Stiff animation, looking around nervously
Camera: Fixed security camera angle, static shot
Style: low poly 3D, PS1 horror aesthetic, pixelated textures, eerie atmosphere
Must include: Fixed camera feel, stiff character movement, retro horror ambience
Final note: PS1 survival horror aesthetic, nostalgic tension

### サンプル2：アクションゲーム風

CLIP SPECIFIC:
Scene: Action atmosphere, platformer mood
Subject: Jumping motion, landing impact
Motion: Idle animation loop, game-like movement
Camera: Side-scrolling camera view
Style: low poly 3D, N64 platformer aesthetic, pixelated textures, simple geometry
Must include: Game-style animation loops, limited frame animation, retro feel
Final note: N64/PS1 platformer aesthetic, classic game quality

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|------------------|--------------------------|
| キャラクターモデル | 動作・アニメーション |
| 背景・ステージ | カメラスタイル（固定、サイドスクロール等） |
| テクスチャ | レンダリング技法 |
| 構図 | 雰囲気（ホラー、アクション等） |
