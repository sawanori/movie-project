# Overall Design Document: DialogueNode リップシンク拡張

Generation Date: 2026-05-15
Target Plan Document: docs/plans/2026-05-15_dialogue-lip-sync.md

## Project Overview

### Purpose and Goals

既存 DialogueNode に `useLipSync: boolean` トグルを追加し、ON 時に Hedra でリップシンク合成した動画を出力する。OFF 時は従来の ffmpeg 音声ミックスを維持し、既存 UX を破壊しない。

### Background and Context

- DialogueNode 元 Design Doc §14 で Hedra 拡張ポイントが設計済
- Hedra plumbing (HedraProvider / lip_sync_processor / lip_sync_generations テーブル) は完全実装済
- 新規実装は `dialogue_processor.py` の分岐ロジック 1 箇所 + DialogueNode UI のチェックボックス 1 箇所 + DB カラム 2 本のみ

## Task Division Design

### Division Policy

Vertical Slice 採用 (Design Doc §10-5)。BE → FE → E2E の縦切りで各フェーズ完了時に独立検証可能。水平レイヤー (Provider / Processor) は既製品で完成済のため新規水平構築は不要。

### Inter-task Relationship Map

```
T1-1: DB マイグレーション作成 + Supabase 適用
  → Deliverable: docs/migrations/20260515_dialogue_use_lip_sync.sql
  |
  +---> T1-2: schemas.py 拡張 (use_lip_sync フィールド追加)
  +---> T1-3: router.py 拡張 (use_lip_sync を service に渡す)
              ↓
  T1-4: service.py 拡張 (create/update シグネチャ拡張)
              ↓
  T1-5: dialogue_processor.py リファクタ + 分岐ロジック
              ↓
  T1-6: BE 単体テスト (test_lip_sync_branch.py 新規作成)
              ↓
  T2-1: lib/types/node-editor.ts 拡張 (useLipSync 型追加)
              ↓
  T2-2: lib/api/client.ts 拡張 (use_lip_sync payload 追加)    ←─┐
  T2-3: DialogueNode.tsx 拡張 (チェックボックス UI)             │ 並行
  T2-4: NodeEditor.tsx handleStartDialogue 拡張               ←─┘
              ↓
  T2-5: FE 単体テスト (DialogueNode.test.tsx 拡張)
              ↓
  T3-1: E2E 手動確認 (Hedra 実 API 課金あり)
```

### Interface Change Impact Analysis

| 既存 Interface | 新 Interface | 変換要否 | 対応タスク |
|---------------|-------------|---------|----------|
| `DialogueCreateRequest` (schemas) | `+ use_lip_sync: bool = False` | 後方互換 | T1-2 |
| `create_dialogue_generation(...)` | `+ use_lip_sync: bool = False` | 後方互換 | T1-4 |
| `update_dialogue_status(...)` | `+ lip_sync_generation_id: Optional[str]` | 後方互換 | T1-4 |
| `_process_core(...)` | `+ use_lip_sync: bool` 引数 | 内部のみ | T1-5 |
| `DialogueNodeData` (TS) | `+ useLipSync: boolean` | 後方互換 | T2-1 |
| `DialogueCreatePayload` (client.ts) | `+ use_lip_sync?: boolean` | 後方互換 | T2-2 |

### Common Processing Points

- `_translate_hedra_error()` ヘルパーは T1-5 で `dialogue_processor.py` 内に実装。他タスクとの共有なし (単一ファイル内使用)
- Hedra の `process_lip_sync_generation` は既存 `lip_sync_processor.py` を import するだけで再利用
- B1 制約 (`errorMessage` は `BaseNodeData` 継承): T2-1 と T2-3 の両 AC に明記
- N1 制約 (`lipSyncGenerationId` は FE で持たない): T2-1 の AC に明記

## Implementation Considerations

### Principles to Maintain Throughout

1. `use_lip_sync` デフォルトは `false` — 既存クライアント / レコードを破壊しない
2. `process_lip_sync_generation` を直 await (asyncio.create_task 禁止) — B3 解決パターン踏襲
3. `process_lip_sync_generation` は内部で例外を握り潰す設計のため、`await` 後に `get_lip_sync_status` で再 fetch して status 判定
4. `errorMessage` は `BaseNodeData` で定義済 — `DialogueNodeData` で再宣言禁止 (B1)
5. `lipSyncGenerationId` はフロントに露出しない (N1 / YAGNI)

### Risks and Countermeasures

- Risk: `process_lip_sync_generation` が failed を raise せず、DB に書くだけで return する
  Countermeasure: `_run_lip_sync_and_get_video_url` で `await` 後に `get_lip_sync_status` を呼び、status == "failed" なら `ValueError` を raise (Design Doc §7-2)

- Risk: 既存 `dialogue_generations` レコードに `use_lip_sync` カラムが存在しない
  Countermeasure: `record.get("use_lip_sync", False)` で二重防御 + DEFAULT false マイグレーション

- Risk: バックエンドタイムアウト (TTS 5 分 + Hedra 6 分 > 既存 10 分設定)
  Countermeasure: E2E (T3-1) で実測し、必要なら 900 秒に延長 (設定変更は T1-5 の AC 外)

### Impact Scope Management

- 変更可能スコープ:
  - `movie-maker-api/app/dialogue/` 以下 3 ファイル
  - `movie-maker-api/app/tasks/dialogue_processor.py`
  - `movie-maker/lib/types/node-editor.ts` の `DialogueNodeData` interface + `createDefaultNodeData` の `'dialogue'` ケース
  - `movie-maker/components/node-editor/nodes/DialogueNode.tsx`
  - `movie-maker/lib/api/client.ts` の `DialogueCreatePayload` 型
  - `movie-maker/components/node-editor/NodeEditor.tsx` の `handleStartDialogue` 内
- 変更禁止エリア:
  - `app/lip_sync/` ディレクトリ (既存 lip_sync API はそのまま)
  - `app/tasks/lip_sync_processor.py` (既存ロジック変更なし)
  - `app/external/hedra_provider.py` (変更なし)
  - `DialogueNodeData` の `errorMessage` フィールド (BaseNodeData 継承のため再宣言禁止)
