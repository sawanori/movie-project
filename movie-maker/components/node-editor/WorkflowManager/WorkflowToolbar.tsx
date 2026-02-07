'use client';

import { Save, FolderOpen, FilePlus, Cloud, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowToolbarProps {
  workflowName: string;
  isUnsaved: boolean;
  isCloudSynced: boolean;
  saveError: string | null;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
  onClearError: () => void;
}

export function WorkflowToolbar({
  workflowName,
  isUnsaved,
  isCloudSynced,
  saveError,
  onSave,
  onSaveAs,
  onOpen,
  onNew,
  onClearError,
}: WorkflowToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border-b border-[#404040]">
      {/* ワークフロー名 */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-white truncate max-w-[200px]">
          {workflowName}
        </span>
        {isUnsaved && (
          <span className="text-xs text-yellow-500 shrink-0">（未保存）</span>
        )}
        {isCloudSynced ? (
          <span title="クラウド同期済み">
            <Cloud className="w-4 h-4 text-green-500 shrink-0" />
          </span>
        ) : (
          <span title="ローカル保存">
            <HardDrive className="w-4 h-4 text-gray-500 shrink-0" />
          </span>
        )}
      </div>

      {/* エラー表示 */}
      {saveError && (
        <div className="flex items-center gap-2 px-2 py-1 bg-red-500/20 rounded text-xs text-red-400">
          <span>{saveError}</span>
          <button onClick={onClearError} className="hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onNew}
          className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
          title="新規ワークフロー"
        >
          <FilePlus className="w-4 h-4" />
        </button>
        <button
          onClick={onOpen}
          className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
          title="ワークフローを開く"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          onClick={onSaveAs}
          className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
          title="名前を付けて保存"
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          onClick={onSave}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isUnsaved
              ? 'bg-[#fce300]/20 text-[#fce300] hover:bg-[#fce300]/30'
              : 'hover:bg-[#2a2a2a] text-gray-400 hover:text-white'
          )}
          title="保存 (Ctrl+S)"
        >
          <Save className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
