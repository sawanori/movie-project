"use client";

import { ImageProvider, IMAGE_PROVIDERS } from "@/lib/constants/image-generation";
import { cn } from "@/lib/utils";

interface ImageProviderSelectorProps {
  value: ImageProvider;
  onChange: (provider: ImageProvider) => void;
  disabled?: boolean;
  className?: string;
}

export function ImageProviderSelector({
  value,
  onChange,
  disabled,
  className,
}: ImageProviderSelectorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-zinc-300">画像生成モデル</label>
      <div className="space-y-1.5">
        {IMAGE_PROVIDERS.map((provider) => (
          <label
            key={provider.value}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              value === provider.value
                ? "border-[#fce300] bg-[#fce300]/10"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <input
              type="radio"
              name="imageProvider"
              value={provider.value}
              checked={value === provider.value}
              onChange={() => onChange(provider.value)}
              disabled={disabled}
              className="sr-only"
            />
            <div
              className={cn(
                "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                value === provider.value
                  ? "border-[#fce300]"
                  : "border-zinc-500"
              )}
            >
              {value === provider.value && (
                <div className="w-2 h-2 rounded-full bg-[#fce300]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-medium text-sm",
                value === provider.value ? "text-[#fce300]" : "text-white"
              )}>{provider.label}</div>
              <div className={cn(
                "text-xs",
                value === provider.value ? "text-amber-300" : "text-sky-300"
              )}>
                {provider.description} ・ 最大{provider.maxLength.toLocaleString()}文字
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
