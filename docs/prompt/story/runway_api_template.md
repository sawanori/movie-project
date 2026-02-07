# Runway Gen-4 ストーリー動画プロンプトテンプレート（連続クリップ用）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 参照画像（A=MASTER + B=PREVIOUS） |
| 出力 | 5〜10秒の連続動画クリップ |
| 推奨語数 | 15〜30単語 |
| 目的 | 結合前提で **同一人物・同一ロケ・同一ルック** を維持（連続性最優先） |

---

## 4つの黄金原則

| 原則 | 説明 |
|------|------|
| **具体的であれ** | 抽象的な感情ではなく、目に見える動きを指示 |
| **物理的であれ** | 物理法則に沿った自然な動きを指示 |
| **シンプルであれ** | 主役を一つに絞り、動きを単純化 |
| **カメラマンであれ** | カメラワークとライティングで演出 |

---

## 参照画像の使い方

| 画像 | 役割 | 説明 |
|------|------|------|
| **Image A** | MASTER | 人物同一性 / 服装 / 世界観の基準 |
| **Image B** | PREVIOUS | 直前クリップからの連続性 / 小物配置 / レイアウト |

- **Clip 1**: Image A のみ使用
- **Clip 2以降**: Image A（MASTER）+ Image B（直前クリップ最終フレーム）

---

## プロンプト構造

```
[被写体の動き] + [カメラの動き] + [表情・感情] + [スタイル/ライティング]
```

---

## TEXT PROMPT（人物用・デフォルト）

REFERENCE RULE (do not remove):
Preserve exact appearance from reference image. Same face, same hair, same clothing.
Use Image A as MASTER for identity, wardrobe, and world design.
Use Image B as PREVIOUS for continuity: exact outfit details, props, and layout.
Keep the same person and same environment as a continuous scene.

CLIP SPECIFIC (edit only this block):
Scene: Inherit from reference image (do not describe - use image as-is)
Action: [SIMPLE MOTION ONLY - what moves and how] (appearance inherited from input image)
Micro-expression: [EMOTION + SUBTLE FACIAL MOVEMENT]
Camera: [CAMERA MOVEMENT + FRAMING]
Must include: [NATURAL MOTION: hair, fabric, blink, breath]
Quality enhancement: Cinematic quality, smooth motion, photorealistic details, professional cinematography, film grain, shallow depth of field.
Final note: Minimal motion, continuity over novelty, keep realism.

---

## NEGATIVE PROMPT（人物用）

warped faces, distorted features, unnatural skin, extra fingers, deformed hands, extreme expressions, robotic movement, plastic skin texture, readable text, logos, extreme bloom, crushed blacks, cartoon look, CGI look

---

## 物体・プロダクト用テンプレート（代替）

物体・製品撮影の場合は以下のテンプレートを使用：

REFERENCE RULE (do not remove):
Preserve exact appearance from reference image. Same colors, same textures, same details.
Use Image A as MASTER for product appearance, color, and texture.
Use Image B as PREVIOUS for continuity: lighting setup, background, arrangement.
Maintain consistent product presentation across clips.

CLIP SPECIFIC (edit only this block):
Scene: Inherit from reference image (do not describe - use image as-is)
Action: [SIMPLE MOTION ONLY - rotation, floating, light shift] (object details inherited from input image)
Texture focus: Preserve original texture from reference image
Camera: [CAMERA MOVEMENT + ANGLE + FRAMING]
Motion focus: [STEAM/REFLECTION + LIGHT SHIFT + SUBTLE ROTATION]
Quality enhancement: Cinematic quality, smooth motion, photorealistic details, professional cinematography, film grain, shallow depth of field.
Final note: Emphasize texture and premium quality, smooth controlled motion.

**NEGATIVE PROMPT（物体用）:**
blurry texture, color shift, unnatural reflections, distorted shapes, readable text, logos, fingerprints, dust particles, extreme bloom, crushed blacks, overexposed highlights

---

## 成功率一覧

### 人物アクション

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 歩く・走る | 80-90% | 低 |
| 手を上げる・振る | 85-95% | 低 |
| 振り返る | 80-90% | 低 |
| 笑う・泣く | 70-80% | 中 |
| 複数人の相互作用 | 60-70% | 中 |
| 細かい手指の動き | 40-60% | 高 |

### 物体アクション

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 回転 | 85-95% | 低 |
| 浮遊・上下移動 | 80-90% | 低 |
| ズーム・パン | 85-95% | 低 |
| 単純な移動（lift） | 70-80% | 中 |
| 箱を開ける・閉じる | 25-50% | 高 |
| 複雑なエフェクト（燃焼等） | 30-50% | 高 |

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

### 人物用

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

### 物体用

| 動きの種類 | 説明 | プロンプト例 |
|------------|------|-------------|
| 回転 (Rotation) | 360度回転 | `The product rotates slowly` |
| 浮遊 (Floating) | 上下に動く | `The object floats gently up and down` |
| 傾き (Tilt) | 傾く | `The object tilts left and right` |
| スライド (Sliding) | 横方向に動く | `The product slides across the frame` |

---

## 実例集

### 例1：人物ストーリー（駅ホーム・Clip 1）

**Image A のみ使用**

CLIP SPECIFIC:
Scene: Urban commuter platform, dawn 07:30, gentle mist, train exhaust drifting through sunbeam
Subject: Same person, standing with phone at side; looks down the tracks
Micro-expression: Calm anticipation, subtle stillness
Camera: 32mm spherical look, wide-medium, slow dolly left, shallow DOF
Lighting: Low sun from camera left; dim sodium platform lights
Must include: Yellow safety line, paper coffee cup on bench, silhouetted commuters
Final note: Controlled flare, no clipped highlights, preserve silhouette clarity

### 例2：人物ストーリー（駅ホーム・Clip 2）

**Image A (MASTER) + Image B (Clip 1最終フレーム)**

CLIP SPECIFIC:
Scene: Same platform, same dawn haze; train braking to a stop in background mist
Subject: Same person turns slightly toward camera; phone screen catches subtle reflection
Micro-expression: Eyes flick upward toward something unseen
Camera: 50mm spherical look, tighter over-shoulder, slow arc-in, shallow DOF, micro handheld
Lighting: Low sun from camera left; dim sodium platform lights
Must include: Continuous layout from previous shot, haze retention in blacks, train soft-focus in background
Final note: Smooth skin highlight roll-off, controlled flare only

### 例3：料理ストーリー（ラテアート・Clip 1）

**Image A のみ使用**

CLIP SPECIFIC:
Scene: Cozy cafe table, soft afternoon light through window, steam rising gently
Subject: Freshly prepared latte art, perfect rosetta pattern, ceramic cup
Texture focus: Creamy foam texture, glossy coffee surface, warm cup glaze
Camera: Camera slowly pushes in from overhead to 45-degree angle
Lighting: Natural window light from left, subtle fill from ambient, steam catching light
Motion focus: Steam rising elegantly, subtle foam movement, light shifting across surface
Final note: Emphasize warmth and craftsmanship, keep motion minimal and elegant

### 例4：商品ストーリー（腕時計・Clip 2）

**Image A (MASTER) + Image B (Clip 1最終フレーム)**

CLIP SPECIFIC:
Scene: Same minimalist studio backdrop, product photography setup continues
Subject: Luxury watch on display stand, metallic finish, glass crystal face
Texture focus: Brushed metal texture, polished surfaces, leather strap grain
Camera: Camera slowly orbits to reveal side profile at constant speed
Lighting: Soft key light with controlled highlights, rim light on metal edges (matching previous)
Motion focus: Subtle rotation, light catching metal surfaces, reflection shifts
Final note: Premium product feel, sharp details, smooth controlled movement, maintain lighting continuity

---

## 失敗パターンと修正法

### 人物編

#### ❌ 抽象的・曖昧な指示
| 失敗 | `A woman thinks about her future with mixed emotions` |
|------|------|
| 原因 | 「将来について考える」は映像にできない |
| 修正 | `A woman looks up thoughtfully, a slight smile appears and then fades. Locked camera.` |

#### ❌ 否定的・受動的な命令
| 失敗 | `A man doesn't move and doesn't smile` |
|------|------|
| 原因 | AIは否定命令を無視しやすい |
| 修正 | `A man remains still with a neutral expression. Locked camera.` |

#### ❌ 入力画像との矛盾
| 失敗 | 座っている画像で `The woman suddenly jumps up and runs` |
|------|------|
| 原因 | 中間動作が省略されすぎ |
| 修正 | `The woman slowly stands up from the chair, then turns and walks away.` |

#### ❌ 連続性の無視
| 失敗 | Clip 2で全く別の服装や場所を指定 |
|------|------|
| 原因 | Image Bからの連続性が無視される |
| 修正 | `Same traveler` `Same platform` など連続性を明示的に指定 |

### 物体編

#### ❌ オブジェクトの自己生成
| 失敗 | `A coffee cup sits on a table, and steam magically appears` |
|------|------|
| 原因 | 存在しない要素の生成は困難 |
| 修正 | `A coffee cup sits on a table. Camera slowly zooms in. Soft morning light sweeps across.` |

#### ❌ テキストの生成
| 失敗 | `The words "SALE" appear in fiery letters on the box` |
|------|------|
| 原因 | AIは正確なスペルやフォントを生成できない |
| 修正 | `A black box rotates slowly. A dramatic spotlight illuminates the front.` |

---

## 連続性チェックリスト

- [ ] REFERENCE RULEブロックは維持されているか
- [ ] Image A（MASTER）の参照は正しいか
- [ ] Clip 2以降でImage B（PREVIOUS）を参照しているか
- [ ] 「Same」キーワードで連続性を明示しているか（Same traveler, Same platform等）
- [ ] ライティング方向は前クリップと一致しているか
- [ ] カメラアングルは自然に続いているか
- [ ] 服装・小物の配置は一貫しているか

---

## プロンプト品質チェックリスト

- [ ] プロンプトは肯定形で書かれているか
- [ ] 動きは具体的で物理的に可能か
- [ ] 入力画像から自然に続く動きか
- [ ] 主役（被写体）は一つに絞られているか
- [ ] カメラワークは明確に指定されているか
- [ ] 15〜30単語に収まっているか

---

*Last Updated: 2026-01 (品質向上キーワード追加)*
