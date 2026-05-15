---
id: T2-2
phase: 2
title: "lib/api/client.ts 拡張 — DialogueCreatePayload に use_lip_sync 追加"
depends_on:
  - T2-1
estimated_effort: S
files_touched:
  - movie-maker/lib/api/client.ts
---

## 目的

`dialogueApi.create` が受け取る `DialogueCreatePayload` 型に `use_lip_sync?: boolean` を追加する。`JSON.stringify({ ...payload, language: 'ja' })` のスプレッド展開で自動的に BE に送られるため、他の変更は不要。

## 前提

- T2-1 (型定義拡張) 完了済
- `movie-maker/lib/api/client.ts:2004-2009` の `DialogueCreatePayload` 型と `dialogueApi.create` の実装を把握していること (Design Doc §6-3 参照)

## 変更内容

### `lib/api/client.ts`

**変更前** (`client.ts:2004-2009`):
```typescript
type DialogueCreatePayload = {
  video_url: string;
  text: string;
  voice_id: string;
  speed?: number;
};
```

**変更後**:
```typescript
type DialogueCreatePayload = {
  video_url: string;
  text: string;
  voice_id: string;
  speed?: number;
  use_lip_sync?: boolean;  // 追加 (default false, BE 側で扱う)
};
```

`dialogueApi.create` の実装本体 (`JSON.stringify` 呼び出し部分) は変更しない。`use_lip_sync` が payload に含まれれば自動的にスプレッドされる。

## 完了条件 (AC)

- [x] `DialogueCreatePayload` に `use_lip_sync?: boolean` が追加されている
- [x] 既存フィールド (`video_url`, `text`, `voice_id`, `speed`) に変更がない
- [x] `dialogueApi.create` の実装本体に変更がない (スプレッド展開を確認):
  ```bash
  grep -n 'use_lip_sync' /Users/noritakasawada/AI_P/practice/movie-project/movie-maker/lib/api/client.ts
  # DialogueCreatePayload の型定義箇所のみ 1 行ヒット
  ```
- [x] TypeScript 型チェックが通ること:
  ```bash
  cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
  npx tsc --noEmit 2>&1 | head -20
  ```
- [x] T2-4 完了後、ブラウザ Network タブで `dialogueApi.create` の request body に `use_lip_sync: true` が含まれること (T2-4 AC との連動確認)

## テスト

型チェックのみ。統合動作確認は T2-4 の Network タブ確認で行う。

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | grep -i 'error' | head -10
# エラーなし
```

## ロールバック

`DialogueCreatePayload` から `use_lip_sync?: boolean` 行を削除する。

## 参照

- Design Doc §6-3 API クライアント変更 (before/after 型定義)
- `movie-maker/lib/api/client.ts:2004-2009` (既存 DialogueCreatePayload)
