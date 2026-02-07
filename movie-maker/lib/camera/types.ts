// カメラワーク関連の型定義

import type { VideoProvider } from '@/lib/types/video';

export type CameraPreset = 'simple' | 'custom';

/** 動画生成プロバイダー（lib/types/video.tsから再エクスポート） */
export type { VideoProvider } from '@/lib/types/video';

/**
 * カメラワークのプロバイダー別サポートレベル
 * - 'native': APIパラメータで確実に制御される（100%動作保証）
 * - 'prompt': プロンプトベースで制御（動作は保証されない）
 * - 'unsupported': 非対応（選択不可）
 */
export type CameraSupportLevel = 'native' | 'prompt' | 'unsupported';

export type CameraCategory =
  | 'static'       // 動かさない
  | 'approach'     // 近づく・離れる
  | 'horizontal'   // 左右に動く
  | 'vertical'     // 上下に動く
  | 'orbit'        // 回り込む
  | 'follow'       // 追いかける
  | 'dramatic'     // ドラマ演出
  | 'timelapse';   // 時間表現

export interface CameraPresetConfig {
  id: CameraPreset;
  icon: string;
  label: string;
  description: string;
  cameraWorkIds: number[];
  promptText: string;
}

export interface CameraWork {
  id: number;
  name: string;
  label: string;
  description: string;
  category: CameraCategory;
  promptText: string;
  iconSymbol: string;
  /** APIパラメータで確実に制御される（true = 100%動作保証） */
  guaranteed?: boolean;
  /** 対応しているプロバイダー（指定がない場合は両方対応） */
  providers?: VideoProvider[];
}

export interface CameraCategoryConfig {
  id: CameraCategory;
  label: string;
  icon: string;
  description: string;
}

export interface CameraWorkSelection {
  preset: CameraPreset;
  customCameraWork?: CameraWork;
  promptText: string;
}
