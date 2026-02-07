# Kling AI シーンプロンプトテンプレート（物体・プロダクト）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の物体/料理/商品画像（SOURCE） |
| 出力 | 5秒の物体動画 |
| 推奨語数 | 10〜25単語 |
| 成功率目安 | 85〜95%（回転・ズーム系） |
| 推奨モデル | Kling 2.6（標準）/ Kling 2.6 Pro（高品質） |

---

## 重要原則：画像優先

```
⚠️ 画像にある情報はプロンプトに書かない

❌ 書いてはいけない:
- 物体の外見（色、素材、テクスチャ、形状）
- 背景・シーンの詳細（テーブル、スタジオ、環境）
- 照明の詳細（画像から継承される）
- 商品名、ブランド、具体的な商品説明

✅ 書くべきこと:
- 動き（回転、浮遊、湯気が立つ等）
- カメラワーク（カメラがどう動くか）
- 自然な動き要素（湯気、光の反射変化、液体の揺れ）
```

---

## TEXT PROMPT（コピペ用テンプレ）

```
SINGLE IMAGE RULE (do not remove):
Preserve exact appearance and background from the source image.
Do not change colors, textures, or environment.

CLIP SPECIFIC (edit only this block):
Action: [SIMPLE MOTION - e.g., rotates slowly, steam rises, light shifts]
Camera: [CAMERA MOVEMENT - e.g., slow orbit, push-in, static]
Natural motion: [steam rising, reflections shifting, subtle movement]

Cinematic quality, smooth motion.
```

---

## NEGATIVE PROMPT

```
blurry texture, color shift, unnatural reflections, distorted shapes,
background change, new objects appearing, texture change, lighting change
```

---

## 成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 回転（ゆっくり） | 90-95% | 低 |
| 浮遊・上下移動 | 85-95% | 低 |
| カメラズーム・パン | 90-95% | 低 |
| 光の移動・反射変化 | 85-95% | 低 |
| 湯気・煙の動き | 80-90% | 低 |
| 液体の揺れ | 75-85% | 中 |
| 物を入れる・配置 | 70-80% | 中 |
| 箱を開ける・閉じる | 40-60% | 高 |

---

## カメラワーク早見表

| カメラワーク | プロンプト例 |
|--------------|-------------|
| 固定 | `static shot` |
| プッシュイン | `slow push-in` |
| プルアウト | `slow pull-out` |
| オービット | `camera orbits slowly` |
| ティルト | `camera tilts down` |
| オーバーヘッド | `overhead shot` |

---

## 動きキーワード

| 動き | プロンプト例 |
|------|-------------|
| 回転 | `rotates slowly` |
| 浮遊 | `floats gently` |
| 湯気 | `steam rises` |
| 光の移動 | `light sweeps across` |
| 反射変化 | `reflections shift` |
| 結露 | `condensation forms` |

---

## 実例集

### 例1：料理（湯気）

```
Action: steam rises elegantly
Camera: slow push-in
Natural motion: steam catches light, surface glistens

Cinematic quality, smooth motion.
```

### 例2：商品（回転）

```
Action: rotates slowly
Camera: slow orbit around
Natural motion: light catches surfaces, reflections shift

Cinematic quality, smooth motion.
```

### 例3：飲み物（氷の動き）

```
Action: ice shifts slightly
Camera: static shot
Natural motion: condensation forms, liquid settles

Cinematic quality, smooth motion.
```

### 例4：商品（ズームイン）

```
Action: remains still
Camera: slow push-in revealing details
Natural motion: subtle light play on surface

Cinematic quality, smooth motion.
```

---

## 失敗パターンと修正法

### ❌ 物体の外見を記述してしまう
| 失敗 | `A golden perfume bottle with crystal details rotates` |
|------|------|
| 原因 | 画像にある情報を重複記述→色や形が変わる可能性 |
| 修正 | `Rotates slowly. Camera orbits. Reflections shift.` |

### ❌ 背景を記述してしまう
| 失敗 | `On a marble table in soft studio light, the watch rotates` |
|------|------|
| 原因 | 背景を指定すると画像の背景と競合する |
| 修正 | `Rotates slowly. Static shot. Light catches surface.` |

### ❌ 複数の動きを同時に
| 失敗 | `The bottle spins, liquid swirls, and light flashes` |
|------|------|
| 原因 | 複数の動きが干渉して不自然に |
| 修正 | `Rotates slowly. Light sweeps across surface.` |

---

## チェックリスト

- [ ] 物体の外見（色、素材、形）を記述していないか
- [ ] 背景・シーンを記述していないか
- [ ] 動きは1つに絞られているか
- [ ] カメラワークは明確に指定されているか
- [ ] 10〜25単語に収まっているか

---

*Last Updated: 2026-01*
