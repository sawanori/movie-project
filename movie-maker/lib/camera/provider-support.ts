/**
 * プロバイダー別カメラワークサポート情報
 *
 * このモジュールは、各プロバイダーがどのカメラワークをネイティブAPIパラメータで
 * 制御できるかを定義します。UIでサポートレベルを表示するために使用されます。
 */

import { VideoProvider, CameraSupportLevel } from './types';

/**
 * Hailuoでネイティブサポートされているカメラワーク
 * バックエンドの HAILUO_CAMERA_MAPPING と同期する必要あり
 * 参照: movie-maker-api/app/external/hailuo_provider.py
 */
export const HAILUO_NATIVE_WORKS: Set<string> = new Set([
  // 基本移動（17種 - フロントエンドと完全一致）
  'dolly_in',
  'dolly_out',
  'push_in',
  'pull_out',
  'truck_left',
  'truck_right',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'pedestal_up',
  'pedestal_down',
  'zoom_in',
  'zoom_out',
  'crane_up',
  'crane_down',
  'static_shot',
  // フロントエンド名のエイリアス（追加分）
  'tracking',
  'arc_shot',
  'orbit_clockwise',
  'orbit_counterclockwise',
  'orbit_shot',
  'circle_slow',
  '360_shot',
]);

/**
 * VEOで非対応のカメラワーク（360度回転系など）
 * providers: ['runway'] が設定されているカメラワーク
 */
export const VEO_UNSUPPORTED_WORKS: Set<string> = new Set([
  // orbit系（360度回転）
  'orbit_clockwise',
  'orbit_counterclockwise',
  'circle_slow',
  'orbit_shot',
  '360_shot',
  'arc_left_tilt_up',
  'arc_right_tilt_down',
  'rotate_vertical',
  'rotate_left_45',
  'rotate_right_45',
  'rotate_360',
  'rotate_looking_up',
  'orbit_group',
  'circle_statue',
  'rotate_table_conversation',
  'circle_duel',
  // 複合動作
  'dolly_in_tilt_up',
  'dolly_zoom_in',
  'dolly_zoom_out',
  'tilt_zoom_combo',
  'jib_up_tilt_down',
  'jib_down_tilt_up',
  // 特殊効果
  'steadicam',
  'dutch_angle',
  'rotational_shot',
]);

/**
 * カメラワーク名とプロバイダーからサポートレベルを取得
 *
 * @param cameraWorkName - カメラワーク名（例: 'zoom_in', 'orbit_clockwise'）
 * @param provider - 動画生成プロバイダー
 * @returns サポートレベル（'native', 'prompt', 'unsupported'）
 */
export function getCameraSupportLevel(
  cameraWorkName: string,
  provider: VideoProvider
): CameraSupportLevel {
  switch (provider) {
    case 'piapi_kling':
      // Klingは全てネイティブ対応（バックエンドで6軸パラメータにマッピング済み）
      return 'native';

    case 'hailuo':
      // Hailuoはマッピングされているもののみネイティブ
      return HAILUO_NATIVE_WORKS.has(cameraWorkName) ? 'native' : 'prompt';

    case 'domoai':
      // DomoAIはAPIがカメラパラメータをサポートしないため全てプロンプト
      return 'prompt';

    case 'runway':
      // Runwayは文字列パススルーで全てネイティブ扱い
      return 'native';

    case 'veo':
      // VEOは360度系が非対応、それ以外はプロンプト
      return VEO_UNSUPPORTED_WORKS.has(cameraWorkName) ? 'unsupported' : 'prompt';

    default:
      return 'prompt';
  }
}

/**
 * サポートレベルに応じたバッジ情報を取得
 */
export interface SupportBadgeInfo {
  label: string;
  className: string;
  description: string;
}

export function getSupportBadgeInfo(level: CameraSupportLevel): SupportBadgeInfo {
  switch (level) {
    case 'native':
      return {
        label: 'API保証',
        className: 'bg-green-900/50 text-green-400 border-green-700',
        description: 'APIパラメータで確実に制御されます',
      };
    case 'prompt':
      return {
        label: 'プロンプト',
        className: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
        description: '動作は保証されません',
      };
    case 'unsupported':
      return {
        label: '非対応',
        className: 'bg-red-900/50 text-red-400 border-red-700',
        description: 'このプロバイダーでは利用できません',
      };
  }
}
