'use client';

import { useCallback, useMemo, useState } from 'react';
import { Handle, Position, NodeProps, useNodes } from '@xyflow/react';
import { Layers, Plus, X, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type {
  KlingElementsNodeData,
  ProviderNodeData,
  WorkflowNode,
} from '@/lib/types/node-editor';
import { videosApi } from '@/lib/api/client';

interface KlingElementsNodeProps extends NodeProps {
  data: KlingElementsNodeData;
  selected: boolean;
}

const MAX_ELEMENTS = 4;

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

  // B2 解決: グラフ内の全 ProviderNode を useNodes() で走査
  // 1-hop search ではなく全ノードスキャンで ProviderNode を探す (Design Doc §7-1 B2 解決)
  const nodes = useNodes<WorkflowNode>();
  const isKlingProvider = useMemo(() => {
    const providerNodes = nodes.filter((n) => n.data.type === 'provider');
    if (providerNodes.length === 0) return null; // Provider 未配置 → 警告非表示
    return providerNodes.some(
      (n) => (n.data as ProviderNodeData).provider === 'piapi_kling'
    );
  }, [nodes]);

  return (
    <BaseNode
      title="Kling 要素画像"
      icon={<Layers className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[280px]"
    >
      {/* Provider 警告 (B2 解決: useNodes 全ノードスキャン) */}
      {isKlingProvider === false && (
        <div className="mb-2 p-2 rounded bg-[#2a2a2a] border border-yellow-600/40">
          <p className="text-[10px] text-yellow-400">
            ⚠ Kling 専用ノードです。他プロバイダー時は無視されます
          </p>
        </div>
      )}

      {/* アップロード済み画像 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
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
      <p className="mt-1 text-[10px] text-gray-400">
        プロンプトに <span className="text-[#fce300]">@image_1</span> を入れると参照位置を明示できます
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
