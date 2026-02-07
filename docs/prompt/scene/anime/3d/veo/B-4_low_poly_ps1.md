# [B-4] ローポリ・レトロ（PS1風） - Veo プロンプトテンプレート

**スタイル解説**:
PlayStation 1やNINTENDO 64時代の、ポリゴン数が少ない（ローポリ）3Dグラフィックスを再現したスタイル。カクカクしたモデル、低解像度のテクスチャ、テクスチャの歪み（warping）や頂点の揺れ（vertex jitter）が、独特のノスタルジーと不気味さを醸し出します。

> **Image-to-Video用**: キャラクターや背景の情報は画像から取得されます。プロンプトでは動き・カメラワーク・スタイル・オーディオのみを指定してください。

---

## スタイルキーワード

`low poly`, `pixelated textures`, `PS1 / N64 aesthetic`, `retro 3D`, `vertex jitter`, `texture warping`, `jerky animation`

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the foundation for the video.
Maintain the style of the image. Do NOT describe character appearance or background details.

CLIP SPECIFIC (edit only this block):
Action: [MOTION - 例: walking slowly, looking around nervously, stiff movement]
Camera: [CAMERA MOVEMENT - 例: fixed camera angle, simple tracking]
Style: low poly, pixelated textures, PS1 aesthetic, retro 3D, vertex jitter, texture warping
Lighting: [LIGHTING - 例: flat lighting, no shadows, or simple hard shadows]
Audio: [SOUND - 例: 16-bit synth music, low-quality sound effects]
Negatives: no high-resolution textures, no smooth models, no realistic lighting, no anti-aliasing

4:3, 480p, 6s.

---

## ネガティブキーワード（避けるべき表現）

```
❌ no high-resolution textures
❌ no smooth models
❌ no realistic lighting
❌ no anti-aliasing
❌ no smooth animation
❌ no detailed environment
```

---

## 実例とサンプルプロンプト

### サンプル1：ホラーゲーム風

CLIP SPECIFIC:
Action: Walking slowly, looking around nervously, model slightly shaking
Camera: fixed camera angle from end of hallway, creating sense of dread
Style: low poly, pixelated textures, PS1 horror game aesthetic, retro 3D, vertex jitter, texture warping
Lighting: only light from flashlight, single hard shadow
Audio: eerie repetitive 16-bit synth music, distorted footstep sounds
Negatives: no smooth animation, no detailed environment

4:3, 480p, 8s.

### サンプル2：レースゲーム風

CLIP SPECIFIC:
Action: Drifting around corner, jerky movement
Camera: third-person camera from behind
Style: low poly, pixelated textures, N64 aesthetic, retro 3D, texture warping, jerky animation
Lighting: bright flat unrealistic lighting with no shadows
Audio: upbeat 16-bit electronic racing music, low-quality engine sounds
Negatives: no realistic physics, no detailed model, no shadows

4:3, 480p, 5s.

---

## 注意事項（Image-to-Video）

| 画像が決めること | プロンプトで指定すること |
|-----------------|------------------------|
| キャラクターモデル | 動作・アニメーション |
| テクスチャ | カメラスタイル（固定、サイドスクロール等） |
| 背景・ステージ | レンダリング技法 |
| 構図 | 雰囲気（ホラー、アクション等） |

**重要**: キャラクターの外見や背景をプロンプトで再記述すると、画像との情報コンフリクトが発生し、出力が崩れる原因となります。

**推奨設定**: 4:3アスペクト比と480p解像度で、よりレトロな雰囲気を演出できます。PS1らしさを出すため、`vertex jitter`や`texture warping`を含めてください。
