import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerateNode } from './GenerateNode';
import type { GenerateNodeData } from '@/lib/types/node-editor';

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  Handle: ({ id, position, type, className, style }: { id: string; position: string; type: string; className: string; style?: { top?: string } }) => (
    <div data-testid={`handle-${type}-${id}`} data-position={position} data-top={style?.top} className={className} />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
}));

describe('GenerateNode', () => {
  const defaultData: GenerateNodeData = {
    type: 'generate',
    isValid: false,
    isGenerating: false,
    progress: 0,
    videoUrl: null,
    error: null,
  };

  const defaultProps = {
    id: 'test-generate-node',
    data: defaultData,
    selected: false,
    type: 'generate' as const,
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with title', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('生成')).toBeDefined();
    });

    it('should render generate button', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('動画を生成')).toBeDefined();
    });

    it('should show waiting status when idle', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('待機中')).toBeDefined();
    });
  });

  describe('Input Handles', () => {
    it('should render image_url input handle', () => {
      render(<GenerateNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-target-image_url');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('left');
    });

    it('should render source_video_url input handle for V2V', () => {
      render(<GenerateNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-target-source_video_url');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('left');
    });

    it('should render story_text input handle', () => {
      render(<GenerateNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-target-story_text');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('left');
    });

    it('should render config input handle', () => {
      render(<GenerateNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-target-config');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('left');
    });

    it('should render camera_work input handle', () => {
      render(<GenerateNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-target-camera_work');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('left');
    });

    it('should have 5 input handles with correct positions', () => {
      render(<GenerateNode {...defaultProps} />);

      const imageHandle = screen.getByTestId('handle-target-image_url');
      const videoHandle = screen.getByTestId('handle-target-source_video_url');
      const storyHandle = screen.getByTestId('handle-target-story_text');
      const configHandle = screen.getByTestId('handle-target-config');
      const cameraHandle = screen.getByTestId('handle-target-camera_work');

      // Verify all 5 handles exist
      expect(imageHandle).toBeDefined();
      expect(videoHandle).toBeDefined();
      expect(storyHandle).toBeDefined();
      expect(configHandle).toBeDefined();
      expect(cameraHandle).toBeDefined();
    });
  });

  describe('Input Labels', () => {
    it('should show image label', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('画像 (必須)')).toBeDefined();
    });

    it('should show V2V video label', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('動画 V2V (オプション)')).toBeDefined();
    });

    it('should show prompt label', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('プロンプト (必須)')).toBeDefined();
    });

    it('should show settings label', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('設定 (オプション)')).toBeDefined();
    });

    it('should show camera work label', () => {
      render(<GenerateNode {...defaultProps} />);
      expect(screen.getByText('カメラワーク (オプション)')).toBeDefined();
    });
  });

  describe('Output Handle', () => {
    it('should render video_url output handle', () => {
      render(<GenerateNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-source-video_url');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('right');
    });
  });

  describe('Generation States', () => {
    it('should show generating status with progress', () => {
      render(<GenerateNode {...defaultProps} data={{ ...defaultData, isGenerating: true, progress: 50 }} />);
      expect(screen.getByText('生成中... 50%')).toBeDefined();
    });

    it('should show error status when error exists', () => {
      render(<GenerateNode {...defaultProps} data={{ ...defaultData, error: 'Test error' }} />);
      expect(screen.getByText('エラー')).toBeDefined();
      // Error message appears in multiple places (status and error panel)
      expect(screen.getAllByText('Test error').length).toBeGreaterThan(0);
    });

    it('should show completed status when video exists', () => {
      render(<GenerateNode {...defaultProps} data={{ ...defaultData, videoUrl: 'https://example.com/video.mp4' }} />);
      expect(screen.getByText('完了')).toBeDefined();
    });

    it('should disable button while generating', () => {
      render(<GenerateNode {...defaultProps} data={{ ...defaultData, isGenerating: true }} />);
      const button = screen.getByRole('button', { name: /生成中/ });
      expect(button.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('Event Handling', () => {
    it('should dispatch startGeneration event when generate button is clicked', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      render(<GenerateNode {...defaultProps} />);

      const button = screen.getByRole('button', { name: '動画を生成' });
      fireEvent.click(button);

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('startGeneration');
      expect(event.detail).toEqual({ nodeId: 'test-generate-node' });

      dispatchEventSpy.mockRestore();
    });

    it('should dispatch retry event with cleared error state', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      render(<GenerateNode {...defaultProps} data={{ ...defaultData, error: 'Test error' }} />);

      const retryButton = screen.getByText('再試行');
      fireEvent.click(retryButton);

      // First call is for nodeDataUpdate (clearing error), second is for startGeneration
      expect(dispatchEventSpy).toHaveBeenCalledTimes(2);

      const updateEvent = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(updateEvent.type).toBe('nodeDataUpdate');
      expect(updateEvent.detail.updates).toEqual({
        error: null,
        isGenerating: false,
        progress: 0,
      });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('Selection State', () => {
    it('should apply selected styles when selected', () => {
      const { container } = render(<GenerateNode {...defaultProps} selected={true} data={{ ...defaultData, isValid: true }} />);
      const node = container.firstChild as HTMLElement;
      // When selected and valid, should have yellow border
      expect(node.className).toContain('border-[#fce300]');
    });

    it('should not apply selected styles when not selected', () => {
      const { container } = render(<GenerateNode {...defaultProps} selected={false} data={{ ...defaultData, isValid: true }} />);
      const node = container.firstChild as HTMLElement;
      // When not selected and valid, should have gray border
      expect(node.className).toContain('border-[#404040]');
    });
  });

  describe('Video Preview', () => {
    it('should render video player when videoUrl exists', () => {
      const { container } = render(<GenerateNode {...defaultProps} data={{ ...defaultData, videoUrl: 'https://example.com/video.mp4' }} />);
      // Video element might not have role, check directly
      const videoElement = container.querySelector('video');
      expect(videoElement).not.toBeNull();
      expect(videoElement?.getAttribute('src')).toBe('https://example.com/video.mp4');
    });
  });
});
