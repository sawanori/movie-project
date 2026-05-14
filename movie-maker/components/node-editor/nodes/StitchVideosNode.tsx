'use client'
import { useCallback, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useEdges, useUpdateNodeInternals } from '@xyflow/react'
import { Link, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import {
  BaseNode,
  getInputHandleClass,
  getOutputHandleClass,
  nodeLabelClassName,
  nodeButtonClassName,
} from './BaseNode'
import type { StitchVideosNodeData } from '@/lib/types/node-editor'
import { HANDLE_IDS } from '@/lib/types/node-editor'

type StitchVideosNodeProps = NodeProps & {
  data: StitchVideosNodeData
  selected: boolean
}

const STITCH_HANDLE_IDS = [
  HANDLE_IDS.STITCH_VIDEO_1,
  HANDLE_IDS.STITCH_VIDEO_2,
  HANDLE_IDS.STITCH_VIDEO_3,
  HANDLE_IDS.STITCH_VIDEO_4,
  HANDLE_IDS.STITCH_VIDEO_5,
] as const

export function StitchVideosNode({ data, selected, id }: StitchVideosNodeProps) {
  const edges = useEdges()
  const updateNodeInternals = useUpdateNodeInternals()

  // 接続済み handle を算出
  const connectedHandleIds = edges
    .filter((e) => e.target === id)
    .map((e) => e.targetHandle)
    .filter((h): h is string => Boolean(h))
  const connectedCount = connectedHandleIds.length

  // 次の空き handle まで表示 (最大 5)
  const visibleHandleCount = Math.min(connectedCount + 1, 5)

  // B1: Handle 数が変化したら React Flow に明示通知する
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, visibleHandleCount, updateNodeInternals])

  const handleExecute = useCallback(() => {
    window.dispatchEvent(new CustomEvent('startStitchVideos', { detail: { nodeId: id } }))
  }, [id])

  const isProcessing = data.status === 'pending' || data.status === 'processing'
  const canExecute = !isProcessing && connectedCount >= 2

  const renderStatusArea = () => {
    if (data.status === 'processing' || data.status === 'pending') {
      return (
        <div className="flex flex-col gap-1 p-2 bg-[#1a1a1a] rounded-lg">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
            <span className="text-xs text-gray-300">処理中... {data.progress}%</span>
          </div>
          <div className="w-full bg-[#404040] rounded-full h-1.5">
            <div
              className="bg-[#fce300] h-1.5 rounded-full transition-all"
              style={{ width: `${data.progress}%` }}
            />
          </div>
        </div>
      )
    }
    if (data.status === 'completed') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-400">連結完了</span>
        </div>
      )
    }
    if (data.status === 'failed') {
      return (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-400">{data.errorMessage ?? '処理に失敗しました'}</span>
        </div>
      )
    }
    return null
  }

  return (
    <BaseNode
      title="スティッチ"
      icon={<Link className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={
        connectedCount < 2 && data.status === 'idle'
          ? '2本以上の動画を接続してください'
          : (data.errorMessage ?? undefined)
      }
      className="min-w-[220px]"
    >
      {/* 動的入力ハンドル (Video=緑) */}
      {STITCH_HANDLE_IDS.slice(0, visibleHandleCount).map((handleId, index) => (
        <div key={handleId} className="flex items-center gap-2 relative">
          <Handle
            type="target"
            position={Position.Left}
            id={handleId}
            className={getInputHandleClass('video')}
            style={{ top: `${20 + index * 28}px` }}
          />
          <span className="text-xs text-gray-500 ml-4">動画 {index + 1}</span>
        </div>
      ))}

      {/* トランジション (Phase 1 は固定 none) */}
      <div>
        <label className={nodeLabelClassName}>トランジション</label>
        <p className="text-xs text-gray-500">カット (Phase 1 のみ)</p>
      </div>

      {/* ステータス表示 */}
      {renderStatusArea()}

      {/* 出力動画プレビュー */}
      {data.status === 'completed' && data.outputVideoUrl && (
        <video
          src={data.outputVideoUrl}
          className="w-full rounded-lg mt-1"
          controls
          muted
          playsInline
        />
      )}

      {/* 実行ボタン */}
      <button
        onClick={handleExecute}
        disabled={!canExecute}
        className={nodeButtonClassName}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            処理中...
          </span>
        ) : (
          '動画を連結'
        )}
      </button>

      {/* 出力ハンドル (Video=緑) */}
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.STITCH_VIDEO_OUTPUT}
        className={getOutputHandleClass('video')}
      />
    </BaseNode>
  )
}
