# ノードエディタ Phase 3 実装計画書

## 概要

Phase 3では、動画生成後の後処理（BGM・フィルター・オーバーレイ）を制御するノードを実装する。

---

## 目標

- BGM選択・アップロードノードの実装
- フィルムグレインノードの実装
- LUT（カラーグレーディング）ノードの実装
- テキストオーバーレイノードの実装
- 全ノードのgraph-to-api連携確認

---

## 実装するノード

### 1. BGMNode

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `bgmTrackId` | `string \| null` | プリセットBGMのID |
| `customBgmUrl` | `string \| null` | カスタムBGMのURL |

**機能**:
- プリセットBGM一覧から選択（`templatesApi.listBgm()`）
- カスタムBGMファイルのアップロード（`videosApi.uploadBgm()`）
- カスタムBGM URLの直接入力
- プレビュー再生機能（オプション）

### 2. FilmGrainNode

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `grain` | `'none' \| 'light' \| 'medium' \| 'heavy'` | グレイン強度 |

**機能**:
- 4段階のグレイン強度選択
- ビジュアルプレビュー（強度に応じたアイコン表示）

### 3. LUTNode

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `useLut` | `boolean` | LUT適用ON/OFF |

**機能**:
- シンプルなON/OFFトグル
- カラーグレーディング適用の有無

### 4. OverlayNode

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `text` | `string` | オーバーレイテキスト |
| `position` | `'top' \| 'center' \| 'bottom'` | テキスト位置 |
| `font` | `string` | フォント名 |
| `color` | `string` | テキスト色（HEX） |

**機能**:
- テキスト入力フィールド
- 位置選択（上・中央・下）
- フォント選択ドロップダウン
- カラーピッカー

---

## ファイル構成

```
movie-maker/components/node-editor/
├── nodes/
│   ├── index.ts                    # 更新: 新ノードをエクスポート
│   ├── BGMNode.tsx                 # 新規
│   ├── FilmGrainNode.tsx           # 新規
│   ├── LUTNode.tsx                 # 新規
│   └── OverlayNode.tsx             # 新規
└── utils/
    └── node-types.ts               # 更新: 新ノードタイプ登録
```

---

## 既存実装状況

以下はPhase 1で既に実装済み:

| ファイル | 状況 | 備考 |
|---------|------|------|
| `lib/types/node-editor.ts` | ✅ 型定義済み | BGMNodeData, FilmGrainNodeData, LUTNodeData, OverlayNodeData |
| `createDefaultNodeData()` | ✅ 実装済み | 全4ノードのデフォルト値設定済み |
| `utils/graph-to-api.ts` | ✅ 実装済み | bgm_track_id, custom_bgm_url, film_grain, use_lut, overlay 変換済み |
| `hooks/useNodesAvailability.ts` | ✅ 実装済み | ALWAYS_AVAILABLE_NODESに含む |

---

## 詳細実装

### 1. BGMNode.tsx

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Music, Upload, Link, X, Loader2, Play, Pause } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
  nodeInputClassName,
  nodeButtonClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { BGMNodeData } from '@/lib/types/node-editor';
import { templatesApi, videosApi } from '@/lib/api/client';
import type { BGMTrack } from '@/lib/api/client';

interface BGMNodeProps extends NodeProps {
  data: BGMNodeData;
  selected: boolean;
}

type BGMMode = 'preset' | 'upload' | 'url';

export function BGMNode({ data, selected, id }: BGMNodeProps) {
  const [mode, setMode] = useState<BGMMode>('preset');
  const [presets, setPresets] = useState<BGMTrack[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  // プリセットBGM一覧を取得
  useEffect(() => {
    const loadPresets = async () => {
      setIsLoadingPresets(true);
      try {
        const result = await templatesApi.listBgm();
        setPresets(result || []);
      } catch (error) {
        console.error('Failed to load BGM presets:', error);
      } finally {
        setIsLoadingPresets(false);
      }
    };
    loadPresets();
  }, []);

  const updateNodeData = useCallback(
    (updates: Partial<BGMNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handlePresetSelect = useCallback(
    (trackId: string) => {
      updateNodeData({
        bgmTrackId: trackId,
        customBgmUrl: null,
        isValid: true,
        errorMessage: undefined,
      });
    },
    [updateNodeData]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const result = await videosApi.uploadBgm(file);
        updateNodeData({
          bgmTrackId: null,
          customBgmUrl: result.bgm_url,
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        updateNodeData({
          isValid: false,
          errorMessage: error instanceof Error ? error.message : 'アップロード失敗',
        });
      } finally {
        setIsUploading(false);
      }
    },
    [updateNodeData]
  );

  const handleUrlSubmit = useCallback(() => {
    if (urlInput.trim()) {
      updateNodeData({
        bgmTrackId: null,
        customBgmUrl: urlInput.trim(),
        isValid: true,
        errorMessage: undefined,
      });
    }
  }, [urlInput, updateNodeData]);

  const handleClear = useCallback(() => {
    setUrlInput('');
    updateNodeData({
      bgmTrackId: null,
      customBgmUrl: null,
      isValid: true,
      errorMessage: undefined,
    });
  }, [updateNodeData]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  // 現在の選択状態を表示
  const currentSelection = data.bgmTrackId
    ? presets.find((p) => p.id === data.bgmTrackId)?.name || data.bgmTrackId
    : data.customBgmUrl
    ? 'カスタムBGM'
    : null;

  return (
    <BaseNode
      title="BGM"
      icon={<Music className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[260px]"
    >
      {/* モード切替 */}
      <div className="flex gap-1 mb-3">
        {(['preset', 'upload', 'url'] as BGMMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'flex-1 px-2 py-1 text-xs rounded transition-colors',
              mode === m
                ? 'bg-[#fce300] text-black'
                : 'bg-[#404040] text-white hover:bg-[#505050]'
            )}
          >
            {m === 'preset' && 'プリセット'}
            {m === 'upload' && 'アップロード'}
            {m === 'url' && 'URL'}
          </button>
        ))}
      </div>

      {/* 現在の選択表示 */}
      {currentSelection && (
        <div className="flex items-center justify-between p-2 mb-3 bg-[#1a1a1a] rounded-lg">
          <span className="text-xs text-white truncate">{currentSelection}</span>
          <button
            onClick={handleClear}
            className="p-1 hover:bg-[#404040] rounded"
          >
            <X className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      )}

      {/* プリセット選択 */}
      {mode === 'preset' && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {isLoadingPresets ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-[#fce300] animate-spin" />
            </div>
          ) : presets.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              プリセットがありません
            </p>
          ) : (
            presets.map((track) => (
              <button
                key={track.id}
                onClick={() => handlePresetSelect(track.id)}
                className={cn(
                  'w-full p-2 rounded-lg text-left text-xs transition-colors',
                  data.bgmTrackId === track.id
                    ? 'bg-[#fce300] text-black'
                    : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{track.name}</span>
                  {track.duration_seconds && (
                    <span className="text-[10px] opacity-70">
                      {Math.floor(track.duration_seconds / 60)}:{String(Math.floor(track.duration_seconds % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* アップロード */}
      {mode === 'upload' && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-[#fce300] bg-[#fce300]/10'
              : 'border-[#404040] hover:border-[#606060]',
            isUploading && 'pointer-events-none opacity-50'
          )}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <Loader2 className="w-5 h-5 mx-auto text-[#fce300] animate-spin" />
          ) : (
            <>
              <Upload className="w-5 h-5 mx-auto text-gray-500 mb-1" />
              <p className="text-[10px] text-gray-500">
                MP3, WAV, M4A, AAC
              </p>
            </>
          )}
        </div>
      )}

      {/* URL入力 */}
      {mode === 'url' && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="BGM URLを入力"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className={nodeInputClassName}
          />
          <button onClick={handleUrlSubmit} className={nodeButtonClassName}>
            適用
          </button>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="bgm"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 2. FilmGrainNode.tsx

```typescript
'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Film } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { FilmGrainNodeData } from '@/lib/types/node-editor';

interface FilmGrainNodeProps extends NodeProps {
  data: FilmGrainNodeData;
  selected: boolean;
}

type GrainLevel = 'none' | 'light' | 'medium' | 'heavy';

const GRAIN_OPTIONS: { value: GrainLevel; label: string; description: string; dots: number }[] = [
  { value: 'none', label: 'なし', description: 'グレインなし', dots: 0 },
  { value: 'light', label: '軽め', description: '繊細なグレイン', dots: 1 },
  { value: 'medium', label: '中程度', description: 'バランスの良いグレイン', dots: 2 },
  { value: 'heavy', label: '強め', description: 'フィルムライクな強いグレイン', dots: 3 },
];

export function FilmGrainNode({ data, selected, id }: FilmGrainNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<FilmGrainNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="フィルムグレイン"
      icon={<Film className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      <div className="space-y-2">
        {GRAIN_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => updateNodeData({ grain: option.value })}
            className={cn(
              'w-full p-3 rounded-lg text-left transition-all',
              data.grain === option.value
                ? 'bg-[#fce300] text-black'
                : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{option.label}</span>
                <span
                  className={cn(
                    'block text-xs mt-0.5',
                    data.grain === option.value ? 'text-black/70' : 'text-gray-500'
                  )}
                >
                  {option.description}
                </span>
              </div>
              {/* グレイン強度のビジュアル表示 */}
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-2 h-2 rounded-full',
                      i < option.dots
                        ? data.grain === option.value
                          ? 'bg-black'
                          : 'bg-[#fce300]'
                        : data.grain === option.value
                        ? 'bg-black/30'
                        : 'bg-[#404040]'
                    )}
                  />
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="film_grain"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 3. LUTNode.tsx

```typescript
'use client';

import { useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Palette } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { LUTNodeData } from '@/lib/types/node-editor';

interface LUTNodeProps extends NodeProps {
  data: LUTNodeData;
  selected: boolean;
}

export function LUTNode({ data, selected, id }: LUTNodeProps) {
  const updateNodeData = useCallback(
    (updates: Partial<LUTNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  return (
    <BaseNode
      title="カラーグレーディング"
      icon={<Palette className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      <div className="space-y-3">
        {/* LUT適用トグル */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-white">LUTを適用</span>
            <p className="text-[10px] text-gray-500 mt-0.5">
              シネマティックな色調補正
            </p>
          </div>
          <button
            onClick={() => updateNodeData({ useLut: !data.useLut })}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              data.useLut ? 'bg-[#fce300]' : 'bg-[#404040]'
            )}
          >
            <span
              className={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                data.useLut ? 'translate-x-7' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* 状態表示 */}
        <div
          className={cn(
            'p-3 rounded-lg text-center transition-colors',
            data.useLut ? 'bg-[#fce300]/20' : 'bg-[#1a1a1a]'
          )}
        >
          <span
            className={cn(
              'text-xs font-medium',
              data.useLut ? 'text-[#fce300]' : 'text-gray-500'
            )}
          >
            {data.useLut ? 'カラーグレーディング有効' : 'オリジナル色調'}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="use_lut"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

### 4. OverlayNode.tsx

```typescript
'use client';

import { useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Type } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
  nodeInputClassName,
  nodeSelectClassName,
  nodeLabelClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { OverlayNodeData } from '@/lib/types/node-editor';

interface OverlayNodeProps extends NodeProps {
  data: OverlayNodeData;
  selected: boolean;
}

type OverlayPosition = 'top' | 'center' | 'bottom';

const POSITION_OPTIONS: { value: OverlayPosition; label: string }[] = [
  { value: 'top', label: '上部' },
  { value: 'center', label: '中央' },
  { value: 'bottom', label: '下部' },
];

const FONT_OPTIONS = [
  { value: 'sans-serif', label: 'ゴシック体' },
  { value: 'serif', label: '明朝体' },
  { value: 'monospace', label: '等幅フォント' },
];

const COLOR_PRESETS = [
  '#ffffff', // 白
  '#000000', // 黒
  '#fce300', // イエロー（ブランドカラー）
  '#ff4444', // 赤
  '#44ff44', // 緑
  '#4444ff', // 青
];

export function OverlayNode({ data, selected, id }: OverlayNodeProps) {
  const [customColor, setCustomColor] = useState(data.color || '#ffffff');

  const updateNodeData = useCallback(
    (updates: Partial<OverlayNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      setCustomColor(color);
      updateNodeData({ color });
    },
    [updateNodeData]
  );

  return (
    <BaseNode
      title="テキストオーバーレイ"
      icon={<Type className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[260px]"
    >
      <div className="space-y-4">
        {/* テキスト入力 */}
        <div>
          <label className={nodeLabelClassName}>テキスト</label>
          <input
            type="text"
            placeholder="オーバーレイテキストを入力"
            value={data.text}
            onChange={(e) => updateNodeData({ text: e.target.value })}
            className={nodeInputClassName}
          />
        </div>

        {/* 位置選択 */}
        <div>
          <label className={nodeLabelClassName}>位置</label>
          <div className="flex gap-1">
            {POSITION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateNodeData({ position: option.value })}
                className={cn(
                  'flex-1 px-2 py-1.5 text-xs rounded transition-colors',
                  data.position === option.value
                    ? 'bg-[#fce300] text-black'
                    : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* フォント選択 */}
        <div>
          <label className={nodeLabelClassName}>フォント</label>
          <select
            value={data.font}
            onChange={(e) => updateNodeData({ font: e.target.value })}
            className={nodeSelectClassName}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </div>

        {/* カラー選択 */}
        <div>
          <label className={nodeLabelClassName}>色</label>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-transform',
                    data.color === color
                      ? 'border-[#fce300] scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <input
              type="color"
              value={customColor}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent"
            />
          </div>
        </div>

        {/* プレビュー */}
        {data.text && (
          <div className="p-3 bg-[#1a1a1a] rounded-lg">
            <p className="text-[10px] text-gray-500 mb-2">プレビュー:</p>
            <div
              className={cn(
                'text-sm font-medium',
                data.position === 'top' && 'text-left',
                data.position === 'center' && 'text-center',
                data.position === 'bottom' && 'text-right'
              )}
              style={{
                color: data.color,
                fontFamily: data.font,
              }}
            >
              {data.text}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="overlay"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
```

---

## 更新が必要な既存ファイル

### 1. nodes/index.ts

```typescript
export { BaseNode, inputHandleClassName, outputHandleClassName, nodeInputClassName, nodeSelectClassName, nodeButtonClassName, nodeLabelClassName } from './BaseNode';
export { ImageInputNode } from './ImageInputNode';
export { PromptNode } from './PromptNode';
export { ProviderNode } from './ProviderNode';
export { CameraWorkNode } from './CameraWorkNode';
export { GenerateNode } from './GenerateNode';

// Phase 2: プロバイダー固有ノード
export { KlingModeNode } from './KlingModeNode';
export { KlingElementsNode } from './KlingElementsNode';
export { KlingEndFrameNode } from './KlingEndFrameNode';
export { ActTwoNode } from './ActTwoNode';
export { HailuoEndFrameNode } from './HailuoEndFrameNode';

// Phase 3: 後処理ノード
export { BGMNode } from './BGMNode';
export { FilmGrainNode } from './FilmGrainNode';
export { LUTNode } from './LUTNode';
export { OverlayNode } from './OverlayNode';
```

### 2. utils/node-types.ts

```typescript
import type { NodeTypes } from '@xyflow/react';
import { ImageInputNode } from '../nodes/ImageInputNode';
import { PromptNode } from '../nodes/PromptNode';
import { ProviderNode } from '../nodes/ProviderNode';
import { CameraWorkNode } from '../nodes/CameraWorkNode';
import { GenerateNode } from '../nodes/GenerateNode';
// Phase 2
import { KlingModeNode } from '../nodes/KlingModeNode';
import { KlingElementsNode } from '../nodes/KlingElementsNode';
import { KlingEndFrameNode } from '../nodes/KlingEndFrameNode';
import { ActTwoNode } from '../nodes/ActTwoNode';
import { HailuoEndFrameNode } from '../nodes/HailuoEndFrameNode';
// Phase 3
import { BGMNode } from '../nodes/BGMNode';
import { FilmGrainNode } from '../nodes/FilmGrainNode';
import { LUTNode } from '../nodes/LUTNode';
import { OverlayNode } from '../nodes/OverlayNode';

export const nodeTypes: NodeTypes = {
  imageInput: ImageInputNode,
  prompt: PromptNode,
  provider: ProviderNode,
  cameraWork: CameraWorkNode,
  generate: GenerateNode,
  // Phase 2: プロバイダー固有ノード
  klingMode: KlingModeNode,
  klingElements: KlingElementsNode,
  klingEndFrame: KlingEndFrameNode,
  actTwo: ActTwoNode,
  hailuoEndFrame: HailuoEndFrameNode,
  // Phase 3: 後処理ノード
  bgm: BGMNode,
  filmGrain: FilmGrainNode,
  lut: LUTNode,
  overlay: OverlayNode,
};

// ... 他の設定は変更なし
```

---

## 実装順序

| # | タスク | 依存関係 | 状況 |
|---|--------|----------|------|
| 0 | **lib/api/client.ts に BGMTrack 型追加** | なし | 🔲 **前提条件** |
| 1 | BGMNode.tsx 作成 | 0 | 🔲 未実装 |
| 2 | FilmGrainNode.tsx 作成 | なし | 🔲 未実装 |
| 3 | LUTNode.tsx 作成 | なし | 🔲 未実装 |
| 4 | OverlayNode.tsx 作成 | なし | 🔲 未実装 |
| 5 | nodes/index.ts 更新 | 1-4 | 🔲 未実装 |
| 6 | utils/node-types.ts 更新 | 1-4 | 🔲 未実装 |
| 7 | graph-to-api.ts 確認 | - | ✅ 実装済み |
| 8 | useNodesAvailability.ts 確認 | - | ✅ 実装済み |
| 9 | ビルド・Lintテスト | 5-6 | 🔲 |
| 10 | 手動テスト | 9 | 🔲 |

---

## API依存関係

### BGMNode で使用するAPI

```typescript
// プリセットBGM一覧取得
templatesApi.listBgm(): Promise<BGMTrack[]>

// カスタムBGMアップロード
videosApi.uploadBgm(file: File): Promise<{ bgm_url: string; duration_seconds: number | null }>
```

### 【重要】client.ts への型定義追加が必要

現在の `templatesApi.listBgm()` は戻り値型が未定義（`Promise<unknown>`）のため、以下の修正が必要:

**lib/api/client.ts に追加:**
```typescript
// BGMトラック型定義（templatesApi.listBgm用）
export interface BGMTrack {
  id: string;
  name: string;
  duration_seconds?: number;
  preview_url?: string;
}

// templatesApi の listBgm を修正
export const templatesApi = {
  list: () => fetchWithAuth("/api/v1/templates"),
  get: (id: string) => fetchWithAuth(`/api/v1/templates/${id}`),
  listBgm: (): Promise<BGMTrack[]> => fetchWithAuth("/api/v1/templates/bgm/list"),  // 型注釈追加
};
```

### 注意事項

- **バックエンドAPI確認**: `/api/v1/templates/bgm/list` の実際のレスポンスが `BGMTrack[]` と一致するか確認
- BGMプレビュー再生機能は将来的な拡張として検討（Phase 3では実装しない）

---

## テスト計画

### 1. ユニットテスト

```bash
# テストファイル作成予定
tests/node-editor/BGMNode.test.tsx
tests/node-editor/FilmGrainNode.test.tsx
tests/node-editor/LUTNode.test.tsx
tests/node-editor/OverlayNode.test.tsx
```

### 2. 手動テスト手順

#### BGMノードテスト
1. パレットから「BGM」ノードを追加
2. プリセットタブでBGM一覧が表示されることを確認
3. プリセットを選択して選択状態が反映されることを確認
4. アップロードタブでMP3ファイルをアップロード
5. URLタブでBGM URLを入力
6. 生成実行してAPIリクエストに`bgm_track_id`または`custom_bgm_url`が含まれることを確認

#### FilmGrainノードテスト
1. パレットから「フィルムグレイン」ノードを追加
2. 4段階の選択肢が表示されることを確認
3. 各レベルをクリックして選択状態が変わることを確認
4. 生成実行してAPIリクエストに`film_grain`が含まれることを確認

#### LUTノードテスト
1. パレットから「カラーグレーディング」ノードを追加
2. トグルをON/OFFして状態が切り替わることを確認
3. 生成実行してAPIリクエストに`use_lut`が含まれることを確認

#### OverlayノードTest
1. パレットから「テキストオーバーレイ」ノードを追加
2. テキストを入力してプレビューに反映されることを確認
3. 位置（上・中央・下）を選択
4. フォントを選択
5. カラープリセットとカラーピッカーで色を選択
6. 生成実行してAPIリクエストに`overlay`オブジェクトが含まれることを確認

---

## 成功基準

- [ ] 4種類の新ノードがすべて正常に動作
- [ ] BGMプリセット一覧が正常に取得・表示される
- [ ] BGMカスタムアップロードが正常に動作する
- [ ] FilmGrainの4段階選択が正常に動作する
- [ ] LUTのON/OFFトグルが正常に動作する
- [ ] Overlayのテキスト・位置・フォント・色設定が正常に動作する
- [ ] graph-to-apiで全パラメータが正しく変換される
- [ ] ESLint/TypeScriptエラーなし
- [ ] ビルド成功

---

## リスク・注意事項

1. **BGMプリセットAPIの戻り値型**: `templatesApi.listBgm()` の実際の戻り値を確認し、必要に応じてインターフェースを調整
2. **カラーピッカーのブラウザ互換性**: `<input type="color">` はすべてのブラウザでサポートされているが、スタイリングは制限あり
3. **フォントの可用性**: `serif`, `sans-serif`, `monospace` は全環境で利用可能なジェネリックフォント名を使用
