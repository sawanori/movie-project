import { createClient } from "@/lib/supabase/client";
import type { ReferenceImage, ReferenceImagePurpose } from "@/lib/constants/image-generation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getAuthToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

interface FetchWithAuthOptions extends RequestInit {
  /** タイムアウト（ミリ秒）- デフォルト: 120000 (2分) */
  timeout?: number;
}

async function fetchWithAuth(endpoint: string, options: FetchWithAuthOptions = {}) {
  const token = await getAuthToken();
  const { timeout = 120000, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...fetchOptions.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  // タイムアウト用のAbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      // detailがオブジェクトや配列の場合はJSON文字列化
      let errorMessage: string;
      if (typeof error.detail === "string") {
        errorMessage = error.detail;
      } else if (Array.isArray(error.detail)) {
        // FastAPIのバリデーションエラー形式: [{loc: [...], msg: "...", type: "..."}]
        errorMessage = error.detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join(", ");
      } else if (error.detail) {
        errorMessage = JSON.stringify(error.detail);
      } else {
        errorMessage = `HTTP ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    // 204 No Content の場合は空オブジェクトを返す
    if (response.status === 204) {
      return {};
    }

    // DELETE等でレスポンスボディがない場合の対応
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }

    // JSONでない場合は空オブジェクトを返す
    return {};
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("リクエストがタイムアウトしました。時間をおいて再度お試しください。");
    }
    throw error;
  }
}

// ===== 広告脚本（コンテ）生成用型定義 =====

export type AdTheory = 'aida' | 'pasona' | 'kishoutenketsu' | 'storytelling';

export interface AdCut {
  id: string;
  cut_number: number;
  scene_type: string;
  scene_type_label: string;
  description_ja: string;
  description_en: string;
  duration: number;
  dialogue?: string;      // セリフ
  sound_effect?: string;  // 効果音/SE
}

export interface AdScriptResponse {
  id: string;
  theory: AdTheory;
  theory_label: string;
  total_duration: number;
  cuts: AdCut[];
}

// Auth API
export const authApi = {
  getMe: () => fetchWithAuth("/api/v1/auth/me"),
  getUsage: () => fetchWithAuth("/api/v1/auth/usage"),
};

// Videos API
export const videosApi = {
  create: (data: {
    image_urls?: string[];
    image_url?: string;  // 後方互換
    prompt: string;
    template_id?: string;
    bgm_track_id?: string;
    overlay?: {
      text?: string;
      position?: string;
      font?: string;
      color?: string;
    };
  }) => fetchWithAuth("/api/v1/videos", { method: "POST", body: JSON.stringify(data) }),

  list: (page = 1, perPage = 10) =>
    fetchWithAuth(`/api/v1/videos?page=${page}&per_page=${perPage}`),

  get: (id: string) => fetchWithAuth(`/api/v1/videos/${id}`),

  getStatus: (id: string) => fetchWithAuth(`/api/v1/videos/${id}/status`),

  delete: (id: string) =>
    fetchWithAuth(`/api/v1/videos/${id}`, { method: "DELETE" }),

  uploadImage: async (file: File) => {
    const token = await getAuthToken();
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/v1/videos/upload-image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(error.detail);
    }

    return response.json();
  },

  uploadImages: async (files: File[]): Promise<{ image_urls: string[] }> => {
    const token = await getAuthToken();
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch(`${API_URL}/api/v1/videos/upload-images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(error.detail);
    }

    return response.json();
  },

  // ===== AI主導ストーリーテリング用API =====

  suggestStories: (imageUrl: string): Promise<{ suggestions: string[] }> =>
    fetchWithAuth("/api/v1/videos/suggest-stories", {
      method: "POST",
      body: JSON.stringify({ image_url: imageUrl }),
    }),

  // 日本語プロンプトを英語に翻訳（テンプレート適用）
  translateStoryPrompt: (data: {
    description_ja: string;
    video_provider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';
    subject_type?: 'person' | 'object' | 'animation';  // 被写体タイプ（人物/物体/アニメーション）
    camera_work?: string;  // カメラワーク（例: "slow zoom in", "pan left"）
    animation_category?: '2d' | '3d' | null;  // アニメーションカテゴリ（animation選択時）
    animation_template?: string | null;  // アニメーションテンプレートID（A-1〜B-4）
    // Act-Two用パラメータ（animation被写体タイプ時のみ有効）
    use_act_two?: boolean;  // Act-Twoモード有効化
    motion_type?: string | null;  // モーションタイプ（smile_gentle, wave_hand等）
    expression_intensity?: number;  // 表情強度（1-5、デフォルト3）
    body_control?: boolean;  // 体の動き制御（デフォルトtrue）
  }): Promise<{ english_prompt: string }> =>
    fetchWithAuth("/api/v1/videos/story/translate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ストーリー動画を直接生成（Runway/Veo/DomoAI API使用）
  createStoryVideo: (data: {
    image_url: string;
    story_text: string;
    aspect_ratio?: '9:16' | '16:9';  // アスペクト比（デフォルト: 9:16 縦長）
    video_provider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';  // 動画生成プロバイダー（デフォルト: runway）
    bgm_track_id?: string;
    custom_bgm_url?: string;  // カスタムBGM（プリセットより優先）
    overlay?: {
      text?: string;
      position?: string;
      font?: string;
      color?: string;
    };
    camera_work?: string;
    film_grain?: 'none' | 'light' | 'medium' | 'heavy';
    use_lut?: boolean;
    // Act-Two用パラメータ
    use_act_two?: boolean;
    motion_type?: string;
    expression_intensity?: number;
    body_control?: boolean;
    // Kling AI用パラメータ
    kling_mode?: 'std' | 'pro';
    end_frame_image_url?: string;  // 終了フレーム画像URL（Kling専用）
    element_images?: { image_url: string }[];  // 一貫性向上用の追加画像（Kling専用、最大3枚）
  }) => fetchWithAuth("/api/v1/videos/story", { method: "POST", body: JSON.stringify(data) }),

  // BGM音源をアップロード
  uploadBgm: async (file: File): Promise<{ bgm_url: string; duration_seconds: number | null }> => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("認証が必要です。ログインしてください。");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/v1/videos/upload-bgm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "BGM upload failed" }));
      throw new Error(error.detail || `Upload failed with status ${response.status}`);
    }

    return response.json();
  },

  // 既存の動画にBGMを追加
  addBgmToVideo: (videoId: string, bgmUrl: string) =>
    fetchWithAuth(`/api/v1/videos/${videoId}/add-bgm`, {
      method: "POST",
      body: JSON.stringify({ bgm_url: bgmUrl }),
    }),

  // ===== 動画結合API =====

  // 複数の動画を結合（video_ids または video_urls を指定）
  concat: (data: {
    video_ids?: string[];
    video_urls?: string[];
    transition?: 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown' | 'circleopen' | 'circleclose';
    transition_duration?: number;
  }) => fetchWithAuth("/api/v1/videos/concat", { method: "POST", body: JSON.stringify(data) }),

  // 複数の動画を結合（トリム機能付きV2）
  concatV2: (data: {
    videos: Array<{
      video_id?: string;
      video_url?: string;
      start_time: number;
      end_time?: number;
    }>;
    transition?: 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideup' | 'slidedown' | 'circleopen' | 'circleclose';
    transition_duration?: number;
  }) => fetchWithAuth("/api/v1/videos/concat/v2", { method: "POST", body: JSON.stringify(data) }),

  // 結合ジョブの詳細を取得
  getConcat: (concatId: string) => fetchWithAuth(`/api/v1/videos/concat/${concatId}`),

  // 結合ジョブのステータスを取得（ポーリング用）
  getConcatStatus: (concatId: string) => fetchWithAuth(`/api/v1/videos/concat/${concatId}/status`),

  // 結合動画の履歴一覧を取得
  listConcat: (page = 1, perPage = 10) =>
    fetchWithAuth(`/api/v1/videos/concat?page=${page}&per_page=${perPage}`),

  // 結合動画をアップスケール
  upscaleConcat: (
    concatId: string,
    resolution: 'hd' | '4k',
    sourceUrl?: string  // 60fps補間後のURL等を直接指定可能
  ): Promise<{
    id: string;
    status: string;
    resolution: string;
    original_video_url: string;
    upscaled_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/upscale`, {
      method: "POST",
      body: JSON.stringify({ resolution, source_url: sourceUrl }),
    }),

  // 結合動画アップスケールステータスを取得
  getConcatUpscaleStatus: (
    concatId: string
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    upscaled_video_url: string | null;
    resolution: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/upscale/status`),

  // ===== 単体動画アップスケールAPI =====

  // 単体動画をアップスケール
  upscaleVideo: (
    videoId: string,
    resolution: 'original' | 'hd' | '4k',
    sourceUrl?: string  // 60fps補間後のURL等を直接指定可能
  ): Promise<{
    id: string;
    storyboard_id: string;
    status: string;
    resolution: string;
    original_video_url: string;
    upscaled_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/${videoId}/upscale`, {
      method: "POST",
      body: JSON.stringify({ resolution, source_url: sourceUrl }),
    }),

  // 単体動画アップスケールステータスを取得
  getVideoUpscaleStatus: (
    videoId: string
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    upscaled_video_url: string | null;
    resolution: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/${videoId}/upscale/status`),

  // ===== 60fps補間API（Topaz Video API）=====

  // 単体動画を60fpsに補間
  interpolate60fps: (
    videoId: string,
    model: 'apo-8' | 'apf-2' | 'chr-2' | 'chf-3' = 'apo-8'
  ): Promise<{
    id: string;
    video_id: string;
    status: string;
    model: string;
    original_video_url: string;
    interpolated_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/${videoId}/interpolate-60fps`, {
      method: "POST",
      body: JSON.stringify({ model }),
    }),

  // 単体動画60fps補間ステータスを取得
  getInterpolate60fpsStatus: (
    videoId: string
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    interpolated_video_url: string | null;
    model: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/${videoId}/interpolate-60fps/status`),

  // 結合動画を60fpsに補間
  interpolateConcat60fps: (
    concatId: string,
    model: 'apo-8' | 'apf-2' | 'chr-2' | 'chf-3' = 'apo-8'
  ): Promise<{
    id: string;
    concat_id: string;
    status: string;
    model: string;
    original_video_url: string;
    interpolated_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/interpolate-60fps`, {
      method: "POST",
      body: JSON.stringify({ model }),
    }),

  // 結合動画60fps補間ステータスを取得
  getConcatInterpolate60fpsStatus: (
    concatId: string
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    interpolated_video_url: string | null;
    model: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/interpolate-60fps/status`),

  // ===== 広告脚本（コンテ）生成API =====

  // 広告の説明からCM構成（カット割り）を生成
  generateAdScript: (data: {
    description: string;
    target_duration: number | null;
    aspect_ratio: '9:16' | '16:9';
  }): Promise<AdScriptResponse> =>
    fetchWithAuth("/api/v1/videos/ad-script/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ===== ProRes変換ダウンロード =====

  // 動画をProRes形式でダウンロード（デバンド + 10bit変換）
  downloadAsProRes: async (
    videoUrl: string,
    options?: {
      debandStrength?: number;
      debandRadius?: number;
      applyFlatLook?: boolean;
      contrast?: number;
      saturation?: number;
      brightness?: number;
    }
  ): Promise<Blob> => {
    const token = await getAuthToken();
    if (!token) throw new Error("認証が必要です");

    const response = await fetch(`${API_URL}/api/v1/videos/download/prores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        deband_strength: options?.debandStrength ?? 1.1,
        deband_radius: options?.debandRadius ?? 20,
        apply_flat_look: options?.applyFlatLook ?? true,
        contrast: options?.contrast ?? 0.9,
        saturation: options?.saturation ?? 0.85,
        brightness: options?.brightness ?? 0.03,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "変換に失敗しました" }));
      throw new Error(error.detail || "ProRes変換に失敗しました");
    }

    return response.blob();
  },
};

// BGMトラック型定義（templatesApi.listBgm用）
// バックエンドのBGMResponse (app/templates/schemas.py) と一致
export interface BGMTrack {
  id: string;
  name: string;
  description?: string;
  duration_seconds?: number;
  mood?: string;
  file_url?: string;
}

// Templates API
export const templatesApi = {
  list: () => fetchWithAuth("/api/v1/templates"),
  get: (id: string) => fetchWithAuth(`/api/v1/templates/${id}`),
  listBgm: (): Promise<BGMTrack[]> => fetchWithAuth("/api/v1/templates/bgm/list"),
};

// ===== ストーリーボード（起承転結4シーン）API =====

// ===== ドラフト（一時保存）用型定義 =====

/** カメラプリセット（lib/camera/types.ts のCameraPresetに対応） */
export type DraftCameraPreset = 'simple' | 'cinematic' | 'dynamic' | 'custom';

/** カメラワーク選択状態（JSON保存用、lib/camera/types.ts のCameraWorkSelectionのシリアライズ版） */
export interface DraftCameraWorkSelection {
  preset: DraftCameraPreset;
  customCameraWorkId?: number;  // CameraWork.id を保存
  promptText: string;
}

/** トリム設定 */
export interface TrimSettings {
  start: number;
  end: number;
  enabled?: boolean;
}

/** ストーリーボード編集UIのステップ */
export type StoryboardStep = 'input' | 'preview' | 'upload' | 'mood' | 'edit' | 'generating' | 'review' | 'concatenating' | 'completed';

/** 編集フォームの状態 */
export interface EditFormState {
  descriptionJa: string;
  runwayPrompt: string;
}

/** ドラフトメタデータ（UI状態の保存用） */
export interface DraftMetadata {
  schema_version: number;
  current_step: StoryboardStep | null;
  editing_scene: number | null;
  edit_form: EditFormState | null;
  camera_selections: Record<string, DraftCameraWorkSelection>;
  trim_settings: Record<string, TrimSettings>;
  video_modes: Record<string, 'i2v' | 'v2v'>;
  custom_image_scenes: number[];
  film_grain: 'none' | 'light' | 'medium' | 'heavy';
  use_lut: boolean;
  lut_intensity: number;
  apply_trim: boolean;
  video_provider: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';
  aspect_ratio: '9:16' | '16:9';
  selected_mood: string | null;
  custom_mood_text: string | null;
  last_saved_at: string | null;
  auto_saved: boolean;
  scene_end_frame_images?: Record<string, string>;  // シーンごとの終了フレーム画像URL（Kling専用）
}

/** ドラフト保存レスポンス */
export interface SaveDraftResponse {
  success: boolean;
  last_saved_at: string;
}

export interface StoryboardScene {
  id: string;
  storyboard_id: string;
  scene_number: number;
  display_order: number;  // シーン表示順序（並べ替え用）
  act: string;
  description_ja: string;
  runway_prompt: string;
  camera_work: string | null;
  mood: string | null;
  duration_seconds: number;
  scene_image_url: string | null;
  scene_image_webp_url?: string | null;
  status: string;
  progress: number;
  video_url: string | null;
  hls_master_url?: string | null;  // HLS adaptive streaming URL
  error_message: string | null;
  // 非推奨フィールド（後方互換用）
  parent_scene_id: string | null;
  sub_scene_order: number;
  generation_seed: number | null;
}

export interface SubSceneListResponse {
  parent_scene: StoryboardScene;
  sub_scenes: StoryboardScene[];
  can_add_more: boolean;
}

export interface Storyboard {
  id: string;
  user_id: string;
  source_image_url: string;
  source_image_webp_url?: string | null;
  title: string | null;
  status: string;
  scenes: StoryboardScene[];
  bgm_track_id: string | null;
  custom_bgm_url: string | null;
  final_video_url: string | null;
  hls_master_url?: string | null;  // HLS adaptive streaming URL
  total_duration: number | null;
  error_message: string | null;
  created_at: string;
  video_provider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo' | null;
  draft_metadata?: DraftMetadata | null;  // 編集中のUI状態（ドラフト保存用）
}

export const storyboardApi = {
  // ストーリーボードを生成（画像から4シーン構成を自動生成、プロバイダー別テンプレート適用）
  create: (imageUrl: string, mood?: string, videoProvider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo', aspectRatio?: '9:16' | '16:9', elementImages?: { image_url: string }[]): Promise<Storyboard> =>
    fetchWithAuth("/api/v1/videos/storyboard", {
      method: "POST",
      body: JSON.stringify({
        image_url: imageUrl,
        mood,
        video_provider: videoProvider,
        aspect_ratio: aspectRatio,
        element_images: elementImages,  // Kling Elements用追加画像（最大3枚）
      }),
    }),

  // ストーリーボード一覧を取得
  list: (page = 1, perPage = 10): Promise<{ storyboards: Storyboard[]; total: number; page: number; per_page: number }> =>
    fetchWithAuth(`/api/v1/videos/storyboard?page=${page}&per_page=${perPage}`),

  // ストーリーボードの詳細を取得
  get: (id: string): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${id}`),

  // シーンを更新
  updateScene: (storyboardId: string, sceneNumber: number, data: {
    description_ja?: string;
    runway_prompt?: string;
    camera_work?: string;
    mood?: string;
  }): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // 日本語説明を英語プロンプトに翻訳（テンプレート構造維持）
  translateScene: (descriptionJa: string, sceneNumber: number, storyboardId?: string): Promise<{ runway_prompt: string }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/translate-scene`, {
      method: "POST",
      body: JSON.stringify({
        description_ja: descriptionJa,
        scene_number: sceneNumber,
        storyboard_id: storyboardId,
      }),
    }),

  // 4シーンの動画生成を開始
  generate: (storyboardId: string, options?: {
    bgm_track_id?: string;
    custom_bgm_url?: string;
    film_grain?: 'none' | 'light' | 'medium' | 'heavy';
    use_lut?: boolean;
    video_provider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';
    scene_video_modes?: Record<number, 'i2v' | 'v2v'>;  // シーンごとのI2V/V2V設定
    scene_end_frame_images?: Record<number, string>;  // シーンごとの終了フレーム画像URL（Kling専用）
    element_images?: { image_url: string }[];  // 一貫性向上用の追加画像（Kling専用、最大3枚）
  }): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/generate`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  // 生成ステータスを取得（ポーリング用）
  getStatus: (storyboardId: string): Promise<{
    id: string;
    status: string;
    scenes: Array<{
      scene_number: number;
      act: string;
      status: string;
      progress: number;
      video_url: string | null;
      error_message: string | null;
    }>;
    message: string;
    video_url: string | null;
    total_duration: number | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/status`),

  // シーン画像を再生成（全シーン対応）
  regenerateImage: (storyboardId: string, sceneNumber: number): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}/regenerate-image`, {
      method: "POST",
    }),

  // 全シーン画像を一括生成（ストーリー確認後に実行）
  generateImages: (storyboardId: string): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/generate-images`, {
      method: "POST",
    }),

  // シーン画像を差し替え（カスタム画像をアップロード）
  updateSceneImage: (storyboardId: string, sceneNumber: number, imageUrl: string): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}/image`, {
      method: "PUT",
      body: JSON.stringify({ image_url: imageUrl }),
    }),

  // 単一シーンの動画を再生成
  regenerateVideo: (storyboardId: string, sceneNumber: number, options?: {
    video_provider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';
    prompt?: string;
    video_mode?: 'i2v' | 'v2v';  // i2v: 画像から動画を生成, v2v: 直前の動画から継続
    kling_mode?: 'std' | 'pro';  // Kling AIモード（std: 標準, pro: 高品質）
    image_tail_url?: string;  // 終了フレーム画像URL（Kling専用オプション）
  }): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}/regenerate-video`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  // 4シーン動画を結合（全シーンcompleted後に手動実行）
  concatenate: (storyboardId: string, options?: {
    film_grain?: 'none' | 'light' | 'medium' | 'heavy';
    use_lut?: boolean;
    lut_intensity?: number;
  }): Promise<Storyboard> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/concatenate`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  // ストーリーボードを削除
  delete: (id: string) =>
    fetchWithAuth(`/api/v1/videos/storyboard/${id}`, { method: "DELETE" }),

  // ===== サブシーン（追加カット）API =====

  // サブシーンを追加
  addSubScene: (
    storyboardId: string,
    parentSceneNumber: number,
    data?: {
      description_ja?: string;
      camera_work?: string;
    }
  ): Promise<Storyboard> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${parentSceneNumber}/add-sub-scene`,
      {
        method: "POST",
        body: JSON.stringify(data || {}),
      }
    ),

  // サブシーンを削除
  deleteSubScene: (
    storyboardId: string,
    sceneNumber: number
  ): Promise<Storyboard> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}/sub-scene`,
      { method: "DELETE" }
    ),

  // 親シーンのサブシーン一覧を取得
  listSubScenes: (
    storyboardId: string,
    parentSceneNumber: number
  ): Promise<SubSceneListResponse> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${parentSceneNumber}/sub-scenes`
    ),

  // ===== シーン編集API =====

  // シーンを削除（最後の1シーンは削除不可）
  deleteScene: (
    storyboardId: string,
    sceneId: string
  ): Promise<{
    success: boolean;
    deleted_scene_id: string;
    remaining_count: number;
    scenes: StoryboardScene[];
  }> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneId}`,
      { method: "DELETE" }
    ),

  // シーンの順序を変更（ドラッグ&ドロップ用）
  reorderScenes: (
    storyboardId: string,
    sceneIds: string[]
  ): Promise<{
    success: boolean;
    scenes: StoryboardScene[];
  }> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes/reorder`,
      {
        method: "PATCH",
        body: JSON.stringify({ scene_ids: sceneIds }),
      }
    ),

  // シーンを追加（末尾に追加）
  addScene: (
    storyboardId: string,
    data: {
      description_ja: string;
      runway_prompt?: string;
      custom_image_url?: string;
      video_mode?: 'i2v' | 'v2v';
      source_video_url?: string;
      auto_generate_video?: boolean;
    }
  ): Promise<{
    scene: StoryboardScene;
    scenes: StoryboardScene[];
  }> =>
    fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/scenes`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  // ===== 動画アップスケールAPI =====

  // 動画をアップスケール
  upscale: (
    storyboardId: string,
    resolution: 'original' | 'hd' | '4k',
    sourceUrl?: string  // 60fps補間後のURL等を直接指定可能
  ): Promise<{
    id: string;
    storyboard_id: string;
    status: string;
    resolution: string;
    original_video_url: string;
    upscaled_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/upscale`, {
      method: "POST",
      body: JSON.stringify({ resolution, source_url: sourceUrl }),
    }),

  // アップスケールステータスを取得
  getUpscaleStatus: (
    storyboardId: string
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    upscaled_video_url: string | null;
    resolution: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/upscale/status`),

  // ===== シーン単位の動画アップスケールAPI =====

  // シーン動画をアップスケール
  upscaleScene: (
    storyboardId: string,
    sceneNumber: number,
    resolution: 'original' | 'hd' | '4k'
  ): Promise<{
    id: string;
    storyboard_id: string;
    scene_number: number;
    status: string;
    resolution: string;
    original_video_url: string;
    upscaled_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scene/${sceneNumber}/upscale`, {
      method: "POST",
      body: JSON.stringify({ resolution }),
    }),

  // シーンアップスケールステータスを取得
  getSceneUpscaleStatus: (
    storyboardId: string,
    sceneNumber: number
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    upscaled_video_url: string | null;
    resolution: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scene/${sceneNumber}/upscale/status`),

  // ===== 60fps補間API（Topaz Video API）=====

  // ストーリーボード動画を60fpsに補間
  interpolate60fps: (
    storyboardId: string,
    model: 'apo-8' | 'apf-2' | 'chr-2' | 'chf-3' = 'apo-8'
  ): Promise<{
    id: string;
    storyboard_id: string;
    status: string;
    model: string;
    original_video_url: string;
    interpolated_video_url: string | null;
    progress: number;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/interpolate-60fps`, {
      method: "POST",
      body: JSON.stringify({ model }),
    }),

  // ストーリーボード動画60fps補間ステータスを取得
  getInterpolate60fpsStatus: (
    storyboardId: string
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    message: string;
    interpolated_video_url: string | null;
    model: string | null;
  }> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/interpolate-60fps/status`),

  // ===== ドラフト（一時保存）API =====

  /**
   * ストーリーボードのUI状態をドラフトとして一時保存
   * 編集中のカメラワーク選択、トリム設定、各種フォーム状態を保存
   */
  saveDraft: (
    storyboardId: string,
    draftMetadata: DraftMetadata
  ): Promise<SaveDraftResponse> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/draft`, {
      method: "PUT",
      body: JSON.stringify({ draft_metadata: draftMetadata }),
    }),

  /**
   * ストーリーボードのドラフト（一時保存）をクリア
   * ユーザーが「ドラフトを破棄」を選択した場合、または正常完了時に呼び出す
   */
  clearDraft: (storyboardId: string): Promise<void> =>
    fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/draft`, {
      method: "DELETE",
    }),
};

// Config API
export const configApi = {
  /** 現在の動画生成プロバイダーを取得 */
  getVideoProvider: async (): Promise<'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo'> => {
    const res = await fetchWithAuth("/api/v1/config/video-provider");
    return res.provider || 'runway';
  },
};

// ===== Act-Two モーションライブラリ API =====

export interface Motion {
  id: string;
  category: 'expression' | 'gesture' | 'action' | 'speaking';
  name_ja: string;
  name_en: string;
  duration_seconds: number;
  motion_url?: string;  // get詳細時のみ含まれる
}

export interface MotionUploadResult {
  success: boolean;
  motion_id: string;
  category: string;
  name_ja: string;
  name_en: string;
  duration_seconds: number;
  motion_url: string;
  r2_key: string;
  message: string;
}

export const motionsApi = {
  /** 利用可能なモーション一覧を取得 */
  list: (category?: string): Promise<Motion[]> => {
    const url = category
      ? `/api/v1/videos/motions?category=${category}`
      : `/api/v1/videos/motions`;
    return fetchWithAuth(url);
  },

  /** モーション詳細とプレビューURLを取得 */
  get: (motionId: string): Promise<Motion> =>
    fetchWithAuth(`/api/v1/videos/motions/${motionId}`),

  /** モーション動画をR2にアップロード */
  upload: async (data: {
    file: File;
    category: 'expression' | 'gesture' | 'action' | 'speaking';
    motion_id: string;
    name_ja: string;
    name_en: string;
    duration_seconds?: number;
  }): Promise<MotionUploadResult> => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("認証が必要です。ログインしてください。");
    }

    const formData = new FormData();
    formData.append("file", data.file);
    formData.append("category", data.category);
    formData.append("motion_id", data.motion_id);
    formData.append("name_ja", data.name_ja);
    formData.append("name_en", data.name_en);
    formData.append("duration_seconds", String(data.duration_seconds || 5));

    const response = await fetch(`${API_URL}/api/v1/videos/motions/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(error.detail || `Upload failed with status ${response.status}`);
    }

    return response.json();
  },

  /** モーションを削除 */
  delete: async (motionId: string): Promise<{ success: boolean; message: string }> => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("認証が必要です。ログインしてください。");
    }

    const response = await fetch(`${API_URL}/api/v1/videos/motions/${motionId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Delete failed" }));
      throw new Error(error.detail || `Delete failed with status ${response.status}`);
    }

    return response.json();
  },
};

// ===== BGM AI生成 API =====

export type BGMMood = 'upbeat' | 'calm' | 'dramatic' | 'energetic' | 'melancholic' | 'cinematic';
export type BGMGenre = 'electronic' | 'acoustic' | 'orchestral' | 'pop' | 'rock' | 'ambient';
export type BGMGenerationStatus = 'pending' | 'analyzing' | 'generating' | 'syncing' | 'completed' | 'failed';

export interface BGMGenerateRequest {
  custom_prompt?: string;
  auto_analyze?: boolean;
  sync_to_beats?: boolean;
}

export interface BGMGenerateResponse {
  id: string;
  concat_id: string;
  status: BGMGenerationStatus;
  progress: number;
  message: string;
}

export interface BGMStatusResponse {
  id: string;
  status: BGMGenerationStatus;
  progress: number;
  message: string;
  bgm_url: string | null;
  bgm_duration_seconds: number | null;
  auto_generated_prompt: string | null;
  detected_mood: BGMMood | null;
  detected_genre: BGMGenre | null;
  detected_tempo_bpm: number | null;
  sync_quality_score: number | null;
  error_message: string | null;
}

export interface ApplyBGMRequest {
  bgm_generation_id: string;
  volume?: number;
  original_audio_volume?: number;
  fade_in_seconds?: number;
  fade_out_seconds?: number;
}

export interface ApplyBGMResponse {
  concat_id: string;
  status: string;
  message: string;
  final_video_url: string | null;
}

export const bgmApi = {
  /** BGM AI生成を開始 */
  generate: (
    concatId: string,
    options?: BGMGenerateRequest
  ): Promise<BGMGenerateResponse> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/generate-bgm`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  /** BGM生成ステータスを取得（ポーリング用） */
  getStatus: (concatId: string): Promise<BGMStatusResponse> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/bgm-status`),

  /** 生成したBGMを動画に適用 */
  apply: (
    concatId: string,
    options: ApplyBGMRequest
  ): Promise<ApplyBGMResponse> =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/apply-bgm`, {
      method: "POST",
      body: JSON.stringify(options),
    }),
};

// ===== ユーザー動画アップロード API =====

export interface UserVideo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  video_url: string;
  hls_master_url?: string | null;  // HLS adaptive streaming URL
  thumbnail_url: string | null;
  thumbnail_webp_url?: string | null;
  duration_seconds: number;
  width: number;
  height: number;
  file_size_bytes: number;
  mime_type: 'video/mp4' | 'video/quicktime';
  created_at: string;
  updated_at: string;
  upscaled_video_url?: string | null;
}

export interface UserVideoListResponse {
  videos: UserVideo[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

// Topaz Enhancementアップスケール
export type EnhanceModel = 'prob-4' | 'ahq-12' | 'amq-13' | 'alq-13' | 'ghq-5' | 'gcg-5' | 'nyk-3' | 'rhea-1' | 'iris-3' | 'thd-3' | 'thf-4';
export type TopazUpscaleScale = '2x' | '4x';

export interface UserVideoUpscaleEstimateResponse {
  estimated_credits_min: number;
  estimated_credits_max: number;
  estimated_time_min: number;  // 秒
  estimated_time_max: number;  // 秒
  target_width: number;
  target_height: number;
}

export interface UserVideoUpscaleResponse {
  id: string;
  user_video_id: string;
  status: string;
  model: string;
  target_width: number;
  target_height: number;
  original_video_url: string;
  upscaled_video_url?: string | null;
  progress: number;
  estimated_credits_min?: number | null;
  estimated_credits_max?: number | null;
  created_at: string;
}

export interface UserVideoUpscaleStatusResponse {
  id: string;
  status: string;
  progress: number;
  upscaled_video_url?: string | null;
  thumbnail_url?: string | null;
  error_message?: string | null;
}

export const userVideosApi = {
  /**
   * ユーザー動画をアップロード
   * 制限: MP4/MOV, 最大50MB, 最大10秒, 最大4K解像度
   */
  upload: async (file: File, title?: string): Promise<UserVideo> => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("認証が必要です。ログインしてください。");
    }

    const formData = new FormData();
    formData.append("file", file);
    if (title) {
      formData.append("title", title);
    }

    const response = await fetch(`${API_URL}/api/v1/videos/upload-video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "アップロードに失敗しました" }));
      throw new Error(error.detail || `アップロードに失敗しました (${response.status})`);
    }

    return response.json();
  },

  /** ユーザー動画一覧を取得 */
  list: (page = 1, perPage = 20): Promise<UserVideoListResponse> =>
    fetchWithAuth(`/api/v1/videos/user-videos?page=${page}&per_page=${perPage}`),

  /** ユーザー動画を削除 */
  delete: async (videoId: string): Promise<{ success: boolean }> => {
    const result = await fetchWithAuth(`/api/v1/videos/user-videos/${videoId}`, {
      method: "DELETE",
    });
    return result;
  },

  /** アップスケールのコスト見積もり */
  estimateUpscale: (videoId: string, options: { model?: EnhanceModel; scale?: TopazUpscaleScale } = {}): Promise<UserVideoUpscaleEstimateResponse> =>
    fetchWithAuth(`/api/v1/videos/user-videos/${videoId}/upscale/estimate`, {
      method: "POST",
      body: JSON.stringify({
        model: options.model || "prob-4",
        scale: options.scale || "2x",
      }),
    }),

  /** アップスケール開始 */
  upscale: (videoId: string, options: { model?: EnhanceModel; scale?: TopazUpscaleScale } = {}): Promise<UserVideoUpscaleResponse> =>
    fetchWithAuth(`/api/v1/videos/user-videos/${videoId}/upscale`, {
      method: "POST",
      body: JSON.stringify({
        model: options.model || "prob-4",
        scale: options.scale || "2x",
      }),
    }),

  /** アップスケールステータス確認 */
  getUpscaleStatus: (videoId: string): Promise<UserVideoUpscaleStatusResponse> =>
    fetchWithAuth(`/api/v1/videos/user-videos/${videoId}/upscale/status`),
};

// ===== スクリーンショット API =====

export type ScreenshotSourceType = 'video_generation' | 'storyboard_scene' | 'user_video' | 'url';

export interface Screenshot {
  id: string;
  user_id: string;
  source_type: ScreenshotSourceType;
  source_id: string | null;
  source_video_url: string | null;
  timestamp_seconds: number;
  image_url: string;
  width: number | null;
  height: number | null;
  title: string | null;
  created_at: string;
}

export interface ScreenshotListResponse {
  screenshots: Screenshot[];
  total: number;
  page: number;
  per_page: number;
}

export const screenshotsApi = {
  /** スクリーンショットを作成 */
  create: (data: {
    source_type: ScreenshotSourceType;
    source_id?: string;
    source_url?: string;
    timestamp_seconds: number;
    title?: string;
  }): Promise<Screenshot> =>
    fetchWithAuth("/api/v1/videos/screenshots", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** スクリーンショット一覧を取得 */
  list: (page = 1, perPage = 20): Promise<ScreenshotListResponse> =>
    fetchWithAuth(`/api/v1/videos/screenshots?page=${page}&per_page=${perPage}`),

  /** スクリーンショット詳細を取得 */
  get: (screenshotId: string): Promise<Screenshot> =>
    fetchWithAuth(`/api/v1/videos/screenshots/${screenshotId}`),

  /** スクリーンショットを削除 */
  delete: (screenshotId: string): Promise<{ message: string }> =>
    fetchWithAuth(`/api/v1/videos/screenshots/${screenshotId}`, {
      method: "DELETE",
    }),
};

// ===== 画像ライブラリ API =====

/** 画像ライブラリアイテム */
export interface LibraryImage {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  image_url: string;
  thumbnail_url: string | null;
  r2_key: string;
  width: number;
  height: number;
  aspect_ratio: string;
  file_size_bytes: number | null;
  source: 'generated' | 'uploaded';
  image_provider: string | null;
  generated_prompt_ja: string | null;
  generated_prompt_en: string | null;
  category: 'character' | 'background' | 'product' | 'general';
  created_at: string;
  updated_at: string;
}

/** 画像ライブラリ一覧レスポンス */
export interface LibraryImageListResponse {
  images: LibraryImage[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

/** 統合画像一覧レスポンス（ライブラリ + スクリーンショット） */
export interface UnifiedImageListResponse {
  library_images: LibraryImage[];
  screenshots: Screenshot[];
  total_library: number;
  total_screenshots: number;
  page: number;
  per_page: number;
}

export const libraryApi = {
  /** 画像ライブラリ一覧を取得 */
  list: (params?: {
    page?: number;
    per_page?: number;
    category?: string;
    source?: string;
  }): Promise<LibraryImageListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.per_page) searchParams.append('per_page', String(params.per_page));
    if (params?.category) searchParams.append('category', params.category);
    if (params?.source) searchParams.append('source', params.source);

    const query = searchParams.toString();
    return fetchWithAuth(`/api/v1/library/images${query ? `?${query}` : ''}`);
  },

  /** 画像ライブラリ詳細を取得 */
  get: (id: string): Promise<LibraryImage> =>
    fetchWithAuth(`/api/v1/library/images/${id}`),

  /** 生成画像をライブラリに保存 */
  saveFromGeneration: (data: {
    image_url: string;
    r2_key: string;
    width: number;
    height: number;
    aspect_ratio: string;
    image_provider: string;
    generated_prompt_ja: string;
    generated_prompt_en: string;
    name?: string;
    category?: string;
  }): Promise<LibraryImage> =>
    fetchWithAuth('/api/v1/library/images/from-generation', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 画像ライブラリのメタデータを更新 */
  update: (id: string, data: {
    name?: string;
    description?: string;
    category?: string;
  }): Promise<LibraryImage> =>
    fetchWithAuth(`/api/v1/library/images/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** 画像ライブラリから削除 */
  delete: (id: string): Promise<{ message: string }> =>
    fetchWithAuth(`/api/v1/library/images/${id}`, {
      method: 'DELETE',
    }),

  /** 統合一覧を取得（ライブラリ + スクリーンショット） */
  listAll: (params?: {
    page?: number;
    per_page?: number;
    source_filter?: 'all' | 'library' | 'screenshot';
    category?: string;
  }): Promise<UnifiedImageListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.per_page) searchParams.append('per_page', String(params.per_page));
    if (params?.source_filter) searchParams.append('source_filter', params.source_filter);
    if (params?.category) searchParams.append('category', params.category);

    const query = searchParams.toString();
    return fetchWithAuth(`/api/v1/library/all-images${query ? `?${query}` : ''}`);
  },

  /** 動画生成の元画像を削除 */
  deleteSourceImage: (imageId: string): Promise<{ message: string }> =>
    fetchWithAuth(`/api/v1/library/source-images/${imageId}`, {
      method: 'DELETE',
    }),
};

// ===== Ad Creator ドラフト保存 API =====

/** Ad Creator用 選択された動画情報 */
export interface AdCreatorSelectedVideo {
  id: string;
  type: 'scene' | 'storyboard' | 'uploaded';
  videoUrl: string;
  thumbnailUrl?: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
}

/** Ad Creator用 編集可能なカット */
export interface AdCreatorEditableCut {
  id: string;
  cut_number: number;
  scene_type: string;
  scene_type_label: string;
  description_ja: string;
  description_en: string;
  duration: number;
  /** セリフ */
  dialogue?: string;
  /** 効果音/SE */
  sound_effect?: string;
  video: AdCreatorSelectedVideo | null;
  /** 生成された画像URL（動画生成前の一時保存用） */
  generatedImageUrl?: string;
  /** 生成に使用したプロンプト（日本語） */
  generatedPromptJa?: string;
  /** 生成に使用したプロンプト（英語） */
  generatedPromptEn?: string;
}

/** Ad Creator用 選択可能な動画アイテム */
export interface AdCreatorSelectableItem {
  id: string;
  type: 'scene' | 'storyboard' | 'uploaded';
  label: string;
  thumbnailUrl: string;
  videoUrl: string;
}

/** Ad Creator用 トリム設定 */
export interface AdCreatorTrimSetting {
  startTime: number;
  endTime: number;
  duration: number;
}

/** Ad Creatorドラフトメタデータ */
export interface AdCreatorDraftMetadata {
  schema_version: number;
  aspect_ratio: '9:16' | '16:9' | '1:1' | null;
  ad_mode: 'ai' | 'manual' | null;
  ad_script: AdScriptResponse | null;
  script_confirmed: boolean;
  storyboard_cuts: AdCreatorEditableCut[];
  /** CM全体の目標尺（秒）- 例: 15, 30, 60 */
  target_duration: number | null;
  // 手動モード用フィールド
  selected_items: AdCreatorSelectableItem[];
  trim_settings: Record<string, AdCreatorTrimSetting>;
  transition: string;
  transition_duration: number;
  last_saved_at: string | null;
  auto_saved: boolean;
}

/** Ad Creatorドラフト存在確認レスポンス（軽量） */
export interface AdCreatorDraftExistsResponse {
  exists: boolean;
  last_saved_at: string | null;
}

/** Ad Creatorドラフトレスポンス */
export interface AdCreatorDraftResponse {
  id: string;
  user_id: string;
  draft_metadata: AdCreatorDraftMetadata;
  created_at: string;
  updated_at: string;
  last_saved_at: string;
}

// ===== 編集用素材エクスポート =====

/** エクスポート対象カット */
export interface MaterialExportCut {
  cut_number: number;
  label: string;
  video_url: string;
  trim_start: number;
  trim_end: number | null;
}

// ===== シーン画像生成 API =====

// 参照画像の型は constants からインポート済み（ファイル先頭）
export type { ReferenceImage, ReferenceImagePurpose };

/** シーン画像生成リクエスト */
export interface GenerateSceneImageRequest {
  dialogue?: string;          // カットのセリフ（オプション）
  description_ja?: string;    // カットの脚本（日本語）
  aspect_ratio?: '9:16' | '16:9';  // アスペクト比（デフォルト: 9:16）
  image_provider?: 'nanobanana' | 'bfl_flux2_pro';  // 画像生成プロバイダー
  reference_images?: ReferenceImage[];  // 参照画像（BFL FLUX.2用、最大8枚）
  negative_prompt?: string;   // ネガティブプロンプト（BFL FLUX.2のみ対応）
}

/** シーン画像生成レスポンス */
export interface GenerateSceneImageResponse {
  image_url: string;          // 生成された画像のURL
  generated_prompt_ja: string; // 生成に使用した日本語プロンプト
  generated_prompt_en: string; // 生成に使用した英語プロンプト
  r2_key: string;             // R2ストレージのキー
  width: number;              // 画像の幅（ピクセル）
  height: number;             // 画像の高さ（ピクセル）
  aspect_ratio: string;       // アスペクト比 (9:16, 16:9)
  image_provider: string;     // 使用した画像生成プロバイダー
}

export const sceneImageApi = {
  /**
   * カットの脚本・セリフから画像を生成
   * dialogue または description_ja のどちらかは必須
   * BFL FLUX.2 + 参照画像使用時は処理時間が長くなるため、タイムアウトを300秒に設定
   */
  generate: (data: GenerateSceneImageRequest): Promise<GenerateSceneImageResponse> =>
    fetchWithAuth("/api/v1/videos/generate-scene-image", {
      method: "POST",
      body: JSON.stringify(data),
      timeout: 300000, // 5分（BFL FLUX.2 + 参照画像使用時対応）
    }),
};

// ===== FLUX.2 JSONプロンプト変換 API =====

/** FLUX.2 JSONプロンプト変換リクエスト */
export interface ConvertToFluxJsonRequest {
  description_ja: string;         // 日本語の画像説明
  negative_prompt_ja?: string;    // 日本語のネガティブプロンプト（オプション）
  aspect_ratio?: '9:16' | '16:9'; // アスペクト比（構図のヒントに使用）
}

/** FLUX.2 JSON構造のプレビュー */
export interface FluxJsonPreview {
  scene?: string;
  subject?: string;
  style?: string;
  camera?: string;
  lighting?: string;
  color_palette?: string;
  mood?: string;
  quality?: string;
}

/** FLUX.2 JSONプロンプト変換レスポンス */
export interface ConvertToFluxJsonResponse {
  json_prompt: string;            // JSON形式の英語プロンプト
  negative_prompt_en: string | null; // 英語のネガティブプロンプト
  preview: FluxJsonPreview;       // パース済みのJSONプレビュー
}

export const fluxPromptApi = {
  /**
   * 日本語の説明文をFLUX.2用のJSON構造化プロンプト（英語）に変換
   * - メインプロンプト: JSON形式の英語
   * - ネガティブプロンプト: プレーンテキストの英語
   */
  convert: (data: ConvertToFluxJsonRequest): Promise<ConvertToFluxJsonResponse> =>
    fetchWithAuth("/api/v1/videos/convert-to-flux-json", {
      method: "POST",
      body: JSON.stringify(data),
      timeout: 60000, // 1分
    }),
};

// ===== Text-to-Image API（構造化入力） =====

import type {
  StructuredImageInput,
  GenerateImageFromTextRequest as TextToImageRequest,
  GenerateImageFromTextResponse as TextToImageResponse,
} from "@/lib/constants/image-generation";

export type { StructuredImageInput, TextToImageRequest, TextToImageResponse };

export const textToImageApi = {
  /**
   * 構造化テキスト入力からシーン画像を生成
   * nanobanana 5段階テンプレートに基づいた構造化入力を使用
   * Flux画像生成は最大60秒かかるため、タイムアウトを180秒に設定
   *
   * @param data - 構造化入力データ
   * @param data.structured_input - 構造化入力（subject必須）
   * @param data.reference_image_url - 参照画像URL（オプション）
   * @param data.aspect_ratio - アスペクト比（デフォルト: 9:16）
   */
  generate: (data: TextToImageRequest): Promise<TextToImageResponse> =>
    fetchWithAuth("/api/v1/videos/generate-image-from-text", {
      method: "POST",
      body: JSON.stringify(data),
      timeout: 300000, // 5分（BFL FLUX.2 + 参照画像使用時は処理時間が長くなる）
    }),
};

// ===== Ad Creator プロジェクト管理 API =====

/** Ad Creatorプロジェクトステータス */
export type AdCreatorProjectStatus = 'draft' | 'processing' | 'completed' | 'failed';

/** Ad Creatorプロジェクト */
export interface AdCreatorProject {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  aspect_ratio: string;
  target_duration: number;
  theory: AdTheory | null;
  status: AdCreatorProjectStatus;
  thumbnail_url: string | null;
  thumbnail_webp_url?: string | null;
  final_video_url: string | null;
  project_data: AdCreatorDraftMetadata | null;
  created_at: string;
  updated_at: string;
}

/** Ad Creatorプロジェクト一覧レスポンス */
export interface AdCreatorProjectListResponse {
  projects: AdCreatorProject[];
  total: number;
  page: number;
  per_page: number;
}

/** Ad Creatorプロジェクト作成リクエスト */
export interface AdCreatorProjectCreateRequest {
  title: string;
  description?: string;
  aspect_ratio?: string;
  target_duration?: number;
  theory?: AdTheory;
  project_data?: AdCreatorDraftMetadata;
}

/** Ad Creatorプロジェクト更新リクエスト */
export interface AdCreatorProjectUpdateRequest {
  title?: string;
  description?: string;
  status?: AdCreatorProjectStatus;
  thumbnail_url?: string;
  final_video_url?: string;
  project_data?: AdCreatorDraftMetadata;
}

export const adCreatorProjectsApi = {
  /** プロジェクト一覧を取得 */
  list: (page = 1, perPage = 10): Promise<AdCreatorProjectListResponse> =>
    fetchWithAuth(`/api/v1/videos/ad-creator/projects?page=${page}&per_page=${perPage}`),

  /** プロジェクト詳細を取得 */
  get: (projectId: string): Promise<AdCreatorProject> =>
    fetchWithAuth(`/api/v1/videos/ad-creator/projects/${projectId}`),

  /** プロジェクトを作成 */
  create: (data: AdCreatorProjectCreateRequest): Promise<AdCreatorProject> =>
    fetchWithAuth("/api/v1/videos/ad-creator/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** プロジェクトを更新 */
  update: (projectId: string, data: AdCreatorProjectUpdateRequest): Promise<AdCreatorProject> =>
    fetchWithAuth(`/api/v1/videos/ad-creator/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** プロジェクトを削除 */
  delete: (projectId: string): Promise<{ message: string }> =>
    fetchWithAuth(`/api/v1/videos/ad-creator/projects/${projectId}`, {
      method: "DELETE",
    }),
};

export const adCreatorApi = {
  /**
   * ドラフトの存在確認（軽量API）
   * フルデータを取得せず、存在有無と保存日時のみ返す
   */
  checkDraftExists: (): Promise<AdCreatorDraftExistsResponse> =>
    fetchWithAuth("/api/v1/videos/ad-creator/draft/exists"),

  /**
   * 現在のユーザーのAd Creatorドラフトを取得
   * ユーザーごとに1つのドラフトのみ保持
   */
  getDraft: (): Promise<AdCreatorDraftResponse | null> =>
    fetchWithAuth("/api/v1/videos/ad-creator/draft"),

  /**
   * Ad CreatorのUI状態をドラフトとして一時保存
   * 自動保存（10秒間隔）またはページ離脱時に呼び出される
   */
  saveDraft: (draftMetadata: AdCreatorDraftMetadata): Promise<SaveDraftResponse> =>
    fetchWithAuth("/api/v1/videos/ad-creator/draft", {
      method: "PUT",
      body: JSON.stringify({ draft_metadata: draftMetadata }),
    }),

  /**
   * Ad Creatorのドラフトをクリア
   * ユーザーが「ドラフトを破棄」を選択または動画結合完了時に呼び出される
   */
  clearDraft: (): Promise<void> =>
    fetchWithAuth("/api/v1/videos/ad-creator/draft", {
      method: "DELETE",
    }),

  /**
   * 編集用素材をProRes形式でZIPダウンロード
   * 各カットをFull HD ProRes 422 HQに変換してZIPで返す
   */
  exportMaterials: async (cuts: MaterialExportCut[], aspectRatio: string = "16:9"): Promise<Blob> => {
    const token = await getAuthToken();
    const response = await fetch(`${API_URL}/api/v1/videos/ad-creator/export-materials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { "Authorization": `Bearer ${token}` }),
      },
      body: JSON.stringify({ cuts, aspect_ratio: aspectRatio }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "素材エクスポートに失敗しました" }));
      throw new Error(error.detail || "素材エクスポートに失敗しました");
    }

    return response.blob();
  },
};

// ========== ワークフローAPI（Phase 4追加） ==========

/**
 * クラウドワークフロー型
 * Note: nodes/edgesはJSONBとして保存されるためobject[]を使用
 */
export interface CloudWorkflow {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  nodes: object[];
  edges: object[];
  thumbnail_url?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface CloudWorkflowListItem {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  thumbnail_url?: string;
  updated_at: string;
}

export interface CloudWorkflowListResponse {
  workflows: CloudWorkflowListItem[];
  total: number;
}

export interface WorkflowCreateRequest {
  name: string;
  description?: string;
  nodes: object[];
  edges: object[];
  is_public?: boolean;
}

export interface WorkflowUpdateRequest {
  name?: string;
  description?: string;
  nodes?: object[];
  edges?: object[];
  is_public?: boolean;
}

export const workflowsApi = {
  // 自分のワークフロー一覧
  list: (): Promise<CloudWorkflowListResponse> =>
    fetchWithAuth('/api/v1/workflows'),

  // 公開ワークフロー一覧
  listPublic: (): Promise<CloudWorkflowListResponse> =>
    fetchWithAuth('/api/v1/workflows/public'),

  // ワークフロー取得
  get: (id: string): Promise<CloudWorkflow> =>
    fetchWithAuth(`/api/v1/workflows/${id}`),

  // ワークフロー作成
  create: (data: WorkflowCreateRequest): Promise<CloudWorkflow> =>
    fetchWithAuth('/api/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ワークフロー更新
  update: (id: string, data: WorkflowUpdateRequest): Promise<CloudWorkflow> =>
    fetchWithAuth(`/api/v1/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ワークフロー削除
  delete: (id: string): Promise<void> =>
    fetchWithAuth(`/api/v1/workflows/${id}`, {
      method: 'DELETE',
    }),

  // ワークフロー複製
  duplicate: (id: string): Promise<CloudWorkflow> =>
    fetchWithAuth(`/api/v1/workflows/${id}/duplicate`, {
      method: 'POST',
    }),
};

