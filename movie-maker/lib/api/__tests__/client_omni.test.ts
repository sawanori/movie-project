import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}));

import {
  uploadOmniVideoReference,
  uploadOmniAudioReference,
  uploadOmniImageReference,
  type OmniReferenceUploadResult,
} from '../client';

describe('uploadOmniVideoReference', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('POSTs multipart form to /upload-omni-video-reference and returns parsed body', async () => {
    const fakeRes: OmniReferenceUploadResult = {
      id: 'uuid-video',
      url: 'https://r2/omni-references/u/x.mp4',
      media_type: 'video',
      duration_seconds: 5.0,
      content_type: 'video/mp4',
      file_size_bytes: 100,
      expires_at: '2026-05-21T00:00:00Z',
    };
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(fakeRes), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const file = new File([new Uint8Array(10)], 'x.mp4', { type: 'video/mp4' });

    const result = await uploadOmniVideoReference(file, true);

    expect(result).toEqual(fakeRes);
    expect(result.duration_seconds).toBe(5.0);

    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain('/api/v1/videos/upload-omni-video-reference');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBe('Bearer test-token');

    const form = init.body as FormData;
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('consent_accepted')).toBe('true');
  });

  it('sends consent_accepted=false when consent is false', async () => {
    const fakeRes: OmniReferenceUploadResult = {
      id: 'uuid-v2',
      url: 'https://r2/omni-references/u/y.mp4',
      media_type: 'video',
      duration_seconds: null,
      content_type: 'video/mp4',
      file_size_bytes: 50,
      expires_at: '2026-05-21T00:00:00Z',
    };
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(fakeRes), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const file = new File([new Uint8Array(5)], 'y.mp4', { type: 'video/mp4' });

    await uploadOmniVideoReference(file, false);

    const [, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const form = init.body as FormData;
    expect(form.get('consent_accepted')).toBe('false');
  });

  it('throws an Error containing the backend detail on 422', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: '著作権同意が必要です' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const file = new File([new Uint8Array(10)], 'x.mp4', { type: 'video/mp4' });

    await expect(uploadOmniVideoReference(file, false)).rejects.toThrow(
      '著作権同意が必要です',
    );
  });

  it('throws a fallback message when detail is missing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('not json', { status: 500 }),
    );
    const file = new File([new Uint8Array(10)], 'x.mp4', { type: 'video/mp4' });

    await expect(uploadOmniVideoReference(file, true)).rejects.toThrow(
      /Omni reference upload failed \(500\)/,
    );
  });
});

describe('uploadOmniAudioReference', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('POSTs multipart form to /upload-omni-audio-reference', async () => {
    const fakeRes: OmniReferenceUploadResult = {
      id: 'uuid-audio',
      url: 'https://r2/omni-references/u/a.mp3',
      media_type: 'audio',
      duration_seconds: 12.3,
      content_type: 'audio/mpeg',
      file_size_bytes: 2048,
      expires_at: '2026-05-21T00:00:00Z',
    };
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(fakeRes), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const file = new File([new Uint8Array(10)], 'a.mp3', { type: 'audio/mpeg' });

    const result = await uploadOmniAudioReference(file, true);

    expect(result.media_type).toBe('audio');
    expect(result.duration_seconds).toBe(12.3);

    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain('/api/v1/videos/upload-omni-audio-reference');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('consent_accepted')).toBe('true');
  });

  it('throws on 415 unsupported media type', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'サポートされていない音声形式です' }), {
        status: 415,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const file = new File([new Uint8Array(10)], 'a.xyz', { type: 'audio/xyz' });

    await expect(uploadOmniAudioReference(file, true)).rejects.toThrow(
      'サポートされていない音声形式です',
    );
  });
});

describe('uploadOmniImageReference', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('POSTs multipart form to /upload-omni-image-reference', async () => {
    const fakeRes: OmniReferenceUploadResult = {
      id: 'uuid-image',
      url: 'https://r2/omni-references/u/i.png',
      media_type: 'image',
      duration_seconds: null,
      content_type: 'image/png',
      file_size_bytes: 4096,
      expires_at: '2026-05-21T00:00:00Z',
    };
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(fakeRes), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const file = new File([new Uint8Array(10)], 'i.png', { type: 'image/png' });

    const result = await uploadOmniImageReference(file, false);

    expect(result.media_type).toBe('image');
    expect(result.duration_seconds).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain('/api/v1/videos/upload-omni-image-reference');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('consent_accepted')).toBe('false');
  });

  it('throws when no auth session is available', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/client', () => ({
      createClient: () => ({
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
          refreshSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
      }),
    }));
    const { uploadOmniImageReference: uploadNoAuth } = await import('../client');
    const file = new File([new Uint8Array(1)], 'i.png', { type: 'image/png' });

    await expect(uploadNoAuth(file, true)).rejects.toThrow(/認証が必要です/);
  });
});
