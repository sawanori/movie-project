"use client";

import { Smartphone, Monitor, Square } from "lucide-react";
import { AspectRatio, ASPECT_RATIOS } from "@/lib/types/video";
import { cn } from "@/lib/utils";

interface AspectRatioSelectorProps {
  onSelect: (ratio: AspectRatio) => void;
}

const ICONS: Record<AspectRatio, React.ReactNode> = {
  "9:16": <Smartphone className="h-8 w-8" />,
  "16:9": <Monitor className="h-8 w-8" />,
  "1:1": <Square className="h-8 w-8" />,
};

export function AspectRatioSelector({ onSelect }: AspectRatioSelectorProps) {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-bold text-white mb-2">
          広告のアスペクト比を選択
        </h2>
        <p className="text-zinc-400">
          配信先に合わせて最適なアスペクト比を選んでください
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {ASPECT_RATIOS.map((ratio) => (
          <button
            key={ratio.value}
            onClick={() => onSelect(ratio.value)}
            className={cn(
              "group bg-zinc-900 hover:bg-zinc-800 border border-zinc-700",
              "hover:border-blue-500 rounded-xl p-6 transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
            )}
          >
            {/* アスペクト比のビジュアル */}
            <div className="aspect-square flex items-center justify-center mb-4">
              <div
                className={cn(
                  "bg-blue-500/20 border-2 border-blue-500/50 rounded-lg",
                  "group-hover:border-blue-500 group-hover:bg-blue-500/30 transition-all",
                  "flex items-center justify-center text-blue-400 group-hover:text-blue-300"
                )}
                style={{
                  aspectRatio: ratio.value.replace(":", "/"),
                  width: ratio.value === "16:9" ? "100%" : ratio.value === "1:1" ? "70%" : "50%",
                  height: ratio.value === "9:16" ? "100%" : ratio.value === "1:1" ? "70%" : "auto",
                }}
              >
                {ICONS[ratio.value]}
              </div>
            </div>

            {/* ラベル */}
            <p className="text-white font-semibold text-lg group-hover:text-blue-300 transition-colors">
              {ratio.label}
            </p>
            <p className="text-zinc-500 text-sm mb-3">{ratio.value}</p>

            {/* プラットフォームタグ */}
            <div className="flex flex-wrap gap-1 justify-center">
              {ratio.platforms.map((platform) => (
                <span
                  key={platform}
                  className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded group-hover:bg-zinc-700 transition-colors"
                >
                  {platform}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* 補足説明 */}
      <p className="text-center text-zinc-500 text-sm mt-8">
        ※ 選択したアスペクト比に対応する動画のみ表示されます
      </p>
    </div>
  );
}
