# DomoAI シーンプロンプトテンプレート（人物・ポートレート）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の人物画像 |
| 出力 | 2〜6秒の人物動画 |
| 推奨語数 | 5〜20単語（動作・表情・カメラのみ） |
| 成功率目安 | 80〜95%（シンプルな動作） |
| 強み | 髪・衣服の物理演算、表情変化、呼吸アニメーション |

---

## Image-to-Video設計原則

> **重要**: 画像が既に人物の外見・服装・背景を定義しているため、プロンプトでは**動作・表情・カメラワーク**のみに集中します。

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| 顔・髪型・服装 | 動作の種類 |
| 背景・環境 | 表情変化 |
| ポーズ・構図 | カメラワーク |
| ライティング | 髪・衣服の動き |

---

## プロンプト構造（推奨順序）

```
[PERSON ACTION] + [EXPRESSION/EMOTION] + [MOTION QUALITY] + [CAMERA]
```

**テンプレート:**
```
[人物の動作]
[表情・感情の変化]
Natural lifelike movement, smooth motion.
[カメラワーク]
```

---

## TEXT PROMPT（コピペ用）

### 基本テンプレート
```
[ACTION: head turn/smile/etc]
[EXPRESSION: gentle smile forming/etc]
Natural smooth motion, lifelike movement.
[CAMERA: static/slow push in/etc]
Hair and fabric moving naturally.
```

---

## 動作キーワード辞典

### 頭・顔の動き（高成功率）
| 動作 | キーワード | 成功率 | 用途 |
|------|-----------|--------|------|
| 頭を傾ける | `head tilting gently` | 95% | 自然な動き |
| 振り向く | `turning head slowly` | 90% | ドラマチック |
| 見上げる | `looking up` | 90% | 感情表現 |
| 見下ろす | `looking down` | 90% | 内省的 |
| あたりを見回す | `looking around` | 85% | 探索感 |

### 表情変化
| 表情 | キーワード | 成功率 |
|------|-----------|--------|
| 微笑み | `gentle smile forming` | 90% |
| 驚き | `surprised expression, eyes widening` | 85% |
| 真剣 | `serious expression` | 90% |
| 照れ | `shy expression, blushing` | 80% |
| 考え込む | `thoughtful expression` | 85% |

### 身体の動き
| 動作 | キーワード | 成功率 |
|------|-----------|--------|
| 呼吸 | `subtle breathing animation` | 95% |
| 瞬き | `natural blinking` | 95% |
| 手を振る | `waving hand` | 85% |
| うなずく | `nodding slowly` | 90% |
| 肩をすくめる | `shrugging shoulders` | 80% |

### 髪・衣服（DomoAI得意分野）
| 動き | キーワード | 成功率 |
|------|-----------|--------|
| 髪揺れ | `hair flowing in breeze` | 90% |
| 髪をかきあげる | `hair blowing across face` | 85% |
| 衣服揺れ | `fabric moving naturally` | 90% |
| 風を受ける | `wind effect on hair and clothes` | 85% |

---

## カメラワーク辞典

| カメラワーク | プロンプト | 効果 | 推奨度 |
|-------------|-----------|------|--------|
| 固定 | `static camera` | 安定、表情に集中 | ★★★ |
| ゆっくり寄り | `slow push in` | ドラマチック | ★★★ |
| 引き | `slow zoom out` | 全体像 | ★★☆ |
| 軽いドリフト | `soft camera drift` | 映画的 | ★★☆ |
| 軽い揺れ | `slight camera shake` | 臨場感 | ★★☆ |

> **安定性ハック**: カメラを `static camera` に固定すると、モデルの計算リソースが人物の動きに集中し、品質が向上します。

---

## ゴールデンアワー・プロトコル（ライティング安定化）

人物動画で最大の失敗点は**ライティングのフリッカー（点滅）**と**顔の崩れ**。

| キーワード | 効果 | 使用場面 |
|-----------|------|----------|
| `consistent lighting` | 照明の一貫性維持 | 全般（必須級） |
| `golden hour` | 暖色系統一、肌を美しく | ポートレート |
| `studio lighting` | スタジオ風安定光 | プロ風 |
| `soft natural light` | 柔らかい自然光 | 自然な印象 |

---

## 品質向上ブースター（Magic Words）

**ポートレート向け:**
```
natural lifelike movement, smooth motion,
realistic skin texture, cinematic quality
```

**感情表現向け:**
```
expressive animation, emotional movement,
natural expression change
```

**髪・衣服向け:**
```
hair flowing naturally, fabric physics,
wind effect, realistic cloth movement
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
morphing, flickering, unnatural movement
```

### 人物専用追加
```
warped face, distorted features, unnatural skin,
extra fingers, deformed hands, extreme expressions,
robotic movement, plastic skin texture
```

### 解剖学的安全クラスター
```
bad anatomy, extra limbs, missing limbs,
disconnected limbs, fused fingers, malformed hands,
long neck, mutated, poorly drawn face
```

---

## 実例とサンプルプロンプト

### 例1：ポートレート（静かな動き）

**プロンプト:**
```
Gently turning head, hair swaying in breeze.
Soft smile forming, natural blinking.
Natural lifelike movement.
Slow push in, golden hour lighting.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
warped face, distorted features, robotic movement,
extra fingers, bad anatomy
```

### 例2：感情的リアクション

**プロンプト:**
```
Expression changing from neutral to surprised.
Eyes widening, eyebrows raising.
Expressive natural reaction.
Static camera, consistent lighting.
```

### 例3：風に吹かれるシーン

**プロンプト:**
```
Hair flowing dramatically in wind.
Clothes moving naturally with breeze.
Looking up with peaceful expression.
Static camera, cinematic atmosphere.
```

### 例4：振り向きシーン

**プロンプト:**
```
Slowly turning around, looking back.
Gentle smile forming, eyes catching light.
Smooth natural movement.
Static medium shot.
```

### 例5：話しかけるシーン

**プロンプト:**
```
Talking with natural lip movement.
Gentle head movements, expressive gestures.
Natural conversation animation.
Static camera, focus on face.
```

### 例6：笑顔のポートレート

**プロンプト:**
```
Subtle smile slowly forming.
Eyes sparkling, natural blinking.
Warm expression, lifelike movement.
Slow push in, soft lighting.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | 単純な動きに十分 |
| model | `animate-2.4-advanced` | 顔・手の品質重視 |
| seconds | 3-5 | 自然な動きに十分な尺 |
| aspect_ratio | `9:16` / `1:1` | ポートレート向け |

**品質優先の場合:**
- 顔のクローズアップは `advanced` モデルを推奨
- `Breathing Loop` プリセット（V2.4）で硬直感を防止

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 顔が溶ける | ネガティブに `bad face, melted face` 追加、`advanced` 使用 |
| ライティングが点滅 | プロンプトに `golden hour` または `consistent lighting` 追加 |
| 手がおかしい | ネガティブに `extra fingers, malformed hands` 追加 |
| 動きが硬い | プロンプトに `subtle breathing animation, natural movement` 追加 |
| 表情が不自然 | ネガティブに `extreme expressions, robotic` 追加 |
| 髪が固まる | プロンプトに `hair flowing naturally` 追加 |

---

## 成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 頭を傾ける | 90-95% | 低 |
| 瞬き・呼吸 | 95% | 低 |
| 微笑む | 85-90% | 低 |
| 振り向く | 80-90% | 低 |
| 手を振る | 80-90% | 中 |
| 髪・衣服の揺れ | 85-90% | 低 |
| 話す動作 | 75-85% | 中 |
| 歩く | 70-80% | 中 |
| 細かい手指の動き | 40-60% | 高 |
| 複雑なダンス | 50-70% | 高 |

---

## シーン別チートシート

### ポートレート（静か）
```
Gentle head movement, soft smile forming.
Natural blinking, subtle breathing.
Slow push in, golden hour lighting.
```

### ドラマチック
```
Looking up dramatically, hair flowing.
Emotional expression, cinematic motion.
Static camera, dramatic lighting.
```

### 自然・リラックス
```
Relaxed natural movement, genuine smile.
Hair swaying gently in breeze.
Soft camera drift, natural light.
```

### 会話・対話
```
Talking naturally, expressive gestures.
Head nodding, eye contact maintained.
Static camera, focus on face.
```

### ファッション・美容
```
Elegant pose change, graceful movement.
Hair and fabric flowing beautifully.
Slow orbit or push in, studio lighting.
```

---

## 「Mundane Shonen」パラドックス活用

> 最もダイナミックなAI動画は、**極めて退屈な現実世界の行動**から生成される。

### 活用法
1. 日常の些細な動作を含む画像を使用
2. AIが動きを過剰解釈してドラマチックな表現に変換
3. 予想外のエネルギッシュな動画が生成される

**例:**
```
入力: 書類を持っている人物の画像
プロンプト: "Dramatic action pose, intense focus"
結果: 書類を持つ動作が決め技のように変換される
```

---

## プロダクションワークフロー

```
1. 高品質な人物画像を準備
2. 動作を1-2種類に絞る（頭の動き + 表情）
3. カメラを固定または単純な動きに
4. faster モデルで3秒テスト生成
5. 顔・手に問題がなければ advanced で本番生成
6. 問題があればネガティブプロンプトを追加
```

---

## ロールプレイ・プロンプトインジェクション

> 画像生成器の解釈層に「ペルソナ」を割り当てることで、出力品質を向上させるテクニック。

**例:**
```
You are an experienced cinematographer using an IMAX camera.
Capture the person with cinematic quality and natural movement.
```

**効果:** 出力に対する「システムレベル」の制約を設定し、プロフェッショナルな画像群に整列。

---

*最終更新: 2026年1月3日*
