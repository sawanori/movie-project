'use client';

import { useState } from 'react';
import { Trash2, Cloud, HardDrive, Clock, Copy, Loader2, X } from 'lucide-react';
import type { WorkflowListItem } from '@/lib/types/node-editor';
import type { CloudWorkflowListItem } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface WorkflowListProps {
  isOpen: boolean;
  localWorkflows: WorkflowListItem[];
  cloudWorkflows: CloudWorkflowListItem[];
  isLoadingCloud: boolean;
  onLoadLocal: (id: string) => void;
  onLoadCloud?: (id: string) => void | Promise<void>;
  onDeleteLocal: (id: string) => boolean;
  onDeleteCloud?: (id: string) => Promise<boolean>;
  onDuplicateCloud?: (id: string) => Promise<boolean>;
  onClose: () => void;
}

export function WorkflowList({
  isOpen,
  localWorkflows = [],
  cloudWorkflows = [],
  isLoadingCloud,
  onLoadLocal,
  onLoadCloud,
  onDeleteLocal,
  onDeleteCloud,
  onDuplicateCloud,
  onClose,
}: WorkflowListProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Ensure arrays are not undefined
  const safeLocalWorkflows = localWorkflows ?? [];
  const safeCloudWorkflows = cloudWorkflows ?? [];

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDelete = async (id: string, isCloud: boolean) => {
    if (!confirm('このワークフローを削除しますか？')) return;

    setDeletingId(id);
    try {
      if (isCloud && onDeleteCloud) {
        await onDeleteCloud(id);
      } else {
        onDeleteLocal(id);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    if (!onDuplicateCloud) return;

    setDuplicatingId(id);
    try {
      await onDuplicateCloud(id);
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleLoad = async (id: string, isCloud: boolean) => {
    if (isCloud && onLoadCloud) {
      await onLoadCloud(id);
    } else {
      onLoadLocal(id);
    }
    onClose();
  };

  const workflows = activeTab === 'local' ? safeLocalWorkflows : safeCloudWorkflows;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#2a2a2a] rounded-xl border border-[#404040] w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-[#404040]">
          <h3 className="text-lg font-semibold text-white">ワークフローを開く</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-[#404040] shrink-0">
          <button
            onClick={() => setActiveTab('local')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors',
              activeTab === 'local'
                ? 'text-[#fce300] border-b-2 border-[#fce300]'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <HardDrive className="w-4 h-4" />
            ローカル ({safeLocalWorkflows.length})
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors',
              activeTab === 'cloud'
                ? 'text-[#fce300] border-b-2 border-[#fce300]'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <Cloud className="w-4 h-4" />
            クラウド ({safeCloudWorkflows.length})
          </button>
        </div>

        {/* リスト */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'cloud' && isLoadingCloud ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#fce300]" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {activeTab === 'local'
                ? '保存されたワークフローがありません'
                : 'クラウドにワークフローがありません'}
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.map((workflow) => {
                const isLocalWorkflow = 'updatedAt' in workflow;
                const updatedAt = isLocalWorkflow ? workflow.updatedAt : workflow.updated_at;
                const thumbnail = isLocalWorkflow ? workflow.thumbnail : (workflow as CloudWorkflowListItem).thumbnail_url;

                return (
                  <div
                    key={workflow.id}
                    className="group flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#404040] hover:border-[#505050] cursor-pointer transition-colors"
                    onClick={() => handleLoad(workflow.id, activeTab === 'cloud')}
                  >
                    {/* サムネイル */}
                    <div className="w-12 h-12 rounded-lg bg-[#2a2a2a] flex items-center justify-center overflow-hidden shrink-0">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-gray-600 text-[10px]">No Preview</div>
                      )}
                    </div>

                    {/* 情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">{workflow.name}</span>
                        {!isLocalWorkflow && (workflow as CloudWorkflowListItem).is_public && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                            公開
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(updatedAt)}
                      </div>
                    </div>

                    {/* アクション */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {activeTab === 'cloud' && onDuplicateCloud && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(workflow.id);
                          }}
                          disabled={duplicatingId === workflow.id}
                          className="p-1.5 rounded hover:bg-[#2a2a2a] text-gray-400 hover:text-white disabled:opacity-50"
                          title="複製"
                        >
                          {duplicatingId === workflow.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(workflow.id, activeTab === 'cloud');
                        }}
                        disabled={deletingId === workflow.id}
                        className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 disabled:opacity-50"
                        title="削除"
                      >
                        {deletingId === workflow.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
