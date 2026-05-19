'use client';

import { useCallback, useRef, useState } from 'react';
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
import {
  useOmniReferenceLimits,
  OMNI_REFERENCE_LIMITS_FALLBACK,
} from '@/components/node-editor/hooks/useOmniReferenceLimits';
import { emitNodeDataUpdate } from '../utils/emit-node-data';

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
  (
    file: File,
    consentAccepted: boolean,
    signal?: AbortSignal,
  ) => Promise<OmniReferenceUploadResult>
> = {
  video: uploadOmniVideoReference,
  audio: uploadOmniAudioReference,
  image: uploadOmniImageReference,
};

interface SlotDropzoneProps {
  nodeId: string;
  slot: OmniReferenceSlot;
  mediaType: MediaKind;
  index: number;
  consentAccepted: boolean;
  onSlotChange: (index: number, slot: OmniReferenceSlot) => void;
}

const MEDIA_KIND_LABEL_JA: Record<MediaKind, string> = {
  video: '動画',
  audio: '音声',
  image: '画像',
};

function SlotDropzone({
  slot,
  mediaType,
  index,
  consentAccepted,
  onSlotChange,
}: SlotDropzoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsUploading(true);
      setErrorMessage(null);
      try {
        const result = await UPLOAD_FN[mediaType](file, consentAccepted, controller.signal);
        onSlotChange(index, {
          assetId: result.id,
          url: result.url,
          filename: file.name,
          durationSeconds: result.duration_seconds ?? undefined,
          mediaType,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          // キャンセル時はエラーメッセージを設定しない (slot は初期状態のまま)
          return;
        }
        setErrorMessage(
          err instanceof Error ? err.message : `${mediaType} のアップロードに失敗しました`,
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsUploading(false);
      }
    },
    [mediaType, consentAccepted, index, onSlotChange],
  );

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setErrorMessage(null);
  }, []);

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
  const mediaLabelJa = MEDIA_KIND_LABEL_JA[mediaType];
  const dropzoneAriaLabel = `${mediaLabelJa}参照 ${index + 1} をアップロード`;

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
          role="button"
          aria-label={dropzoneAriaLabel}
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
            <>
              <Loader2 className="w-4 h-4 text-[#fce300] animate-spin" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                aria-label={`${mediaType} スロット ${index + 1} アップロードをキャンセル`}
                data-testid={`omni-slot-${mediaType}-${index}-cancel`}
                className="mt-1 text-[10px] text-red-400 hover:text-red-300 underline pointer-events-auto"
              >
                キャンセル
              </button>
            </>
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

interface ImageDetailsSectionProps {
  imageFilled: number;
  imageSlots: OmniReferenceNodeData['imageSlots'];
  consentAccepted: boolean;
  nodeId: string;
  maxImageSlots: number;
  onSlotChange: (index: number, slot: OmniReferenceSlot) => void;
}

function ImageDetailsSection({
  imageFilled,
  imageSlots,
  consentAccepted,
  nodeId,
  maxImageSlots,
  onSlotChange,
}: ImageDetailsSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <details
      className="mt-3"
      data-testid="omni-image-details"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className="text-xs text-gray-300 font-medium cursor-pointer flex items-center gap-1"
        aria-expanded={isOpen ? 'true' : 'false'}
        data-testid="omni-image-details-summary"
      >
        <ImageIcon className="w-3 h-3" />
        Image ({imageFilled}/{maxImageSlots})
      </summary>
      <div className="grid grid-cols-4 gap-1.5 mt-2">
        {imageSlots.map((slot, i) => (
          <SlotDropzone
            key={`image-${i}`}
            nodeId={nodeId}
            slot={slot}
            mediaType="image"
            index={i}
            consentAccepted={consentAccepted}
            onSlotChange={onSlotChange}
          />
        ))}
      </div>
    </details>
  );
}

export function OmniReferenceNode({ data, selected, id }: OmniReferenceNodeProps) {
  // 制約値は API から取得 (取得前/失敗時は fallback)。
  const { data: limitsData } = useOmniReferenceLimits();
  const limits = limitsData ?? OMNI_REFERENCE_LIMITS_FALLBACK;
  const maxVideoTotalSeconds = limits.max_video_total_seconds;
  const maxAudioTotalSeconds = limits.max_audio_total_seconds;
  const maxImageSlots = limits.max_image_reference_asset_ids;

  const updateNodeData = useCallback(
    (updates: Partial<OmniReferenceNodeData>) => {
      emitNodeDataUpdate<OmniReferenceNodeData>(id, updates);
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
          max={maxVideoTotalSeconds}
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
          max={maxAudioTotalSeconds}
          label="audio 合計 (PiAPI 上限)"
          testId="omni-audio-progress"
        />
      </section>

      {/* Image セクション (折り畳み、初期 open) */}
      <ImageDetailsSection
        imageFilled={imageFilled}
        imageSlots={data.imageSlots}
        consentAccepted={data.consentAccepted}
        nodeId={id}
        maxImageSlots={maxImageSlots}
        onSlotChange={updateImageSlot}
      />

      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.OMNI_REFERENCE_OUTPUT}
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
