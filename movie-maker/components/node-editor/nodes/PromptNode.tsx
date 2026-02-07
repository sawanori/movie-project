'use client';

import { useCallback, useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Type, Loader2, Languages } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
  nodeInputClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import type { PromptNodeData, SubjectType } from '@/lib/types/node-editor';
import { videosApi } from '@/lib/api/client';

interface PromptNodeProps extends NodeProps {
  data: PromptNodeData;
  selected: boolean;
}

const SUBJECT_TYPES: { value: SubjectType; label: string }[] = [
  { value: 'person', label: '人物' },
  { value: 'object', label: 'オブジェクト' },
  { value: 'animation', label: 'アニメーション' },
];

export function PromptNode({ data, selected, id }: PromptNodeProps) {
  const [localPrompt, setLocalPrompt] = useState(data.japanesePrompt);

  const updateNodeData = useCallback(
    (updates: Partial<PromptNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  // デバウンス翻訳
  useEffect(() => {
    if (!localPrompt.trim()) {
      updateNodeData({
        japanesePrompt: '',
        englishPrompt: '',
        isValid: false,
      });
      return;
    }

    const timer = setTimeout(async () => {
      updateNodeData({ isTranslating: true, japanesePrompt: localPrompt });

      try {
        const result = await videosApi.translateStoryPrompt({ description_ja: localPrompt });
        updateNodeData({
          englishPrompt: result.english_prompt,
          isTranslating: false,
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        updateNodeData({
          isTranslating: false,
          isValid: false,
          errorMessage:
            error instanceof Error ? error.message : '翻訳に失敗しました',
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localPrompt, updateNodeData]);

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

  return (
    <BaseNode
      title="プロンプト"
      icon={<Type className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {/* 被写体タイプ */}
      <div className="mb-3">
        <label className={nodeLabelClassName}>被写体タイプ</label>
        <select
          value={data.subjectType}
          onChange={handleSubjectTypeChange}
          className={nodeSelectClassName}
        >
          {SUBJECT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* 日本語プロンプト入力 */}
      <div className="mb-3">
        <label className={nodeLabelClassName}>プロンプト（日本語）</label>
        <textarea
          placeholder="動画の内容を日本語で入力"
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          className={`${nodeInputClassName} min-h-[80px] resize-none`}
        />
      </div>

      {/* 翻訳結果表示 */}
      {data.isTranslating ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>翻訳中...</span>
        </div>
      ) : data.englishPrompt ? (
        <div className="p-2 bg-[#1a1a1a] rounded-lg">
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            <Languages className="w-3 h-3" />
            <span>英語翻訳</span>
          </div>
          <p className="text-xs text-gray-300 line-clamp-3">
            {data.englishPrompt}
          </p>
        </div>
      ) : null}

      {/* 出力ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        id="story_text"
        className={outputHandleClassName}
        style={{ top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="subject_type"
        className={outputHandleClassName}
        style={{ top: '70%' }}
      />
    </BaseNode>
  );
}
