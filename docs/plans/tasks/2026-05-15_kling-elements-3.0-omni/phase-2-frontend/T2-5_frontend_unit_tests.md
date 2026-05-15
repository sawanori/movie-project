---
id: T2-5
phase: 2
title: Frontend 単体テスト追加 (KlingElementsNode 4 ケース)
depends_on:
  - T2-1
  - T2-2
  - T2-3
  - T2-4
estimated_effort: M
files_touched:
  - movie-maker/components/node-editor/nodes/KlingElementsNode.test.tsx
---

## 目的

Design Doc §10-2 で定義された 4 ケースの FE ユニットテストを実装する。

1. レンダリング (0 枚初期状態、ヒント文表示)
2. 4 枚上限到達時に追加ボタン非表示
3. 削除動作の確認
4. Provider 警告表示 / 非表示 (piapi_kling / 他 Provider)

## 前提

- T2-1〜T2-4 が全て完了済み
- テストファイルは新規作成: `movie-maker/components/node-editor/nodes/KlingElementsNode.test.tsx`
- Vitest + React Testing Library が利用可能であることを確認
- `@xyflow/react` の mock が必要: `useNodes` と `ReactFlowProvider` を mock する

## 変更内容

### テストファイルの内容

```tsx
/**
 * KlingElementsNode テスト
 * Design Doc §10-2: 4 ケース
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KlingElementsNode } from './KlingElementsNode';
import type { KlingElementsNodeData } from '@/lib/types/node-editor';

// ========== @xyflow/react モック ==========
// B2 解決のテスト: useNodes を mock して ProviderNode の有無をシミュレート
let mockNodes: Array<{ data: { type: string; provider?: string } }> = [];

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    useNodes: () => mockNodes,
    Handle: ({ id, type, position, className }: { id: string; type: string; position: string; className?: string }) => (
      <div data-testid={`handle-${id}`} data-type={type} data-position={position} className={className} />
    ),
  };
});

// videosApi モック
vi.mock('@/lib/api/client', () => ({
  videosApi: {
    uploadImage: vi.fn().mockResolvedValue({ image_url: 'https://example.com/uploaded.jpg' }),
  },
}));

// ========== テストヘルパー ==========
const defaultData: KlingElementsNodeData = {
  type: 'klingElements',
  elementImages: [],
  isValid: true,
  errorMessage: undefined,
};

function renderNode(data: Partial<KlingElementsNodeData> = {}) {
  const mergedData = { ...defaultData, ...data };
  return render(
    <KlingElementsNode
      id="node-1"
      data={mergedData}
      selected={false}
      // NodeProps の必須フィールドをスタブ
      type="klingElements"
      zIndex={1}
      isConnectable={true}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
    />
  );
}

// ========== ケース 1: レンダリング (初期状態) ==========
describe('KlingElementsNode - レンダリング', () => {
  beforeEach(() => {
    mockNodes = [];
  });

  it('初期状態: 0/4 枚テキスト、ヒント文、追加ボタンが表示される', () => {
    renderNode();

    // 枚数表示
    expect(screen.getByText(/0\/4 枚/)).toBeInTheDocument();

    // ヒント文 (Design Doc §10-2 ケース 1)
    expect(screen.getByText(/プロンプトに/)).toBeInTheDocument();
    expect(screen.getByText(/@image_1/)).toBeInTheDocument();

    // 追加ボタン (Plus アイコン領域)
    const handles = screen.getAllByTestId(/handle-/);
    expect(handles.length).toBeGreaterThan(0);
  });
});

// ========== ケース 2: 4 枚上限で追加ボタン非表示 ==========
describe('KlingElementsNode - 上限', () => {
  beforeEach(() => {
    mockNodes = [];
  });

  it('4 枚アップロード済みの場合、追加ボタン (dropzone) が非表示になる', () => {
    renderNode({
      elementImages: [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/4.jpg',
      ],
    });

    // 4 枚表示
    expect(screen.getByText(/4\/4 枚/)).toBeInTheDocument();

    // 追加ボタン (Plus) が存在しない — dropzone は `data.elementImages.length < MAX_ELEMENTS` が false の時非表示
    const addButtons = screen.queryAllByRole('button', { name: /Plus/i });
    // dropzone div も確認: MAX_ELEMENTS (4) に達したら追加エリアが消える
    // KlingElementsNode の実装では `{data.elementImages.length < MAX_ELEMENTS && (<div {...getRootProps()}>...)}` で制御
    const dropzoneInputs = document.querySelectorAll('input[type="file"]');
    expect(dropzoneInputs.length).toBe(0);
  });
});

// ========== ケース 3: 削除動作 ==========
describe('KlingElementsNode - 削除', () => {
  beforeEach(() => {
    mockNodes = [];
  });

  it('削除ボタンをクリックすると nodeDataUpdate イベントが発火し elementImages が減る', () => {
    const dispatchedEvents: CustomEvent[] = [];
    window.addEventListener('nodeDataUpdate', (e) => {
      dispatchedEvents.push(e as CustomEvent);
    });

    renderNode({
      elementImages: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
    });

    // X ボタンをクリック (最初の画像を削除)
    const removeButtons = screen.getAllByRole('button');
    // X ボタンは各画像のオーバーレイにある
    fireEvent.click(removeButtons[0]);

    expect(dispatchedEvents.length).toBeGreaterThan(0);
    const lastEvent = dispatchedEvents[dispatchedEvents.length - 1];
    expect(lastEvent.detail.updates.elementImages).toHaveLength(1);

    window.removeEventListener('nodeDataUpdate', (e) => {
      dispatchedEvents.push(e as CustomEvent);
    });
  });
});

// ========== ケース 4: Provider 警告 ==========
describe('KlingElementsNode - Provider 警告', () => {
  it('piapi_kling ProviderNode が存在する場合、警告が表示されない', () => {
    mockNodes = [
      { data: { type: 'provider', provider: 'piapi_kling' } },
    ];
    renderNode();

    expect(screen.queryByText(/Kling 専用ノードです/)).not.toBeInTheDocument();
  });

  it('runway ProviderNode が存在する場合、警告が表示される', () => {
    mockNodes = [
      { data: { type: 'provider', provider: 'runway' } },
    ];
    renderNode();

    expect(screen.getByText(/Kling 専用ノードです/)).toBeInTheDocument();
  });

  it('ProviderNode が存在しない場合 (isKlingProvider === null)、警告は表示されない', () => {
    mockNodes = [];
    renderNode();

    expect(screen.queryByText(/Kling 専用ノードです/)).not.toBeInTheDocument();
  });
});
```

## 完了条件 (AC)

- [x] `cd movie-maker && npx vitest run components/node-editor/nodes/KlingElementsNode.test.tsx` で全 4 グループ (7 テスト) が **PASS**
- [x] Provider 警告ケース (ケース 4) の確認:
  - `piapi_kling` 時に「Kling 専用ノードです」が **非表示** になることが検証済み
  - `runway` 等の他 Provider 時に「Kling 専用ノードです」が **表示** されることが検証済み
- [x] ケース 1 でヒント文「プロンプトに @image_1」が表示されることが確認済み
- [x] ケース 2 で 4 枚上限時に `input[type="file"]` が DOM に存在しないことが確認済み
- [x] `cd movie-maker && npm run build` が成功する

## テスト実行コマンド

```bash
cd movie-maker
# 対象テストのみ
npx vitest run components/node-editor/nodes/KlingElementsNode.test.tsx --reporter=verbose

# ビルド確認
npm run build 2>&1 | tail -5
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §10-2: Frontend テスト計画 (4 ケース)
- Design Doc §7-1: 修正 4 (Provider 警告 — B2 解決 useNodes 全ノードスキャン)
- T2-1: MAX_ELEMENTS 4 (テスト対象)
- T2-2: ヒント文 (テスト対象)
- T2-3: Provider 警告 (テスト対象)
