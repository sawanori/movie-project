# [A-1] Japanese Anime - 日本アニメ風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI の `japanese_anime` スタイルを活用した日本のTVアニメ風動画生成。流れるような動きと鮮やかな色彩が特徴。

> **Image-to-Video設計原則**: 画像が既にキャラクター・背景・色彩を定義しているため、プロンプトは**動作・カメラワーク・アニメーション品質**のみに集中します。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| キャラクターの外見・服装 | 動作の種類（どう動くか） |
| 背景・シーン設定 | カメラワーク |
| 色彩・配色 | 動きの質（fluid, bouncy等） |
| 構図・フレーミング | アニメーション演出効果 |

---

## TEXT PROMPT 構造（推奨順序）

```
[MOTION TYPE] + [MOTION QUALITY] + [CAMERA DIRECTION]
```

**テンプレート:**
```
[動作の説明]
Smooth fluid anime motion.
[カメラワーク指定]
```

---

## 動作キーワード（Motion Keywords）

### 基本動作
| 動作 | キーワード |
|------|-----------|
| 頭を動かす | `head turn`, `head tilt`, `looking around` |
| 髪の揺れ | `hair swaying`, `hair flowing in breeze` |
| 瞬き | `natural blinking`, `eye movement` |
| 呼吸 | `subtle breathing animation`, `chest rising` |
| 振り向く | `turning around`, `looking back` |

### 感情表現
| 感情 | キーワード |
|------|-----------|
| 驚き | `surprised reaction`, `eyes widening` |
| 喜び | `joyful expression`, `smile forming` |
| 悲しみ | `sad expression`, `tears welling` |
| 怒り | `angry expression`, `furrowed brows` |

### アクション
| アクション | キーワード |
|------------|-----------|
| ジャンプ | `leaping forward`, `jumping motion` |
| 走る | `running motion`, `dashing` |
| 戦闘 | `fighting stance`, `attack motion` |
| ダンス | `dance movement`, `rhythmic motion` |

---

## カメラワーク指定（Camera Direction）

| カメラワーク | プロンプト | 効果 |
|-------------|-----------|------|
| 固定 | `static camera` | 安定した出力、失敗率低 |
| ゆっくりズームイン | `slow push in` | ドラマチックな強調 |
| ズームアウト | `slow zoom out` | 全体像の提示 |
| パン | `slow pan left/right` | 横移動の演出 |
| 追跡 | `tracking camera` | アクション追従 |
| 軽い揺れ | `slight camera shake` | 臨場感 |

> **安定性ハック**: カメラを固定 (`static camera`) にすると、モデルの計算リソースが動作に集中し、品質が向上します。

---

## 品質向上ブースター（Magic Words）

**プロンプト末尾に追加推奨:**
```
smooth fluid motion, high quality animation, detailed movement
```

**アニメ特化ブースター:**
```
anime-style movement, expressive animation, key visual quality
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
extra limbs, missing limbs, disconnected limbs, fused fingers,
malformed hands, long neck, mutated, morphing, unnatural deformation
```

### 2Dアニメ専用追加
```
3D CGI, Pixar style, photorealistic, live action, Western cartoon
```

---

## 実例とサンプルプロンプト

### サンプル1：静かな振り向き

**プロンプト:**
```
Gently turns head, hair softly swaying.
Smooth fluid anime motion.
Slow push in.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, distorted, morphing,
extra limbs, malformed hands, 3D CGI, photorealistic
```

### サンプル2：感情的リアクション

**プロンプト:**
```
Expression shifts to surprise, eyes widening.
Expressive anime reaction, bouncy movement.
Static camera, medium shot.
```

### サンプル3：アクションシーン

**プロンプト:**
```
Dynamic leap forward with determination.
Fast fluid motion, speed lines effect.
Tracking camera following movement.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | コスト効率（2クレジット/秒） |
| model | `animate-2.4-advanced` | 高品質（5クレジット/秒） |
| seconds | 3-5 | 推奨動画長さ |
| aspect_ratio | `9:16` / `1:1` | 縦型・正方形推奨 |

**ワークフロー（コスト最適化）:**
1. `faster` モデルで動きを確認
2. 満足したら `advanced` で最終レンダリング

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 顔が溶ける | ネガティブに `bad face, melted face` 追加 |
| 動画が点滅する | プロンプトに `consistent lighting` 追加 |
| 手がおかしい | ネガティブに `extra fingers, malformed hands` 追加 |
| 動きが硬い | プロンプトに `fluid motion, smooth movement` 追加 |
| 形が崩れる | カメラを `static camera` に固定 |

---

## DomoAI特有の強み

- アニメキャラクターの自然な動き生成が得意
- 髪や衣服の物理演算が優秀
- 表情変化の滑らかさ
- 既存キャラクター画像の動画化に特化

---

*最終更新: 2026年1月3日*
