import type { Node, Edge } from '@xyflow/react';

// ========== ビデオプロバイダー型（既存型との互換性維持） ==========

export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo' | 'seedance';

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
  | 'overlay'
  // Phase 4: Dialogue ノード (Pipeline 型: 動画 + TTS ミックス)
  | 'dialogue'
  // Phase 5: Utility Nodes
  | 'getVideoFrame'
  | 'trimVideo'
  | 'stitchVideos'
  | 'stickyNote'
  // Seedance Omni Reference (v3 §6.7)
  | 'omniReference';

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
  // プロバイダー選択モード。
  // 'explicit' (default/未指定): provider フィールドの具体プロバイダーを使う。
  // 'auto': provider を送らず selectionPriority でサーバー/ゲートウェイに自動選択させる。
  providerMode?: 'explicit' | 'auto';
  // providerMode='auto' 時の選択優先度 (default: 'quality')。
  selectionPriority?: 'quality' | 'speed' | 'cost';
  provider: VideoProvider;
  aspectRatio: '9:16' | '16:9';
  // 動画時間 (秒)。null = プロバイダーのデフォルト/固定値を使う。
  // Kling は 5/10、Seedance は 4-15、他プロバイダーは固定 (null のみ)。
  duration: number | null;
  // Seedance 選択時のモード (default: 'pro')
  seedanceMode?: 'pro' | 'fast';
  // === Seedance 詳細パラメータ ===
  seedanceGenerateAudio?: boolean;       // default: false
  seedanceSeed?: number | null;          // default: null (=ランダム)
  seedanceResolution?: '480p' | '720p' | '1080p';  // default: '720p'
  seedanceCameraFixed?: boolean;         // default: false
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
  /** Kling 3.0 Omni Elements 用の参照画像 URL 配列。最大 4 枚。 */
  elementImages: string[]; // 最大4枚
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

// ========== Phase 4: Dialogue ノードデータ (Pipeline 型) ==========

export interface DialogueNodeData extends BaseNodeData {
  type: 'dialogue';
  // 入力設定
  text: string;
  voiceId: string | null;
  language: 'ja';      // 固定
  speed: number;       // デフォルト 1.0
  // リップシンク (1 フィールドのみ)
  useLipSync: boolean; // default false。true で Hedra リップシンク経路
  ttsInstructions?: string;  // 感情/トーン指定。undefined = OpenAI プロバイダーのデフォルト適用
  // カナ表記 (Voicevox AquesTalk カナ記法)
  kanaText?: string;      // AquesTalk カナ表記 (ダンボ'ール 等)
  useKanaMode?: boolean;  // カナ表記モード有効化。false (デフォルト) = セリフテキストを使用
  // 実行状態
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;    // 0-100 (UI 表示用、ポーリング回数ベース)
  generationId: string | null;
  // 出力
  outputVideoUrl: string | null;
  // errorMessage は BaseNodeData から継承 (string | undefined) — 再宣言禁止
}

// ========== Phase 5: Utility Nodes ==========

export interface GetVideoFrameNodeData extends BaseNodeData {
  type: 'getVideoFrame';
  // 入力 (接続から受け取る)
  inputVideoUrl: string | null;
  // パラメータ
  direction: 'first' | 'last';
  // 実行状態
  status: 'idle' | 'processing' | 'completed' | 'failed';
  // 出力
  outputImageUrl: string | null;
  // errorMessage は BaseNodeData から継承
}

export interface TrimVideoNodeData extends BaseNodeData {
  type: 'trimVideo';
  // 入力 (接続から受け取る)
  inputVideoUrl: string | null;
  // パラメータ
  startSeconds: number;       // デフォルト 0
  endSeconds: number | null;  // null = 最後まで
  // 実行状態
  status: 'idle' | 'processing' | 'completed' | 'failed';
  // 出力
  outputVideoUrl: string | null;
}

export interface StitchVideosNodeData extends BaseNodeData {
  type: 'stitchVideos';
  // パラメータ
  transition: 'none' | 'crossfade'; // Phase 1 は 'none' のみ
  // 実行状態
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;        // 0-100
  stitchId: string | null; // バックエンドの結合ジョブID
  // 出力
  outputVideoUrl: string | null;
}

export interface StickyNoteNodeData extends BaseNodeData {
  type: 'stickyNote';
  text: string;
  color: 'yellow' | 'pink' | 'blue';
  // isValid は常に true (バリデーション不要)
}

// ========== Seedance Omni Reference ノードデータ (v3 §6.7) ==========

/**
 * Omni Reference ノードの 1 つの参照スロット。
 * mediaType により扱う媒体 (image/video/audio) を区別する。
 */
export interface OmniReferenceSlot {
  assetId: string | null;
  url?: string;
  filename?: string;
  durationSeconds?: number;
  mediaType: 'image' | 'video' | 'audio';
}

/**
 * Seedance Omni Reference ノード (Kling Elements 3.0 Omni とは別系統)。
 * v3 仕様:
 *  - imageSlots: 最大 8 枚 (base image_url と合算で 9 厳守)
 *  - videoSlots: 3 枠固定
 *  - audioSlots: 3 枠固定
 *  - consentAccepted: 利用同意 (人物素材含む場合 true 必須)
 */
export interface OmniReferenceNodeData extends BaseNodeData {
  type: 'omniReference';
  imageSlots: OmniReferenceSlot[];
  videoSlots: [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
  audioSlots: [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
  consentAccepted: boolean;
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
  | OverlayNodeData
  | DialogueNodeData
  // Phase 5: Utility Nodes
  | GetVideoFrameNodeData
  | TrimVideoNodeData
  | StitchVideosNodeData
  | StickyNoteNodeData
  | OmniReferenceNodeData;

// ========== B2 解決: 動画出力共通インターフェース ==========

/**
 * 動画出力を持つノードの共通インターフェース。
 * GenerateNodeData (videoUrl) と DialogueNodeData (outputVideoUrl) の両方に対応する。
 * upstream ノードから動画 URL を取得する際に使用する。
 */
export interface HasVideoOutput {
  videoUrl?: string | null;
  outputVideoUrl?: string | null;
}

/**
 * ノードデータから動画 URL を取得するヘルパー関数。
 * GenerateNodeData.videoUrl と DialogueNodeData.outputVideoUrl の両方を解決する。
 */
export function getNodeVideoOutput(data: unknown): string | null {
  const d = data as HasVideoOutput;
  return d?.outputVideoUrl ?? d?.videoUrl ?? null;
}

// ========== B3 解決: 画像出力共通インターフェース ==========

/**
 * 画像出力を持つノードの共通インターフェース。
 * ImageInputNodeData (imageUrl) と GetVideoFrameNodeData (outputImageUrl) の両方に対応する。
 */
export interface HasImageOutput {
  imageUrl?: string | null;
  outputImageUrl?: string | null;
}

/**
 * ノードデータから画像 URL を取得するヘルパー関数。
 * ImageInputNodeData.imageUrl と GetVideoFrameNodeData.outputImageUrl の両方を解決する。
 */
export function getNodeImageOutput(data: unknown): string | null {
  const d = data as HasImageOutput;
  return d?.outputImageUrl ?? d?.imageUrl ?? null;
}

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
  type:
    | 'missing_node'
    | 'disconnected'
    | 'invalid_value'
    | 'provider_mismatch'
    | 'disconnected_optional'   // 設定ノードが ProviderNode に未接続 (新 Phase 1: warning)
    | 'ambiguous_provider'      // 複数 ProviderNode + CONFIG_INPUT 未接続 GenerateNode
    | 'multiple_provider_connection' // CONFIG_INPUT に複数 Provider 接続
    | 'unused_image_input' // KlingElements 使用中のため ImageInput が無視される (warning)
    | 'consent_required'; // OmniReferenceNode 接続済 + consentAccepted=false (Generate 不可)
  nodeId?: string;
  message: string;
}

// ========== ノードパレット用 ==========

export interface NodePaletteItem {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  category: 'input' | 'config' | 'provider-specific' | 'post-processing' | 'output' | 'utility';
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
        duration: null,
        seedanceMode: 'pro',
        seedanceGenerateAudio: false,
        seedanceSeed: null,
        seedanceResolution: '720p',
        seedanceCameraFixed: false,
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
    case 'dialogue':
      return {
        type: 'dialogue',
        isValid: false,
        text: '',
        voiceId: null,
        language: 'ja',
        speed: 1.0,
        useLipSync: false,
        ttsInstructions: undefined,  // undefined = デフォルト適用。空文字ではなく undefined にすること (AC10a)
        kanaText: undefined,
        useKanaMode: false,
        status: 'idle',
        progress: 0,
        generationId: null,
        outputVideoUrl: null,
      };
    case 'getVideoFrame':
      return {
        type: 'getVideoFrame',
        isValid: true,
        inputVideoUrl: null,
        direction: 'first',
        status: 'idle',
        outputImageUrl: null,
      };
    case 'trimVideo':
      return {
        type: 'trimVideo',
        isValid: false,
        inputVideoUrl: null,
        startSeconds: 0,
        endSeconds: null,
        status: 'idle',
        outputVideoUrl: null,
      };
    case 'stitchVideos':
      return {
        type: 'stitchVideos',
        isValid: false,
        transition: 'none',
        status: 'idle',
        progress: 0,
        stitchId: null,
        outputVideoUrl: null,
      };
    case 'stickyNote':
      return {
        type: 'stickyNote',
        isValid: true,
        text: '',
        color: 'yellow',
      };
    case 'omniReference':
      return createOmniReferenceNodeData();
    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

/**
 * Seedance Omni Reference ノードのデフォルトデータ生成。
 * v3 §6.7: image 8 枠 / video 3 枠固定 / audio 3 枠固定。
 */
export function createOmniReferenceNodeData(): OmniReferenceNodeData {
  return {
    type: 'omniReference',
    isValid: false,
    imageSlots: Array.from({ length: 8 }, () => ({
      assetId: null,
      mediaType: 'image' as const,
    })),
    videoSlots: [
      { assetId: null, mediaType: 'video' },
      { assetId: null, mediaType: 'video' },
      { assetId: null, mediaType: 'video' },
    ],
    audioSlots: [
      { assetId: null, mediaType: 'audio' },
      { assetId: null, mediaType: 'audio' },
      { assetId: null, mediaType: 'audio' },
    ],
    consentAccepted: false,
  };
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
  // Phase 4: Dialogue (Pipeline 型)
  DIALOGUE_VIDEO_INPUT: 'dialogue_video_input',
  DIALOGUE_VIDEO_OUTPUT: 'dialogue_video_output',
  // Phase 5: Utility Nodes
  GET_VIDEO_FRAME_VIDEO_INPUT: 'get_video_frame_video_input',
  GET_VIDEO_FRAME_IMAGE_OUTPUT: 'get_video_frame_image_output',
  TRIM_VIDEO_INPUT: 'trim_video_input',
  TRIM_VIDEO_OUTPUT: 'trim_video_output',
  STITCH_VIDEO_1: 'video_1',
  STITCH_VIDEO_2: 'video_2',
  STITCH_VIDEO_3: 'video_3',
  STITCH_VIDEO_4: 'video_4',
  STITCH_VIDEO_5: 'video_5',
  STITCH_VIDEO_OUTPUT: 'stitch_video_output',
  // ProviderNode 入力 (Kling/Runway/Hailuo 設定エッジスコープ)
  KLING_MODE_INPUT: 'kling_mode_input',
  KLING_ELEMENTS_INPUT: 'kling_elements_input',
  KLING_END_FRAME_INPUT: 'kling_end_frame_input',
  KLING_CAMERA_CONTROL_INPUT: 'kling_camera_control_input',
  ACT_TWO_INPUT: 'act_two_input',
  HAILUO_END_FRAME_INPUT: 'hailuo_end_frame_input',
  // Seedance Omni Reference (v3 §4.1)
  OMNI_REFERENCE_OUTPUT: 'omni_reference',
  OMNI_REFERENCE_INPUT: 'omni_reference_input',
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
    nodes: ['bgm', 'filmGrain', 'lut', 'overlay', 'dialogue'] as NodeType[],
  },
  output: {
    label: '出力',
    description: '動画生成',
    nodes: ['generate'] as NodeType[],
  },
  utility: {
    label: 'ユーティリティ',
    description: '動画編集・注釈',
    nodes: ['getVideoFrame', 'trimVideo', 'stitchVideos', 'stickyNote'] as NodeType[],
  },
} as const;

// ========== プロバイダー別ノード利用可否 ==========

export const PROVIDER_NODE_AVAILABILITY: Record<VideoProvider, NodeType[]> = {
  runway: ['actTwo', 'videoInput'],
  piapi_kling: ['klingMode', 'klingElements', 'klingEndFrame', 'klingCameraControl'],
  veo: [],
  domoai: [],
  hailuo: ['hailuoEndFrame'],
  seedance: [],
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
  // おまかせ (auto) 時: video_provider を送らず優先度でサーバー自動選択させる。
  selection_priority?: 'quality' | 'speed' | 'cost';
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
  // 動画時間
  kling_duration?: 5 | 10;
  seedance_duration?: number;  // 4-15 の整数
  veo_duration?: number;  // 4 | 6 | 8 のいずれか
  // Seedance モード
  seedance_mode?: 'pro' | 'fast';
  // Seedance 詳細パラメータ
  seedance_generate_audio?: boolean;
  seedance_seed?: number;
  seedance_resolution?: '480p' | '720p' | '1080p';
  seedance_camera_fixed?: boolean | null;
  // Seedance Omni Reference 参照素材 (v3 §6.10)
  image_reference_asset_ids?: string[];  // UUID 文字列、max 8
  video_reference_asset_ids?: string[];  // UUID 文字列、max 3
  audio_reference_asset_ids?: string[];  // UUID 文字列、max 3
}
