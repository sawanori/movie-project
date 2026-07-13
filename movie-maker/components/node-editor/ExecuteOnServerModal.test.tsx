/**
 * ExecuteOnServerModal.test.tsx
 * サーバー実行モーダル: バッチ画像選択・モデル選択・消費見込み/残数・実行を検証する。
 * API はモックし、残数不足でボタン無効/理由表示、execute の body 整合、
 * selection_priority segmented control を確認する。
 * (プロジェクトは jest-dom を導入していないため native matcher で検証)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExecuteOnServerModal } from './ExecuteOnServerModal';
import type {
  UnifiedImageListResponse,
  ExecuteWorkflowResponse,
} from '@/lib/api/client';
import { authApi, libraryApi, workflowRunsApi } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  authApi: {
    getUsage: vi.fn(),
  },
  libraryApi: {
    listAll: vi.fn(),
  },
  workflowRunsApi: {
    execute: vi.fn(),
  },
}));

const USAGE_OK = {
  plan_type: 'pro',
  videos_used: 2,
  videos_limit: 10,
  videos_remaining: 8,
};

const USAGE_EMPTY = {
  plan_type: 'free',
  videos_used: 3,
  videos_limit: 3,
  videos_remaining: 0,
};

const LIBRARY_RESPONSE: UnifiedImageListResponse = {
  library_images: [
    {
      id: 'img-1',
      user_id: 'u-1',
      name: 'Image 1',
      description: null,
      image_url: 'https://example.com/img1.png',
      thumbnail_url: 'https://example.com/img1-thumb.png',
      r2_key: 'k1',
      width: 100,
      height: 100,
      aspect_ratio: '1:1',
      file_size_bytes: 1000,
      source: 'generated',
      image_provider: 'gpt',
      generated_prompt_ja: null,
      generated_prompt_en: null,
      category: 'general',
      created_at: '2026-05-19T00:00:00Z',
      updated_at: '2026-05-19T00:00:00Z',
    },
    {
      id: 'img-2',
      user_id: 'u-1',
      name: 'Image 2',
      description: null,
      image_url: 'https://example.com/img2.png',
      thumbnail_url: 'https://example.com/img2-thumb.png',
      r2_key: 'k2',
      width: 100,
      height: 100,
      aspect_ratio: '1:1',
      file_size_bytes: 1000,
      source: 'uploaded',
      image_provider: null,
      generated_prompt_ja: null,
      generated_prompt_en: null,
      category: 'general',
      created_at: '2026-05-19T00:00:00Z',
      updated_at: '2026-05-19T00:00:00Z',
    },
  ],
  screenshots: [],
  total_library: 2,
  total_screenshots: 0,
  page: 1,
  per_page: 20,
};

const EXECUTE_RESPONSE: ExecuteWorkflowResponse = {
  batch_id: 'batch-xyz',
  run_ids: ['run-a'],
};

describe('ExecuteOnServerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.getUsage).mockResolvedValue(USAGE_OK);
    vi.mocked(libraryApi.listAll).mockResolvedValue(LIBRARY_RESPONSE);
    vi.mocked(workflowRunsApi.execute).mockResolvedValue(EXECUTE_RESPONSE);
  });

  it('does not render when closed', () => {
    const { container } = render(
      <ExecuteOnServerModal
        isOpen={false}
        workflowId="wf-1"
        onClose={vi.fn()}
        onExecuted={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the reservation estimate (1 by default) and remaining count', async () => {
    render(
      <ExecuteOnServerModal
        isOpen
        workflowId="wf-1"
        onClose={vi.fn()}
        onExecuted={vi.fn()}
      />,
    );

    await waitFor(() => {
      // N = 未選択なら 1、残り M
      expect(screen.getByText(/1 本を予約/)).toBeDefined();
    });
    expect(screen.getByText(/残り 8 本/)).toBeDefined();
  });

  it('disables execute and shows a reason when remaining is insufficient', async () => {
    vi.mocked(authApi.getUsage).mockResolvedValue(USAGE_EMPTY);

    render(
      <ExecuteOnServerModal
        isOpen
        workflowId="wf-1"
        onClose={vi.fn()}
        onExecuted={vi.fn()}
      />,
    );

    const executeButton = (await screen.findByRole('button', {
      name: /サーバーで実行/,
    })) as HTMLButtonElement;

    await waitFor(() => {
      expect(executeButton.disabled).toBe(true);
    });
    expect(screen.getByText(/残り本数が不足/)).toBeDefined();
  });

  it('executes with no selection_priority when following graph settings (default)', async () => {
    const onExecuted = vi.fn();
    render(
      <ExecuteOnServerModal
        isOpen
        workflowId="wf-1"
        onClose={vi.fn()}
        onExecuted={onExecuted}
      />,
    );

    const executeButton = await screen.findByRole('button', {
      name: /サーバーで実行/,
    });
    await waitFor(() => {
      expect((executeButton as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(workflowRunsApi.execute).toHaveBeenCalledWith('wf-1', {});
    });
    await waitFor(() => {
      expect(onExecuted).toHaveBeenCalledWith(EXECUTE_RESPONSE);
    });
  });

  it('sends selection_priority when an "おまかせ" mode is chosen', async () => {
    render(
      <ExecuteOnServerModal
        isOpen
        workflowId="wf-1"
        onClose={vi.fn()}
        onExecuted={vi.fn()}
      />,
    );

    const qualityButton = await screen.findByRole('button', { name: /品質/ });
    fireEvent.click(qualityButton);

    const executeButton = await screen.findByRole('button', {
      name: /サーバーで実行/,
    });
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(workflowRunsApi.execute).toHaveBeenCalledWith('wf-1', {
        selection_priority: 'quality',
      });
    });
  });

  it('includes selected image urls and updates the reservation count', async () => {
    render(
      <ExecuteOnServerModal
        isOpen
        workflowId="wf-1"
        onClose={vi.fn()}
        onExecuted={vi.fn()}
      />,
    );

    // ライブラリ画像が読み込まれるまで待つ
    const firstImage = await screen.findByAltText('Image 1');
    fireEvent.click(firstImage);

    const secondImage = screen.getByAltText('Image 2');
    fireEvent.click(secondImage);

    // 2 枚選択で予約本数が 2 に更新される
    await waitFor(() => {
      expect(screen.getByText(/2 本を予約します/)).toBeDefined();
    });

    const executeButton = await screen.findByRole('button', {
      name: /サーバーで実行/,
    });
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(workflowRunsApi.execute).toHaveBeenCalledWith('wf-1', {
        input_image_urls: [
          'https://example.com/img1.png',
          'https://example.com/img2.png',
        ],
      });
    });
  });

  it('calls onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <ExecuteOnServerModal
        isOpen
        workflowId="wf-1"
        onClose={onClose}
        onExecuted={vi.fn()}
      />,
    );

    const cancelButton = await screen.findByRole('button', {
      name: /^キャンセル$/,
    });
    fireEvent.click(cancelButton);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
