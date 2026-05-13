---
id: T2-7
phase: 2
title: frontend VideoProvider 型 + provider-support.ts への Seedance 追加
depends_on:
  - T2-1
estimated_effort: S
files_touched:
  - movie-maker/lib/types/video.ts
  - movie-maker/lib/camera/provider-support.ts
---

## 目的

`VideoProvider` 型と `VIDEO_PROVIDERS` 配列に `"seedance"` を追加し、`getCameraSupportLevel()` に `seedance` ケースを追加する。フロントエンドで Seedance がプロバイダー選択肢として表示される。

## 前提

- T2-1 完了 (バックエンド設定が整備されている)
- `movie-maker/lib/types/video.ts` の `VideoProvider` 型 (line 45 付近) と `VIDEO_PROVIDERS` 配列を確認すること
- `movie-maker/lib/camera/provider-support.ts` の `getCameraSupportLevel()` switch ブロック (line 99 付近) を確認すること

## 変更内容

### `movie-maker/lib/types/video.ts`

**`VideoProvider` 型拡張** (line 45 付近):

```typescript
// 変更前
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';

// 変更後
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo' | 'seedance';
```

**`VIDEO_PROVIDERS` 配列に新規エントリ追加**:

```typescript
  {
    value: "seedance" as const,
    label: "Seedance 2.0",
    description: "ByteDance製・高品質I2V/T2V (PiAPI経由)",
  },
```

### `movie-maker/lib/camera/provider-support.ts`

`getCameraSupportLevel()` 内の `switch` ブロックに `seedance` ケース追加:

```typescript
case 'seedance':
  // Seedance はAPIレベルのカメラ制御なし。プロンプト追従のみ。
  return 'prompt';
```

**挿入位置**: `case 'domoai':` ブロックの直後 (line 99 付近)。

## 完了条件 (AC)

- [ ] `VideoProvider` 型に `'seedance'` が含まれる
- [ ] `VIDEO_PROVIDERS` 配列に `value: "seedance"` のエントリが存在する
- [ ] `label` が `"Seedance 2.0"` である
- [ ] `getCameraSupportLevel('*', 'seedance')` が `'prompt'` を返す
- [ ] `cd movie-maker && npx tsc --noEmit` が型エラーなしで通る

## テスト

型チェック:
```bash
cd movie-maker && npx tsc --noEmit
```

E2E 動作確認は T2-8 で実施する。

## ロールバック

`VideoProvider` 型と `VIDEO_PROVIDERS` 配列への追加エントリを削除する。`getCameraSupportLevel()` の `seedance` ケースを削除する。

## 参照

- Design Doc §4.2 (`movie-maker/lib/types/video.ts` 変更内容)
- Design Doc §4.3 (`movie-maker/lib/camera/provider-support.ts` 変更内容)
- Design Doc §3.2 (カメラワーク: `prompt` fallback のみ)
