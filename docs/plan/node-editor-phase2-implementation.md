# ノードエディタ Phase 2 実装計画書

## 概要

Phase 2では、各動画生成プロバイダー固有のノードを実装し、プロバイダーに応じた条件付き表示機能を完成させる。

---

## 目標

- Kling専用ノード（3種）の実装
- Runway Act-Two専用ノードの実装
- Hailuo専用ノードの実装
- 条件付きノード表示の完全実装
- graph-to-api変換の拡張

---

## 実装するノード

### 1. Kling専用ノード（3種）

| ノード | パラメータ | バリデーション | 表示条件 |
|--------|-----------|--------------|----------|
| **KlingModeNode** | `mode: 'std' \| 'pro'` | - | `provider === 'piapi_kling'` |
| **KlingElementsNode** | `elementImages: string[]` | 最大3枚 | `provider === 'piapi_kling'` |
| **KlingEndFrameNode** | `endFrameImageUrl: string \| null` | - | `provider === 'piapi_kling'` |

### 2. Runway Act-Two ノード

| ノード | パラメータ | バリデーション | 表示条件 |
|--------|-----------|--------------|----------|
| **ActTwoNode** | `useActTwo: boolean` | - | `provider === 'runway'` |
| | `motionType: string \| null` | Supabase motionsテーブルから取得 | `&& (subjectType === 'person' \| 'animation')` |
| | `expressionIntensity: 1-5` | 範囲チェック | |
| | `bodyControl: boolean` | - | |

### 3. Hailuo専用ノード

| ノード | パラメータ | バリデーション | 表示条件 |
|--------|-----------|--------------|----------|
| **HailuoEndFrameNode** | `lastFrameImageUrl: string \| null` | - | `provider === 'hailuo'` |

---

## ファイル構成

```
movie-maker/components/node-editor/
├── nodes/
│   ├── index.ts                    # 更新: 新ノードをエクスポート
│   ├── KlingModeNode.tsx           # 新規
│   ├── KlingElementsNode.tsx       # 新規
│   ├── KlingEndFrameNode.tsx       # 新規
│   ├── ActTwoNode.tsx              # 新規
│   └── HailuoEndFrameNode.tsx      # 新規
├── hooks/
│   └── useNodesAvailability.ts     # 更新: 実装完成
├── utils/
│   ├── node-types.ts               # 更新: 新ノードタイプ登録
│   └── graph-to-api.ts             # 更新: 新パラメータ対応
└── NodePalette.tsx                 # 更新: 条件付き表示
```

---

## 詳細実装

### 1. KlingModeNode.tsx

```typescript
'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { KlingModeNodeData } from '@/lib/types/node-editor';

interface KlingModeNodeProps extends NodeProps {
  data: KlingModeNodeData;
  selected: boolean;
}

const KLING_MODES: { value: 'std' | 'pro'; label: string; description: string }[] = [
  { value: 'std', label: 'Standard', description: '標準モード（高速・低コスト）' },
  { value: 'pro', label: 'Professional', description: 'プロモード（高品質）' },
];

export function KlingModeNode({ data, selected, id }: KlingModeNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<KlingModeNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="Kling モード"
      icon={<Zap className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      <div className="space-y-2">
        {KLING_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => updateNodeData({ mode: mode.value })}
            className={cn(
              'w-full p-3 rounded-lg text-left transition-all',
              data.mode === mode.value
                ? 'bg-[#fce300] text-black'
                : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
            )}
          >
            <span className="text-sm font-medium">{mode.label}</span>
            <span
              className={cn(
                'block text-xs mt-1',
                data.mode === mode.value ? 'text-black/70' : 'text-gray-500'
              )}
            >
              {mode.description}
            </span>
          </button>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="kling_mode"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 2. KlingElementsNode.tsx

```typescript
'use client';

import { useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Layers, Plus, X, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { KlingElementsNodeData } from '@/lib/types/node-editor';
import { videosApi } from '@/lib/api/client';

interface KlingElementsNodeProps extends NodeProps {
  data: KlingElementsNodeData;
  selected: boolean;
}

const MAX_ELEMENTS = 3;

export function KlingElementsNode({ data, selected, id }: KlingElementsNodeProps) {
  const [isUploading, setIsUploading] = useState(false);

  const updateNodeData = useCallback(
    (updates: Partial<KlingElementsNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (data.elementImages.length >= MAX_ELEMENTS) {
        updateNodeData({
          errorMessage: `要素画像は最大${MAX_ELEMENTS}枚までです`,
          isValid: false,
        });
        return;
      }

      setIsUploading(true);
      try {
        const result = await videosApi.uploadImage(file);
        updateNodeData({
          elementImages: [...data.elementImages, result.image_url],
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        updateNodeData({
          errorMessage: error instanceof Error ? error.message : 'アップロード失敗',
          isValid: false,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [data.elementImages, updateNodeData]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const newImages = data.elementImages.filter((_, i) => i !== index);
      updateNodeData({
        elementImages: newImages,
        isValid: true,
        errorMessage: undefined,
      });
    },
    [data.elementImages, updateNodeData]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    disabled: isUploading || data.elementImages.length >= MAX_ELEMENTS,
  });

  return (
    <BaseNode
      title="Kling 要素画像"
      icon={<Layers className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[240px]"
    >
      {/* アップロード済み画像 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {data.elementImages.map((url, index) => (
          <div key={index} className="relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`要素画像 ${index + 1}`}
              className="w-full h-full object-cover rounded-lg"
            />
            <button
              onClick={() => handleRemove(index)}
              className="absolute -top-1 -right-1 p-1 bg-red-500 rounded-full"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {/* 追加ボタン */}
        {data.elementImages.length < MAX_ELEMENTS && (
          <div
            {...getRootProps()}
            className={cn(
              'aspect-square border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-[#fce300] bg-[#fce300]/10'
                : 'border-[#404040] hover:border-[#606060]',
              isUploading && 'pointer-events-none opacity-50'
            )}
          >
            <input {...getInputProps()} />
            {isUploading ? (
              <Loader2 className="w-5 h-5 text-[#fce300] animate-spin" />
            ) : (
              <Plus className="w-5 h-5 text-gray-500" />
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-500">
        {data.elementImages.length}/{MAX_ELEMENTS} 枚（一貫性向上用）
      </p>

      <Handle
        type="source"
        position={Position.Right}
        id="kling_elements"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 3. KlingEndFrameNode.tsx

```typescript
'use client';

import { useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Film, Upload, X, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { KlingEndFrameNodeData } from '@/lib/types/node-editor';
import { videosApi } from '@/lib/api/client';

interface KlingEndFrameNodeProps extends NodeProps {
  data: KlingEndFrameNodeData;
  selected: boolean;
}

export function KlingEndFrameNode({ data, selected, id }: KlingEndFrameNodeProps) {
  const [isUploading, setIsUploading] = useState(false);

  const updateNodeData = useCallback(
    (updates: Partial<KlingEndFrameNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const result = await videosApi.uploadImage(file);
        updateNodeData({
          endFrameImageUrl: result.image_url,
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        updateNodeData({
          errorMessage: error instanceof Error ? error.message : 'アップロード失敗',
          isValid: false,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [updateNodeData]
  );

  const handleClear = useCallback(() => {
    updateNodeData({
      endFrameImageUrl: null,
      isValid: true,
      errorMessage: undefined,
    });
  }, [updateNodeData]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <BaseNode
      title="Kling 終了フレーム"
      icon={<Film className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {data.endFrameImageUrl ? (
        <div className="relative mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.endFrameImageUrl}
            alt="終了フレーム"
            className="w-full h-24 object-cover rounded-lg"
          />
          <button
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-2',
            isDragActive
              ? 'border-[#fce300] bg-[#fce300]/10'
              : 'border-[#404040] hover:border-[#606060]',
            isUploading && 'pointer-events-none opacity-50'
          )}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <Loader2 className="w-5 h-5 mx-auto text-[#fce300] animate-spin" />
          ) : (
            <>
              <Upload className="w-5 h-5 mx-auto text-gray-500 mb-1" />
              <p className="text-[10px] text-gray-500">動画の最終フレーム</p>
            </>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-500">
        終了フレームを指定して動画の終わり方をコントロール
      </p>

      <Handle
        type="source"
        position={Position.Right}
        id="kling_end_frame"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 4. ActTwoNode.tsx

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import {
  BaseNode,
  inputHandleClassName,
  outputHandleClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { ActTwoNodeData, SubjectType } from '@/lib/types/node-editor';
import { motionsApi } from '@/lib/api/client';
import type { Motion } from '@/lib/api/client';

interface ActTwoNodeProps extends NodeProps {
  data: ActTwoNodeData;
  selected: boolean;
}

const EXPRESSION_LEVELS = [
  { value: 1, label: '控えめ' },
  { value: 2, label: 'やや控えめ' },
  { value: 3, label: '普通' },
  { value: 4, label: 'やや強め' },
  { value: 5, label: '強め' },
];

export function ActTwoNode({ data, selected, id }: ActTwoNodeProps) {
  const [motions, setMotions] = useState<Motion[]>([]);
  const [isLoadingMotions, setIsLoadingMotions] = useState(false);
  const [subjectType, setSubjectType] = useState<SubjectType | null>(null);

  // Promptノードからsubject_typeを受け取るイベントリスナー
  useEffect(() => {
    const handleSubjectTypeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ subjectType: SubjectType }>;
      setSubjectType(customEvent.detail.subjectType);
    };

    window.addEventListener('subjectTypeChange', handleSubjectTypeChange);
    return () => {
      window.removeEventListener('subjectTypeChange', handleSubjectTypeChange);
    };
  }, []);

  // モーションリストを取得
  // Note: motionsApi.list() は Motion[] を直接返す（{ motions: Motion[] } ではない）
  useEffect(() => {
    const loadMotions = async () => {
      setIsLoadingMotions(true);
      try {
        const motionsList = await motionsApi.list();
        setMotions(motionsList);  // 直接配列を設定
      } catch (error) {
        console.error('Failed to load motions:', error);
      } finally {
        setIsLoadingMotions(false);
      }
    };

    if (data.useActTwo) {
      loadMotions();
    }
  }, [data.useActTwo]);

  const updateNodeData = useCallback(
    (updates: Partial<ActTwoNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const isCompatibleSubject = subjectType === 'person' || subjectType === 'animation';

  return (
    <BaseNode
      title="Act-Two"
      icon={<Zap className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={
        !isCompatibleSubject && data.useActTwo
          ? 'Act-Twoはperson/animationタイプのみ対応'
          : data.errorMessage
      }
      className="min-w-[260px]"
    >
      {/* 入力ハンドル（subject_type用） */}
      <Handle
        type="target"
        position={Position.Left}
        id="subject_type"
        className={inputHandleClassName}
      />

      {/* Act-Two有効化トグル */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-white">Act-Two を有効化</span>
        <button
          onClick={() => updateNodeData({ useActTwo: !data.useActTwo })}
          className={cn(
            'w-12 h-6 rounded-full transition-colors relative',
            data.useActTwo ? 'bg-[#fce300]' : 'bg-[#404040]'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
              data.useActTwo ? 'translate-x-7' : 'translate-x-1'
            )}
          />
        </button>
      </div>

      {data.useActTwo && (
        <div className="space-y-4">
          {/* モーションタイプ */}
          <div>
            <label className={nodeLabelClassName}>モーションタイプ</label>
            <select
              value={data.motionType || ''}
              onChange={(e) =>
                updateNodeData({ motionType: e.target.value || null })
              }
              className={nodeSelectClassName}
              disabled={isLoadingMotions}
            >
              <option value="">選択なし</option>
              {/* Note: Motion型は id, name_ja, name_en を持つ（motion_type, name ではない） */}
              {motions.map((motion) => (
                <option key={motion.id} value={motion.id}>
                  {motion.name_ja}
                </option>
              ))}
            </select>
          </div>

          {/* 表情強度 */}
          <div>
            <label className={nodeLabelClassName}>
              表情強度: {data.expressionIntensity}
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={data.expressionIntensity}
              onChange={(e) =>
                updateNodeData({ expressionIntensity: Number(e.target.value) })
              }
              className="w-full h-2 bg-[#404040] rounded-lg appearance-none cursor-pointer accent-[#fce300]"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>控えめ</span>
              <span>強め</span>
            </div>
          </div>

          {/* 体の動き制御 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">体の動きを制御</span>
            <button
              onClick={() => updateNodeData({ bodyControl: !data.bodyControl })}
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative',
                data.bodyControl ? 'bg-[#fce300]' : 'bg-[#404040]'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  data.bodyControl ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="act_two"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 5. HailuoEndFrameNode.tsx

```typescript
'use client';

import { useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Film, Upload, X, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { HailuoEndFrameNodeData } from '@/lib/types/node-editor';
import { videosApi } from '@/lib/api/client';

interface HailuoEndFrameNodeProps extends NodeProps {
  data: HailuoEndFrameNodeData;
  selected: boolean;
}

export function HailuoEndFrameNode({ data, selected, id }: HailuoEndFrameNodeProps) {
  const [isUploading, setIsUploading] = useState(false);

  const updateNodeData = useCallback(
    (updates: Partial<HailuoEndFrameNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const result = await videosApi.uploadImage(file);
        updateNodeData({
          lastFrameImageUrl: result.image_url,
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        updateNodeData({
          errorMessage: error instanceof Error ? error.message : 'アップロード失敗',
          isValid: false,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [updateNodeData]
  );

  const handleClear = useCallback(() => {
    updateNodeData({
      lastFrameImageUrl: null,
      isValid: true,
      errorMessage: undefined,
    });
  }, [updateNodeData]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <BaseNode
      title="Hailuo 終了フレーム"
      icon={<Film className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {data.lastFrameImageUrl ? (
        <div className="relative mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.lastFrameImageUrl}
            alt="Hailuo終了フレーム"
            className="w-full h-24 object-cover rounded-lg"
          />
          <button
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-2',
            isDragActive
              ? 'border-[#fce300] bg-[#fce300]/10'
              : 'border-[#404040] hover:border-[#606060]',
            isUploading && 'pointer-events-none opacity-50'
          )}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <Loader2 className="w-5 h-5 mx-auto text-[#fce300] animate-spin" />
          ) : (
            <>
              <Upload className="w-5 h-5 mx-auto text-gray-500 mb-1" />
              <p className="text-[10px] text-gray-500">最終フレーム画像</p>
            </>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-500">
        Hailuo専用: 動画の終わり方を指定
      </p>

      <Handle
        type="source"
        position={Position.Right}
        id="hailuo_end_frame"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

---

## 更新が必要な既存ファイル

### 1. nodes/index.ts

```typescript
export { BaseNode, inputHandleClassName, outputHandleClassName, nodeInputClassName, nodeSelectClassName, nodeButtonClassName, nodeLabelClassName } from './BaseNode';
export { ImageInputNode } from './ImageInputNode';
export { PromptNode } from './PromptNode';
export { ProviderNode } from './ProviderNode';
export { CameraWorkNode } from './CameraWorkNode';
export { GenerateNode } from './GenerateNode';
// Phase 2: プロバイダー固有ノード
export { KlingModeNode } from './KlingModeNode';
export { KlingElementsNode } from './KlingElementsNode';
export { KlingEndFrameNode } from './KlingEndFrameNode';
export { ActTwoNode } from './ActTwoNode';
export { HailuoEndFrameNode } from './HailuoEndFrameNode';
```

### 2. utils/node-types.ts

```typescript
import type { NodeTypes } from '@xyflow/react';
import { ImageInputNode } from '../nodes/ImageInputNode';
import { PromptNode } from '../nodes/PromptNode';
import { ProviderNode } from '../nodes/ProviderNode';
import { CameraWorkNode } from '../nodes/CameraWorkNode';
import { GenerateNode } from '../nodes/GenerateNode';
// Phase 2
import { KlingModeNode } from '../nodes/KlingModeNode';
import { KlingElementsNode } from '../nodes/KlingElementsNode';
import { KlingEndFrameNode } from '../nodes/KlingEndFrameNode';
import { ActTwoNode } from '../nodes/ActTwoNode';
import { HailuoEndFrameNode } from '../nodes/HailuoEndFrameNode';

export const nodeTypes: NodeTypes = {
  imageInput: ImageInputNode,
  prompt: PromptNode,
  provider: ProviderNode,
  cameraWork: CameraWorkNode,
  generate: GenerateNode,
  // Phase 2: プロバイダー固有ノード
  klingMode: KlingModeNode,
  klingElements: KlingElementsNode,
  klingEndFrame: KlingEndFrameNode,
  actTwo: ActTwoNode,
  hailuoEndFrame: HailuoEndFrameNode,
};

// ... 他の設定は変更なし
```

### 3. PromptNode.tsx（subjectType変更イベント発火）

**重要**: この更新はActTwoNodeが正しく動作するために必須。
現在のPromptNode.tsxにはCustomEvent発火が含まれていないため、追加が必要。

```typescript
// components/node-editor/nodes/PromptNode.tsx の handleSubjectTypeChange を置き換え

const handleSubjectTypeChange = useCallback(
  (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubjectType = e.target.value as SubjectType;
    updateNodeData({ subjectType: newSubjectType });

    // 【Phase 2追加】Act-Twoノードに通知するためのCustomEvent
    const event = new CustomEvent('subjectTypeChange', {
      detail: { subjectType: newSubjectType },
    });
    window.dispatchEvent(event);
  },
  [updateNodeData]
);
```

**場所**: `PromptNode.tsx` 内の `handleSubjectTypeChange` 関数（現在75-82行目付近）

### 4. useWorkflowValidation.ts（Phase 2バリデーション追加）

```typescript
// validateGraphForGeneration 関数内に追加

// KlingElements の最大3枚制限チェック
if (data.type === 'klingElements') {
  const d = data as KlingElementsNodeData;
  if (d.elementImages.length > 3) {
    errors.push('Kling要素画像は最大3枚までです');
  }
}

// ActTwo の subject_type 互換性チェック
if (data.type === 'actTwo') {
  const d = data as ActTwoNodeData;
  if (d.useActTwo) {
    // PromptNode を検索して subject_type を確認
    const promptNode = nodes.find(
      (n) => (n.data as WorkflowNodeData).type === 'prompt'
    );
    if (promptNode) {
      const promptData = promptNode.data as PromptNodeData;
      if (promptData.subjectType !== 'person' && promptData.subjectType !== 'animation') {
        errors.push('Act-Two は person または animation タイプのみで使用可能です');
      }
    }
  }
}

// プロバイダー固有ノードの存在チェック
const providerNode = nodes.find(
  (n) => (n.data as WorkflowNodeData).type === 'provider'
);
if (providerNode) {
  const providerData = providerNode.data as ProviderNodeData;

  // Kling専用ノードがKling以外で使われていないかチェック
  const hasKlingNodes = nodes.some(
    (n) => ['klingMode', 'klingElements', 'klingEndFrame'].includes(
      (n.data as WorkflowNodeData).type
    )
  );
  if (hasKlingNodes && providerData.provider !== 'piapi_kling') {
    errors.push('Kling専用ノードはKlingプロバイダー選択時のみ使用可能です');
  }

  // Hailuo専用ノードがHailuo以外で使われていないかチェック
  const hasHailuoNodes = nodes.some(
    (n) => (n.data as WorkflowNodeData).type === 'hailuoEndFrame'
  );
  if (hasHailuoNodes && providerData.provider !== 'hailuo') {
    errors.push('Hailuo終了フレームノードはHailuoプロバイダー選択時のみ使用可能です');
  }

  // ActTwo ノードがRunway以外で使われていないかチェック
  const hasActTwoNodes = nodes.some(
    (n) => (n.data as WorkflowNodeData).type === 'actTwo'
  );
  if (hasActTwoNodes && providerData.provider !== 'runway') {
    errors.push('Act-TwoノードはRunwayプロバイダー選択時のみ使用可能です');
  }
}
```

### 5. graph-to-api.ts（拡張部分のみ）

```typescript
// Kling専用パラメータ（プロバイダーがKlingの場合のみ）
if (provider?.provider === 'piapi_kling') {
  const klingMode = findNode<KlingModeNodeData>('klingMode');
  const klingElements = findNode<KlingElementsNodeData>('klingElements');
  const klingEndFrame = findNode<KlingEndFrameNodeData>('klingEndFrame');

  if (klingMode) {
    request.kling_mode = klingMode.mode;
  }
  if (klingElements?.elementImages.length) {
    request.element_images = klingElements.elementImages.map((url) => ({
      image_url: url,
    }));
  }
  if (klingEndFrame?.endFrameImageUrl) {
    request.end_frame_image_url = klingEndFrame.endFrameImageUrl;
  }
}

// Act-Two（Runway + person/animation の場合のみ）
if (provider?.provider === 'runway') {
  const actTwo = findNode<ActTwoNodeData>('actTwo');
  if (actTwo?.useActTwo) {
    const subjectType = prompt?.subjectType;
    if (subjectType === 'person' || subjectType === 'animation') {
      request.use_act_two = true;
      request.motion_type = actTwo.motionType || undefined;
      request.expression_intensity = actTwo.expressionIntensity;
      request.body_control = actTwo.bodyControl;
    }
  }
}

// Hailuo専用パラメータ
if (provider?.provider === 'hailuo') {
  const hailuoEndFrame = findNode<HailuoEndFrameNodeData>('hailuoEndFrame');
  if (hailuoEndFrame?.lastFrameImageUrl) {
    request.end_frame_image_url = hailuoEndFrame.lastFrameImageUrl;
  }
}
```

---

## 実装状況（Phase 1で先行実装済み）

以下のファイルはPhase 1で既にPhase 2対応コードが含まれている:

| ファイル | 状況 | 備考 |
|---------|------|------|
| `lib/types/node-editor.ts` | ✅ 実装済み | 全Phase 2型定義含む |
| `createDefaultNodeData()` | ✅ 実装済み | 全Phase 2ノードのデフォルト値 |
| `utils/graph-to-api.ts` | ✅ 実装済み | 全Phase 2パラメータ変換済み |
| `hooks/useNodesAvailability.ts` | ✅ 実装済み | 条件付き表示ロジック済み |

---

## 実装順序

| # | タスク | 依存関係 | 状況 |
|---|--------|----------|------|
| 1 | KlingModeNode.tsx 作成 | なし | 🔲 未実装 |
| 2 | KlingElementsNode.tsx 作成 | なし | 🔲 未実装 |
| 3 | KlingEndFrameNode.tsx 作成 | なし | 🔲 未実装 |
| 4 | ActTwoNode.tsx 作成 | なし | 🔲 未実装 |
| 5 | HailuoEndFrameNode.tsx 作成 | なし | 🔲 未実装 |
| 6 | nodes/index.ts 更新 | 1-5 | 🔲 未実装 |
| 7 | utils/node-types.ts 更新 | 1-5 | 🔲 未実装 |
| 8 | PromptNode.tsx 更新（subjectTypeChangeイベント発火追加） | 4 | 🔲 未実装 |
| 9 | graph-to-api.ts 確認 | 1-5 | ✅ 実装済み |
| 10 | useWorkflowValidation.ts 更新 | 1-5 | 🔲 一部追加必要 |
| 11 | NodePalette.tsx 条件付き表示確認 | 6, 7 | ✅ ロジック実装済み |
| 12 | ビルド・Lintテスト | 6-11 | 🔲 |
| 13 | 手動テスト（各プロバイダー） | 12 | 🔲 |

---

## テスト計画

### 1. ユニットテスト

```bash
# テストファイル作成予定
tests/node-editor/KlingModeNode.test.tsx
tests/node-editor/KlingElementsNode.test.tsx
tests/node-editor/ActTwoNode.test.tsx
```

### 2. 手動テスト手順

#### Klingノードテスト
1. Providerノードで「Kling」を選択
2. パレットに「Kling モード」「Kling 要素画像」「Kling 終了フレーム」が表示されることを確認
3. 各ノードをキャンバスに追加
4. KlingElementsで4枚目を追加しようとしてエラーになることを確認
5. 生成実行してAPIリクエストにパラメータが含まれることを確認

#### Act-Twoノードテスト
1. Providerノードで「Runway」を選択
2. Promptノードで「person」または「animation」を選択
3. パレットに「Act-Two」が表示されることを確認
4. Act-Twoを有効化してモーション選択
5. 「object」に切り替えてAct-Two無効化警告を確認

#### Hailuoノードテスト
1. Providerノードで「Hailuo」を選択
2. パレットに「Hailuo 終了フレーム」が表示されることを確認
3. 画像をアップロードして生成実行

---

## 成功基準

- [ ] 5種類の新ノードがすべて正常に動作
- [ ] プロバイダー選択に応じてパレットの表示が切り替わる
- [ ] Kling要素画像の3枚制限が正常に機能
- [ ] Act-TwoのsubjectType条件が正常に機能
- [ ] graph-to-apiで全パラメータが正しく変換される
- [ ] ESLint/TypeScriptエラーなし
- [ ] ビルド成功
