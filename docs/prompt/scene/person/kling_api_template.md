# Kling AI シーンプロンプトテンプレート（人物）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 1枚の人物画像（SOURCE） |
| 出力 | 5秒の人物動画 |
| 推奨語数 | 10〜30単語 |
| 成功率目安 | 80〜95%（シンプルな動作） |
| 推奨モデル | Kling 2.6（標準）/ Kling 2.6 Pro（高品質） |

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
- 動き・アクション（何をするか）
- カメラワーク（カメラがどう動くか）
- 自然な動き要素（髪のなびき、布の揺れ）
- 表情の変化（微笑む、目を閉じる等）
```

---

## TEXT PROMPT（コピペ用テンプレ）

```
SINGLE IMAGE RULE (do not remove):
Preserve exact appearance, clothing, and background from the source image.
Do not change or add any visual elements not present in the image.

CLIP SPECIFIC (edit only this block):
Action: [SINGLE MOVEMENT - e.g., turns head slowly, smiles gently, raises hand]
Camera: [CAMERA MOVEMENT - e.g., static shot, slow push-in, subtle arc]
Natural motion: [hair sways gently, fabric flows, natural blink]

Cinematic quality, smooth motion.
```

---

## NEGATIVE PROMPT

```
warped faces, distorted features, unnatural skin, extra fingers, deformed hands,
extreme expressions, robotic movement, plastic skin texture, background change,
costume change, color shift, new objects appearing
```

---

## 成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 歩く・走る | 85-95% | 低 |
| 手を上げる・振る | 85-95% | 低 |
| 振り返る | 85-95% | 低 |
| 笑う・表情変化 | 80-90% | 低 |
| 髪・服のなびき | 90-95% | 低 |
| 頷く・首を傾げる | 85-95% | 低 |
| 複数人の相互作用 | 60-70% | 中 |
| 細かい手指の動き | 50-70% | 高 |

---

## カメラワーク早見表

| カメラワーク | プロンプト例 |
|--------------|-------------|
| 固定 | `static shot` |
| プッシュイン | `slow push-in` |
| プルアウト | `slow pull-out` |
| パン | `camera pans left` |
| トラッキング | `tracking shot` |
| アーク | `camera arcs around` |

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

---

## 実例集

### 例1：微笑むポートレート

```
Action: smiles gently, eyes soften
Camera: slow push-in
Natural motion: hair sways slightly, natural blink

Cinematic quality, smooth motion.
```

### 例2：振り返りシーン

```
Action: turns head slowly to look over shoulder
Camera: static shot
Natural motion: hair follows the turn, fabric settles

Cinematic quality, smooth motion.
```

### 例3：手を振る

```
Action: raises hand and waves gently
Camera: static shot
Natural motion: arm moves naturally, slight body sway

Cinematic quality, smooth motion.
```

### 例4：歩き出す

```
Action: takes a few steps forward
Camera: tracking shot follows
Natural motion: hair bounces, clothing moves with body

Cinematic quality, smooth motion.
```

---

## 失敗パターンと修正法

### ❌ 外見を記述してしまう
| 失敗 | `A woman with long blonde hair in a red dress turns around` |
|------|------|
| 原因 | 画像にある情報を重複記述→背景や服が変わる可能性 |
| 修正 | `Turns around slowly. Static shot. Hair follows the turn.` |

### ❌ 背景を記述してしまう
| 失敗 | `Standing on a beach at sunset, she smiles` |
|------|------|
| 原因 | 背景を指定すると画像の背景と競合する |
| 修正 | `Smiles gently. Slow push-in. Hair sways in breeze.` |

### ❌ 複数のアクションを同時に
| 失敗 | `She walks, waves, and turns around` |
|------|------|
| 原因 | 5秒で複数の動作は不自然 |
| 修正 | `Walks forward slowly. Tracking shot. Hair bounces.` |

---

## チェックリスト

- [ ] 外見（髪、服、顔）を記述していないか
- [ ] 背景・シーンを記述していないか
- [ ] 動きは1つの明確なアクションに絞られているか
- [ ] カメラワークは明確に指定されているか
- [ ] 10〜30単語に収まっているか

---

*Last Updated: 2026-01*
