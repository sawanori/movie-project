# Kling AI ストーリー動画プロンプトテンプレート（連続クリップ用）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 参照画像（A=MASTER + B=PREVIOUS） |
| 出力 | 5秒の連続動画クリップ |
| 推奨語数 | 10〜30単語 |
| 目的 | 結合前提で **同一人物・同一ロケ・同一ルック** を維持（連続性最優先） |
| 推奨モデル | Kling 2.6（標準）/ Kling 2.6 Pro（高品質） |

---

## 重要原則：画像優先

```
⚠️ 画像にある情報はプロンプトに書かない

❌ 書いてはいけない:
- 人物の外見（髪の色、顔の特徴、服装の詳細）
- 背景・シーンの詳細（場所、環境、オブジェクト）
- 色、テクスチャ、照明の詳細
- 画像に既に写っている要素の説明

✅ 書くべきこと:
- 動き・アクション（何をするか）
- カメラワーク（カメラがどう動くか）
- 自然な動き要素（髪のなびき、布の揺れ）
- 連続性キーワード（same, continuous）
```

---

## 参照画像の使い方

| 画像 | 役割 | 説明 |
|------|------|------|
| **Image A** | MASTER | 人物同一性の基準（顔、服装） |
| **Image B** | PREVIOUS | 直前クリップからの連続性 |

- **Clip 1**: Image A のみ使用
- **Clip 2以降**: Image A（MASTER）+ Image B（直前クリップ最終フレーム）

---

## TEXT PROMPT（人物用・デフォルト）

```
REFERENCE RULE (do not remove):
Preserve exact appearance and environment from reference images.
Same person, same clothing, same background throughout.

CLIP SPECIFIC (edit only this block):
Action: [SINGLE MOVEMENT - continues naturally from previous clip]
Camera: [CAMERA MOVEMENT - consistent with previous clip]
Natural motion: [hair sways, fabric flows, natural blink]

Continuity: same person, same location, continuous from previous.
Cinematic quality, smooth motion.
```

---

## NEGATIVE PROMPT（人物用）

```
warped faces, distorted features, costume change, location change,
background change, lighting change, color shift, new objects appearing
```

---

## 物体・プロダクト用テンプレート（代替）

```
REFERENCE RULE (do not remove):
Preserve exact appearance and environment from reference images.
Same product, same background, same lighting throughout.

CLIP SPECIFIC (edit only this block):
Action: [SIMPLE MOTION - rotation, light shift, continues from previous]
Camera: [CAMERA MOVEMENT - consistent with previous clip]
Natural motion: [reflections shift, steam rises, subtle movement]

Continuity: same product, same setup, continuous from previous.
Cinematic quality, smooth motion.
```

**NEGATIVE PROMPT（物体用）:**
```
color shift, texture change, background change, new objects appearing,
lighting change, product change
```

---

## 成功率一覧

### 人物アクション

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 歩く・走る | 85-95% | 低 |
| 振り返る | 85-95% | 低 |
| 笑う・表情変化 | 80-90% | 低 |
| 頷く | 85-95% | 低 |

### 物体アクション

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 回転 | 90-95% | 低 |
| カメラ移動 | 90-95% | 低 |
| 湯気・煙 | 80-90% | 低 |

---

## カメラワーク早見表

| カメラワーク | プロンプト例 | 連続性への影響 |
|--------------|-------------|---------------|
| 固定 | `static shot` | 最も連続性を維持しやすい |
| プッシュイン | `slow push-in` | 前クリップの終点から開始 |
| パン | `camera pans left` | 方向を一貫させる |
| トラッキング | `tracking shot` | 動きの連続性を維持 |

---

## 連続性キーワード

| キーワード | 用途 |
|-----------|------|
| `same person` | 人物の一貫性 |
| `same location` | 場所の一貫性 |
| `continuous from previous` | 動きの連続性 |
| `same lighting` | 照明の一貫性 |

---

## 実例集

### 例1：人物ストーリー（Clip 1）

**Image A のみ使用**

```
Action: looks ahead with anticipation, slight head turn
Camera: slow dolly left
Natural motion: hair catches breeze, natural blink

Cinematic quality, smooth motion.
```

### 例2：人物ストーリー（Clip 2）

**Image A (MASTER) + Image B (Clip 1最終フレーム)**

```
Action: turns slightly, expression shifts to recognition
Camera: tighter shot, slow arc-in
Natural motion: hair movement, subtle breathing

Continuity: same person, same location, continuous from previous.
Cinematic quality, smooth motion.
```

### 例3：料理ストーリー（Clip 1）

**Image A のみ使用**

```
Action: steam rises elegantly
Camera: slow push-in from overhead
Natural motion: steam catches light, surface glistens

Cinematic quality, smooth motion.
```

### 例4：商品ストーリー（Clip 2）

**Image A (MASTER) + Image B (Clip 1最終フレーム)**

```
Action: continues rotating slowly
Camera: continues orbit smoothly
Natural motion: light catches surfaces, reflections shift

Continuity: same product, same setup, continuous from previous.
Cinematic quality, smooth motion.
```

---

## 失敗パターンと修正法

### ❌ 外見を記述してしまう
| 失敗 | `A young traveler in casual attire with a messenger bag looks ahead` |
|------|------|
| 原因 | 画像にある情報を重複記述→服や持ち物が変わる可能性 |
| 修正 | `Looks ahead with anticipation. Slow dolly left. Hair catches breeze.` |

### ❌ 背景を記述してしまう
| 失敗 | `On the urban platform at dawn with gentle mist` |
|------|------|
| 原因 | 背景を指定すると画像の背景と競合する |
| 修正 | 背景は記述しない。動きとカメラのみ記述。 |

### ❌ 連続性の無視
| 失敗 | Clip 2で全く別の動きを指定 |
|------|------|
| 原因 | 前クリップとの連続性が失われる |
| 修正 | `continuous from previous` を含める |

---

## チェックリスト

- [ ] 外見（髪、服、顔）を記述していないか
- [ ] 背景・シーンを記述していないか
- [ ] 「Same」「Continuous」キーワードを含めているか
- [ ] カメラワークは前クリップと自然に繋がるか
- [ ] 10〜30単語に収まっているか

---

*Last Updated: 2026-01*
