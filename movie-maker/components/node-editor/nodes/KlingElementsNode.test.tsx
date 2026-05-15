/**
 * KlingElementsNode テスト
 * Design Doc §10-2: 4 ケース (レンダリング / 上限 / 削除 / Provider 警告)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KlingElementsNode } from './KlingElementsNode';
import type { KlingElementsNodeData } from '@/lib/types/node-editor';

// ========== @xyflow/react モック ==========
// B2 解決のテスト: useNodes を mock して ProviderNode の有無をシミュレート
let mockNodes: Array<{ data: { type: string; provider?: string } }> = [];

vi.mock('@xyflow/react', () => ({
  useNodes: () => mockNodes,
  Handle: ({
    id,
    type,
    position,
    className,
  }: {
    id: string;
    type: string;
    position: string;
    className?: string;
  }) => (
    <div
      data-testid={`handle-${id}`}
      data-type={type}
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

// videosApi モック
vi.mock('@/lib/api/client', () => ({
  videosApi: {
    uploadImage: vi
      .fn()
      .mockResolvedValue({ image_url: 'https://example.com/uploaded.jpg' }),
  },
}));

// ========== テストヘルパー ==========
const defaultData: KlingElementsNodeData = {
  type: 'klingElements',
  elementImages: [],
  isValid: true,
  errorMessage: undefined,
};

const defaultProps = {
  id: 'node-1',
  selected: false,
  type: 'klingElements' as const,
  zIndex: 1,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  draggable: true,
  deletable: true,
  selectable: true,
  parentId: undefined,
};

function renderNode(data: Partial<KlingElementsNodeData> = {}) {
  const mergedData = { ...defaultData, ...data };
  return render(<KlingElementsNode {...defaultProps} data={mergedData} />);
}

describe('KlingElementsNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNodes = [];
  });

  // ========== ケース 1: レンダリング (初期状態) ==========
  describe('レンダリング', () => {
    it('初期状態: 0/4 枚テキスト、ヒント文 (@image_1)、Handle が表示される', () => {
      renderNode();

      // 枚数表示
      expect(screen.getByText(/0\/4 枚/)).toBeDefined();

      // ヒント文 (T2-2)
      expect(screen.getByText(/プロンプトに/)).toBeDefined();
      expect(screen.getByText(/@image_1/)).toBeDefined();

      // 出力 Handle が存在
      expect(screen.getByTestId('handle-kling_elements')).toBeDefined();
    });
  });

  // ========== ケース 2: 4 枚上限で追加ボタン非表示 ==========
  describe('上限', () => {
    it('4 枚アップロード済の場合、追加 dropzone が非表示になる', () => {
      const { container } = renderNode({
        elementImages: [
          'https://example.com/1.jpg',
          'https://example.com/2.jpg',
          'https://example.com/3.jpg',
          'https://example.com/4.jpg',
        ],
      });

      // 4 枚表示
      expect(screen.getByText(/4\/4 枚/)).toBeDefined();

      // dropzone の input[type="file"] が DOM 上に存在しない
      // 実装側: `{data.elementImages.length < MAX_ELEMENTS && (<div {...getRootProps()}>...)}`
      const fileInputs = container.querySelectorAll('input[type="file"]');
      expect(fileInputs.length).toBe(0);
    });
  });

  // ========== ケース 3: 削除動作 ==========
  describe('削除', () => {
    it('削除ボタンをクリックすると nodeDataUpdate イベントが発火し elementImages が減る', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      renderNode({
        elementImages: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      });

      // X (削除) ボタンをクリック (最初の画像を削除)
      // 削除ボタンは button 要素として複数描画される
      const removeButtons = screen.getAllByRole('button');
      fireEvent.click(removeButtons[0]);

      const calls = dispatchSpy.mock.calls.map((call) => call[0] as CustomEvent);
      const nodeDataUpdateEvent = calls.find((e) => e.type === 'nodeDataUpdate');

      expect(nodeDataUpdateEvent).toBeDefined();
      expect(nodeDataUpdateEvent!.detail.updates.elementImages).toHaveLength(1);
    });
  });

  // ========== ケース 4: Provider 警告 ==========
  describe('Provider 警告', () => {
    it('piapi_kling ProviderNode が存在する場合、警告が表示されない', () => {
      mockNodes = [{ data: { type: 'provider', provider: 'piapi_kling' } }];
      renderNode();

      expect(screen.queryByText(/Kling 専用ノードです/)).toBeNull();
    });

    it('runway ProviderNode が存在する場合、警告が表示される', () => {
      mockNodes = [{ data: { type: 'provider', provider: 'runway' } }];
      renderNode();

      expect(screen.getByText(/Kling 専用ノードです/)).toBeDefined();
    });

    it('ProviderNode が存在しない場合 (isKlingProvider === null)、警告は表示されない', () => {
      mockNodes = [];
      renderNode();

      expect(screen.queryByText(/Kling 専用ノードです/)).toBeNull();
    });
  });
});
