/**
 * アニメーションスタイルテンプレート定義
 * Image-to-Video用のスタイルプリセット
 */

export type AnimationCategory = '2d' | '3d';

export type AnimationTemplateId =
  | 'A-1' | 'A-2' | 'A-3' | 'A-4'  // 2D templates
  | 'B-1' | 'B-2' | 'B-3' | 'B-4'; // 3D templates

export interface AnimationTemplate {
  id: AnimationTemplateId;
  name: string;
  nameJa: string;
  description: string;
  icon: string;
}

export const ANIMATION_TEMPLATES: Record<AnimationCategory, AnimationTemplate[]> = {
  '2d': [
    {
      id: 'A-1',
      name: 'Modern TV Anime',
      nameJa: 'モダン・TVアニメ風',
      description: '現代的なTVアニメスタイル。シャープな線と高コントラストの影。',
      icon: '📺',
    },
    {
      id: 'A-2',
      name: 'Ghibli Style',
      nameJa: 'ジブリ風',
      description: '手書きの温かみと水彩画のような柔らかさ。',
      icon: '🌿',
    },
    {
      id: 'A-3',
      name: '90s Retro Cel',
      nameJa: '90年代レトロ',
      description: 'フィルムグレインとVHSノイズのエモい質感。',
      icon: '📼',
    },
    {
      id: 'A-4',
      name: 'Flat Design',
      nameJa: 'ゆるキャラ・フラット',
      description: 'シンプルで親しみやすいスタイル。説明動画やPR向け。',
      icon: '🎯',
    },
  ],
  '3d': [
    {
      id: 'B-1',
      name: 'Photorealistic',
      nameJa: 'フォトリアル',
      description: '実写と見分けがつかない写実性。映画VFX品質。',
      icon: '🎬',
    },
    {
      id: 'B-2',
      name: 'Game UE5 Style',
      nameJa: 'ゲーム・UE5風',
      description: 'AAA級ゲームのビジュアル。レイトレーシングと動的な影。',
      icon: '🎮',
    },
    {
      id: 'B-3',
      name: 'Pixar Style',
      nameJa: 'ピクサー風',
      description: 'ディズニー/ピクサーの親しみやすいデフォルメスタイル。',
      icon: '✨',
    },
    {
      id: 'B-4',
      name: 'Low Poly PS1',
      nameJa: 'PS1風レトロ',
      description: 'PS1/N64時代のローポリスタイル。ノスタルジックな3D。',
      icon: '👾',
    },
  ],
} as const;

/**
 * カテゴリIDからカテゴリ名を取得
 */
export const ANIMATION_CATEGORY_LABELS: Record<AnimationCategory, string> = {
  '2d': '2D アニメーション',
  '3d': '3D アニメーション',
};

/**
 * テンプレートIDからテンプレート情報を取得
 */
export function getAnimationTemplate(
  category: AnimationCategory,
  templateId: AnimationTemplateId
): AnimationTemplate | undefined {
  return ANIMATION_TEMPLATES[category].find((t) => t.id === templateId);
}

/**
 * テンプレートIDからカテゴリを逆引き
 */
export function getCategoryFromTemplateId(
  templateId: AnimationTemplateId
): AnimationCategory | undefined {
  if (templateId.startsWith('A-')) return '2d';
  if (templateId.startsWith('B-')) return '3d';
  return undefined;
}
