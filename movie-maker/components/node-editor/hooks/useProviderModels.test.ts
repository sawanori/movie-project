/**
 * useProviderModels.test.ts
 * Backend `GET /api/v1/config/models` を SWR で取得する hook の単体テスト。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import React from 'react';
import { useProviderModels } from './useProviderModels';
import type { ProviderMetadata } from '@/lib/types/provider-metadata';

// SWR cache を毎テストで独立させる wrapper
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map() } },
    children,
  );
}

const FAKE_MODELS: ProviderMetadata[] = [
  {
    name: 'gen4_turbo',
    provider: 'runway',
    capabilities: ['image_to_video'],
    quality_score: 9,
    speed_score: 7,
    cost_per_second: 0.05,
    max_duration: 5,
    supported_aspect_ratios: ['9:16', '16:9'],
  },
  {
    name: 'seedance-pro',
    provider: 'seedance',
    capabilities: ['image_to_video', 'text_to_video'],
    quality_score: 8,
    speed_score: 6,
    cost_per_second: 0.13,
    max_duration: 15,
    supported_aspect_ratios: ['9:16', '16:9'],
  },
];

describe('useProviderModels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches models from /api/v1/config/models and exposes data', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(FAKE_MODELS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useProviderModels(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toEqual(FAKE_MODELS);
    expect(result.current.error).toBeUndefined();

    const [url] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain('/api/v1/config/models');
  });

  it('surfaces an error when the backend returns a non-2xx response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    );

    const { result } = renderHook(() => useProviderModels(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.data).toBeUndefined();
  });
});
