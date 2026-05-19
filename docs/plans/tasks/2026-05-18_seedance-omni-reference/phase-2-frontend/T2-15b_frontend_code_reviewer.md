---
id: T2-15b
phase: 2
title: Frontend code-reviewer (v3 計画書整合性)
depends_on: [T2-11, T2-12, T2-13, T2-14]
parallel_with: [T2-15a]
estimated_effort: S
files_touched: []
wave: 10
agent: ops
---

## 目的

Frontend 実装 (T2-10〜T2-14) を v3 計画書とつき合わせ、設計通りに実装されているか確認。

## 前提

- 依存タスク: T2-11, T2-12, T2-13, T2-14
- 並列実行可: T2-15a

## レビュー項目

### 1. v3 主要 Frontend 変更点

| v3 指摘 | 確認 |
|--------|------|
| imageSlots max=8 (NEW-C-4) | `lib/types/node-editor.ts`, `OmniReferenceNode.tsx` |
| audio 合計プログレスバー (NEW-C-3) | `OmniReferenceNode.tsx` MAX_AUDIO_TOTAL=15.0 |
| 著作権同意 checkbox | `OmniReferenceNode.tsx` + `useWorkflowValidation` |
| consent guard (graph-to-api) | F-16 で test |
| C-1 解消: nodeTypes 登録 | `node-types.ts` + `nodes/index.ts` |
| H-3 解消: ProviderNode handle + Editor guard | `ProviderNode.tsx`, `NodeEditor.tsx` |
| H-4 解消: client.ts contract 先行固定 | T2-10 が Wave 7 単独で完了 |

### 2. AC マッピング (Frontend 側)

| AC | 確認 |
|----|------|
| AC-1 | OmniReferenceNode に 3 種 slot + checkbox |
| AC-2, 3 | upload 関数連携 + duration 表示 |
| AC-4 | video 合計警告 (赤) |
| AC-4b (v3) | audio 合計警告 (赤) |
| AC-5 | graph-to-api で asset_ids マッピング |

### 3. アンチパターンチェック

- [ ] Tailwind v4: `@source` ディレクティブ追加していない
- [ ] CSS in JS で responsive grid 自動生成に依存していない (CLAUDE.md 記載バグ回避)
- [ ] 既存 ImageInputNode の Dropzone パターン踏襲
- [ ] HANDLE_IDS の hardcode string なし (定数経由)
- [ ] `@xyflow/react` の正しい使用 (Handle 等)

### 4. UX 観点

- [ ] image 8 slot は折り畳み UI で UX 過多回避 (§17 #12)
- [ ] consent 未チェック時の Dropzone disable が視覚的に明確
- [ ] エラー (422, 413) の toast 表示

## 完了条件 (AC)

- [ ] 全レビュー項目 OK
- [ ] アンチパターンなし
- [ ] AC 全件のテストカバー状況確認済
- [ ] 問題発見時はコメント + 差し戻し

## ロールバック

不要。

## 参照

- v3 計画書 §6.7〜§6.10, §15.2, §16
- CLAUDE.md (Tailwind v4)
