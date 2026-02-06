import type { Edge } from '@xyflow/react';
import type {
  WorkflowNode,
  WorkflowNodeData,
  ImageInputNodeData,
  VideoInputNodeData,
  PromptNodeData,
  ProviderNodeData,
  CameraWorkNodeData,
  KlingModeNodeData,
  KlingElementsNodeData,
  KlingEndFrameNodeData,
  KlingCameraControlNodeData,
  ActTwoNodeData,
  HailuoEndFrameNodeData,
  BGMNodeData,
  FilmGrainNodeData,
  LUTNodeData,
  OverlayNodeData,
  StoryVideoCreateRequest,
  GenerateNodeData,
} from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';

/**
 * ノードグラフからAPIリクエストパラメータに変換
 * 全17パラメータに対応
 */
export function graphToStoryVideoCreate(
  nodes: WorkflowNode[],
  edges: Edge[],
  generateNodeId?: string
): StoryVideoCreateRequest {
  // 接続数をログ（デバッグ用、将来的にはエッジベースバリデーションに使用）
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[graph-to-api] Converting graph with ${nodes.length} nodes and ${edges.length} edges`);
  }

  // ヘルパー関数: 特定タイプのノードを検索
  const findNode = <T extends WorkflowNodeData>(
    type: T['type']
  ): T | undefined => {
    const node = nodes.find((n) => (n.data as WorkflowNodeData).type === type);
    return node?.data as T | undefined;
  };

  // 基本ノードを取得
  const imageInput = findNode<ImageInputNodeData>('imageInput');
  const videoInput = findNode<VideoInputNodeData>('videoInput');
  const prompt = findNode<PromptNodeData>('prompt');
  const provider = findNode<ProviderNodeData>('provider');
  const cameraWork = findNode<CameraWorkNodeData>('cameraWork');

  // Kling専用ノード
  const klingMode = findNode<KlingModeNodeData>('klingMode');
  const klingElements = findNode<KlingElementsNodeData>('klingElements');
  const klingEndFrame = findNode<KlingEndFrameNodeData>('klingEndFrame');
  const klingCameraControl = findNode<KlingCameraControlNodeData>('klingCameraControl');

  // Act-Two
  const actTwo = findNode<ActTwoNodeData>('actTwo');

  // Hailuo専用
  const hailuoEndFrame = findNode<HailuoEndFrameNodeData>('hailuoEndFrame');

  // 後処理ノード
  const bgm = findNode<BGMNodeData>('bgm');
  const filmGrain = findNode<FilmGrainNodeData>('filmGrain');
  const lut = findNode<LUTNodeData>('lut');
  const overlay = findNode<OverlayNodeData>('overlay');

  // ========== GenerateNode → GenerateNode v2v 接続チェック ==========
  let v2vSourceVideoUrl: string | null = null;
  let v2vSourceThumbnail: string | null = null;
  if (generateNodeId) {
    // このGenerateNodeの source_video_url 入力に接続されているエッジを探す
    const v2vEdge = edges.find(
      (e) => e.target === generateNodeId && e.targetHandle === HANDLE_IDS.SOURCE_VIDEO_INPUT
    );
    if (v2vEdge) {
      // 接続元ノードを探す
      const sourceNode = nodes.find((n) => n.id === v2vEdge.source);
      if (sourceNode) {
        const sourceData = sourceNode.data as WorkflowNodeData;
        // GenerateNodeからの接続の場合
        if (sourceData.type === 'generate') {
          const genData = sourceData as GenerateNodeData;
          if (!genData.videoUrl) {
            throw new Error('接続元のGenerateNodeの動画生成が完了していません');
          }
          v2vSourceVideoUrl = genData.videoUrl;
          // GenerateNodeにはサムネイルがないので、videoUrlをそのまま使用
          v2vSourceThumbnail = null;
        }
        // VideoInputNodeからの接続の場合
        if (sourceData.type === 'videoInput') {
          const vidData = sourceData as VideoInputNodeData;
          if (vidData.videoUrl) {
            v2vSourceVideoUrl = vidData.videoUrl;
            v2vSourceThumbnail = vidData.videoThumbnail;
          }
        }
      }
    }
  }

  // ========== V2V モード判定 ==========
  if (v2vSourceVideoUrl || videoInput?.videoUrl) {
    // プロバイダーチェック（V2VはRunwayのみ対応）
    if (provider?.provider && provider.provider !== 'runway') {
      throw new Error('V2V（動画入力）はRunwayプロバイダーのみ対応しています。プロバイダーをRunwayに変更してください。');
    }

    // 排他チェック（画像と動画の同時使用不可）
    if (imageInput?.imageUrl) {
      throw new Error('V2Vモードでは画像入力と動画入力を同時に使用できません。どちらか一方を削除してください。');
    }

    // プロンプト必須チェック
    if (!prompt?.englishPrompt && !prompt?.japanesePrompt) {
      throw new Error('プロンプトが入力されていません');
    }

    // V2Vソース動画URL決定（GenerateNode接続 > VideoInputNode）
    const sourceUrl = v2vSourceVideoUrl || videoInput!.videoUrl || undefined;

    // サムネイル決定ロジック
    let thumbnailUrl: string;
    if (v2vSourceVideoUrl) {
      // エッジ経由のv2v接続の場合
      if (v2vSourceThumbnail !== null) {
        // VideoInputNodeからの接続: サムネイルがあればそれを使用、なければvideoUrl
        thumbnailUrl = v2vSourceThumbnail || v2vSourceVideoUrl;
      } else {
        // GenerateNodeからの接続: videoUrlをそのまま使用
        thumbnailUrl = v2vSourceVideoUrl;
      }
    } else {
      // findNode経由のVideoInputNode（従来の動作）
      thumbnailUrl = videoInput!.videoThumbnail || videoInput!.videoUrl || '';
    }

    // V2Vモードリクエスト構築
    const request: StoryVideoCreateRequest = {
      // 必須: サムネイルまたは動画URLをimage_urlとして使用
      image_url: thumbnailUrl,
      story_text: prompt.englishPrompt || prompt.japanesePrompt || '',
      // V2V固有設定
      video_mode: 'v2v',
      source_video_url: sourceUrl,
      // 基本設定
      aspect_ratio: provider?.aspectRatio ?? '9:16',
      video_provider: 'runway', // V2VはRunway固定
      subject_type: prompt?.subjectType ?? 'person',
      // カメラワーク
      camera_work: cameraWork?.promptText || undefined,
      // BGM
      bgm_track_id: bgm?.bgmTrackId || undefined,
      custom_bgm_url: bgm?.customBgmUrl || undefined,
      // 後処理
      film_grain: filmGrain?.grain ?? 'medium',
      use_lut: lut?.useLut ?? true,
    };

    // オーバーレイ（テキストがある場合のみ）
    if (overlay?.text) {
      request.overlay = {
        text: overlay.text,
        position: overlay.position,
        font: overlay.font,
        color: overlay.color,
      };
    }

    return request;
  }

  // ========== I2V モード（既存ロジック）==========
  // 必須パラメータのバリデーション
  if (!imageInput?.imageUrl) {
    throw new Error('画像が選択されていません');
  }
  if (!prompt?.englishPrompt) {
    throw new Error('プロンプトが入力されていません');
  }

  // リクエストオブジェクトを構築
  const request: StoryVideoCreateRequest = {
    // 必須
    image_url: imageInput.imageUrl,
    story_text: prompt.englishPrompt,
    // 基本設定
    aspect_ratio: provider?.aspectRatio ?? '9:16',
    video_provider: provider?.provider ?? 'runway',
    subject_type: prompt?.subjectType ?? 'person',
    // カメラワーク
    camera_work: cameraWork?.promptText || undefined,
    // BGM
    bgm_track_id: bgm?.bgmTrackId || undefined,
    custom_bgm_url: bgm?.customBgmUrl || undefined,
    // 後処理
    film_grain: filmGrain?.grain ?? 'medium',
    use_lut: lut?.useLut ?? true,
  };

  // オーバーレイ（テキストがある場合のみ）
  if (overlay?.text) {
    request.overlay = {
      text: overlay.text,
      position: overlay.position,
      font: overlay.font,
      color: overlay.color,
    };
  }

  // Kling専用パラメータ（プロバイダーがKlingの場合のみ）
  if (provider?.provider === 'piapi_kling') {
    if (klingMode) {
      request.kling_mode = klingMode.mode;
    }
    if (klingElements?.elementImages.length) {
      request.element_images = klingElements.elementImages.map((url) => ({
        image_url: url,
      }));
    }
    if (klingEndFrame?.endFrameImageUrl) {
      request.end_frame_image_url = klingEndFrame.endFrameImageUrl;
    }
    // カメラコントロール（6軸スライダー）
    if (klingCameraControl) {
      const { config } = klingCameraControl;
      // 全て0の場合はスキップ（カメラ制御なし）
      const hasMovement = Object.values(config).some(v => v !== 0);
      if (hasMovement) {
        request.kling_camera_control = config;
        // 既存のcamera_workをクリア（カスタム設定優先）
        delete request.camera_work;
      }
    }
  }

  // Act-Two（Runway + person/animation の場合のみ）
  if (provider?.provider === 'runway' && actTwo?.useActTwo) {
    const subjectType = prompt?.subjectType;
    if (subjectType === 'person' || subjectType === 'animation') {
      request.use_act_two = true;
      request.motion_type = actTwo.motionType || undefined;
      request.expression_intensity = actTwo.expressionIntensity;
      request.body_control = actTwo.bodyControl;
    }
  }

  // Hailuo専用パラメータ
  // Note: Hailuoのlast_frame_imageはAPIスキーマ上はend_frame_image_urlとして送信
  if (provider?.provider === 'hailuo' && hailuoEndFrame?.lastFrameImageUrl) {
    request.end_frame_image_url = hailuoEndFrame.lastFrameImageUrl;
  }

  return request;
}

/**
 * グラフのバリデーション（生成前チェック）
 */
export function validateGraphForGeneration(
  nodes: WorkflowNode[],
  edges: Edge[],
  generateNodeId?: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // ノード検索ヘルパー
  const videoInputNode = nodes.find(
    (n) => (n.data as WorkflowNodeData).type === 'videoInput'
  );
  const imageInputNode = nodes.find(
    (n) => (n.data as WorkflowNodeData).type === 'imageInput'
  );
  const providerNode = nodes.find(
    (n) => (n.data as WorkflowNodeData).type === 'provider'
  );

  // V2V固有バリデーション
  if (videoInputNode) {
    const videoData = videoInputNode.data as VideoInputNodeData;

    // 1. V2VはRunwayのみ対応
    if (providerNode) {
      const providerData = providerNode.data as ProviderNodeData;
      if (providerData.provider !== 'runway') {
        errors.push('V2V（動画入力）はRunwayプロバイダーのみ対応しています');
      }
    }

    // 2. 排他チェック（画像と動画の同時使用不可）
    if (imageInputNode) {
      const imageData = imageInputNode.data as ImageInputNodeData;
      if (imageData.imageUrl && videoData.videoUrl) {
        errors.push('画像入力と動画入力は同時に使用できません');
      }
    }

    // 3. 動画URL存在チェック
    if (!videoData.videoUrl) {
      errors.push('動画が選択されていません');
    }

    // 4. 動画長チェック
    if (videoData.videoDuration && videoData.videoDuration > 10) {
      errors.push('入力動画は10秒以下にしてください');
    }
  }

  // 入力ノードの存在チェック（V2Vモード対応）
  const hasImageInput = imageInputNode !== undefined;
  const hasVideoInput = videoInputNode !== undefined;
  const hasPrompt = nodes.some(
    (n) => (n.data as WorkflowNodeData).type === 'prompt'
  );
  const hasGenerate = nodes.some(
    (n) => (n.data as WorkflowNodeData).type === 'generate'
  );

  // 画像または動画の入力ノードが必要
  if (!hasImageInput && !hasVideoInput) {
    errors.push('画像入力または動画入力ノードが必要です');
  }
  if (!hasPrompt) {
    errors.push('プロンプトノードが必要です');
  }
  if (!hasGenerate) {
    errors.push('生成ノードが必要です');
  }

  // 各ノードの内部バリデーション
  for (const node of nodes) {
    const data = node.data as WorkflowNodeData;

    // I2Vモード時のみ画像バリデーション（V2Vモード時はスキップ）
    if (data.type === 'imageInput' && !hasVideoInput) {
      const d = data as ImageInputNodeData;
      if (!d.imageUrl) {
        errors.push('画像が選択されていません');
      }
    }

    if (data.type === 'prompt') {
      const d = data as PromptNodeData;
      if (!d.englishPrompt && !d.japanesePrompt) {
        errors.push('プロンプトが入力されていません');
      }
    }

    if (data.type === 'klingElements') {
      const d = data as KlingElementsNodeData;
      if (d.elementImages.length > 3) {
        errors.push('Kling要素画像は最大3枚までです');
      }
    }

    // ActTwo の subject_type 互換性チェック
    if (data.type === 'actTwo') {
      const d = data as ActTwoNodeData;
      if (d.useActTwo) {
        // PromptNode を検索して subject_type を確認
        const promptNode = nodes.find(
          (n) => (n.data as WorkflowNodeData).type === 'prompt'
        );
        if (promptNode) {
          const promptData = promptNode.data as PromptNodeData;
          if (promptData.subjectType !== 'person' && promptData.subjectType !== 'animation') {
            errors.push('Act-Two は person または animation タイプのみで使用可能です');
          }
        }
      }
    }
  }

  // 生成ノードへの接続チェック
  const generateNode = nodes.find(
    (n) => (n.data as WorkflowNodeData).type === 'generate'
  );
  if (generateNode) {
    const incomingEdges = edges.filter((e) => e.target === generateNode.id);
    if (incomingEdges.length === 0) {
      errors.push('生成ノードに接続がありません');
    }
  }

  // プロバイダー固有ノードの存在チェック（providerNodeは上で既に取得済み）
  if (providerNode) {
    const providerData = providerNode.data as ProviderNodeData;

    // Kling専用ノードがKling以外で使われていないかチェック
    const hasKlingNodes = nodes.some(
      (n) => ['klingMode', 'klingElements', 'klingEndFrame'].includes(
        (n.data as WorkflowNodeData).type
      )
    );
    if (hasKlingNodes && providerData.provider !== 'piapi_kling') {
      errors.push('Kling専用ノードはKlingプロバイダー選択時のみ使用可能です');
    }

    // Hailuo専用ノードがHailuo以外で使われていないかチェック
    const hasHailuoNodes = nodes.some(
      (n) => (n.data as WorkflowNodeData).type === 'hailuoEndFrame'
    );
    if (hasHailuoNodes && providerData.provider !== 'hailuo') {
      errors.push('Hailuo終了フレームノードはHailuoプロバイダー選択時のみ使用可能です');
    }

    // ActTwo ノードがRunway以外で使われていないかチェック
    const hasActTwoNodes = nodes.some(
      (n) => (n.data as WorkflowNodeData).type === 'actTwo'
    );
    if (hasActTwoNodes && providerData.provider !== 'runway') {
      errors.push('Act-TwoノードはRunwayプロバイダー選択時のみ使用可能です');
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * エッジから接続されているノードのデータを取得
 */
export function getConnectedNodeData<T extends WorkflowNodeData>(
  targetNodeId: string,
  targetHandleId: string,
  nodes: WorkflowNode[],
  edges: Edge[]
): T | undefined {
  const edge = edges.find(
    (e) => e.target === targetNodeId && e.targetHandle === targetHandleId
  );
  if (!edge) return undefined;

  const sourceNode = nodes.find((n) => n.id === edge.source);
  return sourceNode?.data as T | undefined;
}
