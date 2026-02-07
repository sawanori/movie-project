# Kling AI プロンプト作成 - ベストプラクティス統合ガイド

## 概要

本ドキュメントは、Kling AI公式ガイド、Leonardo AI、Artlist、Atlabs AI、Reddit、Qiita、Zennなど、複数の信頼性の高いソースから収集した情報を統合し、Kling AIの動画生成プロンプト作成における最高のプラクティスをまとめたものです。

---

## 1. プロンプト作成の基本フォーミュラ

### 1.1 Kling AI公式フォーミュラ

Kling AI公式ガイドが提示する基本フォーミュラは以下の通りです：

```
Prompt = Subject（Subject Description）+ Subject Movement + Scene（Scene Description）
         + （Camera Language + Lighting + Atmosphere）
```

括弧内の要素はオプションですが、より高品質な結果を得るためには含めることが推奨されます。

### 1.2 各要素の詳細定義

| 要素 | 定義 | 重要性 | 例 |
|------|------|--------|-----|
| **Subject** | ビデオの主要な焦点。人物、動物、植物、物体など | 必須 | 「A giant panda」「A young woman」 |
| **Subject Description** | 主体の外観、ポーズ、特徴。複数の短い文で記述 | 必須 | 「wearing black-rimmed glasses」「dressed in summer attire」 |
| **Subject Movement** | 主体の動きの状態。5秒のビデオに適した直接的な説明 | 必須 | 「reading a book」「sprinting across a field」 |
| **Scene** | 主体が置かれている環境。前景、背景、その他の要素 | 必須 | 「a café」「a misty forest」 |
| **Scene Description** | シーンの詳細。5秒で表示可能な内容 | 推奨 | 「with a steaming cup of coffee beside it」 |
| **Camera Language** | カメラレンズの応用、ショット間の遷移、編集 | 推奨 | 「medium shot」「slow push-in」「aerial view」 |
| **Lighting** | 光と影の応用。写真作品に魂を与える要素 | 推奨 | 「soft golden-hour light」「harsh neon glow」 |
| **Atmosphere** | ビデオの気分とトーン | 推奨 | 「serene and hopeful」「eerie and tense」 |

---

## 2. 段階的なプロンプト作成アプローチ

### 2.1 レベル1：基本プロンプト（シンプル）

最小限の要素で構成。初心者向けまたはシンプルなシーン向け。

**例：**
```
A giant panda is reading a book in a café.
```

**特徴：**
- 主体、動き、シーンのみ
- 短く、理解しやすい
- 基本的な結果を得られる

### 2.2 レベル2：中級プロンプト（詳細化）

主体とシーンの詳細を追加。より具体的な結果を期待。

**例：**
```
A giant panda wearing black-framed glasses is reading a book in a café, with the book placed on the table. On the table, there is also a cup of coffee emitting steam, and next to it is the café's window.
```

**特徴：**
- 主体の詳細説明を追加
- シーンの詳細を具体化
- より予測可能な結果

### 2.3 レベル3：上級プロンプト（映画的）

カメラ言語、照明、雰囲気を追加。シネマティックな結果を期待。

**例：**
```
In the shot, a medium shot with a blurred background and ambient lighting captures a scene where a giant panda, adorned with black-framed glasses, is reading a book in a café. The book rests on the table, accompanied by a cup of coffee that's steaming gently. Beside the cozy setting is the café's window, with a cinematic color grading applied to enhance the visual appeal.
```

**特徴：**
- カメラ言語（medium shot、blurred background）を指定
- 照明（ambient lighting）を明示
- 色彩グレーディングなどの映画的要素を含む
- プロフェッショナルな結果を期待

---

## 3. 映画的なカメラ動きの指定方法

### 3.1 カメラ動きの原則

**重要な原則：すべてのカメラ動きは動機付けられ、明確な目的を持つべき**

ただカメラを動かすだけでは意味がありません。各動きには以下の目的のいずれかを持つべきです：

| 目的 | 説明 | 例 |
|------|------|-----|
| **アクションを表示** | 被写体の動きに追従 | 「tracking shot that stays with a character as they run down a hallway」 |
| **情報を明かす** | 画面外のものを明かす | 「slow pan that moves from a character's face to reveal the person standing behind them」 |
| **感情を表示** | キャラクターの内的状態を強調 | 「slow push-in to create intimacy or show a character's moment of realization」 |
| **視点を表示** | キャラクターの視点をシミュレート | 「handheld shot that looks around a room as if through the character's own eyes」 |

### 3.2 主要なカメラ動き

#### Pan & Tilt（パンとチルト）

**パン（水平回転）**
- 用途：環境の観察、スケール感の確立、動機付けられた情報の明かし
- プロンプト例：「The camera pans slowly to the right, revealing a massive clue board on the wall」
- 効果：サスペンスの構築、視聴者の期待管理

**チルト（垂直回転）**
- 用途：垂直スケールや力学の伝達
- チルトアップ（ローアングル）：強力、支配的、英雄的に見える
- チルトダウン（ハイアングル）：弱い、脆弱、劣った見える
- プロンプト例：「Start with a low angle and use a slow tilt up that ends on the sky」

#### Push In & Pull Out（ドリー）

**ドリーショット**
- 定義：カメラ全体を物理的に空間を通して移動
- ズームとの違い：ズームはレンズの焦点距離を変えるだけで不自然に見える
- 用途：近接性を操作し、視聴者の感情的な関係を変える
- プロンプト例：「slow push-in on a character's face」

#### Tracking & Trucking（トラッキング）

**トラッキング**
- 定義：カメラが被写体に平行に移動
- 用途：被写体の動きに追従

**トラッキング（横移動）**
- 定義：カメラが被写体の周りを移動
- 用途：環境の探索、複数の被写体間の関係を示す

#### Boom & Crane（ブーム＆クレーン）

- 定義：カメラが垂直に上下に移動（ブーム）または大規模な垂直移動（クレーン）
- 用途：スケール感、権力の動学、劇的な明かし

#### Arc Shot（アークショット）

- 定義：カメラが被写体の周りを円形に移動
- 用途：被写体の周りの環境を探索、360度の視点を提供

### 3.3 カメラ動きの指定方法

**具体的な指示を使用する：**
- ❌ 「カメラが動く」
- ✅ 「slow push-in」「drone follow」「lateral track」

**動きの速度を指定する：**
- 「slowly」「gradually」「quickly」「smoothly」「jerkily」

**動きの方向を指定する：**
- 「to the right」「upward」「around」「toward」「away from」

---

## 4. 照明と雰囲気の効果的な指定

### 4.1 照明の種類と効果

| 照明タイプ | 説明 | 効果 | プロンプト例 |
|-----------|------|------|------------|
| **環境光** | 周囲全体を照らす柔らかい光 | 自然で落ち着いた | 「ambient lighting」 |
| **朝日** | 東からの柔らかい光 | 希望的、新しい始まり | 「soft morning light」 |
| **夕焼け** | 西からの暖かい光 | ロマンティック、ノスタルジック | 「bathed in sunset gold」 |
| **光と影の相互作用** | 光と暗さのコントラスト | ドラマティック、深い | 「interplay of light and shadow」 |
| **ティンダル効果** | 光線が粒子を通して見える | 神秘的、美しい | 「Tyndall effect」 |
| **人工照明** | ランプ、ネオン、LED | 都市的、人工的 | 「harsh neon glow」「warm lamplight」 |

### 4.2 色温度と感情

| 色温度 | 感情 | 用途 | プロンプト例 |
|--------|------|------|------------|
| **暖色（オレンジ、黄色）** | 暖かい、親密的、居心地の良い | ロマンス、快適さ | 「warm golden tones」 |
| **冷色（青、紫）** | 冷たい、距離的、神秘的 | サスペンス、孤独 | 「cool blue tones」 |
| **中立色（グレー、白）** | 中立的、客観的 | ドキュメンタリー、リアリズム | 「neutral tones」 |

### 4.3 雰囲気の設定

**感情的なトーンを織り交ぜる：**
- 「serene and hopeful」（穏やかで希望的）
- 「eerie and tense」（不気味で緊張した）
- 「joyful and energetic」（喜びに満ちた、エネルギッシュ）
- 「melancholic and introspective」（メランコリックで内省的）
- 「cinematic and dramatic」（映画的でドラマティック）

**具体的な環境の詳細を追加：**
- 「rain pattering against fogged windows」（雨が曇ったウィンドウに打ちつけている）
- 「leaves rustling in a gentle wind」（葉が優しい風でそよ風）
- 「waves crashing on the shore」（波が岸に打ち寄せている）

---

## 5. 実践的なプロンプト作成のコツ

### 5.1 DO（すべきこと）

✅ **具体的で行動ベースの言語を使用**
- 「sprints」「glides」「jerks」などの動的な動詞を使用
- 例：「Woman sprints across a field」vs「Woman runs」

✅ **シンプルで直線的な文構造を使用**
- 複雑な文構造を避ける
- 1つの単一の段落（長いプロンプトではない）を使用
- 短い、シンプルな文で見えるものと動き方を説明

✅ **1つの明確なヒーローを選ぶ**
- 複数の被写体よりも1つの主要な被写体に焦点を当てる
- 例：「a joyful kid on a red bike」vs「people in a park」

✅ **視覚的な詳細を追加**
- 色、テクスチャ、形状を具体的に説明
- 例：「flowing scarf」「rusty old truck」「porcelain face」

✅ **カメラと照明のキューを含める**
- 例：「Low-angle tracking shot, neon reflections on wet pavement」

✅ **1～2つの小道具またはテクスチャを追加**
- 例：「mic arm」「marble」「vinyl wall」
- リアリティを高める

✅ **感覚的な詳細を使用**
- 視覚的な詳細に焦点を当てるが、動きを暗示する
- 例：「leaves rustling in a gentle wind」は動きを暗示

### 5.2 DON'T（避けるべきこと）

❌ **曖昧な形容詞を使用**
- 「beautiful」「nice」「cool」「good」などの広い用語
- 代わりに具体的な説明を使用
- 例：「Soft blue tones with a shallow depth of field」vs「nice lighting」

❌ **複数のアクションを一度に含める**
- 1つのヒーローアクションを選ぶ
- 二次的なモーションのみをヒント
- 複数のシーンが必要な場合は別々に生成

❌ **ネガティブプロンプトで「no」を使用**
- ダブルネガティブになり、ポジティブプロンプトになる
- 例：「no wind」ではなく「wind」と入力

❌ **スタイル不一致**
- アニメ/イラストを望む場合は明示的に言う
- カメラノートを保つ

❌ **照明計画なし**
- 光源を指定する（ランプ、窓、ネオン）
- 具体的な照明の質を説明

---

## 6. Text-to-Video vs Image-to-Video

### 6.1 Text-to-Video (TTV)

**構造：**
```
Subject + Subject Description + Subject Action + Scene + Scene Description 
+ Camera Language + Lighting + Mood + Duration
```

**重要なポイント：**
- 1つの主要なアクションを保つ
- 5～10秒の範囲で実現可能な内容
- すべての要素を明確に指定

**例：**
```
A young woman with flowing red hair, wearing a white summer dress, walks slowly along a misty forest trail lined with ancient oaks at dawn. Soft morning light filters through the trees, creating a ethereal atmosphere. The camera follows her from behind with a gentle tracking shot, revealing the path ahead. Cinematic, serene, and hopeful mood.
```

### 6.2 Image-to-Video (I2V)

**構造：**
- 何が動くべきか（変化するもの）
- 何が固定されるべきか（変わらないもの）
- カメラがどのように既存の画像の周りで動作するか

**重要なポイント：**
- 既存の画像の構成を尊重
- 動きの種類を明確に指定
- カメラの動きと被写体の動きを区別

**例：**
```
The woman in the image begins to walk forward down the path. The camera follows her with a gentle tracking shot, revealing more of the forest ahead. The trees and mist remain static in the background. Duration: 5 seconds.
```

---

## 7. Kling AIモデルの選択

### 7.1 各モデルの特徴と用途

| モデル | 用途 | 特徴 | 推奨シーン |
|--------|------|------|----------|
| **Kling 1.6** | 日常的なコンテンツ | 基本的な機能 | ライフスタイル、プロダクトデモ、シンプルなアニメーション |
| **Kling 2.1** | コマーシャル・ミュージックビデオ | リアルなモーション、ダイナミックなカメラワーク | 商業用、音楽ビデオ |
| **Kling 2.1 Master** | シネマティック制作 | プロフェッショナルグレードのビジュアル、高度なモーション制御 | トレーラー、ストーリーテリング |
| **Kling 2.5 Turbo** | 高度なシネマティック制作 | 正確なモーション制御、リアルな物理、一貫した視覚品質 | 広告、高品質制作 |
| **Kling O1** | ビデオコンポジティング | 厳密な一貫性と連続性 | 複数フレームの一貫性が必要 |
| **Kling 2.6 Pro** | 広告・高品質制作 | シネマティックビジュアル、流動的なモーション、完全に同期されたサウンド | 高品質広告、商業制作 |

---

## 8. よくある落とし穴と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 曖昧なカメラノート | カメラ動きが指定されていない | 具体的なムーブを指定：「slow push-in」「drone follow」「lateral track」 |
| 一度に多すぎるアクション | 複数のアクションを同時に説明 | 1つのヒーローアクションを選ぶ、二次的なモーションのみをヒント |
| 照明計画なし | 照明が指定されていない | 光源を選ぶ、説明する（ランプ、窓、ネオン） |
| アンカーなし | 具体的な詳細がない | 1～2つの小道具またはテクスチャを追加（マイクアーム、大理石、ビニール壁） |
| スタイル不一致 | スタイルが明確でない | アニメ/イラストを言う、カメラノートを保つ |
| 複数シーンの失敗 | 1つのプロンプトで複数のシーン | 各シーンを別々に生成 |
| 予期しない要素の追加 | AIが推測を強いられている | より詳細で具体的なプロンプトを使用 |
| 物理的な不自然さ | リアルな物理が指定されていない | 重力、流体、光の振る舞いを具体的に説明 |

---

## 9. プロンプト作成のチェックリスト

プロンプトを送信する前に、以下をチェックしてください：

### 基本要素
- [ ] **Subject（主体）**が明確に定義されているか
- [ ] **Subject Description（主体の説明）**が具体的か
- [ ] **Subject Movement（主体の動き）**が明確か
- [ ] **Scene（シーン）**が明確に定義されているか
- [ ] **Scene Description（シーン説明）**が具体的か

### 映画的要素
- [ ] **Camera Language（カメラ言語）**が指定されているか
- [ ] カメラ動きが**動機付けられている**か
- [ ] **Lighting（照明）**が具体的に説明されているか
- [ ] **Atmosphere（雰囲気）**が感情的に定義されているか

### 品質チェック
- [ ] 複雑な文構造を避けているか
- [ ] 曖昧な形容詞を避けているか
- [ ] 具体的で行動ベースの言語を使用しているか
- [ ] 1つの明確なヒーローアクションに焦点を当てているか
- [ ] 1～2つの具体的な小道具またはテクスチャを含めているか

### 技術的チェック
- [ ] プロンプトが5～10秒で実現可能か
- [ ] 複数のアクションを一度に含めていないか
- [ ] ネガティブプロンプトで「no」を使用していないか
- [ ] 適切なモデルを選択しているか

---

## 10. 実践例

### 例1：シンプルなプロンプト

**用途：** 初心者、シンプルなシーン

```
A cat sits on a windowsill, looking outside at the garden. Soft morning light streams through the window.
```

### 例2：中級プロンプト

**用途：** 中級者、より詳細な結果を期待

```
A fluffy orange cat with green eyes sits on a wooden windowsill, gazing intently at birds in a blooming garden outside. Soft golden morning light streams through the window, creating a warm glow on the cat's fur. The scene is peaceful and serene.
```

### 例3：上級プロンプト（映画的）

**用途：** 上級者、シネマティックな結果を期待

```
A strikingly beautiful fluffy orange tabby cat with piercing green eyes sits perched on a worn wooden windowsill, gazing intently at birds fluttering among blooming cherry blossoms in a sunlit garden outside. Soft golden morning light streams through the window pane, creating a warm, ethereal glow that illuminates the cat's luxurious fur and highlights its whiskers. The camera slowly pushes in on the cat's face with a shallow depth of field, blurring the garden background. Warm, peaceful, and contemplative mood. Cinematic color grading with rich highlights and soft shadows.
```

### 例4：アクション中心のプロンプト

**用途：** ダイナミックなモーション

```
A young athlete in a red sports outfit sprints across a sunlit track, their muscles tensed with effort. The camera tracks alongside them with a dynamic lateral shot, capturing their powerful stride. Morning light glints off their sweat-dampened skin. The atmosphere is intense and energetic.
```

### 例5：感情中心のプロンプト

**用途：** 感情的な表現

```
A woman with tousled auburn hair sits on a worn velvet chaise in a dimly lit Victorian parlor, rain pattering against fogged antique windows. Her emerald eyes glisten with unshed tears, lips parted in quiet vulnerability as a single droplet traces her cheek. Raw heartbreak etched in every quiver. Medium two-shot from a slight low angle, desaturated teal and amber color grading for a melancholic cinematic haze. Soft key light casting long shadows across faded wallpaper. Intimate, sorrowful, and fragile.
```

---

## まとめ

Kling AIで高品質な動画を生成するためには、以下の原則が重要です：

1. **明確な構造を使用する**：Subject、Movement、Scene、Camera、Lighting、Atmosphereの要素を含める
2. **具体的で行動ベースの言語を使用する**：曖昧な形容詞を避ける
3. **シンプルで直線的な文構造を使用する**：複雑な文を避ける
4. **1つの明確なヒーローアクションに焦点を当てる**：複数のアクションを避ける
5. **カメラ動きを動機付ける**：すべてのカメラ動きに目的を持たせる
6. **具体的な照明と雰囲気を指定する**：感情的なトーンを織り交ぜる
7. **段階的にプロンプトを詳細化する**：シンプルなプロンプトから始めて、必要に応じて詳細を追加

これらのプラクティスに従うことで、Kling AIの潜在能力を最大限に引き出し、プロフェッショナルで映画的な動画を生成できます。

