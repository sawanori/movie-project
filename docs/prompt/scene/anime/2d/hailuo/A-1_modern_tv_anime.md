# HailuoAI 2Dアニメスタイル A-1: 現代TVアニメ

## 概要

| 項目 | 内容 |
|------|------|
| スタイル | 現代TVアニメ（2020年代） |
| 推奨語数 | 10〜40単語 |
| 推奨モデル | MiniMax-Hailuo-02 |
| 特徴 | カメラコマンド `[command]` 構文 |

---

## 重要原則：画像優先

```
⚠️ 画像にある情報はプロンプトに書かない

❌ 書いてはいけない:
- キャラクターの外見（髪色、服装、顔の特徴）
- 背景・シーンの詳細
- 色、照明の詳細

✅ 書くべきこと:
- カメラコマンド [command] を最初に
- 動き・アクション
- アニメ的な演出効果
- スタイルキーワード（anime style等）
```

---

## スタイルキーワード

```
modern anime style, anime cel shading, smooth animation
```

---

## TEXT PROMPT テンプレート

```
[CAMERA_COMMAND]

Action: [MOVEMENT - e.g., turns head, smiles, raises hand]
Animation: [ANIME MOTION - hair flows, expression change, fabric sways]

Modern anime style, smooth animation.
```

---

## 実例集

### 例1：表情変化

```
[Push in]

Action: smiles warmly, eyes brighten
Animation: hair sways slightly, natural blink

Modern anime style, smooth animation.
```

### 例2：振り返り

```
[Pan right]

Action: turns head gracefully
Animation: hair flows with movement

Modern anime style, smooth animation.
```

### 例3：アクションポーズ

```
[Tracking shot]

Action: takes dynamic step forward
Animation: clothes flutter, hair bounces

Modern anime style, smooth animation.
```

---

## カメラコマンド推奨

| シーン | コマンド |
|--------|---------|
| 感情シーン | `[Push in]` |
| 振り返り | `[Pan left]` or `[Pan right]` |
| アクション | `[Tracking shot]` |
| 静かなシーン | `[Static shot]` |
| ダイナミック | `[Zoom in, Pan left]` |

---

*Last Updated: 2026-01*
