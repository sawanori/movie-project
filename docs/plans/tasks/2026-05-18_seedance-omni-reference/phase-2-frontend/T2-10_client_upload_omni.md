---
id: T2-10
phase: 2
title: client.ts uploadOmni*Reference + StoryVideoCreateRequest 型拡張 (H-4 解消)
depends_on: [T1-9, T1-4]
parallel_with: []
estimated_effort: M
files_touched:
  - movie-maker/lib/api/client.ts
  - movie-maker/lib/api/__tests__/client_omni.test.ts
wave: 7
agent: frontend
---

## 目的

v3 計画書 §6.10 に従い、`lib/api/client.ts` に Upload API 3 種関数 (`uploadOmniVideoReference / uploadOmniAudioReference / uploadOmniImageReference`) と `StoryVideoCreateRequest` 型拡張を実装。**H-4 解消**: 後続 T2-11 / T2-13 が型に依存するため、Wave 7 単独で先行実施し contract を固定する。

## 前提

- 依存タスク:
  - T1-9 (FE 型 OmniReferenceSlot etc.)
  - T1-4 (Backend Upload API 3 endpoint 完成、`OmniReferenceAssetResponse` schema 固定)
- 並列実行可: なし (Wave 7 単独で contract 固定)
- 参照箇所: v3 計画書 §6.10, `movie-maker/lib/api/client.ts`

## 変更内容

### `movie-maker/lib/api/client.ts`

#### 型拡張

```ts
export interface StoryVideoCreateRequest {
  // ... 既存
  image_reference_asset_ids?: string[];  // UUID 文字列
  video_reference_asset_ids?: string[];
  audio_reference_asset_ids?: string[];
}

export interface OmniReferenceUploadResponse {
  id: string;
  url: string;
  media_type: 'video' | 'audio' | 'image';
  duration_seconds: number | null;
  content_type: string;
  file_size_bytes: number;
  expires_at: string;
}
```

#### Upload 関数 3 種

```ts
async function uploadOmniReference(
  endpoint: 'video' | 'audio' | 'image',
  file: File,
  consentAccepted: boolean,
): Promise<OmniReferenceUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('consent_accepted', String(consentAccepted));
  const res = await fetch(
    `${API_BASE_URL}/api/v1/videos/upload-omni-${endpoint}-reference`,
    { method: 'POST', body: form, headers: { ...authHeaders() } }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

export const uploadOmniVideoReference = (file: File, consent: boolean) =>
  uploadOmniReference('video', file, consent);
export const uploadOmniAudioReference = (file: File, consent: boolean) =>
  uploadOmniReference('audio', file, consent);
export const uploadOmniImageReference = (file: File, consent: boolean) =>
  uploadOmniReference('image', file, consent);
```

### 新規テスト: `lib/api/__tests__/client_omni.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadOmniVideoReference } from '../client';

describe('uploadOmniVideoReference', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('POST /upload-omni-video-reference with multipart form', async () => {
    const fakeRes = {
      id: 'uuid', url: 'https://r2/omni-references/u/x.mp4',
      media_type: 'video', duration_seconds: 5.0,
      content_type: 'video/mp4', file_size_bytes: 100,
      expires_at: '2026-05-21T00:00:00Z',
    };
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fakeRes), { status: 200 })
    );
    const file = new File([new Uint8Array(10)], 'x.mp4', { type: 'video/mp4' });
    const result = await uploadOmniVideoReference(file, true);
    expect(result.duration_seconds).toBe(5.0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/upload-omni-video-reference');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('throws on 422 with detail message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: '著作権同意が必要です' }), { status: 422 })
    );
    const file = new File([new Uint8Array(10)], 'x.mp4', { type: 'video/mp4' });
    await expect(uploadOmniVideoReference(file, false)).rejects.toThrow('著作権同意が必要です');
  });
});
```

audio / image 用も同パターンで test 追加。

## 完了条件 (AC)

- [x] `uploadOmniVideoReference / uploadOmniAudioReference / uploadOmniImageReference` 3 関数 export
- [x] `StoryVideoCreateRequest` に 3 つの `*_reference_asset_ids?: string[]` 追加
- [x] `OmniReferenceUploadResponse` 型 export
- [x] `npm run test client_omni` 全 pass
- [x] `npx tsc --noEmit` pass
- [x] `npm run lint` pass
- [x] 既存 client.ts API への破壊的変更なし

## H-4 解消

このタスクが Wave 7 単独で完了することで、T2-11 (OmniReferenceNode) と T2-13 (graph-to-api) が確定済 contract に基づいて並列着手可能になる。

## ロールバック

追加 export と test ファイル削除。型拡張取り消し。

## 参照

- v3 計画書 §6.10 (API クライアント)
- v3 計画書 §6.3 (Upload API 仕様)
- H-4 解消: contract 先行固定
