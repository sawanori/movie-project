'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Video, Play, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import {
  BaseNode,
  inputHandleClassName,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { GenerateNodeData } from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

interface GenerateNodeProps extends NodeProps {
  data: GenerateNodeData;
  selected: boolean;
}

export function GenerateNode({ data, selected, id }: GenerateNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<GenerateNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleGenerate = useCallback(() => {
    // 生成開始イベントを発火（NodeEditorで処理）
    const event = new CustomEvent('startGeneration', {
      detail: { nodeId: id },
    });
    window.dispatchEvent(event);
  }, [id]);

  const handleRetry = useCallback(() => {
    updateNodeData({
      error: null,
      isGenerating: false,
      progress: 0,
    });
    handleGenerate();
  }, [updateNodeData, handleGenerate]);

  const getStatusIcon = () => {
    if (data.isGenerating) {
      return <Loader2 className="w-5 h-5 text-[#fce300] animate-spin" />;
    }
    if (data.error) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    if (data.videoUrl) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <Video className="w-5 h-5 text-gray-500" />;
  };

  const getStatusText = () => {
    if (data.isGenerating) {
      return `生成中... ${data.progress}%`;
    }
    if (data.error) {
      return 'エラー';
    }
    if (data.videoUrl) {
      return '完了';
    }
    return '待機中';
  };

  return (
    <BaseNode
      title="生成"
      icon={<Video className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid || !!data.videoUrl}
      errorMessage={data.error || undefined}
      className="min-w-[240px]"
    >
      {/* 入力ハンドル - 5つ（画像、V2V動画、プロンプト、設定、カメラワーク） */}
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.IMAGE_INPUT}
        className={inputHandleClassName}
        style={{ top: '15%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.SOURCE_VIDEO_INPUT}
        className={inputHandleClassName}
        style={{ top: '28%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.STORY_TEXT_INPUT}
        className={inputHandleClassName}
        style={{ top: '41%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.CONFIG_INPUT}
        className={inputHandleClassName}
        style={{ top: '54%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.CAMERA_WORK_INPUT}
        className={inputHandleClassName}
        style={{ top: '67%' }}
      />

      {/* 入力ラベル */}
      <div className="mb-3 space-y-1 text-[10px] text-gray-500">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#fce300]" />
          <span>画像 (必須)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#404040]" />
          <span>動画 V2V (オプション)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#fce300]" />
          <span>プロンプト (必須)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#404040]" />
          <span>設定 (オプション)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#404040]" />
          <span>カメラワーク (オプション)</span>
        </div>
      </div>

      {/* ステータス表示 */}
      <div className="flex items-center gap-3 p-3 bg-[#1a1a1a] rounded-lg mb-3">
        {getStatusIcon()}
        <div className="flex-1">
          <p className="text-xs text-white font-medium">{getStatusText()}</p>
          {data.isGenerating && (
            <div className="mt-1 h-1 bg-[#404040] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#fce300] transition-all duration-300"
                style={{ width: `${data.progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 動画プレビュー */}
      {data.videoUrl && (
        <div className="mb-3 rounded-lg overflow-hidden relative">
          <video
            src={data.videoUrl}
            controls
            className="w-full h-auto"
            poster={data.videoUrl.replace(/\.[^.]+$/, '_thumb.jpg')}
          />
          {/* 右端のハンドルドラッグ領域を確保 */}
          <div className="absolute top-0 right-0 w-4 h-full pointer-events-none" />
        </div>
      )}

      {/* エラー表示 */}
      {data.error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400">{data.error}</p>
          <button
            onClick={handleRetry}
            className="mt-2 flex items-center gap-1 text-xs text-red-300 hover:text-red-200"
          >
            <RefreshCw className="w-3 h-3" />
            再試行
          </button>
        </div>
      )}

      {/* 生成ボタン */}
      <button
        onClick={handleGenerate}
        disabled={data.isGenerating}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all',
          data.isGenerating
            ? 'bg-[#404040] text-gray-500 cursor-not-allowed'
            : 'bg-[#fce300] text-black hover:bg-[#e5cd00]'
        )}
      >
        {data.isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            生成中...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            動画を生成
          </>
        )}
      </button>

      {/* 出力ハンドル - 動画出力（V2V接続用） */}
      <Handle
        type="source"
        position={Position.Right}
        id="video_url"
        className={outputHandleClassName}
        style={{ top: '50%' }}
      />
      {data.videoUrl && (
        <div className="absolute -right-1 top-[50%] translate-y-3 text-[8px] text-[#00bdb6] whitespace-nowrap pointer-events-none">
          動画出力
        </div>
      )}
    </BaseNode>
  );
}
