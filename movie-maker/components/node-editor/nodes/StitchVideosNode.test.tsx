import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock state for @xyflow/react ---
// These variables are shared between the mock factory and the tests.
let mockEdges: Array<{ source: string; target: string; targetHandle?: string }> = [];
const mockUpdateNodeInternals = vi.fn();

vi.mock('@xyflow/react', () => ({
  Handle: ({
    id,
    position,
    type,
    className,
    style,
  }: {
    id: string;
    position: string;
    type: string;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <div
      data-testid={`handle-${type}-${id}`}
      data-position={position}
      className={className}
      data-top={style ? String(style.top) : undefined}
    />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
  useEdges: () => mockEdges,
  useUpdateNodeInternals: () => mockUpdateNodeInternals,
}));

// Import after mocks are set up
import { StitchVideosNode } from './StitchVideosNode';
import type { StitchVideosNodeData } from '@/lib/types/node-editor';

// --- Helpers ---

function buildDefaultData(overrides: Partial<StitchVideosNodeData> = {}): StitchVideosNodeData {
  return {
    type: 'stitchVideos',
    isValid: true,
    transition: 'none',
    status: 'idle',
    progress: 0,
    stitchId: null,
    outputVideoUrl: null,
    ...overrides,
  };
}

const defaultProps = {
  id: 'test-stitch-node',
  selected: false,
  type: 'stitchVideos' as const,
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

describe('StitchVideosNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEdges = [];
  });

  // -----------------------------------------------------------------------
  // B1 Critical: Dynamic Handle rendering
  // -----------------------------------------------------------------------

  describe('Dynamic Handle rendering (B1)', () => {
    it('shows only handle 1 when 0 edges are connected', () => {
      mockEdges = [];
      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      // handle 1 must exist
      expect(screen.getByTestId('handle-target-video_1')).toBeDefined();
      // handle 2 must NOT exist
      expect(screen.queryByTestId('handle-target-video_2')).toBeNull();
    });

    it('shows handle 1 and handle 2 when 1 edge is connected', () => {
      mockEdges = [
        { source: 'other-node', target: 'test-stitch-node', targetHandle: 'video_1' },
      ];

      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      expect(screen.getByTestId('handle-target-video_1')).toBeDefined();
      expect(screen.getByTestId('handle-target-video_2')).toBeDefined();
      // handle 3 must NOT exist (we only add 1 ahead of connected count)
      expect(screen.queryByTestId('handle-target-video_3')).toBeNull();
    });

    it('shows handles 1–5 only (no handle 6) when 5 edges are connected', () => {
      mockEdges = [
        { source: 'n1', target: 'test-stitch-node', targetHandle: 'video_1' },
        { source: 'n2', target: 'test-stitch-node', targetHandle: 'video_2' },
        { source: 'n3', target: 'test-stitch-node', targetHandle: 'video_3' },
        { source: 'n4', target: 'test-stitch-node', targetHandle: 'video_4' },
        { source: 'n5', target: 'test-stitch-node', targetHandle: 'video_5' },
      ];

      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      expect(screen.getByTestId('handle-target-video_1')).toBeDefined();
      expect(screen.getByTestId('handle-target-video_2')).toBeDefined();
      expect(screen.getByTestId('handle-target-video_3')).toBeDefined();
      expect(screen.getByTestId('handle-target-video_4')).toBeDefined();
      expect(screen.getByTestId('handle-target-video_5')).toBeDefined();
      // handle 6 does not exist in STITCH_HANDLE_IDS
      expect(screen.queryByTestId('handle-target-video_6')).toBeNull();
    });

    it('calls useUpdateNodeInternals when visibleHandleCount changes (B1 verification)', () => {
      // Render with 0 edges → visibleHandleCount = 1
      mockEdges = [];
      const { rerender } = render(
        <StitchVideosNode {...defaultProps} data={buildDefaultData()} />
      );

      // Should be called on mount with the node id
      expect(mockUpdateNodeInternals).toHaveBeenCalledWith('test-stitch-node');
      const callCountAfterMount = mockUpdateNodeInternals.mock.calls.length;

      // Add 1 edge → visibleHandleCount changes from 1 → 2
      mockEdges = [
        { source: 'other-node', target: 'test-stitch-node', targetHandle: 'video_1' },
      ];

      act(() => {
        rerender(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);
      });

      // Must be called again because visibleHandleCount changed
      expect(mockUpdateNodeInternals.mock.calls.length).toBeGreaterThan(callCountAfterMount);
      expect(mockUpdateNodeInternals).toHaveBeenCalledWith('test-stitch-node');
    });
  });

  // -----------------------------------------------------------------------
  // Output handle
  // -----------------------------------------------------------------------

  describe('Output handle', () => {
    it('renders stitch_video_output source handle on the right', () => {
      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      const handle = screen.getByTestId('handle-source-stitch_video_output');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('right');
    });
  });

  // -----------------------------------------------------------------------
  // Execute button disabled/enabled
  // -----------------------------------------------------------------------

  describe('Execute button guards', () => {
    it('disables execute button when 0 videos are connected', () => {
      mockEdges = [];
      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      const button = screen.getByRole('button', { name: '動画を連結' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables execute button when exactly 1 video is connected', () => {
      mockEdges = [
        { source: 'n1', target: 'test-stitch-node', targetHandle: 'video_1' },
      ];

      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      const button = screen.getByRole('button', { name: '動画を連結' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables execute button when 2 videos are connected', () => {
      mockEdges = [
        { source: 'n1', target: 'test-stitch-node', targetHandle: 'video_1' },
        { source: 'n2', target: 'test-stitch-node', targetHandle: 'video_2' },
      ];

      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      const button = screen.getByRole('button', { name: '動画を連結' });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables execute button while status is processing', () => {
      mockEdges = [
        { source: 'n1', target: 'test-stitch-node', targetHandle: 'video_1' },
        { source: 'n2', target: 'test-stitch-node', targetHandle: 'video_2' },
      ];

      render(
        <StitchVideosNode
          {...defaultProps}
          data={buildDefaultData({ status: 'processing', progress: 50 })}
        />
      );

      const button = screen.getByRole('button');
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // CustomEvent dispatch
  // -----------------------------------------------------------------------

  describe('startStitchVideos event dispatch', () => {
    it('dispatches startStitchVideos CustomEvent with nodeId on button click', () => {
      mockEdges = [
        { source: 'n1', target: 'test-stitch-node', targetHandle: 'video_1' },
        { source: 'n2', target: 'test-stitch-node', targetHandle: 'video_2' },
      ];

      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);

      const button = screen.getByRole('button', { name: '動画を連結' });
      fireEvent.click(button);

      const events = dispatchSpy.mock.calls.map((c) => c[0] as CustomEvent);
      const stitchEvent = events.find((e) => e.type === 'startStitchVideos');
      expect(stitchEvent).toBeDefined();
      expect(stitchEvent?.detail).toEqual({ nodeId: 'test-stitch-node' });

      dispatchSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Status area rendering
  // -----------------------------------------------------------------------

  describe('Status area', () => {
    it('shows processing state with progress when status is processing', () => {
      render(
        <StitchVideosNode
          {...defaultProps}
          data={buildDefaultData({ status: 'processing', progress: 65 })}
        />
      );

      expect(screen.getByText('処理中... 65%')).toBeDefined();
    });

    it('shows completed state', () => {
      render(
        <StitchVideosNode
          {...defaultProps}
          data={buildDefaultData({
            status: 'completed',
            progress: 100,
            outputVideoUrl: 'https://example.com/out.mp4',
          })}
        />
      );

      expect(screen.getByText('連結完了')).toBeDefined();
    });

    it('shows failed state with error message', () => {
      render(
        <StitchVideosNode
          {...defaultProps}
          data={buildDefaultData({
            status: 'failed',
            errorMessage: '動画のダウンロードに失敗しました',
          })}
        />
      );

      // The error message appears in the status area; getAllByText handles duplicates
      const elements = screen.getAllByText('動画のダウンロードに失敗しました');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('shows video preview when completed with outputVideoUrl', () => {
      const { container } = render(
        <StitchVideosNode
          {...defaultProps}
          data={buildDefaultData({
            status: 'completed',
            progress: 100,
            outputVideoUrl: 'https://example.com/output.mp4',
          })}
        />
      );

      const video = container.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.getAttribute('src')).toBe('https://example.com/output.mp4');
    });
  });

  // -----------------------------------------------------------------------
  // Node title
  // -----------------------------------------------------------------------

  describe('Node title', () => {
    it('renders スティッチ as the title', () => {
      render(<StitchVideosNode {...defaultProps} data={buildDefaultData()} />);
      expect(screen.getByText('スティッチ')).toBeDefined();
    });
  });
});
