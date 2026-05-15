# Kling Edge Scoping - 新 Phase 1 タスク一覧

作成日: 2026-05-15
対象 Design Doc: `docs/plans/2026-05-15_kling-edge-scoping.md`
合計工数目安: 1.4-2.0d

## タスク一覧

| タスク | 概要 | 工数目安 | 状態 |
|--------|------|----------|------|
| T1-1 | HANDLE_IDS 拡張 + ValidationError 型拡張 | 0.2d | 完了 |
| T1-2 | ProviderNode target Handle 6 個追加 + KlingCameraControl provider target 削除 | 0.5d | 未着手 |
| T1-3 | graph-to-api エッジトレースヘルパー + findNode 差し替え + Telemetry | 0.5d | 完了 |
| T1-4 | バリデーション拡張 (warnings + ambiguous_provider + disconnected_optional) | 0.3d | 未着手 |
| T1-5 | isValidConnection 実装 (NodeEditor.tsx) | 0.2d | 未着手 |
| T1-6 | ユニットテスト追加 (graph-to-api / useWorkflowValidation / ProviderNode) | 0.3d | 未着手 |
| T1-7 | E2E + UX 確認 (Playwright + 目視 + ビルド) | 0.2d | 未着手 |

## 依存関係図

```
T1-1 (型定義)
  ├── T1-2 (ProviderNode Handle 追加)     ─────────────────────┐
  └── T1-3 (graph-to-api エッジトレース)  ─────────────────┐   │
       └── T1-4 (バリデーション拡張)      ─────────────┐   │   │
                                                       │   │   │
      T1-2 ─────────────────────────────── T1-5 (isValidConnection)
                                                       │   │   │
                                              T1-6 ←──┴───┴───┘
                                              (全タスク完了後)
                                                 │
                                              T1-7 (E2E + 品質ゲート)
```

## 推奨実行順序

### 並列実行可能なグループ

**Group 1 (起点)**: T1-1 を最初に完了させる

**Group 2 (T1-1 完了後、並列実行可能)**:
- T1-2: ProviderNode の Handle 追加 (UI 変更)
- T1-3: graph-to-api のロジック変更 (T1-1 の HANDLE_IDS が必要)

**Group 3 (T1-2 + T1-3 完了後、並列実行可能)**:
- T1-4: バリデーション拡張 (T1-1 の型 + T1-3 のロジックが必要)
- T1-5: isValidConnection (T1-1 の HANDLE_IDS + T1-2 の Handle が必要)

**Group 4 (T1-4 + T1-5 完了後)**:
- T1-6: ユニットテスト (全実装完了後)

**Group 5 (T1-6 完了後)**:
- T1-7: E2E + 品質ゲート

### 最短パス (1 人で順次実行)

```
T1-1 → T1-3 → T1-2 → T1-4 → T1-5 → T1-6 → T1-7
```

または T1-2 と T1-3 を入れ替えても可。

## 主な影響ファイル

| ファイル | 変更タスク |
|----------|-----------|
| `movie-maker/lib/types/node-editor.ts` | T1-1 |
| `movie-maker/components/node-editor/nodes/ProviderNode.tsx` | T1-2 |
| `movie-maker/components/node-editor/nodes/KlingCameraControlNode.tsx` | T1-2 |
| `movie-maker/components/node-editor/utils/graph-to-api.ts` | T1-3 |
| `movie-maker/components/node-editor/hooks/useWorkflowValidation.ts` | T1-4 |
| `movie-maker/components/node-editor/NodeEditor.tsx` | T1-4 (warnings表示), T1-5 (isValidConnection) |
| `movie-maker/components/node-editor/utils/graph-to-api.test.ts` | T1-6 |
| `movie-maker/components/node-editor/hooks/useWorkflowValidation.test.ts` | T1-6 (新規) |
| `movie-maker/components/node-editor/nodes/ProviderNode.test.tsx` | T1-6 (新規) |
| `movie-maker/tests/e2e/node-editor-kling-edge-scope.spec.ts` | T1-7 (新規) |

## Design Doc の確定済みユーザー判断

- **§11-3 = A**: Handle 6 個を**常時表示** (動的表示なし、将来の Follow-up)
- **§11-4 = A**: 複数 ProviderNode 許容、`ambiguous_provider` warning でフィードバック
- **§11-5 = A**: `KlingCameraControlNode.tsx:73-78` の未配線 `PROVIDER_INPUT` target を**削除**

## 新 Phase 2 (今回対象外)

以下は 3-6 ヶ月後の別タスク分解対象:
- フォールバック削除 (`findKlingNodeWithFallbackWarning` の簡素化)
- `disconnected_optional` warning を error 昇格
- Feature Flag (`NEXT_PUBLIC_DISABLE_KLING_FALLBACK`) 運用
- 自動配線マイグレーションスクリプト

## AC マッピング

| AC | 検証タスク |
|----|-----------|
| AC-1 (Handle 6 個表示) | T1-2 + T1-6 + T1-7 |
| AC-2 (isValidConnection ガード) | T1-5 + T1-7 |
| AC-3 (単一接続で設定適用) | T1-3 + T1-6 |
| AC-4 (複数 Generate 独立解決) | T1-3 + T1-6 |
| AC-5 (フォールバック + 警告 + Telemetry) | T1-3 + T1-6 |
| AC-6 (warnings UI 表示) | T1-4 + T1-6 |
| AC-7 (provider_mismatch error) | T1-4 + T1-6 |
| AC-8 (既存グラフ互換性) | T1-3 + T1-7 |
| AC-9 (build / lint / test 全 pass) | T1-7 |
