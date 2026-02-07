import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LUTNode } from './LUTNode';
import type { LUTNodeData } from '@/lib/types/node-editor';

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

describe('LUTNode', () => {
  const defaultData: LUTNodeData = {
    type: 'lut',
    useLut: true,
    isValid: true,
  };

  const defaultProps = {
    id: 'test-node-id',
    data: defaultData,
    selected: false,
    type: 'lut' as const,
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
    it('should render with title and icon', () => {
      render(<LUTNode {...defaultProps} />);

      expect(screen.getByText('カラーグレーディング')).toBeDefined();
    });

    it('should render toggle button', () => {
      render(<LUTNode {...defaultProps} />);

      expect(screen.getByText('LUTを適用')).toBeDefined();
      expect(screen.getByText('映画的な色調補正')).toBeDefined();
    });

    it('should render output handle with correct id', () => {
      render(<LUTNode {...defaultProps} />);

      const handle = screen.getByTestId('handle-source-lut');
      expect(handle).toBeDefined();
      expect(handle.getAttribute('data-position')).toBe('right');
    });

    it('should show enabled message when useLut is true', () => {
      render(<LUTNode {...defaultProps} data={{ ...defaultData, useLut: true }} />);

      expect(screen.getByText('LUTが適用されます')).toBeDefined();
    });

    it('should show disabled message when useLut is false', () => {
      render(<LUTNode {...defaultProps} data={{ ...defaultData, useLut: false }} />);

      expect(screen.getByText('オリジナルの色調を維持します')).toBeDefined();
    });
  });

  describe('Toggle Functionality', () => {
    it('should dispatch nodeDataUpdate event when toggle is clicked', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      render(<LUTNode {...defaultProps} data={{ ...defaultData, useLut: true }} />);

      const toggleButton = screen.getByRole('button');
      fireEvent.click(toggleButton);

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('nodeDataUpdate');
      expect(event.detail).toEqual({
        nodeId: 'test-node-id',
        updates: { useLut: false },
      });

      dispatchEventSpy.mockRestore();
    });

    it('should toggle from false to true', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      render(<LUTNode {...defaultProps} data={{ ...defaultData, useLut: false }} />);

      const toggleButton = screen.getByRole('button');
      fireEvent.click(toggleButton);

      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.detail.updates).toEqual({ useLut: true });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('Validation State', () => {
    it('should pass isValid to BaseNode', () => {
      const { container } = render(
        <LUTNode {...defaultProps} data={{ ...defaultData, isValid: true }} />
      );

      // When valid, should not have red border class
      const node = container.firstChild as HTMLElement;
      expect(node.className).not.toContain('border-red-500');
    });

    it('should show error message when provided', () => {
      render(
        <LUTNode
          {...defaultProps}
          data={{ ...defaultData, isValid: false, errorMessage: 'Test error message' }}
        />
      );

      expect(screen.getByText('Test error message')).toBeDefined();
    });
  });

  describe('Selection State', () => {
    it('should apply selected styles when selected', () => {
      const { container } = render(<LUTNode {...defaultProps} selected={true} />);

      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('border-[#fce300]');
    });

    it('should not apply selected styles when not selected', () => {
      const { container } = render(<LUTNode {...defaultProps} selected={false} />);

      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('border-[#404040]');
    });
  });
});
