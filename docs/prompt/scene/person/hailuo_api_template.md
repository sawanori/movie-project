# HailuoAI (MiniMax) シーンプロンプトテンプレート（人物）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の人物画像（First Frame） |
| 出力 | 6秒または10秒の人物動画 |
| 推奨語数 | 10〜40単語（最大2000文字） |
| 成功率目安 | 80〜95%（シンプルな動作） |
| 推奨モデル | MiniMax-Hailuo-02 |
| 特徴 | カメラコマンド `[command]` 構文 |

---

## 重要原則：画像優先

```
⚠️ 画像にある情報はプロンプトに書かない

❌ 書いてはいけない:
- 人物の外見（髪の色、顔の特徴、服装の詳細）
- 背景・シーンの詳細（場所、環境、オブジェクト）
- 色、テクスチャ、素材の説明
- 照明の詳細（画像から継承される）

✅ 書くべきこと:
- カメラコマンド [command] を最初に
- 動き・アクション（何をするか）
- 自然な動き要素（髪のなびき、布の揺れ）
- 表情の変化（微笑む、目を閉じる等）
```

---

## TEXT PROMPT（コピペ用テンプレ）

```
[CAMERA_COMMAND]

Action: [SINGLE MOVEMENT - e.g., turns head slowly, smiles gently, raises hand]
Natural motion: [hair sways gently, fabric flows, natural blink]

Cinematic quality, smooth motion.
```

**使用例:**

```
[Push in, Pan left]

Action: turns head slowly, smiles gently
Natural motion: hair sways gently, fabric flows, natural blink

Cinematic quality, smooth motion.
```

---

## カメラコマンド早見表

| カメラワーク | コマンド構文 |
|--------------|-------------|
| 固定 | `[Static shot]` |
| プッシュイン | `[Push in]` |
| プルアウト | `[Pull out]` |
| パン左 | `[Pan left]` |
| パン右 | `[Pan right]` |
| チルト上 | `[Tilt up]` |
| チルト下 | `[Tilt down]` |
| ズームイン | `[Zoom in]` |
| トラック左 | `[Truck left]` |
| トラッキング | `[Tracking shot]` |
| 手ブレ風 | `[Shake]` |

### 複合コマンド例

```
# オービット風（回り込み）
[Truck left, Pan right]

# クレーン風（上昇）
[Pedestal up, Tilt down]

# ドラマチック接近
[Push in, Zoom in]
```

---

## 成功率一覧

| アクション | 成功率 | 推奨カメラ |
|------------|--------|-----------|
| 歩く・走る | 85-95% | `[Tracking shot]` |
| 手を上げる・振る | 85-95% | `[Static shot]` |
| 振り返る | 85-95% | `[Pan left]` |
| 笑う・表情変化 | 80-90% | `[Push in]` |
| 髪・服のなびき | 90-95% | `[Static shot]` |
| 頷く・首を傾げる | 85-95% | `[Static shot]` |
| 複数人の相互作用 | 60-70% | `[Tracking shot]` |
| 細かい手指の動き | 50-70% | `[Static shot]` |

---

## 動きキーワード

| 英語 | 用途 |
|------|------|
| turns head slowly | 振り返り |
| raises hand gently | 手を上げる |
| smiles warmly | 微笑む |
| nods slowly | 頷く |
| tilts head slightly | 首を傾げる |
| blinks naturally | まばたき |
| hair flows in wind | 髪がなびく |
| fabric sways gently | 服が揺れる |
| stands up slowly | 立ち上がる |
| sits down gently | 座る |
| walks forward | 前に歩く |
| reaches out hand | 手を伸ばす |

---

## 実例集

### 例1：振り返りシーン

```
[Pan right]

Action: turns head slowly with a gentle smile
Natural motion: hair flows softly, natural blink

Cinematic quality, smooth motion.
```

### 例2：接近するカメラ

```
[Push in, Tilt up]

Action: looks directly at camera, subtle smile emerges
Natural motion: slight breath movement, natural blink

Cinematic quality, smooth motion.
```

### 例3：歩くシーン

```
[Tracking shot]

Action: walks forward confidently
Natural motion: hair and clothes sway with movement

Cinematic quality, smooth motion.
```

### 例4：感情表現

```
[Static shot]

Action: expression shifts from neutral to warm smile
Natural motion: subtle eye movement, natural breathing

Cinematic quality, smooth motion.
```

---

## 失敗パターンと修正法

### ❌ カメラコマンドが後ろにある
| 失敗 | `walks forward [Tracking shot]` |
|------|------|
| 修正 | `[Tracking shot] walks forward` |

### ❌ 外見を記述してしまう
| 失敗 | `A young woman with long black hair wearing a white dress` |
|------|------|
| 修正 | `[Static shot] turns head slowly, smiles gently` |

### ❌ 複雑な動作を指定
| 失敗 | `runs, jumps, spins, and lands gracefully` |
|------|------|
| 修正 | `[Tracking shot] runs forward` |

---

## チェックリスト

- [ ] カメラコマンド `[command]` がプロンプト先頭にあるか
- [ ] カメラコマンドは3つ以下か
- [ ] 外見（髪、服、顔）を記述していないか
- [ ] 背景を記述していないか
- [ ] 動作は1〜2個に絞られているか
- [ ] 2000文字以内に収まっているか

---

*Last Updated: 2026-01*
