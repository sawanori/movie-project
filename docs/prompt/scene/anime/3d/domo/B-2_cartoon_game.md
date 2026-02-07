# [B-2] Cartoon Game Style - カートゥーン/ゲーム風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI の `cartoon_game` スタイルを活用した3Dゲーム・カートゥーン風動画生成。デフォルメされたキャラクターと誇張された動きが特徴。

> **Image-to-Video設計原則**: Fortnite、原神、崩壊スターレイルなどのゲームキャラクター風の**誇張された動き**と**ゲームらしいアニメーション**に特化。画像のスタイルを活かしつつ、ゲーム特有のモーションを追加。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| キャラクターデザイン | ゲーム風アクション |
| 3D風スタイル | 動きの誇張度 |
| 背景・環境 | カメラアングル |
| 色彩・ライティング | エモート・演出 |

---

## TEXT PROMPT 構造（推奨順序）

```
[GAME-STYLE ACTION] + [EXAGGERATED MOTION] + [DYNAMIC CAMERA]
```

**テンプレート:**
```
[ゲーム風アクションの説明]
Stylized game-like motion, expressive movement.
[ダイナミックなカメラワーク]
```

---

## 動作キーワード（ゲームスタイル向け）

### 基本モーション
| 動作 | キーワード | 用途 |
|------|-----------|------|
| アイドル | `idle stance, subtle swaying` | 待機画面 |
| 呼吸ループ | `breathing loop, gentle motion` | ガチャ演出 |
| ポーズ | `character pose, stylized stance` | キャラ紹介 |

### アクション・エモート
| 動作 | キーワード |
|------|-----------|
| ビクトリー | `victory celebration, fist pump, excited` |
| ダンス | `dance move, rhythmic motion, groove` |
| 手を振る | `wave animation, friendly gesture` |
| お辞儀 | `bow gesture, polite motion` |
| 挑発 | `taunt animation, confident pose` |

### スキル・能力
| 動作 | キーワード |
|------|-----------|
| チャージ | `charging energy, power up stance` |
| 発動 | `skill activation, dramatic pose` |
| 攻撃 | `attack motion, dynamic strike` |
| 防御 | `defensive stance, guarding pose` |

---

## カメラワーク指定（ゲーム風）

| カメラワーク | プロンプト | 効果 |
|-------------|-----------|------|
| オービット | `camera orbit around character` | キャラ紹介 |
| ドラマチックズーム | `dramatic zoom in, slow` | スキル発動 |
| ローアングル | `low angle, heroic shot` | 迫力 |
| 固定フルボディ | `static camera, full body view` | アイドル/ループ |
| 回転 | `rotating around, 360 view` | 商品紹介風 |

> **ゲーム風ハック**: `camera orbit` を使うと、ガチャ演出やキャラクター紹介でよく見るカメラワークが再現可能。

---

## 品質向上ブースター（Magic Words）

**ゲームスタイル専用:**
```
stylized game animation, expressive movement, polished motion
```

**ガチャ演出風:**
```
character showcase, dramatic reveal, flashy animation
```

**エモート風:**
```
emote animation, playful movement, character expression
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
extra limbs, missing limbs, morphing, unnatural deformation
```

### ゲームスタイル専用追加
```
photorealistic, realistic, 2D anime flat, cel-shading flat,
pixel art, retro, static, no movement, stiff robotic
```

---

## 実例とサンプルプロンプト

### サンプル1：アイドルモーション

**プロンプト:**
```
Idle stance with subtle swaying motion.
Game-like idle animation, slight bounce.
Static camera, full body view.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
photorealistic, 2D flat, stiff robotic, static
```

### サンプル2：ビクトリーポーズ

**プロンプト:**
```
Victory celebration, fist pump with excitement.
Exaggerated happy motion, bouncy energy.
Camera orbit around character slowly.
```

### サンプル3：スキル発動

**プロンプト:**
```
Charging up energy, glowing effects around hands.
Dynamic game ability animation, powerful stance.
Dramatic camera angle, slow zoom in.
```

### サンプル4：ダンスエモート

**プロンプト:**
```
Dance move, rhythmic groove motion.
Playful game emote animation, stylized.
Static camera, full body visible.
```

### サンプル5：ガチャ演出風

**プロンプト:**
```
Character reveal pose, dramatic entrance.
Flashy showcase animation, stylized motion.
Camera slowly orbiting, heroic angle.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | 標準生成 |
| model | `animate-2.4-advanced` | 高品質演出 |
| seconds | 3-5 | アクション向け |
| aspect_ratio | `9:16` / `1:1` | SNS・ゲーム紹介向け |

**用途別推奨:**
- アイドルループ: `faster`, 2-3秒
- ガチャ演出: `advanced`, 4-5秒
- SNS投稿: `faster`, 3秒

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 動きが硬い | プロンプトに `bouncy, expressive` 追加 |
| スタイルが崩れる | ネガティブに `photorealistic, 2D flat` 追加 |
| 誇張が足りない | プロンプトに `exaggerated motion, stylized` 追加 |
| カメラ回転がぎこちない | `slow orbit` に変更、秒数を長めに |

---

## ゲームスタイル特有の表現

### アイドルモーション
```
Idle breathing loop, subtle body sway.
Game-style waiting animation.
```

### ビクトリー/敗北ポーズ
```
Victory celebration, triumphant pose.
Defeat animation, disappointed motion.
```

### ダッシュ・ジャンプ
```
Running motion, energetic dash.
Jump animation, dynamic leap.
```

### エモート・感情表現
```
Emote animation, playful gesture.
Character expression, stylized reaction.
```

---

## 適した用途

- ゲームキャラクター紹介
- ガチャ演出風動画
- SNS投稿用ショート
- ゲーム実況サムネイル用
- VTuber用モーション
- ファンアート動画化

---

## 参考ゲームイメージ

- 原神（キャラクター待機・スキル演出）
- 崩壊スターレイル（ガチャ演出）
- Fortnite（エモート・ダンス）
- オーバーウォッチ（ビクトリーポーズ）

---

*最終更新: 2026年1月3日*
