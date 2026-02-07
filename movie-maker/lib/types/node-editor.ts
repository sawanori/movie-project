import type { Node, Edge } from '@xyflow/react';

// ========== ビデオプロバイダー型（既存型との互換性維持） ==========

export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';

// ========== ノードタイプ定義 ==========

export type NodeType =
  | 'imageInput'
  | 'videoInput'
  | 'prompt'
  | 'provider'
  | 'cameraWork'
  | 'generate'
  // Kling専用
  | 'klingMode'
  | 'klingElements'
  | 'klingEndFrame'
  | 'klingCameraControl'
  // Runway専用
  | 'actTwo'
  // Hailuo専用
  | 'hailuoEndFrame'
  // 後処理
  | 'bgm'
  | 'filmGrain'
  | 'lut'
  | 'overlay';

// ========== サブジェクトタイプ ==========

export type SubjectType = 'person' | 'object' | 'animation';

// ========== 基本ノードデータインターフェース ==========

interface BaseNodeData {
  type: NodeType;
  isValid: boolean;
  errorMessage?: string;
  [key: string]: unknown; // React Flow互換のためのインデックスシグネチャ
}

// ========== 各ノードデータ型定義 ==========

export interface ImageInputNodeData extends BaseNodeData {
  type: 'imageInput';
  imageUrl: string | null;
  imagePreview: string | null;
}

export interface VideoInputNodeData extends BaseNodeData {
  type: 'videoInput';
  videoUrl: string | null;
  videoThumbnail: string | null;
  videoDuration: number | null;
  sourceType: 'upload' | 'history' | 'url';
  fileSize?: number;
  mimeType?: string;
}

export interface PromptNodeData extends BaseNodeData {
  type: 'prompt';
  japanesePrompt: string;
  englishPrompt: string;
  isTranslating: boolean;
  subjectType: SubjectType;
}

export interface ProviderNodeData extends BaseNodeData {
  type: 'provider';
  provider: VideoProvider;
  aspectRatio: '9:16' | '16:9';
}

export interface CameraWorkNodeData extends BaseNodeData {
  type: 'cameraWork';
  cameraWorkId: number | null;
  promptText: string;
}

export interface GenerateNodeData extends BaseNodeData {
  type: 'generate';
  isGenerating: boolean;
  progress: number;
  videoUrl: string | null;
  error: string | null;
}

// ========== Kling専用ノードデータ ==========

export interface KlingModeNodeData extends BaseNodeData {
  type: 'klingMode';
  mode: 'std' | 'pro';
}

export interface KlingElementsNodeData extends BaseNodeData {
  type: 'klingElements';
  elementImages: string[]; // 最大3枚
}

export interface KlingEndFrameNodeData extends BaseNodeData {
  type: 'klingEndFrame';
  endFrameImageUrl: string | null;
}

// カメラコントロール設定型
export interface KlingCameraControlConfig {
  horizontal: number;  // -10〜10（左右移動）
  vertical: number;    // -10〜10（前後移動）
  pan: number;         // -10〜10（左右回転）
  tilt: number;        // -10〜10（上下回転）
  roll: number;        // -10〜10（傾き）
  zoom: number;        // -10〜10（ズーム）
}

export interface KlingCameraControlNodeData extends BaseNodeData {
  type: 'klingCameraControl';
  config: KlingCameraControlConfig;
}

// ========== Runway Act-Two ノードデータ ==========

export interface ActTwoNodeData extends BaseNodeData {
  type: 'actTwo';
  useActTwo: boolean;
  motionType: string | null;
  expressionIntensity: number; // 1-5
  bodyControl: boolean;
}

// ========== Hailuo専用ノードデータ ==========

export interface HailuoEndFrameNodeData extends BaseNodeData {
  type: 'hailuoEndFrame';
  lastFrameImageUrl: string | null;
}

// ========== 後処理ノードデータ ==========

export interface BGMNodeData extends BaseNodeData {
  type: 'bgm';
  bgmTrackId: string | null;
  customBgmUrl: string | null;
}

export interface FilmGrainNodeData extends BaseNodeData {
  type: 'filmGrain';
  grain: 'none' | 'light' | 'medium' | 'heavy';
}

export interface LUTNodeData extends BaseNodeData {
  type: 'lut';
  useLut: boolean;
}

export interface OverlayNodeData extends BaseNodeData {
  type: 'overlay';
  text: string;
  position: 'top' | 'center' | 'bottom';
  font: string;
  color: string;
}

// ========== Union Type ==========

export type WorkflowNodeData =
  | ImageInputNodeData
  | VideoInputNodeData
  | PromptNodeData
  | ProviderNodeData
  | CameraWorkNodeData
  | GenerateNodeData
  | KlingModeNodeData
  | KlingElementsNodeData
  | KlingEndFrameNodeData
  | KlingCameraControlNodeData
  | ActTwoNodeData
  | HailuoEndFrameNodeData
  | BGMNodeData
  | FilmGrainNodeData
  | LUTNodeData
  | OverlayNodeData;

// ========== ワークフローノード・エッジ型 ==========

export type WorkflowNode = Node<WorkflowNodeData>;

// ========== ワークフロー型 ==========

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: Edge[];
  createdAt: string;
  updatedAt: string;
}

// ========== バリデーションエラー型 ==========

export interface ValidationError {
  type: 'missing_node' | 'disconnected' | 'invalid_value' | 'provider_mismatch';
  nodeId?: string;
  message: string;
}

// ========== ノードパレット用 ==========

export interface NodePaletteItem {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  category: 'input' | 'config' | 'provider-specific' | 'post-processing' | 'output';
  availableFor?: VideoProvider[]; // 特定プロバイダー専用の場合
}

// ========== デフォルトノードデータファクトリ ==========

export function createDefaultNodeData(type: NodeType): WorkflowNodeData {
  switch (type) {
    case 'imageInput':
      return {
        type: 'imageInput',
        isValid: false,
        imageUrl: null,
        imagePreview: null,
      };
    case 'videoInput':
      return {
        type: 'videoInput',
        isValid: false,
        videoUrl: null,
        videoThumbnail: null,
        videoDuration: null,
        sourceType: 'upload',
      };
    case 'prompt':
      return {
        type: 'prompt',
        isValid: false,
        japanesePrompt: '',
        englishPrompt: '',
        isTranslating: false,
        subjectType: 'person',
      };
    case 'provider':
      return {
        type: 'provider',
        isValid: true,
        provider: 'runway',
        aspectRatio: '9:16',
      };
    case 'cameraWork':
      return {
        type: 'cameraWork',
        isValid: true,
        cameraWorkId: null,
        promptText: '',
      };
    case 'generate':
      return {
        type: 'generate',
        isValid: false,
        isGenerating: false,
        progress: 0,
        videoUrl: null,
        error: null,
      };
    case 'klingMode':
      return {
        type: 'klingMode',
        isValid: true,
        mode: 'std',
      };
    case 'klingElements':
      return {
        type: 'klingElements',
        isValid: true,
        elementImages: [],
      };
    case 'klingEndFrame':
      return {
        type: 'klingEndFrame',
        isValid: true,
        endFrameImageUrl: null,
      };
    case 'klingCameraControl':
      return {
        type: 'klingCameraControl',
        isValid: true,
        config: {
          horizontal: 0,
          vertical: 0,
          pan: 0,
          tilt: 0,
          roll: 0,
          zoom: 0,
        },
      };
    case 'actTwo':
      return {
        type: 'actTwo',
        isValid: true,
        useActTwo: false,
        motionType: null,
        expressionIntensity: 3,
        bodyControl: false,
      };
    case 'hailuoEndFrame':
      return {
        type: 'hailuoEndFrame',
        isValid: true,
        lastFrameImageUrl: null,
      };
    case 'bgm':
      return {
        type: 'bgm',
        isValid: true,
        bgmTrackId: null,
        customBgmUrl: null,
      };
    case 'filmGrain':
      return {
        type: 'filmGrain',
        isValid: true,
        grain: 'medium',
      };
    case 'lut':
      return {
        type: 'lut',
        isValid: true,
        useLut: true,
      };
    case 'overlay':
      return {
        type: 'overlay',
        isValid: true,
        text: '',
        position: 'bottom',
        font: 'sans-serif',
        color: '#ffffff',
      };
    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

// ========== ハンドルID定義 ==========

export const HANDLE_IDS = {
  // ImageInputNode
  IMAGE_OUTPUT: 'image_url',
  // PromptNode
  STORY_TEXT_OUTPUT: 'story_text',
  SUBJECT_TYPE_OUTPUT: 'subject_type',
  // ProviderNode
  CONFIG_OUTPUT: 'config',
  // CameraWorkNode
  PROVIDER_INPUT: 'provider',
  CAMERA_WORK_OUTPUT: 'camera_work',
  // GenerateNode
  IMAGE_INPUT: 'image_url',
  STORY_TEXT_INPUT: 'story_text',
  CONFIG_INPUT: 'config',
  CAMERA_WORK_INPUT: 'camera_work',
  VIDEO_OUTPUT: 'video_url',
  // Kling
  KLING_MODE_OUTPUT: 'kling_mode',
  KLING_ELEMENTS_OUTPUT: 'kling_elements',
  KLING_END_FRAME_OUTPUT: 'kling_end_frame',
  KLING_CAMERA_CONTROL_OUTPUT: 'kling_camera_control',
  // ActTwo
  ACT_TWO_OUTPUT: 'act_two',
  // Hailuo
  HAILUO_END_FRAME_OUTPUT: 'hailuo_end_frame',
  // V2V
  SOURCE_VIDEO_OUTPUT: 'source_video_url',
  SOURCE_VIDEO_INPUT: 'source_video_url',
  // 後処理
  BGM_OUTPUT: 'bgm',
  FILM_GRAIN_OUTPUT: 'film_grain',
  LUT_OUTPUT: 'lut',
  OVERLAY_OUTPUT: 'overlay',
} as const;

// ========== ノードカテゴリ定義 ==========

export const NODE_CATEGORIES = {
  input: {
    label: '入力',
    description: '画像・動画・プロンプト入力',
    nodes: ['imageInput', 'videoInput', 'prompt'] as NodeType[],
  },
  config: {
    label: '設定',
    description: 'プロバイダー・カメラワーク設定',
    nodes: ['provider', 'cameraWork'] as NodeType[],
  },
  'provider-specific': {
    label: 'プロバイダー専用',
    description: '特定プロバイダー用の追加設定',
    nodes: ['klingMode', 'klingElements', 'klingEndFrame', 'klingCameraControl', 'actTwo', 'hailuoEndFrame'] as NodeType[],
  },
  'post-processing': {
    label: '後処理',
    description: 'BGM・フィルター等',
    nodes: ['bgm', 'filmGrain', 'lut', 'overlay'] as NodeType[],
  },
  output: {
    label: '出力',
    description: '動画生成',
    nodes: ['generate'] as NodeType[],
  },
} as const;

// ========== プロバイダー別ノード利用可否 ==========

export const PROVIDER_NODE_AVAILABILITY: Record<VideoProvider, NodeType[]> = {
  runway: ['actTwo', 'videoInput'],
  piapi_kling: ['klingMode', 'klingElements', 'klingEndFrame', 'klingCameraControl'],
  veo: [],
  domoai: [],
  hailuo: ['hailuoEndFrame'],
};

// ========== ワークフロー管理型（Phase 4追加） ==========

/**
 * ローカル保存用ワークフロー（既存Workflow型を継承）
 */
export interface SavedWorkflow extends Workflow {
  thumbnail?: string; // Base64エンコードされたプレビュー画像（オプション）
}

/**
 * ワークフロー一覧表示用の軽量型
 */
export interface WorkflowListItem {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
}

/**
 * クラウド保存用の追加メタデータ
 */
export interface CloudWorkflowMetadata {
  description?: string;
  isPublic: boolean;
  thumbnailUrl?: string;
}

// ========== API リクエスト型（graph-to-api用） ==========

export interface StoryVideoCreateRequest {
  // 必須
  image_url: string;
  story_text: string;
  // 基本設定
  aspect_ratio?: '9:16' | '16:9';
  video_provider?: VideoProvider;
  // V2V設定
  video_mode?: 'i2v' | 'v2v';
  source_video_url?: string;
  subject_type?: SubjectType;
  // BGM
  bgm_track_id?: string;
  custom_bgm_url?: string;
  // 後処理
  overlay?: { text?: string; position?: string; font?: string; color?: string };
  camera_work?: string;
  film_grain?: 'none' | 'light' | 'medium' | 'heavy';
  use_lut?: boolean;
  // Act-Two
  use_act_two?: boolean;
  motion_type?: string;
  expression_intensity?: number;
  body_control?: boolean;
  // Kling専用
  kling_mode?: 'std' | 'pro';
  end_frame_image_url?: string;
  element_images?: { image_url: string }[];
  kling_camera_control?: {
    horizontal: number;
    vertical: number;
    pan: number;
    tilt: number;
    roll: number;
    zoom: number;
  };
}
