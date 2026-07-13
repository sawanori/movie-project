"use client";

import { ImageLook, IMAGE_LOOKS } from "@/lib/constants/image-generation";
import { cn } from "@/lib/utils";

interface ImageLookSelectorProps {
  value: ImageLook;
  onChange: (look: ImageLook) => void;
  disabled?: boolean;
  className?: string;
}

export function ImageLookSelector({
  value,
  onChange,
  disabled,
  className,
}: ImageLookSelectorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-zinc-300">画像スタイル</label>
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {IMAGE_LOOKS.map((look) => (
          <label
            key={look.value}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              value === look.value
                ? "border-[#fce300] bg-[#fce300]/10"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <input
              type="radio"
              name="imageLook"
              value={look.value}
              checked={value === look.value}
              onChange={() => onChange(look.value)}
              disabled={disabled}
              className="sr-only"
            />
            <div
              className={cn(
                "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                value === look.value
                  ? "border-[#fce300]"
                  : "border-zinc-500"
              )}
            >
              {value === look.value && (
                <div className="w-2 h-2 rounded-full bg-[#fce300]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-medium text-sm flex items-center gap-2",
                value === look.value ? "text-[#fce300]" : "text-white"
              )}>
                <span>{look.icon}</span>
                <span>{look.label}</span>
              </div>
              <div className={cn(
                "text-xs",
                value === look.value ? "text-amber-300" : "text-sky-300"
              )}>
                {look.description}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
