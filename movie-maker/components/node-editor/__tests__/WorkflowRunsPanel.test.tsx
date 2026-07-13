/**
 * WorkflowRunsPanel.test.tsx
 * サーバー実行の一覧/詳細/ステップ進捗/キャンセルを表示するパネルの単体テスト。
 * SWR 経由の API 呼び出しはモックし、submitting バッジ・キャンセル活性条件・
 * エラー表示・成果物リンクを検証する。
 * (プロジェクトは jest-dom を導入していないため native matcher で検証)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkflowRunsPanel } from '../WorkflowRunsPanel';
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

const LIST_RESPONSE: WorkflowRunListResponse = {
  runs: [
    {
      id: 'run-processing',
      workflow_id: 'wf-1',
      batch_id: 'batch-1',
      status: 'processing',
      progress: 40,
      final_output_url: null,
      error_message: null,
      created_at: '2026-05-20T00:00:00Z',
    },
    {
      id: 'run-completed',
      workflow_id: 'wf-1',
      batch_id: 'batch-1',
      status: 'completed',
      progress: 100,
      final_output_url: 'https://example.com/out.mp4',
      error_message: null,
      created_at: '2026-05-20T00:01:00Z',
    },
  ],
  total: 2,
  page: 1,
  per_page: 20,
};

const PROCESSING_DETAIL: WorkflowRunDetail = {
  id: 'run-processing',
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
    {
      node_id: 'generate-1',
      node_type: 'generate',
      status: 'pending',
      output_url: null,
      error_message: null,
      provider_used: null,
    },
  ],
};

const FAILED_DETAIL: WorkflowRunDetail = {
  id: 'run-failed',
  workflow_id: 'wf-1',
  batch_id: 'batch-2',
  status: 'failed',
  progress: 20,
  final_output_url: null,
  error_message: 'provider quota exceeded',
  created_at: '2026-05-20T00:02:00Z',
  steps: [
    {
      node_id: 'generate-1',
      node_type: 'generate',
      status: 'failed',
      output_url: null,
      error_message: 'generation timed out',
      provider_used: 'runway',
    },
  ],
};

const COMPLETED_DETAIL: WorkflowRunDetail = {
  id: 'run-completed',
  workflow_id: 'wf-1',
  batch_id: 'batch-1',
  status: 'completed',
  progress: 100,
  final_output_url: 'https://example.com/out.mp4',
  error_message: null,
  created_at: '2026-05-20T00:01:00Z',
  steps: [
    {
      node_id: 'generate-1',
      node_type: 'generate',
      status: 'completed',
      output_url: 'https://example.com/step.mp4',
      error_message: null,
      provider_used: 'seedance',
    },
  ],
};

describe('WorkflowRunsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workflowRunsApi.listRuns).mockResolvedValue(LIST_RESPONSE);
    vi.mocked(workflowRunsApi.getRun).mockResolvedValue(PROCESSING_DETAIL);
    vi.mocked(workflowRunsApi.cancelRun).mockResolvedValue({
      ...PROCESSING_DETAIL,
      status: 'canceled',
    });
  });

  it('renders the run list with status badges', async () => {
    render(<WorkflowRunsPanel workflowId="wf-1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('処理中')).toBeDefined();
    });
    expect(screen.getByText('完了')).toBeDefined();
  });

  it('shows the submitting step badge in the run detail', async () => {
    render(
      <WorkflowRunsPanel
        workflowId="wf-1"
        initialRunId="run-processing"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('送信中')).toBeDefined();
    });
    // step の node_type がラベルとして出る
    expect(screen.getAllByText(/provider/).length).toBeGreaterThan(0);
  });

  it('enables cancel for a processing run and calls cancelRun', async () => {
    render(
      <WorkflowRunsPanel
        workflowId="wf-1"
        initialRunId="run-processing"
        onClose={vi.fn()}
      />,
    );

    const cancelButton = (await screen.findByRole('button', {
      name: /キャンセル/,
    })) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(false);

    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(workflowRunsApi.cancelRun).toHaveBeenCalledWith('run-processing');
    });
  });

  it('disables cancel for a terminal (completed) run', async () => {
    vi.mocked(workflowRunsApi.getRun).mockResolvedValue(COMPLETED_DETAIL);

    render(
      <WorkflowRunsPanel
        workflowId="wf-1"
        initialRunId="run-completed"
        onClose={vi.fn()}
      />,
    );

    const cancelButton = (await screen.findByRole('button', {
      name: /キャンセル/,
    })) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
  });

  it('displays the error message for a failed run and its step', async () => {
    vi.mocked(workflowRunsApi.getRun).mockResolvedValue(FAILED_DETAIL);

    render(
      <WorkflowRunsPanel
        workflowId="wf-1"
        initialRunId="run-failed"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('provider quota exceeded')).toBeDefined();
    });
    expect(screen.getByText('generation timed out')).toBeDefined();
  });

  it('renders a download link to the final output for a completed run', async () => {
    vi.mocked(workflowRunsApi.getRun).mockResolvedValue(COMPLETED_DETAIL);

    render(
      <WorkflowRunsPanel
        workflowId="wf-1"
        initialRunId="run-completed"
        onClose={vi.fn()}
      />,
    );

    const link = (await screen.findByRole('link', {
      name: /ダウンロード/,
    })) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.com/out.mp4');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<WorkflowRunsPanel workflowId="wf-1" onClose={onClose} />);

    const closeButton = await screen.findByRole('button', {
      name: /閉じる/,
    });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
