/**
 * client.omni-limits.test.ts
 * `fetchOmniReferenceLimits` (M-3 frontend) の単体テスト。
 * 認証不要 endpoint なので fetchWithAuth ではなく素の fetch を呼ぶ点を検証する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}));

import {
  fetchOmniReferenceLimits,
  type OmniReferenceLimits,
} from '../client';

const FAKE_RESPONSE: OmniReferenceLimits = {
  max_image_urls: 9,
  max_video_urls: 3,
  max_audio_urls: 3,
  max_video_total_seconds: 15.4,
  max_audio_total_seconds: 15.0,
  max_image_reference_asset_ids: 8,
  upload_file_size_limits: {
    video: 52_428_800,
    audio: 10_485_760,
    image: 10_485_760,
  },
  consent_required: true,
  asset_ttl_seconds: 259_200,
};

describe('fetchOmniReferenceLimits', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('GETs /api/v1/videos/config/omni-reference-limits and returns parsed body', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(FAKE_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchOmniReferenceLimits();

    expect(result).toEqual(FAKE_RESPONSE);

    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain(
      '/api/v1/videos/config/omni-reference-limits',
    );
    expect(init.method).toBe('GET');
    // 認証不要 (no Authorization header)
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws when the response is non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('upstream error', { status: 503 }),
    );

    await expect(fetchOmniReferenceLimits()).rejects.toThrow(
      /Omni reference limits fetch failed \(503\)/,
    );
  });
});
