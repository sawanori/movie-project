'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Camera, ChevronDown, ChevronRight } from 'lucide-react';
import {
  BaseNode,
  inputHandleClassName,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { CameraWorkNodeData, VideoProvider } from '@/lib/types/node-editor';

interface CameraWorkNodeProps extends NodeProps {
  data: CameraWorkNodeData;
  selected: boolean;
}

// カメラワークカテゴリ
interface CameraCategory {
  id: string;
  label: string;
  icon: string;
}

interface CameraWorkOption {
  id: number;
  name: string;
  label: string;
  description: string;
  category: string;
  promptText: string;
}

const CAMERA_CATEGORIES: CameraCategory[] = [
  { id: 'static', label: '静止', icon: '🎯' },
  { id: 'approach', label: '接近', icon: '🔍' },
  { id: 'horizontal', label: '水平', icon: '↔️' },
  { id: 'vertical', label: '垂直', icon: '↕️' },
  { id: 'orbit', label: '周回', icon: '🔄' },
  { id: 'follow', label: '追従', icon: '👁️' },
  { id: 'dramatic', label: 'ドラマチック', icon: '🎬' },
];

// 代表的なカメラワーク（簡略版 - 実際はlib/camera/camera-works.tsから取得）
const CAMERA_WORKS: CameraWorkOption[] = [
  { id: 1, name: 'static', label: '静止', description: 'カメラ固定', category: 'static', promptText: '' },
  { id: 2, name: 'zoom_in', label: 'ズームイン', description: '被写体に近づく', category: 'approach', promptText: 'Camera slowly zooms in' },
  { id: 3, name: 'zoom_out', label: 'ズームアウト', description: '被写体から離れる', category: 'approach', promptText: 'Camera slowly zooms out' },
  { id: 4, name: 'dolly_in', label: 'ドリーイン', description: '物理的に近づく', category: 'approach', promptText: 'Camera dollies in towards the subject' },
  { id: 5, name: 'dolly_out', label: 'ドリーアウト', description: '物理的に離れる', category: 'approach', promptText: 'Camera dollies out from the subject' },
  { id: 6, name: 'pan_left', label: 'パン左', description: '左にパン', category: 'horizontal', promptText: 'Camera pans left' },
  { id: 7, name: 'pan_right', label: 'パン右', description: '右にパン', category: 'horizontal', promptText: 'Camera pans right' },
  { id: 8, name: 'tilt_up', label: 'チルトアップ', description: '上を向く', category: 'vertical', promptText: 'Camera tilts up' },
  { id: 9, name: 'tilt_down', label: 'チルトダウン', description: '下を向く', category: 'vertical', promptText: 'Camera tilts down' },
  { id: 10, name: 'orbit_left', label: '軌道左', description: '左に周回', category: 'orbit', promptText: 'Camera orbits left around subject' },
  { id: 11, name: 'orbit_right', label: '軌道右', description: '右に周回', category: 'orbit', promptText: 'Camera orbits right around subject' },
  { id: 12, name: 'tracking', label: 'トラッキング', description: '被写体を追跡', category: 'follow', promptText: 'Camera tracks the subject movement' },
  { id: 13, name: 'crane_up', label: 'クレーンアップ', description: '上昇', category: 'dramatic', promptText: 'Camera crane rises up' },
  { id: 14, name: 'crane_down', label: 'クレーンダウン', description: '下降', category: 'dramatic', promptText: 'Camera crane lowers down' },
];

export function CameraWorkNode({ data, selected, id }: CameraWorkNodeProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  // プロバイダー変更イベントをリッスン（将来的なフィルタリング用）
  useEffect(() => {
    const handleProviderChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ provider: VideoProvider }>;
      // プロバイダーに応じたカメラワークフィルタリングを将来実装
      console.log('Provider changed:', customEvent.detail.provider);
    };

    window.addEventListener('providerChange', handleProviderChange);
    return () => {
      window.removeEventListener('providerChange', handleProviderChange);
    };
  }, []);

  const updateNodeData = useCallback(
    (updates: Partial<CameraWorkNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleSelectCameraWork = useCallback(
    (cameraWork: CameraWorkOption) => {
      updateNodeData({
        cameraWorkId: cameraWork.id,
        promptText: cameraWork.promptText,
      });
    },
    [updateNodeData]
  );

  const selectedCameraWork = useMemo(() => {
    return CAMERA_WORKS.find((cw) => cw.id === data.cameraWorkId);
  }, [data.cameraWorkId]);

  const groupedCameraWorks = useMemo(() => {
    const groups: Record<string, CameraWorkOption[]> = {};
    CAMERA_WORKS.forEach((cw) => {
      if (!groups[cw.category]) {
        groups[cw.category] = [];
      }
      groups[cw.category].push(cw);
    });
    return groups;
  }, []);

  return (
    <BaseNode
      title="カメラワーク"
      icon={<Camera className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[260px]"
    >
      {/* 入力ハンドル（プロバイダーから） */}
      <Handle
        type="target"
        position={Position.Left}
        id="provider"
        className={inputHandleClassName}
      />

      {/* 選択中のカメラワーク表示 */}
      {selectedCameraWork && (
        <div className="mb-3 p-2 bg-[#fce300]/10 border border-[#fce300]/30 rounded-lg">
          <p className="text-xs text-[#fce300] font-medium">
            {selectedCameraWork.label}
          </p>
          <p className="text-[10px] text-gray-400">{selectedCameraWork.description}</p>
        </div>
      )}

      {/* カテゴリ別カメラワーク選択 */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {CAMERA_CATEGORIES.map((category) => {
          const works = groupedCameraWorks[category.id] || [];
          const isExpanded = expandedCategory === category.id;

          return (
            <div key={category.id}>
              <button
                onClick={() =>
                  setExpandedCategory(isExpanded ? null : category.id)
                }
                className="w-full flex items-center justify-between p-2 text-xs text-gray-300 hover:bg-[#2a2a2a] rounded-lg transition-colors"
              >
                <span>
                  {category.icon} {category.label}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>

              {isExpanded && (
                <div className="ml-2 mt-1 space-y-1">
                  {works.map((work) => (
                    <button
                      key={work.id}
                      onClick={() => handleSelectCameraWork(work)}
                      className={cn(
                        'w-full text-left p-2 rounded-lg text-xs transition-all',
                        data.cameraWorkId === work.id
                          ? 'bg-[#fce300] text-black'
                          : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
                      )}
                    >
                      <span className="font-medium">{work.label}</span>
                      <span
                        className={cn(
                          'block text-[10px]',
                          data.cameraWorkId === work.id
                            ? 'text-black/70'
                            : 'text-gray-500'
                        )}
                      >
                        {work.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 出力ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        id="camera_work"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
