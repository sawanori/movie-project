# Act-Two 人物タイプ拡張 実装計画書

## 概要

Runway Act-Two APIを現在の「アニメーション」タイプに加えて「人物」タイプでも使用可能にする。

## 背景

### 調査結果
- Runway Act-Two APIは実写の人物画像にも対応している
- むしろ実写人物の方がアニメキャラクターより高品質な結果が得られるケースがある
- 要件: 顔が視覚的に認識可能であり、フレーム内に留まること

### 現状
```
被写体タイプ選択
├── person（人物）     → 通常モードのみ
├── object（物体）     → 通常モードのみ
└── animation          → 通常モード or Act-Twoモード
```

### 変更後
```
被写体タイプ選択
├── person（人物）     → 通常モード or Act-Twoモード ← 追加
├── object（物体）     → 通常モードのみ（顔がないため対象外）
└── animation          → 通常モード or Act-Twoモード
```

## 実装難易度

| 変更箇所 | 難易度 | 工数 |
|----------|--------|------|
| フロントエンド (page.tsx) | 簡単 | 5分 |
| スキーマ (schemas.py) | 簡単 | 5分 |
| 翻訳API (router.py) | 簡単 | 10分 |
| テスト確認 | 簡単 | 10分 |
| **合計** | **簡単** | **約30分** |

## 変更箇所

### 1. フロントエンド

**ファイル**: `movie-maker/app/generate/story/page.tsx`

**変更内容**: Act-Twoセクションの表示条件を変更

```tsx
// Before (約540行目)
{subjectType === 'animation' && animationCategory && videoProvider === 'runway' && (

// After
{(subjectType === 'person' || (subjectType === 'animation' && animationCategory)) && videoProvider === 'runway' && (
```

**補足**:
- `person`選択時は`animationCategory`のチェックは不要
- `animation`選択時は既存の`animationCategory`チェックを維持

### 2. バックエンド スキーマ

**ファイル**: `movie-maker-api/app/videos/schemas.py`

**変更内容**: `TranslateStoryPromptRequest`のAct-Twoバリデーションを緩和

```python
# Before (約288-289行目)
if self.subject_type != SubjectType.ANIMATION:
    raise ValueError("Act-Two is only available with animation subject type")

# After
if self.subject_type not in [SubjectType.PERSON, SubjectType.ANIMATION]:
    raise ValueError("Act-Two is only available with person or animation subject type")
```

### 3. 翻訳API（必要に応じて）

**ファイル**: `movie-maker-api/app/videos/router.py`

**変更内容**: `person` + Act-Two時のプロンプト生成ロジック

```python
# 翻訳エンドポイント内で、person + Act-Two の場合の処理
# Act-Twoはプロンプトではなくモーション動画で制御するため、
# 既存のpersonテンプレートをそのまま使用可能
# 特別な変更は不要の可能性が高い
```

## UIフロー

### 人物選択時のAct-Twoオプション表示

```
┌─────────────────────────────────────────────────────┐
│ 被写体タイプ                                         │
│ [人物 ✓]  [物体]  [アニメーション]                    │
├─────────────────────────────────────────────────────┤
│ 動画生成エンジン                                     │
│ [Runway ✓]  [Veo]                                   │
├─────────────────────────────────────────────────────┤
│ ☑ Act-Twoモード（精密動作制御）                      │
│   パフォーマンス動画ベースで自然な動きを実現          │
│                                                     │
│   モーションを選択:                                  │
│   ┌─────┐ ┌─────┐ ┌─────┐                          │
│   │笑顔 │ │驚き │ │手振り│ ...                      │
│   └─────┘ └─────┘ └─────┘                          │
│                                                     │
│   表情強度: ●━━━━━━━━━ 3                           │
│   ☑ 体の動き制御                                    │
└─────────────────────────────────────────────────────┘
```

## テスト項目

### 機能テスト

| # | テスト内容 | 期待結果 |
|---|-----------|----------|
| 1 | person選択 + Runway選択時にAct-Twoオプションが表示される | 表示される |
| 2 | person選択 + Veo選択時にAct-Twoオプションが非表示 | 非表示 |
| 3 | object選択時にAct-Twoオプションが非表示 | 非表示 |
| 4 | animation選択時は既存通りAct-Twoオプションが表示される | 表示される |
| 5 | person + Act-Two有効でモーション選択→翻訳成功 | 成功 |
| 6 | person + Act-Two有効で動画生成成功 | 成功 |

### 回帰テスト

| # | テスト内容 | 期待結果 |
|---|-----------|----------|
| 1 | person + 通常モードで動画生成 | 既存通り動作 |
| 2 | object + 通常モードで動画生成 | 既存通り動作 |
| 3 | animation + 通常モードで動画生成 | 既存通り動作 |
| 4 | animation + Act-Twoで動画生成 | 既存通り動作 |

## リスク評価

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 既存機能への影響 | 低 | 条件分岐の追加のみ、既存ロジックは変更なし |
| UI崩れ | 低 | 既存コンポーネントの再利用 |
| API互換性 | なし | 新規オプションの追加のみ |

## ロールバック手順

問題発生時は以下の変更を元に戻す：
1. `page.tsx` の条件分岐を元に戻す
2. `schemas.py` のバリデーションを元に戻す

## 参考資料

- [Runway Act Two vs. Live Portrait - Atlabs AI](https://www.atlabs.ai/blog/runway-act-two-vs-live-portrait)
- [The Ultimate Guide to Act-Two | Runway AI](https://www.facefusion.co/runway-act-two)
- [Runway API Documentation](https://docs.dev.runwayml.com/api/)
- [Character Animation with Act-Two | Runway Academy](https://academy.runwayml.com/acttwo/acttwo-expressive-character-performances)

## 作成日

2025-12-31
