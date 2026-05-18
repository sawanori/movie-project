# Design Doc: TTS 抑揚強化 (プリセット文言拡充 + 新プリセット追加)

- **作成日**: 2026-05-18
- **最終更新**: 2026-05-18
- **ステータス**: Draft
- **対象バージョン**: movie-maker-api (FastAPI, Python 3.11+), movie-maker (Next.js 16 / React 19)
- **前提 Design Doc**: [`2026-05-18_tts-emotion-instructions.md`](./2026-05-18_tts-emotion-instructions.md) — TTS 感情・トーン指定機能 (6 プリセット実装済)
- **関連コミット**: `dbf88e7` — TTS 感情指定機能 (6 プリセット + 自由記述) 初期実装
- **複雑度評価**: `complexity_level: low`
  - **complexity_rationale**: 修正対象は 4 ファイル。状態管理の追加なし。既存パイプライン・DB スキーマ変更なし。instructions の文言差し替え + 1 件追加のみ。コード行数の増加はごく軽微。

---

## 0. Agreement Checklist (合意事項)

- **A**: `openai_tts_provider.py` のデフォルト instructions を抑揚指示込みに拡張する。
  - 反映先: §3-1 / §4-1
- **B**: 既存 6 プリセットの instructions 文言を 150-200 文字に拡張し、抑揚・ポーズ・速度・ピッチの 4 軸を明示する。
  - 反映先: §3-2 / §4-2
- **C**: 「🎭 プロ抑揚」プリセット (key: `pro_intonation`) を 1 件追加し、合計 7 プリセットにする。
  - 反映先: §3-2 / §4-2
- **スコープ**: 文言のみ変更。DB スキーマ・API・バックエンド処理フロー・UI コンポーネントはすべて変更なし。
- **非スコープ**: 新規 UI コンポーネント、DB マイグレーション、API エンドポイント変更、ElevenLabs 対応、音声プレビュー。

各合意項目はそれぞれ後段セクションに反映済み。

---

## 1. 背景・課題

### 1-1. 前提: 感情指定機能の実装済み状態

コミット `dbf88e7` にて、以下が実装済み:

- `movie-maker/lib/constants/tts-emotion-presets.ts` — 6 プリセット定数定義
- `movie-maker/components/node-editor/nodes/DialogueNode.tsx` — プリセット選択 UI + 自由記述 textarea
- `movie-maker-api/app/external/openai_tts_provider.py` — デフォルト instructions (英語) 適用済み

### 1-2. 課題: 抑揚指示の薄さ

現在のプリセット文字数:

| プリセット | 現在の文字数 | 現在の instructions |
|--|--|--|
| 喜び | 78 文字 | `Speak with bright, cheerful enthusiasm. Use rising intonation and convey happiness and warmth.` |
| 悲しみ | 98 文字 | `Speak softly with a slower pace and downward intonation. Convey sadness and melancholy without being melodramatic.` |
| 怒り | 75 文字 | `Speak with firm, sharp delivery and emphatic pauses. Convey controlled anger and frustration.` |
| 驚き | 81 文字 | `Speak with sudden rising intonation and emphatic stress. Convey genuine surprise and astonishment.` |
| 落ち着き | 70 文字 | `Speak with calm, even tone and steady pace. Convey serene composure and gentle reassurance.` |
| 困惑 | 93 文字 | `Speak with hesitant pauses and uncertain intonation. Convey confusion and bewilderment, as if thinking aloud.` |

現在の文言では「感情」の指示のみで、**抑揚 (pitch variations)・ポーズ (deliberate pauses)・速度 (pacing)・強調 (emphasis)** の 4 軸が抜けている。`gpt-4o-mini-tts` は instructions が具体的かつ長いほど劇的に効果が出ることが知られており、現状の 60-100 文字では潜在能力を引き出せていない。

現在のデフォルト instructions (L80-85 に実装済みの英語文) は 4 文構成だが、「抑揚の幅」を指示する軸が弱い:

```
Speak natural Japanese with rich emotional expression.
Vary pitch, pace, and emphasis to convey the underlying feelings in the text.
Use human-like pauses and intonation, avoiding robotic delivery.
Match the tone to the dialogue's mood (joy, sadness, anger, surprise, etc.) as appropriate.
```

---

## 2. 目標 (Goals / Non-Goals)

### 2-1. Goals

#### A. デフォルト instructions 強化
- 4 軸 (pitch / pause / pacing / emphasis) を明示的に指示する文面に拡張。
- 文字数: 現在 ~290 文字 → 新 ~420 文字 (英語)。

#### B. 既存 6 プリセット文言拡充
- 各プリセットを 150-200 文字の英語 instructions に拡張。
- 抑揚・ポーズ・速度・ピッチの 4 軸を各感情に合わせた形で明示。

#### C. 「🎭 プロ抑揚」プリセット追加
- 感情に依存しない汎用抑揚強化プリセットを 1 件追加。
- 合計プリセット数: 6 → 7。
- 声優レベルの抑揚指示 (theatrical intonation, dramatic pitch variations, deliberate pauses)。

### 2-2. Non-Goals

- DB スキーマ変更
- API エンドポイント変更
- UI コンポーネントのレイアウト変更
- ElevenLabs プロバイダー対応
- 音声プレビュー
- 感情強度スライダー
- instructions 履歴保存

---

## 3. 設計詳細

### 3-1. 新デフォルト instructions (目標 A)

**変更ファイル**: `movie-maker-api/app/external/openai_tts_provider.py` (L80-85)

**Before** (現在の実装):
```
Speak natural Japanese with rich emotional expression.
Vary pitch, pace, and emphasis to convey the underlying feelings in the text.
Use human-like pauses and intonation, avoiding robotic delivery.
Match the tone to the dialogue's mood (joy, sadness, anger, surprise, etc.) as appropriate.
```

**After** (新デフォルト):
```
Speak natural Japanese with rich emotional expression and dynamic intonation.
Vary pitch widely (low to high), pace (slow to fast), and emphasis to convey
the underlying feelings in the text. Insert natural pauses between phrases.
Use human-like rhythm and avoid any robotic or monotone delivery. Match the
tone to the dialogue's mood (joy, sadness, anger, surprise, etc.) as appropriate,
adding pitch variation on emotionally charged words.
```

**変更の意図**:
- `dynamic intonation` を追加 → 抑揚の動的な変化を明示。
- `Vary pitch widely (low to high)` → ピッチの幅を具体化。
- `pace (slow to fast)` → 速度の幅を具体化。
- `Insert natural pauses between phrases` → ポーズの挿入を明示。
- `adding pitch variation on emotionally charged words` → 感情的な語への強調を追加。

**トークン数の影響**: 旧 ~65 token → 新 ~85 token (英語換算)。OpenAI TTS の instructions input は十分な余裕があり問題なし。

### 3-2. 7 プリセット全文 (目標 B + C)

**変更ファイル**: `movie-maker/lib/constants/tts-emotion-presets.ts`

#### 型定義の変更点

`key` の union 型に `'pro_intonation'` を追加:

```typescript
// Before
key: 'joy' | 'sadness' | 'anger' | 'surprise' | 'calm' | 'confusion';

// After
key: 'joy' | 'sadness' | 'anger' | 'surprise' | 'calm' | 'confusion' | 'pro_intonation';
```

#### プリセット全文 (英語、150-200 文字)

以下が `TTS_EMOTION_PRESETS` の全 7 件の新 instructions:

---

**key: `joy` / 😊 喜び**

```
Speak with bright, cheerful enthusiasm and rising intonation. Let your voice
peak joyfully on key words — use upbeat pacing with light, energetic rhythm.
Insert a brief pause before the happiest phrase to let it land with warmth.
Convey genuine happiness and infectious excitement, never flat or neutral.
```
(文字数: 約 190 文字)

---

**key: `sadness` / 😢 悲しみ**

```
Speak softly, slowly, with a downward falling intonation on every phrase.
Use long deliberate pauses — 1 to 2 seconds — between sentences, as if
gathering the courage to continue. Let your pitch drop low at the end of
each line. Convey quiet grief and melancholy without becoming melodramatic.
```
(文字数: 約 193 文字)

---

**key: `anger` / 😠 怒り**

```
Speak with firm, clipped delivery and sharp emphatic stress on key words.
Use controlled intensity — not shouting, but with compressed power and edge.
Pause deliberately before the most accusatory phrases. Keep pacing brisk and
direct. Let frustration build audibly through tightly controlled pitch rises.
```
(文字数: 約 195 文字)

---

**key: `surprise` / 😲 驚き**

```
Speak with a sudden, sharp rising intonation — as if catching your breath.
Let pitch spike dramatically on the most surprising word, then settle. Use
quick staccato pacing at the moment of revelation, followed by a pause.
Convey genuine astonishment with wide pitch range and expressive emphasis.
```
(文字数: 約 192 文字)

---

**key: `calm` / 😌 落ち着き**

```
Speak with a low, even, steady tone — slow pacing with minimal pitch variation.
Use gentle pauses between phrases to allow the listener to absorb each thought.
Avoid sharp emphasis or sudden pitch changes. Convey serene composure, gentle
reassurance, and a sense of quiet presence that is warm but never dramatic.
```
(文字数: 約 197 文字)

---

**key: `confusion` / 😕 困惑**

```
Speak with hesitant, searching delivery — trailing off at phrase ends as if
unsure. Use rising intonation on statements (questioning your own words).
Insert irregular pauses mid-sentence, as if thinking aloud. Let pitch waver
between uncertain highs and tentative lows. Convey genuine bewilderment and
difficulty finding the right words.
```
(文字数: 約 200 文字)

---

**key: `pro_intonation` / 🎭 プロ抑揚 (新規)**

```
Speak with theatrical intonation typical of a professional voice actor.
Use dramatic pitch variations — low whispers for tension, high peaks for
excitement. Insert deliberate pauses (1-2 seconds) before key phrases.
Emphasize emotionally charged words with vocal stress. Vary pacing dynamically:
slow for reflective parts, faster for excited moments. Sound deeply human
and engaging, never robotic or monotone.
```
(文字数: 約 205 文字)

---

### 3-3. 強化方針まとめ (4 軸の明示)

各プリセットで以下の 4 軸を明示的に指示する方針:

| 軸 | 英語キーワード | 役割 |
|--|--|--|
| **抑揚** | pitch variations / rising intonation / pitch spike / pitch drop | 声の高低変化を指定 |
| **ポーズ** | deliberate pauses / 1-2 seconds / trailing off | 間の取り方を指定 |
| **速度** | pacing / slow / fast / brisk / steady | テンポの変化を指定 |
| **強調** | emphatic stress / vocal stress / emphasis on key words | 強調箇所を指定 |

---

## 4. エッジケース

### 4-1. 短文 (1-2 文字) でも抑揚指示は効くか

- **判断**: gpt-4o-mini-tts は入力テキストの長さにかかわらず instructions を解釈する。1-2 文字の場合は自由度が低いが、指示が無視されるわけではない。
- **対応**: 特別な処理不要。現状通り。

### 4-2. 文字数増加で OpenAI input token 上限を超えないか

- **現在の文言**: プリセット 1 件あたり最大 100 文字 → 約 25 tokens。
- **新文言**: プリセット 1 件あたり最大 205 文字 → 約 55 tokens。
- **OpenAI gpt-4o-mini-tts の instructions token 上限**: 公式に未明示だが、既存 Design Doc の調査では input 上限 2000 文字 (保守値)。55 tokens は問題なし。
- **対応**: 許容範囲内。文言が 300 文字を超えた場合は再評価。

### 4-3. プリセット選択時に textarea に自動転記されるが UI が崩れないか

- **現在の textarea**: `rows={3}`, `maxLength={1000}`。
- **新文言の最大長**: 約 205 文字。現在の `maxLength={1000}` の範囲内。
- **表示**: 3 行に収まらない場合はスクロール可能 (textarea の標準挙動)。
- **対応**: UI 変更不要。既存の `rows/maxLength` 設定で問題なし。

### 4-4. 文言差し替えで AC2/AC3 のテスト assertion が壊れる

- **現状**: `tts-emotion-presets.test.ts` は文言の内容を検証していない (英語文字が含まれることのみチェック)。
- **影響**: プリセット件数 assertion (`toHaveLength(6)`) が新規追加の 1 件で壊れる。
- **対応**: §6 テスト戦略参照。件数アサーションを `7` に更新、`pro_intonation` key の存在確認を追加。

---

## 5. 後方互換性

### 5-1. 既存 dialogue/tts 生成への影響

- `tts_instructions` フィールドの値は UI から入力された文字列がそのままバックエンドに送られる。
- **プリセットを選んでいた既存ユーザー**: 次回プリセットボタンを押した時点で新文言が `ttsInstructions` にセットされる。それまでは古い文言が `tts_generations.instructions` に保存済みの値として残る (影響なし)。
- **プリセットを選んでいない既存ユーザー**: デフォルト instructions が変わるため、次回 TTS 合成から新デフォルト文が適用される。後方互換: 出力品質の変化は「向上」であり、既存機能が壊れるわけではない。

### 5-2. 既存テスト assertion の更新

- **バックエンド** (`tests/external/test_openai_tts_provider.py`): デフォルト instructions の assertion は `"Speak natural Japanese"` と `"robotic"` のサブストリング検索で実装済み。新デフォルト文もこれらを含むため **assertion の変更は不要**。
- **フロントエンド** (`tts-emotion-presets.test.ts`): プリセット件数 assertion が `6` → `7` に変更必要 (§6 参照)。

### 5-3. DB スキーマ

変更なし。

---

## 6. テスト戦略

### 6-1. バックエンドテスト

**ファイル**: `movie-maker-api/tests/external/test_openai_tts_provider.py`

対象テストクラス `TestOpenAITTSProviderDefaultInstructions` の既存テスト:
- `test_default_english_instructions_applied_when_instructions_none`: サブストリング `"Speak natural Japanese"` / `"robotic"` を検証 → 新デフォルト文も同じキーワードを含むため **変更不要**。
- `test_default_instructions_applied_when_instructions_empty_string`: 同上 → **変更不要**。
- `test_custom_instructions_passed_through`: カスタム文言のパススルー検証 → **変更不要**。

**追加テスト** (`TestOpenAITTSProviderDefaultInstructions` に追加):

| テスト名 | 検証内容 |
|--|--|
| `test_default_instructions_contains_pitch_variation` | 新デフォルト文に `"pitch"` および `"pauses"` が含まれる |
| `test_default_instructions_contains_dynamic_intonation` | 新デフォルト文に `"dynamic intonation"` が含まれる |

### 6-2. フロントエンドテスト

**ファイル**: `movie-maker/lib/constants/tts-emotion-presets.test.ts`

**変更が必要なテスト** (既存):
```typescript
// Before
it('should have exactly 6 presets', () => {
  expect(TTS_EMOTION_PRESETS).toHaveLength(6)
})

// After
it('should have exactly 7 presets', () => {
  expect(TTS_EMOTION_PRESETS).toHaveLength(7)
})
```

**追加テスト**:
```typescript
it('should contain pro_intonation preset', () => {
  const keys = TTS_EMOTION_PRESETS.map((p) => p.key)
  expect(keys).toContain('pro_intonation')
})

it('each preset instructions should be between 150 and 220 characters', () => {
  for (const preset of TTS_EMOTION_PRESETS) {
    expect(preset.instructions.length).toBeGreaterThanOrEqual(150)
    expect(preset.instructions.length).toBeLessThanOrEqual(220)
  }
})

it('each preset instructions should mention at least one of pitch/pace/pause/emphasis', () => {
  const intonationKeywords = ['pitch', 'pace', 'pacing', 'pause', 'emphasis', 'stress', 'intonation']
  for (const preset of TTS_EMOTION_PRESETS) {
    const hasKeyword = intonationKeywords.some((kw) =>
      preset.instructions.toLowerCase().includes(kw)
    )
    expect(hasKeyword).toBe(true)
  }
})

it('pro_intonation preset should have theatrical keyword', () => {
  const proPreset = TTS_EMOTION_PRESETS.find((p) => p.key === 'pro_intonation')
  expect(proPreset).toBeDefined()
  expect(proPreset!.instructions).toContain('theatrical')
  expect(proPreset!.emoji).toBe('🎭')
  expect(proPreset!.labelJa).toBe('プロ抑揚')
})
```

---

## 7. Acceptance Criteria (Given / When / Then)

### AC-A1: デフォルト instructions に抑揚指示が含まれる

**Given**: TTS_PROVIDER=openai_tts で動作している、`tts_instructions` を指定しない DialogueNode
**When**: ユーザーが「合成する」を押す
**Then**:
- バックエンドが gpt-4o-mini-tts に送信する instructions に `"dynamic intonation"` が含まれる
- instructions に `"pitch"` が含まれる
- instructions に `"pauses"` が含まれる
- 合成は正常に完了する

### AC-A2: 新デフォルト文の構造検証

**Given**: `OpenAITTSProvider.generate_speech(text="テスト", voice_id="alloy", language="ja", instructions=None)` を呼び出す
**When**: payload が生成される
**Then**:
- `payload["instructions"]` が `"Speak natural Japanese with rich emotional expression and dynamic intonation"` で始まる
- 文字列長が 200 文字以上である

### AC-B1: 既存プリセット文言が拡充されている

**Given**: `TTS_EMOTION_PRESETS` の各プリセットを参照する
**When**: `instructions` プロパティの文字数を確認する
**Then**: すべてのプリセットで `instructions.length >= 150` かつ `instructions.length <= 220` である

### AC-B2: 各プリセットに 4 軸の指示が含まれる

**Given**: `TTS_EMOTION_PRESETS` の各プリセットを参照する
**When**: instructions テキストを確認する
**Then**: `pitch`, `pace`/`pacing`, `pause`/`pauses`, `emphasis`/`stress`/`intonation` のいずれかのキーワードが各プリセットの instructions に含まれる

### AC-C1: プロ抑揚プリセットが追加されている

**Given**: `TTS_EMOTION_PRESETS` を参照する
**When**: プリセット数と key 一覧を確認する
**Then**:
- `TTS_EMOTION_PRESETS.length === 7`
- `key === 'pro_intonation'` のプリセットが存在する
- そのプリセットの `emoji === '🎭'`
- そのプリセットの `labelJa === 'プロ抑揚'`
- そのプリセットの instructions に `"theatrical"` が含まれる

### AC-C2: プロ抑揚プリセット選択時の動作

**Given**: DialogueNode の感情パネルが展開されている
**When**: ユーザーが「🎭 プロ抑揚」ボタンを押す
**Then**:
- `data.ttsInstructions` に `pro_intonation` プリセットの instructions 全文がセットされる
- textarea に同じ文字列が表示される
- 「合成する」を押すと、その instructions がバックエンドに送信される

### AC-COMPAT1: 既存 6 プリセットの key が変わらない

**Given**: `TTS_EMOTION_PRESETS` を参照する
**When**: key 一覧を確認する
**Then**: `['joy', 'sadness', 'anger', 'surprise', 'calm', 'confusion']` がすべて含まれる

### AC-COMPAT2: 既存テストが引き続きパスする

**Given**: `test_openai_tts_provider.py` の既存テスト (`"Speak natural Japanese"` / `"robotic"` サブストリング検証)
**When**: `pytest tests/external/test_openai_tts_provider.py` を実行する
**Then**: 既存のすべてのテストが pass する (assertion 変更は不要)

---

## 8. 変更影響マップ (Change Impact Map)

```yaml
変更対象: TTS 抑揚強化 (文言差し替え + プリセット追加)

直接影響:
  - movie-maker-api/app/external/openai_tts_provider.py:
      L80-85 のデフォルト instructions 文字列を差し替え
  - movie-maker/lib/constants/tts-emotion-presets.ts:
      6 プリセットの instructions 文言を拡充 + pro_intonation プリセット追加
      TTSEmotionPreset.key union 型に 'pro_intonation' を追加
  - movie-maker-api/tests/external/test_openai_tts_provider.py:
      新デフォルト文のキーワードを検証するテスト 2 件を追加
  - movie-maker/lib/constants/tts-emotion-presets.test.ts:
      件数 assertion を 6 → 7 に更新、pro_intonation 検証テストを追加

間接影響:
  - OpenAI TTS API: instructions token 数が増加 (約 +30 token/リクエスト)
    ただし gpt-4o-mini-tts の最低価格帯では実質コスト無視可能

波及なし (明示):
  - DB スキーマ (tts_generations.instructions, dialogue_generations.tts_instructions)
  - app/dialogue/* (schema / router / service)
  - app/tasks/* (dialogue_processor / tts_processor)
  - app/external/elevenlabs_provider.py
  - movie-maker/components/node-editor/nodes/DialogueNode.tsx (UI 変更なし)
  - movie-maker/lib/types/node-editor.ts (DialogueNodeData 変更なし)
  - movie-maker/lib/api/client.ts (DialogueCreatePayload 変更なし)
  - 既存 6 プリセットの key / emoji / labelJa (変更なし)
  - Polar / Webhook / 認証
```

---

## 9. インターフェース変更マトリックス (Interface Change Matrix)

| 既存操作 | 新操作 | 変換要否 | アダプター要否 | 互換性方式 |
|--|--|--|--|--|
| `TTSEmotionPreset.key` (6 値 union) | `TTSEmotionPreset.key` (7 値 union) | なし | 不要 | union への追加のみ。既存値は変更なし |
| `TTS_EMOTION_PRESETS` (6 件配列) | `TTS_EMOTION_PRESETS` (7 件配列) | なし | 不要 | 末尾への追加。既存インデックスは変化しない |
| デフォルト instructions 文言 | 新デフォルト instructions 文言 | あり (文面置換) | 不要 | 単純差し替え。既存 API シグネチャ変更なし |
| 各プリセット instructions 文字列 | 拡充後 instructions 文字列 | あり (文面置換) | 不要 | UI 表示・バックエンド送信ロジックは変更なし |

---

## 10. 統合境界契約 (Integration Boundary Contracts)

変更の影響を受ける境界は前提 Design Doc `2026-05-18_tts-emotion-instructions.md` §15 に定義済みであり、本 doc の変更はすべて boundary の内部実装 (文言) にとどまる。境界定義の変更なし。

```yaml
影響を受けない境界:
  - POST /api/v1/dialogue: リクエスト/レスポンス構造変化なし
  - create_tts_generation: シグネチャ変化なし
  - OpenAITTSProvider.generate_speech: シグネチャ変化なし (instructions 引数は既存)
```

---

## 11. 実装アプローチ

### 選択: Horizontal Slice (文言置換 → テスト更新)

本変更は単純な文言差し替えのため、以下の順序で実施:

1. **Step 1**: `openai_tts_provider.py` のデフォルト instructions 文言を差し替え (目標 A)
2. **Step 2**: `tts-emotion-presets.ts` の 6 プリセット文言を拡充 + `pro_intonation` 追加 (目標 B/C)
3. **Step 3**: バックエンドテスト更新/追加 (AC-A1/A2 対応)
4. **Step 4**: フロントエンドテスト更新/追加 (AC-B1/B2/C1/COMPAT1/COMPAT2 対応)
5. **Step 5**: 動作確認 (テスト実行)

各 Step 間に依存関係はなく、Step 1/2 は並列実施可能。

---

## 12. 想定工数

| 作業 | 内容 | 想定工数 |
|--|--|--|
| Step 1 | `openai_tts_provider.py` デフォルト文差し替え | 5 分 |
| Step 2 | `tts-emotion-presets.ts` 7 プリセット文言更新 | 10 分 |
| Step 3 | バックエンドテスト追加 | 10 分 |
| Step 4 | フロントエンドテスト更新 | 5 分 |
| Step 5 | 動作確認 (pytest + npm run test) | 5 分 |
| **合計** | | **約 35 分** |

---

## 13. 未解決項目

なし。本 doc の変更範囲はすべて確定している。

参考: 前提 Design Doc `2026-05-18_tts-emotion-instructions.md` §12 の未解決項目 (U2〜U6) は本変更のスコープ外であり、引き続き前提 doc 側で管理する。

---

## 14. References

- [GPT-4o mini TTS Model | OpenAI API](https://platform.openai.com/docs/models/gpt-4o-mini-tts) — gpt-4o-mini-tts の公式モデルドキュメント
- [Text to speech | OpenAI API](https://platform.openai.com/docs/guides/text-to-speech) — instructions パラメータの使用例
- [Voice Instruction with gpt-4o-mini-tts - OpenAI Developer Community](https://community.openai.com/t/voice-instruction-with-gpt-4o-mini-tts/1372075) — instructions の英語推奨に関するコミュニティ知見
- [`2026-05-18_tts-emotion-instructions.md`](./2026-05-18_tts-emotion-instructions.md) — 前提 Design Doc (6 プリセット実装 + 配線全体)

---

## 15. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-05-18 | 初版 |
