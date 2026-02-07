# VEO ストーリー動画プロンプトテンプレート（連続クリップ用）

## 概要

| 項目 | 内容 |
|------|------|
| 入力 | 参照画像（A=MASTER + B=PREVIOUS） |
| 出力 | 4〜8秒の連続動画クリップ |
| 推奨語数 | 50〜100単語 |
| 目的 | 結合前提で **同一人物・同一ロケ・同一ルック** を維持（連続性最優先） |

---

## VEOの基本原則

| 原則 | 説明 |
|------|------|
| **具体的に記述** | 「美しい」より「金色の夕日が水面に反射している」 |
| **物理法則を記述** | 形状、素材、光の反射・透過・屈折を定量的に定義 |
| **1クリップ1アクション** | 8秒以内に1-2の主要アクションのみ |
| **1クリップ1動詞** | カメラ動作は単一の動詞で（dolly-in, pan left など） |

---

## 参照画像の使い方

| 画像 | 役割 | 説明 |
|------|------|------|
| **Image A** | MASTER | 人物同一性 / 服装 / 世界観の基準 |
| **Image B** | PREVIOUS | 直前クリップからの連続性 / 小物配置 / レイアウト |

- **Clip 1**: Image A のみ使用
- **Clip 2以降**: Image A（MASTER）+ Image B（直前クリップ最終フレーム）

---

## プロンプト構造

```
[ショット設定] + [カメラ動作] + [シーン] + [被写体] + [表情/動き] + [ライティング] + [オーディオ] + [出力仕様]
```

**末尾に必ず追加:**
```
16:9, 1080p, 8s. No subtitles, no text overlay.
```

---

## TEXT PROMPT（人物用・デフォルト）

REFERENCE RULE (do not remove):
- Image A (first) is the MASTER reference for identity, wardrobe, and world design.
- Image B (second) is the PREVIOUS SCENE reference for continuity: exact outfit details, props, and layout.
- Keep the same person and same environment as a continuous scene.
- Maintain exact facial features, skin tone, hair color and style throughout.

CLIP SPECIFIC (edit only this block):
- Shot: [SHOT_TYPE + LENS + FRAMING] e.g. Medium close-up, 50mm lens, subject on left third
- Camera: [MOVEMENT + DURATION] e.g. Slow dolly-in ~10% over 6s, tripod-steady
- Scene: [WHERE + WHEN + ATMOSPHERE] e.g. Urban cafe, morning, soft window light
- Subject: [SAME PERSON + ACTION] e.g. Same person, seated, holding coffee (outfit inherited from input image)
- Expression: [EMOTION + MICRO-ACTIONS] e.g. Thoughtful contentment, subtle smile, eyes shift to window, natural blink
- Lighting: [KEY + FILL + RIM + COLOR_TEMP] e.g. Window key 5600K from left, warm fill 3200K, subtle rim on hair
- Motion: [HAIR + FABRIC + BREATH + GESTURE] e.g. Hair sways with head turn, visible breathing, finger taps cup
- Audio: [AMBIENT + EFFECTS + MUSIC] e.g. Cafe ambiance, cup clink, soft acoustic guitar low in mix
- Mood: [OVERALL_ATMOSPHERE] e.g. Intimate, contemplative
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

---

## NEGATIVE PROMPT（人物用）

Avoid: Face distortion, unnatural skin tones, plastic skin texture, identity drift, exaggerated expressions, unnatural hand movements, blurry focus on face, sudden lighting changes, robotic movements.

---

## 物体・プロダクト用テンプレート（代替）

物体・製品撮影の場合は以下のテンプレートを使用：

REFERENCE RULE (do not remove):
- Image A (first) is the MASTER reference for product appearance, color, texture, and dimensions.
- Image B (second) is the PREVIOUS SCENE reference for continuity: lighting setup, background, arrangement.
- Maintain consistent product presentation: exact shape, materials, finish, and color accuracy.

CLIP SPECIFIC (edit only this block):
- Shot: [SHOT_TYPE + LENS + ANGLE] e.g. Macro close-up, 100mm lens, f/5.6, product centered at 70% frame
- Camera: [MOVEMENT + DURATION] e.g. Slow orbit 180-degrees over 8s, smooth and steady
- Scene: [BACKGROUND + STAGING] e.g. Dark gradient studio, white marble pedestal, minimal environment
- Subject: [OBJECT + MATERIAL + KEY_DETAILS] e.g. Smartwatch, brushed titanium body, sapphire crystal display
- Texture: [SURFACE_QUALITY + HIGHLIGHTS] e.g. Satin brushed metal, subtle specular highlights, sharp edge definition
- Lighting: [KEY + FILL + RIM + SPECULAR] e.g. Large softbox 5600K from front-left, hard rim for edge separation
- Motion: [PRODUCT_ACTION + LIGHT_SHIFT] e.g. Product rotates slowly, light reveals texture, display activates
- Audio: [PRODUCT_SOUNDS + AMBIENT + MUSIC] e.g. Subtle click, quiet studio ambience, minimal electronic pad
- Mood: [OVERALL_ATMOSPHERE] e.g. Premium, sophisticated
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

**NEGATIVE PROMPT（物体用）:**
Avoid: Fingerprints, scratches, dust, unnatural reflections, color inaccuracy, blurry texture details, wobbly movement, sudden lighting changes, background distractions, product shape distortion.

---

## 成功率一覧

### 人物アクション

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 歩く・走る | 85-95% | 低 |
| 視線移動・まばたき | 90-95% | 低 |
| 頭を傾ける・振り向く | 85-95% | 低 |
| 表情変化（微笑み等） | 75-85% | 中 |
| 会話（リップシンク） | 60-75% | 中 |
| 複数人の相互作用 | 55-70% | 高 |
| 細かい手指の動き | 50-65% | 高 |

### 物体アクション

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 回転（180度） | 85-95% | 低 |
| 浮遊・上下移動 | 80-90% | 低 |
| ズーム・ドリー | 85-95% | 低 |
| 光の変化・反射シフト | 80-90% | 低 |
| 360度回転 | 60-75% | 中 |
| ディスプレイ表示切替 | 50-70% | 高 |

---

## カメラワーク早見表（1クリップ1動詞）

| カメラワーク | 説明 | プロンプト例 |
|--------------|------|-------------|
| 固定 | 完全に動かない | `Locked-off camera, tripod-steady` |
| ドリーイン | 被写体に接近 | `Slow dolly-in ~10% over 6s` |
| ドリーアウト | 被写体から離れる | `Slow dolly-out ~10% over 6s` |
| パン | 左右に振る | `Slow pan left over 8s` |
| ティルト | 上下に振る | `Slow tilt up over 6s` |
| クレーン | 垂直移動 | `Slow vertical rise over 6s` |
| アーク | 被写体の周りを弧を描く | `Slow arc left over 8s` |
| トラッキング | 被写体を追従 | `Tracking shot parallel at walking speed` |

---

## ライティング早見表

| ムード | Key Light | Fill | Rim | 色温度 |
|--------|-----------|------|-----|--------|
| 自然・親しみ | Window soft, left 45° | High | Subtle warm | 5600K |
| ドラマティック | Hard, left 45° | Minimal | Cool back-right | 3200K key + 5600K rim |
| ロマンティック | Golden backlight | High warm | Warm hair rim | 2700-3200K |
| プロフェッショナル | Large softbox, front | Medium | Neutral | 5000K |
| 映画的 | Directional, motivated | Low for contrast | Strong separation | Mixed temps |

---

## オーディオ3層構造

| 層 | 説明 | 例 |
|----|------|-----|
| 環境音 | 背景、雰囲気 | Quiet cafe ambience, birds chirping |
| 効果音 | アクション連動 | Cup clink, footsteps, keyboard typing |
| 音楽 | ムード設定 | Soft jazz music, low in the mix |

---

## 実例集

### 例1：人物ストーリー（駅ホーム・Clip 1）

**Image A のみ使用**

CLIP SPECIFIC:
- Shot: Wide-medium, 35mm spherical lens, subject on right third, shallow DOF
- Camera: Slow dolly left ~10% over 8s, smooth and steady
- Scene: Urban commuter platform, dawn 07:30, gentle mist, train exhaust drifting through sunbeam
- Subject: Same person, standing with phone at side, looking down the tracks
- Expression: Calm anticipation, subtle stillness, natural breathing, occasional blink
- Lighting: Low sun 3200K from camera left, dim sodium platform lights 2700K, soft rim from morning haze
- Motion: Hair moves slightly with wind, coat fabric settles, visible breath in cold air
- Audio: Distant train announcement, platform ambience, wind, no music
- Mood: Quiet anticipation, early morning solitude
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 例2：人物ストーリー（駅ホーム・Clip 2）

**Image A (MASTER) + Image B (Clip 1最終フレーム)**

CLIP SPECIFIC:
- Shot: Medium close-up, 50mm spherical lens, over-shoulder angle, shallow DOF
- Camera: Slow arc-in ~8% over 8s, subtle handheld micro-movement
- Scene: Same platform, same dawn haze, train braking to a stop in background mist
- Subject: Same person turns slightly toward camera, phone screen catches reflection
- Expression: Eyes flick upward toward something unseen, slight curiosity, natural blink
- Lighting: Low sun 3200K from camera left (matching previous), dim sodium platform lights, soft train headlight glow
- Motion: Continuous layout from previous shot, haze retention, head turn subtle and natural
- Audio: Train braking sound, platform ambience, soft mechanical hiss, no music
- Mood: Awakening interest, narrative shift
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 例3：料理ストーリー（ラテアート・Clip 1）

**Image A のみ使用**

CLIP SPECIFIC:
- Shot: Close-up transitioning to 45-degree hero angle, 50mm lens, f/2.8, centered with negative space
- Camera: Slow dolly-in ~15% over 8s, slight arc reveals depth
- Scene: Clean white marble surface, morning kitchen, natural light streaming through window
- Subject: Freshly prepared latte art, perfect rosetta pattern, ceramic cup with handle visible
- Texture: Creamy foam texture catching light, glossy coffee surface, warm ceramic cup glaze
- Lighting: Natural window light 5600K from right, white bounce fill left, warm backlight 3200K on steam
- Motion: Steam rises gently from warm coffee, light shifts across golden foam, subtle foam movement
- Audio: Quiet cafe ambience, soft steam sound, no music
- Mood: Warm inviting morning, fresh artisanal quality
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 例4：商品ストーリー（腕時計・Clip 2）

**Image A (MASTER) + Image B (Clip 1最終フレーム)**

CLIP SPECIFIC:
- Shot: Extreme close-up, 100mm macro lens, f/5.6, watch filling 75% of frame
- Camera: Slow arc right 90-degrees over 8s, reveals side profile, smooth controlled motion
- Scene: Same minimalist studio backdrop as previous, product photography setup continues
- Subject: Luxury watch on display stand, 44mm titanium case brushed finish, sapphire crystal display, navy strap
- Texture: Brushed aluminum catching elongated specular highlights, crystal clarity, strap texture visible
- Lighting: Large softbox key 5600K at 45° left (matching previous), grid strip fill right, hard rim for edge separation
- Motion: Slow rotation reveals case sides, display illuminates showing time, crown detail catches light
- Audio: Subtle electronic activation sound, quiet studio ambience, minimal ambient pad
- Mood: Luxury precision, technological elegance
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

---

## 失敗パターンと修正法

### 人物編

#### ❌ 曖昧なキャラクター記述
| 失敗 | `A woman with brown hair and blue eyes` |
|------|------|
| 原因 | 具体性不足で一貫性を維持できない |
| 修正 | `A professional woman in her 30s, dark brown hair in loose waves reaching shoulders, striking blue-green almond-shaped eyes, wearing a light-wash denim shirt` |

#### ❌ 長すぎるセリフ
| 失敗 | `Speaking directly to camera saying: Today I want to explain in detail how this amazing product works and why you should buy it.` |
|------|------|
| 原因 | リップシンク失敗、3-4秒が限界 |
| 修正 | `Speaking directly to camera saying: This is why I love it.` |

#### ❌ 複合カメラアクション
| 失敗 | `Camera dollies in while panning left and tilting up` |
|------|------|
| 原因 | 1クリップ1動詞ルール違反 |
| 修正 | `Slow dolly-in ~10% over 6s` |

#### ❌ 連続性の無視
| 失敗 | Clip 2で全く別の服装や場所を指定 |
|------|------|
| 原因 | Image Bからの連続性が無視される |
| 修正 | `Same traveler` `Same platform` `matching previous` など連続性を明示 |

### 物体編

#### ❌ 素材の曖昧な記述
| 失敗 | `A sleek product on a pedestal` |
|------|------|
| 原因 | 素材・寸法の具体性不足 |
| 修正 | `A smartwatch with midnight blue aluminum body, 45mm diameter, circular AMOLED display, sitting on white marble pedestal` |

#### ❌ ライティングの不一致
| 失敗 | Clip 1で左からの光、Clip 2で右からの光 |
|------|------|
| 原因 | 連続性崩壊 |
| 修正 | `5600K from front-left (matching previous)` と明示 |

---

## 連続性チェックリスト

- [ ] REFERENCE RULEブロックは維持されているか
- [ ] Image A（MASTER）の参照は正しいか
- [ ] Clip 2以降でImage B（PREVIOUS）を参照しているか
- [ ] 「Same」キーワードで連続性を明示しているか（Same traveler, Same platform等）
- [ ] ライティング方向は前クリップと一致しているか（matching previous）
- [ ] 色温度は一貫しているか
- [ ] カメラアングルは自然に続いているか
- [ ] 服装・小物の配置は一貫しているか

---

## プロンプト品質チェックリスト

- [ ] 1クリップ1アクション（8秒以内）
- [ ] カメラ動作は1動詞のみ
- [ ] ショットタイプとレンズを明記
- [ ] ライティングの方向と色温度を指定
- [ ] オーディオ3層（環境音・効果音・音楽）を記載
- [ ] 出力仕様を末尾に追加（16:9, 1080p, 8s）
- [ ] 矛盾する指定がないか確認

---

*Last Updated: 2025-12*
