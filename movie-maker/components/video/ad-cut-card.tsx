"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  X,
  Edit2,
  Check,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RangeSlider } from "@/components/ui/range-slider";
import { AdCut } from "@/lib/api/client";
import { formatTime } from "@/lib/duration-adjuster";

// 選択された動画情報
export interface SelectedVideo {
  id: string;
  type: "scene" | "storyboard" | "uploaded";
  videoUrl: string;
  thumbnailUrl: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
}

// 編集可能なカット情報
export interface EditableCut extends AdCut {
  video: SelectedVideo | null;
  /** 生成された画像URL（動画生成前の一時保存用） */
  generatedImageUrl?: string;
  /** 生成に使用したプロンプト（日本語） */
  generatedPromptJa?: string;
  /** 生成に使用したプロンプト（英語） */
  generatedPromptEn?: string;
}

interface AdCutCardProps {
  cut: EditableCut;
  index: number;
  totalCuts: number;
  /** カットの開始時間（秒）- TIME列表示用 */
  startTime?: number;
  /** CM全体の目標尺（秒）- TIME列表示の有無に使用 */
  targetDuration?: number | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSelectExisting: () => void;
  onGenerateNew: () => void;
  onRemoveVideo: () => void;
  onUpdateDescription: (descriptionJa: string) => void;
  onUpdateDuration: (duration: number) => void;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
  onUpdateDialogue: (dialogue: string) => void;
  onUpdateSoundEffect: (soundEffect: string) => void;
  canDelete: boolean;
  /** 保存された画像から動画を生成 */
  onGenerateVideoFromImage?: () => void;
  /** 生成された画像をクリア */
  onClearGeneratedImage?: () => void;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 30];

export function AdCutCard({
  cut,
  index,
  totalCuts,
  startTime,
  targetDuration,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSelectExisting,
  onGenerateNew,
  onRemoveVideo,
  onGenerateVideoFromImage,
  onClearGeneratedImage,
  onUpdateDescription,
  onUpdateDuration,
  onTrimChange,
  onUpdateDialogue,
  onUpdateSoundEffect,
  canDelete,
}: AdCutCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(cut.description_ja);
  const [isEditingDialogue, setIsEditingDialogue] = useState(false);
  const [editedDialogue, setEditedDialogue] = useState(cut.dialogue || "");
  const [isEditingSoundEffect, setIsEditingSoundEffect] = useState(false);
  const [editedSoundEffect, setEditedSoundEffect] = useState(cut.sound_effect || "");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const animationRef = useRef<number | null>(null);

  const handleSaveDescription = () => {
    onUpdateDescription(editedDescription);
    setIsEditingDescription(false);
  };

  const handleSaveDialogue = () => {
    onUpdateDialogue(editedDialogue);
    setIsEditingDialogue(false);
  };

  const handleCancelDialogue = () => {
    setEditedDialogue(cut.dialogue || "");
    setIsEditingDialogue(false);
  };

  const handleSaveSoundEffect = () => {
    onUpdateSoundEffect(editedSoundEffect);
    setIsEditingSoundEffect(false);
  };

  const handleCancelSoundEffect = () => {
    setEditedSoundEffect(cut.sound_effect || "");
    setIsEditingSoundEffect(false);
  };

  const handleCancelEdit = () => {
    setEditedDescription(cut.description_ja);
    setIsEditingDescription(false);
  };

  // 動画が選択されているかどうか
  const hasVideoAssigned = cut.video !== null;
  const videoDurationMismatch =
    cut.video && cut.video.originalDuration < cut.duration;

  // トリム範囲の変更
  const handleTrimRangeChange = useCallback(
    (range: [number, number]) => {
      onTrimChange(range[0], range[1]);
    },
    [onTrimChange]
  );

  // スライダー上のホバー位置に動画をシーク
  const handleHoverTime = useCallback((time: number) => {
    if (!videoRef.current) return;

    // 再生中の場合は一時停止
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }

    setIsHovering(true);
    videoRef.current.currentTime = time;
  }, [isPlaying]);

  // ホバー終了時
  const handleHoverEnd = useCallback(() => {
    setIsHovering(false);
    // 開始位置に戻す
    if (videoRef.current && cut.video) {
      videoRef.current.currentTime = cut.video.trimStart;
    }
  }, [cut.video]);

  // プレビュー再生/停止
  const handlePreview = useCallback(() => {
    if (!videoRef.current || !cut.video) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    // 開始位置にシーク
    videoRef.current.currentTime = cut.video.trimStart;
    videoRef.current.play();
    setIsPlaying(true);

    // 終了位置で停止するためのチェック
    const checkTime = () => {
      if (!videoRef.current || !cut.video) return;

      if (videoRef.current.currentTime >= cut.video.trimEnd) {
        videoRef.current.pause();
        setIsPlaying(false);
        animationRef.current = null;
        return;
      }

      animationRef.current = requestAnimationFrame(checkTime);
    };

    animationRef.current = requestAnimationFrame(checkTime);
  }, [isPlaying, cut.video]);

  // 動画終了時
  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  // トリム範囲から使用秒数を計算
  const usedDuration = cut.video
    ? cut.video.trimEnd - cut.video.trimStart
    : 0;

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* ヘッダー: カット番号、シーンタイプ、操作ボタン */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          {/* 並べ替えボタン */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onMoveUp}
              disabled={index === 0}
              className="h-7 w-7 p-0"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onMoveDown}
              disabled={index === totalCuts - 1}
              className="h-7 w-7 p-0"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>

          {/* カット番号とシーンタイプ */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">カット {index + 1}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
              {cut.scene_type_label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 秒数選択 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">秒数:</span>
            <select
              value={cut.duration}
              onChange={(e) => onUpdateDuration(Number(e.target.value))}
              className={cn(
                "px-2 py-1 rounded border bg-background text-xs",
                "focus:outline-none focus:ring-2 focus:ring-primary"
              )}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}秒
                </option>
              ))}
            </select>
          </div>

          {/* 削除ボタン */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={!canDelete}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title={canDelete ? "カットを削除" : "最後のカットは削除できません"}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 5カラムレイアウト: TIME | 動画 | 脚本 | セリフ | 効果音/SE */}
      <div className="flex">
        {/* TIME列（常に表示）- 起点〜終点 */}
        {startTime !== undefined && (
          <div className="w-24 flex-shrink-0 border-r bg-muted/10 p-2 flex flex-col items-center justify-center">
            <div className="text-xs text-muted-foreground mb-1">TIME</div>
            <div className="text-sm font-mono font-semibold text-primary">
              {formatTime(startTime)}
            </div>
            <div className="text-xs text-muted-foreground my-0.5">↓</div>
            <div className="text-sm font-mono font-semibold text-primary">
              {formatTime(startTime + cut.duration)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              ({cut.duration}秒)
            </div>
          </div>
        )}

        {/* 動画クリップ（固定幅） */}
        <div className="w-40 flex-shrink-0 border-r bg-muted/20">
          <div
            className={cn(
              "aspect-[9/16] relative flex items-center justify-center",
              "bg-zinc-900/50"
            )}
          >
            {hasVideoAssigned && cut.video ? (
              <>
                {/* 実際の動画要素（ホバープレビュー用） */}
                <video
                  ref={videoRef}
                  src={cut.video.videoUrl}
                  poster={cut.video.thumbnailUrl || undefined}
                  preload="metadata"
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  onEnded={handleVideoEnded}
                />
                {/* 再生アイコンオーバーレイ */}
                <button
                  onClick={handlePreview}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                    {isPlaying ? (
                      <Pause className="w-6 h-6 text-zinc-900" />
                    ) : (
                      <Play className="w-6 h-6 text-zinc-900 ml-0.5" />
                    )}
                  </div>
                </button>
                {/* 使用秒数バッジ */}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-blue-500/90 text-white text-xs font-medium">
                  使用: {usedDuration.toFixed(1)}秒
                </div>
                {/* 元動画の長さバッジ */}
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs">
                  全体: {cut.video.originalDuration.toFixed(1)}秒
                </div>
                {/* 再生中/シーク中インジケーター */}
                {isPlaying && (
                  <div className="absolute top-2 left-2 right-2 bg-blue-500 text-white text-xs text-center rounded px-2 py-0.5">
                    プレビュー中
                  </div>
                )}
                {isHovering && !isPlaying && (
                  <div className="absolute top-2 left-2 right-2 bg-yellow-500 text-black text-xs text-center rounded px-2 py-0.5">
                    シーク中
                  </div>
                )}
                {/* 警告バッジ */}
                {videoDurationMismatch && !isPlaying && !isHovering && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500/90 text-white text-xs">
                    ⚠️ 短い
                  </div>
                )}
              </>
            ) : cut.generatedImageUrl ? (
              // 生成された画像がある場合
              <div className="relative w-full h-full">
                <img
                  src={cut.generatedImageUrl}
                  alt="生成画像"
                  className="w-full h-full object-cover"
                />
                {/* 生成画像バッジ */}
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-green-500/90 text-white text-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  生成済み
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 opacity-50" />
                </div>
                <span className="text-xs text-center">動画未選択</span>
              </div>
            )}
          </div>

          {/* トリムスライダー（動画が選択されている場合のみ表示） */}
          {hasVideoAssigned && cut.video && (
            <div className="p-3 border-b bg-zinc-900/30">
              <RangeSlider
                min={0}
                max={cut.video.originalDuration}
                step={0.1}
                minRange={0.5}
                value={[cut.video.trimStart, cut.video.trimEnd]}
                onChange={handleTrimRangeChange}
                formatLabel={(v) => `${v.toFixed(1)}s`}
                onHoverTime={handleHoverTime}
                onHoverEnd={handleHoverEnd}
              />
            </div>
          )}

          {/* 動画選択ボタン */}
          <div className="p-2">
            {hasVideoAssigned ? (
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectExisting}
                  className="flex-1 text-xs h-8"
                >
                  変更
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemoveVideo}
                  className="text-xs h-8 px-2 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : cut.generatedImageUrl ? (
              // 生成画像がある場合のボタン
              <div className="flex gap-1.5">
                {onGenerateVideoFromImage && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onGenerateVideoFromImage}
                    className="flex-1 text-xs h-8 gap-1 bg-green-600 hover:bg-green-700"
                  >
                    <Play className="w-3.5 h-3.5" />
                    動画生成
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectExisting}
                  className={onGenerateVideoFromImage ? "text-xs h-8 px-2" : "flex-1 text-xs h-8 gap-1"}
                  title="既存動画を選択"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {!onGenerateVideoFromImage && "既存"}
                </Button>
                {onClearGeneratedImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearGeneratedImage}
                    className="text-xs h-8 px-2 text-muted-foreground hover:text-destructive"
                    title="画像をクリア"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectExisting}
                  className="flex-1 text-xs h-8 gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  既存
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGenerateNew}
                  className="flex-1 text-xs h-8 gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  新規
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 脚本テキスト（大きめ） */}
        <div className="flex-[3] min-w-0 p-3 border-r">
          <div className="h-full flex flex-col">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              脚本 / シーン内容
            </h4>

            {isEditingDescription ? (
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded border bg-background text-sm resize-none min-h-[100px]",
                    "focus:outline-none focus:ring-2 focus:ring-primary"
                  )}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="text-xs"
                  >
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveDescription}
                    className="text-xs"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingDescription(true)}
                className={cn(
                  "flex-1 p-2 rounded border bg-muted/20 text-sm cursor-pointer min-h-[100px]",
                  "hover:bg-muted/40 hover:border-primary/30 transition-colors group"
                )}
              >
                <div className="flex items-start justify-between h-full">
                  <p className="flex-1 whitespace-pre-wrap leading-relaxed text-xs">
                    {cut.description_ja || (
                      <span className="text-muted-foreground italic">
                        クリックして入力...
                      </span>
                    )}
                  </p>
                  <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* セリフ（中サイズ） */}
        <div className="flex-[2] min-w-0 p-3 border-r">
          <div className="h-full flex flex-col">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              セリフ
            </h4>

            {isEditingDialogue ? (
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  value={editedDialogue}
                  onChange={(e) => setEditedDialogue(e.target.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded border bg-background text-sm resize-none min-h-[100px]",
                    "focus:outline-none focus:ring-2 focus:ring-primary"
                  )}
                  autoFocus
                  placeholder="セリフを入力..."
                />
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelDialogue}
                    className="text-xs h-7 px-2"
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveDialogue}
                    className="text-xs h-7 px-2"
                  >
                    <Check className="w-3 h-3 mr-0.5" />
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingDialogue(true)}
                className={cn(
                  "flex-1 p-2 rounded border bg-muted/20 text-sm cursor-pointer min-h-[100px]",
                  "hover:bg-muted/40 hover:border-primary/30 transition-colors group"
                )}
              >
                <div className="flex items-start justify-between h-full">
                  <p className="flex-1 whitespace-pre-wrap leading-relaxed text-xs">
                    {cut.dialogue || (
                      <span className="text-muted-foreground italic">
                        クリックして入力...
                      </span>
                    )}
                  </p>
                  <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 効果音/SE（小さめ） */}
        <div className="flex-1 min-w-0 p-3">
          <div className="h-full flex flex-col">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              SE
            </h4>

            {isEditingSoundEffect ? (
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  value={editedSoundEffect}
                  onChange={(e) => setEditedSoundEffect(e.target.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded border bg-background text-xs resize-none min-h-[80px]",
                    "focus:outline-none focus:ring-2 focus:ring-primary"
                  )}
                  autoFocus
                  placeholder="SE入力..."
                />
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelSoundEffect}
                    className="text-xs h-6 px-1.5"
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveSoundEffect}
                    className="text-xs h-6 px-1.5"
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingSoundEffect(true)}
                className={cn(
                  "flex-1 p-2 rounded border bg-muted/20 cursor-pointer min-h-[80px]",
                  "hover:bg-muted/40 hover:border-primary/30 transition-colors group"
                )}
              >
                <div className="flex items-start justify-between h-full">
                  <p className="flex-1 whitespace-pre-wrap leading-relaxed text-xs">
                    {cut.sound_effect || (
                      <span className="text-muted-foreground italic text-[10px]">
                        クリック...
                      </span>
                    )}
                  </p>
                  <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
