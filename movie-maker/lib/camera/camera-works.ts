import { CameraWork, VideoProvider } from './types';

// camera_prompts.yaml から変換した全122種のカメラワーク
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
    promptText: "over the shoulder shot capturing the other character's expression",
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
    promptText: "zoom in on the character's face to emphasize tension",
    iconSymbol: '🔍',
    guaranteed: true,
  },
  {
    id: 17,
    name: 'zoom_out',
    label: 'ズームアウト',
    description: 'カメラ位置固定で視野を広げる',
    category: 'approach',
    promptText: 'zoom out to reveal the entire scene',
    iconSymbol: '🔎',
    guaranteed: true,
  },
  {
    id: 18,
    name: 'quick_zoom_in',
    label: '素早くズームイン',
    description: '急速にズームして驚きを表現',
    category: 'approach',
    promptText: 'quick zoom in for dramatic effect',
    iconSymbol: '⚡🔍',
    guaranteed: true,
  },
  {
    id: 19,
    name: 'quick_zoom_out',
    label: '素早くズームアウト',
    description: '急速にズームアウトして全体を見せる',
    category: 'approach',
    promptText: 'quick zoom out to show the full scene',
    iconSymbol: '⚡🔎',
    guaranteed: true,
  },
  {
    id: 20,
    name: 'dolly_in',
    label: '近づく',
    description: 'カメラごと被写体に近づく（迫力・没入感）',
    category: 'approach',
    promptText: 'dolly in on the protagonist during the confession scene',
    iconSymbol: '→●',
    guaranteed: true,
  },
  {
    id: 21,
    name: 'dolly_out',
    label: '離れる',
    description: 'カメラごと被写体から離れる（空間の広がり）',
    category: 'approach',
    promptText: 'dolly out from the character to show the vast cityscape',
    iconSymbol: '●→',
    guaranteed: true,
  },
  {
    id: 22,
    name: 'push_in',
    label: 'プッシュイン',
    description: '被写体に向かって押し込むように近づく',
    category: 'approach',
    promptText: "push in for close-up on the character's expression",
    iconSymbol: '⇒●',
    guaranteed: true,
  },
  {
    id: 23,
    name: 'pull_out',
    label: 'プルアウト',
    description: 'クローズアップから引いて全体を見せる',
    category: 'approach',
    promptText: 'pull out to wide shot to show the entire scene',
    iconSymbol: '●⇒',
    guaranteed: true,
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
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 27,
    name: 'dolly_zoom_in',
    label: 'めまい効果（近づく）',
    description: '近づきながらズームアウト（背景が歪む不思議な効果）',
    category: 'approach',
    promptText: 'dolly zoom in creating a disorienting effect',
    iconSymbol: '🌀→',
    providers: ['runway'],  // VEO非対応: めまい効果
  },
  {
    id: 28,
    name: 'dolly_zoom_out',
    label: 'めまい効果（離れる）',
    description: '離れながらズームイン（背景が急変する効果）',
    category: 'approach',
    promptText: 'reverse dolly zoom out',
    iconSymbol: '←🌀',
    providers: ['runway'],  // VEO非対応: めまい効果
  },
  // ※ vertigo_in, vertigo_out はRunway Gen-4で効果がないため削除
  {
    id: 31,
    name: 'rapid_face_approach',
    label: '顔に急接近',
    description: 'キャラの顔に向かって急速に近づく',
    category: 'approach',
    promptText: "move rapidly toward a character's face",
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
    promptText: "zoom in gradually on a character's eyes",
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
    guaranteed: true,
  },
  {
    id: 2,
    name: 'pan_right',
    label: '右に振る',
    description: 'カメラを固定したまま右に振る',
    category: 'horizontal',
    promptText: 'pan right slowly to reveal the school building',
    iconSymbol: '→',
    guaranteed: true,
  },
  {
    id: 7,
    name: 'truck_left',
    label: '左に横移動',
    description: 'カメラを横に左へ移動',
    category: 'horizontal',
    promptText: 'truck left to show the neighbor',
    iconSymbol: '⇐',
    guaranteed: true,
  },
  {
    id: 8,
    name: 'truck_right',
    label: '右に横移動',
    description: 'カメラを横に右へ移動',
    category: 'horizontal',
    promptText: 'truck right following the character',
    iconSymbol: '⇒',
    guaranteed: true,
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
    guaranteed: true,
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
    promptText: "pan from character's face to the surrounding area",
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
    guaranteed: true,
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
    guaranteed: true,
  },
  {
    id: 4,
    name: 'tilt_down',
    label: '見下ろす',
    description: 'カメラを固定したまま下に振る',
    category: 'vertical',
    promptText: 'tilt down from rooftop to ground',
    iconSymbol: '↓',
    guaranteed: true,
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
    guaranteed: true,
  },
  {
    id: 10,
    name: 'crane_down',
    label: 'クレーンで下降',
    description: 'クレーンでカメラを下へ移動',
    category: 'vertical',
    promptText: 'crane down from rooftop to ground',
    iconSymbol: '🏗️↓',
    guaranteed: true,
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
    promptText: "tilt up from character's feet to their head",
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
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 95,
    name: 'jib_up_tilt_down',
    label: '上昇しながら見下ろす',
    description: 'カメラを上昇させながら下に傾ける',
    category: 'vertical',
    promptText: 'jib up and tilt down',
    iconSymbol: '⬆↓',
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 96,
    name: 'jib_down_tilt_up',
    label: '下降しながら見上げる',
    description: 'カメラを下降させながら上に傾ける',
    category: 'vertical',
    promptText: 'jib down and tilt up',
    iconSymbol: '⬇↑',
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 112,
    name: 'tilt_head_to_object',
    label: '頭から手持ち物へ',
    description: 'キャラの頭から手に持っている物に向かって下に傾ける',
    category: 'vertical',
    promptText: "tilt from character's head to an object in their hand",
    iconSymbol: '👤→✋',
  },

  // ==========================================
  // 🔄 回り込む (orbit) - 17種
  // ※ VEOは360°回転が不安定なため、arc_shot以外はRunway専用
  // ==========================================
  {
    id: 37,
    name: 'orbit_clockwise',
    label: '時計回りに回る',
    description: '被写体を中心に時計回りにカメラを回転',
    category: 'orbit',
    promptText: 'orbit shot around the heroine to show her classmates',
    iconSymbol: '↻',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 38,
    name: 'orbit_counterclockwise',
    label: '反時計回りに回る',
    description: '被写体を中心に反時計回りにカメラを回転',
    category: 'orbit',
    promptText: 'orbit counterclockwise around the subject',
    iconSymbol: '↺',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 39,
    name: 'circle_slow',
    label: 'ゆっくり周回',
    description: '被写体の周囲をゆっくり回る',
    category: 'orbit',
    promptText: 'circle around the subject slowly',
    iconSymbol: '🐢🔄',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 40,
    name: 'orbit_shot',
    label: '回り込む',
    description: '被写体を中心に円を描くように回る',
    category: 'orbit',
    promptText: 'orbit shot around the heroine',
    iconSymbol: '⟳',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 41,
    name: '360_shot',
    label: 'ぐるっと一周',
    description: '被写体を一周回り込む',
    category: 'orbit',
    promptText: '360-degree shot circling the protagonist during the transformation',
    iconSymbol: '🔄',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 42,
    name: 'arc_shot',
    label: '半周する',
    description: '半円や部分的に回り込む',
    category: 'orbit',
    promptText: 'arc shot half-circle around two characters talking',
    iconSymbol: '↷',
    // VEO対応: 部分的なアーク動作
  },
  {
    id: 43,
    name: 'arc_left_tilt_up',
    label: '左アーク＋見上げる',
    description: '左に弧を描きながら上に傾ける',
    category: 'orbit',
    promptText: 'arc left while tilting up',
    iconSymbol: '↶↑',
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 44,
    name: 'arc_right_tilt_down',
    label: '右アーク＋見下ろす',
    description: '右に弧を描きながら下に傾ける',
    category: 'orbit',
    promptText: 'arc right while tilting down',
    iconSymbol: '↷↓',
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 45,
    name: 'rotate_vertical',
    label: '垂直に回転',
    description: '垂直方向に被写体を中心にカメラを回転',
    category: 'orbit',
    promptText: 'rotate around subject vertically',
    iconSymbol: '🔃',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 46,
    name: 'rotate_left_45',
    label: '左45度回転',
    description: '左に45度回転する',
    category: 'orbit',
    promptText: 'rotate left 45 degrees',
    iconSymbol: '↰45°',
    providers: ['runway'],  // VEO非対応: 回転動作
  },
  {
    id: 47,
    name: 'rotate_right_45',
    label: '右45度回転',
    description: '右に45度回転する',
    category: 'orbit',
    promptText: 'rotate right 45 degrees',
    iconSymbol: '↱45°',
    providers: ['runway'],  // VEO非対応: 回転動作
  },
  {
    id: 48,
    name: 'rotate_360',
    label: '360度回転',
    description: '被写体を中心に360度回転',
    category: 'orbit',
    promptText: 'rotate 360 degrees around subject',
    iconSymbol: '🔄360°',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 49,
    name: 'rotate_looking_up',
    label: 'その場で回転＋見上げる',
    description: 'その場で回転しながら上を見上げる',
    category: 'orbit',
    promptText: 'rotate in place while looking upward',
    iconSymbol: '🔄↑',
    providers: ['runway'],  // VEO非対応: 複合動作
  },
  {
    id: 50,
    name: 'orbit_group',
    label: 'グループを周回',
    description: '複数の人々を中心にカメラが周回',
    category: 'orbit',
    promptText: 'orbit around group of people',
    iconSymbol: '👥🔄',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 51,
    name: 'circle_statue',
    label: '彫像を周回',
    description: '彫像を中心にゆっくりとカメラを回転',
    category: 'orbit',
    promptText: 'circle around a statue',
    iconSymbol: '🗿🔄',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 52,
    name: 'rotate_table_conversation',
    label: 'テーブル周回',
    description: '会話中のテーブルを中心にカメラが回転',
    category: 'orbit',
    promptText: 'rotate around a table during a conversation',
    iconSymbol: '🍽️🔄',
    providers: ['runway'],  // VEO非対応: 360°回転
  },
  {
    id: 53,
    name: 'circle_duel',
    label: '決闘シーン周回',
    description: '決闘している二人の周りをカメラが回転',
    category: 'orbit',
    promptText: 'circle around two characters having a duel',
    iconSymbol: '⚔️🔄',
    providers: ['runway'],  // VEO非対応: 360°回転
  },

  // ==========================================
  // 🏃 追いかける (follow) - 22種
  // ※ 揺れ系（handheld, shake等）はRunway Gen-4で効果がないため削除
  // ==========================================
  {
    id: 58,
    name: 'steadicam',
    label: 'ステディカム',
    description: '滑らかに移動（ワンカット向き）',
    category: 'follow',
    promptText: 'steadicam shot smoothly following the character running down the hallway',
    iconSymbol: '🎥',
    providers: ['runway'],  // VEO非対応: 複雑な追従
  },
  {
    id: 59,
    name: 'drone',
    label: 'ドローン撮影',
    description: '上空から広い範囲を撮影',
    category: 'follow',
    promptText: 'drone shot rising from the rooftop to reveal the entire school grounds',
    iconSymbol: '🚁',
    guaranteed: true,
  },
  {
    id: 60,
    name: 'pov',
    label: '一人称視点',
    description: 'キャラの視点そのまま（没入感）',
    category: 'follow',
    promptText: "POV shot walking through the hallway from the protagonist's perspective",
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
    promptText: "track character's hand movements",
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
    guaranteed: true,
    providers: ['runway'],  // VEO非対応: 特殊アングル
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
  // ※ slow_motion はRunway Gen-4で効果がないため削除
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
    promptText: "zoom out from a character's eye to the whole scene",
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
    promptText: "pan from character's face to the surrounding area",
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
    providers: ['runway'],  // VEO非対応: 回転効果
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
  // ※ pull_focus_distant, rack_focus_fg_bg, rack_focus_bg_fg, rack_focus_characters
  // はRunway Gen-4で効果がないため削除（AIはピント制御不可）

  // ==========================================
  // ⏱️ 時間表現 (timelapse) - 削除済み
  // ※ timelapse, motion_timelapse, hyperlapse はRunway Gen-4で効果がないため削除
  // ==========================================
];

// カテゴリでフィルタリングするヘルパー関数
export function getCameraWorksByCategory(category: string): CameraWork[] {
  if (category === 'all') {
    return CAMERA_WORKS;
  }
  if (category === 'guaranteed') {
    return CAMERA_WORKS.filter((work) => work.guaranteed === true);
  }
  return CAMERA_WORKS.filter((work) => work.category === category);
}

// 確実制御カメラワークのみ取得
export function getGuaranteedCameraWorks(): CameraWork[] {
  return CAMERA_WORKS.filter((work) => work.guaranteed === true);
}

// IDでカメラワークを取得するヘルパー関数
export function getCameraWorkById(id: number): CameraWork | undefined {
  return CAMERA_WORKS.find((work) => work.id === id);
}

// プロバイダー対応カメラワークを取得

/**
 * 指定プロバイダーに対応したカメラワークかどうかをチェック
 * providers未定義の場合は両方対応とみなす
 */
export function isCameraWorkSupported(
  work: CameraWork,
  provider: VideoProvider
): boolean {
  // providersが未定義なら両方対応
  if (!work.providers) return true;
  return work.providers.includes(provider);
}

/**
 * プロバイダーとカテゴリでフィルタリングしたカメラワーク一覧を取得
 */
export function getCameraWorksByProvider(
  provider: VideoProvider,
  category?: string
): CameraWork[] {
  let works = CAMERA_WORKS.filter((work) => isCameraWorkSupported(work, provider));

  if (category && category !== 'all') {
    if (category === 'guaranteed') {
      works = works.filter((work) => work.guaranteed === true);
    } else {
      works = works.filter((work) => work.category === category);
    }
  }

  return works;
}

/**
 * VEO非対応カメラワークの一覧を取得
 */
export function getRunwayOnlyCameraWorks(): CameraWork[] {
  return CAMERA_WORKS.filter(
    (work) => work.providers && work.providers.length === 1 && work.providers[0] === 'runway'
  );
}
