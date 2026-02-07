# [B-3] 3D Anime Style - 3Dアニメ風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI で実現する3DCGアニメスタイル。ブルーロック、推しの子のライブシーンなど、近年の3DCGアニメ風の表現に対応。

> **Image-to-Video設計原則**: 3DCGモデル風のイラストに**滑らかなアニメーション**と**ダイナミックなカメラワーク**を追加。MV風やライブ演出、スポーツアニメ的な動きに特化。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| 3Dモデル風デザイン | ダンス・アクション |
| ライティング | カメラワーク |
| 背景 | 動きのダイナミクス |
| キャラクターの衣装 | 演出効果 |

---

## TEXT PROMPT 構造（推奨順序）

```
[DYNAMIC ACTION] + [SMOOTH CG QUALITY] + [CINEMATIC CAMERA]
```

**テンプレート:**
```
[ダイナミックな動作の説明]
Smooth CG animation, anime-styled movement.
[シネマティックなカメラワーク]
```

---

## 動作キーワード（3Dアニメ向け）

### アイドル・ダンス系
| 動作 | キーワード | 用途 |
|------|-----------|------|
| ダンスムーブ | `dance move, arm gesture, graceful` | ライブシーン |
| ポーズ決め | `striking a pose, confident stance` | MV演出 |
| 手の動き | `hand gesture, expressive hands` | 感情表現 |
| ターン | `spinning motion, graceful turn` | ダンス |

### スポーツ・アクション系
| 動作 | キーワード |
|------|-----------|
| キック | `kicking motion, powerful form` |
| シュート | `shooting motion, athletic action` |
| ジャンプ | `dynamic jump, athletic leap` |
| 走り | `running with speed, dynamic dash` |

### 感情・ドラマ系
| 動作 | キーワード |
|------|-----------|
| 見上げる | `looking up, wind effect, emotional` |
| 手を伸ばす | `reaching out, dramatic gesture` |
| 振り向く | `turning around, hair flowing` |

---

## カメラワーク指定（3Dアニメ風）

| カメラワーク | プロンプト | 効果 |
|-------------|-----------|------|
| ダイナミックアングル | `dynamic camera angle change` | アイドル風 |
| 追跡 | `tracking camera following movement` | スポーツ |
| スロープッシュイン | `slow push in, dramatic angle` | ドラマチック |
| 回転ショット | `rotating camera shot` | MV風 |
| ローアングル | `low angle, heroic shot` | 迫力 |
| クレーン | `crane shot, sweeping motion` | 壮大さ |

> **MV風ハック**: `dynamic camera angle change` は3DCGアニメのMVでよく見るカメラワークを再現。ライブシーンに最適。

---

## 品質向上ブースター（Magic Words）

**3Dアニメ専用:**
```
smooth CG animation, anime-styled 3D, polished motion
```

**アイドル・MV風:**
```
idol-like graceful motion, dance animation, stage performance
```

**スポーツ風:**
```
dynamic athletic motion, speed and impact, powerful action
```

**ドラマチック演出:**
```
cinematic motion, emotional impact, dramatic atmosphere
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
extra limbs, missing limbs, morphing, unnatural deformation
```

### 3Dアニメ専用追加
```
2D hand-drawn, cel animation flat, photorealistic, live action,
low poly, retro 3D, stiff robotic movement, PS1 graphics
```

---

## 実例とサンプルプロンプト

### サンプル1：アイドルダンス

**プロンプト:**
```
Performing dance move, arm gesture with grace.
Smooth CG animation, idol-like graceful motion.
Dynamic camera angle change, stage lighting.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
2D hand-drawn, photorealistic, stiff robotic
```

### サンプル2：スポーツアクション（ブルーロック風）

**プロンプト:**
```
Kicking motion with powerful athletic form.
Dynamic 3D anime action, speed and impact.
Tracking camera following movement, dramatic angle.
```

### サンプル3：ドラマチック演出（推しの子風）

**プロンプト:**
```
Looking up with wind effect, hair flowing dramatically.
Cinematic 3D anime motion, emotional impact.
Slow push in with dramatic lighting.
```

### サンプル4：MV風パフォーマンス

**プロンプト:**
```
Stage performance pose, confident dance move.
Polished CG animation, idol concert feel.
Rotating camera shot, flashy atmosphere.
```

### サンプル5：ヒプマイ風ラップバトル

**プロンプト:**
```
Dramatic hand gesture, confident stance.
Stylized 3D anime motion, rhythmic movement.
Dynamic camera angle, urban atmosphere.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-advanced` | 高品質推奨 |
| seconds | 4-6 | MV・演出向け |
| aspect_ratio | `16:9` / `9:16` | 動画作品向け |

**品質優先の理由:**
- 3Dアニメスタイルは細部の滑らかさが重要
- `faster` では動きの品質が目立って低下する
- MV・ライブ演出では `advanced` 必須

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 動きが硬い | プロンプトに `smooth, graceful, fluid` 追加 |
| 2D風になる | ネガティブに `2D, hand-drawn, cel animation` 追加 |
| カメラがぎこちない | カメラ動作を1種類に絞る |
| ライティングが安定しない | プロンプトに `consistent lighting` 追加 |

---

## 3Dアニメ特有の表現

### 滑らかなカメラワーク
```
Smooth camera movement, cinematic angle change.
Professional 3D animation camera work.
```

### ダイナミックなアングル変化
```
Dynamic angle shift, dramatic perspective change.
MV-style camera motion.
```

### アイドルライブ風演出
```
Stage performance, spotlight effect.
Idol concert atmosphere, flashy presentation.
```

### スポーツアニメ的動き
```
Athletic motion with impact, dynamic action.
Sports anime style movement, powerful form.
```

---

## 参考作品イメージ

- **ブルーロック** - サッカーシーン、ダイナミックアクション
- **推しの子** - ライブシーン、感情的演出
- **ヒプノシスマイク** - MV演出、スタイリッシュ
- **プロセカ** - 3Dライブ、アイドルパフォーマンス
- **ラブライブ** - ダンスシーン、グループ演出

---

## MV制作ワークフロー

```
1. キーフレームとなる静止画を準備
2. 各シーンに合わせた動きを指定
3. カメラワークは1シーン1種類で統一
4. advanced モデルで高品質生成
5. 複数シーンを編集ソフトで結合
```

---

*最終更新: 2026年1月3日*
