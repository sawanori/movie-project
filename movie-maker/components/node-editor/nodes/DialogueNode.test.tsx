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
    useLipSync: false,
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

  // ====================================================================
  // useLipSync (Hedra リップシンク) 関連テスト
  // T2-5: 4 ケースで useLipSync の表示・操作・状態を検証する
  // ====================================================================

  describe('useLipSync=false (initial / TTS-only)', () => {
    it('shows TTS notice, hides Hedra notice, button label is "合成する"', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const data: DialogueNodeData = { ...defaultData, useLipSync: false };

      render(<DialogueNode {...defaultProps} data={data} />);

      // TTS の注意書きが表示される
      await waitFor(() => {
        expect(
          screen.getByText('※ 口の動きは合成しません (TTS のみ)')
        ).toBeDefined();
      });

      // Hedra の注意書きは表示されない
      expect(screen.queryByText(/キャラの顔がはっきり映る動画/)).toBeNull();

      // ボタンラベルは「合成する」(リップシンク合成する ではない)
      const button = screen.getByRole('button');
      expect(button.textContent).toContain('合成する');
      expect(button.textContent).not.toContain('リップシンク合成する');
    });
  });

  describe('useLipSync checkbox toggle', () => {
    it('dispatches nodeDataUpdate with { useLipSync: true } when checked', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      render(
        <DialogueNode
          {...defaultProps}
          data={{ ...defaultData, useLipSync: false }}
        />
      );

      // チェックボックスを探す (id="use-lip-sync-<nodeId>")
      const checkbox = await waitFor(() =>
        screen.getByRole('checkbox', { name: /口を動かす/ })
      );
      expect((checkbox as HTMLInputElement).checked).toBe(false);

      // クリックして ON にする
      fireEvent.click(checkbox);

      // nodeDataUpdate イベントが { useLipSync: true } を含めて dispatch される
      const dispatched = dispatchEventSpy.mock.calls.map(
        (call) => call[0] as CustomEvent
      );
      const updateEvent = dispatched.find(
        (e) =>
          e.type === 'nodeDataUpdate' &&
          (e.detail as { updates?: { useLipSync?: boolean } })?.updates
            ?.useLipSync === true
      );
      expect(updateEvent).toBeDefined();
      expect(
        (updateEvent?.detail as { updates: { useLipSync: boolean } }).updates
      ).toEqual({ useLipSync: true });

      dispatchEventSpy.mockRestore();
    });
  });

  describe('useLipSync=true (Hedra path)', () => {
    it('hides TTS notice, shows Hedra notice, button label is "リップシンク合成する"', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const data: DialogueNodeData = { ...defaultData, useLipSync: true };

      render(<DialogueNode {...defaultProps} data={data} />);

      // TTS の注意書きは非表示
      await waitFor(() => {
        expect(
          screen.queryByText('※ 口の動きは合成しません (TTS のみ)')
        ).toBeNull();
      });

      // Hedra の注意書きが表示される
      expect(
        screen.getByText(/キャラの顔がはっきり映る動画を入力してください/)
      ).toBeDefined();

      // ボタンラベルは「リップシンク合成する」
      const button = screen.getByRole('button');
      expect(button.textContent).toContain('リップシンク合成する');
    });
  });

  describe('useLipSync=true & processing state', () => {
    it('shows "(1-3 分かかります)" hint when processing with useLipSync=true', async () => {
      mockTtsApi.listVoices.mockResolvedValue([]);
      const processingData: DialogueNodeData = {
        ...defaultData,
        useLipSync: true,
        text: 'テスト',
        voiceId: 'v1',
        status: 'processing',
        progress: 30,
      };

      render(<DialogueNode {...defaultProps} data={processingData} />);

      // "処理中" 表示が出る
      await waitFor(() => {
        expect(screen.getByText(/処理中/)).toBeDefined();
      });

      // useLipSync=true 時、processing 状態で処理時間目安が併記される
      // (checkbox の説明文と processing 表示の両方に "1-3 分かかります" が現れるため、
      //  両方の出現を確認する)
      const hints = screen.getAllByText(/1-3 分かかります/);
      expect(hints.length).toBeGreaterThanOrEqual(2);

      // processing 状態の指標文 ("(1-3 分かかります)") は括弧で囲まれている
      expect(screen.getByText(/\(1-3 分かかります\)/)).toBeDefined();
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
