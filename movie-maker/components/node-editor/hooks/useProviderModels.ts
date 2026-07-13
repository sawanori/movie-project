import useSWR, { type SWRResponse } from 'swr';
import { gatewayApi } from '@/lib/api/client';
import type { ProviderMetadata } from '@/lib/types/provider-metadata';

const SWR_KEY = 'gateway-provider-models';

// 24h (Number.MAX_SAFE_INTEGER だと内部 setTimeout が 32-bit overflow するため抑制)
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gateway 登録モデルのメタデータ (`GET /api/v1/config/models`) を SWR で取得する hook。
 * ProviderNode の「おまかせ」表示に使う。
 * - 取得失敗時は data が undefined / error が設定される。呼び出し側は静的リストへフォールバックする。
 * - メタデータはほぼ static なため revalidation を off + dedupingInterval 24h。
 */
export function useProviderModels(): SWRResponse<ProviderMetadata[]> {
  return useSWR<ProviderMetadata[]>(SWR_KEY, () => gatewayApi.listModels(), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    dedupingInterval: ONE_DAY_MS,
    shouldRetryOnError: false,
  });
}
