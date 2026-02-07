# Runway Gen-4 シーンプロンプトテンプレート（人物）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の人物画像（SOURCE） |
| 出力 | 5〜10秒の人物動画 |
| 推奨語数 | 15〜30単語 |
| 成功率目安 | 80〜95%（シンプルな動作） |

---

## 4つの黄金原則

| 原則 | 説明 |
|------|------|
| **具体的であれ** | 抽象的な感情ではなく、目に見える動きを指示 |
| **物理的であれ** | 物理法則に沿った自然な動きを指示 |
| **シンプルであれ** | 主役を一つに絞り、動きを単純化 |
| **カメラマンであれ** | カメラワークとライティングで演出 |

---

## プロンプト構造

```
[被写体の動き] + [カメラの動き] + [表情・感情] + [スタイル/ライティング]
```

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Preserve exact appearance from reference image. Same face, same hair, same clothing.
Use the source image as the foundation for the video.
Preserve the subject's identity, facial features, outfit, and pose.
Focus on natural, subtle movements that enhance the portrait quality.

CLIP SPECIFIC (edit only this block):
Scene: Inherit from reference image (do not describe - use image as-is)
Action: [SIMPLE MOTION ONLY - what moves and how] (appearance inherited from input image)
Micro-expression: [EMOTION + SUBTLE FACIAL MOVEMENT]
Camera: [CAMERA MOVEMENT + FRAMING]
Must include: [NATURAL MOTION: hair, fabric, blink, breath]
Skin texture enhancement: Enhance micro-texture of the skin and maintain realistic skin grain. Preserve visible pores and natural skin tones from the original image to avoid any artificial smoothing.
Quality enhancement: Cinematic quality, smooth motion, photorealistic details, professional cinematography, film grain, shallow depth of field.
Final note: Prioritize natural skin tones, avoid face distortion, subtle motion only.

---

## NEGATIVE PROMPT
warped faces, distorted features, unnatural skin, extra fingers, deformed hands, extreme expressions, robotic movement, plastic skin texture, readable text, logos, extreme bloom, crushed blacks

---

## 成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 歩く・走る | 80-90% | 低 |
| 手を上げる・振る | 85-95% | 低 |
| 振り返る | 80-90% | 低 |
| 笑う・泣く | 70-80% | 中 |
| 複数人の相互作用 | 60-70% | 中 |
| 細かい手指の動き | 40-60% | 高 |

---

## カメラワーク早見表

| カメラワーク | 説明 | プロンプト例 |
|--------------|------|-------------|
| 固定 | 動かない | `Locked camera` |
| 手持ち | 微妙な揺れ | `Handheld camera follows` |
| パン | 左右に振る | `Camera pans from left to right` |
| ドリー | 前後に移動 | `Camera slowly dollies in` |
| 周回 | 被写体の周りを回る | `Camera orbits around the subject` |
| ズーム | 拡大・縮小 | `Camera slowly zooms in` |

---

## 動きキーワード

| 英語 | 日本語 | 用途 |
|------|--------|------|
| raises her hand | 手を上げる | 挙手、強調 |
| walks forward | 前に歩く | 移動、進行 |
| looks around | あたりを見回す | 探索、確認 |
| turns slowly | ゆっくりと振り向く | 振り返り、反応 |
| smiles warmly | 暖かく微笑む | 感情表現 |
| nods slowly | ゆっくり頷く | 同意、聞いている |
| tilts head slightly | 少し首を傾げる | 疑問、関心 |
| blinks naturally | 自然にまばたき | リアリティ |

---

## 実例集

### 例1：女性ポートレート（ゴールデンアワー）

CLIP SPECIFIC:
Scene: Golden hour rooftop, city skyline soft-focus behind, warm breeze
Subject: Elegant pose, hair catching wind
Micro-expression: Serene confidence, subtle smile forming, eyes catching light
Camera: Camera slowly dollies in, medium close-up framing
Lighting: Backlit golden sun, warm rim light on hair and shoulders, soft fill on face
Must include: Hair and fabric flowing gently, natural blink, subtle expression change
Skin texture enhancement: Enhance micro-texture of the skin and maintain realistic skin grain. Preserve visible pores and natural skin tones from the original image to avoid any artificial smoothing.
Final note: Capture the magic hour glow, emphasize natural beauty, avoid unnatural movements

### 例2：男性ポートレート（スタジオ）

CLIP SPECIFIC:
Scene: Minimalist studio, soft diffused lighting, clean background
Subject: Confident stance, direct gaze at camera
Micro-expression: Calm intensity, slight eyebrow raise, professional demeanor
Camera: Locked camera, head and shoulders framing
Lighting: Soft key light from 45 degrees, subtle rim light, even skin tone
Must include: Subtle head movement, natural breathing motion, eye contact maintained
Skin texture enhancement: Enhance micro-texture of the skin and maintain realistic skin grain. Preserve visible pores and natural skin tones from the original image to avoid any artificial smoothing.
Final note: Professional look, sharp focus on eyes, minimal but purposeful movement

### 例3：振り返りシーン

CLIP SPECIFIC:
Scene: Soft natural environment, gentle ambient light
Subject: Natural relaxed pose, turning head slowly
Micro-expression: Curiosity shifting to recognition, gentle smile forming
Camera: Camera remains static, medium shot framing
Lighting: Natural soft light, balanced shadows
Must include: Slow deliberate head turn, natural eye movement, subtle expression shift
Skin texture enhancement: Enhance micro-texture of the skin and maintain realistic skin grain. Preserve visible pores and natural skin tones from the original image to avoid any artificial smoothing.
Final note: Smooth natural movement, maintain identity consistency, cinematic feel

---

## 失敗パターンと修正法

### ❌ 抽象的・曖昧な指示
| 失敗 | `A woman thinks about her future with mixed emotions` |
|------|------|
| 原因 | 「将来について考える」は映像にできない |
| 修正 | `A woman looks up thoughtfully, a slight smile appears and then fades. Locked camera.` |

### ❌ 否定的・受動的な命令
| 失敗 | `A man doesn't move and doesn't smile` |
|------|------|
| 原因 | AIは否定命令を無視しやすい |
| 修正 | `A man remains still with a neutral expression. Locked camera.` |

### ❌ 入力画像との矛盾
| 失敗 | 座っている画像で `The woman suddenly jumps up and runs` |
|------|------|
| 原因 | 中間動作が省略されすぎ |
| 修正 | `The woman slowly stands up from the chair, then turns and walks away.` |

### ❌ 複雑すぎる身体の動き
| 失敗 | `A person plays a complex melody on the piano with fingers moving accurately` |
|------|------|
| 原因 | 指一本一本の正確な制御は不可能 |
| 修正 | `A person sits at a piano, their hands moving gently over the keys. Camera slowly zooms in.` |

---

## チェックリスト

- [ ] プロンプトは肯定形で書かれているか
- [ ] 動きは具体的で物理的に可能か
- [ ] 入力画像から自然に続く動きか
- [ ] 主役（被写体）は一つに絞られているか
- [ ] カメラワークは明確に指定されているか
- [ ] 15〜30単語に収まっているか
