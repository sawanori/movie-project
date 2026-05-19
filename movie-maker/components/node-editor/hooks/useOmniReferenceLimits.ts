import useSWR, { type SWRResponse } from 'swr';
import {
  fetchOmniReferenceLimits,
  type OmniReferenceLimits,
} from '@/lib/api/client';

/**
 * Provider 上限値が無いと UI 描画ができないため、
 * fetch 失敗時 / ローディング時に使うフォールバック値。
 * 値は backend `app/core/config.py` のデフォルトと一致させる。
 */
export const OMNI_REFERENCE_LIMITS_FALLBACK: OmniReferenceLimits = {
  max_image_urls: 9,
  max_video_urls: 3,
  max_audio_urls: 3,
  max_video_total_seconds: 15.4,
  max_audio_total_seconds: 15.0,
  max_image_reference_asset_ids: 8,
  upload_file_size_limits: {
    video: 52_428_800,
    audio: 10_485_760,
    image: 10_485_760,
  },
  consent_required: true,
  asset_ttl_seconds: 259_200,
};

const SWR_KEY = 'omni-reference-limits';

// 24h (Number.MAX_SAFE_INTEGER だと内部 setTimeout が 32-bit overflow するため抑制)
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Omni Reference 制約値を取得する SWR hook。
 * - dedupingInterval を 24h に設定し session 中は実質 1 回しか fetch しない
 * - revalidation 系を全て off (制約値はほぼ static)
 */
export function useOmniReferenceLimits(): SWRResponse<OmniReferenceLimits> {
  return useSWR<OmniReferenceLimits>(SWR_KEY, fetchOmniReferenceLimits, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    dedupingInterval: ONE_DAY_MS,
  });
}
