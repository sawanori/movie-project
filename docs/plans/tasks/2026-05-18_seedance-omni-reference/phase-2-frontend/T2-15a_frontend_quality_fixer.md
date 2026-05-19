---
id: T2-15a
phase: 2
title: Frontend quality-fixer (npm test / lint / type-check)
depends_on: [T2-11, T2-12, T2-13, T2-14]
parallel_with: [T2-15b]
estimated_effort: S
files_touched: []
wave: 10
agent: ops
---

## 目的

Frontend 全変更 (T2-10〜T2-14) について、品質保証を実施。Vitest 全件 pass、ESLint pass、TypeScript 型チェック pass を担保。

## 前提

- 依存タスク: T2-11, T2-12, T2-13, T2-14
- 並列実行可: T2-15b (code-reviewer)

## 実施手順

### 1. テスト全件実行

```bash
cd movie-maker
npm run test 2>&1 | tee /tmp/fe_test_log.txt
```

### 2. 新規追加テスト件数確認

| ファイル | 件数 |
|---------|------|
| OmniReferenceNode.test.tsx | 10 (F-1〜F-6, F-14, F-15, F-17, F-17b) |
| graph-to-api.test.ts 拡張 | 6 (F-7〜F-11, F-16) |
| ProviderNode.test.tsx 拡張 | 2 (F-12, F-13) |
| useWorkflowValidation.test.ts 拡張 | 3 (V-1〜V-3) |
| client_omni.test.ts | 6+ |
| **合計** | **27+** |

### 3. lint / type-check

```bash
npm run lint
npx tsc --noEmit
```

### 4. ビルド確認

```bash
npm run build
```

(Tailwind CSS v4 の既知バグ対応も含む — CLAUDE.md ルール準拠、`@source` 追加禁止)

### 5. 問題発生時

- lint エラー: 自動修正後 commit
- test 失敗: 該当タスク (T2-X) 差し戻し
- 型エラー: 即座に修正
- ビルド失敗: 原因調査して fix

## 完了条件 (AC)

- [ ] 新規テスト 27 件以上 全 pass
- [ ] 既存 Vitest 全件 pass (回帰なし)
- [ ] `npm run lint` pass
- [ ] `npx tsc --noEmit` pass
- [ ] `npm run build` 成功
- [ ] Tailwind v4 既知バグ (CLAUDE.md 記載) に違反していない (`@source` 追加禁止)
- [ ] テスト結果ログを `/tmp/fe_test_log.txt` 保存

## ロールバック

変更を加える場合は atomic commit、問題タスクへ差し戻し。

## 参照

- v3 計画書 §15.2 (Frontend テスト)
- CLAUDE.md (Tailwind v4 ルール)
- AC-18
