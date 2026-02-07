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
