# TTS 感情・トーン指定機能 — タスク一覧と実行ガイド

Plan Doc: `docs/plans/2026-05-18_tts-emotion-instructions.md`
Overview: `_overview.md`

## タスク一覧

| ID | ファイル | 概要 | 依存 | 並列可 |
|----|---------|------|------|--------|
| T1-1 | T1-1.md | OpenAITTSProvider デフォルト instructions 英語化 | なし | T1-2 / T1-5 と並列 |
| T1-2 | T1-2.md | DialogueCreateRequest に tts_instructions 追加 | なし | T1-1 / T1-5 と並列 |
| T1-3 | T1-3.md | router.py + service.py 配線 | T1-2 | |
| T1-4 | T1-4.md | dialogue_processor + tts/service + tts_processor 配線 | T1-3, T1-5 | |
| T1-5 | T1-5.md | Supabase migration SQL 作成 + 適用 | なし | T1-1 / T1-2 と並列 |
| T1-6 | T1-6.md | BE 単体テスト追加 | T1-1〜T1-5 | |
| T2-1 | T2-1.md | FE 型定義 + tts-emotion-presets.ts 作成 | なし | BE タスクと独立 |
| T2-2 | T2-2.md | lib/api/client.ts に tts_instructions 追加 | T2-1 | T2-3 と並列 |
| T2-3 | T2-3.md | DialogueNode.tsx 感情パネル UI 実装 | T2-1 | T2-2 と並列 |
| T2-4 | T2-4.md | NodeEditor.tsx handleStartDialogue 配線 | T2-2, T2-3 | |
| T2-5 | T2-5.md | FE 単体テスト追加 | T2-1〜T2-4 | |
| T3-1 | T3-1.md | 統合テスト + E2E テスト追加 | T1 全 + T2 全 | |
| T3-2 | T3-2.md | 回帰確認 | T3-1 | |
| T4-1 | T4-1.md | 品質ゲート (tsc/lint/build/pytest 全パス) | T3-2 | |

## 依存関係図

```
並列実行可能グループ A (Phase 1 BE 基盤):
  T1-1 ─────────────────────────────────────┐
  T1-2 ──── T1-3 ──── T1-4 (T1-5 完了後) ──┤
  T1-5 ─────────────────────────────────────┘
                                             └── T1-6

並列実行可能グループ B (Phase 2 FE):
  T2-1 ─── T2-2 ──┐
       └── T2-3 ──┤─── T2-4 ──── T2-5

Phase 3 (統合):
  [T1-6 完了] + [T2-5 完了] ──── T3-1 ──── T3-2 ──── T4-1
```

## 推奨実行順序

### 並列実行最大化パターン

```
Step 1 (並列): T1-1, T1-2, T1-5, T2-1
Step 2 (並列): T1-3 (T1-2 後), T2-2 (T2-1 後), T2-3 (T2-1 後)
Step 3 (並列): T1-4 (T1-3+T1-5 後), T2-4 (T2-2+T2-3 後)
Step 4 (並列): T1-6 (T1-4 後), T2-5 (T2-4 後)
Step 5 (逐次): T3-1 → T3-2 → T4-1
```

### シングルエージェント実行パターン

1. T1-5 (migration を先に適用して DB を準備)
2. T1-1
3. T1-2
4. T1-3
5. T1-4
6. T1-6
7. T2-1
8. T2-2
9. T2-3
10. T2-4
11. T2-5
12. T3-1
13. T3-2
14. T4-1

## 注意事項

- **T1-5 を T1-4 より前に適用すること**: `tts_processor.py` が `select("*")` で `instructions` カラムを読むため、migration 前に T1-4 を本番実行するとカラム不在エラーになる可能性がある (ローカルテストはモックなので問題なし)
- **T2-3 で `@xyflow/react` Context が必要**: DialogueNode テストは `<ReactFlowProvider>` でラップすること (T2-5 参照)
- **既存の失敗テスト 3 件は無視**: `tests/videos/test_text_to_image.py` ×2、`tests/library/test_service.py` ×1 は本タスクスコープ外の既存問題
- **スコープ外**: TTS 単独 API (`/api/v1/tts`)、Storyboard 経由 TTS、ElevenLabs プロバイダーの変更
