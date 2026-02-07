# DomoAI シーンプロンプトテンプレート（物体・プロダクト）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の物体/料理/商品画像 |
| 出力 | 2〜6秒の物体動画 |
| 推奨語数 | 5〜15単語（動作・カメラのみ） |
| 成功率目安 | 85〜95%（回転・ズーム系） |
| 強み | テクスチャ保持、滑らかな回転、360度ビュー |

---

## Image-to-Video設計原則

> **重要**: 画像が既に物体の外見・色・質感・配置を定義しているため、プロンプトでは**動作・カメラワーク・ライティング演出**のみに集中します。

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| 商品の外見・デザイン | 回転・浮遊などの動き |
| 色・テクスチャ・質感 | カメラワーク |
| 背景・環境設定 | ライティングの動き |
| 配置・構図 | 品質向上キーワード |

---

## プロンプト構造（推奨順序）

```
[OBJECT MOTION] + [MOTION QUALITY] + [CAMERA DIRECTION] + [LIGHTING EFFECT]
```

**テンプレート:**
```
[物体の動作]
Smooth controlled motion, premium quality.
[カメラワーク]
[ライティング効果（オプション）]
```

---

## TEXT PROMPT（コピペ用）

### 基本テンプレート
```
[MOTION: rotation/floating/etc]
Smooth premium motion, product showcase quality.
[CAMERA: static/orbit/zoom]
Consistent lighting, clean presentation.
```

---

## 動作キーワード辞典

### 回転系（最高成功率）
| 動作 | キーワード | 成功率 | 用途 |
|------|-----------|--------|------|
| ゆっくり回転 | `slowly rotating` | 95% | 商品紹介 |
| 360度回転 | `360 degree rotation` | 90% | 全角度紹介 |
| 傾きながら回転 | `tilting while rotating` | 85% | ダイナミック |

### 浮遊系
| 動作 | キーワード | 成功率 | 用途 |
|------|-----------|--------|------|
| ゆっくり浮遊 | `gently floating` | 90% | 高級感 |
| 上下に動く | `floating up and down` | 85% | リズム感 |
| ホバリング | `hovering in place` | 90% | 安定した演出 |

### 環境エフェクト系
| エフェクト | キーワード | 成功率 |
|------------|-----------|--------|
| 湯気 | `steam rising gently` | 80% |
| 水滴 | `condensation forming` | 75% |
| 光の反射 | `light reflecting, shifting` | 85% |
| 影の動き | `shadow play, light sweep` | 85% |

---

## カメラワーク辞典

| カメラワーク | プロンプト | 効果 | 推奨度 |
|-------------|-----------|------|--------|
| 固定 | `static camera` | 安定、失敗率低 | ★★★ |
| オービット | `camera orbiting around` | 全角度紹介 | ★★★ |
| ズームイン | `slow zoom in` | ディテール強調 | ★★★ |
| ズームアウト | `slow zoom out` | 全体像 | ★★☆ |
| プッシュイン | `slow push in` | ドラマチック | ★★☆ |
| 上から | `overhead shot, looking down` | 料理向け | ★★★ |

> **安定性ハック**: 被写体を回転させる場合はカメラを固定（`static camera`）、カメラを動かす場合は被写体を静止させる。両方を同時に動かすと失敗率が上がります。

---

## ライティング演出（ゴールデンアワー・プロトコル）

DomoAIでの最大の失敗点は**ライティングのフリッカー（点滅）**。これを防ぐプロトコル：

| キーワード | 効果 | 使用場面 |
|-----------|------|----------|
| `consistent lighting` | 照明の一貫性維持 | 全般（必須級） |
| `studio lighting` | スタジオ風安定光 | 商品撮影 |
| `golden hour` | 暖色系統一 | 食品・暖かい雰囲気 |
| `soft natural light` | 柔らかい自然光 | 自然な印象 |
| `light sweeping across` | 光が動く演出 | ドラマチック |

---

## 品質向上ブースター（Magic Words）

**プロダクト・商品向け:**
```
premium product showcase, smooth controlled motion,
professional quality, clean presentation
```

**料理・フード向け:**
```
appetizing presentation, fresh quality,
warm inviting atmosphere, steam rising gently
```

**高級品向け:**
```
luxury presentation, sophisticated motion,
elegant showcase, premium craftsmanship
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
morphing, flickering, unnatural movement
```

### 物体専用追加
```
color shift, texture loss, shape distortion,
fingerprints, dust, scratches, wobbly motion,
sudden lighting changes, unnatural reflections
```

### 幾何学保存クラスター（360度回転用）
```
edge misalignment, scale change, texture interpolation error,
background noise, symmetrical repetition
```

> **幾何学保存ハック**: 360度回転で形状が崩れる場合、「ベゼルの位置がずれないように、正確に補間」という日本語プロンプトも有効な場合があります。

---

## 実例とサンプルプロンプト

### 例1：高級腕時計

**プロンプト:**
```
Slowly rotating to show all angles.
Premium product showcase, smooth controlled motion.
Static camera, consistent studio lighting.
Light catching metal surfaces elegantly.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
color shift, fingerprints, wobbly motion, flickering
```

### 例2：料理（ラーメン）

**プロンプト:**
```
Steam rising gently from the bowl.
Appetizing presentation, warm atmosphere.
Slow zoom in from overhead, golden hour lighting.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, flickering,
color shift, unnatural steam, sudden lighting change
```

### 例3：カクテル

**プロンプト:**
```
Ice shifting slowly, condensation forming.
Refreshing presentation, light refracting through glass.
Slow push in, moody bar lighting.
```

### 例4：スキンケア製品

**プロンプト:**
```
Slowly rotating on display.
Clean luxury presentation, premium quality.
Camera orbiting around product, soft studio lighting.
```

### 例5：ヘッドフォン

**プロンプト:**
```
Subtle rotation revealing details.
Premium tech showcase, sophisticated motion.
Slow orbit camera, dramatic lighting with rim highlight.
```

### 例6：360度プロダクトショーケース

**プロンプト:**
```
360 degree rotation, preserving scale and edges.
Product showcase style, clean presentation.
Static camera, white background studio, no noise.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | 商品紹介に十分 |
| model | `animate-2.4-advanced` | 高級品・最終レンダリング |
| seconds | 3-5 | 回転に十分な尺 |
| aspect_ratio | `16:9` / `1:1` | 用途に合わせて |

**コスト最適化ワークフロー:**
1. `faster` モデルで動きを確認
2. 問題なければ `advanced` で最終レンダリング

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| ライティングが点滅 | プロンプトに `consistent lighting` 追加 |
| 形状が崩れる | カメラを `static camera` に固定 |
| 色が変わる | ネガティブに `color shift` 追加 |
| テクスチャが失われる | プロンプトに `preserving texture` 追加 |
| 回転がぎこちない | `slowly rotating, smooth motion` で速度調整 |
| 背景がタイル化 | ネガティブに `symmetrical repetition, tiling` 追加 |

---

## 成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| ゆっくり回転 | 90-95% | 低 |
| 浮遊・上下移動 | 85-90% | 低 |
| カメラオービット | 85-95% | 低 |
| ズーム・プッシュイン | 85-95% | 低 |
| 360度回転 | 80-90% | 中 |
| 湯気・蒸気 | 75-85% | 中 |
| 水滴・結露 | 70-80% | 中 |
| 液体の動き | 65-75% | 高 |
| テキスト生成 | 5-15% | 非常に高（避ける） |

---

## カテゴリ別チートシート

### 時計・ジュエリー
```
Slowly rotating, light catching surfaces.
Luxury showcase, consistent studio lighting.
Camera orbiting, premium quality.
```

### 料理・フード
```
Steam rising gently, appetizing presentation.
Warm golden hour atmosphere.
Slow zoom in from overhead.
```

### 飲み物
```
Ice shifting slowly, condensation forming.
Refreshing presentation, light refracting.
Moody bar lighting, slow push in.
```

### テック製品
```
Subtle rotation revealing details.
Premium tech showcase.
Dramatic lighting with rim highlight.
```

### コスメ・美容
```
Elegant rotation on display.
Clean luxury presentation.
Soft studio lighting, camera orbit.
```

---

## プロダクションワークフロー

```
1. 高品質な商品画像を準備（背景は単色推奨）
2. 動作を1種類に絞る（回転 OR 浮遊 OR ズーム）
3. カメラも1種類に絞る（動く場合は被写体を静止）
4. faster モデルで3秒テスト生成
5. 問題なければ advanced で本番生成
6. ループ用途なら2-3秒で生成
```

---

*最終更新: 2026年1月3日*
