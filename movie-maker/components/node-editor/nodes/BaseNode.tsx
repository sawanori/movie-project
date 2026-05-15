'use client';

import { type CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  title: string;
  icon: ReactNode;
  isSelected?: boolean;
  isValid?: boolean;
  errorMessage?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function BaseNode({
  title,
  icon,
  isSelected,
  isValid = true,
  errorMessage,
  children,
  className,
  style,
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
      style={style}
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

// ========== Krea 流ハンドル色規約ヘルパー ==========

/**
 * ハンドルのデータ型を表す型。
 * 新規 Utility Nodes のカラーコーディングに使用する。
 */
export type HandleDataType = 'image' | 'video' | 'text' | 'audio' | 'default';

// 入力ハンドルの共通スタイル (bg 以外)
const inputHandleBase = '!w-3 !h-3 !border-2 !border-[#212121]';
// 出力ハンドルの共通スタイル (bg 以外)
const outputHandleBase = '!w-4 !h-4 !border-2 !border-[#212121] hover:!scale-125 !transition-transform';

/**
 * データ型に応じた入力ハンドルの Tailwind クラスを返す。
 * Image=青, Video=緑, Text=紫, Audio=橙, default=既存ブランドカラー
 */
export function getInputHandleClass(dataType: HandleDataType): string {
  switch (dataType) {
    case 'image':
      return `${inputHandleBase} !bg-blue-500`;
    case 'video':
      return `${inputHandleBase} !bg-green-500`;
    case 'text':
      return `${inputHandleBase} !bg-purple-500`;
    case 'audio':
      return `${inputHandleBase} !bg-orange-500`;
    default:
      return inputHandleClassName;
  }
}

/**
 * データ型に応じた出力ハンドルの Tailwind クラスを返す。
 * Image=青, Video=緑, Text=紫, Audio=橙, default=既存ブランドカラー
 */
export function getOutputHandleClass(dataType: HandleDataType): string {
  switch (dataType) {
    case 'image':
      return `${outputHandleBase} !bg-blue-400 hover:!bg-blue-300`;
    case 'video':
      return `${outputHandleBase} !bg-green-400 hover:!bg-green-300`;
    case 'text':
      return `${outputHandleBase} !bg-purple-400 hover:!bg-purple-300`;
    case 'audio':
      return `${outputHandleBase} !bg-orange-400 hover:!bg-orange-300`;
    default:
      return outputHandleClassName;
  }
}

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
