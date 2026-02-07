# HailuoAI (MiniMax) シーンプロンプトテンプレート（物体・プロダクト）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の物体/プロダクト画像（First Frame） |
| 出力 | 6秒または10秒の動画 |
| 推奨語数 | 10〜40単語（最大2000文字） |
| 成功率目安 | 90〜95%（シンプルな動き） |
| 推奨モデル | MiniMax-Hailuo-02 |
| 特徴 | カメラコマンド `[command]` 構文 |

---

## 重要原則：画像優先

```
⚠️ 画像にある情報はプロンプトに書かない

❌ 書いてはいけない:
- 物体の外見（形状、色、テクスチャ）
- 背景・セットアップの詳細
- 照明・ライティングの詳細
- 素材・質感の説明

✅ 書くべきこと:
- カメラコマンド [command] を最初に
- 動き（回転、光の変化、蒸気等）
- 自然な動き要素（反射、揺らぎ）
- 品質キーワード
```

---

## TEXT PROMPT（コピペ用テンプレ）

```
[CAMERA_COMMAND]

Action: [SIMPLE MOTION - e.g., rotates slowly, steam rises, light shifts]
Natural motion: [reflections shift, surface glistens, subtle movement]

Cinematic quality, smooth motion.
```

**使用例:**

```
[Truck left, Pan right]

Action: product rotates slowly, light catches surface
Natural motion: reflections shift smoothly, surface glistens

Cinematic quality, smooth motion.
```

---

## カメラコマンド早見表

| カメラワーク | コマンド構文 | 用途 |
|--------------|-------------|------|
| 固定 | `[Static shot]` | 安定した撮影 |
| プッシュイン | `[Push in]` | 接近・詳細表示 |
| プルアウト | `[Pull out]` | 全体像・離れる |
| オービット | `[Truck left, Pan right]` | 商品回り込み |
| 逆オービット | `[Truck right, Pan left]` | 逆方向回り込み |
| ズームイン | `[Zoom in]` | 詳細ズーム |
| トップダウン | `[Pedestal up, Tilt down]` | 俯瞰ショット |

---

## 成功率一覧

| アクション | 成功率 | 推奨カメラ |
|------------|--------|-----------|
| 回転 | 90-95% | `[Truck left, Pan right]` |
| カメラ接近 | 90-95% | `[Push in]` |
| カメラ離れ | 90-95% | `[Pull out]` |
| 湯気・煙 | 80-90% | `[Static shot]` |
| 水滴・液体 | 75-85% | `[Static shot]` |
| 光の反射変化 | 85-90% | オービット系 |

---

## カテゴリ別プロンプト例

### 食品・料理

```
[Static shot]

Action: steam rises elegantly from hot surface
Natural motion: steam catches light, surface glistens

Cinematic quality, smooth motion.
```

### 飲料

```
[Push in]

Action: condensation forms on cold glass, bubbles rise
Natural motion: liquid surface moves subtly

Cinematic quality, smooth motion.
```

### ガジェット・テック製品

```
[Truck left, Pan right]

Action: device rotates slowly, screen illuminates
Natural motion: light reflects off surfaces smoothly

Cinematic quality, smooth motion.
```

### 化粧品・コスメ

```
[Push in, Tilt down]

Action: product rotates, texture catches light
Natural motion: reflections shift gracefully

Premium quality, smooth motion.
```

### ジュエリー・アクセサリー

```
[Zoom in]

Action: jewelry sparkles as light shifts
Natural motion: facets catch light, subtle gleam

Luxurious quality, smooth motion.
```

### 家具・インテリア

```
[Pull out]

Action: camera reveals full product from detail
Natural motion: ambient light shifts naturally

Cinematic quality, smooth motion.
```

---

## 実例集

### 例1：商品回転（360度風）

```
[Truck left, Pan right]

Action: product rotates slowly revealing all angles
Natural motion: light catches different surfaces, reflections shift

Cinematic quality, smooth motion.
```

### 例2：料理のシズル感

```
[Static shot]

Action: steam rises from hot dish
Natural motion: steam curls and catches light, surface glistens

Appetizing quality, smooth motion.
```

### 例3：接近ショット

```
[Push in, Zoom in]

Action: camera approaches product detail
Natural motion: textures become visible, light reveals surface

Premium quality, smooth motion.
```

### 例4：全体像から詳細へ

```
[Push in]

Action: camera moves from overview to detail
Natural motion: depth of focus shifts naturally

Cinematic quality, smooth motion.
```

---

## 失敗パターンと修正法

### ❌ 外見を記述してしまう
| 失敗 | `A beautiful red bottle with golden cap` |
|------|------|
| 修正 | `[Truck left, Pan right] rotates slowly, light catches surface` |

### ❌ 背景を記述してしまう
| 失敗 | `On a white studio background with soft lighting` |
|------|------|
| 修正 | 背景は記述しない。動きとカメラのみ。 |

### ❌ 複雑な動きを指定
| 失敗 | `spins rapidly, explodes into particles, reforms` |
|------|------|
| 修正 | `[Truck left, Pan right] rotates slowly` |

---

## チェックリスト

- [ ] カメラコマンド `[command]` がプロンプト先頭にあるか
- [ ] 物体の外見（形、色）を記述していないか
- [ ] 背景を記述していないか
- [ ] 動作はシンプルか（回転、光変化等）
- [ ] 2000文字以内に収まっているか

---

*Last Updated: 2026-01*
