'use client';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoInputNode } from './VideoInputNode';
import type { VideoInputNodeData } from '@/lib/types/node-editor';

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  Handle: ({ id, position, type, className }: { id: string; position: string; type: string; className: string }) => (
    <div data-testid={`handle-${type}-${id}`} data-position={position} className={className} />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
}));

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(() => ({
    getRootProps: () => ({ onClick: vi.fn() }),
    getInputProps: () => ({}),
    isDragActive: false,
  })),
}));

// Mock userVideosApi
vi.mock('@/lib/api/client', () => ({
  userVideosApi: {
    upload: vi.fn(),
    list: vi.fn().mockResolvedValue({
      videos: [],
      total: 0,
      page: 1,
      per_page: 20,
      has_next: false,
    }),
  },
}));

// Mock createPortal
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

const defaultData: VideoInputNodeData = {
  type: 'videoInput',
  isValid: false,
  videoUrl: null,
  videoThumbnail: null,
  videoDuration: null,
  sourceType: 'upload',
};

const defaultProps = {
  id: 'test-node-1',
  data: defaultData,
  selected: false,
  type: 'videoInput' as const,
  dragging: false,
  draggable: true,
  zIndex: 1,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  deletable: true,
  selectable: true,
  parentId: undefined,
  sourcePosition: undefined,
  targetPosition: undefined,
  dragHandle: undefined,
};

describe('VideoInputNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the node with title', () => {
      render(<VideoInputNode {...defaultProps} />);
      expect(screen.getByText('V2V')).toBeDefined();
    });

    it('should display Runway-only notice', () => {
      render(<VideoInputNode {...defaultProps} />);
      expect(screen.getByText(/V2VはRunwayのみ対応/)).toBeDefined();
    });

    it('should render upload mode tab as active by default', () => {
      render(<VideoInputNode {...defaultProps} />);
      const uploadTab = screen.getByText('Upload');
      expect(uploadTab.closest('button')?.className).toContain('bg-[#fce300]');
    });

    it('should render history and URL tabs', () => {
      render(<VideoInputNode {...defaultProps} />);
      expect(screen.getByText('History')).toBeDefined();
      expect(screen.getByText('URL')).toBeDefined();
    });

    it('should render output handle with correct id', () => {
      render(<VideoInputNode {...defaultProps} />);
      const handle = screen.getByTestId('handle-source-source_video_url');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('right');
    });
  });

  describe('Tab Switching', () => {
    it('should switch to history mode when History tab is clicked', () => {
      render(<VideoInputNode {...defaultProps} />);
      const historyTab = screen.getByText('History');
      fireEvent.click(historyTab);
      expect(historyTab.closest('button')?.className).toContain('bg-[#fce300]');
    });

    it('should switch to URL mode when URL tab is clicked', () => {
      render(<VideoInputNode {...defaultProps} />);
      const urlTab = screen.getByText('URL');
      fireEvent.click(urlTab);
      expect(urlTab.closest('button')?.className).toContain('bg-[#fce300]');
    });
  });

  describe('URL Input Mode', () => {
    it('should show URL input field when in URL mode', () => {
      render(<VideoInputNode {...defaultProps} />);
      const urlTab = screen.getByText('URL');
      fireEvent.click(urlTab);
      expect(screen.getByPlaceholderText(/URL/)).toBeDefined();
    });

    it('should show apply button when in URL mode', () => {
      render(<VideoInputNode {...defaultProps} />);
      const urlTab = screen.getByText('URL');
      fireEvent.click(urlTab);
      expect(screen.getByRole('button', { name: /Apply/i })).toBeDefined();
    });
  });

  describe('Upload Mode', () => {
    it('should show drop zone when in upload mode', () => {
      render(<VideoInputNode {...defaultProps} />);
      expect(screen.getByText(/Drop video/i)).toBeDefined();
    });
  });

  describe('Video Preview', () => {
    it('should display video thumbnail when videoThumbnail is provided', () => {
      const dataWithThumbnail: VideoInputNodeData = {
        ...defaultData,
        videoThumbnail: 'https://example.com/thumbnail.jpg',
        videoUrl: 'https://example.com/video.mp4',
        isValid: true,
      };
      render(<VideoInputNode {...defaultProps} data={dataWithThumbnail} />);
      const thumbnail = screen.getByAltText(/Preview/i);
      expect(thumbnail).toBeDefined();
      expect(thumbnail.getAttribute('src')).toBe('https://example.com/thumbnail.jpg');
    });

    it('should display duration when videoDuration is provided', () => {
      const dataWithDuration: VideoInputNodeData = {
        ...defaultData,
        videoThumbnail: 'https://example.com/thumbnail.jpg',
        videoUrl: 'https://example.com/video.mp4',
        videoDuration: 5.5,
        isValid: true,
      };
      render(<VideoInputNode {...defaultProps} data={dataWithDuration} />);
      expect(screen.getByText(/5.5s/)).toBeDefined();
    });

    it('should show clear button when video is loaded', () => {
      const dataWithVideo: VideoInputNodeData = {
        ...defaultData,
        videoThumbnail: 'https://example.com/thumbnail.jpg',
        videoUrl: 'https://example.com/video.mp4',
        isValid: true,
      };
      render(<VideoInputNode {...defaultProps} data={dataWithVideo} />);
      // Clear button should be present (X icon) - check for multiple buttons with SVG
      const clearButtons = screen.getAllByRole('button');
      const clearButton = clearButtons.find(btn => btn.querySelector('svg'));
      expect(clearButton).toBeDefined();
    });
  });

  describe('Error States', () => {
    it('should display error message when provided', () => {
      const dataWithError: VideoInputNodeData = {
        ...defaultData,
        errorMessage: 'Upload failed',
        isValid: false,
      };
      render(<VideoInputNode {...defaultProps} data={dataWithError} />);
      expect(screen.getByText('Upload failed')).toBeDefined();
    });
  });

  describe('Selection State', () => {
    it('should apply selected styles when selected is true and valid', () => {
      const validData: VideoInputNodeData = {
        ...defaultData,
        isValid: true,
        videoUrl: 'https://example.com/video.mp4',
        videoThumbnail: 'https://example.com/thumbnail.jpg',
      };
      const { container } = render(<VideoInputNode {...defaultProps} data={validData} selected={true} />);
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('border-[#fce300]');
    });

    it('should not apply selected styles when not selected and valid', () => {
      const validData: VideoInputNodeData = {
        ...defaultData,
        isValid: true,
        videoUrl: 'https://example.com/video.mp4',
        videoThumbnail: 'https://example.com/thumbnail.jpg',
      };
      const { container } = render(<VideoInputNode {...defaultProps} data={validData} selected={false} />);
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('border-[#404040]');
    });

    it('should apply error styles when isValid is false', () => {
      const { container } = render(<VideoInputNode {...defaultProps} selected={false} />);
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('border-red-500');
    });
  });

  describe('nodeDataUpdate Event', () => {
    it('should dispatch nodeDataUpdate event when clear button is clicked', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      const dataWithVideo: VideoInputNodeData = {
        ...defaultData,
        videoThumbnail: 'https://example.com/thumbnail.jpg',
        videoUrl: 'https://example.com/video.mp4',
        isValid: true,
      };
      render(<VideoInputNode {...defaultProps} data={dataWithVideo} />);

      // Find and click the clear button (with X icon)
      const clearButtons = screen.getAllByRole('button');
      const clearButton = clearButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.className.includes('absolute');
      });

      if (clearButton) {
        fireEvent.click(clearButton);

        expect(dispatchEventSpy).toHaveBeenCalled();
        const events = dispatchEventSpy.mock.calls.filter(
          call => (call[0] as CustomEvent).type === 'nodeDataUpdate'
        );
        expect(events.length).toBeGreaterThan(0);
      }

      dispatchEventSpy.mockRestore();
    });
  });
});
