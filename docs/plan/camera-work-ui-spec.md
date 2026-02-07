# カメラワーク選択UI 実装仕様書

## 概要

ユーザーが動画生成時にカメラワーク（カメラの動き）を直感的に選択できるUIを実装する。
専門用語を避け、素人でもわかりやすいUXを重視する。

### サマリー

| 項目 | 内容 |
|-----|------|
| **総カメラワーク数** | 122種（camera_prompts.yaml 全量） |
| **カテゴリ数** | 8カテゴリ（素人向けに再分類） |
| **プリセット** | 3種（シンプル/シネマティック/ダイナミック） |
| **UI方式** | 2段階選択（プリセット → カスタム展開） |

### カテゴリ別内訳

| カテゴリ | アイコン | 説明 | 種類数 |
|---------|---------|------|--------|
| 動かさない | 📍 | カメラ固定 | 2 |
| 近づく・離れる | ↔️ | 距離を変える | 21 |
| 左右に動く | ↔ | 横方向の動き | 14 |
| 上下に動く | ↕ | 縦方向の動き | 18 |
| 回り込む | 🔄 | 周囲を回転 | 17 |
| 追いかける | 🏃 | 被写体を追従 | 26 |
| ドラマ演出 | 🎬 | 特殊効果 | 21 |
| 時間表現 | ⏱️ | タイムラプス等 | 3 |

---

## デザイン方針

### 2段階選択方式

1. **プリセット選択（デフォルト）**: 3つのプリセットから選ぶだけ
2. **カスタム選択（展開時）**: GIFカード形式で詳細選択

```
┌─────────────────────────────────────────┐
│  [プリセット3択]  ← 初心者はここで完結    │
│         ↓                               │
│  「カスタム」を選ぶと展開                 │
│         ↓                               │
│  [GIFカード一覧]  ← こだわり派向け        │
└─────────────────────────────────────────┘
```

---

## UI設計

### Phase 1: プリセット選択

```
┌─────────────────────────────────────────────────────────────┐
│  🎬 カメラの動き                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📍 シンプル                        ● 選択中          │   │
│  │  カメラ固定。被写体の動きだけに集中させる              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🎬 シネマティック                                    │   │
│  │  ゆっくり近づく映画的な動き                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🌀 ダイナミック                                      │   │
│  │  被写体の周りを回り込む立体的な動き                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚙️ カスタム                                         │   │
│  │  自分でカメラワークを選ぶ ▶                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: カスタム選択（展開時）

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ カスタム - カメラワークを選ぶ                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ カテゴリ: [すべて ▼]                                  │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ [GIF]      │  │ [GIF]      │  │ [GIF]      │           │
│  │   ↓↓↓     │  │    ⟳      │  │   →→→     │           │
│  ├────────────┤  ├────────────┤  ├────────────┤           │
│  │ 近づく     │  │ 回り込む   │  │ 横に流れる │           │
│  │ 表情を強調 │  │ 立体的に   │  │ 動きを追う │           │
│  │ ● 選択中  │  │ ○         │  │ ○         │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ [GIF]      │  │ [GIF]      │  │ [GIF]      │           │
│  │    ●      │  │   ↗↗↗     │  │    🔄      │           │
│  ├────────────┤  ├────────────┤  ├────────────┤           │
│  │ 固定       │  │ 見上げる   │  │ ぐるっと一周│           │
│  │ 安定した   │  │ 迫力を出す │  │ 決めシーン │           │
│  │ ○         │  │ ○         │  │ ○         │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                             │
│  [プリセットに戻る]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## データ構造

### プリセット定義

```typescript
// types/camera.ts

export type CameraPreset = 'simple' | 'cinematic' | 'dynamic' | 'custom';

export interface CameraPresetConfig {
  id: CameraPreset;
  icon: string;
  label: string;
  description: string;
  // 実際に適用されるカメラワークID（camera_prompts.yamlのid）
  cameraWorkIds: number[];
  // KlingAIに送るプロンプト文字列
  promptText: string;
}

export const CAMERA_PRESETS: CameraPresetConfig[] = [
  {
    id: 'simple',
    icon: '📍',
    label: 'シンプル',
    description: 'カメラ固定。被写体の動きだけに集中させる',
    cameraWorkIds: [13], // Static Shot
    promptText: 'static shot, camera remains still',
  },
  {
    id: 'cinematic',
    icon: '🎬',
    label: 'シネマティック',
    description: 'ゆっくり近づく映画的な動き',
    cameraWorkIds: [20, 22], // Dolly In, Push In
    promptText: 'slow dolly in, cinematic camera movement',
  },
  {
    id: 'dynamic',
    icon: '🌀',
    label: 'ダイナミック',
    description: '被写体の周りを回り込む立体的な動き',
    cameraWorkIds: [40, 42], // Orbit Shot, Arc Shot
    promptText: 'orbit shot around the subject, dynamic camera movement',
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
```

### カスタム選択用データ

```typescript
// types/camera.ts

export interface CameraWork {
  id: number;
  name: string;           // 英語名（内部用）
  label: string;          // 日本語ラベル（UI表示用）
  description: string;    // 効果の説明
  category: CameraCategory;
  promptText: string;     // KlingAIに送るプロンプト
  gifUrl: string;         // プレビューGIF URL
  iconSymbol: string;     // アイコン記号（↓↓↓, ⟳ など）
}

// 素人にもわかりやすい8カテゴリに再編成
export type CameraCategory =
  | 'static'       // 動かさない
  | 'approach'     // 近づく・離れる
  | 'horizontal'   // 左右に動く
  | 'vertical'     // 上下に動く
  | 'orbit'        // 回り込む
  | 'follow'       // 追いかける
  | 'dramatic'     // ドラマ演出
  | 'timelapse';   // 時間表現

export const CAMERA_CATEGORIES: { id: CameraCategory; label: string; icon: string; description: string }[] = [
  { id: 'static', label: '動かさない', icon: '📍', description: 'カメラ固定で被写体に集中' },
  { id: 'approach', label: '近づく・離れる', icon: '↔️', description: '被写体との距離を変える' },
  { id: 'horizontal', label: '左右に動く', icon: '↔', description: '横方向にカメラを動かす' },
  { id: 'vertical', label: '上下に動く', icon: '↕', description: '縦方向にカメラを動かす' },
  { id: 'orbit', label: '回り込む', icon: '🔄', description: '被写体の周りを回転' },
  { id: 'follow', label: '追いかける', icon: '🏃', description: '被写体を追従する' },
  { id: 'dramatic', label: 'ドラマ演出', icon: '🎬', description: '特殊な演出効果' },
  { id: 'timelapse', label: '時間表現', icon: '⏱️', description: '時間経過を表現' },
];
```

### カスタム用カメラワーク（全122種）

camera_prompts.yaml の全122種を素人向けカテゴリに再分類:

```typescript
// lib/camera/camera-works.ts
// camera_prompts.yaml から自動生成

export const CAMERA_WORKS: CameraWork[] = [
  // ==========================================
  // 📍 動かさない (static) - 2種
  // ==========================================
  {
    id: 13,
    name: 'static_shot',
    label: '固定ショット',
    description: 'カメラを動かさず被写体に集中',
    category: 'static',
    promptText: 'static shot focusing on the subject',
    iconSymbol: '●',
  },
  {
    id: 61,
    name: 'over_the_shoulder',
    label: '肩越しショット',
    description: '肩越しに対象を映す（会話シーン向き）',
    category: 'static',
    promptText: 'over the shoulder shot capturing the other character\'s expression',
    iconSymbol: '👤',
  },

  // ==========================================
  // ↔️ 近づく・離れる (approach) - 21種
  // ==========================================
  {
    id: 16,
    name: 'zoom_in',
    label: 'ズームイン',
    description: 'カメラ位置固定で被写体を拡大',
    category: 'approach',
    promptText: 'zoom in on the character\'s face to emphasize tension',
    iconSymbol: '🔍',
  },
  {
    id: 17,
    name: 'zoom_out',
    label: 'ズームアウト',
    description: 'カメラ位置固定で視野を広げる',
    category: 'approach',
    promptText: 'zoom out to reveal the entire scene',
    iconSymbol: '🔎',
  },
  {
    id: 18,
    name: 'quick_zoom_in',
    label: '素早くズームイン',
    description: '急速にズームして驚きを表現',
    category: 'approach',
    promptText: 'quick zoom in for dramatic effect',
    iconSymbol: '⚡🔍',
  },
  {
    id: 19,
    name: 'quick_zoom_out',
    label: '素早くズームアウト',
    description: '急速にズームアウトして全体を見せる',
    category: 'approach',
    promptText: 'quick zoom out to show the full scene',
    iconSymbol: '⚡🔎',
  },
  {
    id: 20,
    name: 'dolly_in',
    label: '近づく',
    description: 'カメラごと被写体に近づく（迫力・没入感）',
    category: 'approach',
    promptText: 'dolly in on the protagonist during the confession scene',
    iconSymbol: '→●',
  },
  {
    id: 21,
    name: 'dolly_out',
    label: '離れる',
    description: 'カメラごと被写体から離れる（空間の広がり）',
    category: 'approach',
    promptText: 'dolly out from the character to show the vast cityscape',
    iconSymbol: '●→',
  },
  {
    id: 22,
    name: 'push_in',
    label: 'プッシュイン',
    description: '被写体に向かって押し込むように近づく',
    category: 'approach',
    promptText: 'push in for close-up on the character\'s expression',
    iconSymbol: '⇒●',
  },
  {
    id: 23,
    name: 'pull_out',
    label: 'プルアウト',
    description: 'クローズアップから引いて全体を見せる',
    category: 'approach',
    promptText: 'pull out to wide shot to show the entire scene',
    iconSymbol: '●⇒',
  },
  {
    id: 24,
    name: 'zoom_in_background',
    label: '背景にズーム',
    description: '背景の特定要素にズームイン',
    category: 'approach',
    promptText: 'zoom in on the distant building',
    iconSymbol: '🏢🔍',
  },
  {
    id: 25,
    name: 'zoom_out_landscape',
    label: '風景全体を見せる',
    description: '徐々にズームアウトして全体の風景を見せる',
    category: 'approach',
    promptText: 'zoom out to reveal entire landscape',
    iconSymbol: '🌄',
  },
  {
    id: 26,
    name: 'dolly_in_tilt_up',
    label: '近づきながら見上げる',
    description: '前進しながら上に向ける複合動作',
    category: 'approach',
    promptText: 'dolly in while tilting up',
    iconSymbol: '↗→●',
  },
  {
    id: 27,
    name: 'dolly_zoom_in',
    label: 'めまい効果（近づく）',
    description: '近づきながらズームアウト（背景が歪む不思議な効果）',
    category: 'approach',
    promptText: 'dolly zoom in creating a disorienting effect',
    iconSymbol: '🌀→',
  },
  {
    id: 28,
    name: 'dolly_zoom_out',
    label: 'めまい効果（離れる）',
    description: '離れながらズームイン（背景が急変する効果）',
    category: 'approach',
    promptText: 'reverse dolly zoom out',
    iconSymbol: '←🌀',
  },
  {
    id: 29,
    name: 'vertigo_in',
    label: 'ヴァーティゴ（前進）',
    description: '前進＋ズームアウトで不安・めまい感',
    category: 'approach',
    promptText: 'dolly zoom in on the protagonist while zooming out to distort the hallway',
    iconSymbol: '😵→',
  },
  {
    id: 30,
    name: 'vertigo_out',
    label: 'ヴァーティゴ（後退）',
    description: '後退＋ズームインで緊張感',
    category: 'approach',
    promptText: 'dolly zoom out from the classroom while zooming in',
    iconSymbol: '←😵',
  },
  {
    id: 31,
    name: 'rapid_face_approach',
    label: '顔に急接近',
    description: 'キャラの顔に向かって急速に近づく',
    category: 'approach',
    promptText: 'move rapidly toward a character\'s face',
    iconSymbol: '⚡😊',
  },
  {
    id: 32,
    name: 'dolly_diagonal',
    label: '斜めに移動',
    description: 'シーンを対角線に沿って移動',
    category: 'approach',
    promptText: 'dolly diagonally across the scene',
    iconSymbol: '↗',
  },
  {
    id: 33,
    name: 'slow_approach_building',
    label: '建物にゆっくり接近',
    description: '遠くの建物に向かってゆっくり前進',
    category: 'approach',
    promptText: 'dolly forward slowly toward a distant building',
    iconSymbol: '🏢←',
  },
  {
    id: 34,
    name: 'backward_from_character',
    label: 'キャラから後退',
    description: 'キャラクターから後ろに下がる（避ける感じ）',
    category: 'approach',
    promptText: 'dolly backward from a character as they back away',
    iconSymbol: '😟←',
  },
  {
    id: 35,
    name: 'dolly_out_doorway',
    label: 'ドアから後退',
    description: 'ドアを通って後退する（退出感）',
    category: 'approach',
    promptText: 'dolly out through a doorway',
    iconSymbol: '🚪←',
  },
  {
    id: 36,
    name: 'zoom_eyes',
    label: '目にズーム',
    description: 'キャラクターの目に段階的にズームイン',
    category: 'approach',
    promptText: 'zoom in gradually on a character\'s eyes',
    iconSymbol: '👁️🔍',
  },

  // ==========================================
  // ↔ 左右に動く (horizontal) - 14種
  // ==========================================
  {
    id: 1,
    name: 'pan_left',
    label: '左に振る',
    description: 'カメラを固定したまま左に振る',
    category: 'horizontal',
    promptText: 'pan left to show the second character',
    iconSymbol: '←',
  },
  {
    id: 2,
    name: 'pan_right',
    label: '右に振る',
    description: 'カメラを固定したまま右に振る',
    category: 'horizontal',
    promptText: 'pan right slowly to reveal the school building',
    iconSymbol: '→',
  },
  {
    id: 7,
    name: 'truck_left',
    label: '左に横移動',
    description: 'カメラを横に左へ移動',
    category: 'horizontal',
    promptText: 'truck left to show the neighbor',
    iconSymbol: '⇐',
  },
  {
    id: 8,
    name: 'truck_right',
    label: '右に横移動',
    description: 'カメラを横に右へ移動',
    category: 'horizontal',
    promptText: 'truck right following the character',
    iconSymbol: '⇒',
  },
  {
    id: 11,
    name: 'track_left',
    label: '左にトラック',
    description: '被写体と平行に左方向へ移動',
    category: 'horizontal',
    promptText: 'track left smoothly',
    iconSymbol: '⟵',
  },
  {
    id: 12,
    name: 'track_right',
    label: '右にトラック',
    description: '被写体と平行に右方向へ移動',
    category: 'horizontal',
    promptText: 'track right following the action',
    iconSymbol: '⟶',
  },
  {
    id: 14,
    name: 'diagonal_up_right',
    label: '斜め右上に移動',
    description: 'カメラが斜め右上に移動',
    category: 'horizontal',
    promptText: 'move diagonally up and right',
    iconSymbol: '↗',
  },
  {
    id: 15,
    name: 'diagonal_down_left',
    label: '斜め左下に移動',
    description: 'カメラが斜め左下に移動',
    category: 'horizontal',
    promptText: 'move diagonally down and left',
    iconSymbol: '↙',
  },
  {
    id: 69,
    name: 'pan_quick_left',
    label: '素早く左パン',
    description: '速く動くものを追うために急いで左にパン',
    category: 'horizontal',
    promptText: 'pan quickly left to follow a fast-moving object',
    iconSymbol: '⚡←',
  },
  {
    id: 70,
    name: 'move_through_crowd',
    label: '群衆の中を横移動',
    description: '群衆の中を横にカメラが移動',
    category: 'horizontal',
    promptText: 'move sideways through a crowd',
    iconSymbol: '👥↔',
  },
  {
    id: 71,
    name: 'curved_path_right',
    label: '右へ曲線移動',
    description: '右方向に曲線を描くように移動',
    category: 'horizontal',
    promptText: 'move along curved path to the right',
    iconSymbol: '↷',
  },
  {
    id: 72,
    name: 'curved_path_left',
    label: '左へ曲線移動',
    description: '左方向に曲線を描くように移動',
    category: 'horizontal',
    promptText: 'move along curved path to the left',
    iconSymbol: '↶',
  },
  {
    id: 85,
    name: 'pan_face_to_surrounding',
    label: '顔から周囲へパン',
    description: 'キャラの顔から周囲のエリアにパン',
    category: 'horizontal',
    promptText: 'pan from character\'s face to the surrounding area',
    iconSymbol: '😊→🌳',
  },
  {
    id: 86,
    name: 'slow_pan_horizon',
    label: '水平線をゆっくりパン',
    description: '水平線をゆっくりとパンする',
    category: 'horizontal',
    promptText: 'slow pan across the horizon',
    iconSymbol: '🌅↔',
  },

  // ==========================================
  // ↕ 上下に動く (vertical) - 18種
  // ==========================================
  {
    id: 3,
    name: 'tilt_up',
    label: '見上げる',
    description: 'カメラを固定したまま上に振る',
    category: 'vertical',
    promptText: 'tilt up from feet to face',
    iconSymbol: '↑',
  },
  {
    id: 4,
    name: 'tilt_down',
    label: '見下ろす',
    description: 'カメラを固定したまま下に振る',
    category: 'vertical',
    promptText: 'tilt down from rooftop to ground',
    iconSymbol: '↓',
  },
  {
    id: 5,
    name: 'pedestal_up',
    label: 'カメラを上げる',
    description: 'カメラ自体を真っ直ぐ上に上げる',
    category: 'vertical',
    promptText: 'pedestal up from the ground in a flower field to reveal blossoms and blue sky',
    iconSymbol: '⬆',
  },
  {
    id: 6,
    name: 'pedestal_down',
    label: 'カメラを下げる',
    description: 'カメラ自体を真っ直ぐ下げる',
    category: 'vertical',
    promptText: 'pedestal down from the rooftop to show the busy intersection below',
    iconSymbol: '⬇',
  },
  {
    id: 9,
    name: 'crane_up',
    label: 'クレーンで上昇',
    description: 'クレーンでカメラを上へ移動',
    category: 'vertical',
    promptText: 'crane up to reveal the whole scene',
    iconSymbol: '🏗️↑',
  },
  {
    id: 10,
    name: 'crane_down',
    label: 'クレーンで下降',
    description: 'クレーンでカメラを下へ移動',
    category: 'vertical',
    promptText: 'crane down from rooftop to ground',
    iconSymbol: '🏗️↓',
  },
  {
    id: 76,
    name: 'through_tree_canopy',
    label: '木の間を上昇',
    description: '木の枝の間を上に移動する',
    category: 'vertical',
    promptText: 'move up through a tree canopy',
    iconSymbol: '🌳↑',
  },
  {
    id: 77,
    name: 'through_branches',
    label: '枝を抜けて上昇',
    description: '木の枝を通り抜けて上昇',
    category: 'vertical',
    promptText: 'move upward through the branches of a tree',
    iconSymbol: '🌿↑',
  },
  {
    id: 82,
    name: 'tilt_feet_to_head',
    label: '足から頭へ',
    description: '足元から頭までカメラを傾けて移動',
    category: 'vertical',
    promptText: 'tilt up from character\'s feet to their head',
    iconSymbol: '👟→👤',
  },
  {
    id: 83,
    name: 'tilt_reveal_hidden',
    label: '隠れた部分を見せる',
    description: '下に傾けて隠されたディテールを見せる',
    category: 'vertical',
    promptText: 'tilt down to reveal a hidden detail',
    iconSymbol: '↓❓',
  },
  {
    id: 84,
    name: 'tilt_reveal_path',
    label: '下の道を見せる',
    description: '下にある道を見せるために下向きに傾ける',
    category: 'vertical',
    promptText: 'tilt down to reveal a path below',
    iconSymbol: '↓🛤️',
  },
  {
    id: 90,
    name: 'tilt_over_cityscape',
    label: '都市を見下ろす',
    description: '都市景観をゆっくりと下に傾ける',
    category: 'vertical',
    promptText: 'tilt down slowly over a cityscape',
    iconSymbol: '🏙️↓',
  },
  {
    id: 91,
    name: 'quick_tilt_up_sky',
    label: '空を素早く見上げる',
    description: '素早く上に傾けて空を映す',
    category: 'vertical',
    promptText: 'tilt up quickly to reveal sky',
    iconSymbol: '⚡↑☁️',
  },
  {
    id: 92,
    name: 'quick_tilt_down_ground',
    label: '地面を素早く見下ろす',
    description: '素早く下に傾けて地面を映す',
    category: 'vertical',
    promptText: 'tilt down quickly to reveal ground',
    iconSymbol: '⚡↓',
  },
  {
    id: 93,
    name: 'tilt_zoom_combo',
    label: '傾け＋ズーム同時',
    description: '傾けると同時にズームする',
    category: 'vertical',
    promptText: 'tilt and zoom simultaneously',
    iconSymbol: '↕🔍',
  },
  {
    id: 95,
    name: 'jib_up_tilt_down',
    label: '上昇しながら見下ろす',
    description: 'カメラを上昇させながら下に傾ける',
    category: 'vertical',
    promptText: 'jib up and tilt down',
    iconSymbol: '⬆↓',
  },
  {
    id: 96,
    name: 'jib_down_tilt_up',
    label: '下降しながら見上げる',
    description: 'カメラを下降させながら上に傾ける',
    category: 'vertical',
    promptText: 'jib down and tilt up',
    iconSymbol: '⬇↑',
  },
  {
    id: 112,
    name: 'tilt_head_to_object',
    label: '頭から手持ち物へ',
    description: 'キャラの頭から手に持っている物に向かって下に傾ける',
    category: 'vertical',
    promptText: 'tilt from character\'s head to an object in their hand',
    iconSymbol: '👤→✋',
  },

  // ==========================================
  // 🔄 回り込む (orbit) - 17種
  // ==========================================
  {
    id: 37,
    name: 'orbit_clockwise',
    label: '時計回りに回る',
    description: '被写体を中心に時計回りにカメラを回転',
    category: 'orbit',
    promptText: 'orbit shot around the heroine to show her classmates',
    iconSymbol: '↻',
  },
  {
    id: 38,
    name: 'orbit_counterclockwise',
    label: '反時計回りに回る',
    description: '被写体を中心に反時計回りにカメラを回転',
    category: 'orbit',
    promptText: 'orbit counterclockwise around the subject',
    iconSymbol: '↺',
  },
  {
    id: 39,
    name: 'circle_slow',
    label: 'ゆっくり周回',
    description: '被写体の周囲をゆっくり回る',
    category: 'orbit',
    promptText: 'circle around the subject slowly',
    iconSymbol: '🐢🔄',
  },
  {
    id: 40,
    name: 'orbit_shot',
    label: '回り込む',
    description: '被写体を中心に円を描くように回る',
    category: 'orbit',
    promptText: 'orbit shot around the heroine',
    iconSymbol: '⟳',
  },
  {
    id: 41,
    name: '360_shot',
    label: 'ぐるっと一周',
    description: '被写体を一周回り込む',
    category: 'orbit',
    promptText: '360-degree shot circling the protagonist during the transformation',
    iconSymbol: '🔄',
  },
  {
    id: 42,
    name: 'arc_shot',
    label: '半周する',
    description: '半円や部分的に回り込む',
    category: 'orbit',
    promptText: 'arc shot half-circle around two characters talking',
    iconSymbol: '↷',
  },
  {
    id: 43,
    name: 'arc_left_tilt_up',
    label: '左アーク＋見上げる',
    description: '左に弧を描きながら上に傾ける',
    category: 'orbit',
    promptText: 'arc left while tilting up',
    iconSymbol: '↶↑',
  },
  {
    id: 44,
    name: 'arc_right_tilt_down',
    label: '右アーク＋見下ろす',
    description: '右に弧を描きながら下に傾ける',
    category: 'orbit',
    promptText: 'arc right while tilting down',
    iconSymbol: '↷↓',
  },
  {
    id: 45,
    name: 'rotate_vertical',
    label: '垂直に回転',
    description: '垂直方向に被写体を中心にカメラを回転',
    category: 'orbit',
    promptText: 'rotate around subject vertically',
    iconSymbol: '🔃',
  },
  {
    id: 46,
    name: 'rotate_left_45',
    label: '左45度回転',
    description: '左に45度回転する',
    category: 'orbit',
    promptText: 'rotate left 45 degrees',
    iconSymbol: '↰45°',
  },
  {
    id: 47,
    name: 'rotate_right_45',
    label: '右45度回転',
    description: '右に45度回転する',
    category: 'orbit',
    promptText: 'rotate right 45 degrees',
    iconSymbol: '↱45°',
  },
  {
    id: 48,
    name: 'rotate_360',
    label: '360度回転',
    description: '被写体を中心に360度回転',
    category: 'orbit',
    promptText: 'rotate 360 degrees around subject',
    iconSymbol: '🔄360°',
  },
  {
    id: 49,
    name: 'rotate_looking_up',
    label: 'その場で回転＋見上げる',
    description: 'その場で回転しながら上を見上げる',
    category: 'orbit',
    promptText: 'rotate in place while looking upward',
    iconSymbol: '🔄↑',
  },
  {
    id: 50,
    name: 'orbit_group',
    label: 'グループを周回',
    description: '複数の人々を中心にカメラが周回',
    category: 'orbit',
    promptText: 'orbit around group of people',
    iconSymbol: '👥🔄',
  },
  {
    id: 51,
    name: 'circle_statue',
    label: '彫像を周回',
    description: '彫像を中心にゆっくりとカメラを回転',
    category: 'orbit',
    promptText: 'circle around a statue',
    iconSymbol: '🗿🔄',
  },
  {
    id: 52,
    name: 'rotate_table_conversation',
    label: 'テーブル周回',
    description: '会話中のテーブルを中心にカメラが回転',
    category: 'orbit',
    promptText: 'rotate around a table during a conversation',
    iconSymbol: '🍽️🔄',
  },
  {
    id: 53,
    name: 'circle_duel',
    label: '決闘シーン周回',
    description: '決闘している二人の周りをカメラが回転',
    category: 'orbit',
    promptText: 'circle around two characters having a duel',
    iconSymbol: '⚔️🔄',
  },

  // ==========================================
  // 🏃 追いかける (follow) - 26種
  // ==========================================
  {
    id: 54,
    name: 'handheld',
    label: '手持ちカメラ風',
    description: '手持ちカメラのようにわざと揺らす',
    category: 'follow',
    promptText: 'handheld camera style during the school sports festival',
    iconSymbol: '📹',
  },
  {
    id: 55,
    name: 'shake',
    label: '揺らす',
    description: '意図的にカメラを揺らす',
    category: 'follow',
    promptText: 'camera shake in the forest during an explosion',
    iconSymbol: '📳',
  },
  {
    id: 56,
    name: 'shake_explosion',
    label: '爆発の衝撃',
    description: '爆発の衝撃をシミュレートして少し揺らす',
    category: 'follow',
    promptText: 'shake slightly to simulate an explosion impact',
    iconSymbol: '💥📳',
  },
  {
    id: 57,
    name: 'shake_earthquake',
    label: '地震の揺れ',
    description: '地震の揺れをシミュレートして激しく揺らす',
    category: 'follow',
    promptText: 'shake violently to simulate an earthquake',
    iconSymbol: '🌋📳',
  },
  {
    id: 58,
    name: 'steadicam',
    label: 'ステディカム',
    description: '滑らかに移動（ワンカット向き）',
    category: 'follow',
    promptText: 'steadicam shot smoothly following the character running down the hallway',
    iconSymbol: '🎥',
  },
  {
    id: 59,
    name: 'drone',
    label: 'ドローン撮影',
    description: '上空から広い範囲を撮影',
    category: 'follow',
    promptText: 'drone shot rising from the rooftop to reveal the entire school grounds',
    iconSymbol: '🚁',
  },
  {
    id: 60,
    name: 'pov',
    label: '一人称視点',
    description: 'キャラの視点そのまま（没入感）',
    category: 'follow',
    promptText: 'POV shot walking through the hallway from the protagonist\'s perspective',
    iconSymbol: '👁️',
  },
  {
    id: 62,
    name: 'tracking',
    label: '追従する',
    description: 'キャラを追従して移動',
    category: 'follow',
    promptText: 'tracking shot following the character running through the park',
    iconSymbol: '🏃→',
  },
  {
    id: 63,
    name: 'follow_behind',
    label: '背後から追跡',
    description: '被写体の後ろから追跡',
    category: 'follow',
    promptText: 'follow subject from behind',
    iconSymbol: '👤←📷',
  },
  {
    id: 64,
    name: 'follow_side',
    label: '横から追跡',
    description: '被写体の横から追跡',
    category: 'follow',
    promptText: 'follow subject from the side',
    iconSymbol: '👤↔📷',
  },
  {
    id: 65,
    name: 'track_hand',
    label: '手の動きを追う',
    description: 'キャラの手の動きを追いかける',
    category: 'follow',
    promptText: 'track character\'s hand movements',
    iconSymbol: '✋→',
  },
  {
    id: 66,
    name: 'follow_bird',
    label: '鳥を追う',
    description: '飛んでいる鳥を追うために上向きにパン',
    category: 'follow',
    promptText: 'pan upwards to follow a bird in flight',
    iconSymbol: '🐦↑',
  },
  {
    id: 67,
    name: 'track_car',
    label: '車を追う',
    description: '曲がりくねった道を走る車を追跡',
    category: 'follow',
    promptText: 'track a car as it speeds along a winding road',
    iconSymbol: '🚗→',
  },
  {
    id: 68,
    name: 'follow_running',
    label: '走る人を追う',
    description: '走っているキャラを背後から追いかける',
    category: 'follow',
    promptText: 'follow a running character from behind',
    iconSymbol: '🏃←📷',
  },
  {
    id: 73,
    name: 'push_narrow',
    label: '狭い空間を通る',
    description: '狭い空間を通り抜けるようにカメラを進める',
    category: 'follow',
    promptText: 'push through narrow space',
    iconSymbol: '→||→',
  },
  {
    id: 74,
    name: 'backward_hallway',
    label: '廊下を後退',
    description: '狭い廊下を後ろ向きにカメラが移動',
    category: 'follow',
    promptText: 'move backward through a narrow hallway',
    iconSymbol: '←🚪',
  },
  {
    id: 75,
    name: 'backward_forest',
    label: '森林を後退',
    description: '密集した森林の中を後ろ向きに移動',
    category: 'follow',
    promptText: 'move backward through a dense forest',
    iconSymbol: '←🌲',
  },
  {
    id: 78,
    name: 'glide_lake',
    label: '湖面を滑る',
    description: '湖の水面を滑らかに横切る',
    category: 'follow',
    promptText: 'glide smoothly across a lake surface',
    iconSymbol: '🌊→',
  },
  {
    id: 79,
    name: 'glide_river',
    label: '川面を滑る',
    description: '川の表面に沿って滑るように移動',
    category: 'follow',
    promptText: 'glide along a river surface',
    iconSymbol: '🏞️→',
  },
  {
    id: 80,
    name: 'glide_desert',
    label: '砂漠を滑る',
    description: '砂漠の風景を滑るように移動',
    category: 'follow',
    promptText: 'glide over a desert landscape',
    iconSymbol: '🏜️→',
  },
  {
    id: 81,
    name: 'glide_ocean_sunset',
    label: '夕焼けの海を滑る',
    description: '夕焼けの海の表面を滑るように移動',
    category: 'follow',
    promptText: 'glide over the surface of an ocean at sunset',
    iconSymbol: '🌅→',
  },
  {
    id: 94,
    name: 'follow_eye_level',
    label: '目線の高さで追従',
    description: '被写体の目線の高さでカメラが追従',
    category: 'follow',
    promptText: 'follow subject at eye level',
    iconSymbol: '👁️↔📷',
  },
  {
    id: 118,
    name: 'follow_ball',
    label: 'ボールを追う',
    description: '地面を跳ねるボールを追跡',
    category: 'follow',
    promptText: 'follow a ball as it bounces across the ground',
    iconSymbol: '⚽→',
  },
  {
    id: 120,
    name: 'dolly_up_climbing',
    label: '登る人と一緒に上昇',
    description: '登っているキャラと一緒に上昇',
    category: 'follow',
    promptText: 'dolly upward alongside a climbing character',
    iconSymbol: '🧗↑📷',
  },
  {
    id: 122,
    name: 'diagonal_through_crowd',
    label: '群衆を斜めに抜ける',
    description: '混雑した通りを斜めに移動',
    category: 'follow',
    promptText: 'move diagonally across a crowded street',
    iconSymbol: '👥↗',
  },

  // ==========================================
  // 🎬 ドラマ演出 (dramatic) - 21種
  // ==========================================
  {
    id: 102,
    name: 'top_shot',
    label: '真上から見下ろす',
    description: '真上から俯瞰する',
    category: 'dramatic',
    promptText: 'top shot overhead of the classroom to show all students',
    iconSymbol: '⬇👁️',
  },
  {
    id: 103,
    name: 'hero_shot',
    label: 'ヒーローショット',
    description: '主役をカッコよく見せる（下から見上げる）',
    category: 'dramatic',
    promptText: 'hero shot low angle up on the protagonist to emphasize presence',
    iconSymbol: '🦸',
  },
  {
    id: 104,
    name: 'dutch_angle',
    label: '傾いたカメラ',
    description: 'カメラを傾けて撮影（不安感・緊張感）',
    category: 'dramatic',
    promptText: 'dutch angle shot in the hallway confrontation to create unease',
    iconSymbol: '📐',
  },
  {
    id: 105,
    name: 'reveal_shot',
    label: '登場を見せる',
    description: '隠れていた対象を少しずつ見せる',
    category: 'dramatic',
    promptText: 'reveal shot showing the hidden character',
    iconSymbol: '🎭',
  },
  {
    id: 106,
    name: 'slow_motion',
    label: 'スローモーション',
    description: '動作を遅くして強調',
    category: 'dramatic',
    promptText: 'slow motion on the heroine turning around to make the moment striking',
    iconSymbol: '🐢',
  },
  {
    id: 107,
    name: 'zoom_object',
    label: '注目物にズーム',
    description: '注目するオブジェクトにズームイン',
    category: 'dramatic',
    promptText: 'zoom in on an object of interest',
    iconSymbol: '🔍📦',
  },
  {
    id: 108,
    name: 'dramatic_zoom',
    label: '劇的ズームイン',
    description: '劇的な効果を狙って素早くズームイン',
    category: 'dramatic',
    promptText: 'zoom in quickly for a dramatic effect',
    iconSymbol: '⚡🔍',
  },
  {
    id: 109,
    name: 'zoom_out_eye_scene',
    label: '目からシーン全体へ',
    description: 'キャラの目からシーン全体にズームアウト',
    category: 'dramatic',
    promptText: 'zoom out from a character\'s eye to the whole scene',
    iconSymbol: '👁️→🌄',
  },
  {
    id: 110,
    name: 'zoom_out_to_crowd',
    label: 'キャラから群衆へ',
    description: 'キャラから急速にズームアウトして群衆を見せる',
    category: 'dramatic',
    promptText: 'zoom out rapidly from a character to show a crowd',
    iconSymbol: '👤→👥',
  },
  {
    id: 111,
    name: 'pan_face_surrounding',
    label: '顔から周囲へ',
    description: 'キャラの顔から周囲のエリアにパン',
    category: 'dramatic',
    promptText: 'pan from character\'s face to the surrounding area',
    iconSymbol: '😊→🌳',
  },
  {
    id: 113,
    name: 'tilt_up_fireworks',
    label: '花火を見上げる',
    description: '花火が空で爆発する際に上向きに傾ける',
    category: 'dramatic',
    promptText: 'tilt up as fireworks explode in the sky',
    iconSymbol: '🎆↑',
  },
  {
    id: 117,
    name: 'rotational_shot',
    label: 'カメラ自体が回転',
    description: 'カメラ自体が回転して視界を回す（混乱・高揚）',
    category: 'dramatic',
    promptText: 'rotational shot on the rooftop spinning to express emotional chaos',
    iconSymbol: '🌀',
  },
  {
    id: 119,
    name: 'zoom_news_headline',
    label: 'ニュース見出しにズーム',
    description: 'ニュースの見出しに素早くズームイン',
    category: 'dramatic',
    promptText: 'zoom in quickly on a breaking news headline',
    iconSymbol: '📰🔍',
  },
  {
    id: 121,
    name: 'slow_motion_leaves',
    label: '落葉スローモーション',
    description: 'ゆっくりと落ちる葉にフォーカス',
    category: 'dramatic',
    promptText: 'focus on falling leaves in slow motion',
    iconSymbol: '🍂🐢',
  },
  {
    id: 87,
    name: 'pan_battlefield',
    label: '戦場をパン',
    description: '戦場全体をパンして映し出す',
    category: 'dramatic',
    promptText: 'pan across a battlefield',
    iconSymbol: '⚔️↔',
  },
  {
    id: 88,
    name: 'pan_sunset_skyline',
    label: '夕焼けスカイラインをパン',
    description: '夕暮れの都市のスカイラインを左にパン',
    category: 'dramatic',
    promptText: 'pan left across a city skyline at sunset',
    iconSymbol: '🌇↔',
  },
  {
    id: 89,
    name: 'pan_painting',
    label: '絵画をパン',
    description: '歴史的な絵画をゆっくりとパン',
    category: 'dramatic',
    promptText: 'pan slowly across a historical painting',
    iconSymbol: '🖼️↔',
  },
  {
    id: 97,
    name: 'pull_back_wide_to_medium',
    label: 'ワイドからミディアムへ',
    description: 'ワイドショットからミディアムショットに引く',
    category: 'dramatic',
    promptText: 'pull back from wide shot to medium shot',
    iconSymbol: '🖼️→📷',
  },
  {
    id: 98,
    name: 'pull_focus_distant',
    label: '遠い人物にフォーカス',
    description: '遠くの人物にフォーカスを合わせる',
    category: 'dramatic',
    promptText: 'pull focus to distant figure',
    iconSymbol: '👤...🔍',
  },
  {
    id: 99,
    name: 'rack_focus_fg_bg',
    label: '前景から背景へフォーカス',
    description: '前景から背景にフォーカスを移動',
    category: 'dramatic',
    promptText: 'rack focus from foreground to background',
    iconSymbol: '🔍→',
  },
  {
    id: 100,
    name: 'rack_focus_bg_fg',
    label: '背景から前景へフォーカス',
    description: '背景から前景にフォーカスを移動',
    category: 'dramatic',
    promptText: 'rack focus from background to foreground',
    iconSymbol: '←🔍',
  },
  {
    id: 101,
    name: 'rack_focus_characters',
    label: 'キャラ間でフォーカス移動',
    description: '別のキャラにフォーカスを切り替える',
    category: 'dramatic',
    promptText: 'rack focus from one character to another',
    iconSymbol: '👤🔍👤',
  },

  // ==========================================
  // ⏱️ 時間表現 (timelapse) - 3種
  // ==========================================
  {
    id: 114,
    name: 'timelapse',
    label: 'タイムラプス',
    description: '長時間の変化を短縮（時間経過）',
    category: 'timelapse',
    promptText: 'time-lapse from the mountain peak showing clouds moving and day turning into night',
    iconSymbol: '⏱️',
  },
  {
    id: 115,
    name: 'motion_timelapse',
    label: 'モーションタイムラプス',
    description: 'タイムラプス中にカメラを動かす',
    category: 'timelapse',
    promptText: 'motion time-lapse with a slow pan along the coastline',
    iconSymbol: '⏱️→',
  },
  {
    id: 116,
    name: 'hyperlapse',
    label: 'ハイパーラプス',
    description: 'タイムラプス＋自由に移動',
    category: 'timelapse',
    promptText: 'hyperlapse walking down the main street with the tower anchored at the center',
    iconSymbol: '⏱️🏃',
  },
];
```

---

## コンポーネント設計

### ファイル構成

```
movie-maker/
├── components/
│   └── camera/
│       ├── CameraWorkSelector.tsx      # メインコンポーネント
│       ├── CameraPresetCard.tsx        # プリセットカード
│       ├── CameraWorkCard.tsx          # カスタム用GIFカード
│       ├── CameraWorkGrid.tsx          # カスタム用グリッド
│       └── index.ts                    # エクスポート
├── lib/
│   └── camera/
│       ├── types.ts                    # 型定義
│       ├── presets.ts                  # プリセット定義
│       └── camera-works.ts             # カメラワーク定義
└── public/
    └── assets/
        └── camera/                     # GIFファイル格納
            ├── dolly-in.gif
            ├── dolly-out.gif
            ├── orbit.gif
            └── ...
```

### CameraWorkSelector.tsx

```tsx
'use client';

import { useState } from 'react';
import { CameraPreset, CameraWork } from '@/lib/camera/types';
import { CAMERA_PRESETS } from '@/lib/camera/presets';
import { CameraPresetCard } from './CameraPresetCard';
import { CameraWorkGrid } from './CameraWorkGrid';

interface CameraWorkSelectorProps {
  value: {
    preset: CameraPreset;
    customCameraWork?: CameraWork;
  };
  onChange: (value: {
    preset: CameraPreset;
    customCameraWork?: CameraWork;
    promptText: string;
  }) => void;
}

export function CameraWorkSelector({ value, onChange }: CameraWorkSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);

  const handlePresetSelect = (preset: CameraPreset) => {
    if (preset === 'custom') {
      setShowCustom(true);
      return;
    }

    const config = CAMERA_PRESETS.find(p => p.id === preset);
    onChange({
      preset,
      promptText: config?.promptText || '',
    });
    setShowCustom(false);
  };

  const handleCustomSelect = (cameraWork: CameraWork) => {
    onChange({
      preset: 'custom',
      customCameraWork: cameraWork,
      promptText: cameraWork.promptText,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">🎬 カメラの動き</h3>

      {!showCustom ? (
        <div className="space-y-2">
          {CAMERA_PRESETS.map((preset) => (
            <CameraPresetCard
              key={preset.id}
              preset={preset}
              selected={value.preset === preset.id}
              onSelect={() => handlePresetSelect(preset.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => setShowCustom(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← プリセットに戻る
          </button>

          <CameraWorkGrid
            selected={value.customCameraWork}
            onSelect={handleCustomSelect}
          />
        </div>
      )}
    </div>
  );
}
```

### CameraPresetCard.tsx

```tsx
import { CameraPresetConfig } from '@/lib/camera/types';
import { cn } from '@/lib/utils';

interface CameraPresetCardProps {
  preset: CameraPresetConfig;
  selected: boolean;
  onSelect: () => void;
}

export function CameraPresetCard({ preset, selected, onSelect }: CameraPresetCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-all',
        'hover:border-blue-300 hover:bg-blue-50',
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white'
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{preset.icon}</span>
        <div className="flex-1">
          <div className="font-medium">{preset.label}</div>
          <div className="text-sm text-gray-500">{preset.description}</div>
        </div>
        {selected && (
          <span className="text-blue-500">✓</span>
        )}
        {preset.id === 'custom' && (
          <span className="text-gray-400">▶</span>
        )}
      </div>
    </button>
  );
}
```

### CameraWorkCard.tsx

```tsx
import Image from 'next/image';
import { CameraWork } from '@/lib/camera/types';
import { cn } from '@/lib/utils';

interface CameraWorkCardProps {
  cameraWork: CameraWork;
  selected: boolean;
  onSelect: () => void;
}

export function CameraWorkCard({ cameraWork, selected, onSelect }: CameraWorkCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'rounded-lg border-2 overflow-hidden transition-all',
        'hover:border-blue-300 hover:shadow-md',
        selected
          ? 'border-blue-500 ring-2 ring-blue-200'
          : 'border-gray-200'
      )}
    >
      {/* GIFプレビュー */}
      <div className="aspect-video bg-gray-100 relative">
        <Image
          src={cameraWork.gifUrl}
          alt={cameraWork.label}
          fill
          className="object-cover"
          unoptimized // GIF対応
        />
        {/* フォールバック: アイコン表示 */}
        <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-50">
          {cameraWork.iconSymbol}
        </div>
      </div>

      {/* ラベル */}
      <div className="p-3 text-center">
        <div className="font-medium">{cameraWork.label}</div>
        <div className="text-xs text-gray-500 mt-1">
          {cameraWork.description}
        </div>
        {selected && (
          <div className="text-blue-500 text-sm mt-2">● 選択中</div>
        )}
      </div>
    </button>
  );
}
```

### CameraWorkGrid.tsx

```tsx
import { useState } from 'react';
import { CameraWork, CameraCategory, CAMERA_CATEGORIES } from '@/lib/camera/types';
import { CAMERA_WORKS } from '@/lib/camera/camera-works';
import { CameraWorkCard } from './CameraWorkCard';

interface CameraWorkGridProps {
  selected?: CameraWork;
  onSelect: (cameraWork: CameraWork) => void;
}

export function CameraWorkGrid({ selected, onSelect }: CameraWorkGridProps) {
  const [category, setCategory] = useState<CameraCategory | 'all'>('all');

  const filteredWorks = category === 'all'
    ? CAMERA_WORKS
    : CAMERA_WORKS.filter(w => w.category === category);

  return (
    <div className="space-y-4">
      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('all')}
          className={cn(
            'px-3 py-1 rounded-full text-sm',
            category === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          すべて
        </button>
        {CAMERA_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              'px-3 py-1 rounded-full text-sm',
              category === cat.id
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {filteredWorks.map((work) => (
          <CameraWorkCard
            key={work.id}
            cameraWork={work}
            selected={selected?.id === work.id}
            onSelect={() => onSelect(work)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## バックエンド変更

### スキーマ追加

```python
# app/videos/schemas.py

class CameraWorkSetting(BaseModel):
    """カメラワーク設定"""
    preset: str = Field("simple", description="プリセット: simple, cinematic, dynamic, custom")
    custom_camera_work_id: int | None = Field(None, description="カスタム選択時のカメラワークID")
    prompt_text: str = Field("", description="プロンプトに追加するカメラワーク文字列")


class StoryConfirmRequest(BaseModel):
    preview_id: str
    bgm_track_id: str | None = None
    overlay: OverlaySettings | None = None
    film_grain: FilmGrainPreset = FilmGrainPreset.MEDIUM
    use_lut: bool = True
    camera_work: CameraWorkSetting | None = None  # 追加
```

### ルーター修正

```python
# app/videos/router.py

@router.post("/story/confirm")
async def confirm_story_video(...):
    # ...

    # カメラワークプロンプトを追加
    camera_prompt = ""
    if request.camera_work:
        camera_prompt = request.camera_work.prompt_text

    # プロンプトにカメラワークを追加してDBに保存
    update_data = {
        "status": "pending",
        "film_grain": request.film_grain.value,
        "use_lut": request.use_lut,
        "camera_work_preset": request.camera_work.preset if request.camera_work else "simple",
        "camera_work_prompt": camera_prompt,
    }
```

### マイグレーション

```sql
-- Supabase Migration: add_camera_work_columns

ALTER TABLE video_generations
ADD COLUMN camera_work_preset TEXT DEFAULT 'simple',
ADD COLUMN camera_work_prompt TEXT DEFAULT '';
```

### プロンプト生成時の適用

```python
# app/tasks/story_processor.py

async def process_story_video(video_id: str) -> None:
    # ...

    # カメラワークをプロンプトに追加
    camera_prompt = video_data.get("camera_work_prompt", "")

    for i, frame_prompt in enumerate(frame_prompts):
        full_prompt = frame_prompt["full_prompt"]
        if camera_prompt:
            full_prompt = f"{full_prompt}, {camera_prompt}"

        # KlingAIに送信
        # ...
```

---

## GIFアセット

### GIF管理方針

122種すべてにGIFを用意するのは現実的ではないため、以下の段階的アプローチを採用:

#### Phase 1: アイコン表示（初期実装）
- GIFなしで `iconSymbol` を大きく表示
- CSS アニメーションで動きを表現（矢印のパルスなど）

#### Phase 2: 代表GIF（8個）
各カテゴリに1つずつ代表GIFを用意:

```
public/assets/camera/
├── static.gif         # 📍 動かさない
├── approach.gif       # ↔️ 近づく・離れる（Dolly In）
├── horizontal.gif     # ↔ 左右に動く（Pan）
├── vertical.gif       # ↕ 上下に動く（Tilt Up）
├── orbit.gif          # 🔄 回り込む
├── follow.gif         # 🏃 追いかける（Tracking）
├── dramatic.gif       # 🎬 ドラマ演出（Slow Motion）
└── timelapse.gif      # ⏱️ 時間表現
```

#### Phase 3: 人気カメラワークGIF（追加20個程度）
使用頻度の高いものから順次追加:
- dolly-in.gif, dolly-out.gif
- zoom-in.gif, zoom-out.gif
- pan-left.gif, pan-right.gif
- orbit-360.gif, arc-shot.gif
- drone.gif, pov.gif
- slow-motion.gif, dutch-angle.gif
- など

### GIF仕様

- サイズ: 320x180px（16:9）
- 長さ: 2秒ループ
- フレームレート: 15fps
- ファイルサイズ: 500KB以下推奨
- 内容: シンプルな図形やアイコンでカメラの動きを表現

### GIF作成オプション

1. **手動作成**: After Effects / Lottie でアニメーション作成
2. **AI生成**: 実際の動画から切り出し
3. **アイコンアニメーション**: CSS/SVGアニメーションで代用（初期実装用）
4. **外部素材**: フリー素材サイトからカメラワーク解説動画を取得

---

## 実装フェーズ

### Phase 1: 基本実装（プリセットのみ）

1. 型定義・プリセット定義ファイル作成
2. CameraWorkSelector コンポーネント（プリセット選択のみ）
3. story/page.tsx への統合
4. バックエンド: スキーマ・マイグレーション追加
5. プロンプト生成時の適用

**成果物**: プリセット3択（シンプル/シネマティック/ダイナミック）で動画生成可能

### Phase 2: カスタム選択（全122種）

1. カメラワーク定義ファイル作成（camera_prompts.yaml から変換）
2. CameraWorkCard, CameraWorkGrid コンポーネント
3. カテゴリタブ/フィルター機能（8カテゴリ）
4. アイコン表示（iconSymbol を使用）
5. 検索機能（オプション）

**成果物**: 全122種のカメラワークから選択可能

### Phase 3: ビジュアル強化

1. カテゴリ代表GIF（8個）作成・配置
2. 人気カメラワークGIF（20個程度）追加
3. 画像最適化（next/image対応）
4. ホバー時のアニメーション強化
5. モバイル対応の最適化

---

## API変更まとめ

### フロントエンド → バックエンド

```typescript
// POST /api/v1/videos/story/confirm
{
  preview_id: string;
  bgm_track_id?: string;
  overlay?: {...};
  film_grain?: 'none' | 'light' | 'medium' | 'heavy';
  use_lut?: boolean;
  camera_work?: {                    // 新規追加
    preset: 'simple' | 'cinematic' | 'dynamic' | 'custom';
    custom_camera_work_id?: number;
    prompt_text: string;
  };
}
```

### lib/api/client.ts 更新

```typescript
export const videosApi = {
  confirmStoryVideo: (data: {
    preview_id: string;
    bgm_track_id?: string;
    overlay?: {...};
    film_grain?: 'none' | 'light' | 'medium' | 'heavy';
    use_lut?: boolean;
    camera_work?: {
      preset: string;
      custom_camera_work_id?: number;
      prompt_text: string;
    };
  }) => fetchWithAuth("/api/v1/videos/story/confirm", {
    method: "POST",
    body: JSON.stringify(data)
  }),
};
```
