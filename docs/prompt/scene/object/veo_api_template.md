# VEO シーン動画用プロンプト・テンプレ（物体・プロダクト）

## 使い方
- 入力：**1枚の物体/料理/製品画像**（ベース画像として使用）
- 目的：**物体の質感・ディテール・魅力を引き出す8秒動画**を生成
- 重視：素材の質感、光の反射/透過、プレミアム感、正確な色再現

---

## PROMPT（コピペ用テンプレ）

SINGLE IMAGE RULE (do not remove):
Use the source image as the absolute reference for product/object appearance.
Preserve exact shape, dimensions, material finish, color accuracy, and all visual details.
Maintain texture quality: metal reflections, glass transparency, fabric weave, food appeal.
This is NOT a creative reinterpretation - the object must look identical to the source.
Focus on movements that enhance product appeal without distorting the object.

CLIP SPECIFIC (edit only this block):
- Shot: [SHOT_TYPE + LENS + ANGLE + FRAMING] 例: Macro close-up, 100mm lens, f/5.6, product centered at 70% frame
- Camera: [MOVEMENT + DURATION + STYLE] 例: Slow 360-degree rotation over 8s, smooth orbit, product stays centered
- Scene: [BACKGROUND + STAGING + PROPS] 例: White marble pedestal, dark gradient studio, no distracting elements
- Subject: [ARRANGEMENT + POSITION] 例: Centered on pedestal, angled toward camera (object details inherited from input image)
- Texture: [SURFACE_QUALITY + MATERIAL_FEEL + HIGHLIGHTS] 例: Satin brushed metal, subtle specular highlights, sharp edge definition
- Lighting: [KEY + FILL + RIM + SPECULAR + COLOR_TEMP] 例: Large softbox from front-left at 5600K, grid strip fill right, hard rim for edge separation, specular accent on metal curves
- Motion: [PRODUCT_ACTION + LIGHT_SHIFT + AMBIENT_EFFECTS] 例: Product rotates slowly, light shifts across surface revealing texture, display activates mid-rotation
- Audio: [PRODUCT_SOUNDS + AMBIENT + MUSIC] 例: Subtle mechanical click, quiet studio ambience, minimal electronic music low in mix
- Mood: [OVERALL_ATMOSPHERE] 例: Premium, sophisticated, precision craftsmanship
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

## NEGATIVE PROMPT
Avoid: Fingerprints, scratches, dust, unnatural reflections, color inaccuracy, blurry texture details, wobbly movement, sudden lighting changes, background distractions, product shape distortion.

---

## 例（物体・プロダクト）

### 高級時計・スマートウォッチ
CLIP SPECIFIC:
- Shot: Extreme close-up, 100mm macro lens, f/5.6, watch centered, filling 75% of frame
- Camera: Slow orbit 180-degrees over 8s, camera moves while product stays static, reveals different angles
- Scene: Black gradient studio, reflective dark surface creating subtle mirror effect, minimal environment
- Subject: Centered on reflective surface, angled 30 degrees toward camera
- Texture: Brushed aluminum catching elongated specular highlights, crystal clarity, strap texture visible
- Lighting: Large softbox key at 45° left 5600K, grid strip fill right for shadow control, hard rim from back for edge separation, point light for specular accents on bezel
- Motion: Slow rotation reveals case sides, display illuminates showing UI animation, crown detail catches light
- Audio: Subtle electronic activation sound, quiet premium ambience, minimal ambient pad
- Mood: Luxury precision, technological elegance, premium craftsmanship
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 料理・フード
CLIP SPECIFIC:
- Shot: Close-up transitioning to 45-degree hero angle, 50mm lens, f/2.8, food centered with negative space
- Camera: Slow dolly-in ~15% over 8s, slight arc reveals depth, smooth steady motion
- Scene: Clean white marble surface, morning kitchen, natural light streaming through window, minimal props
- Subject: Centered on marble surface, steam rising gently
- Texture: Crispy flaky exterior catching light, visible layer separation, glossy butter sheen, soft interior glimpsed
- Lighting: Natural window light from right 5600K creating long shadows, white bounce fill left, warm backlight 3200K for rim glow on steam
- Motion: Steam rises gently from warm pastry, light shifts across golden surface, butter melts slowly, sugar particles catch light
- Audio: Subtle sizzle, soft crunch sound, kitchen ambience, no music
- Mood: Warm inviting morning, fresh artisanal quality, appetizing comfort
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### プレミアムヘッドフォン
CLIP SPECIFIC:
- Shot: Medium close-up, 85mm lens, f/4.0, product on stand at slight angle, professional framing
- Camera: Slow push-in ~10% with subtle arc, reveals ear cup detail, smooth controlled motion
- Scene: Dark gradient studio backdrop, modern display stand, controlled lighting environment
- Subject: On display stand, facing camera at slight angle
- Texture: Matte surface absorbing light evenly, leather grain visible, metal accent reflecting highlights
- Lighting: Soft key from front-left, controlled highlights on curves, rim light separating from dark background, subtle fill to preserve shadow detail
- Motion: Minimal rotation on stand, light gradually shifts to reveal different surface qualities, cushion settles slightly
- Audio: Soft mechanical movement, quiet studio ambience, no music or minimal electronic pad
- Mood: Premium audio experience, sophisticated design, professional quality
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### 飲み物・カクテル
CLIP SPECIFIC:
- Shot: Low angle looking up, 50mm lens, f/2.0, glass centered, dramatic framing
- Camera: Static with subtle arc left ~5%, emphasizes liquid movement, steady professional motion
- Scene: Dark bar counter, moody ambient lighting, bokeh lights in background, condensation on counter
- Subject: Centered on bar counter, condensation forming on glass
- Texture: Crystal facets refracting light, liquid clarity with color depth, ice texture sharp, condensation beads realistic
- Lighting: Backlight through liquid 3200K warm glow, side key on glass facets 5000K, rim on garnish, ambient bar lights for mood
- Motion: Ice shifts slowly, condensation droplet runs down glass, light refracts through liquid, garnish floats gently
- Audio: Ice clinking softly, liquid settling, bar ambience with distant conversations, soft jazz low in mix
- Mood: Sophisticated nightlife, crafted quality, refreshing anticipation
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

### スキンケア・コスメ製品
CLIP SPECIFIC:
- Shot: Macro close-up, 100mm lens, f/4.0, product at 60% frame, clean composition
- Camera: Slow dolly-in ~8% with slight rotation, reveals texture and label, smooth controlled
- Scene: Clean white or soft gradient backdrop, minimal staging, single product focus
- Subject: Centered on clean backdrop, label facing camera
- Texture: Frosted glass diffusing light, metallic cap reflecting environment, cream/serum texture if visible
- Lighting: Large overhead softbox 5000K for even illumination, side accent for dimension, backlight for glass glow, controlled specular on cap
- Motion: Product rotates slowly revealing label, light shifts across frosted surface, cap reflection changes
- Audio: Quiet premium ambience, subtle glass/metal movement, no music or minimal spa-like ambient
- Mood: Clean luxury, skincare efficacy, premium self-care
- Output: 16:9, 1080p, 8s. No subtitles, no text overlay.

---

## 素材別ライティングガイド

| 素材 | Key Light | Specular | 背景 | 特記事項 |
|------|-----------|----------|------|---------|
| 金属（光沢） | 大型ソフトボックス | 細長い反射ライン | ダーク | エッジライト必須、反射コントロール |
| 金属（マット） | 拡散光 | 控えめ | ダーク/ニュートラル | テクスチャを強調 |
| ガラス（透明） | バックライト | 屈折ポイント | 暗め | 内部から光らせる |
| ガラス（フロスト） | サイド/オーバーヘッド | 拡散グロー | 明るめ | 柔らかい透過光 |
| 革/布 | 角度のある光 | 最小限 | コントラスト | テクスチャの陰影を出す |
| 食品 | 自然光風 | 油/水の反射 | 清潔感 | 温かみ、新鮮さを演出 |
| プラスチック | 拡散光 | 適度なハイライト | 製品による | 反射と吸収のバランス |
| 液体 | バックライト | 屈折とカウスティクス | ダーク | 透明度と色を強調 |

## カメラ動作パターン

| 目的 | Movement | 速度 | 効果 |
|------|----------|------|------|
| 全体像紹介 | 360° orbit | Slow (8s) | 全角度を見せる |
| ディテール強調 | Slow push-in | Very slow | 質感に迫る |
| プレミアム感 | Subtle arc | Minimal | 高級感、安定感 |
| 機能紹介 | Static + zoom | Controlled | 動作を見せる |
| 雰囲気重視 | Dolly through | Medium | 環境との関係 |
