/**
 * 構造化画像生成用の定数
 * バックエンドの schemas.py と同期を保つこと
 */

// ===== 画像生成プロバイダー =====

// 画像生成プロバイダー型
export type ImageProvider = "nanobanana" | "bfl_flux2_pro" | "openai_gpt_image2";

// プロバイダー情報（機能制限を含む）
export const IMAGE_PROVIDERS = [
  {
    value: "nanobanana" as const,
    label: "Nano Banana (Gemini)",
    maxLength: 50000,
    description: "高品質・長文対応・参照画像3枚対応",
    supportsStructuredInput: true,
    supportsReferenceImage: true,
    maxReferenceImages: 3,  // 最大3枚の参照画像対応
  },
  {
    value: "bfl_flux2_pro" as const,
    label: "FLUX.2 Pro (BFL)",
    maxLength: 10000,
    description: "最高品質・公式API・参照画像8枚対応",
    supportsStructuredInput: false,
    supportsReferenceImage: true,   // 複数参照画像対応
    maxReferenceImages: 8,  // 最大8枚
  },
  {
    value: "openai_gpt_image2" as const,
    label: "GPT Image 2 (OpenAI)",
    maxLength: 32000,
    description: "OpenAI 最新モデル・高解像度 (Phase 1 は text-to-image のみ)",
    supportsStructuredInput: false,
    supportsReferenceImage: false,
    // maxReferenceImages: 1,  // Phase 3+ で /edits 実装時に有効化
  },
] as const;

// プロバイダー情報を取得するヘルパー
export function getProviderInfo(provider: ImageProvider) {
  return IMAGE_PROVIDERS.find((p) => p.value === provider) ?? IMAGE_PROVIDERS[0];
}

// プロバイダーが構造化入力をサポートするか
export function supportsStructuredInput(provider: ImageProvider): boolean {
  return getProviderInfo(provider).supportsStructuredInput;
}

// プロバイダーが参照画像をサポートするか
export function supportsReferenceImage(provider: ImageProvider): boolean {
  return getProviderInfo(provider).supportsReferenceImage;
}

// プロバイダーの文字数制限を取得
export function getProviderMaxLength(provider: ImageProvider): number {
  return getProviderInfo(provider).maxLength;
}

// プロバイダーの最大参照画像数を取得
export function getProviderMaxReferenceImages(provider: ImageProvider): number {
  const info = getProviderInfo(provider);
  return "maxReferenceImages" in info ? (info as { maxReferenceImages: number }).maxReferenceImages : 0;
}

// ===== 画像ルック/テイスト =====

export type ImageLook =
  | "realistic"
  | "cinematic"
  | "anime"
  | "illustration"
  | "watercolor"
  | "3d_render"
  | "flat_design"
  | "oil_painting";

export const IMAGE_LOOKS = [
  {
    value: "cinematic" as const,
    label: "シネマティック",
    description: "映画的な質感・ARRI風の色調",
    icon: "🎬",
  },
  {
    value: "realistic" as const,
    label: "実写・フォトリアル",
    description: "自然な写真のような仕上がり",
    icon: "📷",
  },
  {
    value: "anime" as const,
    label: "アニメ",
    description: "日本のアニメスタイル・セル画調",
    icon: "🎨",
  },
  {
    value: "illustration" as const,
    label: "イラスト",
    description: "クリーンなデジタルイラスト",
    icon: "✏️",
  },
  {
    value: "watercolor" as const,
    label: "水彩画",
    description: "透明感のある水彩タッチ",
    icon: "💧",
  },
  {
    value: "3d_render" as const,
    label: "3DCG",
    description: "Pixar風の3Dレンダリング",
    icon: "🧊",
  },
  {
    value: "flat_design" as const,
    label: "フラットデザイン",
    description: "ミニマルなベクターアート",
    icon: "🔲",
  },
  {
    value: "oil_painting" as const,
    label: "油絵",
    description: "古典的な油彩画の質感",
    icon: "🖼️",
  },
] as const;

// ===== 構造化入力オプション =====

// 被写体の位置オプション
export const SUBJECT_POSITIONS = [
  { value: "center", label: "中央" },
  { value: "left", label: "左寄り" },
  { value: "right", label: "右寄り" },
  { value: "upper", label: "上部" },
  { value: "lower", label: "下部" },
  { value: "rule_of_thirds", label: "三分割法" },
] as const;

// 照明オプション
export const LIGHTING_OPTIONS = [
  { value: "soft_natural", label: "ソフトナチュラル" },
  { value: "dramatic", label: "ドラマチック" },
  { value: "studio", label: "スタジオライト" },
  { value: "backlit", label: "逆光" },
  { value: "golden_hour", label: "ゴールデンアワー" },
  { value: "moody", label: "ムーディー" },
] as const;

// ムードオプション
export const MOOD_OPTIONS = [
  { value: "luxury", label: "ラグジュアリー" },
  { value: "energetic", label: "エネルギッシュ" },
  { value: "calm", label: "穏やか" },
  { value: "playful", label: "遊び心" },
  { value: "professional", label: "プロフェッショナル" },
  { value: "nostalgic", label: "ノスタルジック" },
] as const;

// TypeScript型定義
export type SubjectPosition = (typeof SUBJECT_POSITIONS)[number]["value"];
export type LightingOption = (typeof LIGHTING_OPTIONS)[number]["value"];
export type MoodOption = (typeof MOOD_OPTIONS)[number]["value"];

// 入力モード型（フォーム入力 or テキスト入力）
export type ImageInputMode = "form" | "text";

// ===== 参照画像 =====

// 参照画像の用途
export type ReferenceImagePurpose = "character" | "style" | "product" | "clothing" | "general";

// 参照画像の用途オプション（generalがデフォルト）
export const REFERENCE_IMAGE_PURPOSES = [
  { value: "general" as const, label: "汎用（デフォルト）", description: "背景・環境の参照として使用" },
  { value: "product" as const, label: "商品配置", description: "商品の外観を維持して配置" },
  { value: "style" as const, label: "スタイル転写", description: "アートスタイル・色調を適用" },
  { value: "character" as const, label: "キャラクター一貫性", description: "同一人物の顔・外見を維持" },
  { value: "clothing" as const, label: "服・衣装", description: "服装・衣装のデザインを適用" },
] as const;

// 参照画像の型
export interface ReferenceImage {
  url: string;
  purpose: ReferenceImagePurpose;
}

// 構造化入力の型
export interface StructuredImageInput {
  subject: string;
  subject_position?: SubjectPosition | null;
  background?: string | null;
  lighting?: LightingOption | null;
  color_palette?: string | null;
  mood?: MoodOption | null;
  additional_notes?: string | null;
}

// 画像生成リクエストの型（構造化入力またはフリーテキスト）
export interface GenerateImageFromTextRequest {
  structured_input?: StructuredImageInput | null;
  free_text_description?: string | null;
  reference_image_url?: string | null;  // Nano Banana用（単一参照画像）
  reference_images?: ReferenceImage[] | null;  // BFL FLUX.2用（複数参照画像）
  aspect_ratio?: "9:16" | "16:9";
  image_provider?: ImageProvider;
  negative_prompt?: string | null;  // ネガティブプロンプト（BFL FLUX.2のみ対応）
}

// シーン画像生成リクエストの型
export interface GenerateSceneImageRequest {
  dialogue?: string | null;
  description_ja?: string | null;
  aspect_ratio?: "9:16" | "16:9";
  image_provider?: ImageProvider;
  image_look?: ImageLook;
  reference_images?: ReferenceImage[] | null;  // BFL FLUX.2用（複数参照画像）
  negative_prompt?: string | null;  // ネガティブプロンプト（BFL FLUX.2のみ対応）
}

// 画像生成レスポンスの型
export interface GenerateImageFromTextResponse {
  image_url: string;
  generated_prompt_ja: string;
  generated_prompt_en: string;
}

// フォームの初期値
export const INITIAL_STRUCTURED_INPUT: StructuredImageInput = {
  subject: "",
  subject_position: null,
  background: null,
  lighting: null,
  color_palette: null,
  mood: null,
  additional_notes: null,
};
