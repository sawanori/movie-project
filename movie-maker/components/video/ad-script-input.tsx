"use client";

import { useState } from "react";
import { AspectRatio } from "@/lib/types/video";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { videosApi, AdScriptResponse } from "@/lib/api/client";

type Duration = 15 | 30 | 60 | null;

interface AdScriptInputProps {
  selectedAspectRatio: AspectRatio;
  onBack: () => void;
  /** 脚本生成完了時のコールバック。targetDurationはユーザーが選択した尺（おまかせ時はカット合計から算出） */
  onScriptGenerated: (script: AdScriptResponse, targetDuration: number) => void;
}

const DURATION_OPTIONS: { value: Duration; label: string; description: string }[] = [
  { value: 15, label: "15秒", description: "短い商品紹介向け" },
  { value: 30, label: "30秒", description: "標準的な広告" },
  { value: 60, label: "60秒", description: "ストーリー広告" },
  { value: null, label: "おまかせ", description: "AIが最適な尺を判断" },
];

export function AdScriptInput({
  selectedAspectRatio,
  onBack,
  onScriptGenerated,
}: AdScriptInputProps) {
  const [description, setDescription] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<Duration>(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = description.trim().length >= 10;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await videosApi.generateAdScript({
        description: description.trim(),
        target_duration: selectedDuration,
        aspect_ratio: selectedAspectRatio as "9:16" | "16:9",
      });

      // ターゲット尺を決定（おまかせの場合はカットの合計秒数から算出）
      let effectiveDuration: number;
      if (selectedDuration !== null) {
        effectiveDuration = selectedDuration;
      } else {
        // カットの合計秒数を計算
        const totalDuration = result.cuts.reduce((sum, cut) => sum + (cut.duration || 5), 0);
        effectiveDuration = totalDuration;
      }

      onScriptGenerated(result, effectiveDuration);
    } catch (err) {
      console.error("Failed to generate ad script:", err);
      setError(
        err instanceof Error
          ? err.message
          : "脚本の生成に失敗しました。もう一度お試しください。"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-8 max-w-2xl mx-auto">
      {/* タイトル */}
      <h2 className="text-xl font-semibold mb-2 text-center">
        広告の情報を入力
      </h2>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        AIが広告理論に基づいて最適なカット構成を提案します
      </p>

      {/* 広告説明入力 */}
      <div className="w-full mb-6">
        <label
          htmlFor="ad-description"
          className="block text-sm font-medium mb-2"
        >
          どんな広告を作りたいですか？
        </label>
        <textarea
          id="ad-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: 新発売のプロテインバーの広告。20代の働く女性向け。忙しい朝でも手軽に栄養補給できることをアピールしたい。おしゃれなカフェで食べるイメージ。"
          className={cn(
            "w-full h-40 px-4 py-3 rounded-lg border resize-none",
            "bg-background text-foreground",
            "placeholder:text-muted-foreground/60",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            "transition-colors"
          )}
          disabled={isGenerating}
        />
        <p className="text-xs text-muted-foreground mt-2">
          {description.length}/1000文字（10文字以上必要）
        </p>
      </div>

      {/* 尺の選択 */}
      <div className="w-full mb-8">
        <label className="block text-sm font-medium mb-3">希望の尺</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => setSelectedDuration(option.value)}
              disabled={isGenerating}
              className={cn(
                "flex flex-col items-center p-3 rounded-lg border-2 transition-all",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                selectedDuration === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-accent/5",
                isGenerating && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="font-semibold">{option.label}</span>
              <span className="text-xs text-muted-foreground mt-1">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="w-full mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ボタン */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={isGenerating}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="flex-1 gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AIが構成を考えています...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              AIで構成を生成
            </>
          )}
        </Button>
      </div>

      {/* 生成中のヒント */}
      {isGenerating && (
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            広告理論に基づいて最適な構成を生成中...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            AIDA・PASONA・起承転結などから最適な手法を選択します
          </p>
        </div>
      )}
    </div>
  );
}
