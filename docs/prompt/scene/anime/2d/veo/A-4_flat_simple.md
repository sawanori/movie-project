# [A-4] ゆるキャラ・フラット - Veo プロンプトテンプレート

**スタイル解説**:
線と面で構成された、シンプルで親しみやすいフラットデザインのスタイル。太い輪郭線、ベタ塗り、最小限のディテールが特徴。広告、教育コンテンツ、ゆるキャラのアニメーションなどに適しています。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`simple flat vector illustration`, `bold outlines`, `minimalist 2D animation`, `solid colors`, `smooth and bouncy animation`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: walking happily, waving hand, bouncing]
Camera: [CAMERA MOVEMENT - 例: static medium shot, centered]
Style: simple flat vector illustration, bold outlines, minimalist 2D animation, solid colors
Lighting: flat lighting, no shadows
Audio: [SOUND - 例: cheerful ukulele music, bouncy sound effects]
Negatives: no shadows, no gradients, no complex textures, no realistic details

16:9, 1080p, 4s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no shadows
❌ no gradients
❌ no complex textures
❌ no realistic details
❌ no 3D effects
```

---

## 実例とサンプルプロンプト

### サンプル1：歩くマスコット

CLIP SPECIFIC:
Action: Walking happily from left to right, waving hand
Camera: static medium shot, centered
Style: simple flat vector illustration, bold outlines, minimalist 2D animation, solid colors, looping animation
Lighting: flat lighting, no shadows
Audio: cheerful ukulele music, bouncy sound effect for each step
Negatives: no shadows, no gradients, no background details

16:9, 1080p, 4s.

### サンプル2：アイコンアニメーション

CLIP SPECIFIC:
Action: Popping up with a bounce, spinning once
Camera: static close-up shot
Style: motion graphics, simple flat vector illustration, bold outlines, solid colors, smooth animation
Lighting: flat lighting
Audio: satisfying pop sound effect, subtle swoosh
Negatives: no 3D effects, no textures, no complex shapes

1:1, 1080p, 3s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターデザイン | 動作・アニメーション |
| 色・配色 | カメラワーク |
| 背景（無地など） | スタイルキーワード |
| 構図 | オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。

**推奨**: ループアニメーションを作成する場合は `looping animation` キーワードを追加してください。
