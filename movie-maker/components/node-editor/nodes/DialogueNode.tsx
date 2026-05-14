'use client';

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Mic, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import {
  BaseNode,
  inputHandleClassName,
  outputHandleClassName,
  nodeSelectClassName,
  nodeInputClassName,
  nodeLabelClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { DialogueNodeData } from '@/lib/types/node-editor';
import { ttsApi, type VoiceInfo } from '@/lib/api/client';

type DialogueNodeProps = NodeProps & {
  data: DialogueNodeData;
  selected: boolean;
};

export function DialogueNode({ data, selected, id }: DialogueNodeProps) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // 声リストを取得 (ja 固定)
  useEffect(() => {
    const loadVoices = async () => {
      setIsLoadingVoices(true);
      try {
        const data = await ttsApi.listVoices('ja');
        setVoices(data);
      } catch (err) {
        console.error('Failed to load voices', err);
      } finally {
        setIsLoadingVoices(false);
      }
    };
    loadVoices();
  }, []);

  const updateNodeData = useCallback(
    (updates: Partial<DialogueNodeData>) => {
      window.dispatchEvent(
        new CustomEvent('nodeDataUpdate', {
          detail: { nodeId: id, updates },
        })
      );
    },
    [id]
  );

  // 実行ボタン押下: NodeEditor.tsx の handleStartDialogue に処理を委譲
  const handleExecute = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('startDialogue', {
        detail: { nodeId: id },
      })
    );
  }, [id]);

  const isProcessing =
    data.status === 'pending' || data.status === 'processing';
  const canExecute =
    !isProcessing &&
    data.status !== 'completed' &&
    !!data.text.trim() &&
    !!data.voiceId;

  const renderStatusArea = () => {
    if (data.status === 'processing' || data.status === 'pending') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
          <span className="text-xs text-gray-300">処理中... {data.progress}%</span>
        </div>
      );
    }
    if (data.status === 'completed') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-400">合成完了</span>
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
      title="セリフ (TTS)"
      icon={<Mic className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage ?? undefined}
      className="min-w-[280px]"
    >
      {/* 入力動画 Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="dialogue_video_input"
        className={inputHandleClassName}
      />

      {/* セリフテキスト入力 */}
      <div>
        <label className={nodeLabelClassName}>セリフテキスト</label>
        <textarea
          value={data.text}
          onChange={(e) => {
            const newText = e.target.value;
            updateNodeData({ text: newText, isValid: !!newText.trim() && !!data.voiceId });
          }}
          placeholder="ここにセリフを入力（最大 5000 文字）"
          maxLength={5000}
          rows={3}
          className={cn(
            nodeInputClassName,
            'resize-none text-sm leading-relaxed'
          )}
        />
        <p className="text-[10px] text-gray-600 mt-0.5 text-right">
          {data.text.length}/5000
        </p>
      </div>

      {/* 声選択ドロップダウン */}
      <div>
        <label className={nodeLabelClassName}>声</label>
        <select
          value={data.voiceId ?? ''}
          onChange={(e) => {
            const newVoiceId = e.target.value || null;
            updateNodeData({ voiceId: newVoiceId, isValid: !!data.text.trim() && !!newVoiceId });
          }}
          disabled={isLoadingVoices}
          className={nodeSelectClassName}
        >
          <option value="">声を選択してください</option>
          {voices.map((voice) => (
            <option key={voice.voice_id} value={voice.voice_id}>
              {voice.name}
            </option>
          ))}
        </select>
        {isLoadingVoices && (
          <p className="text-[10px] text-gray-500 mt-0.5">読み込み中...</p>
        )}
      </div>

      {/* 速度スライダー */}
      <div>
        <label className={nodeLabelClassName}>
          読み上げ速度: {data.speed.toFixed(2)}x
        </label>
        <input
          type="range"
          min={0.25}
          max={4.0}
          step={0.05}
          value={data.speed}
          onChange={(e) =>
            updateNodeData({ speed: parseFloat(e.target.value) })
          }
          className="w-full accent-[#fce300]"
        />
      </div>

      {/* 注意書き */}
      <div className="p-2 rounded bg-[#2a2a2a] border border-yellow-600/30">
        <p className="text-[10px] text-yellow-500">
          ※ 口の動きは合成しません (TTS のみ)
        </p>
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
        <Mic className="w-4 h-4" />
        合成する
      </button>

      {/* 出力動画 Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="dialogue_video_output"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
