/**
 * ProviderNode テスト
 * Design Doc §7-1: Handle 数確認 / プロバイダー非互換 Handle の grayout
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ProviderNode } from './ProviderNode';
import type { ProviderNodeData } from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

// ========== @xyflow/react モック ==========
vi.mock('@xyflow/react', () => ({
  Handle: ({
    id,
    type,
    position,
    className,
    style,
    title,
  }: {
    id: string;
    type: string;
    position: string;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
  }) => (
    <div
      data-handleid={id}
      data-type={type}
      data-position={position}
      className={className}
      style={style}
      title={title}
    />
  ),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
  NodeProps: {},
}));

// ========== テストヘルパー ==========

const baseData: ProviderNodeData = {
  type: 'provider',
  isValid: true,
  provider: 'piapi_kling',
  aspectRatio: '9:16',
  duration: null,
};

const defaultProps = {
  id: 'test-node',
  selected: false,
  type: 'provider' as const,
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

// ========== テスト ==========

describe('ProviderNode', () => {
  it('6 個の target Handle が全てレンダリングされる', () => {
    const { container } = render(
      <ProviderNode {...defaultProps} data={baseData} />
    );

    const expectedIds = [
      HANDLE_IDS.KLING_MODE_INPUT,
      HANDLE_IDS.KLING_ELEMENTS_INPUT,
      HANDLE_IDS.KLING_END_FRAME_INPUT,
      HANDLE_IDS.KLING_CAMERA_CONTROL_INPUT,
      HANDLE_IDS.ACT_TWO_INPUT,
      HANDLE_IDS.HAILUO_END_FRAME_INPUT,
    ];

    for (const id of expectedIds) {
      const handle = container.querySelector(`[data-handleid="${id}"]`);
      expect(handle, `Handle with id "${id}" should be in the document`).not.toBeNull();
    }
  });

  it('provider=runway の場合、KLING_* Handle が opacity-30 クラスを持つ', () => {
    const runwayData: ProviderNodeData = { ...baseData, provider: 'runway' };
    const { container } = render(
      <ProviderNode {...defaultProps} data={runwayData} />
    );

    // KLING_MODE_INPUT は piapi_kling 専用なので runway では opacity-30
    const klingModeHandle = container.querySelector(
      `[data-handleid="${HANDLE_IDS.KLING_MODE_INPUT}"]`
    );
    expect(klingModeHandle).not.toBeNull();
    expect(klingModeHandle?.className).toContain('opacity-30');

    // KLING_ELEMENTS_INPUT も piapi_kling 専用
    const klingElemHandle = container.querySelector(
      `[data-handleid="${HANDLE_IDS.KLING_ELEMENTS_INPUT}"]`
    );
    expect(klingElemHandle).not.toBeNull();
    expect(klingElemHandle?.className).toContain('opacity-30');
  });

  it('provider=runway の場合、ACT_TWO_INPUT Handle は opacity-30 クラスを持たない', () => {
    const runwayData: ProviderNodeData = { ...baseData, provider: 'runway' };
    const { container } = render(
      <ProviderNode {...defaultProps} data={runwayData} />
    );

    const actTwoHandle = container.querySelector(
      `[data-handleid="${HANDLE_IDS.ACT_TWO_INPUT}"]`
    );
    expect(actTwoHandle).not.toBeNull();
    expect(actTwoHandle?.className).not.toContain('opacity-30');
  });

  it('provider=piapi_kling の場合、KLING_* Handle は opacity-30 クラスを持たない', () => {
    const { container } = render(
      <ProviderNode {...defaultProps} data={baseData} />
    );

    const klingModeHandle = container.querySelector(
      `[data-handleid="${HANDLE_IDS.KLING_MODE_INPUT}"]`
    );
    expect(klingModeHandle).not.toBeNull();
    expect(klingModeHandle?.className).not.toContain('opacity-30');
  });

  it('ノードに minHeight: 240px の style が設定されている', () => {
    const { container } = render(
      <ProviderNode {...defaultProps} data={baseData} />
    );

    // BaseNode が style={{ minHeight: '240px' }} でレンダリングする
    // BaseNode のルート要素を確認する
    const nodeRoot = container.firstChild as HTMLElement;
    expect(nodeRoot).not.toBeNull();
    // style 属性に min-height: 240px が含まれることを確認
    expect(nodeRoot?.getAttribute('style')).toContain('240px');
  });
});
