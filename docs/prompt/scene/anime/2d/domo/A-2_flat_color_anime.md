# [A-2] Flat Color Anime - フラットカラーアニメ風 プロンプトテンプレート (DomoAI)

**スタイル解説**:
DomoAI の `flat_color_anime` スタイルを活用したシンプルで洗練されたアニメ表現。グラデーションを排したフラットな塗りと、明確な線画が特徴。

> **Image-to-Video設計原則**: 画像のフラットなスタイルを維持しながら、**シンプルで控えめな動き**を指定します。複雑な動きは避け、スタイルの一貫性を優先。

---

## 設計思想：画像とプロンプトの役割分担

| 画像が決定済み（記述不要） | プロンプトで指定すべき項目 |
|---------------------------|---------------------------|
| フラットな塗りスタイル | 控えめな動作タイプ |
| キャラクターデザイン | 動きの大きさ（小さめ推奨） |
| 背景 | カメラ（固定推奨） |
| 色パレット | 瞬き・呼吸など微細動作 |

---

## TEXT PROMPT 構造（推奨順序）

```
[SIMPLE MOTION] + [MOTION QUALITY: simple/clean] + [CAMERA: static preferred]
```

**テンプレート:**
```
[シンプルな動作の説明]
Clean simple motion, maintaining style consistency.
Static camera.
```

---

## 動作キーワード（このスタイル向け）

### 推奨動作（シンプルなもの）
| 動作 | キーワード | 適性 |
|------|-----------|------|
| まばたき | `gentle blinking` | 最適 |
| 頭の傾き | `subtle head tilt` | 最適 |
| 軽い揺れ | `gentle swaying` | 最適 |
| 口パク | `talking animation, lip sync` | 最適 |
| 手を振る | `simple wave gesture` | 良好 |
| リアクション | `small reaction, slight bounce` | 良好 |

### 避けるべき動作
| 動作 | 理由 |
|------|------|
| 激しいアクション | スタイル崩れの原因 |
| 複雑なカメラワーク | フラット感が失われる |
| 大きな体の動き | 塗りの一貫性が崩れる |

---

## カメラワーク指定

| カメラワーク | プロンプト | 推奨度 |
|-------------|-----------|--------|
| 固定 | `static camera` | 最推奨 |
| 微小な寄り | `very slight zoom in` | 可 |
| 固定（顔フォーカス） | `static camera, focus on face` | 最推奨 |

> **スタイル維持ハック**: このスタイルでは `static camera` が必須レベル。カメラを動かすとフラットな塗りの一貫性が失われやすい。

---

## 品質向上ブースター（Magic Words）

**フラットスタイル専用:**
```
clean simple motion, flat color maintained, consistent style
```

**VTuber風に最適化:**
```
smooth talking animation, natural eye movement, subtle expression
```

---

## ネガティブプロンプト

### ユニバーサル・スタビライザー（必須）
```
(worst quality, low quality:1.4), blurry, distorted, deformed,
morphing, unnatural deformation, flickering
```

### フラットスタイル専用追加
```
realistic shadows, complex lighting, 3D render, depth of field,
painterly, watercolor, textured, gradient shading
```

---

## 実例とサンプルプロンプト

### サンプル1：VTuber風トーク

**プロンプト:**
```
Talking with gentle head movements and natural blinking.
Clean simple motion, flat style maintained.
Static camera, focus on face.
```

**ネガティブ:**
```
(worst quality, low quality:1.4), blurry, morphing,
complex lighting, 3D render, gradient shading
```

### サンプル2：リアクション

**プロンプト:**
```
Small surprised reaction, slight bounce.
Simple clean animation, expressive eyes.
Static camera, no movement.
```

### サンプル3：手を振る

**プロンプト:**
```
Simple cheerful wave with a smile.
Clean smooth motion, flat shading maintained.
Static camera, medium shot.
```

---

## DomoAI設定

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| model | `animate-2.4-faster` | スタイル維持に十分 |
| seconds | 2-4 | 短めでスタイル維持 |
| aspect_ratio | `1:1` / `9:16` | SNS・VTuber向け |

**コスト効率のヒント:**
- このスタイルは `faster` モデルで十分な品質
- 短い動画（2-3秒）でループさせる用途に最適

---

## トラブルシューティング

| 問題 | 修正方法 |
|------|----------|
| 塗りがグラデーションになる | ネガティブに `gradient, shading` 追加 |
| スタイルが変わる | 動作を単純化、カメラを固定 |
| 点滅する | 秒数を短くする（2-3秒） |
| 線がぼやける | ネガティブに `blurry lines, messy` 追加 |

---

## このスタイルに最適なコンテンツ

- VTuber風動画
- SNS投稿用ショート動画
- イラスト紹介動画
- シンプルなリアクション動画
- LINEスタンプ風アニメーション
- 配信用待機画面

---

## プロダクションワークフロー

```
1. フラットスタイルの静止画を準備
2. シンプルな動作のみを指定
3. static camera で生成
4. 2-3秒で生成してループ確認
5. 問題なければ本番生成
```

---

*最終更新: 2026年1月3日*
