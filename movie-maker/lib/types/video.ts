// アスペクト比の型定義
export type AspectRatio = "9:16" | "16:9" | "1:1";

export interface AspectRatioOption {
  value: AspectRatio;
  label: string;
  description: string;
  platforms: string[];
}

// アスペクト比の選択肢
export const ASPECT_RATIOS: AspectRatioOption[] = [
  {
    value: "9:16",
    label: "縦長",
    description: "縦長動画（ショート動画向け）",
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts"],
  },
  {
    value: "16:9",
    label: "横長",
    description: "横長動画（通常動画向け）",
    platforms: ["YouTube", "Facebook広告", "TV CM"],
  },
  {
    value: "1:1",
    label: "正方形",
    description: "正方形動画（SNS投稿向け）",
    platforms: ["Instagram投稿", "Facebook投稿"],
  },
];

// アスペクト比からCSSのaspect-ratio値を取得
export function getAspectRatioCSS(ratio: AspectRatio): string {
  return ratio.replace(":", "/");
}

// アスペクト比の数値を取得（幅/高さ）
export function getAspectRatioValue(ratio: AspectRatio): number {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}

// 動画生成プロバイダーの型定義
export type VideoProvider = 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';

export interface VideoProviderOption {
  value: VideoProvider;
  label: string;
  description: string;
}

// 動画生成プロバイダーの選択肢
export const VIDEO_PROVIDERS: VideoProviderOption[] = [
  {
    value: "runway",
    label: "Runway Gen-3",
    description: "高品質・安定（デフォルト）",
  },
  {
    value: "veo",
    label: "Google Veo",
    description: "Google製・実験的",
  },
  {
    value: "domoai",
    label: "DomoAI",
    description: "アニメ特化",
  },
  {
    value: "piapi_kling",
    label: "Kling AI",
    description: "低コスト・高品質",
  },
  {
    value: "hailuo",
    label: "HailuoAI",
    description: "MiniMax製・カメラワーク",
  },
];
