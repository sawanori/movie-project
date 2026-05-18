# Overall Design Document: TTS 感情・トーン指定機能

Generation Date: 2026-05-18
Target Plan Document: docs/plans/2026-05-18_tts-emotion-instructions.md

## Project Overview

### Purpose and Goals

gpt-4o-mini-tts の `instructions` パラメータを UI から指定可能にすることで AI 棒読み感を解消する。6 プリセット感情 + 自由記述 textarea の折りたたみ UI を DialogueNode に追加し、その値を 8 段のパイプライン (FE → API → service → processor → DB → tts_processor → provider → OpenAI) を通り抜けて最終的に OpenAI TTS API に届ける。

### Background and Context

`TTSProviderInterface.generate_speech` には `instructions: Optional[str]` 引数が既に存在する (commit 843e6b7) が、呼び出し側全段で値が渡されていない配線漏れ状態。UI からの入力経路も存在しない。本作業はその配線を全段で補完し、UI を追加する。

## Task Division Design

### Division Policy

水平スライス + タスク粒度最小化。BE/FE の独立性を維持しながら、依存順序が明確なタスクに分割する。

- T1-1 / T1-2 / T1-5 は相互に独立、並列実行可
- T1-3 は T1-2 完了後
- T1-4 は T1-3 + T1-5 完了後
- T1-6 は T1-1〜T1-5 完了後 (またはモック先行で並列部分的に可)
- T2-1 は最初
- T2-2 / T2-3 は T2-1 完了後に並列可
- T2-4 は T2-3 完了後
- T2-5 は T2-1〜T2-4 完了後
- T3-1 / T3-2 は T1 + T2 全完了後
- T4-1 は最後の品質ゲート

### Inter-task Relationship Map

```
T1-1: provider デフォルト instructions 英語化
  ↓ (並列可)
T1-2: dialogue/schemas.py に tts_instructions フィールド追加
  ↓
T1-3: router.py + service.py 配線
  ↓
T1-4: dialogue_processor.py + tts/service.py + tts_processor.py 配線
T1-5: Supabase migration SQL 作成 + 適用 (T1-2 と並列可)
  ↓
T1-6: BE 単体テスト (T1-1〜T1-5 完了後)

T2-1: lib/types/node-editor.ts + lib/constants/tts-emotion-presets.ts 追加
  ↓
T2-2: lib/api/client.ts に tts_instructions 追加 (T2-1 後、T2-3 と並列可)
T2-3: DialogueNode.tsx UI 実装 (T2-1 後、T2-2 と並列可)
  ↓
T2-4: NodeEditor.tsx handleStartDialogue 配線 (T2-3 完了後)
  ↓
T2-5: FE 単体テスト (T2-1〜T2-4 完了後)

T3-1: 統合テスト + E2E テスト追加
T3-2: 回帰確認 (既存 dialogue 生成)

T4-1: 品質ゲート (tsc / lint / build / pytest)
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|---------------------|-------------------|
| `DialogueCreateRequest(text, voice_id, speed, use_lip_sync)` | `(..., tts_instructions?: str)` | None (Optional 追加) | T1-2 |
| `create_dialogue_generation(user_id, ..., use_lip_sync)` | `(..., tts_instructions=None)` | None | T1-3 |
| `create_tts_generation(user_id, text, voice_id, language, speed)` | `(..., instructions=None)` | None | T1-4 |
| `process_tts_generation` → `generate_speech(text, voice_id, language, speed)` | `(..., instructions=instructions)` | None | T1-4 |
| `OpenAITTSProvider` default instructions (日本語) | 新英語デフォルト文 | Yes (文面置換) | T1-1 |
| `DialogueNodeData { text, voiceId, speed, useLipSync }` | `{ ..., ttsInstructions? }` | None | T2-1 |
| `DialogueCreatePayload { video_url, text, voice_id, speed, use_lip_sync }` | `{ ..., tts_instructions? }` | None | T2-2 |

### Common Processing Points

- プリセット定義 (`TTS_EMOTION_PRESETS`) は `lib/constants/tts-emotion-presets.ts` に集約し、T2-1 で作成。T2-3 の DialogueNode から import する。
- `updateNodeData` パターンは既存 DialogueNode の慣習に合わせる (`window.dispatchEvent('nodeDataUpdate')`)。

## Implementation Considerations

### Principles to Maintain Throughout

1. 後方互換: 全フィールドは Optional / デフォルト None で既存レコードに影響しない
2. 二重防御: 空文字は FE (|| undefined) とBE (not instructions) の両方で None 相当に正規化
3. 折りたたみ初期状態: デフォルト折りたたみ (`useState(false)`)
4. プロバイダー非対応注記: 動的 API 不要、展開時常時表示 (A 案確定)

### Risks and Countermeasures

- Risk: `tts_processor.py` が `select("*")` で取得するため、migration 前に新カラムを参照するとエラー
  Countermeasure: T1-5 migration を T1-4 実装前に適用する
- Risk: `_make_dialogue_record` ヘルパー (テスト) に `tts_instructions` がないと既存テスト失敗
  Countermeasure: T1-6 でヘルパーを更新するか、T1-3 完了後に既存テストの互換性を確認

### Impact Scope Management

- 変更禁止: `app/external/elevenlabs_provider.py`、`app/external/tts_provider.py`、`app/tts/router.py`、`app/storyboard/`
- 変更対象 BE: `dialogue/schemas.py`, `dialogue/router.py`, `dialogue/service.py`, `tasks/dialogue_processor.py`, `tts/service.py`, `tasks/tts_processor.py`, `external/openai_tts_provider.py`
- 変更対象 FE: `lib/types/node-editor.ts`, `lib/api/client.ts`, `components/node-editor/nodes/DialogueNode.tsx`, `components/node-editor/NodeEditor.tsx`
- 新規作成: `lib/constants/tts-emotion-presets.ts`, `docs/migrations/20260518_add_tts_instructions.sql`
