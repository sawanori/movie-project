---
id: T2-2
phase: 2
title: "lib/api/client.ts に ttsApi.listVoices(), dialogueApi.create(), getStatus() 追加"
depends_on:
  - T2-1
estimated_effort: S
files_touched:
  - movie-maker/lib/api/client.ts
---

## 目的

フロントエンドから Dialogue バックエンドと TTS 声リスト API を呼び出すための API クライアント関数を追加する。
T2-3 (DialogueNode.tsx) がこのクライアントを使用する。

## 前提

- T2-1 完了: `DialogueNodeData` 等の型が定義されていること
- `movie-maker/lib/api/client.ts` の `fetchWithAuth` の使い方を確認しておくこと (L22-86)
- 既存の `videosApi` の構造パターン (L119-143) を参照すること

## 変更内容

### 1. `VoiceInfo` 型の export 追加

```typescript
export type VoiceInfo = {
  voice_id: string
  name: string
  language: string | null
  preview_url: string | null
}
```

配置: 型定義セクション (既存の型定義の末尾)。

### 2. `ttsApi` オブジェクトの追加

```typescript
export const ttsApi = {
  /** 利用可能な声リストを取得 (lang で絞り込み) */
  listVoices: (lang?: string): Promise<VoiceInfo[]> =>
    fetchWithAuth(`/api/v1/tts/voices${lang ? `?lang=${lang}` : ''}`),
}
```

### 3. `dialogueApi` オブジェクトの追加

Design Doc §6-6 の仕様通り:

```typescript
type DialogueCreatePayload = {
  video_url: string
  text: string
  voice_id: string
  speed?: number
}

type DialogueCreateResult = {
  id: string
  status: string
  created_at: string
}

type DialogueStatusResult = {
  id: string
  status: string
  output_video_url: string | null
  error_message: string | null
}

export const dialogueApi = {
  /**
   * Dialogue 生成を開始する
   * タイムアウト: 900_000 ms (15 分)
   */
  create: (payload: DialogueCreatePayload): Promise<DialogueCreateResult> =>
    fetchWithAuth('/api/v1/dialogue', {
      method: 'POST',
      body: JSON.stringify({ ...payload, language: 'ja' }),
      timeout: 900_000,
    }),

  /**
   * Dialogue 生成ステータスをポーリング
   */
  getStatus: (generationId: string): Promise<DialogueStatusResult> =>
    fetchWithAuth(`/api/v1/dialogue/${generationId}/status`),
}
```

`timeout` オプションの実装確認: `fetchWithAuth` が `timeout` オプションをサポートしているか確認し、サポートしていない場合は既存の他 API が使っているタイムアウト指定パターンに合わせる。

## 完了条件 (AC)

- [x] `VoiceInfo` 型が export されている (既存)
- [x] `ttsApi.listVoices()` が export されている (既存)
- [x] `dialogueApi.create()` が export されている
- [x] `dialogueApi.getStatus()` が export されている
- [x] `language: 'ja'` が `create` のペイロードに自動で付加されている
- [x] `npm run build` (または `tsc --noEmit`) がエラーなし

## テスト

```bash
cd /Users/noritakasawada/AI_P/practice/movie-project/movie-maker
npx tsc --noEmit 2>&1 | head -30
```

型チェックのみ。実際の API 疎通は T3-1 (E2E) で確認する。

## ロールバック

`client.ts` から `VoiceInfo`, `ttsApi`, `dialogueApi` の追加分を削除する。
他ファイルへの変更はない。

## 参照

- Design Doc §6-6 (API クライアント仕様)
- Design Doc §2 (タイムアウト合意: BE 10 分, FE 15 分)
- `movie-maker/lib/api/client.ts` L22-86 (fetchWithAuth), L119-143 (videosApi 参考)
