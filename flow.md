# Krea Node Editor — Utility ノード仕様カタログ

> 自社の動画生成AIエディター実装に向けた参考資料
> 調査対象: Krea AI Node Editor の Utility 系ノード（Image / Video / Text / Audio）
> 調査日: 2026-05-14

---

## 1. 全体アーキテクチャ

### 1.1 ノード共通レイアウト

すべての Utility ノードは以下の構造で統一されている。

```
┌─────────────────────────────┐
│ ノード名              [?]   │  ← ヘッダー（タイトル＋ヘルプ）
├─────────────────────────────┤
│                             │
│   プレビュー領域            │  ← "Add or connect ... to view"
│                             │
├─────────────────────────────┤
│ ○ Input A   [値/ファイル]   │  ← 入力行（左にハンドル）
│ ○ Input B   [値/ファイル]   │
│ ─ Param 1   [────●────]     │  ← パラメータ（スライダー等）
│ ─ Param 2   [────●────]     │
│ ▸ Settings                  │  ← 折りたたみセクション
├─────────────────────────────┤
│                       Image○│  ← 出力ハンドル（右）
└─────────────────────────────┘
```

### 1.2 ハンドルの色分け（型表現）

| 色       | 型         | 用途                         |
| -------- | ---------- | ---------------------------- |
| 🔵 青    | Image      | 画像                         |
| 🟢 緑    | Video      | 動画                         |
| 🟠 橙    | Audio      | 音声                         |
| 🟣 紫    | Text       | テキスト                     |
| 🟡 黄    | Number     | 数値                         |
| 🌸 ピンク | 3D Object  | 3Dモデル                     |

結線時に型ミスマッチを直感的に避けるための視覚的規約。

---

## 2. Image Utility（9種）

### 2.1 Blur Image

| 項目         | 内容                          |
| ------------ | ----------------------------- |
| 入力         | Image（青）                   |
| パラメータ   | Blur（スライダー、デフォルト50） |
| 出力         | Image（青）                   |
| 用途         | 画像にガウシアンブラーを適用  |

### 2.2 Brightness & Contrast

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Image（青）                                |
| パラメータ   | Brightness（デフォルト1）／Contrast（デフォルト1）／各リセット付 |
| 出力         | Image                                      |
| 用途         | 輝度・コントラスト調整                     |

### 2.3 Compositor

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Top Layer（青）／Base Layer（青）          |
| パラメータ   | Settings 内（ブレンドモード／位置／スケール想定） |
| 出力         | Image                                      |
| 用途         | 2画像のレイヤー合成                        |

### 2.4 Crop Image

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Input Image（青）                          |
| パラメータ   | Settings 内（クロップ矩形のXYWH指定UI）    |
| 出力         | Image                                      |
| 用途         | 画像のトリミング                           |

### 2.5 Hue & Saturation

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Image                                      |
| パラメータ   | Hue Rotation（0°中心）／Saturation（100%中心） |
| 出力         | Image                                      |
| 用途         | 色相回転と彩度調整                         |

### 2.6 Image Mask Editor

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Image（青）                                |
| パラメータ   | ペンで描画するマスク編集UI                 |
| 出力         | **Image** ＋ **Mask** の2出力              |
| 用途         | inpaint / outpaint 用のマスク作成          |

### 2.7 Invert Image

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Image                                      |
| パラメータ   | なし                                       |
| 出力         | Image                                      |
| 用途         | 画像の色反転                               |

### 2.8 Remove Background

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Image                                      |
| パラメータ   | Settings 内（モデル選択／品質設定想定）    |
| 出力         | Image（背景透過PNG）                       |
| 用途         | 自動切り抜き（rembg等）                    |

### 2.9 RGB Adjust

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Image                                      |
| パラメータ   | Red / Green / Blue（各デフォルト1、リセット付） |
| 出力         | Image                                      |
| 用途         | チャネルごとの色味調整                     |

---

## 3. Video Utility（9種）

### 3.1 Combine Video & Audio

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video（緑）／Audio（橙）                   |
| パラメータ   | なし（自動同期）                           |
| 出力         | Video                                      |
| 用途         | 動画に音声トラックを合流                   |

### 3.2 Crop Video

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Input Video（緑）                          |
| パラメータ   | Settings 内（クロップ矩形）                |
| 出力         | Video                                      |
| 用途         | 動画の画角トリミング                       |

### 3.3 Get Video Frame

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video（緑）                                |
| パラメータ   | Direction（First Frame / Last Frame など） |
| 出力         | **Image**（青）                            |
| 用途         | 動画→静止画抽出（次動画のStart Frame連携に必須） |

### 3.4 Qwen Edit Camera

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Base Image（青）                           |
| パラメータ   | 3D軸ジョイスティック（XYZ位置・回転）      |
| 出力         | Image / Video                              |
| 用途         | 静止画からカメラ動きを与えた動画を生成     |
| 備考         | 独自性が高い差別化UI                       |

### 3.5 Stitch Videos

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video 1 〜 Video 5（緑、最大5本）          |
| パラメータ   | Transition（None ほか）                    |
| 出力         | Quick preview / Final result               |
| 用途         | 複数クリップの連結                         |

### 3.6 Trim Video

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video（緑）                                |
| パラメータ   | Start (s)（デフォルト0）／End (s)          |
| 出力         | Video                                      |
| 用途         | 時間トリミング                             |

### 3.7 Video Hue & Saturation

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video                                      |
| パラメータ   | Hue Rotation（0）／Saturation（100）       |
| 出力         | Video                                      |
| 用途         | 動画の色相・彩度調整（Image版と同構造）    |

### 3.8 Video Speed

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video                                      |
| パラメータ   | Speed（デフォルト1、倍速指定）             |
| 出力         | Video                                      |
| 用途         | 等倍スロー／早送り                         |

### 3.9 Video Time Ramp

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Video                                      |
| パラメータ   | Time Curve（ベジエカーブ／コントロールポイント2点） |
| 出力         | Video                                      |
| 用途         | 時間軸の非線形伸縮（AE のタイムリマップ相当） |
| 備考         | 独自性が高い差別化UI                       |

---

## 4. Text Utility（5種）

### 4.1 Concat Text

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Inputs（紫、複数）                         |
| パラメータ   | Separator（New Line / カンマ / その他）    |
| 出力         | Output（紫、Text）                         |
| 用途         | 複数テキスト断片の連結                     |

### 4.2 Line Splitter

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Input（紫、複数行テキスト）                |
| パラメータ   | なし                                       |
| 出力         | Line 1 〜 Line N（紫、行ごとに動的生成）   |
| 用途         | 複数行テキスト→個別出力に分解              |

### 4.3 LLM Call

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Prompt（紫テキスト）／Image（青、オプション） |
| パラメータ   | Settings 内（モデル選択 GPT-5 など）       |
| 出力         | Text（紫）                                 |
| 用途         | ワークフロー内でLLM呼び出し（動的プロンプト生成・キャプショニング） |

### 4.4 Sticky Note

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | なし                                       |
| パラメータ   | テキスト入力のみ                           |
| 出力         | なし                                       |
| 用途         | ワークフロー上の注釈（黄色付箋UI）         |

### 4.5 Text Overlay

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Base Image（青）／Text（紫）               |
| パラメータ   | Settings 内（フォント／サイズ／色／位置／整列） |
| 出力         | Image                                      |
| 用途         | 画像へのテロップ焼き込み                   |

---

## 5. Audio Utility（1種）

### 5.1 Trim Audio

| 項目         | 内容                                       |
| ------------ | ------------------------------------------ |
| 入力         | Audio（橙）                                |
| パラメータ   | Start (s)／End (s)                         |
| 出力         | Audio                                      |
| 用途         | 音声トリミング（Trim Video の音声版）      |

---

## 6. 自社実装に向けた設計指針

### 6.1 抽象化テンプレート

Utility ノードは「型 × 操作」のマトリクスで整理されている。下記の抽象クラスを定義すると派生で大量実装できる。

```typescript
abstract class UtilityNode<TIn, TOut> {
  abstract type: 'image' | 'video' | 'audio' | 'text';
  abstract category: 'trim' | 'crop' | 'adjust' | 'mask' | 'combine' | 'transform';
  abstract inputs: Port[];
  abstract params: Parameter[];
  abstract outputs: Port[];
  abstract preview(): ReactNode;
  abstract execute(inputs: TIn): Promise<TOut>;
}
```

派生例:

- `HueSaturationNode<Image>` / `HueSaturationNode<Video>`
- `TrimNode<Video>` / `TrimNode<Audio>`
- `CropNode<Image>` / `CropNode<Video>`

### 6.2 優先実装ロードマップ

**Phase 1（MVP・動画完成パイプライン）**
1. Trim Video
2. Combine Video & Audio
3. Get Video Frame
4. Stitch Videos
5. Crop Video
6. Text Overlay

**Phase 2（表現力向上）**
7. Video Speed
8. Video Time Ramp（ベジエカーブUI実装）
9. Video Hue & Saturation
10. Trim Audio

**Phase 3（編集系・AI連携）**
11. Image Mask Editor
12. Remove Background
13. LLM Call
14. Concat Text / Line Splitter
15. Compositor

**Phase 4（仕上げ）**
16. 色調整系（Brightness & Contrast, RGB Adjust, Hue & Saturation, Invert, Blur）
17. Sticky Note
18. Qwen Edit Camera（差別化要素として）

### 6.3 差別化候補

- **Video Time Ramp のベジエカーブエディタ**: canvas ベースで実装。AE のタイムリマップ品質を目指す
- **Qwen Edit Camera の3Dジョイスティック**: Three.js で球状コントローラを実装
- **Image Mask Editor のペン描画UI**: SAM などのワンクリックマスク生成と統合

### 6.4 共通UIコンポーネント

実装時に再利用すべき共通部品。

| コンポーネント        | 使用ノード                                   |
| --------------------- | -------------------------------------------- |
| ハンドル付き入力行    | 全ノード                                     |
| スライダー（リセット付） | Blur, Brightness, Contrast, Hue, Saturation, RGB, Speed |
| 数値入力              | Trim Video, Trim Audio                       |
| ファイルドロップ      | 全入力                                       |
| プルダウン            | Concat Separator, Get Video Frame Direction, Stitch Transition |
| 折りたたみ Settings   | 多数                                         |
| カーブエディタ        | Video Time Ramp                              |
| マスク描画キャンバス  | Image Mask Editor                            |
| 3Dジョイスティック    | Qwen Edit Camera                             |
| プレビュー領域        | 全ノード                                     |

---

## 7. ノード数サマリ

| カテゴリ       | ノード数 |
| -------------- | -------- |
| Image Utility  | 9        |
| Video Utility  | 9        |
| Text Utility   | 5        |
| Audio Utility  | 1        |
| **合計**       | **24**   |

---

*End of document*
