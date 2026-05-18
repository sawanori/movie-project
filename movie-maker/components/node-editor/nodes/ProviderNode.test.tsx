/**
 * ProviderNode テスト
 * Design Doc §7-1: Handle 数確認 / プロバイダー非互換 Handle の grayout
 * Design Doc 2026-05-18: DURATION_CONFIG UI 切替 + provider 切替時 duration リセット
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// ========== DURATION_CONFIG UI 切替テスト ==========

describe('ProviderNode - DURATION_CONFIG UI', () => {
  // AC-1: Seedance 選択時 number input 表示 (min=4, max=15, step=1)
  it('AC-1: Seedance 選択時に number input (min=4, max=15, step=1) が表示される', () => {
    const seedanceData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'seedance',
      aspectRatio: '9:16',
      duration: 5,
    };
    render(<ProviderNode {...defaultProps} data={seedanceData} />);

    const input = screen.getByRole('spinbutton');
    expect(input).not.toBeNull();
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('min')).toBe('4');
    expect(input.getAttribute('max')).toBe('15');
    expect(input.getAttribute('step')).toBe('1');
  });

  // AC-1: Seedance の range ヒントテキスト表示
  it('AC-1: Seedance 選択時に "4-15 秒" ヒントが表示される', () => {
    const seedanceData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'seedance',
      aspectRatio: '9:16',
      duration: 5,
    };
    render(<ProviderNode {...defaultProps} data={seedanceData} />);

    expect(screen.getByText('4-15 秒')).not.toBeNull();
  });

  // AC-2: Veo 選択時 dropdown 表示 (4/6/8)
  it('AC-2: Veo 選択時に select dropdown が表示され 4/6/8 の option がある', () => {
    const veoData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'veo',
      aspectRatio: '9:16',
      duration: 8,
    };
    const { container } = render(<ProviderNode {...defaultProps} data={veoData} />);

    // アスペクト比 select の次に動画時間 select がある (combobox が 2 個: アスペクト比 + 動画時間)
    const selects = container.querySelectorAll('select');
    // アスペクト比が1番目、動画時間が2番目
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const durationSelect = selects[1];

    const options = durationSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => Number(o.getAttribute('value')));
    expect(optionValues).toContain(4);
    expect(optionValues).toContain(6);
    expect(optionValues).toContain(8);
  });

  // AC-3: Kling 選択時 dropdown (5/10)
  it('AC-3: Kling 選択時に select dropdown が表示され 5/10 の option がある (現状維持)', () => {
    const klingData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'piapi_kling',
      aspectRatio: '9:16',
      duration: 5,
    };
    const { container } = render(<ProviderNode {...defaultProps} data={klingData} />);

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const durationSelect = selects[1];

    const options = durationSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => Number(o.getAttribute('value')));
    expect(optionValues).toContain(5);
    expect(optionValues).toContain(10);
    expect(optionValues).not.toContain(15);
  });

  // AC-4: Runway 選択時 固定表示 「5 秒 (固定)」
  it('AC-4: Runway 選択時に "5 秒 (固定)" テキストが表示される (input/select なし)', () => {
    const runwayData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'runway',
      aspectRatio: '9:16',
      duration: null,
    };
    render(<ProviderNode {...defaultProps} data={runwayData} />);

    expect(screen.getByText('5 秒 (固定)')).not.toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '動画時間' })).toBeNull();
  });

  // Veo の default value が 8
  it('Veo 選択時 dropdown の初期値が 8 である', () => {
    const veoData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'veo',
      aspectRatio: '9:16',
      duration: null,  // null の場合 config.default (8) が使われる
    };
    const { container } = render(<ProviderNode {...defaultProps} data={veoData} />);

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const durationSelect = selects[1] as HTMLSelectElement;
    expect(durationSelect.value).toBe('8');
  });

  // AC-7: Provider 切替時 duration が default にリセットされる
  it('AC-7: Provider 切替時に duration が新プロバイダーの default にリセットされる', () => {
    const klingData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'piapi_kling',
      aspectRatio: '9:16',
      duration: 10,
    };

    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={klingData} />);

    // Seedance ボタンをクリックしてプロバイダー切替
    fireEvent.click(screen.getByText('Seedance 2.0'));

    // nodeDataUpdate イベントが発火されて duration=5 (Seedance default) がセットされる
    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const providerUpdateCall = calls.find(
      (d) => d.updates?.provider === 'seedance'
    );
    expect(providerUpdateCall).toBeDefined();
    expect(providerUpdateCall?.updates?.duration).toBe(5);

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });

  // I004: persisted duration=3 (Seedance min=4 未満) → useEffect で 4 に正規化
  it('I004: 保存済 duration=3 でロード時に Seedance の min=4 に正規化される', () => {
    const seedanceData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'seedance',
      aspectRatio: '9:16',
      duration: 3,  // min=4 未満の persisted 値
    };

    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={seedanceData} />);

    // useEffect が duration=4 に正規化する nodeDataUpdate を発火する
    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const normalizeCall = calls.find((d) => d.updates?.duration === 4);
    expect(normalizeCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });

  // I007: transient 入力 '1' → '11' は state=11 になる
  it('I007: number input で "11" を入力すると duration=11 の nodeDataUpdate が発火される', () => {
    const seedanceData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'seedance',
      aspectRatio: '9:16',
      duration: 5,
    };

    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={seedanceData} />);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '11' } });

    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const durationCall = calls.find((d) => d.updates?.duration === 11);
    expect(durationCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });
});

// ========== Seedance 速度モード UI テスト ==========

describe('ProviderNode - Seedance 速度モード', () => {
  const seedanceData: ProviderNodeData = {
    type: 'provider',
    isValid: true,
    provider: 'seedance',
    aspectRatio: '9:16',
    duration: 5,
    seedanceMode: 'pro',
  };

  // AC-1: Seedance 選択 → 速度モード dropdown 表示
  it('AC-1: Seedance 選択時に速度モード dropdown が表示される', () => {
    render(<ProviderNode {...defaultProps} data={seedanceData} />);
    expect(screen.getByText('速度モード')).not.toBeNull();
    expect(screen.getByText('Pro (高品質、$0.13/秒)')).not.toBeNull();
    expect(screen.getByText('Fast (高速、$0.10/秒)')).not.toBeNull();
  });

  // AC-2: 他 provider 選択 → 速度モード dropdown 非表示
  it('AC-2: Runway 選択時に速度モード dropdown が表示されない', () => {
    const runwayData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'runway',
      aspectRatio: '9:16',
      duration: null,
    };
    render(<ProviderNode {...defaultProps} data={runwayData} />);
    expect(screen.queryByText('速度モード')).toBeNull();
  });

  it('AC-2: Kling 選択時に速度モード dropdown が表示されない', () => {
    const klingData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'piapi_kling',
      aspectRatio: '9:16',
      duration: 5,
    };
    render(<ProviderNode {...defaultProps} data={klingData} />);
    expect(screen.queryByText('速度モード')).toBeNull();
  });

  // AC-3: dropdown 切替で seedanceMode 更新イベント発火
  it('AC-3: dropdown 切替で seedanceMode=fast の nodeDataUpdate が発火される', () => {
    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={seedanceData} />);

    // 速度モード select は 3 番目 (アスペクト比、動画時間、速度モード)
    const { container } = render(<ProviderNode {...defaultProps} data={seedanceData} />);
    const selects = container.querySelectorAll('select');
    // 速度モードは最後の select
    const modeSelect = selects[selects.length - 1] as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: 'fast' } });

    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const modeCall = calls.find((d) => d.updates?.seedanceMode === 'fast');
    expect(modeCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });

  // seedanceMode が未定義でも pro が fallback 表示される
  it('seedanceMode が未定義の場合、選択値が pro になる', () => {
    const dataWithoutMode: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'seedance',
      aspectRatio: '9:16',
      duration: 5,
    };
    const { container } = render(<ProviderNode {...defaultProps} data={dataWithoutMode} />);
    const selects = container.querySelectorAll('select');
    const modeSelect = selects[selects.length - 1] as HTMLSelectElement;
    expect(modeSelect.value).toBe('pro');
  });
});

// ========== Seedance 詳細設定セクション テスト (Design Doc §13.1) ==========

describe('ProviderNode - Seedance 詳細設定', () => {
  const seedanceData: ProviderNodeData = {
    type: 'provider',
    isValid: true,
    provider: 'seedance',
    aspectRatio: '9:16',
    duration: 5,
    seedanceMode: 'pro',
    seedanceGenerateAudio: false,
    seedanceSeed: null,
    seedanceResolution: '720p',
    seedanceCameraFixed: false,
  };

  // F-1: Seedance 選択時に「Seedance 詳細設定」ボタンが表示される
  it('F-1: Seedance 選択時に「Seedance 詳細設定」折りたたみボタンが表示される', () => {
    render(<ProviderNode {...defaultProps} data={seedanceData} />);
    expect(screen.getByText('Seedance 詳細設定')).not.toBeNull();
  });

  // F-2: provider != seedance 時、詳細設定セクション非表示
  it('F-2: Runway 選択時に「Seedance 詳細設定」ボタンが表示されない', () => {
    const runwayData: ProviderNodeData = {
      type: 'provider',
      isValid: true,
      provider: 'runway',
      aspectRatio: '9:16',
      duration: null,
    };
    render(<ProviderNode {...defaultProps} data={runwayData} />);
    expect(screen.queryByText('Seedance 詳細設定')).toBeNull();
  });

  // F-3: 詳細設定 click で 4 つの input/checkbox が展開される
  it('F-3: 「Seedance 詳細設定」クリックで BGM・シード・解像度・カメラ固定が展開される', () => {
    render(<ProviderNode {...defaultProps} data={seedanceData} />);

    // クリック前: 詳細 input は非表示
    expect(screen.queryByText('BGM 自動生成 (Seedance による音声生成)')).toBeNull();

    // クリック後: 詳細が展開される
    fireEvent.click(screen.getByText('Seedance 詳細設定'));
    expect(screen.getByText('BGM 自動生成 (Seedance による音声生成)')).not.toBeNull();
    expect(screen.getByText('シード値 (任意、再現性)')).not.toBeNull();
    expect(screen.getByText('解像度')).not.toBeNull();
    expect(screen.getByText('カメラ固定 (商品撮影/静物向け)')).not.toBeNull();
  });

  // F-4: BGM チェックボックス変更 → seedanceGenerateAudio 更新
  it('F-4: BGM チェックボックス ON → seedanceGenerateAudio=true の nodeDataUpdate が発火される', () => {
    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={seedanceData} />);
    fireEvent.click(screen.getByText('Seedance 詳細設定'));

    const checkbox = screen.getByLabelText('BGM 自動生成 (Seedance による音声生成)');
    fireEvent.click(checkbox);

    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const audioCall = calls.find((d) => d.updates?.seedanceGenerateAudio === true);
    expect(audioCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });

  // F-5: seed input に数値入力 → seedanceSeed 更新
  it('F-5: seed input に "12345" を入力すると seedanceSeed=12345 の nodeDataUpdate が発火される', () => {
    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={seedanceData} />);
    fireEvent.click(screen.getByText('Seedance 詳細設定'));

    const seedInput = screen.getByPlaceholderText('未指定=ランダム');
    fireEvent.change(seedInput, { target: { value: '12345' } });

    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const seedCall = calls.find((d) => d.updates?.seedanceSeed === 12345);
    expect(seedCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });

  // F-6: seed input 空文字 → seedanceSeed=null (Number(0) ではなく null)
  it('F-6: seed input を空にすると seedanceSeed=null の nodeDataUpdate が発火される (0 でなく null)', () => {
    const dataWithSeed: ProviderNodeData = { ...seedanceData, seedanceSeed: 42 };
    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={dataWithSeed} />);
    fireEvent.click(screen.getByText('Seedance 詳細設定'));

    const seedInput = screen.getByPlaceholderText('未指定=ランダム');
    fireEvent.change(seedInput, { target: { value: '' } });

    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const nullCall = calls.find(
      (d) => 'seedanceSeed' in (d.updates ?? {}) && d.updates.seedanceSeed === null
    );
    expect(nullCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });

  // F-7: resolution dropdown を 1080p → VIP 警告バナー表示
  it('F-7: resolution=1080p の ProviderNodeData を渡すと VIP 警告バナーが表示される', () => {
    const data1080p: ProviderNodeData = { ...seedanceData, seedanceResolution: '1080p' };
    render(<ProviderNode {...defaultProps} data={data1080p} />);
    fireEvent.click(screen.getByText('Seedance 詳細設定'));

    expect(screen.getByText(/VIP プラン契約が必要/)).not.toBeNull();
  });

  // F-7b: resolution=720p では警告バナー非表示
  it('F-7b: resolution=720p の場合 VIP 警告バナーが表示されない', () => {
    render(<ProviderNode {...defaultProps} data={seedanceData} />);
    fireEvent.click(screen.getByText('Seedance 詳細設定'));

    expect(screen.queryByText(/VIP プラン契約が必要/)).toBeNull();
  });

  // F-8: カメラ固定チェックボックス ON → seedanceCameraFixed=true
  it('F-8: カメラ固定チェックボックス ON → seedanceCameraFixed=true の nodeDataUpdate が発火される', () => {
    const eventSpy = vi.fn();
    window.addEventListener('nodeDataUpdate', eventSpy);

    render(<ProviderNode {...defaultProps} data={seedanceData} />);
    fireEvent.click(screen.getByText('Seedance 詳細設定'));

    const checkbox = screen.getByLabelText('カメラ固定 (商品撮影/静物向け)');
    fireEvent.click(checkbox);

    const calls = eventSpy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
    const cameraCall = calls.find((d) => d.updates?.seedanceCameraFixed === true);
    expect(cameraCall).toBeDefined();

    window.removeEventListener('nodeDataUpdate', eventSpy);
  });
});
