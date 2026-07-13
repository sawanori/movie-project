/**
 * use-workflow-runs.test.tsx
 * サーバー側ワークフロー実行の一覧/詳細を SWR で 3 秒ポーリングする hook の単体テスト。
 * 全 run が terminal になったらポーリングを止める挙動を検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import React from 'react';
import { useWorkflowRuns, useWorkflowRunDetail, allRunsTerminal } from './use-workflow-runs';
import type {
  WorkflowRunListResponse,
  WorkflowRunDetail,
} from '@/lib/api/client';
import { workflowRunsApi } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  workflowRunsApi: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    cancelRun: vi.fn(),
    execute: vi.fn(),
  },
}));

// SWR cache を毎テストで独立させる wrapper
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

const RUNNING_LIST: WorkflowRunListResponse = {
  runs: [
    {
      id: 'run-1',
      workflow_id: 'wf-1',
      batch_id: 'batch-1',
      status: 'processing',
      progress: 40,
      final_output_url: null,
      error_message: null,
      created_at: '2026-05-20T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  per_page: 20,
};

const TERMINAL_LIST: WorkflowRunListResponse = {
  runs: [
    {
      id: 'run-1',
      workflow_id: 'wf-1',
      batch_id: 'batch-1',
      status: 'completed',
      progress: 100,
      final_output_url: 'https://example.com/out.mp4',
      error_message: null,
      created_at: '2026-05-20T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  per_page: 20,
};

const RUN_DETAIL: WorkflowRunDetail = {
  id: 'run-1',
  workflow_id: 'wf-1',
  batch_id: 'batch-1',
  status: 'processing',
  progress: 40,
  final_output_url: null,
  error_message: null,
  created_at: '2026-05-20T00:00:00Z',
  steps: [
    {
      node_id: 'provider-1',
      node_type: 'provider',
      status: 'submitting',
      output_url: null,
      error_message: null,
      provider_used: 'seedance',
    },
  ],
};

describe('allRunsTerminal', () => {
  it('returns false when a run is still processing', () => {
    expect(allRunsTerminal(RUNNING_LIST.runs)).toBe(false);
  });

  it('returns true when every run is completed/failed/canceled', () => {
    expect(allRunsTerminal(TERMINAL_LIST.runs)).toBe(true);
  });

  it('returns true for an empty list (nothing to poll)', () => {
    expect(allRunsTerminal([])).toBe(true);
  });
});

describe('useWorkflowRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch when workflowId is null', () => {
    const { result } = renderHook(() => useWorkflowRuns(null), {
      wrapper: Wrapper,
    });
    expect(result.current.data).toBeUndefined();
    expect(workflowRunsApi.listRuns).not.toHaveBeenCalled();
  });

  it('fetches runs for the given workflowId', async () => {
    vi.mocked(workflowRunsApi.listRuns).mockResolvedValue(RUNNING_LIST);

    const { result } = renderHook(() => useWorkflowRuns('wf-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.runs[0].id).toBe('run-1');
    expect(workflowRunsApi.listRuns).toHaveBeenCalledWith({ workflow_id: 'wf-1' });
  });
});

describe('useWorkflowRunDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch when runId is null', () => {
    const { result } = renderHook(() => useWorkflowRunDetail(null), {
      wrapper: Wrapper,
    });
    expect(result.current.data).toBeUndefined();
    expect(workflowRunsApi.getRun).not.toHaveBeenCalled();
  });

  it('fetches the run detail with its steps', async () => {
    vi.mocked(workflowRunsApi.getRun).mockResolvedValue(RUN_DETAIL);

    const { result } = renderHook(() => useWorkflowRunDetail('run-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.steps[0].status).toBe('submitting');
    expect(workflowRunsApi.getRun).toHaveBeenCalledWith('run-1');
  });
});
