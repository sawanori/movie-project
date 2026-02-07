"use client";

import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, Play, RefreshCw, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdScriptResponse } from "@/lib/api/client";
import { AdCutCard, EditableCut, SelectedVideo } from "./ad-cut-card";
import { AspectRatio } from "@/lib/types/video";
import {
  distributeDurations,
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
  onCutsChange: (cuts: EditableCut[]) => void;
  /** 生成済み画像から動画を生成 */
  onGenerateVideoFromImage?: (cutId: string, imageUrl: string) => void;
}

export function AdStoryboard({
  script,
  cuts,
  aspectRatio,
  targetDuration,
  onBack,
  onNext,
  onSelectVideo,
  onGenerateVideo,
  onRegenerate,
  onCutsChange,
  onGenerateVideoFromImage,
}: AdStoryboardProps) {
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

  // カットの削除
  const handleDeleteCut = useCallback((index: number) => {
    if (cuts.length <= 1) return; // 最低1カットは必要
    let newCuts = cuts.filter((_, i) => i !== index);
    // cut_numberを更新
    newCuts = newCuts.map((cut, i) => ({ ...cut, cut_number: i + 1 }));
    // CM尺が設定されている場合は秒数を再分配
    if (targetDuration) {
      newCuts = distributeDurations(newCuts, targetDuration);
    }
    onCutsChange(newCuts);
  }, [cuts, targetDuration, onCutsChange]);

  // カットの追加
  const handleAddCut = useCallback(() => {
    const newCut: EditableCut = {
      id: `cut_new_${Date.now()}`,
      cut_number: cuts.length + 1,
      scene_type: "custom",
      scene_type_label: "カスタム",
      description_ja: "",
      description_en: "",
      duration: targetDuration ? Math.floor(targetDuration / (cuts.length + 1)) : 5,
      dialogue: "",
      sound_effect: "",
      video: null,
    };
    let newCuts = [...cuts, newCut];
    // CM尺が設定されている場合は秒数を再分配
    if (targetDuration) {
      newCuts = distributeDurations(newCuts, targetDuration);
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
      if (targetDuration) {
        // 入力を検証
        const validation = validateDurationChange(cuts, cutId, newDuration, targetDuration);
        const adjustedDuration = validation.adjustedDuration ?? newDuration;

        // 他のカットの秒数を自動調整
        const adjustedCuts = adjustDurationsOnChange(cuts, cutId, adjustedDuration, targetDuration);
        onCutsChange(adjustedCuts);
      } else {
        // CM尺が設定されていない場合は単純に更新
        onCutsChange(
          cuts.map((cut) => (cut.id === cutId ? { ...cut, duration: newDuration } : cut))
        );
      }
    },
    [cuts, targetDuration, onCutsChange]
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

          {/* CM尺表示（読み取り専用） */}
          {targetDuration && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                {targetDuration}秒CM
              </span>
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
