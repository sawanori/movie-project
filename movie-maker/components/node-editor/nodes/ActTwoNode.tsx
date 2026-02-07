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
        setMotions(motionsList); // 直接配列を設定
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
