'use client';

import { useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Camera, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BaseNode,
  getInputHandleClass,
  getOutputHandleClass,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import type { GetVideoFrameNodeData } from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';
import { emitNodeDataUpdate } from '../utils/emit-node-data';

type GetVideoFrameNodeProps = NodeProps & {
  data: GetVideoFrameNodeData;
  selected: boolean;
};

export function GetVideoFrameNode({ data, selected, id }: GetVideoFrameNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<GetVideoFrameNodeData>) => {
      emitNodeDataUpdate<GetVideoFrameNodeData>(id, updates);
    },
    [id]
  );

  // 実行ボタン押下: NodeEditor.tsx の handleStartGetVideoFrame に処理を委譲 (B4 パターン)
  const handleExecute = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('startGetVideoFrame', {
        detail: { nodeId: id },
      })
    );
  }, [id]);

  const isProcessing = data.status === 'processing';
  const canExecute = !isProcessing && !!data.inputVideoUrl;

  const renderStatusArea = () => {
    if (data.status === 'processing') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
          <span className="text-xs text-gray-300">抽出中...</span>
        </div>
      );
    }
    if (data.status === 'completed') {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-400">抽出完了</span>
          </div>
          {data.outputImageUrl && (
            <img
              src={data.outputImageUrl}
              alt="抽出フレーム"
              className="w-full rounded-lg object-cover max-h-32"
            />
          )}
        </div>
      );
    }
    if (data.status === 'failed' && data.errorMessage) {
      return (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-400">{data.errorMessage}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <BaseNode
      title="フレーム抽出"
      icon={<Camera className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[220px]"
    >
      {/* 入力ハンドル (Video=緑) */}
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.GET_VIDEO_FRAME_VIDEO_INPUT}
        className={getInputHandleClass('video')}
      />

      {/* direction セレクト */}
      <div>
        <label className={nodeLabelClassName}>抽出位置</label>
        <select
          value={data.direction ?? 'first'}
          onChange={(e) =>
            updateNodeData({ direction: e.target.value as 'first' | 'last' })
          }
          className={nodeSelectClassName}
        >
          <option value="first">最初のフレーム</option>
          <option value="last">最後のフレーム</option>
        </select>
      </div>

      {/* ステータス表示 (処理中 / 完了 + プレビュー / 失敗) */}
      {renderStatusArea()}

      {/* 実行ボタン */}
      <button
        onClick={handleExecute}
        disabled={!canExecute}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
          canExecute
            ? 'bg-[#fce300] text-black hover:bg-[#e5cd00]'
            : 'bg-[#404040] text-gray-500 cursor-not-allowed'
        )}
      >
        <Camera className="w-4 h-4" />
        フレーム抽出
      </button>

      {/* 出力ハンドル (Image=青) */}
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.GET_VIDEO_FRAME_IMAGE_OUTPUT}
        className={getOutputHandleClass('image')}
      />
    </BaseNode>
  );
}
