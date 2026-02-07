"use client";

import { cn } from "@/lib/utils";
import {
  StructuredImageInput,
  SUBJECT_POSITIONS,
  LIGHTING_OPTIONS,
  MOOD_OPTIONS,
  INITIAL_STRUCTURED_INPUT,
} from "@/lib/constants/image-generation";

interface StructuredImageFormProps {
  value: StructuredImageInput;
  onChange: (value: StructuredImageInput) => void;
  disabled?: boolean;
  className?: string;
}

export function StructuredImageForm({
  value,
  onChange,
  disabled = false,
  className,
}: StructuredImageFormProps) {
  const handleChange = (
    field: keyof StructuredImageInput,
    fieldValue: string | null
  ) => {
    // subject は必須フィールドなので空文字列を維持、それ以外は null に変換
    const newValue = field === "subject"
      ? (fieldValue ?? "")
      : (fieldValue || null);
    onChange({
      ...value,
      [field]: newValue,
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* 被写体（必須） */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          被写体 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={value.subject}
          onChange={(e) => handleChange("subject", e.target.value)}
          placeholder="例: コーヒーカップ、スニーカー、化粧品ボトル"
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "placeholder:text-zinc-400",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
          )}
          maxLength={200}
        />
      </div>

      {/* 被写体の位置 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          被写体の位置
        </label>
        <select
          value={value.subject_position || ""}
          onChange={(e) => handleChange("subject_position", e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          )}
        >
          <option value="">選択してください</option>
          {SUBJECT_POSITIONS.map((pos) => (
            <option key={pos.value} value={pos.value}>
              {pos.label}
            </option>
          ))}
        </select>
      </div>

      {/* 背景 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          背景
        </label>
        <input
          type="text"
          value={value.background || ""}
          onChange={(e) => handleChange("background", e.target.value)}
          placeholder="例: 白い大理石のテーブル、森の中、スタジオ背景"
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "placeholder:text-zinc-400",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
          )}
          maxLength={200}
        />
      </div>

      {/* 照明 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          照明
        </label>
        <select
          value={value.lighting || ""}
          onChange={(e) => handleChange("lighting", e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          )}
        >
          <option value="">選択してください</option>
          {LIGHTING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* カラーパレット */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          カラーパレット
        </label>
        <input
          type="text"
          value={value.color_palette || ""}
          onChange={(e) => handleChange("color_palette", e.target.value)}
          placeholder="例: 暖かいオレンジ、モノクロ、パステルカラー"
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "placeholder:text-zinc-400",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
          )}
          maxLength={100}
        />
      </div>

      {/* ムード */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          ムード
        </label>
        <select
          value={value.mood || ""}
          onChange={(e) => handleChange("mood", e.target.value)}
          disabled={disabled}
          className={cn(cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          ))}
        >
          <option value="">選択してください</option>
          {MOOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 追加指示 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          追加指示
        </label>
        <textarea
          value={value.additional_notes || ""}
          onChange={(e) => handleChange("additional_notes", e.target.value)}
          placeholder="例: 水滴をつける、動きを感じさせる、高級感を出す"
          disabled={disabled}
          rows={3}
          className={cn(
            "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
            "placeholder:text-zinc-400",
            "focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none",
            "dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
          )}
          maxLength={500}
        />
      </div>
    </div>
  );
}

// フォームリセット用のヘルパー
export function createEmptyStructuredInput(): StructuredImageInput {
  return { ...INITIAL_STRUCTURED_INPUT };
}

// フォームに有効なデータがあるかチェック
export function hasStructuredInputData(input: StructuredImageInput): boolean {
  return (input.subject ?? "").trim().length > 0;
}
