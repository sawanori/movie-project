import type {
  WorkflowRunStatus,
  WorkflowRunStepStatusValue,
} from '@/lib/api/client';

interface StatusMeta {
  label: string;
  /** Tailwind クラス (背景 + 文字色)。 */
  className: string;
}

const RUN_STATUS_META: Record<WorkflowRunStatus, StatusMeta> = {
  pending: { label: '待機中', className: 'bg-gray-500/20 text-gray-300' },
  submitting: { label: '送信中', className: 'bg-blue-500/20 text-blue-300' },
  processing: { label: '処理中', className: 'bg-yellow-500/20 text-yellow-300' },
  completed: { label: '完了', className: 'bg-green-500/20 text-green-300' },
  failed: { label: '失敗', className: 'bg-red-500/20 text-red-300' },
  canceled: { label: 'キャンセル済み', className: 'bg-gray-600/30 text-gray-400' },
};

const STEP_STATUS_META: Record<WorkflowRunStepStatusValue, StatusMeta> = {
  pending: { label: '待機中', className: 'bg-gray-500/20 text-gray-300' },
  submitting: { label: '送信中', className: 'bg-blue-500/20 text-blue-300' },
  processing: { label: '処理中', className: 'bg-yellow-500/20 text-yellow-300' },
  completed: { label: '完了', className: 'bg-green-500/20 text-green-300' },
  failed: { label: '失敗', className: 'bg-red-500/20 text-red-300' },
  skipped: { label: 'スキップ', className: 'bg-gray-600/30 text-gray-400' },
};

export function getRunStatusMeta(status: WorkflowRunStatus): StatusMeta {
  return RUN_STATUS_META[status];
}

export function getStepStatusMeta(
  status: WorkflowRunStepStatusValue,
): StatusMeta {
  return STEP_STATUS_META[status];
}

/** pending / submitting / processing のみキャンセル可能。 */
export function isCancelableRunStatus(status: WorkflowRunStatus): boolean {
  return (
    status === 'pending' ||
    status === 'submitting' ||
    status === 'processing'
  );
}
