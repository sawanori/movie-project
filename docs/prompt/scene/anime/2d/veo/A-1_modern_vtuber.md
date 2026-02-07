# [A-1] モダン・VTuber風 - Veo プロンプトテンプレート

**スタイル解説**:
デジタル作画を前提とした、シャープで高彩度な現代的アニメスタイル。クリアな線画、はっきりとした影（セルシェーディング）、鮮やかな色彩が特徴。VTuberのLive2Dモデルや最近のテレビアニメで広く採用されています。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`modern anime style`, `sharp cel-shading`, `digital line art`, `high contrast`, `vibrant colors`, `large expressive eyes`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: waving hand, turning head, blinking, smiling]
Camera: [CAMERA MOVEMENT - 例: slow dolly-in, static medium shot]
Style: modern anime style, sharp cel-shading, digital line art, high contrast, vibrant colors
Lighting: [LIGHTING - 例: glowing stage lights, rim lighting on hair]
Audio: [SOUND - 例: upbeat J-POP music, cheerful voice]
Negatives: no blurry lines, no muted colors, no realistic textures

16:9, 1080p, 8s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no blurry lines
❌ no muted colors
❌ no realistic textures
❌ no motion blur
❌ no grainy textures
```

---

## 実例とサンプルプロンプト

### サンプル1：アイドルパフォーマンス

CLIP SPECIFIC:
Action: Making a heart pose with hands, winking playfully
Camera: medium shot, slow dolly-in, subtle lens flare
Style: modern anime style, sharp cel-shading, digital line art, high contrast, vibrant colors
Lighting: glowing pink and blue stage lights, strong rim lighting
Audio: upbeat J-POP music, cheering crowd in the background
Negatives: no blurry lines, no muted colors

16:9, 1080p, 8s.

### サンプル2：配信リアクション

CLIP SPECIFIC:
Action: Laughing and clapping hands excitedly
Camera: close-up on face, slight dutch angle
Style: modern anime style, sharp cel-shading, expressive face, hololive inspired
Lighting: monitor glow illuminating face, neon lights in background
Audio: excited laughter, keyboard clicking sounds
Negatives: no motion blur, no grainy textures

16:9, 1080p, 6s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターデザイン | 動作・表情変化 |
| 髪色・目の色・服装 | カメラワーク |
| 背景・ステージ | スタイルキーワード |
| 構図 | 照明効果・オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。
