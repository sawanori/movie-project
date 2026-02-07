"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motionsApi, Motion } from "@/lib/api/client";
import { Loader2, Play, Smile, Hand, Activity, MessageSquare } from "lucide-react";

interface MotionSelectorProps {
  value: string | null;
  onChange: (motionId: string | null) => void;
  disabled?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  expression: <Smile className="h-4 w-4" />,
  gesture: <Hand className="h-4 w-4" />,
  action: <Activity className="h-4 w-4" />,
  speaking: <MessageSquare className="h-4 w-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  expression: "表情",
  gesture: "ジェスチャー",
  action: "アクション",
  speaking: "会話",
};

export function MotionSelector({ value, onChange, disabled }: MotionSelectorProps) {
  const [motions, setMotions] = useState<Motion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewMotion, setPreviewMotion] = useState<Motion | null>(null);

  useEffect(() => {
    loadMotions();
  }, []);

  const loadMotions = async () => {
    try {
      const data = await motionsApi.list();
      setMotions(data);
    } catch (error) {
      console.error("Failed to load motions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (motion: Motion) => {
    try {
      const details = await motionsApi.get(motion.id);
      setPreviewMotion(details);
    } catch (error) {
      console.error("Failed to load motion preview:", error);
    }
  };

  // カテゴリでグループ化
  const categories = Array.from(new Set(motions.map((m) => m.category)));
  const filteredMotions = selectedCategory
    ? motions.filter((m) => m.category === selectedCategory)
    : motions;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        <span className="ml-2 text-sm text-zinc-500">モーションを読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          disabled={disabled}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm transition-colors",
            selectedCategory === null
              ? "bg-purple-600 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          )}
        >
          すべて
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setSelectedCategory(category)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors",
              selectedCategory === category
                ? "bg-purple-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            )}
          >
            {CATEGORY_ICONS[category]}
            {CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {/* モーショングリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filteredMotions.map((motion) => (
          <button
            key={motion.id}
            type="button"
            onClick={() => onChange(value === motion.id ? null : motion.id)}
            onMouseEnter={() => handlePreview(motion)}
            disabled={disabled}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors",
              value === motion.id
                ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-2 w-full">
              {CATEGORY_ICONS[motion.category]}
              <span className="text-xs text-zinc-400 ml-auto">
                {motion.duration_seconds}秒
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">
              {motion.name_ja}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {motion.name_en}
            </p>
            {value === motion.id && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-500" />
            )}
          </button>
        ))}
      </div>

      {/* プレビュー（選択中のモーション） */}
      {previewMotion?.motion_url && (
        <div className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 p-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            プレビュー: {previewMotion.name_ja}
          </p>
          <video
            src={previewMotion.motion_url}
            preload="auto"
            className="w-full max-w-xs mx-auto rounded-lg"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      )}

      {/* 選択中のモーション表示 */}
      {value && (
        <div className="flex items-center justify-center gap-2 text-sm text-purple-600 dark:text-purple-400">
          <Play className="h-4 w-4" />
          選択中: {motions.find((m) => m.id === value)?.name_ja || value}
        </div>
      )}
    </div>
  );
}
