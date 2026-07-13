'use client';

import { Save, FolderOpen, FilePlus, Cloud, HardDrive, CopyPlus, Server, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowToolbarProps {
  workflowName: string;
  isUnsaved: boolean;
  isCloudSynced: boolean;
  saveError: string | null;
  selectedNodeCount: number;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
  onClearError: () => void;
  onDuplicate: () => void;
  /** サーバー側で実行を開始する。未指定なら「サーバーで実行」ボタンを表示しない。 */
  onExecuteOnServer?: () => void;
  /** サーバー実行履歴パネルを開く。未指定なら履歴ボタンを表示しない。 */
  onOpenRuns?: () => void;
}

export function WorkflowToolbar({
  workflowName,
  isUnsaved,
  isCloudSynced,
  saveError,
  selectedNodeCount,
  onSave,
  onSaveAs,
  onOpen,
  onNew,
  onClearError,
  onDuplicate,
  onExecuteOnServer,
  onOpenRuns,
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
        {selectedNodeCount > 0 && (
          <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full shrink-0">
            {selectedNodeCount}個選択中
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
        {onOpenRuns && (
          <button
            onClick={onOpenRuns}
            className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
            title="サーバー実行履歴"
          >
            <History className="w-4 h-4" />
          </button>
        )}
        {onExecuteOnServer && (
          <button
            onClick={onExecuteOnServer}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#fce300]/15 text-[#fce300] hover:bg-[#fce300]/25 transition-colors"
            title="サーバーで実行"
          >
            <Server className="w-4 h-4" />
            <span className="text-xs font-medium">サーバーで実行</span>
          </button>
        )}
        {(onOpenRuns || onExecuteOnServer) && (
          <div className="w-px h-5 bg-[#404040] mx-1" />
        )}
        <button
          onClick={onDuplicate}
          disabled={selectedNodeCount === 0}
          className={cn(
            'p-2 rounded-lg transition-colors',
            selectedNodeCount > 0
              ? 'text-blue-400 hover:bg-blue-400/10 hover:text-blue-300'
              : 'text-gray-600 cursor-not-allowed'
          )}
          title="複製 (Cmd+D / Ctrl+D)"
        >
          <CopyPlus className="w-4 h-4" />
        </button>
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
