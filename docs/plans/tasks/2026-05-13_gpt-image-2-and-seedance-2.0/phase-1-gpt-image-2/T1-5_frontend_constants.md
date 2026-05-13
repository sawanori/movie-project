---
id: T1-5
phase: 1
title: frontend 定数追加 (GPT Image 2)
depends_on:
  - T1-1
estimated_effort: S
files_touched:
  - movie-maker/lib/constants/image-generation.ts
---

## 目的

`ImageProvider` 型と `IMAGE_PROVIDERS` 配列に `"openai_gpt_image2"` エントリを追加し、フロントエンドの画像プロバイダー選択 UI に "GPT Image 2 (OpenAI)" が表示されるようにする。

## 前提

- T1-1 完了 (バックエンド設定が整備されている)
- `movie-maker/lib/constants/image-generation.ts` の現在の構造を確認すること
  - `ImageProvider` 型 (line 9 付近)
  - `IMAGE_PROVIDERS` 配列 (`] as const;` の直前)
- `scene-image-generator-modal.tsx` の UI 変更は不要 (定数から自動取得)

## 変更内容

### `movie-maker/lib/constants/image-generation.ts`

**`ImageProvider` 型拡張** (line 9 付近):

```typescript
// 変更前
export type ImageProvider = "nanobanana" | "bfl_flux2_pro";

// 変更後
export type ImageProvider = "nanobanana" | "bfl_flux2_pro" | "openai_gpt_image2";
```

**`IMAGE_PROVIDERS` 配列に新規エントリ追加** (`] as const;` の直前):

```typescript
  {
    value: "openai_gpt_image2" as const,
    label: "GPT Image 2 (OpenAI)",
    maxLength: 32000,
    description: "OpenAI 最新モデル・高解像度 (Phase 1 は text-to-image のみ)",
    supportsStructuredInput: false,
    supportsReferenceImage: false,
    // maxReferenceImages: 1,  // Phase 3+ で /edits 実装時に有効化
  },
```

**注意**: `supportsStructuredInput: false` および `supportsReferenceImage: false` は Phase 1 の仕様通り固定。`/edits` エンドポイント実装 (Phase 3+) 時に `supportsReferenceImage: true` + `maxReferenceImages: 1` に変更する。

## 完了条件 (AC)

- [ ] `ImageProvider` 型に `"openai_gpt_image2"` が含まれる
- [ ] `IMAGE_PROVIDERS` 配列に `value: "openai_gpt_image2"` のエントリが存在する
- [ ] `label` が `"GPT Image 2 (OpenAI)"` である
- [ ] `supportsStructuredInput` が `false`
- [ ] `supportsReferenceImage` が `false`
- [ ] `cd movie-maker && npx tsc --noEmit` が型エラーなしで通る
- [ ] `image_provider="openai_gpt_image2"` をバックエンドに送信する動線が UI 上で選択可能になっている (手動確認)

## テスト

型チェック:
```bash
cd movie-maker && npx tsc --noEmit
```

UI 動作確認は T1-6 (動作確認タスク) で実施する。

## ロールバック

`ImageProvider` 型と `IMAGE_PROVIDERS` 配列への追加エントリを削除する。型変更のため `tsc` エラーが起きないことを確認する。

## 参照

- Design Doc §4.1 (`movie-maker/lib/constants/image-generation.ts` 変更内容)
- Design Doc §10 (スコープ外: `/edits` は Phase 3+)
