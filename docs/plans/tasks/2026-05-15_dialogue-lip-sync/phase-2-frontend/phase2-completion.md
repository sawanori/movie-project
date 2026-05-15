---
id: phase2-completion
phase: 2
title: "Phase 2 完了チェック — フロントエンド統合確認"
depends_on:
  - T2-5
estimated_effort: S
files_touched: []
---

## 目的

Phase 2 (T2-1〜T2-5) の全タスクが完了したことを確認し、フロントエンドの統合ポイントを確認する。Design Doc §10-4「ステップ 2 完了時」の期待状態をすべて満たすことを確認する。

## 完了条件チェックリスト

### 全タスク完了確認

- [ ] T2-1: `lib/types/node-editor.ts` の `DialogueNodeData` に `useLipSync: boolean` が追加済、`errorMessage` 再宣言なし (B1)、`lipSyncGenerationId` 追加なし (N1)
- [ ] T2-2: `lib/api/client.ts` の `DialogueCreatePayload` に `use_lip_sync?: boolean` が追加済
- [ ] T2-3: `DialogueNode.tsx` にチェックボックス・条件付き注意書き・ボタンラベル切替が実装済
- [ ] T2-4: `NodeEditor.tsx` の `handleStartDialogue` が `use_lip_sync: dialogueData.useLipSync` を渡している
- [ ] T2-5: `DialogueNode.test.tsx` の 4 ケースが pass

### E2E 統合確認 (Design Doc §10-4)

#### 1. TypeScript + Build 成功

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | grep -c 'error' || echo "TypeScript OK"
npm run build 2>&1 | tail -5
```

#### 2. FE テスト全件 pass

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx jest components/node-editor/nodes/DialogueNode.test.tsx --no-coverage 2>&1 | tail -10
```

#### 3. ブラウザでチェックボックス操作可能なことを確認

手動確認:
1. `npm run dev` でフロントエンド起動
2. ノードエディタの DialogueNode を開く
3. 「口を動かす (リップシンク)」チェックボックスが表示されることを確認
4. チェック ON で Hedra 注意書きが表示され、TTS 注意書きが消えることを確認
5. ボタンラベルが「リップシンク合成する」に変わることを確認

#### 4. Network タブで payload に use_lip_sync 含む

手動確認:
1. DevTools Network タブを開く
2. チェックボックス ON で「リップシンク合成する」を押す
3. `POST /api/v1/dialogue` のリクエストボディに `"use_lip_sync": true` が含まれることを確認

#### 5. B1 / N1 制約の最終確認

```bash
# B1: errorMessage が DialogueNodeData で再宣言されていないこと
grep -n 'errorMessage' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/types/node-editor.ts
# DialogueNodeData のブロック外でのみヒットすること

# N1: lipSyncGenerationId が types に存在しないこと
grep -rn 'lipSyncGenerationId' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/
# 出力が空であること
```

## 参照

- Design Doc §10-2 ステップ 2 完了条件 (L1/L2/L3)
- Design Doc §10-4 統合ポイント定義「ステップ 2 完了時」
- Design Doc §6-1 B1 修正・N1 修正
- Design Doc §12 統合ポイントマップ (インテグレーションポイント 4)
