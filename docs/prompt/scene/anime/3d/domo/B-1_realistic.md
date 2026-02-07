# [B-1] Realistic Style - リアリスティック風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI の `realistic` スタイルを活用した実写風・フォトリアル動画生成。自然な動きと写実的な質感が特徴。

> **Image-to-Video設計原則**: 画像のリアリスティックな質感を維持しながら、**自然で微細な動き**を指定。過度な動きは避け、「ゴールデンアワー・プロトコル」でライティングの一貫性を確保。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| 人物の外見・服装 | 自然な動作の種類 |
| 背景・環境 | カメラワーク |
| ライティング | 動きの速度感 |
| 構図 | 物理演算的な動き |

---

## ゴールデンアワー・プロトコル（ライティング安定化）

リアリスティック動画で最大の失敗点は**ライティングのフリッカー（点滅）**。これを防ぐためのプロトコル：

### ライティング安定化キーワード
| キーワード | 効果 |
|-----------|------|
| `consistent lighting` | 照明の一貫性を維持 |
| `golden hour` | 暖色系で色温度を統一 |
| `studio lighting` | 環境変数を排除、安定した光源 |
| `soft natural light` | 柔らかい自然光で変動を抑制 |

> **ハック**: `golden hour` をプロンプトに含めると、色温度が暖色系に統一され、照明環境の競合を防止できます。

---

## TEXT PROMPT 構造（推奨順序）

```
[SUBTLE NATURAL MOTION] + [LIFELIKE QUALITY] + [CINEMATIC CAMERA]
```

**テンプレート:**
```
[自然な動作の説明]
Natural lifelike movement, smooth realistic motion.
[シネマティックなカメラワーク]
```

---

## 動作キーワード（リアリスティック向け）

### 微細な動き（推奨）
| 動作 | キーワード | 効果 |
|------|-----------|------|
| 呼吸 | `subtle breathing animation` | 生命感 |
| 瞬き | `natural blinking, eye movement` | リアル感 |
| 頭の動き | `gentle head turn, slow movement` | 自然さ |
| 髪揺れ | `hair gently swaying in breeze` | 物理感 |

### 表情変化
| 表情 | キーワード |
|------|-----------|
| 微笑み | `gentle smile forming, subtle expression` |
| 視線移動 | `eyes slowly shifting, natural gaze` |
| 真剣な表情 | `serious expression, subtle muscle movement` |

### 物理的動き
| 動き | キーワード |
|------|-----------|
| 布の動き | `fabric moving naturally, cloth physics` |
| 風の効果 | `wind gently blowing, realistic physics` |
| 水の反射 | `water reflecting, ripple movement` |

---

## カメラワーク指定（シネマティック）

| カメラワーク | プロンプト | 効果 |
|-------------|-----------|------|
| ゆっくり寄り | `slow push in, cinematic` | ドラマチック |
| 静かなドリフト | `soft camera drift` | 映画的 |
| 固定 | `static camera` | 安定した出力 |
| 浅い被写界深度 | `depth of field, bokeh` | 映画的 |
| クレーンアップ | `crane up, revealing shot` | 壮大さ |

> **安定性優先の場合**: `static camera` でカメラを固定し、被写体の動きに集中させる。

---

## 品質向上ブースター（Magic Words）

**シネマティック・ポジティブ・ブースター:**
```
cinematic lighting, depth of field, highly detailed,
photorealistic, sharp focus, volumetric lighting
```

**動きの品質ブースター:**
```
natural lifelike movement, realistic physics, smooth motion
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
extra limbs, missing limbs, disconnected limbs, fused fingers,
malformed hands, long neck, mutated, morphing
```

### リアリスティック専用追加
```
cartoon, anime, stylized, exaggerated movement, bouncy motion,
pixel art, retro style, unnatural deformation, robotic movement
```

### 解剖学的安全クラスター
```
bad anatomy, extra fingers, missing fingers, fused fingers,
mutated hands, poorly drawn face, mutation
```

---

## 実例とサンプルプロンプト

### サンプル1：ポートレート動き

**プロンプト:**
```
Slowly turning head, natural eye movement and blinking.
Subtle breathing animation, lifelike motion.
Slow push in, cinematic framing, golden hour.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
cartoon, anime, bad anatomy, extra fingers,
exaggerated movement, robotic
```

### サンプル2：髪の動き

**プロンプト:**
```
Hair gently swaying in breeze, natural fabric movement.
Realistic physics, smooth flowing motion.
Static camera, consistent lighting.
```

### サンプル3：表情変化

**プロンプト:**
```
Expression changing from neutral to gentle smile.
Natural facial muscle movement, subtle eye squint.
Close-up shot, soft camera drift, studio lighting.
```

### サンプル4：風景ポートレート

**プロンプト:**
```
Standing by the beach, gentle breeze effect.
Hair flowing naturally, warm sunlight reflecting.
Golden hour lighting, cinematic atmosphere.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-advanced` | リアルには高品質推奨 |
| seconds | 3-5 | 自然な動きに十分な尺 |
| aspect_ratio | `9:16` / `16:9` | 映像作品向け |

**コスト vs 品質:**
- リアリスティックスタイルは `advanced` モデルを強く推奨
- `faster` では細部の品質が低下しやすい

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 顔が溶ける | ネガティブに `bad face, melted face` 追加、V2.4使用 |
| ライティングが点滅 | プロンプトに `golden hour` または `studio lighting` 追加 |
| 動きが不自然 | プロンプトに `natural movement, realistic physics` 追加 |
| 手がおかしい | ネガティブに `extra fingers, malformed hands` 追加 |
| 硬直感がある | プロンプトに `subtle breathing animation` 追加 |

---

## リアリスティック表現のポイント

### 微細な表情の動き
```
Subtle facial expression change.
Natural muscle movement, realistic.
```

### 自然な瞬きと呼吸
```
Natural blinking rhythm, subtle breathing.
Lifelike idle animation.
```

### 髪・衣服の物理的な動き
```
Hair and fabric moving with realistic physics.
Wind effect with natural flow.
```

---

## 適した用途

- 実写風キャラクター動画
- ポートレート動画
- 製品イメージ動画
- ファッション・ビューティ系
- シネマティックショート

---

*最終更新: 2026年1月3日*
