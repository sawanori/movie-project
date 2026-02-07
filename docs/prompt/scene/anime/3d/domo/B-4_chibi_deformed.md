# [B-4] Chibi / Deformed Style - ちびキャラ・デフォルメ風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI でちびキャラクターやSDキャラクターを動かすためのテンプレート。2〜3頭身のデフォルメキャラクター特有のかわいらしい動きを生成。

> **Image-to-Video設計原則**: ねんどろいど風、SDキャラ、ちびキャラのイラストに**誇張されたかわいい動き**を追加。「Squash and Stretch（潰れと伸び）」の原理を活用し、愛らしいアニメーションを実現。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| ちびキャラデザイン | かわいい動作 |
| 2〜3頭身比率 | 誇張された動き |
| 表情 | 感情表現の種類 |
| 背景 | バウンシーな質感 |

---

## TEXT PROMPT 構造（推奨順序）

```
[CUTE ACTION] + [BOUNCY CHIBI QUALITY] + [STATIC CAMERA]
```

**テンプレート:**
```
[かわいい動作の説明]
Adorable bouncy motion, chibi-like movement.
Static camera, full body view.
```

---

## 動作キーワード（ちびキャラ向け）

### 基本のかわいい動き
| 動作 | キーワード | 効果 |
|------|-----------|------|
| ぴょんぴょん | `hopping happily, bouncy jump` | 最もちびらしい |
| ゆらゆら | `swaying gently, cute sway` | 待機動作 |
| ぺこり | `bowing cutely, adorable nod` | 挨拶 |
| くるくる | `spinning happily, twirl motion` | 喜び表現 |

### 感情表現（大げさが正解）
| 感情 | キーワード |
|------|-----------|
| 喜び | `jumping with joy, excited bounce, sparkly` |
| 照れ | `fidgeting shyly, blushing motion, cute embarrassed` |
| 怒り | `stomping feet, puffed cheeks, comedic angry` |
| 悲しみ | `drooping sadly, teary motion, cute sad` |
| 驚き | `startled jump, big reaction, shocked` |

### リアクション
| リアクション | キーワード |
|--------------|-----------|
| 手を振る | `waving enthusiastically, big wave` |
| うなずき | `nodding eagerly, bouncy nod` |
| 首かしげ | `head tilt, curious gesture` |
| 拍手 | `clapping happily, excited applause` |

---

## カメラワーク指定

| カメラワーク | プロンプト | 推奨度 |
|-------------|-----------|--------|
| 完全固定 | `static camera, full body view` | 最推奨 |
| 微小ズームイン | `slight zoom in` | 可 |
| 固定（顔寄り） | `static camera, close-up` | 表情重視時 |

> **ちびキャラ維持ハック**: カメラは `static camera` 必須。動かすと頭身バランスが崩れやすい。

---

## 品質向上ブースター（Magic Words）

**ちびスタイル専用:**
```
adorable bouncy motion, chibi-like movement, cute animation
```

**誇張表現用:**
```
exaggerated squash and stretch, comedic motion, playful animation
```

**ループ向け:**
```
seamless loop animation, repeating cute motion
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
morphing, unnatural deformation
```

### ちびスタイル専用追加
```
realistic proportions, tall figure, serious dramatic movement,
complex detailed animation, scary, horror elements,
photorealistic, adult proportions
```

> **重要**: `realistic proportions` をネガティブに入れることで、2〜3頭身のデフォルメが維持されます。

---

## 実例とサンプルプロンプト

### サンプル1：ぴょんぴょん跳ねる

**プロンプト:**
```
Hopping happily in place, arms swinging.
Adorable bouncy motion, exaggerated squash and stretch.
Static camera, full body view.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
realistic proportions, serious movement, scary
```

### サンプル2：手を振る

**プロンプト:**
```
Waving enthusiastically with big smile.
Cute bouncy wave animation, cheerful energy.
Static camera, slight zoom in on character.
```

### サンプル3：照れる

**プロンプト:**
```
Fidgeting shyly, looking down with blush.
Adorable shy animation, subtle swaying.
Static camera, close-up.
```

### サンプル4：怒りぷんぷん

**プロンプト:**
```
Stomping feet angrily, puffed cheeks.
Comedic angry animation, exaggerated tantrum.
Static camera, wide shot.
```

### サンプル5：喜びジャンプ

**プロンプト:**
```
Jumping with joy, arms raised high.
Excited bouncy celebration, sparkly energy.
Static camera, full body.
```

### サンプル6：ねんどろいど風ポーズ

**プロンプト:**
```
Striking a cute pose, slight head tilt.
Chibi figure animation, adorable stance change.
Static camera, showcase view.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | ちびには十分 |
| seconds | 2-4 | 短めでループ向け |
| aspect_ratio | `1:1` / `9:16` | SNS・スタンプ向け |

**コスト効率:**
- ちびキャラは `faster` モデルで十分な品質
- 2-3秒の短いループがベスト
- 長い動画は頭身崩れのリスク増

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 頭身が崩れる | ネガティブに `realistic proportions, tall` 追加 |
| 動きが硬い | プロンプトに `bouncy, squash and stretch` 追加 |
| かわいくない | プロンプトに `adorable, cute, chibi-like` 追加 |
| 怖くなる | ネガティブに `scary, horror, creepy` 追加 |
| バランスが変わる | カメラを完全固定、秒数を短く |

---

## ちびキャラ特有の表現テクニック

### Squash and Stretch（潰れと伸び）
```
Exaggerated squash and stretch motion.
Bouncy animation with weight.
```
> アニメーションの基本原則。ジャンプ時に潰れ、着地で伸びる動き。

### 誇張されたリアクション
```
Big exaggerated reaction, comedic motion.
Over-the-top expression change.
```

### ループ可能な動き
```
Seamless loop, repeating idle motion.
Cute breathing animation cycle.
```

---

## 適した用途

- LINEスタンプ風動画
- SNSリアクション用
- ゲームのSDキャラ演出
- ねんどろいど風アニメ
- ちびキャラ紹介動画
- 配信用アバター動き
- ファンアート動画化
- グッズ紹介用動画

---

## 感情別プロンプト早見表

| 感情 | 推奨プロンプト |
|------|---------------|
| 嬉しい | `Jumping happily, sparkly excited, bouncy joy` |
| 悲しい | `Drooping sadly, teary eyes, cute depressed` |
| 怒り | `Stomping angry, puffed cheeks, comedic mad` |
| 照れ | `Fidgeting shy, blushing, cute embarrassed` |
| 驚き | `Startled jump, big eyes, shocked reaction` |
| 眠い | `Yawning sleepy, droopy eyes, tired sway` |
| 困惑 | `Confused head tilt, question mark feeling` |

---

## LINEスタンプ制作ワークフロー

```
1. ちびキャラの静止画を準備
2. 感情に合わせた動作を選択
3. 2-3秒の短い動画で生成
4. ループ確認
5. GIF形式で書き出し
```

---

*最終更新: 2026年1月3日*
