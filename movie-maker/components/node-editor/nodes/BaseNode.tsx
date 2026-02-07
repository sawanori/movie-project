'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  title: string;
  icon: ReactNode;
  isSelected?: boolean;
  isValid?: boolean;
  errorMessage?: string;
  children: ReactNode;
  className?: string;
}

export function BaseNode({
  title,
  icon,
  isSelected,
  isValid = true,
  errorMessage,
  children,
  className,
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        'relative bg-[#2a2a2a] border rounded-xl p-4 min-w-[220px] transition-all',
        isSelected
          ? 'border-[#fce300] shadow-[0_0_20px_rgba(252,227,0,0.15)]'
          : 'border-[#404040]',
        !isValid && 'border-red-500',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3 text-white font-medium">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <div className="space-y-3">{children}</div>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}

// 入力ハンドルスタイル（共通）
export const inputHandleClassName =
  '!w-3 !h-3 !bg-[#fce300] !border-2 !border-[#212121]';

// 出力ハンドルスタイル（共通）- 掴みやすいよう大きめ
export const outputHandleClassName =
  '!w-4 !h-4 !bg-[#00bdb6] !border-2 !border-[#212121] hover:!bg-[#00e6dd] hover:!scale-125 !transition-transform';

// ノード内入力フィールドスタイル
export const nodeInputClassName =
  'w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-[#404040] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#fce300] transition-colors';

// ノード内セレクトスタイル
export const nodeSelectClassName =
  'w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-[#404040] rounded-lg text-white focus:outline-none focus:border-[#fce300] transition-colors cursor-pointer';

// ノード内ボタンスタイル
export const nodeButtonClassName =
  'w-full px-3 py-2 text-sm bg-[#404040] hover:bg-[#505050] rounded-lg text-white transition-colors';

// ノード内ラベルスタイル
export const nodeLabelClassName = 'text-xs text-gray-400 mb-1';
