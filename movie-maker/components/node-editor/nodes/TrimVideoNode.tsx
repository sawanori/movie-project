'use client'

import { useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Scissors, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BaseNode,
  getInputHandleClass,
  getOutputHandleClass,
  nodeInputClassName,
  nodeLabelClassName,
} from './BaseNode'
import type { TrimVideoNodeData } from '@/lib/types/node-editor'
import { HANDLE_IDS } from '@/lib/types/node-editor'

type TrimVideoNodeProps = NodeProps & {
  data: TrimVideoNodeData
  selected: boolean
}

export function TrimVideoNode({ data, selected, id }: TrimVideoNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<TrimVideoNodeData>) => {
      window.dispatchEvent(
        new CustomEvent('nodeDataUpdate', {
          detail: { nodeId: id, updates },
        })
      )
    },
    [id]
  )

  const handleExecute = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('startTrimVideo', { detail: { nodeId: id } })
    )
  }, [id])

  // Client-side validation
  const isStartValid = data.startSeconds >= 0
  const isEndValid =
    data.endSeconds === null || data.endSeconds > data.startSeconds
  const isRangeValid = isStartValid && isEndValid

  const isProcessing = data.status === 'processing'
  const canExecute = !isProcessing && !!data.inputVideoUrl && isRangeValid

  const renderStatusArea = () => {
    if (data.status === 'processing') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
          <span className="text-xs text-gray-300">処理中...</span>
        </div>
      )
    }
    if (data.status === 'completed') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-400">トリム完了</span>
        </div>
      )
    }
    if (data.status === 'failed' && data.errorMessage) {
      return (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-400">{data.errorMessage}</span>
        </div>
      )
    }
    return null
  }

  return (
    <BaseNode
      title="トリム"
      icon={<Scissors className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid && isRangeValid}
      errorMessage={
        !isRangeValid
          ? '終了時刻は開始時刻より大きい値を入力してください'
          : data.errorMessage
      }
      className="min-w-[220px]"
    >
      {/* 入力ハンドル (Video=緑) */}
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.TRIM_VIDEO_INPUT}
        className={getInputHandleClass('video')}
      />

      {/* 開始時刻入力 */}
      <div>
        <label className={nodeLabelClassName}>開始 (秒)</label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={data.startSeconds ?? 0}
          onChange={(e) =>
            updateNodeData({ startSeconds: parseFloat(e.target.value) || 0 })
          }
          className={nodeInputClassName}
          placeholder="0"
        />
      </div>

      {/* 終了時刻入力 */}
      <div>
        <label className={nodeLabelClassName}>終了 (秒) — 空欄で最後まで</label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={data.endSeconds ?? ''}
          onChange={(e) => {
            const val =
              e.target.value === '' ? null : parseFloat(e.target.value)
            updateNodeData({ endSeconds: val })
          }}
          className={nodeInputClassName}
          placeholder="最後まで"
        />
      </div>

      {/* ステータス表示 */}
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
        <Scissors className="w-4 h-4" />
        トリム
      </button>

      {/* 出力ハンドル (Video=緑) */}
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.TRIM_VIDEO_OUTPUT}
        className={getOutputHandleClass('video')}
      />
    </BaseNode>
  )
}
