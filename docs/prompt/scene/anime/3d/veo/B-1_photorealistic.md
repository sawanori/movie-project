# [B-1] フォトリアル - Veo プロンプトテンプレート

**スタイル解説**:
現実と見分けがつかないほどのリアリティを追求したスタイル。映画のVFXや実写との合成を想定しており、光の挙動、物質の質感、物理法則を忠実に再現します。肌の質感や布のしわなど、細部へのこだわりが重要です。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`photorealistic`, `cinematic lighting`, `8k`, `ultra realistic`, `subsurface scattering`, `realistic physics`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: walking slowly, turning head, breathing naturally]
Camera: [CAMERA MOVEMENT - 例: close-up, 50mm lens, shallow depth of field]
Style: photorealistic, cinematic, ultra realistic, 8k
Lighting: [LIGHTING - 例: natural sunlight, soft bounce light]
Material: subsurface scattering for skin, realistic textures
Physics: realistic physics simulation
Audio: [SOUND - 例: ambient sounds, subtle music]
Negatives: no cartoon effects, no stylized look, no uncanny valley

16:9, 1080p, 8s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no cartoon effects
❌ no stylized look
❌ no uncanny valley
❌ no robotic movement
❌ no artificial lighting
```

---

## 実例とサンプルプロンプト

### サンプル1：雨の中の人物

CLIP SPECIFIC:
Action: Standing still, raindrops running down face, subtle breathing
Camera: close-up shot, 50mm lens, shallow depth of field, focus on eyes
Style: photorealistic, cinematic, ultra realistic, 8k, emotional and moody
Lighting: strong neon light from the side, reflections on wet ground
Material: realistic skin with subsurface scattering, wet texture
Audio: heavy rain sound, distant city hum, subtle melancholic synth pad
Negatives: no dry spots, no cartoonish look

16:9, 1080p, 8s.

### サンプル2：自然な動き

CLIP SPECIFIC:
Action: Turning head slowly, natural eye movement, subtle smile forming
Camera: medium shot, slow dolly-in, 35mm anamorphic lens
Style: photorealistic, cinematic, shot on ARRI Alexa
Lighting: soft natural window light, gentle rim light
Physics: realistic hair movement, natural skin deformation
Audio: quiet room ambience, soft breathing
Negatives: no robotic movement, no artificial lighting

16:9, 1080p, 6s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| 人物・被写体 | 動作・表情変化 |
| 服装・外見 | カメラワーク・レンズ |
| 背景・環境 | スタイルキーワード |
| 構図 | 照明効果・物理演算・オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。

**推奨**: リアルな質感を維持するため、`subsurface scattering`（肌）や`realistic physics`を含めてください。
