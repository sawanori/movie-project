'use client';

import { useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Layers, Upload, X, Loader2, Film, Music, Image as ImageIcon } from 'lucide-react';
import { useDropzone, type Accept } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type {
  OmniReferenceNodeData,
  OmniReferenceSlot,
} from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';
import {
  uploadOmniVideoReference,
  uploadOmniAudioReference,
  uploadOmniImageReference,
  type OmniReferenceUploadResult,
} from '@/lib/api/client';

const MAX_VIDEO_TOTAL_SECONDS = 15.4;
const MAX_AUDIO_TOTAL_SECONDS = 15.0;

type MediaKind = 'video' | 'audio' | 'image';

interface OmniReferenceNodeProps extends NodeProps {
  data: OmniReferenceNodeData;
  selected: boolean;
}

const ACCEPT_MAP: Record<MediaKind, Accept> = {
  video: { 'video/*': ['.mp4', '.mov', '.webm'] },
  audio: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac'] },
  image: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
};

const UPLOAD_FN: Record<
  MediaKind,
  (file: File, consentAccepted: boolean) => Promise<OmniReferenceUploadResult>
> = {
  video: uploadOmniVideoReference,
  audio: uploadOmniAudioReference,
  image: uploadOmniImageReference,
};

function emitNodeDataUpdate(nodeId: string, updates: Partial<OmniReferenceNodeData>): void {
  const event = new CustomEvent('nodeDataUpdate', {
    detail: { nodeId, updates },
  });
  window.dispatchEvent(event);
}

interface SlotDropzoneProps {
  nodeId: string;
  slot: OmniReferenceSlot;
  mediaType: MediaKind;
  index: number;
  consentAccepted: boolean;
  onSlotChange: (index: number, slot: OmniReferenceSlot) => void;
}

function SlotDropzone({
  slot,
  mediaType,
  index,
  consentAccepted,
  onSlotChange,
}: SlotDropzoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setErrorMessage(null);
      try {
        const result = await UPLOAD_FN[mediaType](file, consentAccepted);
        onSlotChange(index, {
          assetId: result.id,
          url: result.url,
          filename: file.name,
          durationSeconds: result.duration_seconds ?? undefined,
          mediaType,
        });
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : `${mediaType} のアップロードに失敗しました`,
        );
      } finally {
        setIsUploading(false);
      }
    },
    [mediaType, consentAccepted, index, onSlotChange],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT_MAP[mediaType],
    maxFiles: 1,
    disabled: isUploading || !consentAccepted,
  });

  const handleClear = useCallback(() => {
    setErrorMessage(null);
    onSlotChange(index, {
      assetId: null,
      mediaType,
    });
  }, [index, mediaType, onSlotChange]);

  const Icon =
    mediaType === 'video' ? Film : mediaType === 'audio' ? Music : ImageIcon;

  const hasAsset = slot.assetId !== null;

  return (
    <div
      className="rounded border border-[#404040] bg-[#1a1a1a] p-2"
      data-testid={`omni-slot-${mediaType}-${index}`}
    >
      {hasAsset ? (
        <div className="flex items-center gap-2">
          <Icon className="w-3 h-3 text-[#fce300] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] text-white truncate"
              title={slot.filename}
              data-testid={`omni-slot-${mediaType}-${index}-filename`}
            >
              {slot.filename ?? 'asset'}
            </p>
            {typeof slot.durationSeconds === 'number' && (
              <p
                className="text-[10px] text-gray-400"
                data-testid={`omni-slot-${mediaType}-${index}-duration`}
              >
                {slot.durationSeconds.toFixed(1)}s
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            aria-label={`${mediaType} スロット ${index + 1} をクリア`}
            className="p-1 bg-red-500/80 hover:bg-red-500 rounded-full"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          data-testid={`omni-dropzone-${mediaType}-${index}`}
          className={cn(
            'border border-dashed rounded flex flex-col items-center justify-center cursor-pointer p-2 text-center min-h-[56px]',
            isDragActive
              ? 'border-[#fce300] bg-[#fce300]/10'
              : 'border-[#404040] hover:border-[#606060]',
            (!consentAccepted || isUploading) && 'pointer-events-none opacity-50',
          )}
        >
          <input {...getInputProps()} aria-label={`${mediaType} スロット ${index + 1} ファイル選択`} />
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
          ) : (
            <>
              <Upload className="w-4 h-4 text-gray-500 mb-1" />
              <span className="text-[10px] text-gray-500">
                {mediaType} {index + 1}
              </span>
            </>
          )}
        </div>
      )}
      {errorMessage && (
        <p
          className="mt-1 text-[10px] text-red-400"
          data-testid={`omni-slot-${mediaType}-${index}-error`}
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  testId: string;
}

function ProgressBar({ value, max, label, testId }: ProgressBarProps) {
  const over = value > max;
  const percent = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="mt-1" data-testid={testId} data-over={over ? 'true' : 'false'}>
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-400">{label}</span>
        <span
          className={cn('font-mono', over ? 'text-red-400 font-bold' : 'text-gray-300')}
          data-testid={`${testId}-value`}
        >
          {value.toFixed(1)} / {max.toFixed(1)}s
        </span>
      </div>
      <div className="h-1 bg-[#1a1a1a] rounded">
        <div
          className={cn('h-full rounded', over ? 'bg-red-500' : 'bg-[#fce300]')}
          style={{ width: `${percent}%` }}
        />
      </div>
      {over && (
        <p className="text-[10px] text-red-400 mt-0.5" data-testid={`${testId}-warning`}>
          上限 {max.toFixed(1)}s を超過しています
        </p>
      )}
    </div>
  );
}

export function OmniReferenceNode({ data, selected, id }: OmniReferenceNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<OmniReferenceNodeData>) => {
      emitNodeDataUpdate(id, updates);
    },
    [id],
  );

  const handleConsentChange = useCallback(
    (checked: boolean) => {
      updateNodeData({ consentAccepted: checked });
    },
    [updateNodeData],
  );

  const updateVideoSlot = useCallback(
    (index: number, slot: OmniReferenceSlot) => {
      const next = [...data.videoSlots] as OmniReferenceNodeData['videoSlots'];
      next[index] = slot;
      updateNodeData({ videoSlots: next });
    },
    [data.videoSlots, updateNodeData],
  );

  const updateAudioSlot = useCallback(
    (index: number, slot: OmniReferenceSlot) => {
      const next = [...data.audioSlots] as OmniReferenceNodeData['audioSlots'];
      next[index] = slot;
      updateNodeData({ audioSlots: next });
    },
    [data.audioSlots, updateNodeData],
  );

  const updateImageSlot = useCallback(
    (index: number, slot: OmniReferenceSlot) => {
      const next = [...data.imageSlots];
      next[index] = slot;
      updateNodeData({ imageSlots: next });
    },
    [data.imageSlots, updateNodeData],
  );

  const videoTotal = data.videoSlots.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0,
  );
  const audioTotal = data.audioSlots.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0,
  );
  const imageFilled = data.imageSlots.filter((s) => s.assetId !== null).length;

  return (
    <BaseNode
      title="Omni Reference"
      icon={<Layers className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[320px]"
    >
      {/* 著作権同意 */}
      <label
        className={cn(
          'flex items-start gap-2 p-2 rounded border text-[11px] cursor-pointer',
          data.consentAccepted
            ? 'border-[#404040] bg-[#1a1a1a] text-gray-300'
            : 'border-yellow-500/60 bg-yellow-500/10 text-yellow-200',
        )}
      >
        <input
          type="checkbox"
          checked={data.consentAccepted}
          onChange={(e) => handleConsentChange(e.target.checked)}
          aria-label="著作権同意"
          data-testid="omni-consent-checkbox"
          className="mt-0.5"
        />
        <span>
          アップロードする素材の権利を保有、または利用許諾を得ています
          {!data.consentAccepted && (
            <span className="block mt-0.5 font-semibold">
              ※ 同意するとアップロードが有効化されます
            </span>
          )}
        </span>
      </label>

      {/* Video セクション */}
      <section className="mt-3">
        <div className="flex items-center gap-1 mb-1">
          <Film className="w-3 h-3 text-gray-300" />
          <h4 className="text-xs text-gray-300 font-medium">Video (3 枠)</h4>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {data.videoSlots.map((slot, i) => (
            <SlotDropzone
              key={`video-${i}`}
              nodeId={id}
              slot={slot}
              mediaType="video"
              index={i}
              consentAccepted={data.consentAccepted}
              onSlotChange={updateVideoSlot}
            />
          ))}
        </div>
        <ProgressBar
          value={videoTotal}
          max={MAX_VIDEO_TOTAL_SECONDS}
          label="video 合計"
          testId="omni-video-progress"
        />
      </section>

      {/* Audio セクション */}
      <section className="mt-3">
        <div className="flex items-center gap-1 mb-1">
          <Music className="w-3 h-3 text-gray-300" />
          <h4 className="text-xs text-gray-300 font-medium">Audio (3 枠)</h4>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {data.audioSlots.map((slot, i) => (
            <SlotDropzone
              key={`audio-${i}`}
              nodeId={id}
              slot={slot}
              mediaType="audio"
              index={i}
              consentAccepted={data.consentAccepted}
              onSlotChange={updateAudioSlot}
            />
          ))}
        </div>
        <ProgressBar
          value={audioTotal}
          max={MAX_AUDIO_TOTAL_SECONDS}
          label="audio 合計 (PiAPI 上限)"
          testId="omni-audio-progress"
        />
      </section>

      {/* Image セクション (折り畳み) */}
      <details className="mt-3" data-testid="omni-image-details">
        <summary className="text-xs text-gray-300 font-medium cursor-pointer flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          Image ({imageFilled}/8)
        </summary>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {data.imageSlots.map((slot, i) => (
            <SlotDropzone
              key={`image-${i}`}
              nodeId={id}
              slot={slot}
              mediaType="image"
              index={i}
              consentAccepted={data.consentAccepted}
              onSlotChange={updateImageSlot}
            />
          ))}
        </div>
      </details>

      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.OMNI_REFERENCE_OUTPUT}
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
