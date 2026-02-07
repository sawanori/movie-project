'use client';

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Music, Loader2 } from 'lucide-react';
import {
  BaseNode,
  outputHandleClassName,
  nodeSelectClassName,
  nodeInputClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { BGMNodeData } from '@/lib/types/node-editor';
import { templatesApi, BGMTrack } from '@/lib/api/client';

interface BGMNodeProps extends NodeProps {
  data: BGMNodeData;
  selected: boolean;
}

export function BGMNode({ data, selected, id }: BGMNodeProps) {
  const [bgmTracks, setBgmTracks] = useState<BGMTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // BGMリストを取得
  useEffect(() => {
    const loadBgmTracks = async () => {
      setIsLoading(true);
      try {
        const tracks = await templatesApi.listBgm();
        setBgmTracks(tracks);
      } catch (error) {
        console.error('Failed to load BGM tracks:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadBgmTracks();
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

  // プリセット選択時はカスタムURLをクリア、逆も同様
  const handleBgmSelect = (bgmId: string) => {
    updateNodeData({
      bgmTrackId: bgmId || null,
      customBgmUrl: bgmId ? null : data.customBgmUrl,
    });
  };

  const handleCustomUrlChange = (url: string) => {
    updateNodeData({
      customBgmUrl: url || null,
      bgmTrackId: url ? null : data.bgmTrackId,
    });
  };

  return (
    <BaseNode
      title="BGM"
      icon={<Music className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
      className="min-w-[240px]"
    >
      {/* プリセットBGM選択 */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1">プリセットBGM</label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">読み込み中...</span>
          </div>
        ) : (
          <select
            value={data.bgmTrackId || ''}
            onChange={(e) => handleBgmSelect(e.target.value)}
            className={nodeSelectClassName}
          >
            <option value="">選択なし</option>
            {bgmTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}{track.mood ? ` - ${track.mood}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* カスタムBGM URL */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          またはカスタムBGM URL
        </label>
        <input
          type="text"
          value={data.customBgmUrl || ''}
          onChange={(e) => handleCustomUrlChange(e.target.value)}
          placeholder="https://..."
          className={cn(nodeInputClassName, 'text-sm')}
        />
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="bgm"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
}
