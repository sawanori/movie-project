# [A-3] 90s Retro Style - 90年代レトロアニメ風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI の `90s_style` を活用した懐かしい90年代アニメの雰囲気。セル画風の質感、フィルムグレイン、少し荒い線画が特徴。

> **Image-to-Video設計原則**: 90年代アニメ特有の「止め絵から動き出す」演出や、ドラマチックな髪・衣服の揺れを指定。画像のレトロ感を活かしながら、クラシックなアニメーションの動きを追加。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| キャラクターデザイン | 90年代風のドラマチックな動き |
| セル画風の質感 | クラシックなカメラワーク |
| 背景 | レトロ演出効果（効果線など） |
| 色彩 | 髪・衣服の誇張された揺れ |

---

## TEXT PROMPT 構造（推奨順序）

```
[DRAMATIC MOTION] + [RETRO ANIMATION FEEL] + [CLASSIC CAMERA WORK]
```

**テンプレート:**
```
[ドラマチックな動作の説明]
Classic cel animation feel, nostalgic motion.
[クラシックなカメラワーク]
```

---

## 動作キーワード（90年代アニメ向け）

### ドラマチック動作
| 動作 | キーワード | 効果 |
|------|-----------|------|
| 見上げる | `looking up dramatically` | 王道の演出 |
| 振り向く | `dramatic turn around` | インパクト |
| 髪揺れ | `hair flowing dramatically in wind` | 90年代らしさ |
| 視線の動き | `intense gaze shift` | 感情表現 |

### 感情表現（大げさ目）
| 感情 | キーワード |
|------|-----------|
| 決意 | `determined expression, eyes shining` |
| 悲哀 | `tearful look, melancholic motion` |
| 怒り | `angry stare, clenched fist` |
| 驚き | `shocked reaction, dramatic` |

### アクション
| アクション | キーワード |
|------------|-----------|
| 戦闘 | `powerful strike motion, impact frames` |
| ジャンプ | `dynamic leap, athletic motion` |
| 走り | `running with determination` |

---

## カメラワーク指定（クラシックスタイル）

| カメラワーク | プロンプト | 90年代らしさ |
|-------------|-----------|-------------|
| スローパンアップ | `slow pan up` | 王道の演出 |
| ドラマチックアングル | `dramatic angle, low angle` | 迫力 |
| 固定＋止め絵風 | `static shot, held frame feel` | クラシック |
| 追跡ショット | `fast tracking shot` | アクション |
| 斜め構図 | `dutch angle` | 緊張感 |

> **レトロ感ハック**: `slow pan up` と組み合わせることで、90年代アニメのOP/ED風の演出が可能。

---

## 品質向上ブースター（Magic Words）

**90年代アニメ専用:**
```
classic anime motion, cel animation feel, nostalgic aesthetic
```

**ドラマチック演出用:**
```
dramatic movement, expressive animation, impact frames
```

**レトロ質感用:**
```
film grain effect, vintage anime look
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
extra limbs, malformed hands, morphing, unnatural deformation
```

### 90年代スタイル専用追加
```
modern digital anime, clean crisp lines, 4K quality,
3D CGI, smooth gradients, contemporary aesthetic
```

---

## 実例とサンプルプロンプト

### サンプル1：ドラマチック演出

**プロンプト:**
```
Looking up dramatically, hair flowing in wind.
Classic cel animation feel, emotional motion.
Slow pan up with nostalgic aesthetic.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
modern digital anime, 3D CGI, crisp 4K
```

### サンプル2：日常シーン

**プロンプト:**
```
Turning around with a gentle smile.
Nostalgic animation style, soft fluid movement.
Static medium shot, classic framing.
```

### サンプル3：アクションシーン

**プロンプト:**
```
Powerful fighting stance, strike motion.
Classic anime action with impact frames.
Fast tracking shot, dramatic angle.
```

### サンプル4：エヴァンゲリオン風

**プロンプト:**
```
Intense gaze, subtle head movement.
Dramatic stillness, held frame tension.
Static close-up, psychological framing.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | 標準生成 |
| model | `animate-2.4-advanced` | ドラマチック演出向け |
| seconds | 3-5 | 演出に合わせて調整 |
| aspect_ratio | `16:9` / `4:3` | 4:3でよりレトロ感 |

**レトロ感強調のヒント:**
- `4:3` アスペクト比でよりブラウン管時代の雰囲気
- 短めの動画でループさせるとOP風に

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| モダンな質感になる | ネガティブに `modern, clean, 4K` 追加 |
| 動きが滑らかすぎる | プロンプトに `classic frame rate feel` 追加 |
| グレインが足りない | プロンプトに `film grain effect` 追加 |
| ドラマチックさが足りない | 動作に `dramatically` を追加 |

---

## 90年代アニメ特有の演出テクニック

### 止め絵からの動き出し
```
Starting from held frame, then subtle motion.
Classic anime pause-to-action feel.
```

### 効果線・集中線
```
Speed lines effect, action lines radiating.
Classic anime impact visual.
```

### 髪・衣服の誇張揺れ
```
Hair flowing dramatically, exaggerated wind effect.
Clothes billowing in stylized motion.
```

---

## 参考作品イメージ

- エヴァンゲリオン（心理描写）
- セーラームーン（変身・決めポーズ）
- スラムダンク（スポーツアクション）
- るろうに剣心（剣術アクション）
- カウボーイビバップ（スタイリッシュアクション）

---

*最終更新: 2026年1月3日*
