# [B-2] ゲーム・UE5風 - Veo プロンプトテンプレート

**スタイル解説**:
Unreal Engine 5に代表される、現代のハイエンドゲームのグラフィックスタイル。リアルタイムレンダリングでありながら、非常に高精細なテクスチャ、動的なライティングとシャドウ、高度なエフェクトが特徴です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`Unreal Engine 5 render`, `dynamic shadows`, `highly detailed textures`, `ray tracing`, `Lumen global illumination`, `volumetric fog`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: walking heroically, drawing sword, casting spell]
Camera: [CAMERA MOVEMENT - 例: epic wide shot, slowly orbiting, third-person tracking]
Style: Unreal Engine 5 render, next-gen graphics, highly detailed textures, ray tracing
Lighting: [LIGHTING - 例: Lumen global illumination, volumetric fog, god rays]
Audio: [SOUND - 例: epic orchestral music, wind howling]
Negatives: no flat lighting, no low-resolution textures, no pre-rendered look

16:9, 1080p, 8s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no flat lighting
❌ no low-resolution textures
❌ no pre-rendered look
❌ no blurry textures
❌ no static lighting
```

---

## 実例とサンプルプロンプト

### サンプル1：ファンタジーの騎士

CLIP SPECIFIC:
Action: Standing heroically, cape flowing in wind, gripping sword
Camera: epic wide shot, slowly orbiting the character
Style: Unreal Engine 5 render, next-gen graphics, highly detailed textures, ray tracing reflections on metal
Lighting: dramatic sunset lighting, Lumen global illumination, god rays breaking through clouds
Audio: epic orchestral fantasy music, wind howling
Negatives: no blurry textures, no static lighting

16:9, 1080p, 8s.

### サンプル2：サイバーパンクの街

CLIP SPECIFIC:
Action: Walking through the scene, looking around
Camera: third-person tracking shot from behind
Style: Unreal Engine 5 render, cyberpunk aesthetic, highly detailed wet street textures, ray tracing
Lighting: vibrant neon lights, volumetric fog, dynamic shadows from passing vehicles
Audio: futuristic city ambience, rain sounds, synthwave music
Negatives: no clean streets, no flat lighting

16:9, 1080p, 8s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターモデル | 動作・アクション |
| 装備・衣装 | カメラワーク |
| 背景・環境 | スタイルキーワード |
| 構図 | 照明効果・オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。

**推奨**: UE5らしさを出すため、`Lumen global illumination`や`ray tracing`を含めてください。
