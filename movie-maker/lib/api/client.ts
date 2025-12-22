import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getAuthToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
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

  createStoryVideo: (data: {
    image_url: string;
    story_text: string;
    bgm_track_id?: string;
    overlay?: {
      text?: string;
      position?: string;
      font?: string;
      color?: string;
    };
  }) => fetchWithAuth("/api/v1/videos/story", { method: "POST", body: JSON.stringify(data) }),

  // プレビュー生成（画像とプロンプトを事前確認）
  createStoryPreview: (data: {
    image_url: string;
    story_text: string;
  }): Promise<{
    preview_id: string;
    original_image_url: string;
    story_text: string;
    base_prompt: string;
    frame_prompts: Array<{
      frame: number;
      scene: string;
      element: string;
      action: string;
      style: string;
      full_prompt: string;
    }>;
    generated_image_urls: string[];
  }> => fetchWithAuth("/api/v1/videos/story/preview", { method: "POST", body: JSON.stringify(data) }),

  // プレビュー確認後、動画生成を開始
  confirmStoryVideo: (data: {
    preview_id: string;
    bgm_track_id?: string;
    overlay?: {
      text?: string;
      position?: string;
      font?: string;
      color?: string;
    };
    film_grain?: 'none' | 'light' | 'medium' | 'heavy';
    use_lut?: boolean;
  }) => fetchWithAuth("/api/v1/videos/story/confirm", { method: "POST", body: JSON.stringify(data) }),
};

// Templates API
export const templatesApi = {
  list: () => fetchWithAuth("/api/v1/templates"),
  get: (id: string) => fetchWithAuth(`/api/v1/templates/${id}`),
  listBgm: () => fetchWithAuth("/api/v1/templates/bgm/list"),
};
