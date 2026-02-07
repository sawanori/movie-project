# VEO シーン動画用プロンプト・テンプレ（人物・ポートレート）

## 使い方
- 入力：**1枚の人物画像**（ベース画像として使用）
- 目的：**人物の魅力・表情・動きを引き出す8秒動画**を生成
- 重視：キャラクター一貫性、表情の変化、自然な動き、ポートレートの美しさ

---

## PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the absolute reference for identity preservation.
Maintain exact facial features, skin tone, hair color and style, outfit, and accessories.
This is NOT a creative reinterpretation - preserve the person as they appear.
Focus on subtle, natural movements that enhance portrait quality.
Avoid any face distortion, unnatural expressions, or identity drift.

CLIP SPECIFIC (edit only this block):
- Shot: [SHOT_TYPE + LENS + FRAMING] 例: Medium close-up, 85mm portrait lens, shallow DOF, subject on left third
- Camera: [MOVEMENT + DURATION + STYLE] 例: Slow dolly-in ~5% over 6s, tripod-steady, smooth motion
- Scene: [LOCATION + TIME + WEATHER] 例: Modern cafe interior, afternoon, soft overcast light through windows
- Subject: [POSE + ACTION] 例: Relaxed seated position, holding coffee cup (identity/outfit inherited from input image)
- Expression: [EMOTION + MICRO-ACTIONS] 例: Thoughtful contentment, subtle smile forming, eyes shift to window, natural blink
- Lighting: [KEY + FILL + RIM + COLOR_TEMP] 例: Soft window key from left at 5600K, minimal fill, warm rim from practical lights at 3200K
- Motion: [HAIR + FABRIC + BREATH + GESTURE] 例: Hair moves slightly with head turn, fabric settles naturally, visible breathing, finger taps cup
- Audio: [AMBIENT + EFFECTS + MUSIC] 例: Cafe ambiance, coffee cup clink, soft acoustic guitar low in mix
- Mood: [OVERALL_ATMOSPHERE] 例: Intimate, contemplative, warm and inviting
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

## NEGATIVE PROMPT
Avoid: Face distortion, unnatural skin tones, plastic skin texture, identity drift, exaggerated expressions, unnatural hand movements, blurry focus on face, sudden lighting changes, robotic movements.

---

## 例（人物ポートレート）

### 女性のポートレート - カフェシーン
CLIP SPECIFIC:
- Shot: Medium close-up, 85mm portrait lens, f/2.0, shallow DOF with bokeh, rule of thirds composition
- Camera: Slow dolly-in ~8% over 8s, smooth and steady, slight arc to left
- Scene: Cozy cafe corner, rainy afternoon, soft diffused light through rain-streaked window
- Subject: Seated at wooden table, warm mug in both hands, leaning slightly forward
- Expression: Peaceful contemplation, eyes gazing through window, soft smile emerges, quiet sigh
- Lighting: Cool 5600K window key from left, warm 2700K fill from cafe lights, subtle rim light on hair
- Motion: Steam rising from mug, rain trails on glass, gentle head tilt, natural breathing visible
- Audio: Rain on window, distant coffee machine, soft lo-fi music, muffled conversations
- Mood: Intimate solitude, cozy comfort, introspective warmth
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 男性のポートレート - ビジネスシーン
CLIP SPECIFIC:
- Shot: Medium shot, 50mm lens, f/2.8, subject centered, professional framing
- Camera: Slow push-in ~5% with subtle arc right, tripod-steady, confident pacing
- Scene: Modern glass office, morning golden hour, city skyline visible through floor-to-ceiling windows
- Subject: Confident relaxed stance, arms loosely crossed, facing window
- Expression: Quiet determination, thoughtful gaze at horizon, slight nod of resolve, professional warmth
- Lighting: Golden hour backlight 3200K through windows, soft fill from ceiling lights 5000K, strong rim on shoulders
- Motion: Subtle weight shift, natural breathing, slight head turn toward camera, tie fabric settles
- Audio: Quiet office ambience, distant city sounds, soft ventilation hum, no music
- Mood: Ambitious contemplation, professional confidence, new day potential
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 対話シーン
CLIP SPECIFIC:
- Shot: Close-up, 85mm lens, f/1.8, tight on face, eyes in sharp focus
- Camera: Static locked-off, tripod-steady, no movement to emphasize dialogue
- Scene: Neutral soft background, controlled studio environment, intimate setting
- Subject: Facing camera directly, relaxed shoulders, natural posture
- Expression: Warm conversational energy, eyes connect with camera, natural blinks, subtle eyebrow movement
- Lighting: Soft key from camera-left at 45°, high fill for even skin tone, subtle rim from back-right
- Motion: Natural head micro-movements, lips move naturally with speech, expressive hand gesture enters frame briefly
- Dialogue: Speaking directly to camera saying: [SHORT DIALOGUE 1-2 sentences, under 4 seconds]
- Audio: Clear voice, quiet room tone, no background music
- Mood: Authentic connection, direct communication, trustworthy presence
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

---

## ライティング早見表

| ムード | Key Light | Fill | Rim | 色温度 |
|--------|-----------|------|-----|--------|
| 自然・親しみ | Window soft, left 45° | High | Subtle warm | 5600K |
| ドラマティック | Hard, left 45° | Minimal | Cool back-right | 3200K key + 5600K rim |
| ロマンティック | Golden backlight | High warm | Warm hair rim | 2700-3200K |
| プロフェッショナル | Large softbox, front | Medium | Neutral | 5000K |
| 映画的 | Directional, motivated | Low for contrast | Strong separation | Mixed temps |

## カメラ設定早見表

| 目的 | Shot Type | Lens | Movement | DOF |
|------|-----------|------|----------|-----|
| 感情重視 | Close-up | 85mm | Static or slow push | Shallow f/1.8 |
| バランス | Medium | 50mm | Slow dolly | Medium f/2.8 |
| 環境+人物 | Wide | 35mm | Slow pan/arc | Deep f/4.0 |
| ディテール | Extreme CU | 100mm | Locked-off | Very shallow |
