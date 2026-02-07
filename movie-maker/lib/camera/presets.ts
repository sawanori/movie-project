import { CameraPresetConfig, CameraCategoryConfig } from './types';

export const CAMERA_PRESETS: CameraPresetConfig[] = [
  {
    id: 'simple',
    icon: '📍',
    label: 'シンプル',
    description: 'カメラ固定。被写体の動きだけに集中させる',
    cameraWorkIds: [13],
    promptText: 'static shot, camera remains still',
  },
  {
    id: 'custom',
    icon: '⚙️',
    label: 'カスタム',
    description: '自分でカメラワークを選ぶ',
    cameraWorkIds: [],
    promptText: '',
  },
];

export const CAMERA_CATEGORIES: CameraCategoryConfig[] = [
  { id: 'static', label: '動かさない', icon: '📍', description: 'カメラ固定で被写体に集中' },
  { id: 'approach', label: '近づく・離れる', icon: '↔️', description: '被写体との距離を変える' },
  { id: 'horizontal', label: '左右に動く', icon: '↔', description: '横方向にカメラを動かす' },
  { id: 'vertical', label: '上下に動く', icon: '↕', description: '縦方向にカメラを動かす' },
  { id: 'orbit', label: '回り込む', icon: '🔄', description: '被写体の周りを回転' },
  { id: 'follow', label: '追いかける', icon: '🏃', description: '被写体を追従する' },
  { id: 'dramatic', label: 'ドラマ演出', icon: '🎬', description: '特殊な演出効果' },
  { id: 'timelapse', label: '時間表現', icon: '⏱️', description: '時間経過を表現' },
];
