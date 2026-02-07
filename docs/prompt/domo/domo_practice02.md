# DomoAI プロンプトエンジニアリング：非公式ハック集

第三者による最適化プロトコルと高度なワークフローに関する包括的調査報告書

---

## 1. エグゼクティブサマリー

生成AIによる動画制作は、精密な映像制作ワークフローへと急速に進化しています。DomoAIはユーザーフレンドリーなインターフェースを提供していますが、パワーユーザーたちは「**プロンプトハッキング**」を通じて、文書化されていない能力を引き出すことに成功しています。

本報告書は、Reddit、Discord、専門ユーザーグループで共有されている「暗黙知」を体系化したものです。

**3つの柱:**
1. 構成的プロンプトエンジニアリング（ターゲット映像の生成）
2. 破壊的/ネガティブプロンプティング（出力の安定化）
3. ワークフロー統合（異種ツールの結合）

---

## 2. プロンプトハッキングの理論的枠組み

### 2.1 具体性の勾配（Vague-to-Detailed プロトコル）

一度にすべての情報を投入するのではなく、**段階的に情報を追加**していく手法。

| フェーズ | 内容 | 例 |
|---------|------|-----|
| 1. アンカー | 曖昧な指示 | `car` |
| 2. 修飾子 | 詳細化 | `red sports car, neon reflections` |
| 3. アトモスフィア | 文脈 | `cinematic, night, rainy street` |
| 4. レンダリングエンジン | スタイル | `Realistic CG` |

**メリット:** どのキーワードがハルシネーションの原因になっているか特定可能。

### 2.2 「Mundane Shonen」パラドックス

最もダイナミックなAIアニメーションは、**極めて退屈な現実世界の行動**から生成される。

**ハックの手法:**
1. 日常の些細な動作を撮影（洗濯物を畳む、書類を整理するなど）
2. 高エネルギーなアニメスタイルを適用
3. AIが動きを過剰解釈してドラマチックな表現に変換

```
入力: フィットシーツを畳む動画
プロンプト: "Attack on Titan style, dramatic action lines, intense focus"
結果: 布の動きが戦闘動作のように変換される
```

---

## 3. ハックプロンプト完全リポジトリ

### 3.1 「ゴールデンアワー」プロトコル（安定化）

AI動画生成における最大の失敗点は**ライティングの不整合**（フリッカー）。

**ハックされたプロンプト:**

```
A girl is standing by the beach during golden hour,
her hair flowing in the breeze,
the ocean waves gently moving in the background,
warm sunlight reflecting off the water.
```

**メカニズム分析:**

| キーワード | 効果 |
|-----------|------|
| `Golden Hour` | 色温度を暖色系に統一、照明環境の競合を防止 |
| `Gently moving` | 流体シミュレーションの負荷軽減、アーティファクト抑制 |
| `Reflecting off` | レイトレーシングを明示的に指示、接地感を付与 |

### 3.2 日本語構文による幾何学保存

360度回転映像における形状崩壊を制御するハック。

**失敗するプロンプト:**
```
松ぼっくり、360度ビュー
```

**ハックされたプロンプト:**
```
ベゼルの位置がずれないように...
鱗片の重なりや陰影を正確に補間し...
背景は均一で埃やノイズが強調されないように清潔な質感を保つ
```

**精度のための重要語彙:**

| キーワード | 効果 |
|-----------|------|
| `正確に補間` | 新しい形状を発明せず、既存情報から推論 |
| `清潔な質感` | 肯定命令によるノイズ除去（否定形より効果的） |
| `スタジオライティング` | 環境変数を排除、幾何学構造に集中 |

### 3.3 ロールプレイ・プロンプトインジェクション

画像生成器の解釈層に「ペルソナ」を割り当てる手法。

**プロンプト例:**
```
あなたはIMAXカメラを使用する経験豊富な映画撮影監督です...
```

または

```
あなたは伝統的な浮世絵師です...
```

**効果:** 出力に対する「システムレベル」の制約を設定。

### 3.4 静止画への疑似カメラワーク付与

**手法:**
1. Midjourneyなどで高品質なキーフレーム（静止画）を生成
2. DomoAI "Image-to-Video" で `Zoom In` / `Pan` テンプレート適用
3. プロンプトに `Drone shot` や `Handheld camera movement` を追加

**効果:** 機械的なズームではなく、有機的で臨場感のあるカメラワークをシミュレート。

---

## 4. 高度なネガティブプロンプトエンジニアリング

### 4.1 解剖学的安全性クラスター

| キーワード | 目的 | 重み付け |
|-----------|------|---------|
| `Bad anatomy` | 骨格エラー全般のフィルタリング | 1.0 |
| `Extra limbs`, `Extra fingers` | 多指症の防止 | 1.2+ |
| `Fused fingers`, `Fused limbs` | トランジション中の「溶け」防止 | 手の動きに必須 |
| `Missing arms`, `Missing legs` | 切断アーティファクトの防止 | 全身ショットに必須 |
| `Mutated hands`, `Malformed` | 強力なフィルタ | 手のクローズアップ時 |
| `Long neck` | 「キリン効果」防止 | ポートレート |
| `Disconnect limbs` | 浮遊する手足の防止 | アクションシーン |

### 4.2 デジタル衛生クラスター

**テキスト/透かしの除去:**
```
text, watermark, logo, banner, signature, username, error, date, qr code
```

**圧縮ノイズの除去:**
```
jpeg artifacts, compression artifacts, pixelated, blurry, low res, low quality, worst quality
```

> **ハック:** `worst quality` をネガティブに入れることで、モデルは「悪い画像」のクラスターから数学的に距離を置く。

### 4.3 様式的純度クラスター

**リアルな動画向け:**
```
cartoon, 3d, cgi, render, illustration, painting, drawing, sketch, anime, flat color, grayscale
```

**アニメ/芸術的動画向け:**
```
photorealistic, realism, photograph, 3d, messy lines, blurry
```

### 4.4 構図的安定性クラスター

```
out of frame, cropped, cut off, body out of frame, split image, tiling, symmetrical repetition
```

> **ハック:** `Symmetrical repetition` を否定しないと、背景のテクスチャが無限タイル状になる。

---

## 5. モデルバージョンとパラメータチューニング

### 5.1 V2.1 vs V2.2 vs V2.4

| バージョン | 特徴 | 推奨用途 |
|-----------|------|---------|
| **V2.1** | スピードモデル、一貫性は劣る | 構図テスト、アイデア出し |
| **V2.2** | モーションキャプチャ機能、4Kアップスケーリング | 最終レンダリング |
| **V2.4** | 手と顔の問題に対処、肌質感改善 | キャラクターアニメーション |

**ワークフロー:**
1. V2.1でベースの動きを生成・確認
2. V2.2/V2.4で最終レンダリング（クレジット節約）

### 5.2 「Breathing Loop」プリセット

V2.4で追加された重要なプリセット。キャラクターに微妙なリズムを加え、マネキンのような硬直感を防止。

### 5.3 リラックスモード戦略

**戦略:** 低速ながら無制限の生成を行い、潜在空間を「総当たり攻撃」。

```
1. Relax Modeをオン
2. 一晩で同じプロンプトのバリエーションを50個以上生成
3. 「完璧なシード値」を発見
4. 有料クレジットでアップスケール
```

---

## 6. クロスプラットフォーム・ワークフロー統合

### 6.1 「オーディオファースト」ワークフロー

AI動画が「平坦」に感じられる問題を制作パイプラインの逆転で解決。

| ステップ | ツール | 内容 |
|---------|--------|------|
| 1 | ElevenLabs, Mixkit | ナレーション、効果音を生成 |
| 2 | CapCut | オーディオをインポート、タイムライン作成 |
| 3 | DomoAI | オーディオのキューに合わせたリアクションショット生成 |
| 4 | CapCut | 環境音を映像に重ねてコンポジット |

**なぜ機能するのか:** 効果音と環境音が重なることで、脳がAIの視覚的欠陥を「文脈」として補完。

### 6.2 「スタイルスワップ」リアリティ

**ワークフロー:**
1. **入力:** 現代の都市の街並みを撮影した実写映像
2. **プロセス:** DomoAI Video-to-Video
3. **プロンプト:** `Cyberpunk 2077` / `Studio Ghibli` / `1920s Noir`

**効果:** 動き自体は現実のものなので、AIは物理法則を捏造する必要がなく、テクスチャを貼り替えるだけで済む。

---

## 7. 成功したハックプロンプトの解剖

### 7.1 大気のポートレート（高安定性）

**プロンプト:**
```
A futuristic cityscape at sunset, cinematic lighting, ultra-detailed
```

**ネガティブプロンプト:**
```
blurry, distorted, deformed, low-quality, text, watermark
```

**解剖:**
- **主題:** `Cityscape` - 静的で幾何学的、AIにとって処理が容易
- **修飾子:** `Sunset` - ゴールデンアワーハックによる照明一貫性
- **品質ブースター:** `Cinematic lighting, ultra-detailed`
- **ネガティブ:** `Blurry` - デフォルトの失敗状態を排除

### 7.2 ダイナミック・アニメ・アクション（高エネルギー）

**入力動画:** フィットシーツを攻撃的に畳んでいる人物

**プロンプト:**
```
Anime style, Attack on Titan style, dramatic action lines, intense focus, high contrast shadows
```

**メカニズム:** AIは布の張力と素早い腕の動きを戦闘動作として解釈。`dramatic action lines` により背景が集中線化され、全リソースをキャラクターに集中。

### 7.3 360度プロダクトショーケース（高精度）

**プロンプト:**
```
Product showcase style, white background studio, pinecone, natural and 3D texture, preserve scale edges, no noise
```

**ハック要素:** `Studio` と `White Background` により、モデルの推論能力100%をオブジェクト自体に集中。

---

## 8. パワーユーザーのための戦略的推奨事項

1. **「ネガティブ・ファースト」マインドセット**
   - プロンプト作成時は「ユニバーサル・ネガティブ・リスト」から開始
   - 品質問題の50%は発生前に解決

2. **「曖昧から具体へ」の反復**
   - 最初から複雑なプロンプトを書かない
   - `Cyberpunk City` → 生成 → `Neon lights` 追加 → 生成...

3. **現実を松葉杖として使う**
   - Text-to-Videoより参照クリップを使用したVideo-to-Videoを推奨
   - 携帯電話で撮影した粗い動画でも可

4. **オーディオは接着剤**
   - 高品質なサウンドデザインで視覚的グリッチを文体的選択として認識させる

5. **AIへのロールプレイ指示**
   - 「あなたは受賞歴のある写真家です」と伝える
   - 潜在空間の重みがプロフェッショナルな画像群に整列

---

## 付録A：ユニバーサル・スタビライザー・ネガティブプロンプト

**毎回コピー＆ペーストしてください:**

```
(worst quality, low quality:1.4), (bad anatomy:1.2), (deformed:1.1),
(text, watermark, logo, signature:1.3), low res, blurry, jpeg artifacts,
extra limbs, missing limbs, disconnected limbs, fused fingers,
malformed hands, long neck, mutated, ugly, disgusting, horror,
monochrome, tiling, poorly drawn face, mutation
```

---

## 付録B：シネマティック・ポジティブ・ブースター

**プロンプトの最後に追加:**

```
cinematic lighting, golden hour, depth of field, 8k resolution,
highly detailed, photorealistic, unreal engine 5 render, ray tracing,
volumetric lighting, sharp focus
```

---

## 付録C：アニメスタイル・ポジティブ・ブースター

**蝋のような質感を避け、鮮明なアニメスタイルを得るために:**

```
studio ghibli style, makoto shinkai style, high quality animation,
cel shaded, vibrant colors, detailed background, key visual, official art
```

---

## 付録D：トラブルシューティングガイド

| 問題 | 修正方法 |
|------|---------|
| **顔が溶けて見える** | ネガティブに `bad face, melted face` 追加、V2.4使用、`Breathing Loop`プリセット |
| **動画が点滅する** | ポジティブに `golden hour` または `studio lighting` 追加 |
| **指が多すぎる** | ネガティブに `extra fingers, polydactyly` 追加、可能なら手を隠す |
| **背景がカオス** | ポジティブに `simple background` 追加、ネガティブに `cluttered, messy` 追加 |

---

*最終更新: 2026年1月3日*
