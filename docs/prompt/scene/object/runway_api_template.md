# Runway Gen-4 シーンプロンプトテンプレート（物体・プロダクト）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の物体/料理/商品画像（SOURCE） |
| 出力 | 5〜10秒の物体動画 |
| 推奨語数 | 10〜25単語 |
| 成功率目安 | 85〜95%（回転・ズーム系） |

---

## 4つの黄金原則

| 原則 | 説明 |
|------|------|
| **具体的であれ** | 抽象的な効果ではなく、目に見える動きを指示 |
| **物理的であれ** | 物理法則に沿った自然な動きを指示 |
| **シンプルであれ** | 主役を一つに絞り、動きを単純化 |
| **カメラマンであれ** | カメラワークとライティングで演出 |

---

## プロンプト構造

```
[オブジェクトの動き] + [カメラの動き] + [環境エフェクト] + [スタイル]
```

---

## TEXT PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Preserve exact appearance from reference image. Same colors, same textures, same details.
Use the source image as the foundation for the video.
Preserve the object's texture, color accuracy, and key visual details.
Focus on movements that enhance the product appeal.

CLIP SPECIFIC (edit only this block):
Scene: Inherit from reference image (do not describe - use image as-is)
Action: [SIMPLE MOTION ONLY - rotation, floating, light shift] (object details inherited from input image)
Texture focus: Preserve original texture from reference image
Camera: [CAMERA MOVEMENT + ANGLE + FRAMING]
Motion focus: [STEAM/REFLECTION + LIGHT SHIFT + SUBTLE ROTATION]
Motion & texture: Maintain the intricate texture and visible details from the original image. Enhance the micro-texture of the material to avoid any smoothing. Subtle lighting shift to highlight the texture.
Quality enhancement: Cinematic quality, smooth motion, photorealistic details, professional cinematography, film grain, shallow depth of field.
Final note: Emphasize texture and premium quality, smooth controlled motion.

---

## NEGATIVE PROMPT
blurry texture, color shift, unnatural reflections, distorted shapes, readable text, logos, fingerprints, dust particles, extreme bloom, crushed blacks, overexposed highlights

---

## 成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 回転 | 85-95% | 低 |
| 浮遊・上下移動 | 80-90% | 低 |
| ズーム・パン | 85-95% | 低 |
| 単純な移動（lift） | 70-80% | 中 |
| 物を入れる・配置 | 85-95% | 低 |
| 箱を開ける・閉じる | 25-50% | 高 |
| 複雑なエフェクト（燃焼等） | 30-50% | 高 |
| テキスト生成 | 5-15% | 非常に高 |

---

## カメラと被写体の関係性

| パターン | 効果 | 用途 |
|----------|------|------|
| 固定カメラ + 回転する被写体 | 被写体の全体像を見せる | 商品紹介 |
| 移動カメラ + 静止する被写体 | ドラマティックな効果 | 高級品紹介 |
| 移動カメラ + 移動する被写体 | ダイナミックな演出 | 複雑だが高度な効果 |

---

## カメラワーク早見表

| カメラワーク | 説明 | プロンプト例 |
|--------------|------|-------------|
| 固定 | 動かない | `Locked camera` |
| パン | 左右に振る | `Camera pans from left to right` |
| ドリー | 前後に移動 | `Camera slowly pushes in` |
| 周回 | 被写体の周りを回る | `Camera orbits around the object` |
| ズーム | 拡大・縮小 | `Camera slowly zooms in` |
| ティルト | 上下に振る | `Camera tilts down to reveal` |

---

## 動きキーワード

| 動きの種類 | 説明 | プロンプト例 |
|------------|------|-------------|
| 回転 (Rotation) | 360度回転 | `The product rotates slowly` |
| 浮遊 (Floating) | 上下に動く | `The object floats gently up and down` |
| 傾き (Tilt) | 傾く | `The object tilts left and right` |
| スライド (Sliding) | 横方向に動く | `The product slides across the frame` |

---

## ライティング・エフェクト

| エフェクト | プロンプト例 | 効果 |
|------------|-------------|------|
| ゴールデンアワー | `Golden light sweeps across surface` | 暖かい雰囲気 |
| リムライト | `Rim light highlights the edges` | 輪郭強調 |
| ドラマチック | `Dramatic spotlight illuminates` | 高級感 |
| 自然光 | `Soft natural light from side` | ナチュラル |

---

## 実例集

### 例1：料理（ラテアート）

CLIP SPECIFIC:
Scene: Cozy cafe table, soft afternoon light through window, steam rising gently
Subject: Centered on table, cup handle facing right
Texture focus: Creamy foam texture, glossy coffee surface, warm cup glaze
Camera: Camera slowly pushes in from overhead to 45-degree angle
Lighting: Natural window light from left, subtle fill from ambient, steam catching light
Motion focus: Steam rising elegantly, subtle foam movement, light shifting across surface
Motion & texture: The object remains stationary. Maintain the intricate leather grain and visible pores from the original image. Enhance the micro-texture of the material to avoid any smoothing. Subtle lighting shift to highlight the texture.
Final note: Emphasize warmth and craftsmanship, keep motion minimal and elegant

### 例2：高級腕時計

CLIP SPECIFIC:
Scene: Minimalist studio backdrop, product photography setup, clean surface
Subject: On display stand, angled 30 degrees toward camera
Texture focus: Brushed metal texture, polished surfaces, leather strap grain
Camera: Camera slowly orbits around the object at constant speed
Lighting: Soft key light with controlled highlights, rim light on metal edges
Motion focus: Subtle rotation, light catching metal surfaces, reflection shifts
Motion & texture: The object remains stationary. Maintain the intricate leather grain and visible pores from the original image. Enhance the micro-texture of the material to avoid any smoothing. Subtle lighting shift to highlight the texture.
Final note: Premium product feel, sharp details, smooth controlled movement

### 例3：和食（ラーメン）

CLIP SPECIFIC:
Scene: Traditional Japanese setting, natural wood table, morning light
Subject: Centered on wooden table, steam rising
Texture focus: Glossy broth surface, noodle texture, egg yolk richness
Camera: Camera slowly dollies toward the bowl from 45-degree overhead
Lighting: Soft natural light from side, steam dramatically backlit
Motion focus: Steam rising, broth surface rippling, chopsticks lifting noodles
Motion & texture: The object remains stationary. Maintain the intricate leather grain and visible pores from the original image. Enhance the micro-texture of the material to avoid any smoothing. Subtle lighting shift to highlight the texture.
Final note: Appetizing warmth, emphasize freshness and steam, natural colors

### 例4：商品（ヘッドフォン）

CLIP SPECIFIC:
Scene: Dark gradient studio backdrop, controlled lighting, minimalist display
Subject: On display stand, facing camera at slight angle
Texture focus: Smooth matte surface, leather grain detail, metal accents
Camera: Camera slowly orbits revealing different angles
Lighting: Soft key light with subtle rim highlight on curves
Motion focus: Subtle rotation, light catching surfaces, shadow play
Motion & texture: The object remains stationary. Maintain the intricate leather grain and visible pores from the original image. Enhance the micro-texture of the material to avoid any smoothing. Subtle lighting shift to highlight the texture.
Final note: Luxury product feel, sharp focus on materials, controlled smooth movement

### 例5：飲み物（カクテル）

CLIP SPECIFIC:
Scene: Bar counter, moody ambient lighting, ice cubes visible
Subject: Centered on bar counter, condensation forming
Texture focus: Crystal glass facets, liquid clarity, ice texture, condensation droplets
Camera: Camera slowly pushes in with subtle arc
Lighting: Backlit for liquid glow, side light on glass texture, rim light on garnish
Motion focus: Ice shifting, condensation dripping, liquid movement, light refracting
Motion & texture: The object remains stationary. Maintain the intricate leather grain and visible pores from the original image. Enhance the micro-texture of the material to avoid any smoothing. Subtle lighting shift to highlight the texture.
Final note: Sophisticated bar atmosphere, emphasize craftsmanship and freshness

---

## 失敗パターンと修正法

### ❌ オブジェクトの自己生成
| 失敗 | `A coffee cup sits on a table, and steam magically appears` |
|------|------|
| 原因 | 存在しない要素の生成は困難 |
| 修正 | `A coffee cup sits on a table. Camera slowly zooms in. Soft morning light sweeps across.` |

### ❌ オブジェクトへの能動的な動作
| 失敗 | `A treasure chest opens by itself` |
|------|------|
| 原因 | 「ひとりでに」は動きの主体が不明確 |
| 修正 | `Camera slowly pushes in towards a closed treasure chest. Dramatic light shines on it.` |

### ❌ 複数オブジェクトの相互作用
| 失敗 | `A red ball rolls and collides with a blue ball` |
|------|------|
| 原因 | 物理演算の正確なシミュレーションは困難 |
| 修正 | `A red ball rolls across the screen from left to right. Camera pans to follow.` |

### ❌ テキストの生成
| 失敗 | `The words "SALE" appear in fiery letters on the box` |
|------|------|
| 原因 | AIは正確なスペルやフォントを生成できない |
| 修正 | `A black box rotates slowly. A dramatic spotlight illuminates the front.` |

---

## チェックリスト

- [ ] プロンプトは肯定形で書かれているか
- [ ] 動きは具体的で物理的に可能か
- [ ] テキスト生成の指示を含んでいないか
- [ ] 主役（被写体）は一つに絞られているか
- [ ] カメラワークは明確に指定されているか
- [ ] 10〜25単語に収まっているか
- [ ] ライティング/エフェクトは適切か
