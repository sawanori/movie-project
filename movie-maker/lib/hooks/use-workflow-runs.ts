import useSWR, { type SWRResponse } from 'swr';
import {
  workflowRunsApi,
  type WorkflowRunListResponse,
  type WorkflowRunDetail,
  type WorkflowRunResponse,
  type WorkflowRunStatus,
} from '@/lib/api/client';

const POLL_INTERVAL_MS = 3000;

const TERMINAL_STATUSES: readonly WorkflowRunStatus[] = [
  'completed',
  'failed',
  'canceled',
];

/** run が終了状態 (これ以上更新されない) かどうか。 */
export function isRunTerminal(status: WorkflowRunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * 全 run が terminal かどうか。空配列はポーリング対象が無いため terminal 扱い。
 */
export function allRunsTerminal(runs: WorkflowRunResponse[]): boolean {
  return runs.every((run) => isRunTerminal(run.status));
}

/**
 * ワークフローの実行一覧を 3 秒ポーリングで取得する。
 * 全 run が terminal になったら refreshInterval を 0 にしてポーリングを止める。
 * workflowId が null の場合は fetch しない。
 */
export function useWorkflowRuns(
  workflowId: string | null,
): SWRResponse<WorkflowRunListResponse> {
  return useSWR<WorkflowRunListResponse>(
    workflowId ? ['workflow-runs', workflowId] : null,
    () => workflowRunsApi.listRuns({ workflow_id: workflowId as string }),
    {
      refreshInterval: (latest) =>
        latest && allRunsTerminal(latest.runs) ? 0 : POLL_INTERVAL_MS,
      revalidateOnFocus: false,
    },
  );
}

/**
 * 単一の実行詳細 (steps 含む) を 3 秒ポーリングで取得する。
 * 対象 run が terminal になったら refreshInterval を 0 にしてポーリングを止める。
 * runId が null の場合は fetch しない。
 */
export function useWorkflowRunDetail(
  runId: string | null,
): SWRResponse<WorkflowRunDetail> {
  return useSWR<WorkflowRunDetail>(
    runId ? ['workflow-run-detail', runId] : null,
    () => workflowRunsApi.getRun(runId as string),
    {
      refreshInterval: (latest) =>
        latest && isRunTerminal(latest.status) ? 0 : POLL_INTERVAL_MS,
      revalidateOnFocus: false,
    },
  );
}
