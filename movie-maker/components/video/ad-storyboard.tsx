"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, Play, RefreshCw, AlertCircle, Clock, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdScriptResponse } from "@/lib/api/client";
import { AdCutCard, EditableCut, SelectedVideo } from "./ad-cut-card";
import { AspectRatio } from "@/lib/types/video";
import {
  adjustDurationsOnChange,
  calculateStartTimes,
  validateDurationChange,
} from "@/lib/duration-adjuster";
import { StoryboardPDFExport } from "@/components/pdf";

interface AdStoryboardProps {
  script: AdScriptResponse;
  cuts: EditableCut[];
  aspectRatio: AspectRatio;
  /** CM全体の目標尺（秒）- 脚本確認時に設定され、ここでは変更不可 */
  targetDuration: number | null;
  onBack: () => void;
  onNext: (cuts: EditableCut[]) => void;
  onSelectVideo: (cutId: string) => void;
  onGenerateVideo: (cutId: string, descriptionEn: string) => void;
  onRegenerate: () => void;
  onCutsChange: (cuts: EditableCut[] | ((prev: EditableCut[]) => EditableCut[])) => void;
  /** 生成済み画像から動画を生成 */
  onGenerateVideoFromImage?: (cutId: string, imageUrl: string) => void;
  /** CM全体の目標尺を変更 */
  onTargetDurationChange?: (duration: number) => void;
}

export function AdStoryboard({
  script,
  cuts,
  targetDuration,
  onBack,
  onNext,
  onSelectVideo,
  onGenerateVideo,
  onRegenerate,
  onCutsChange,
  onGenerateVideoFromImage,
  onTargetDurationChange,
}: AdStoryboardProps) {
  const [isEditingTargetDuration, setIsEditingTargetDuration] = useState(false);

  // 合計秒数を計算
  const totalDuration = useMemo(
    () => cuts.reduce((sum, cut) => sum + cut.duration, 0),
    [cuts]
  );

  // 各カットの累積開始時間を計算（MM:SS表示用）
  const startTimes = useMemo(() => calculateStartTimes(cuts), [cuts]);

  // 動画未選択のカット数
  const unassignedCount = useMemo(
    () => cuts.filter((cut) => cut.video === null).length,
    [cuts]
  );

  // 全カットに動画が割り当てられているか
  const allAssigned = unassignedCount === 0;

  // プレビュー可能なカット（動画が割り当てられているもの）
  const previewableCuts = useMemo(
    () => cuts.filter((cut) => cut.video !== null),
    [cuts]
  );

  // カットの並べ替え（上へ）
  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const newCuts = [...cuts];
    [newCuts[index - 1], newCuts[index]] = [newCuts[index], newCuts[index - 1]];
    // cut_numberを更新
    onCutsChange(newCuts.map((cut, i) => ({ ...cut, cut_number: i + 1 })));
  }, [cuts, onCutsChange]);

  // カットの並べ替え（下へ）
  const handleMoveDown = useCallback((index: number) => {
    if (index === cuts.length - 1) return;
    const newCuts = [...cuts];
    [newCuts[index], newCuts[index + 1]] = [newCuts[index + 1], newCuts[index]];
    // cut_numberを更新
    onCutsChange(newCuts.map((cut, i) => ({ ...cut, cut_number: i + 1 })));
  }, [cuts, onCutsChange]);

  // カットの削除（削除分の秒数を最後のカットに加算）
  const handleDeleteCut = useCallback((index: number) => {
    if (cuts.length <= 1) return; // 最低1カットは必要
    const deletedDuration = cuts[index].duration;
    let newCuts = cuts.filter((_, i) => i !== index);
    newCuts = newCuts.map((cut, i) => ({ ...cut, cut_number: i + 1 }));
    // CM尺が設定されている場合は削除分を最後のカットに加算
    if (targetDuration && newCuts.length > 0) {
      const lastIdx = newCuts.length - 1;
      newCuts[lastIdx] = {
        ...newCuts[lastIdx],
        duration: newCuts[lastIdx].duration + deletedDuration,
      };
    }
    onCutsChange(newCuts);
  }, [cuts, targetDuration, onCutsChange]);

  // カットの追加（最後のカットから秒数を分けて新カットに割り当て）
  const handleAddCut = useCallback(() => {
    let newCuts = [...cuts];
    const lastCut = newCuts[newCuts.length - 1];

    if (targetDuration && lastCut) {
      // 最後のカットの秒数を分割（半分を新カットに）
      const splitDuration = Math.max(1, Math.floor(lastCut.duration / 2));
      const remainDuration = Math.max(1, lastCut.duration - splitDuration);
      newCuts[newCuts.length - 1] = { ...lastCut, duration: remainDuration };

      const newCut: EditableCut = {
        id: `cut_new_${Date.now()}`,
        cut_number: cuts.length + 1,
        scene_type: "custom",
        scene_type_label: "カスタム",
        description_ja: "",
        description_en: "",
        duration: splitDuration,
        dialogue: "",
        sound_effect: "",
        video: null,
      };
      newCuts = [...newCuts, newCut];
    } else {
      const newCut: EditableCut = {
        id: `cut_new_${Date.now()}`,
        cut_number: cuts.length + 1,
        scene_type: "custom",
        scene_type_label: "カスタム",
        description_ja: "",
        description_en: "",
        duration: 5,
        dialogue: "",
        sound_effect: "",
        video: null,
      };
      newCuts = [...newCuts, newCut];
    }
    onCutsChange(newCuts);
  }, [cuts, targetDuration, onCutsChange]);

  // カットの説明を更新
  const handleUpdateDescription = useCallback(
    (cutId: string, descriptionJa: string) => {
      onCutsChange(
        cuts.map((cut) =>
          cut.id === cutId ? { ...cut, description_ja: descriptionJa } : cut
        )
      );
    },
    [cuts, onCutsChange]
  );

  // カットのセリフを更新
  const handleUpdateDialogue = useCallback(
    (cutId: string, dialogue: string) => {
      onCutsChange(
        cuts.map((cut) =>
          cut.id === cutId ? { ...cut, dialogue } : cut
        )
      );
    },
    [cuts, onCutsChange]
  );

  // カットの効果音/SEを更新
  const handleUpdateSoundEffect = useCallback(
    (cutId: string, soundEffect: string) => {
      onCutsChange(
        cuts.map((cut) =>
          cut.id === cutId ? { ...cut, sound_effect: soundEffect } : cut
        )
      );
    },
    [cuts, onCutsChange]
  );

  // カットの秒数を更新（CM尺設定時は他のカットも自動調整）
  const handleUpdateDuration = useCallback(
    (cutId: string, newDuration: number) => {
      onCutsChange((prev: EditableCut[]) => {
        if (targetDuration) {
          const validation = validateDurationChange(prev, cutId, newDuration, targetDuration);
          const adjustedDuration = validation.adjustedDuration ?? newDuration;
          return adjustDurationsOnChange(prev, cutId, adjustedDuration, targetDuration);
        } else {
          return prev.map((cut) => (cut.id === cutId ? { ...cut, duration: newDuration } : cut));
        }
      });
    },
    [targetDuration, onCutsChange]
  );

  // 動画を削除
  const handleRemoveVideo = useCallback((cutId: string) => {
    onCutsChange(
      cuts.map((cut) => (cut.id === cutId ? { ...cut, video: null } : cut))
    );
  }, [cuts, onCutsChange]);

  // トリム範囲を更新
  const handleTrimChange = useCallback(
    (cutId: string, trimStart: number, trimEnd: number) => {
      onCutsChange(
        cuts.map((cut) =>
          cut.id === cutId && cut.video
            ? {
                ...cut,
                video: {
                  ...cut.video,
                  trimStart,
                  trimEnd,
                },
              }
            : cut
        )
      );
    },
    [cuts, onCutsChange]
  );

  // 生成画像をクリア
  const handleClearGeneratedImage = useCallback((cutId: string) => {
    onCutsChange(
      cuts.map((cut) =>
        cut.id === cutId
          ? {
              ...cut,
              generatedImageUrl: undefined,
              generatedPromptJa: undefined,
              generatedPromptEn: undefined,
            }
          : cut
      )
    );
  }, [cuts, onCutsChange]);

  // 理論ラベルの色を取得
  const theoryColor = useMemo(() => {
    switch (script.theory) {
      case "aida":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "pasona":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "kishoutenketsu":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "storytelling":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
    }
  }, [script.theory]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              CM構成（全{cuts.length}カット / 合計{totalDuration}秒）
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="gap-1 text-muted-foreground"
            >
              <RefreshCw className="w-4 h-4" />
              再生成
            </Button>
            <StoryboardPDFExport
              theoryLabel={script.theory_label}
              totalDuration={totalDuration}
              cuts={cuts}
              scriptId={script.id}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", theoryColor)}>
            {script.theory_label}
          </span>

          {/* CM尺表示（クリックで変更可能） */}
          {targetDuration && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              {isEditingTargetDuration ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    autoFocus
                    min={1}
                    max={600}
                    defaultValue={targetDuration}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = Math.min(600, Math.max(1, Number((e.target as HTMLInputElement).value) || targetDuration));
                        onTargetDurationChange?.(val);
                        setIsEditingTargetDuration(false);
                      } else if (e.key === "Escape") {
                        setIsEditingTargetDuration(false);
                      }
                    }}
                    onBlur={(e) => {
                      const val = Math.min(600, Math.max(1, Number(e.target.value) || targetDuration));
                      onTargetDurationChange?.(val);
                      setIsEditingTargetDuration(false);
                    }}
                    className="w-16 text-sm font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-muted-foreground">秒</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTargetDuration(true)}
                  className="group flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {targetDuration}秒CM
                  <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              {totalDuration !== targetDuration && (
                <span className="text-xs text-amber-500">
                  （現在: {totalDuration}秒）
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* カットリスト */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="space-y-4 max-w-6xl mx-auto">
          {cuts.map((cut, index) => (
            <AdCutCard
              key={cut.id}
              cut={cut}
              index={index}
              totalCuts={cuts.length}
              startTime={startTimes[index]}
              targetDuration={targetDuration}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onDelete={() => handleDeleteCut(index)}
              onSelectExisting={() => onSelectVideo(cut.id)}
              onGenerateNew={() => onGenerateVideo(cut.id, cut.description_en)}
              onRemoveVideo={() => handleRemoveVideo(cut.id)}
              onUpdateDescription={(desc) => handleUpdateDescription(cut.id, desc)}
              onUpdateDuration={(dur) => handleUpdateDuration(cut.id, dur)}
              onTrimChange={(start, end) => handleTrimChange(cut.id, start, end)}
              onUpdateDialogue={(dialogue) => handleUpdateDialogue(cut.id, dialogue)}
              onUpdateSoundEffect={(se) => handleUpdateSoundEffect(cut.id, se)}
              canDelete={cuts.length > 1}
              onGenerateVideoFromImage={
                cut.generatedImageUrl && onGenerateVideoFromImage
                  ? () => onGenerateVideoFromImage(cut.id, cut.generatedImageUrl!)
                  : undefined
              }
              onClearGeneratedImage={() => handleClearGeneratedImage(cut.id)}
            />
          ))}

          {/* カット追加ボタン */}
          <Button
            variant="outline"
            onClick={handleAddCut}
            className="w-full gap-2 border-dashed"
          >
            <Plus className="w-4 h-4" />
            カットを追加
          </Button>
        </div>
      </div>

      {/* フッター: プレビュー・警告・次へボタン */}
      <div className="px-4 py-3 border-t bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto">
          {/* 警告 */}
          {unassignedCount > 0 && (
            <div className="flex items-center gap-2 text-amber-600 mb-3">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">
                未選択のカットが{unassignedCount}つあります
              </span>
            </div>
          )}

          {/* プレビュー情報 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <span>プレビュー可能: {previewableCuts.length}カット</span>
            {previewableCuts.length > 0 && (
              <Button variant="ghost" size="sm" className="gap-1 h-7">
                <Play className="w-3 h-3" />
                プレビュー
              </Button>
            )}
          </div>

          {/* ボタン */}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              戻る
            </Button>
            <Button
              onClick={() => onNext(cuts)}
              disabled={!allAssigned}
              className="flex-1"
            >
              {allAssigned
                ? "広告を作成"
                : `動画を選択してください（残り${unassignedCount}カット）`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 外部からカットに動画を割り当てるためのヘルパー関数をエクスポート
export type { EditableCut, SelectedVideo };
