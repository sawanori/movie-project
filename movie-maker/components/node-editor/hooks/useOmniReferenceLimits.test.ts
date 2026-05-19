/**
 * useOmniReferenceLimits.test.ts
 * Backend `GET /api/v1/videos/config/omni-reference-limits` を SWR で取得する hook の単体テスト。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import React from 'react';
import {
  useOmniReferenceLimits,
  OMNI_REFERENCE_LIMITS_FALLBACK,
} from './useOmniReferenceLimits';
import type { OmniReferenceLimits } from '@/lib/api/client';

// SWR cache を毎テストで独立させる wrapper
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map() } },
    children,
  );
}

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

describe('useOmniReferenceLimits', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the limits from /api/v1/videos/config/omni-reference-limits and exposes data', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(FAKE_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useOmniReferenceLimits(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toEqual(FAKE_RESPONSE);
    expect(result.current.error).toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain(
      '/api/v1/videos/config/omni-reference-limits',
    );
    expect(init.method).toBe('GET');
  });

  it('surfaces an error when the backend returns a non-2xx response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    );

    const { result } = renderHook(() => useOmniReferenceLimits(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toMatch(
      /Omni reference limits fetch failed \(500\)/,
    );
  });

  it('exposes a fallback object matching backend defaults', () => {
    expect(OMNI_REFERENCE_LIMITS_FALLBACK.max_video_total_seconds).toBe(15.4);
    expect(OMNI_REFERENCE_LIMITS_FALLBACK.max_audio_total_seconds).toBe(15.0);
    expect(OMNI_REFERENCE_LIMITS_FALLBACK.max_image_reference_asset_ids).toBe(
      8,
    );
    expect(OMNI_REFERENCE_LIMITS_FALLBACK.consent_required).toBe(true);
  });
});
