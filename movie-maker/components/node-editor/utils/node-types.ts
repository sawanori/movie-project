import type { NodeTypes } from '@xyflow/react';
import { ImageInputNode } from '../nodes/ImageInputNode';
import { VideoInputNode } from '../nodes/VideoInputNode';
import { PromptNode } from '../nodes/PromptNode';
import { ProviderNode } from '../nodes/ProviderNode';
import { CameraWorkNode } from '../nodes/CameraWorkNode';
import { GenerateNode } from '../nodes/GenerateNode';
// Phase 2
import { KlingModeNode } from '../nodes/KlingModeNode';
import { KlingElementsNode } from '../nodes/KlingElementsNode';
import { KlingEndFrameNode } from '../nodes/KlingEndFrameNode';
import { KlingCameraControlNode } from '../nodes/KlingCameraControlNode';
import { ActTwoNode } from '../nodes/ActTwoNode';
import { HailuoEndFrameNode } from '../nodes/HailuoEndFrameNode';
// Phase 3
import { BGMNode } from '../nodes/BGMNode';
import { FilmGrainNode } from '../nodes/FilmGrainNode';
import { LUTNode } from '../nodes/LUTNode';
import { OverlayNode } from '../nodes/OverlayNode';
// Phase 4
import { DialogueNode } from '../nodes/DialogueNode';
// Phase 5: Utility ノード
import { GetVideoFrameNode } from '../nodes/GetVideoFrameNode';
import { TrimVideoNode } from '../nodes/TrimVideoNode';
import { StitchVideosNode } from '../nodes/StitchVideosNode';
import { StickyNoteNode } from '../nodes/StickyNoteNode';

/**
 * ノードタイプ登録
 * React Flowに登録するカスタムノードコンポーネントのマッピング
 */
export const nodeTypes: NodeTypes = {
  imageInput: ImageInputNode,
  videoInput: VideoInputNode,
  prompt: PromptNode,
  provider: ProviderNode,
  cameraWork: CameraWorkNode,
  generate: GenerateNode,
  // Phase 2: プロバイダー固有ノード
  klingMode: KlingModeNode,
  klingElements: KlingElementsNode,
  klingEndFrame: KlingEndFrameNode,
  klingCameraControl: KlingCameraControlNode,
  actTwo: ActTwoNode,
  hailuoEndFrame: HailuoEndFrameNode,
  // Phase 3: 後処理ノード
  bgm: BGMNode,
  filmGrain: FilmGrainNode,
  lut: LUTNode,
  overlay: OverlayNode,
  // Phase 4: Dialogue ノード
  dialogue: DialogueNode,
  // Phase 5: Utility ノード
  getVideoFrame: GetVideoFrameNode,
  trimVideo: TrimVideoNode,
  stitchVideos: StitchVideosNode,
  stickyNote: StickyNoteNode,
};

/**
 * エッジのデフォルトスタイル
 */
export const defaultEdgeOptions = {
  style: {
    strokeWidth: 2,
    stroke: '#fce300',
  },
  type: 'smoothstep',
  animated: true,
};

/**
 * フィットビューのオプション
 */
export const fitViewOptions = {
  padding: 0.2,
  maxZoom: 1.5,
  minZoom: 0.1,
};

/**
 * コネクションラインのスタイル
 */
export const connectionLineStyle = {
  strokeWidth: 2,
  stroke: '#fce300',
};
