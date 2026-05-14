import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetVideoFrameNode } from '../GetVideoFrameNode';
import type { GetVideoFrameNodeData } from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  Handle: ({
    id,
    position,
    type,
    className,
  }: {
    id: string;
    position: string;
    type: string;
    className: string;
  }) => (
    <div
      data-testid={`handle-${type}-${id}`}
      data-position={position}
      className={className}
    />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
}));

const defaultData: GetVideoFrameNodeData = {
  type: 'getVideoFrame',
  isValid: true,
  direction: 'first',
  status: 'idle',
  inputVideoUrl: null,
  outputImageUrl: null,
};

const defaultProps = {
  id: 'test-get-video-frame-node',
  data: defaultData,
  selected: false,
  type: 'getVideoFrame' as const,
  dragging: false,
  draggable: true,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  deletable: true,
  selectable: true,
  parentId: undefined,
};

describe('GetVideoFrameNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the node title, direction select, and execute button', () => {
      render(<GetVideoFrameNode {...defaultProps} />);

      // 'フレーム抽出' はノードタイトルとボタンラベルの両方に出現する
      const frameExtractElements = screen.getAllByText('フレーム抽出');
      expect(frameExtractElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('combobox')).toBeDefined();
      expect(screen.getByRole('button', { name: /フレーム抽出/ })).toBeDefined();
    });

    it('should render both first and last options in the direction select', () => {
      render(<GetVideoFrameNode {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeDefined();
      expect(screen.getByText('最初のフレーム')).toBeDefined();
      expect(screen.getByText('最後のフレーム')).toBeDefined();
    });

    it('should render input handle (target) on the left with video color', () => {
      render(<GetVideoFrameNode {...defaultProps} />);

      const inputHandle = screen.getByTestId(
        `handle-target-${HANDLE_IDS.GET_VIDEO_FRAME_VIDEO_INPUT}`
      );
      expect(inputHandle).toBeDefined();
      expect(inputHandle.getAttribute('data-position')).toBe('left');
      // 緑色 (video) のクラスが付与されている
      expect(inputHandle.className).toContain('green');
    });

    it('should render output handle (source) on the right with image color', () => {
      render(<GetVideoFrameNode {...defaultProps} />);

      const outputHandle = screen.getByTestId(
        `handle-source-${HANDLE_IDS.GET_VIDEO_FRAME_IMAGE_OUTPUT}`
      );
      expect(outputHandle).toBeDefined();
      expect(outputHandle.getAttribute('data-position')).toBe('right');
      // 青色 (image) のクラスが付与されている
      expect(outputHandle.className).toContain('blue');
    });

    it('should NOT have stub data-testid (stub replaced by full implementation)', () => {
      render(<GetVideoFrameNode {...defaultProps} />);
      expect(screen.queryByTestId('get-video-frame-node-stub')).toBeNull();
    });
  });

  describe('direction change', () => {
    it('should dispatch nodeDataUpdate with direction=last when selecting last', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      render(<GetVideoFrameNode {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'last' } });

      const dispatchedEvents = dispatchEventSpy.mock.calls.map(
        (call) => call[0] as CustomEvent
      );
      const updateEvent = dispatchedEvents.find(
        (e) => e.type === 'nodeDataUpdate'
      );

      expect(updateEvent).toBeDefined();
      expect(updateEvent?.detail).toEqual({
        nodeId: 'test-get-video-frame-node',
        updates: { direction: 'last' },
      });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('execute button disabled/enabled', () => {
    it('should disable the execute button when inputVideoUrl is null', () => {
      render(<GetVideoFrameNode {...defaultProps} />);

      const button = screen.getByRole('button', { name: /フレーム抽出/ });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable the execute button when inputVideoUrl is set', () => {
      const propsWithVideo = {
        ...defaultProps,
        data: { ...defaultData, inputVideoUrl: 'https://example.com/video.mp4' },
      };

      render(<GetVideoFrameNode {...propsWithVideo} />);

      const button = screen.getByRole('button', { name: /フレーム抽出/ });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('should disable the execute button when status is processing even with inputVideoUrl', () => {
      const processingProps = {
        ...defaultProps,
        data: {
          ...defaultData,
          inputVideoUrl: 'https://example.com/video.mp4',
          status: 'processing' as const,
        },
      };

      render(<GetVideoFrameNode {...processingProps} />);

      const button = screen.getByRole('button', { name: /フレーム抽出/ });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('execute button dispatches event', () => {
    it('should dispatch startGetVideoFrame event on button click when enabled', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const enabledProps = {
        ...defaultProps,
        data: {
          ...defaultData,
          inputVideoUrl: 'https://example.com/video.mp4',
          status: 'idle' as const,
        },
      };

      render(<GetVideoFrameNode {...enabledProps} />);

      const button = screen.getByRole('button', { name: /フレーム抽出/ });
      fireEvent.click(button);

      const dispatchedEvents = dispatchEventSpy.mock.calls.map(
        (call) => call[0] as CustomEvent
      );
      const startEvent = dispatchedEvents.find(
        (e) => e.type === 'startGetVideoFrame'
      );

      expect(startEvent).toBeDefined();
      expect(startEvent?.detail).toEqual({
        nodeId: 'test-get-video-frame-node',
      });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('status display', () => {
    it('should show Loader2 (spinning) when status is processing', () => {
      const processingData: GetVideoFrameNodeData = {
        ...defaultData,
        status: 'processing',
        inputVideoUrl: 'https://example.com/video.mp4',
      };

      render(<GetVideoFrameNode {...defaultProps} data={processingData} />);

      // Loader2 は animate-spin クラスを持つ要素としてレンダリングされる
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeDefined();
      expect(screen.getByText('抽出中...')).toBeDefined();
    });

    it('should show CheckCircle and thumbnail preview when status is completed', async () => {
      const completedData: GetVideoFrameNodeData = {
        ...defaultData,
        status: 'completed',
        outputImageUrl: 'https://example.com/frame.jpg',
      };

      render(<GetVideoFrameNode {...defaultProps} data={completedData} />);

      await waitFor(() => {
        expect(screen.getByText('抽出完了')).toBeDefined();
        const img = screen.getByRole('img');
        expect((img as HTMLImageElement).src).toContain('frame.jpg');
      });
    });

    it('should show AlertCircle and error message when status is failed', async () => {
      const failedData: GetVideoFrameNodeData = {
        ...defaultData,
        status: 'failed',
        errorMessage: 'フレームの抽出に失敗しました',
      };

      render(<GetVideoFrameNode {...defaultProps} data={failedData} />);

      await waitFor(() => {
        // errorMessage は status area と BaseNode footer の両方に表示される
        const errorElements = screen.getAllByText('フレームの抽出に失敗しました');
        expect(errorElements.length).toBeGreaterThan(0);
      });
    });

    it('should show no status indicator when status is idle', () => {
      render(<GetVideoFrameNode {...defaultProps} />);

      expect(screen.queryByText('抽出中...')).toBeNull();
      expect(screen.queryByText('抽出完了')).toBeNull();
    });
  });
});
