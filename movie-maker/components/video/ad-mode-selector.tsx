"use client";

import { AspectRatio } from "@/lib/types/video";
import { cn } from "@/lib/utils";
import { Clapperboard, Video, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AdMode = "ai" | "manual";

interface AdModeSelectorProps {
  selectedAspectRatio: AspectRatio;
  onSelectMode: (mode: AdMode) => void;
  onBack: () => void;
}

export function AdModeSelector({
  selectedAspectRatio,
  onSelectMode,
  onBack,
}: AdModeSelectorProps) {
  // 1:1 アスペクト比ではAIモードは利用不可（バックエンドのAspectRatio enumが9:16, 16:9のみ対応）
  const isAiModeDisabled = selectedAspectRatio === "1:1";

  const aspectRatioLabel = {
    "9:16": "縦長",
    "16:9": "横長",
    "1:1": "正方形",
  }[selectedAspectRatio];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-8">
        <span className="text-sm text-muted-foreground">
          アスペクト比: {selectedAspectRatio}（{aspectRatioLabel}）
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          変更
        </Button>
      </div>

      {/* タイトル */}
      <h2 className="text-xl font-semibold mb-8 text-center">
        広告の作成方法を選んでください
      </h2>

      {/* モード選択カード */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-2xl w-full">
        {/* AIで構成を考えるモード */}
        <button
          onClick={() => !isAiModeDisabled && onSelectMode("ai")}
          disabled={isAiModeDisabled}
          className={cn(
            "flex-1 p-6 rounded-xl border-2 transition-all text-left",
            "hover:border-primary hover:shadow-lg",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
            isAiModeDisabled
              ? "opacity-50 cursor-not-allowed border-muted bg-muted/30"
              : "border-border bg-card hover:bg-accent/5"
          )}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                isAiModeDisabled ? "bg-muted" : "bg-primary/10"
              )}
            >
              <Clapperboard
                className={cn(
                  "w-6 h-6",
                  isAiModeDisabled ? "text-muted-foreground" : "text-primary"
                )}
              />
            </div>
            <h3 className="text-lg font-semibold">AIで構成を考える</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            広告の内容を入力するだけで、AIが最適なカット構成を提案。
            広告理論（AIDA/PASONA等）に基づいた効果的な構成で、
            初めての方でも簡単にプロ品質の広告が作れます。
          </p>
          {isAiModeDisabled && (
            <p className="text-xs text-destructive mt-3">
              ※ 1:1（正方形）ではAIモードは利用できません
            </p>
          )}
        </button>

        {/* 自分で動画を選ぶモード */}
        <button
          onClick={() => onSelectMode("manual")}
          className={cn(
            "flex-1 p-6 rounded-xl border-2 transition-all text-left",
            "border-border bg-card",
            "hover:border-primary hover:shadow-lg hover:bg-accent/5",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          )}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-secondary/50 flex items-center justify-center">
              <Video className="w-6 h-6 text-secondary-foreground" />
            </div>
            <h3 className="text-lg font-semibold">自分で動画を選ぶ</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            既存の動画から自由に選んで組み合わせ。
            シーン動画やストーリーボード動画を選択し、
            トリミングやトランジションを自分で設定できます。
          </p>
        </button>
      </div>

      {/* 戻るボタン */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="mt-8 gap-2 text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        戻る
      </Button>
    </div>
  );
}
