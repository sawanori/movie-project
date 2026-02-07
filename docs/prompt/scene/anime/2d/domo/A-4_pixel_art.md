# [A-4] Pixel Art Animation - ピクセルアート風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI の `pixel` スタイルを活用したレトロゲーム風ピクセルアート動画。ドット絵の質感と限られた色数による独特の美しさが特徴。

> **Image-to-Video設計原則**: ピクセルアートの「限られたフレーム数」「ドット単位の動き」を再現。スプライトアニメーション風の動きに特化し、滑らかすぎる動きを避ける。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| ピクセルアートスタイル | アニメーションタイプ |
| キャラクターデザイン | ゲーム風の動きパターン |
| 色パレット | フレーム感（sprite-like） |
| 解像度感 | カメラ（基本固定） |

---

## TEXT PROMPT 構造（推奨順序）

```
[GAME-LIKE MOTION] + [SPRITE ANIMATION QUALITY] + [STATIC CAMERA]
```

**テンプレート:**
```
[ゲーム風の動作の説明]
Retro game sprite animation, limited frame feel.
Static camera.
```

---

## 動作キーワード（ピクセルアート向け）

### ゲームアニメーション基本
| 動作 | キーワード | 用途 |
|------|-----------|------|
| アイドル | `idle animation, subtle breathing` | 待機画面 |
| 歩行 | `walking cycle, bouncy steps` | 移動表現 |
| 走行 | `running animation, sprite movement` | 高速移動 |
| ジャンプ | `jump motion, arcade style` | プラットフォーマー |

### 戦闘・アクション
| 動作 | キーワード |
|------|-----------|
| 攻撃 | `attack animation, weapon swing` |
| 魔法 | `casting animation, spell effect` |
| 被ダメージ | `hit reaction, knockback motion` |
| 勝利 | `victory pose animation` |

### RPG風
| 動作 | キーワード |
|------|-----------|
| 会話 | `talking animation, simple gesture` |
| リアクション | `surprise reaction, exclamation` |
| アイテム取得 | `item pickup motion, celebration` |

---

## カメラワーク指定

| カメラワーク | プロンプト | 推奨度 |
|-------------|-----------|--------|
| 完全固定 | `static camera, no movement` | 最推奨 |
| サイドビュー | `side view, static` | ゲーム風 |
| 正面固定 | `front view, static` | RPG風 |

> **ピクセルアート維持ハック**: カメラは必ず `static` に。動かすとピクセルの整列が崩れる。

---

## 品質向上ブースター（Magic Words）

**ピクセルアート専用:**
```
retro game animation, sprite-like motion, limited frames feel
```

**ゲームらしさ強調:**
```
arcade style animation, 16-bit aesthetic, classic game feel
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, morphing
```

### ピクセルアート専用追加（重要）
```
smooth gradients, anti-aliasing, high resolution, 4K quality,
realistic, photorealistic, complex detailed animation,
smooth fluid motion, interpolated frames
```

> **重要**: `smooth` や `fluid` をネガティブに入れることで、ピクセルらしい「カクカク」した動きを維持。

---

## 実例とサンプルプロンプト

### サンプル1：アイドルアニメーション

**プロンプト:**
```
Idle breathing animation, subtle body sway.
Retro game sprite feel, limited frames.
Static camera, no movement.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), smooth gradients, anti-aliasing,
smooth fluid motion, 4K, photorealistic
```

### サンプル2：歩行サイクル

**プロンプト:**
```
Walking in place, bouncy sprite steps.
Classic game walking animation.
Side view, static camera.
```

### サンプル3：攻撃モーション

**プロンプト:**
```
Attack motion with weapon swing.
Retro game action animation, impact frames.
Static camera, side view.
```

### サンプル4：勝利ポーズ

**プロンプト:**
```
Victory celebration pose, fist pump.
Arcade game victory animation style.
Static front view.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | ピクセルアートには十分 |
| seconds | 2-3 | ループ向け短尺 |
| aspect_ratio | `1:1` / `16:9` | ゲーム画面風 |

**ループ動画のコツ:**
- 2-3秒で生成してシームレスループを確認
- アイドルモーションは2秒で十分

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 滑らかすぎる | ネガティブに `smooth, fluid, interpolated` 追加 |
| ピクセルが崩れる | カメラを完全固定（`static, no movement`） |
| 高解像度になる | ネガティブに `high resolution, 4K, HD` 追加 |
| アンチエイリアスがかかる | ネガティブに `anti-aliasing, smooth edges` 追加 |

---

## ピクセルアート特有の表現テクニック

### 限られたフレーム感
```
Limited frame animation, sprite sheet feel.
Classic 8-frame animation style.
```

### スプライト風動き
```
Sprite animation, discrete frame motion.
Retro game character movement.
```

### ループ可能アニメーション
```
Seamless loop animation, repeating motion.
Idle cycle, walking cycle.
```

---

## 適した用途

- ゲームアセット風動画
- SNSアイコン用GIF風
- レトロゲームオマージュ
- インディーゲームPV
- ドット絵NFTアニメーション
- 配信用待機画面（ループ）

---

## ゲームジャンル別プロンプト例

### アクションゲーム風
```
Dynamic attack combo, arcade action.
16-bit fighting game animation.
Side view, static.
```

### RPG風
```
Character idle in town, peaceful breathing.
Classic JRPG overworld style.
Top-down view, static.
```

### プラットフォーマー風
```
Running and jumping motion.
Side-scrolling game animation.
Side view, static.
```

---

*最終更新: 2026年1月3日*
