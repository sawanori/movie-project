# [A-3] 90年代レトロ・セル画風 - Veo プロンプトテンプレート

**スタイル解説**:
1990年代のテレビアニメで主流だったセル画の質感を再現したスタイル。アナログ制作ならではの少しぼやけた輪郭、独特の色彩感覚、フィルムグレインやVHSノイズが「エモい」雰囲気を醸し出します。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`90s retro anime aesthetic`, `classic cel-shading`, `vintage VHS look`, `film grain`, `slightly desaturated colors`, `analog color warmth`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: looking at the sunset, wind blowing through hair]
Camera: [CAMERA MOVEMENT - 例: static medium shot, quick zoom-in]
Style: 90s retro anime aesthetic, classic cel-shading, vintage VHS look, film grain
Lighting: [LIGHTING - 例: warm sunset glow, simple hard shadows]
Audio: [SOUND - 例: nostalgic city pop music, distant train sounds]
Negatives: no modern CGI effects, no smooth gradients, no perfect digital lines

4:3, 720p, 6s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no modern CGI effects
❌ no smooth gradients
❌ no perfect digital lines
❌ no lens flare
❌ no high-definition details
```

---

## 実例とサンプルプロンプト

### サンプル1：夕暮れの街

CLIP SPECIFIC:
Action: Standing still, hair gently swaying, melancholic expression
Camera: static medium shot, focus on character's expression
Style: 90s retro anime aesthetic, classic cel-shading, vintage VHS look, film grain, beautiful sunset colors
Lighting: warm glow from setting sun, creating strong silhouette
Audio: distant city sounds, train passing, nostalgic city pop music
Negatives: no CGI, no lens flare, no high-definition details

4:3, 720p, 8s.

### サンプル2：変身シーン

CLIP SPECIFIC:
Action: Spinning with arms raised, dramatic pose at the end
Camera: quick zoom-in to face as eyes open
Style: 90s retro anime aesthetic, classic cel-shading, bold colors, film grain, light bleed effect
Lighting: bright flashing colored lights
Audio: dramatic synthesizer music, sparkling sound effects
Negatives: no smooth animation, no realistic physics

4:3, 720p, 6s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターデザイン | 動作・ポーズ変化 |
| 90年代風の服装 | カメラワーク |
| 背景・都市風景 | スタイルキーワード |
| 構図 | 照明効果・オーディオ |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。

**推奨設定**: 4:3アスペクト比と720p解像度で、よりレトロな雰囲気を演出できます。
