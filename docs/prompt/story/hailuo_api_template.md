# HailuoAI (MiniMax) ストーリー動画プロンプトテンプレート（連続クリップ用）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 参照画像（First Frame + 任意でLast Frame） |
| 出力 | 6秒または10秒の動画クリップ |
| 推奨語数 | 10〜40単語（最大2000文字） |
| 目的 | 結合前提で **同一人物・同一ロケ・同一ルック** を維持（連続性最優先） |
| 推奨モデル | MiniMax-Hailuo-02 |
| 特徴 | カメラコマンド `[command]` 構文による精密制御 |

---

## Hailuo固有の設定

### prompt_optimizer について

```
⚠️ prompt_optimizer: false を推奨

理由:
- プロンプトが自動拡張されるとカメラコマンドの精度が下がる
- 意図した動きと異なる結果になりやすい
- 連続クリップ間の一貫性が失われる

設定: HAILUO_PROMPT_OPTIMIZER=false (環境変数)
```

### Duration について

| 指定値 | 実際の出力 | 備考 |
|--------|-----------|------|
| 5秒以下 | 6秒 | 自動変換 |
| 6〜9秒 | 6秒 | - |
| 10秒以上 | 10秒 | - |

---

## カメラコマンド（[command] 構文）

### 基本コマンド一覧

| カテゴリ | コマンド | 構文 |
|---------|---------|------|
| トラック | 左右移動 | `[Truck left]`, `[Truck right]` |
| パン | 左右回転 | `[Pan left]`, `[Pan right]` |
| プッシュ | 前後移動 | `[Push in]`, `[Pull out]` |
| ペデスタル | 上下移動 | `[Pedestal up]`, `[Pedestal down]` |
| チルト | 上下角度 | `[Tilt up]`, `[Tilt down]` |
| ズーム | 拡大縮小 | `[Zoom in]`, `[Zoom out]` |
| 特殊 | 手ブレ・追跡・固定 | `[Shake]`, `[Tracking shot]`, `[Static shot]` |

### 複合コマンド

```
# 同時実行（最大3コマンド推奨）
[Pan left, Zoom in, Tilt up]

# 順次実行
[Push in], then [Pull out]

# アーク（回り込み）
[Truck left, Pan right]  # 左に移動しながら右を向く

# クレーン
[Pedestal up, Tilt down]  # 上昇しながら下を見る
```

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
- カメラコマンド [command] を最初に
- 動き・アクション（何をするか）
- 自然な動き要素（髪のなびき、布の揺れ）
- 連続性キーワード（same, continuous）
```

---

## 参照画像の使い方

| 画像 | パラメータ | 役割 |
|------|-----------|------|
| **First Frame** | `first_frame_image` | 開始フレーム（必須） |
| **Last Frame** | `last_frame_image` | 終了フレーム（任意、Hailuo-02のみ） |

### Last Frame使用シナリオ

```
✅ 使うべき場面:
- 2つのシーン間をモーフィング的に繋ぎたい
- 特定のポーズで終了させたい
- 連続クリップ間の接続を確実にしたい

⚠️ 注意点:
- First/Last Frame間の差が大きすぎると不自然に
- 同一人物・同一背景を維持したFrameを使用
```

---

## TEXT PROMPT（人物用・デフォルト）

```
[CAMERA_COMMAND]

Action: [SINGLE MOVEMENT - continues naturally from previous clip]
Natural motion: [hair sways, fabric flows, natural blink]

Continuity: same person, same location, continuous from previous.
Cinematic quality, smooth motion.
```

**使用例:**

```
[Push in, Pan left]

Action: looks ahead with anticipation, slight head turn
Natural motion: hair catches breeze, natural blink

Continuity: same person, same location, continuous from previous.
Cinematic quality, smooth motion.
```

---

## 物体・プロダクト用テンプレート

```
[CAMERA_COMMAND]

Action: [SIMPLE MOTION - rotation, light shift, continues from previous]
Natural motion: [reflections shift, steam rises, subtle movement]

Continuity: same product, same setup, continuous from previous.
Cinematic quality, smooth motion.
```

**使用例:**

```
[Tracking shot, Zoom in]

Action: product rotates slowly, light catches surface
Natural motion: reflections shift smoothly, surface glistens

Continuity: same product, same setup, continuous from previous.
Cinematic quality, smooth motion.
```

---

## 成功率一覧

### 人物アクション

| アクション | 成功率 | カメラコマンド例 |
|------------|--------|-----------------|
| 歩く・走る | 85-95% | `[Tracking shot]` |
| 振り返る | 85-95% | `[Static shot]` |
| 笑う・表情変化 | 80-90% | `[Push in]` |
| 頷く | 85-95% | `[Static shot]` |

### 物体アクション

| アクション | 成功率 | カメラコマンド例 |
|------------|--------|-----------------|
| 回転 | 90-95% | `[Truck left, Pan right]` |
| カメラ接近 | 90-95% | `[Push in]` |
| 湯気・煙 | 80-90% | `[Static shot]` |

---

## カメラワーク選択ガイド

| シーンタイプ | 推奨カメラ | コマンド |
|------------|-----------|---------|
| 静かな会話 | 固定 | `[Static shot]` |
| 緊張・期待 | プッシュイン | `[Push in]` |
| 開放感 | プルアウト | `[Pull out]` |
| 追跡・動き | トラッキング | `[Tracking shot]` |
| ダイナミック | パン+ズーム | `[Pan left, Zoom in]` |
| 商品紹介 | オービット | `[Truck left, Pan right]` |

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

**First Frame のみ使用**

```
[Slow Push in]

Action: looks ahead with anticipation, slight head turn
Natural motion: hair catches breeze, natural blink

Cinematic quality, smooth motion.
```

### 例2：人物ストーリー（Clip 2）

**First Frame + Last Frame使用**

```
[Pan left, Tilt down]

Action: turns slightly, expression shifts to recognition
Natural motion: hair movement, subtle breathing

Continuity: same person, same location, continuous from previous.
Cinematic quality, smooth motion.
```

### 例3：料理ストーリー（Clip 1）

**First Frame のみ使用**

```
[Push in, Pedestal down]

Action: steam rises elegantly
Natural motion: steam catches light, surface glistens

Cinematic quality, smooth motion.
```

### 例4：商品ストーリー（回転）

**First Frame のみ使用**

```
[Truck left, Pan right]

Action: product rotates slowly, light shifts across surface
Natural motion: reflections move smoothly

Cinematic quality, smooth motion.
```

---

## 失敗パターンと修正法

### ❌ カメラコマンドの位置が悪い
| 失敗 | `Action: walking. [Push in]` |
|------|------|
| 原因 | カメラコマンドがプロンプト途中にあると認識されにくい |
| 修正 | `[Push in] Action: walking naturally` |

### ❌ カメラコマンドが多すぎる
| 失敗 | `[Pan left, Zoom in, Tilt up, Push in, Shake]` |
|------|------|
| 原因 | 4つ以上のコマンドは処理しきれない |
| 修正 | 最大3コマンドに絞る: `[Pan left, Zoom in, Tilt up]` |

### ❌ 外見を記述してしまう
| 失敗 | `A young traveler in casual attire with a messenger bag looks ahead` |
|------|------|
| 原因 | 画像にある情報を重複記述→服や持ち物が変わる可能性 |
| 修正 | `[Push in] Looks ahead with anticipation. Hair catches breeze.` |

### ❌ 背景を記述してしまう
| 失敗 | `On the urban platform at dawn with gentle mist` |
|------|------|
| 原因 | 背景を指定すると画像の背景と競合する |
| 修正 | 背景は記述しない。カメラと動きのみ記述。 |

---

## チェックリスト

- [ ] カメラコマンド `[command]` がプロンプト先頭にあるか
- [ ] カメラコマンドは3つ以下か
- [ ] 外見（髪、服、顔）を記述していないか
- [ ] 背景・シーンを記述していないか
- [ ] 「Same」「Continuous」キーワードを含めているか
- [ ] 2000文字以内に収まっているか
- [ ] prompt_optimizer: false で使用しているか

---

*Last Updated: 2026-01*
