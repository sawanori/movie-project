'use client';

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Mic, Loader2, AlertCircle, CheckCircle, Download, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  TTS_EMOTION_PRESETS,
  type TTSEmotionPreset,
} from '@/lib/constants/tts-emotion-presets';
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
import { emitNodeDataUpdate } from '../utils/emit-node-data';
import { ttsApi, type VoiceInfo } from '@/lib/api/client';

type DialogueNodeProps = NodeProps & {
  data: DialogueNodeData;
  selected: boolean;
};

export function DialogueNode({ data, selected, id }: DialogueNodeProps) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isEmotionPanelOpen, setIsEmotionPanelOpen] = useState(false);

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
      emitNodeDataUpdate<DialogueNodeData>(id, updates);
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
    !!data.text.trim() &&
    !!data.voiceId;

  const renderStatusArea = () => {
    if (data.status === 'processing' || data.status === 'pending') {
      return (
        <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
          <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
          <span className="text-xs text-gray-300">
            処理中... {data.progress}%
            {data.useLipSync && (
              <span className="text-gray-500 ml-1">(1-3 分かかります)</span>
            )}
          </span>
        </div>
      );
    }
    if (data.status === 'completed') {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-400">合成完了</span>
          </div>
          {data.outputVideoUrl && (
            <>
              <video
                src={data.outputVideoUrl}
                controls
                className="w-full rounded-lg bg-black"
                preload="metadata"
              />
              <a
                href={data.outputVideoUrl}
                download={`dialogue_${id}.mp4`}
                className="flex items-center justify-center gap-2 p-2 bg-[#fce300] text-black rounded-lg text-xs font-medium hover:bg-[#e5cd00] transition-colors"
              >
                <Download className="w-3 h-3" />
                ダウンロード
              </a>
            </>
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
          value={data.text ?? ''}
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
          value={data.speed ?? 1.0}
          onChange={(e) =>
            updateNodeData({ speed: parseFloat(e.target.value) })
          }
          className="w-full accent-[#fce300]"
        />
      </div>

      {/* カナ表記モード */}
      <div className="space-y-1 p-2 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.useKanaMode ?? false}
            onChange={(e) => updateNodeData({ useKanaMode: e.target.checked })}
            className="accent-[#fce300]"
          />
          <span className="text-xs text-gray-300">カナ表記モード (Voicevox 専用)</span>
        </label>
        {data.useKanaMode && (
          <>
            <textarea
              value={data.kanaText ?? ''}
              onChange={(e) => updateNodeData({ kanaText: e.target.value })}
              placeholder="ダンボ'ール (= ぼ にアクセント) / ' でアクセント核、_ で平板、? で疑問文"
              maxLength={5000}
              rows={2}
              className={cn(nodeInputClassName, 'text-xs leading-relaxed')}
            />
            <p className="text-[10px] text-gray-500">
              AquesTalk 形式 (カタカナ + &apos; / _ / ?)。指定時はセリフよりこちらが優先されます。
            </p>
          </>
        )}
      </div>

      {/* 感情・トーン パネル (折りたたみ) */}
      <div>
        {/* ヘッダ (クリックで展開/折りたたみ) */}
        <button
          type="button"
          onClick={() => setIsEmotionPanelOpen((prev) => !prev)}
          className="w-full flex items-center justify-between py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span>感情・トーン (任意)</span>
          {isEmotionPanelOpen ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {/* 展開時のコンテンツ */}
        {isEmotionPanelOpen && (
          <div className="mt-1 space-y-2">
            {/* 6 プリセットボタン */}
            <div className="grid grid-cols-3 gap-1">
              {TTS_EMOTION_PRESETS.map((preset: TTSEmotionPreset) => {
                const isSelected = data.ttsInstructions === preset.instructions;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    title={preset.instructions}
                    onClick={() =>
                      updateNodeData({ ttsInstructions: preset.instructions })
                    }
                    disabled={isProcessing}
                    className={cn(
                      'flex flex-col items-center gap-0.5 py-1 px-0.5 rounded text-[10px] border transition-colors',
                      isSelected
                        ? 'border-[#fce300] bg-[#fce300]/10 text-[#fce300]'
                        : 'border-gray-700 bg-[#1a1a1a] text-gray-400 hover:border-gray-500 hover:text-gray-200',
                      isProcessing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span className="text-base leading-none">{preset.emoji}</span>
                    <span>{preset.labelJa}</span>
                  </button>
                );
              })}
            </div>

            {/* textarea + クリアボタン */}
            <div className="relative">
              <textarea
                value={data.ttsInstructions ?? ''}
                onChange={(e) =>
                  updateNodeData({
                    ttsInstructions: e.target.value || undefined,
                  })
                }
                disabled={isProcessing}
                placeholder="例: Whisper softly with nervous hesitation (英語推奨)"
                rows={3}
                maxLength={1000}
                className={cn(
                  nodeInputClassName,
                  'resize-none text-[10px] pr-6',
                  (data.ttsInstructions?.length ?? 0) > 900 && 'border-red-500/70'
                )}
              />
              {/* クリアボタン */}
              {data.ttsInstructions && (
                <button
                  type="button"
                  onClick={() => updateNodeData({ ttsInstructions: undefined })}
                  disabled={isProcessing}
                  className="absolute top-1 right-1 p-0.5 rounded text-gray-500 hover:text-gray-300 transition-colors"
                  title="クリア (デフォルト適用に戻す)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 文字数カウント (900 文字超で警告) */}
            {(data.ttsInstructions?.length ?? 0) > 900 && (
              <p className="text-[10px] text-red-400">
                あと {1000 - (data.ttsInstructions?.length ?? 0)} 文字
              </p>
            )}

            {/* プロバイダー非対応注記 (A 案: 常時表示) */}
            <div className="p-1.5 rounded bg-[#1a1a1a] border border-gray-700/50">
              <p className="text-[10px] text-gray-500">
                ※ instructions は OpenAI TTS のみで有効です。現在のプロバイダーでは無視されます。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* リップシンクトグル */}
      <div className="flex items-start gap-2 p-2 rounded bg-[#1a1a1a]">
        <input
          type="checkbox"
          id={`use-lip-sync-${id}`}
          checked={data.useLipSync}
          onChange={(e) => updateNodeData({ useLipSync: e.target.checked })}
          disabled={isProcessing}
          className="mt-0.5 accent-[#fce300]"
        />
        <label htmlFor={`use-lip-sync-${id}`} className="cursor-pointer">
          <div className="text-xs text-gray-200">口を動かす (リップシンク)</div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            Hedra で口パク合成 ($0.10/分)、処理に 1-3 分かかります
          </div>
        </label>
      </div>

      {/* 注意書き (条件付き) */}
      {!data.useLipSync && (
        <div className="p-2 rounded bg-[#2a2a2a] border border-yellow-600/30">
          <p className="text-[10px] text-yellow-500">
            ※ 口の動きは合成しません (TTS のみ)
          </p>
        </div>
      )}

      {data.useLipSync && (
        <div className="p-2 rounded bg-[#2a2a2a] border border-blue-600/30">
          <p className="text-[10px] text-blue-400 leading-relaxed">
            キャラの顔がはっきり映る動画を入力してください。<br />
            Hedra が顔を検出できない場合は失敗します。
          </p>
        </div>
      )}

      {/* ステータス表示 */}
      {renderStatusArea()}

      {/* 実行ボタン */}
      <button
        onClick={handleExecute}
        disabled={!canExecute}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
          canExecute
            ? data.status === 'completed'
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-[#fce300] text-black hover:bg-[#e5cd00]'
            : 'bg-[#404040] text-gray-500 cursor-not-allowed'
        )}
      >
        <Mic className="w-4 h-4" />
        {data.status === 'completed'
          ? (data.useLipSync ? 'リップシンク再合成' : '再合成する')
          : (data.useLipSync ? 'リップシンク合成する' : '合成する')}
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
