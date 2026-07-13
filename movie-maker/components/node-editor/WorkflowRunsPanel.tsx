'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Download, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { workflowRunsApi, type WorkflowRunResponse } from '@/lib/api/client';
import { useWorkflowRuns, useWorkflowRunDetail } from '@/lib/hooks/use-workflow-runs';
import {
  getRunStatusMeta,
  getStepStatusMeta,
  isCancelableRunStatus,
} from './workflow-run-status';

interface WorkflowRunsPanelProps {
  /** 対象ワークフローのサーバー側 ID。null の場合は一覧を取得しない。 */
  workflowId: string | null;
  /** 開いた直後に選択状態にする run ID。 */
  initialRunId?: string | null;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** batch_id ごとに run をまとめる (batch_id 無しは run.id を単独 batch 扱い)。 */
function groupByBatch(
  runs: WorkflowRunResponse[],
): { batchId: string; runs: WorkflowRunResponse[] }[] {
  const map = new Map<string, WorkflowRunResponse[]>();
  for (const run of runs) {
    const key = run.batch_id ?? run.id;
    const list = map.get(key);
    if (list) {
      list.push(run);
    } else {
      map.set(key, [run]);
    }
  }
  return Array.from(map.entries()).map(([batchId, batchRuns]) => ({
    batchId,
    runs: batchRuns,
  }));
}

export function WorkflowRunsPanel({
  workflowId,
  initialRunId = null,
  onClose,
}: WorkflowRunsPanelProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data: listData, isLoading: isListLoading, mutate: mutateList } =
    useWorkflowRuns(workflowId);
  const { data: detail, mutate: mutateDetail } =
    useWorkflowRunDetail(selectedRunId);

  useEffect(() => {
    setSelectedRunId(initialRunId);
  }, [initialRunId]);

  const batches = useMemo(
    () => groupByBatch(listData?.runs ?? []),
    [listData?.runs],
  );

  const handleCancel = useCallback(
    async (runId: string) => {
      setCancelingId(runId);
      setCancelError(null);
      try {
        await workflowRunsApi.cancelRun(runId);
        await Promise.all([mutateList(), mutateDetail()]);
      } catch (error) {
        setCancelError(
          error instanceof Error
            ? error.message
            : 'キャンセルに失敗しました',
        );
      } finally {
        setCancelingId(null);
      }
    },
    [mutateList, mutateDetail],
  );

  return (
    <div
      className={cn(
        // lg 未満: フルスクリーンドロワー / lg 以上: 右サイドパネル
        'fixed inset-0 z-40 flex flex-col bg-[#1a1a1a] border-[#404040]',
        'lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[420px] lg:border-l',
      )}
      role="dialog"
      aria-label="サーバー実行履歴"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#404040] shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">サーバー実行履歴</h3>
          <button
            onClick={() => mutateList()}
            className="p-1 rounded hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
            title="更新"
            aria-label="更新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#2a2a2a] text-gray-400 hover:text-white transition-colors"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        {/* 実行一覧 */}
        <div className="p-3 border-b border-[#404040]">
          {isListLoading && !listData ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              読み込み中...
            </div>
          ) : batches.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">
              まだ実行履歴がありません
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {batches.map((batch) => (
                <div key={batch.batchId} className="flex flex-col gap-1">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1">
                    バッチ {batch.batchId.slice(0, 8)}（{batch.runs.length}件）
                  </div>
                  <div className="flex flex-col gap-1">
                    {batch.runs.map((run) => {
                      const meta = getRunStatusMeta(run.status);
                      const isSelected = run.id === selectedRunId;
                      return (
                        <button
                          key={run.id}
                          onClick={() => setSelectedRunId(run.id)}
                          className={cn(
                            'flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors',
                            isSelected
                              ? 'border-[#fce300] bg-[#fce300]/10'
                              : 'border-[#404040] hover:border-[#505050] bg-[#212121]',
                          )}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-white truncate">
                              {run.id.slice(0, 8)}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {formatTime(run.created_at)}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full shrink-0',
                              meta.className,
                            )}
                          >
                            {meta.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 実行詳細 */}
        <div className="p-3 flex-1">
          {!selectedRunId ? (
            <p className="text-xs text-gray-500 py-4 text-center">
              実行を選択すると詳細が表示されます
            </p>
          ) : !detail ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              詳細を読み込み中...
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* 実行ステータスとキャンセル */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full',
                      getRunStatusMeta(detail.status).className,
                    )}
                  >
                    {getRunStatusMeta(detail.status).label}
                  </span>
                  <span className="text-xs text-gray-400">
                    {detail.progress}%
                  </span>
                </div>
                <button
                  onClick={() => handleCancel(detail.id)}
                  disabled={
                    !isCancelableRunStatus(detail.status) ||
                    cancelingId === detail.id
                  }
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors',
                    isCancelableRunStatus(detail.status) &&
                      cancelingId !== detail.id
                      ? 'border border-red-500/40 text-red-400 hover:bg-red-500/10'
                      : 'border border-[#404040] text-gray-600 cursor-not-allowed',
                  )}
                >
                  {cancelingId === detail.id && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  キャンセル
                </button>
              </div>

              {cancelError && (
                <p className="text-xs text-red-400">{cancelError}</p>
              )}

              {/* 実行全体のエラー */}
              {detail.error_message && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-400 break-words">
                    {detail.error_message}
                  </p>
                </div>
              )}

              {/* 最終成果物 */}
              {detail.final_output_url && (
                <div className="flex flex-col gap-2 p-2 bg-[#212121] border border-[#404040] rounded-lg">
                  <video
                    src={detail.final_output_url}
                    controls
                    className="w-full rounded"
                  />
                  <a
                    href={detail.final_output_url}
                    download
                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#fce300] text-[#212121] text-xs font-medium rounded-lg hover:bg-[#e5cf00] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ダウンロード
                  </a>
                </div>
              )}

              {/* ステップ一覧 */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 px-1">
                  ステップ
                </span>
                {detail.steps.length === 0 ? (
                  <p className="text-xs text-gray-500 px-1">
                    ステップ情報はまだありません
                  </p>
                ) : (
                  detail.steps.map((step) => {
                    const meta = getStepStatusMeta(step.status);
                    return (
                      <div
                        key={step.node_id}
                        className="flex flex-col gap-1 px-2 py-1.5 bg-[#212121] border border-[#404040] rounded-lg"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-white truncate">
                            {step.node_type}
                            {step.provider_used && (
                              <span className="text-gray-500">
                                {' '}
                                / {step.provider_used}
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full shrink-0',
                              meta.className,
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>
                        {step.error_message && (
                          <p className="text-[11px] text-red-400 break-words">
                            {step.error_message}
                          </p>
                        )}
                        {step.output_url && (
                          <a
                            href={step.output_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                            中間出力を開く
                          </a>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
