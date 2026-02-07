# Runway Gen-4 Image to Video 完全ガイド

## 目次
1. [基本情報](#1-基本情報)
2. [プロンプト設計の基本原則](#2-プロンプト設計の基本原則)
3. [プロンプト要素の詳細](#3-プロンプト要素の詳細)
4. [人物編：テンプレートとテクニック](#4-人物編テンプレートとテクニック)
5. [モノ編：テンプレートとテクニック](#5-モノ編テンプレートとテクニック)
6. [人物 vs モノ：比較と選択基準](#6-人物-vs-モノ比較と選択基準)
7. [失敗事例と修正法](#7-失敗事例と修正法)
8. [応用テクニック](#8-応用テクニック)

---

## 1. 基本情報

### 1.1 Gen-4の概要

| 項目 | 詳細 |
|------|------|
| 公開時期 | 2025年3月31日 |
| 生成時間 | 10秒動画で約12〜15秒（Turboではさらに短縮） |
| 費用 | 約5クレジット/秒 |
| 無料版対応 | 不可（有料・Enterpriseユーザー向け） |
| 主要機能 | Text to Video、Image to Video、References機能 |

### 1.2 Gen-4での進化ポイント

- **動きの自然さ**: 歩く・走る・振り返る・笑う・泣くといった感情を伴う動作表現がリアルに
- **スピード感**: 人間の動作に近いスピード感と滑らかさを実現
- **表情のリアリティ**: 自然な感情表現が可能に
- **一貫性**: キャラクター・背景・オブジェクトの一貫性が向上
- **破綻の減少**: 不自然な動きや表現が減少

### 1.3 基本的な使い方

1. **Gen-4を選択**: Generative Sessionを開き、モデルドロップダウンからGen-4を選択
2. **画像をアップロード**: 動画の最初のフレームとして使用する画像をアップロード
3. **アスペクト比**: 複数のアスペクト比をサポート（アップロード画像に自動準拠、変更可能）
4. **プロンプト入力**: シーンとカメラを制御するテキストプロンプトを入力（省略可能）

---

## 2. プロンプト設計の基本原則

### 2.1 4つの黄金原則

| 原則 | 説明 |
|------|------|
| **具体的であれ** | 抽象的な感情や概念ではなく、目に見える物理的な動きや表情を指示する |
| **物理的であれ** | 物理法則に沿った、あるいはそれらしく見える動きを指示する |
| **シンプルであれ** | 主役を一つに絞り、動きを単純化する |
| **カメラマンであれ** | オブジェクトに無理な動きをさせず、カメラワークやライティングで演出する |

### 2.2 プロンプトの基本ルール

**✅ 推奨**
- 動きの説明に焦点を当てる（入力画像を説明しない）
- 肯定的な表現を使用する
- 被写体は「the subject」のように一般的に言及する
- シンプルなプロンプトから始め、段階的に詳細を追加

**❌ 避けるべき**
- 否定形（「〜しない」ではなく「〜の状態を維持する」）
- 命令形
- 過度に複雑なプロンプト
- 矛盾した感情の指示

### 2.3 反復的アプローチ

1. **基本的な動き**から始める
2. 以下の要素を**一度に一つずつ**追加:
   - 被写体の動き (Subject motion)
   - カメラの動き (Camera motion)
   - シーンの動き (Scene motion)
   - スタイルの記述子 (Style descriptors)

---

## 3. プロンプト要素の詳細

### 3.1 被写体の動き (Subject Motion)

**基本ルール**
- 一般的な用語を使用: 「The subject turns slowly」「She raises her hand」
- 複数の被写体: 位置や役割を明確に指定

**人物の動きキーワード**

| 英語 | 日本語 | 用途 |
|------|--------|------|
| raises her hand | 手を上げる | 挙手、強調 |
| walks forward | 前に歩く | 移動、進行 |
| looks around | あたりを見回す | 探索、確認 |
| turns slowly | ゆっくりと振り向く | 振り返り、反応 |
| smiles warmly | 暖かく微笑む | 感情表現 |
| nods slowly | ゆっくり頷く | 同意、聞いている |

**モノの動きキーワード**

| 動きの種類 | 説明 | 例 |
|------------|------|-----|
| 回転 (Rotation) | 360度回転 | "The product rotates slowly" |
| 浮遊 (Floating) | 上下に動く | "The object floats gently up and down" |
| 傾き (Tilt) | 傾く | "The object tilts left and right" |
| スライド (Sliding) | 横方向に動く | "The product slides across the frame" |

### 3.2 カメラの動き (Camera Motion)

| カメラワーク | 説明 | プロンプト例 |
|--------------|------|-------------|
| 固定 (Locked) | 動かない | "Locked camera" |
| 手持ち (Handheld) | 微妙な揺れ | "Handheld camera follows" |
| パン (Pan) | 左右に振る | "Camera pans from left to right" |
| ドリー (Dolly) | 前後に移動 | "Camera slowly dollies in" |
| 周回 (Orbit) | 被写体の周りを回る | "Camera orbits around the subject" |
| ズーム (Zoom) | 拡大・縮小 | "Camera slowly zooms in" |

### 3.3 シーンの動き (Scene Motion)

**2つのアプローチ**

1. **暗示的な動き**: 形容詞で動きを暗示
   - 例: "The subject runs across the dusty desert"

2. **記述された動き**: 動きを直接記述
   - 例: "The subject runs across the desert. Dust trails behind them"

### 3.4 ライティング・エフェクト

| エフェクト | プロンプト例 | 効果 |
|------------|-------------|------|
| ゴールデンアワー | "Golden light sweeps across scene" | 夕焼けのような暖かい雰囲気 |
| ちらつく光 | "Neon flicker, low light, moody shadows" | 神秘的な雰囲気 |
| 霧と光線 | "Low fog drifting, dramatic light rays" | ファンタジー的な雰囲気 |
| 自然な風 | "Soft breeze animating leaves and fabric" | 自然な動き |

---

## 4. 人物編：テンプレートとテクニック

### 4.1 最高成功率テンプレート TOP 3

#### テンプレート1：基本的な感情表現 + 固定カメラ
**成功率: 85-95% | 難易度: 低**

```
[人物の特定] [シンプルな動き] [表情・感情]. [カメラ指定]. [ライティング].
```

**例**:
```
A woman looks directly at the camera and smiles warmly. Locked camera, studio lighting, soft focus on the face.
```

#### テンプレート2：シンプルな動き + 追従カメラ
**成功率: 80-90% | 難易度: 低〜中**

```
[人物の特定] [動作]. [カメラの追従方法]. [背景・環境]. [スタイル].
```

**例**:
```
A woman walks forward slowly and smiles. Handheld camera follows her movement from behind. Soft natural light, cinematic style.
```

#### テンプレート3：複数の動きの組み合わせ
**成功率: 75-85% | 難易度: 中**

```
[人物の特定] [最初の動き], then [次の動き]. [複合的なカメラワーク]. [スタイル].
```

**例**:
```
A woman sits on a chair, then stands up slowly and raises her hand in triumph. Camera starts with a close-up and pulls back to show the full body. Warm golden light, inspiring mood.
```

### 4.2 人物の成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 歩く・走る | 80-90% | 低 |
| 手を上げる・振る | 85-95% | 低 |
| 振り返る | 80-90% | 低 |
| 笑う・泣く | 70-80% | 中 |
| 複数人の相互作用 | 60-70% | 中 |
| 細かい手指の動き | 40-60% | 高 |

### 4.3 入力画像の要件

| 要件 | 重要度 | 理由 |
|------|--------|------|
| 顔の明確さ | 非常に高 | 表情認識が動画の質を左右 |
| 背景の統一性 | 高 | 背景の変化が不自然になりやすい |
| 照明の一貫性 | 高 | 光と影の変化で不自然に見える |
| ポーズの明確性 | 高 | 初期ポーズが動きの基準になる |

---

## 5. モノ編：テンプレートとテクニック

### 5.1 最高成功率テンプレート TOP 3

#### テンプレート1：360度回転 + 周回カメラ
**成功率: 90-95% | 難易度: 低**

```
[オブジェクト説明] rotates slowly [回転の詳細]. [カメラの周回方法]. [ライティング]. [スタイル].
```

**例**:
```
A luxury watch rotates 360 degrees slowly on a pedestal. The camera orbits around the object at a constant speed. Soft golden light glints off the metallic surface. Product showcase, hyper-realistic.
```

#### テンプレート2：浮遊・上下移動 + ズーム
**成功率: 85-92% | 難易度: 低〜中**

```
[オブジェクト説明] floats [浮遊の詳細]. [カメラのズーム方法]. [環境エフェクト]. [スタイル].
```

**例**:
```
A drone hovers and floats gently up and down in the center of the frame. Camera slowly zooms in on the device. Soft blue ambient light, futuristic atmosphere.
```

#### テンプレート3：ライティング変化 + パン/ドリー
**成功率: 80-88% | 難易度: 中**

```
[オブジェクト説明]. [ライティングの変化]. [カメラの動き]. [環境エフェクト]. [スタイル].
```

**例**:
```
A luxury leather handbag sits on a display. Golden light sweeps across the surface, highlighting the texture. Camera slowly pans from left to right. Soft shadows emphasize the craftsmanship. High-end fashion, cinematic.
```

### 5.2 モノの成功率一覧

| アクション | 成功率 | 難易度 |
|------------|--------|--------|
| 回転 | 85-95% | 低 |
| 浮遊・上下移動 | 80-90% | 低 |
| ズーム・パン | 85-95% | 低 |
| 単純な移動（lift） | 70-80% | 中 |
| 物を入れる・配置 | 85-95% | 低 |
| 箱を開ける・閉じる | 25-50% | 高 |
| 複雑なエフェクト（燃焼等） | 30-50% | 高 |
| テキスト生成 | 5-15% | 非常に高 |

### 5.3 カメラと被写体の関係性

| パターン | 効果 | 用途 |
|----------|------|------|
| 固定カメラ + 回転する被写体 | 被写体の全体像を見せる | 商品紹介 |
| 移動カメラ + 静止する被写体 | ドラマティックな効果 | 高級品紹介 |
| 移動カメラ + 移動する被写体 | ダイナミックな演出 | 複雑だが高度な効果 |

---

## 6. 人物 vs モノ：比較と選択基準

### 6.1 プロンプト構造の違い

**人物の場合**
```
[被写体の動き] + [カメラの動き] + [表情・感情] + [スタイル]
```

**モノの場合**
```
[オブジェクトの動き] + [カメラの動き] + [環境エフェクト] + [スタイル]
```

### 6.2 最適なプロンプト長

| タイプ | 推奨長 | 詳細度 |
|--------|--------|--------|
| 人物 | 15-30単語 | 中程度（動き、表情、カメラワーク） |
| モノ | 10-25単語 | 低〜中程度（カメラワークと環境エフェクト） |

### 6.3 選択基準

**人物を選ぶべき場合**
- ストーリー性が必要
- 感情表現が重要
- 複数のアクションを組み合わせたい
- 視聴者の感情に訴えかけたい

**モノを選ぶべき場合**
- 商品紹介が目的
- 高級感や質感を表現したい
- 回転や軌道表示が必要
- シンプルで安定した動きが欲しい

---

## 7. 失敗事例と修正法

### 7.1 人物編の失敗パターン

#### 失敗1：抽象的・曖昧な指示

| | |
|---|---|
| **失敗** | `A woman thinks about her future with mixed emotions` |
| **原因** | 「将来について考える」は映像にできない |
| **修正** | `A woman looks up thoughtfully, a slight smile appears and then fades. Locked camera.` |

#### 失敗2：否定的・受動的な命令

| | |
|---|---|
| **失敗** | `A man doesn't move and doesn't smile` |
| **原因** | AIは否定命令を無視しやすい |
| **修正** | `A man remains still with a neutral expression. Locked camera.` |

#### 失敗3：複雑すぎる身体の動き

| | |
|---|---|
| **失敗** | `A person plays a complex melody on the piano with fingers moving accurately` |
| **原因** | 指一本一本の正確な制御は不可能 |
| **修正** | `A person sits at a piano, their hands moving gently over the keys. Camera slowly zooms in.` |

#### 失敗4：入力画像との矛盾

| | |
|---|---|
| **失敗** | 座っている画像で `The woman suddenly jumps up and runs` |
| **原因** | 中間動作が省略されすぎ |
| **修正** | `The woman slowly stands up from the chair, then turns and walks away.` |

### 7.2 モノ編の失敗パターン

#### 失敗1：オブジェクトの自己生成

| | |
|---|---|
| **失敗** | `A coffee cup sits on a table, and steam magically appears` |
| **原因** | 存在しない要素の生成は困難 |
| **修正** | `A coffee cup sits on a table. Camera slowly zooms in. Soft morning light sweeps across.` |

#### 失敗2：オブジェクトへの能動的な動作

| | |
|---|---|
| **失敗** | `A treasure chest opens by itself` |
| **原因** | 「ひとりでに」は動きの主体が不明確 |
| **修正** | `The camera slowly pushes in towards a closed treasure chest. Dramatic light shines on it.` |

#### 失敗3：複数オブジェクトの相互作用

| | |
|---|---|
| **失敗** | `A red ball rolls and collides with a blue ball` |
| **原因** | 物理演算の正確なシミュレーションは困難 |
| **修正** | `A red ball rolls across the screen from left to right. Camera pans to follow.` |

#### 失敗4：テキストの生成

| | |
|---|---|
| **失敗** | `The words "SALE" appear in fiery letters on the box` |
| **原因** | AIは正確なスペルやフォントを生成できない |
| **修正** | `A black box rotates slowly. A dramatic spotlight illuminates the front.` |

---

## 8. 応用テクニック

### 8.1 First and Last Frame機能

複雑なアクションの成功率を大幅に向上させる手法。

**使用例：箱を開けるアクション**
- First Frame: 閉じた箱の画像
- Last Frame: 開いた箱の画像
- プロンプト: `The box opens slowly, revealing the contents inside. Soft light illuminates the interior.`

**成功率向上**: 単一フレームに比べて50%以上改善

### 8.2 Midjourneyとの連携

1. **表情のプリセット**: Midjourneyで事前に表情を設定
2. **Runwayはアクションに集中**: 表情が設定済みなので、動きの指示に専念できる
3. **失敗率の低下**: プロンプトが簡潔になり、成功率が向上

### 8.3 Act-Oneとの組み合わせ

カメラで撮影した人の動きや表情を、キャラクター画像に反映可能。

**活用シーン**
- アバター動画の制作
- 解説映像
- プロモーション素材

### 8.4 その他のRunway機能との連携

- **Expand Video**: シーンを広げる
- **Video to Video**: 出力を再創造
- **4Kアップスケール**: 高忠実度の出力

---

## クイックリファレンス

### プロンプト成功率早見表

| カテゴリ | 高成功率（80%+） | 中成功率（50-80%） | 低成功率（50%未満） |
|----------|------------------|--------------------|--------------------|
| **人物** | 歩く、振る、頷く、笑う | 複数人の相互作用 | 指の細かい動き |
| **モノ** | 回転、浮遊、ズーム | 単純な移動 | 箱を閉じる、燃焼、テキスト |

### チェックリスト

- [ ] プロンプトは肯定形で書かれているか
- [ ] 動きは具体的で物理的に可能か
- [ ] 入力画像から自然に続く動きか
- [ ] 主役（被写体）は一つに絞られているか
- [ ] カメラワークは明確に指定されているか
