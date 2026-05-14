import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrimVideoNode } from '../TrimVideoNode';
import type { TrimVideoNodeData } from '@/lib/types/node-editor';

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

const defaultData: TrimVideoNodeData = {
  type: 'trimVideo',
  isValid: true,
  inputVideoUrl: 'https://example.com/input.mp4',
  startSeconds: 0,
  endSeconds: null,
  status: 'idle',
  outputVideoUrl: null,
};

const defaultProps = {
  id: 'test-trim-node',
  data: defaultData,
  selected: false,
  type: 'trimVideo' as const,
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

describe('TrimVideoNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dispatches startTrimVideo event on valid execution', () => {
    it('should dispatch startTrimVideo CustomEvent with nodeId when start=2, end=5', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const readyData: TrimVideoNodeData = {
        ...defaultData,
        startSeconds: 2,
        endSeconds: 5,
        inputVideoUrl: 'https://example.com/input.mp4',
        status: 'idle',
      };

      render(<TrimVideoNode {...defaultProps} data={readyData} />);

      const button = screen.getByRole('button', { name: /トリム/i });
      fireEvent.click(button);

      const dispatchedEvents = dispatchEventSpy.mock.calls.map(
        (call) => call[0] as CustomEvent
      );
      const startTrimEvent = dispatchedEvents.find(
        (e) => e.type === 'startTrimVideo'
      );

      expect(startTrimEvent).toBeDefined();
      expect(startTrimEvent?.detail).toEqual({ nodeId: 'test-trim-node' });

      dispatchEventSpy.mockRestore();
    });

    it('should dispatch startTrimVideo with endSeconds null when end is empty', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const nullEndData: TrimVideoNodeData = {
        ...defaultData,
        startSeconds: 0,
        endSeconds: null,
        inputVideoUrl: 'https://example.com/input.mp4',
        status: 'idle',
      };

      render(<TrimVideoNode {...defaultProps} data={nullEndData} />);

      const button = screen.getByRole('button', { name: /トリム/i });
      fireEvent.click(button);

      const dispatchedEvents = dispatchEventSpy.mock.calls.map(
        (call) => call[0] as CustomEvent
      );
      const startTrimEvent = dispatchedEvents.find(
        (e) => e.type === 'startTrimVideo'
      );

      expect(startTrimEvent).toBeDefined();
      expect(startTrimEvent?.detail).toEqual({ nodeId: 'test-trim-node' });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('validation disables execute button', () => {
    it('should disable execute button and show error when start=5, end=3 (start > end)', () => {
      const invalidData: TrimVideoNodeData = {
        ...defaultData,
        startSeconds: 5,
        endSeconds: 3,
        inputVideoUrl: 'https://example.com/input.mp4',
      };

      render(<TrimVideoNode {...defaultProps} data={invalidData} />);

      const button = screen.getByRole('button', { name: /トリム/i });
      expect((button as HTMLButtonElement).disabled).toBe(true);

      expect(screen.getByText(/終了時刻は開始時刻より大きい値/)).toBeDefined();
    });

    it('should disable execute button when start=5, end=5 (start == end)', () => {
      const equalData: TrimVideoNodeData = {
        ...defaultData,
        startSeconds: 5,
        endSeconds: 5,
        inputVideoUrl: 'https://example.com/input.mp4',
      };

      render(<TrimVideoNode {...defaultProps} data={equalData} />);

      const button = screen.getByRole('button', { name: /トリム/i });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('should disable execute button when inputVideoUrl is null', () => {
      const noInputData: TrimVideoNodeData = {
        ...defaultData,
        inputVideoUrl: null,
        startSeconds: 0,
        endSeconds: 5,
      };

      render(<TrimVideoNode {...defaultProps} data={noInputData} />);

      const button = screen.getByRole('button', { name: /トリム/i });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('handle rendering', () => {
    it('should render input handle with id=trim_video_input and green class', () => {
      render(<TrimVideoNode {...defaultProps} />);

      const inputHandle = screen.getByTestId('handle-target-trim_video_input');
      expect(inputHandle).toBeDefined();
      expect(inputHandle.getAttribute('data-position')).toBe('left');
      expect(inputHandle.className).toContain('green');
    });

    it('should render output handle with id=trim_video_output and green class', () => {
      render(<TrimVideoNode {...defaultProps} />);

      const outputHandle = screen.getByTestId('handle-source-trim_video_output');
      expect(outputHandle).toBeDefined();
      expect(outputHandle.getAttribute('data-position')).toBe('right');
      expect(outputHandle.className).toContain('green');
    });
  });

  describe('start input clamped for negative values', () => {
    it('should not enable execution when startSeconds is negative', () => {
      const negativeStartData: TrimVideoNodeData = {
        ...defaultData,
        startSeconds: -1,
        endSeconds: 5,
        inputVideoUrl: 'https://example.com/input.mp4',
      };

      render(<TrimVideoNode {...defaultProps} data={negativeStartData} />);

      // Button should be disabled because startSeconds < 0 is invalid
      const button = screen.getByRole('button', { name: /トリム/i });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('status display', () => {
    it('should show processing indicator when status is processing', () => {
      const processingData: TrimVideoNodeData = {
        ...defaultData,
        status: 'processing',
        inputVideoUrl: 'https://example.com/input.mp4',
      };

      render(<TrimVideoNode {...defaultProps} data={processingData} />);

      // Button should be disabled while processing
      const button = screen.getByRole('button', { name: /トリム/i });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('should show completed status with output url', () => {
      const completedData: TrimVideoNodeData = {
        ...defaultData,
        status: 'completed',
        outputVideoUrl: 'https://example.com/trimmed.mp4',
      };

      render(<TrimVideoNode {...defaultProps} data={completedData} />);

      expect(screen.getByText(/完了/)).toBeDefined();
    });
  });
});
