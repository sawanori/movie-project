'use client';

import { useState } from 'react';
import {
  Image as ImageIcon,
  Type,
  Settings,
  Video,
  Camera,
  Zap,
  Film,
  Music,
  Sliders,
  Palette,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  NodeType,
  NodePaletteItem,
  VideoProvider,
  NODE_CATEGORIES,
} from '@/lib/types/node-editor';

interface NodePaletteProps {
  selectedProvider?: VideoProvider;
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}

// ノードアイテム定義
const NODE_ITEMS: NodePaletteItem[] = [
  // 入力
  {
    type: 'imageInput',
    label: '画像入力',
    description: '画像をアップロードまたはURLで指定',
    icon: 'image',
    category: 'input',
  },
  {
    type: 'prompt',
    label: 'プロンプト',
    description: '日本語で動画の内容を記述',
    icon: 'type',
    category: 'input',
  },
  {
    type: 'videoInput',
    label: 'V2V',
    description: '動画入力（Runway専用）',
    icon: 'video',
    category: 'input',
    availableFor: ['runway'],
  },
  // 設定
  {
    type: 'provider',
    label: 'プロバイダー',
    description: '動画生成エンジンを選択',
    icon: 'settings',
    category: 'config',
  },
  {
    type: 'cameraWork',
    label: 'カメラワーク',
    description: 'カメラの動きを設定',
    icon: 'camera',
    category: 'config',
  },
  // プロバイダー専用
  {
    type: 'klingMode',
    label: 'Kling モード',
    description: 'Standard / Pro モード選択',
    icon: 'zap',
    category: 'provider-specific',
    availableFor: ['piapi_kling'],
  },
  {
    type: 'klingElements',
    label: 'Kling 要素画像',
    description: '追加要素画像（最大3枚）',
    icon: 'layers',
    category: 'provider-specific',
    availableFor: ['piapi_kling'],
  },
  {
    type: 'klingEndFrame',
    label: 'Kling 終了フレーム',
    description: '動画の最終フレーム指定',
    icon: 'film',
    category: 'provider-specific',
    availableFor: ['piapi_kling'],
  },
  {
    type: 'klingCameraControl',
    label: 'カメラ6軸',
    description: '6軸スライダーでカメラを自由に制御',
    icon: 'sliders',
    category: 'provider-specific',
    availableFor: ['piapi_kling'],
  },
  {
    type: 'actTwo',
    label: 'Act-Two',
    description: 'Runway Act-Two モーション',
    icon: 'zap',
    category: 'provider-specific',
    availableFor: ['runway'],
  },
  {
    type: 'hailuoEndFrame',
    label: 'Hailuo 終了フレーム',
    description: '動画の最終フレーム指定',
    icon: 'film',
    category: 'provider-specific',
    availableFor: ['hailuo'],
  },
  // 後処理
  {
    type: 'bgm',
    label: 'BGM',
    description: 'バックグラウンドミュージック',
    icon: 'music',
    category: 'post-processing',
  },
  {
    type: 'filmGrain',
    label: 'フィルムグレイン',
    description: 'フィルムノイズ効果',
    icon: 'sliders',
    category: 'post-processing',
  },
  {
    type: 'lut',
    label: 'LUT',
    description: 'カラーグレーディング',
    icon: 'palette',
    category: 'post-processing',
  },
  {
    type: 'overlay',
    label: 'オーバーレイ',
    description: 'テキストオーバーレイ',
    icon: 'type',
    category: 'post-processing',
  },
  // 出力
  {
    type: 'generate',
    label: '生成',
    description: '動画を生成',
    icon: 'video',
    category: 'output',
  },
];

// カテゴリ定義
const CATEGORIES: {
  id: keyof typeof NODE_CATEGORIES;
  label: string;
  description: string;
}[] = [
  { id: 'input', label: '入力', description: '画像・プロンプト入力' },
  { id: 'config', label: '設定', description: 'プロバイダー・カメラワーク' },
  {
    id: 'provider-specific',
    label: 'プロバイダー専用',
    description: '特定プロバイダー用',
  },
  { id: 'post-processing', label: '後処理', description: 'BGM・フィルター' },
  { id: 'output', label: '出力', description: '動画生成' },
];

// アイコンマッピング
function getIcon(iconName: string, className?: string) {
  const iconClass = cn('w-4 h-4', className);
  switch (iconName) {
    case 'image':
      return <ImageIcon className={iconClass} />;
    case 'type':
      return <Type className={iconClass} />;
    case 'settings':
      return <Settings className={iconClass} />;
    case 'video':
      return <Video className={iconClass} />;
    case 'camera':
      return <Camera className={iconClass} />;
    case 'zap':
      return <Zap className={iconClass} />;
    case 'film':
      return <Film className={iconClass} />;
    case 'music':
      return <Music className={iconClass} />;
    case 'sliders':
      return <Sliders className={iconClass} />;
    case 'palette':
      return <Palette className={iconClass} />;
    case 'layers':
      return <Layers className={iconClass} />;
    default:
      return <Settings className={iconClass} />;
  }
}

export function NodePalette({ selectedProvider, onDragStart }: NodePaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['input', 'config', 'output'])
  );

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const isNodeAvailable = (item: NodePaletteItem) => {
    if (!item.availableFor) return true;
    if (!selectedProvider) return false;
    return item.availableFor.includes(selectedProvider);
  };

  const getNodesForCategory = (categoryId: string) => {
    return NODE_ITEMS.filter((item) => item.category === categoryId);
  };

  return (
    <div className="w-64 bg-[#1a1a1a] border-r border-[#404040] h-full overflow-y-auto">
      <div className="p-4 border-b border-[#404040]">
        <h2 className="text-white font-medium text-sm">ノードパレット</h2>
        <p className="text-gray-500 text-xs mt-1">ドラッグして追加</p>
      </div>

      <div className="p-2">
        {CATEGORIES.map((category) => {
          const nodes = getNodesForCategory(category.id);
          const isExpanded = expandedCategories.has(category.id);
          const availableNodes = nodes.filter(isNodeAvailable);

          return (
            <div key={category.id} className="mb-2">
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between p-2 text-left text-sm text-gray-300 hover:bg-[#2a2a2a] rounded-lg transition-colors"
              >
                <span className="font-medium">{category.label}</span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {isExpanded && (
                <div className="mt-1 space-y-1">
                  {nodes.map((item) => {
                    const available = isNodeAvailable(item);
                    return (
                      <div
                        key={item.type}
                        draggable={available}
                        onDragStart={(e) => {
                          if (available) {
                            onDragStart(e, item.type);
                          }
                        }}
                        className={cn(
                          'flex items-center gap-3 p-2 rounded-lg transition-all',
                          available
                            ? 'cursor-grab hover:bg-[#2a2a2a] active:cursor-grabbing'
                            : 'opacity-40 cursor-not-allowed'
                        )}
                      >
                        <div
                          className={cn(
                            'p-2 rounded-lg',
                            available ? 'bg-[#404040]' : 'bg-[#303030]'
                          )}
                        >
                          {getIcon(item.icon, available ? 'text-white' : 'text-gray-600')}
                        </div>
                        <div>
                          <p
                            className={cn(
                              'text-xs font-medium',
                              available ? 'text-white' : 'text-gray-600'
                            )}
                          >
                            {item.label}
                          </p>
                          <p
                            className={cn(
                              'text-[10px]',
                              available ? 'text-gray-500' : 'text-gray-700'
                            )}
                          >
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {availableNodes.length === 0 && category.id === 'provider-specific' && (
                    <p className="text-[10px] text-gray-600 px-2 py-1">
                      プロバイダーを選択すると表示されます
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
