# VEO 3.1 プロンプト完全ガイド

## 目次

1. [基本概念](#1-基本概念)
2. [プロンプト構造](#2-プロンプト構造)
3. [人物プロンプト](#3-人物プロンプト)
4. [製品プロンプト](#4-製品プロンプト)
5. [カメラワーク](#5-カメラワーク)
6. [ライティング](#6-ライティング)
7. [オーディオ設計](#7-オーディオ設計)
8. [失敗例と対策](#8-失敗例と対策)
9. [実践テンプレート集](#9-実践テンプレート集)
10. [クイックリファレンス](#10-クイックリファレンス)

---

## 1. 基本概念

### 1.1 VEOプロンプトの基本思想

- **具体性を追求する**: 「美しい」より「金色の夕日が水面に反射している」
- **物理法則を記述する**: 形状、素材、光の反射・透過・屈折を定量的に定義
- **ライティングで質感を彫刻する**: 照明は製品の質感やフォルムを強調する最重要ツール
- **1クリップ1アクション**: 8秒以内の短いクリップに1-2の主要アクションのみ

### 1.2 出力仕様

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| アスペクト比 | 16:9 / 9:16 | 横長 / 縦長 |
| 解像度 | 1080p | 720pも可 |
| デュレーション | 4-8秒 | 8秒が最適 |
| FPS | 24 | 映画的 |

### 1.3 必須フォーマット

```
[被写体] + [アクション] + [環境] + [カメラ] + [ライティング] + [オーディオ] + [出力仕様]
```

末尾に必ず追加:
```
16:9, 1080p, 8s. No subtitles, no text overlay.
```

---

## 2. プロンプト構造

### 2.1 基本5要素

| 要素 | 説明 | 例 |
|------|------|-----|
| 映像 (Shot) | ショットタイプ、レンズ、動き | Medium shot, 50mm lens, slow dolly-in |
| 被写体 (Subject) | 人物/製品の詳細 | A professional woman in her 30s... |
| アクション (Action) | 動きと表情 | Walking confidently, smiling warmly |
| コンテキスト (Context) | 環境、時間、天気 | Modern office, morning light |
| スタイル (Style) | ムード、色調、雰囲気 | Professional, warm tones |

### 2.2 対話フォーマット

**必須構文:**
```
Speaking directly to camera saying: [セリフ]
```

**ルール:**
- コロン(:)を使い、引用符は避ける
- 1-2文、3-4秒以内
- 話者を名前で指定（複数キャラクター時）

**例:**
```
Speaking directly to camera saying: Today we're making fresh pasta.
```

---

## 3. 人物プロンプト

### 3.1 キャラクターバイブル（15属性以上）

**必須:** 同一キャラクターが登場する全クリップで完全にコピー＆ペースト

```json
{
  "character": {
    "identity": "32歳、女性、パリ出身の小説家",
    "face_structure": "卵形の顔、高い頬骨、シャープな顎",
    "eyes": "深い緑色、大きくアーモンド形、長いまつ毛",
    "nose_mouth": "高くストレートな鼻、薄い上唇",
    "skin": "色白、そばかすが少し、ポーセリンのような質感",
    "hair": "ダークブラウン、肩丈、無造作なウェーブ、左で分け目",
    "body_type": "スレンダー、引き締まっている",
    "distinctive_features": "左手首に鳥のタトゥー、右眉に傷跡",
    "clothing": {
      "top": "クリーム色のカシミアタートルネック、オーバーサイズ",
      "bottom": "ハイウエストのワイドレッグジーンズ",
      "accessories": "サファイアネックレス、シルバーリング"
    },
    "mannerisms": "考え事をするとき髪を指で巻く",
    "emotional_baseline": "内向的、観察眼が鋭い"
  }
}
```

### 3.2 感情表現の記述

**❌ NG:**
```
A sad person smiling.
```

**✅ OK:**
```json
{
  "expression": {
    "emotion": "内面的には悲しいが、社交的な笑顔を保っている",
    "eyes": "少し湿った状態、視線は遠くを見ている",
    "mouth": "社交的な笑顔、目の周りの筋肉は緊張",
    "overall_mood": "表面的には明るいが、深い悲しみが感じられる"
  }
}
```

### 3.3 アクション指定

**動詞ルール:**
- 能動的な動詞を使用（is standingではなく、standsやlooks up）
- マイクロアクション（brushes, flicks, hesitates）を含める
- 複数ビートは順序で記述（first → second → ...）

**例:**
```
loosens his scarf, looks up, and inhales slowly
```

---

## 4. 製品プロンプト

### 4.1 製品バイブル

**必須:** 同一製品が登場する全クリップで完全にコピー＆ペースト

```json
{
  "product": {
    "name": "Aura Smart Watch Model X",
    "category": "スマートウォッチ",
    "shape_and_dimensions": "直径44mm、厚さ10.7mm、円形ケース",
    "materials": {
      "body": "グレード5チタン、サテンブラッシュ仕上げ",
      "display": "サファイアクリスタル、反射防止コーティング",
      "strap": "フッ素エラストマー、チタン製バックル"
    },
    "colors_hex": {
      "body": "#8A8D8F",
      "strap": "#191970",
      "accent": "#FF4500"
    },
    "details": "右側面にデジタルクラウン、2つのスピーカーグリル",
    "logo": "背面に'Aura'レーザー刻印"
  }
}
```

### 4.2 素材別ライティング

| 素材 | ライティング | 効果 |
|------|-------------|------|
| 金属 | 硬めの光、スペキュラーハイライト | 反射性を強調 |
| ガラス | バックライト | 透明度を強調 |
| 布・革 | 柔らかい光 | 質感を強調 |
| プラスチック | 拡散光 | ソフトハイライト |

### 4.3 製品撮影テクニック

```
Macro close-up of smartwatch rotating 360 degrees on white marble pedestal.
Soft-box lighting from front-left, accent light on metallic edges.
Shallow depth of field keeps focus on product.
100mm macro lens, f/5.6.
```

---

## 5. カメラワーク

### 5.1 ショットタイプ

| タイプ | 用途 | 例 |
|--------|------|-----|
| Wide shot | 環境紹介、スケール | Wide establishing shot of city |
| Medium shot | アクション、対話 | Medium shot, waist-up |
| Close-up | 感情、ディテール | Close-up on face |
| Macro | 製品、質感 | Extreme close-up macro |

### 5.2 カメラ動作（1クリップ1動詞）

| 動作 | 効果 | プロンプト例 |
|------|------|-------------|
| Dolly-in | 強調、親密感 | Slow dolly-in ~10% over 6s |
| Pan | シーン探索 | Slow pan left over 8s |
| Tracking | 追従 | Tracking shot parallel at walking speed |
| Crane | スケール | Slow vertical rise over 6s |
| Static | 安定、フォーカス | Locked-off camera, tripod-steady |

### 5.3 焦点距離の効果

| 焦点距離 | 視覚効果 | 使用シーン |
|---------|---------|-----------|
| 24mm | 広角、環境強調 | 環境紹介、スケール感 |
| 35mm | 自然な見た目 | ナレーション、一般シーン |
| 50mm | 人間の視点 | 標準ドラマシーン |
| 85mm | ポートレイト、圧縮効果 | 感情的シーン |
| 100mm macro | テクスチャー強調 | 製品、ディテール |

### 5.4 3ビートナラティブ構造

**Clip 1 (Establish, 6-8s):**
```
Wide shot at eye-level, slow 10% dolly-in
Soft [directional source], [time/weather]
```

**Clip 2 (Action, 6-8s):**
```
Medium shot, shoulder-level tracking
Subject: [clear action]
Maintain lighting continuity
```

**Clip 3 (Reaction, 4-6s):**
```
Close-up, hold steady for emotion
Add subtle rack focus to eyes
Emphasize facial features
```

---

## 6. ライティング

### 6.1 3点照明の基本

| ライト | 役割 | 方向 |
|--------|------|------|
| Key Light | 主照明、形状定義 | 前方45度 |
| Fill Light | 影を柔らかく | キーの反対側 |
| Rim Light | 輪郭分離、3D感 | 背後 |

### 6.2 ライティングスタイル

**High-Key（明るい、親しみやすい）:**
```
High-key, soft diffused daylight, high fill, minimal shadows
```

**Low-Key（ドラマティック、ミステリアス）:**
```
Low-key, single hard key light from camera-left at 45°, minimal fill, deep contrast
```

**Golden Hour（暖かい、ロマンティック）:**
```
Golden-hour backlight, 3200K warm, rim light separating subject
```

### 6.3 色温度

| ケルビン | 説明 | 効果 |
|---------|------|------|
| 2700K | 白熱電球 | 非常に暖かい |
| 3200K | タングステン | 暖かい、ノスタルジック |
| 5000K | 中立 | ニュートラル |
| 5600K | 昼光 | 自然 |
| 6500K+ | 曇り | 涼しい、現代的 |

### 6.4 コピペ用ライティングレシピ

**ドラマティックロー キー:**
```
Low-key, single hard key light from camera left at 45°, minimal fill, deep contrast, cool blue grade, subtle rim light, 3200K tungsten key with 5600K cool rim, film noir aesthetic
```

**ゴールデンアワー:**
```
High-key, soft diffused daylight, warm golden hour tones, gentle shadows, natural skin tones, 3200K warm key, lifted blacks, slight halation, bloom effect
```

**ネオンシティ:**
```
Neon magenta and cyan gels, backlit rim, reflective puddles, soft haze, crisp specular highlights on wet asphalt, high contrast
```

---

## 7. オーディオ設計

### 7.1 オーディオ3層構造

| 層 | 説明 | 例 |
|----|------|-----|
| 環境音 | 背景、雰囲気 | Quiet office ambience, birds chirping |
| 効果音 | アクション連動 | Keyboard typing, footsteps |
| 音楽 | ムード設定 | Soft jazz music, low in the mix |

### 7.2 シーン別オーディオ例

**オフィスシーン:**
```
Audio: Soft keyboard typing, air conditioning hum, muffled phone conversations
```

**料理シーン:**
```
Audio: Water pouring, gentle sizzle, coffee shop ambiance, soft background music
```

**屋外シーン:**
```
Audio: Distant traffic, wind rustling leaves, birds chirping, ambient city sounds
```

---

## 8. 失敗例と対策

### 8.1 10大失敗パターン

| # | 失敗 | 原因 | 対策 |
|---|------|------|------|
| 1 | 曖昧な結果 | 具体性不足 | 詳細な描写を追加 |
| 2 | 曇った外観 | 矛盾する指定 | 1つのスタイルに統一 |
| 3 | 静的なカメラ | 動き指定なし | カメラ動作を明記 |
| 4 | 空のオーディオ | 音指定なし | 3層オーディオを追加 |
| 5 | リップシンク失敗 | 長いセリフ | 1-2文に短縮 |
| 6 | 一貫性崩壊 | 参照画像なし | 2-3枚の参照画像使用 |
| 7 | 物理破壊 | 長すぎるワンショット | 4-8秒クリップに分割 |
| 8 | フォーマット問題 | 出力仕様なし | AR/解像度/秒数を明記 |
| 9 | 品質低下 | 反復なし | Scene Builderで反復 |
| 10 | 生成失敗 | ポリシー違反 | 暴力的/露骨的内容を避ける |

### 8.2 人物プロンプト失敗例

**❌ 失敗:**
```
A woman with brown hair and blue eyes
```

**✅ 修正:**
```
A professional woman in her 30s, dark brown hair in loose waves reaching her shoulders, striking blue-green almond-shaped eyes, wearing a light-wash denim shirt with sleeves rolled up
```

### 8.3 製品プロンプト失敗例

**❌ 失敗:**
```
A sleek product on a pedestal
```

**✅ 修正:**
```
A smartwatch with midnight blue aluminum body, 45mm diameter, circular AMOLED display, sitting on white marble pedestal. Soft-box lighting from front-left, accent light on metallic edges.
```

---

## 9. 実践テンプレート集

### 9.1 説明動画テンプレート

```
Medium shot, [EXPERT] is holding a [DEVICE] (that's where the camera is) in [LOCATION]. They are [ACTION], demonstrating [TECHNIQUE]. The lighting is [STYLE], and the mood is [MOOD]. Speaking directly to camera saying: [DIALOGUE]. Audio: [SOUNDS], [AMBIENT], [MUSIC]. 16:9, 1080p, 8s. No subtitles, no text overlay.
```

### 9.2 製品レビューテンプレート

```
[SHOT TYPE], a [REVIEWER] is holding a camera (that's where the camera is) in front of [PRODUCT]. They are [ACTION], with [EXPRESSION]. The background is [SETTING], and the lighting is [STYLE]. Speaking directly to camera saying: [REVIEW]. Audio: [SOUNDS], [MUSIC]. 16:9, 1080p, 8s. No subtitles, no text overlay.
```

### 9.3 風景・旅行テンプレート

```
[CINEMATIC SHOT] of [LANDSCAPE], captured with [CAMERA MOVEMENT]. It's [TIME OF DAY], and the light creates [EFFECT]. The color palette is [COLORS], and the mood is [ATMOSPHERE]. Audio: [NATURAL SOUNDS], [MUSIC]. 16:9, 1080p, 8s. No subtitles, no text overlay.
```

### 9.4 JSON完全テンプレート（人物）

```json
{
  "output_specs": {
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "duration_seconds": 8
  },
  "character_bible": {
    "identity": "[年齢、性別、職業]",
    "face": "[顔の詳細]",
    "eyes": "[目の詳細]",
    "hair": "[髪の詳細]",
    "clothing": "[衣装の詳細]",
    "distinctive_features": "[特徴]"
  },
  "scene": "[環境の詳細]",
  "action": "[アクションの詳細]",
  "camera": {
    "shot_type": "[ショットタイプ]",
    "lens": "[焦点距離]",
    "movement": "[カメラ動作]"
  },
  "lighting": {
    "key": "[キーライト]",
    "fill": "[フィルライト]",
    "rim": "[リムライト]",
    "color_temp": "[色温度K]"
  },
  "audio": {
    "dialogue": "[セリフ]",
    "ambient": "[環境音]",
    "music": "[音楽]"
  },
  "style": "[全体スタイル]",
  "negative_prompt": "[排除要素]"
}
```

### 9.5 JSON完全テンプレート（製品）

```json
{
  "output_specs": {
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "duration_seconds": 8
  },
  "product_bible": {
    "name": "[製品名]",
    "shape": "[形状と寸法]",
    "materials": "[素材と仕上げ]",
    "colors_hex": {
      "body": "[HEX値]",
      "accent": "[HEX値]"
    },
    "details": "[ディテール]",
    "logo": "[ロゴ位置]"
  },
  "staging": "[配置と背景]",
  "action": "[動きとアニメーション]",
  "camera": {
    "shot_type": "[ショットタイプ]",
    "lens": "[焦点距離]",
    "movement": "[カメラ動作]"
  },
  "lighting": {
    "setup": "[セットアップスタイル]",
    "key": "[キーライト]",
    "fill": "[フィルライト]",
    "rim": "[リムライト]",
    "specular": "[スペキュラーハイライト]"
  },
  "audio": {
    "product_sounds": "[製品音]",
    "ambient": "[環境音]",
    "music": "[音楽]"
  },
  "style": "[全体スタイル]",
  "negative_prompt": "[排除要素]"
}
```

---

## 10. クイックリファレンス

### 10.1 チェックリスト（人物）

- [ ] キャラクターバイブルに15以上の属性
- [ ] 顔の特徴を解剖学的に記述
- [ ] 髪、服装、アクセサリーを具体的に
- [ ] 身体言語と姿勢を明確に
- [ ] 矛盾する指定がないか確認
- [ ] ライティング方向、色温度を指定
- [ ] オーディオ3層を指定
- [ ] 参照画像を準備（1-3枚）
- [ ] 出力仕様を明記

### 10.2 チェックリスト（製品）

- [ ] 製品の形状を寸法で指定
- [ ] 素材と表面処理を詳細に
- [ ] 色をHEX/RGB値で指定
- [ ] ディテールを位置まで明記
- [ ] 素材に合わせたライティング
- [ ] 背景はシンプルに
- [ ] 参照画像を準備（1-3枚）
- [ ] ネガティブスペースを確保
- [ ] 出力仕様を明記

### 10.3 対話フォーマット早見表

| 正しい形式 | 避けるべき形式 |
|-----------|---------------|
| `Speaking directly to camera saying: Hello.` | `"Hello"` |
| `Chef: Let's cook.` | `Chef says "Let's cook"` |
| 1-2文、3-4秒 | 長いパラグラフ |

### 10.4 ライティング早見表

| ムード | キーライト | フィル | リム | 色温度 |
|--------|-----------|--------|------|--------|
| 明るい | ソフトボックス | 高 | なし | 5000K |
| ドラマティック | 硬い、45度 | 最小 | あり | 3200K |
| ロマンティック | バックライト | 高 | 暖かい | 2700-3200K |
| 現代的 | ウィンドウ | 中 | 涼しい | 5600K |

### 10.5 よく使うフレーズ集

**カメラ:**
```
Medium shot, 50mm lens, slow dolly-in
Close-up, 85mm portrait lens, shallow DOF
Wide establishing shot, 24mm, slow pan left
```

**ライティング:**
```
Soft natural light from window, warm tones
Low-key, single key light at 45 degrees, high contrast
Golden hour backlight, rim light separating subject
```

**オーディオ:**
```
Audio: subtle ambient sounds, soft background music
Audio: footsteps on concrete, distant traffic, wind
Audio: keyboard typing, office ambiance, no music
```

**末尾:**
```
16:9, 1080p, 8s. No subtitles, no text overlay.
```

---

## 付録: 人物 vs 製品 比較表

| 要素 | 人物プロンプト | 製品プロンプト |
|------|---------------|---------------|
| 主要焦点 | 顔、表情、感情 | 形状、素材、ディテール |
| 一貫性管理 | キャラクターバイブル | 製品バイブル |
| ライティング目的 | 感情表現 | 質感強調 |
| カメラワーク | 表情を捉える | 製品を見せる（360度等） |
| 背景の役割 | ストーリーコンテキスト | 製品を引き立たせる |
| アクション | 自然な動き | 機能を見せる動き |
| 参照画像 | 必須（複数クリップ） | 強く推奨 |
| 失敗時の影響 | ストーリー崩壊 | ブランドイメージ損傷 |

---

*Last Updated: 2025-12*
