import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogueNode } from './DialogueNode';
import type { DialogueNodeData } from '@/lib/types/node-editor';

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

// Mock API client
vi.mock('@/lib/api/client', () => ({
  ttsApi: {
    listVoices: vi.fn(),
  },
  dialogueApi: {
    create: vi.fn(),
    getStatus: vi.fn(),
  },
}));

import { ttsApi } from '@/lib/api/client';

const mockTtsApi = vi.mocked(ttsApi);

describe('DialogueNode', () => {
  const defaultData: DialogueNodeData = {
    type: 'dialogue',
    isValid: false,
    text: '',
    voiceId: null,
    language: 'ja',
    speed: 1.0,
    status: 'idle',
    progress: 0,
    generationId: null,
    outputVideoUrl: null,
  };

  const defaultProps = {
    id: 'test-dialogue-node',
    data: defaultData,
    selected: false,
    type: 'dialogue' as const,
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
    mockTtsApi.listVoices.mockResolvedValue([]);
  });

  describe('renders in idle state', () => {
    it('should render textarea, voice dropdown, execute button, and notice', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      render(<DialogueNode {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeDefined();
      });

      expect(screen.getByRole('combobox')).toBeDefined();
      expect(screen.getByRole('button')).toBeDefined();
      expect(screen.getByText(/口の動きは合成しません/)).toBeDefined();
    });
  });

  describe('loads voice list on mount', () => {
    it('should call ttsApi.listVoices and show options in dropdown', async () => {
      mockTtsApi.listVoices.mockResolvedValue([
        { voice_id: 'v1', name: '声1', language: 'ja' },
        { voice_id: 'v2', name: '声2', language: 'ja' },
      ]);

      render(<DialogueNode {...defaultProps} />);

      await waitFor(() => {
        expect(mockTtsApi.listVoices).toHaveBeenCalledWith('ja');
      });

      await waitFor(() => {
        expect(screen.getByText('声1')).toBeDefined();
        expect(screen.getByText('声2')).toBeDefined();
      });
    });
  });

  describe('handles voice list error gracefully', () => {
    it('should log error and show empty dropdown when listVoices fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTtsApi.listVoices.mockRejectedValue(new Error('Network error'));

      render(<DialogueNode {...defaultProps} />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      // Dropdown should still render (empty)
      expect(screen.getByRole('combobox')).toBeDefined();
      consoleSpy.mockRestore();
    });
  });

  describe('shows loader when processing', () => {
    it('should show processing state with disabled button', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const processingData: DialogueNodeData = {
        ...defaultData,
        status: 'processing',
        text: 'テスト',
        voiceId: 'v1',
      };

      render(<DialogueNode {...defaultProps} data={processingData} />);

      await waitFor(() => {
        const button = screen.getByRole('button');
        expect(button).toBeDefined();
        // Button should be disabled while processing
        expect((button as HTMLButtonElement).disabled).toBe(true);
      });

      // Should show "処理中" text or loading indicator
      expect(screen.getByText(/処理中/)).toBeDefined();
    });
  });

  describe('shows check icon when completed', () => {
    it('should show completed state with outputVideoUrl', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const completedData: DialogueNodeData = {
        ...defaultData,
        status: 'completed',
        text: 'テスト',
        voiceId: 'v1',
        outputVideoUrl: 'https://example.com/output.mp4',
      };

      render(<DialogueNode {...defaultProps} data={completedData} />);

      await waitFor(() => {
        expect(screen.getByText(/合成完了/)).toBeDefined();
      });
    });
  });

  describe('shows error state when failed', () => {
    it('should show error message when status is failed', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const failedData: DialogueNodeData = {
        ...defaultData,
        status: 'failed',
        errorMessage: '処理に失敗しました',
      };

      render(<DialogueNode {...defaultProps} data={failedData} />);

      await waitFor(() => {
        // errorMessage appears in both the status area and the BaseNode footer
        const elements = screen.getAllByText('処理に失敗しました');
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('always shows lip sync notice', () => {
    it('should always display the lip sync notice text', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      render(<DialogueNode {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/口の動きは合成しません/)).toBeDefined();
      });
    });

    it('should show notice even in completed state', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const completedData: DialogueNodeData = {
        ...defaultData,
        status: 'completed',
        outputVideoUrl: 'https://example.com/output.mp4',
      };

      render(<DialogueNode {...defaultProps} data={completedData} />);

      await waitFor(() => {
        expect(screen.getByText(/口の動きは合成しません/)).toBeDefined();
      });
    });
  });

  describe('dispatches startDialogue event on execute', () => {
    it('should dispatch startDialogue CustomEvent when execute button is clicked', async () => {
      mockTtsApi.listVoices.mockResolvedValue([
        { voice_id: 'v1', name: '声1', language: 'ja' },
      ]);

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const readyData: DialogueNodeData = {
        ...defaultData,
        text: 'テストセリフ',
        voiceId: 'v1',
        status: 'idle',
      };

      render(<DialogueNode {...defaultProps} data={readyData} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeDefined();
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const dispatchedEvents = dispatchEventSpy.mock.calls.map(
        (call) => call[0] as CustomEvent
      );
      const startDialogueEvent = dispatchedEvents.find(
        (e) => e.type === 'startDialogue'
      );

      expect(startDialogueEvent).toBeDefined();
      expect(startDialogueEvent?.detail).toEqual({
        nodeId: 'test-dialogue-node',
      });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('execute button disabled guards', () => {
    it('should disable the button when text is empty', async () => {
      mockTtsApi.listVoices.mockResolvedValue([
        { voice_id: 'v1', name: '声1', language: 'ja' },
      ]);
      const noTextData: DialogueNodeData = {
        ...defaultData,
        text: '',
        voiceId: 'v1',
        status: 'idle',
      };

      render(<DialogueNode {...defaultProps} data={noTextData} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeDefined();
      });

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('should disable the button when voiceId is not selected', async () => {
      mockTtsApi.listVoices.mockResolvedValue([
        { voice_id: 'v1', name: '声1', language: 'ja' },
      ]);
      const noVoiceData: DialogueNodeData = {
        ...defaultData,
        text: 'テストセリフ',
        voiceId: null,
        status: 'idle',
      };

      render(<DialogueNode {...defaultProps} data={noVoiceData} />);

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeDefined();
      });

      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('handle rendering', () => {
    it('should render input handle (target) on the left', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      render(<DialogueNode {...defaultProps} />);

      await waitFor(() => {
        const inputHandle = screen.getByTestId('handle-target-dialogue_video_input');
        expect(inputHandle).toBeDefined();
        expect(inputHandle.getAttribute('data-position')).toBe('left');
      });
    });

    it('should render output handle (source) on the right', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      render(<DialogueNode {...defaultProps} />);

      await waitFor(() => {
        const outputHandle = screen.getByTestId('handle-source-dialogue_video_output');
        expect(outputHandle).toBeDefined();
        expect(outputHandle.getAttribute('data-position')).toBe('right');
      });
    });
  });
});
