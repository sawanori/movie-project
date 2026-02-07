import httpx
import jwt
import time
import logging
import aiofiles
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


# カメラワーク名からKlingAI camera_control形式へのマッピング
# KlingAI camera_control: horizontal, vertical, pan, tilt, roll, zoom (-10 to 10)
CAMERA_CONTROL_MAPPING: dict[str, dict] = {
    # ==========================================
    # 静止 (static) - カメラを動かさない
    # ==========================================
    "static_shot": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "over_the_shoulder": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},

    # ==========================================
    # 近づく・離れる (approach) - zoom, vertical を使用
    # ==========================================
    "zoom_in": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 5},
    "zoom_out": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": -5},
    "quick_zoom_in": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 10},
    "quick_zoom_out": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": -10},
    "dolly_in": {"horizontal": 0, "vertical": 5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "dolly_out": {"horizontal": 0, "vertical": -5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "push_in": {"horizontal": 0, "vertical": 7, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "pull_out": {"horizontal": 0, "vertical": -7, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "zoom_in_background": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 6},
    "zoom_out_landscape": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": -6},
    "dolly_in_tilt_up": {"horizontal": 0, "vertical": 5, "pan": 0, "tilt": 4, "roll": 0, "zoom": 0},
    "dolly_zoom_in": {"horizontal": 0, "vertical": 5, "pan": 0, "tilt": 0, "roll": 0, "zoom": -3},
    "dolly_zoom_out": {"horizontal": 0, "vertical": -5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 3},
    "vertigo_in": {"horizontal": 0, "vertical": 6, "pan": 0, "tilt": 0, "roll": 0, "zoom": -4},
    "vertigo_out": {"horizontal": 0, "vertical": -6, "pan": 0, "tilt": 0, "roll": 0, "zoom": 4},
    "rapid_face_approach": {"horizontal": 0, "vertical": 10, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "dolly_diagonal": {"horizontal": 4, "vertical": 4, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "slow_approach_building": {"horizontal": 0, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "backward_from_character": {"horizontal": 0, "vertical": -5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "dolly_out_doorway": {"horizontal": 0, "vertical": -6, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "zoom_eyes": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 8},

    # ==========================================
    # 左右に動く (horizontal) - horizontal, pan を使用
    # ==========================================
    "pan_left": {"horizontal": 0, "vertical": 0, "pan": -5, "tilt": 0, "roll": 0, "zoom": 0},
    "pan_right": {"horizontal": 0, "vertical": 0, "pan": 5, "tilt": 0, "roll": 0, "zoom": 0},
    "truck_left": {"horizontal": -5, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "truck_right": {"horizontal": 5, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "track_left": {"horizontal": -6, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "track_right": {"horizontal": 6, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "diagonal_up_right": {"horizontal": 4, "vertical": 0, "pan": 0, "tilt": 4, "roll": 0, "zoom": 0},
    "diagonal_down_left": {"horizontal": -4, "vertical": 0, "pan": 0, "tilt": -4, "roll": 0, "zoom": 0},
    "pan_quick_left": {"horizontal": 0, "vertical": 0, "pan": -10, "tilt": 0, "roll": 0, "zoom": 0},
    "move_through_crowd": {"horizontal": 5, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "curved_path_right": {"horizontal": 5, "vertical": 2, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},
    "curved_path_left": {"horizontal": -5, "vertical": 2, "pan": -3, "tilt": 0, "roll": 0, "zoom": 0},
    "pan_face_to_surrounding": {"horizontal": 0, "vertical": 0, "pan": 6, "tilt": 0, "roll": 0, "zoom": -2},
    "slow_pan_horizon": {"horizontal": 0, "vertical": 0, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},

    # ==========================================
    # 上下に動く (vertical) - vertical, tilt を使用
    # ==========================================
    "tilt_up": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 5, "roll": 0, "zoom": 0},
    "tilt_down": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -5, "roll": 0, "zoom": 0},
    "pedestal_up": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 6, "roll": 0, "zoom": 0},
    "pedestal_down": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -6, "roll": 0, "zoom": 0},
    "crane_up": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 7, "roll": 0, "zoom": 0},
    "crane_down": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -7, "roll": 0, "zoom": 0},
    "through_tree_canopy": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 5, "roll": 0, "zoom": 0},
    "through_branches": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 6, "roll": 0, "zoom": 0},
    "tilt_feet_to_head": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 6, "roll": 0, "zoom": 0},
    "tilt_reveal_hidden": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -5, "roll": 0, "zoom": 0},
    "tilt_reveal_path": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -6, "roll": 0, "zoom": 0},
    "tilt_over_cityscape": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -4, "roll": 0, "zoom": 0},
    "quick_tilt_up_sky": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 10, "roll": 0, "zoom": 0},
    "quick_tilt_down_ground": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -10, "roll": 0, "zoom": 0},
    "tilt_zoom_combo": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 5, "roll": 0, "zoom": 4},
    "jib_up_tilt_down": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 3, "roll": 0, "zoom": 0},
    "jib_down_tilt_up": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 5, "roll": 0, "zoom": 0},
    "tilt_head_to_object": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -6, "roll": 0, "zoom": 0},

    # ==========================================
    # 回り込む (orbit) - pan, horizontal, roll を組み合わせ
    # ==========================================
    "orbit_clockwise": {"horizontal": 5, "vertical": 0, "pan": 5, "tilt": 0, "roll": 0, "zoom": 0},
    "orbit_counterclockwise": {"horizontal": -5, "vertical": 0, "pan": -5, "tilt": 0, "roll": 0, "zoom": 0},
    "circle_slow": {"horizontal": 3, "vertical": 0, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},
    "orbit_shot": {"horizontal": 5, "vertical": 0, "pan": 5, "tilt": 0, "roll": 0, "zoom": 0},
    "360_shot": {"horizontal": 7, "vertical": 0, "pan": 7, "tilt": 0, "roll": 0, "zoom": 0},
    "arc_shot": {"horizontal": 4, "vertical": 0, "pan": 4, "tilt": 0, "roll": 0, "zoom": 0},
    "arc_left_tilt_up": {"horizontal": -5, "vertical": 0, "pan": -4, "tilt": 4, "roll": 0, "zoom": 0},
    "arc_right_tilt_down": {"horizontal": 5, "vertical": 0, "pan": 4, "tilt": -4, "roll": 0, "zoom": 0},
    "rotate_vertical": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 6, "roll": 3, "zoom": 0},
    "rotate_left_45": {"horizontal": -3, "vertical": 0, "pan": -3, "tilt": 0, "roll": 0, "zoom": 0},
    "rotate_right_45": {"horizontal": 3, "vertical": 0, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},
    "rotate_360": {"horizontal": 8, "vertical": 0, "pan": 8, "tilt": 0, "roll": 0, "zoom": 0},
    "rotate_looking_up": {"horizontal": 5, "vertical": 0, "pan": 5, "tilt": 4, "roll": 0, "zoom": 0},
    "orbit_group": {"horizontal": 5, "vertical": 0, "pan": 4, "tilt": 0, "roll": 0, "zoom": 0},
    "circle_statue": {"horizontal": 4, "vertical": 0, "pan": 4, "tilt": 0, "roll": 0, "zoom": 0},
    "rotate_table_conversation": {"horizontal": 4, "vertical": 0, "pan": 4, "tilt": 0, "roll": 0, "zoom": 0},
    "circle_duel": {"horizontal": 6, "vertical": 0, "pan": 6, "tilt": 0, "roll": 0, "zoom": 0},

    # ==========================================
    # 追いかける (follow) - 様々な組み合わせ
    # ==========================================
    "handheld": {"horizontal": 1, "vertical": 1, "pan": 1, "tilt": 1, "roll": 1, "zoom": 0},
    "shake": {"horizontal": 2, "vertical": 2, "pan": 0, "tilt": 0, "roll": 2, "zoom": 0},
    "shake_explosion": {"horizontal": 3, "vertical": 2, "pan": 0, "tilt": 0, "roll": 3, "zoom": 0},
    "shake_earthquake": {"horizontal": 5, "vertical": 3, "pan": 0, "tilt": 0, "roll": 4, "zoom": 0},
    "steadicam": {"horizontal": 3, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "drone": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 6, "roll": 0, "zoom": -3},
    "pov": {"horizontal": 2, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "tracking": {"horizontal": 5, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "follow_behind": {"horizontal": 0, "vertical": 4, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "follow_side": {"horizontal": 5, "vertical": 2, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "track_hand": {"horizontal": 2, "vertical": 0, "pan": 0, "tilt": -3, "roll": 0, "zoom": 3},
    "follow_bird": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 6, "roll": 0, "zoom": 0},
    "track_car": {"horizontal": 6, "vertical": 3, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},
    "follow_running": {"horizontal": 0, "vertical": 5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "push_narrow": {"horizontal": 0, "vertical": 5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "backward_hallway": {"horizontal": 0, "vertical": -5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "backward_forest": {"horizontal": 0, "vertical": -4, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "glide_lake": {"horizontal": 5, "vertical": 2, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "glide_river": {"horizontal": 4, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "glide_desert": {"horizontal": 5, "vertical": 2, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "glide_ocean_sunset": {"horizontal": 4, "vertical": 2, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "follow_eye_level": {"horizontal": 3, "vertical": 3, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "follow_ball": {"horizontal": 4, "vertical": 2, "pan": 3, "tilt": -2, "roll": 0, "zoom": 0},
    "dolly_up_climbing": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 5, "roll": 0, "zoom": 0},
    "diagonal_through_crowd": {"horizontal": 4, "vertical": 3, "pan": 2, "tilt": 0, "roll": 0, "zoom": 0},

    # ==========================================
    # ドラマ演出 (dramatic) - 様々な組み合わせ
    # ==========================================
    "top_shot": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -8, "roll": 0, "zoom": 0},
    "hero_shot": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 5, "roll": 0, "zoom": 0},
    "dutch_angle": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 5, "zoom": 0},
    "reveal_shot": {"horizontal": 4, "vertical": 0, "pan": 4, "tilt": 0, "roll": 0, "zoom": 0},
    "slow_motion": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 2},
    "zoom_object": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 6},
    "dramatic_zoom": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 10},
    "zoom_out_eye_scene": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": -7},
    "zoom_out_to_crowd": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": -8},
    "pan_face_surrounding": {"horizontal": 0, "vertical": 0, "pan": 6, "tilt": 0, "roll": 0, "zoom": -2},
    "tilt_up_fireworks": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 7, "roll": 0, "zoom": 0},
    "rotational_shot": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 7, "zoom": 0},
    "zoom_news_headline": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 8},
    "slow_motion_leaves": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": -2, "roll": 0, "zoom": 3},
    "pan_battlefield": {"horizontal": 0, "vertical": 0, "pan": 7, "tilt": 0, "roll": 0, "zoom": 0},
    "pan_sunset_skyline": {"horizontal": 0, "vertical": 0, "pan": -5, "tilt": 0, "roll": 0, "zoom": 0},
    "pan_painting": {"horizontal": 0, "vertical": 0, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},
    "pull_back_wide_to_medium": {"horizontal": 0, "vertical": -4, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0},
    "pull_focus_distant": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 3},
    "rack_focus_fg_bg": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": 2},
    "rack_focus_bg_fg": {"horizontal": 0, "vertical": 0, "pan": 0, "tilt": 0, "roll": 0, "zoom": -2},
    "rack_focus_characters": {"horizontal": 3, "vertical": 0, "pan": 2, "tilt": 0, "roll": 0, "zoom": 0},

    # ==========================================
    # 時間表現 (timelapse) - 様々な組み合わせ
    # ==========================================
    "timelapse": {"horizontal": 0, "vertical": 0, "pan": 2, "tilt": 0, "roll": 0, "zoom": 0},
    "motion_timelapse": {"horizontal": 3, "vertical": 0, "pan": 3, "tilt": 0, "roll": 0, "zoom": 0},
    "hyperlapse": {"horizontal": 4, "vertical": 4, "pan": 2, "tilt": 0, "roll": 0, "zoom": 0},
}


def get_camera_control(camera_work_name: str | None) -> dict | None:
    """
    カメラワーク名からKlingAI camera_control形式に変換（multi-image2video用）
    注意: multi-image2videoではcamera_controlがサポートされていない可能性あり

    Args:
        camera_work_name: カメラワーク名（例: "zoom_in", "pan_left"）

    Returns:
        dict: KlingAI camera_control形式、見つからない場合はNone
    """
    if not camera_work_name:
        return None

    # 直接マッピングがある場合
    if camera_work_name in CAMERA_CONTROL_MAPPING:
        config = CAMERA_CONTROL_MAPPING[camera_work_name]
        return {
            "type": "simple",
            "config": config
        }

    # マッピングがない場合はログ出力してNoneを返す
    logger.warning(f"No camera_control mapping for: {camera_work_name}")
    return None


# ============================================================================
# 🎬 API確実制御カメラワーク（image2video エンドポイント使用）
# ============================================================================
# これらのカメラワークは KlingAI の camera_type/camera_value パラメータで
# 100% 確実に制御されます。プロンプトに依存しません。
#
# 使用API: https://api.klingai.com/v1/videos/image2video
# camera_type: horizontal, vertical, zoom, tilt, pan, roll,
#              down_back, forward_up, right_turn_forward, left_turn_forward
# camera_value: -10 〜 +10（負=逆方向、正=正方向、絶対値=強度）
# ============================================================================

# フロントエンドで選択肢として表示するための確実制御カメラワーク一覧
API_GUARANTEED_CAMERA_WORKS = {
    # ==========================================
    # 🔍 ズーム系（zoom）- 被写体に寄る/引く
    # ==========================================
    "zoom_in": {
        "label": "ズームイン",
        "label_en": "Zoom In",
        "description": "被写体にゆっくり寄る",
        "camera_type": "zoom",
        "camera_value": 5,
    },
    "zoom_out": {
        "label": "ズームアウト",
        "label_en": "Zoom Out",
        "description": "被写体から引いて全体を見せる",
        "camera_type": "zoom",
        "camera_value": -5,
    },
    "quick_zoom_in": {
        "label": "クイックズームイン",
        "label_en": "Quick Zoom In",
        "description": "素早く被写体に寄る（ドラマチック）",
        "camera_type": "zoom",
        "camera_value": 10,
    },
    "quick_zoom_out": {
        "label": "クイックズームアウト",
        "label_en": "Quick Zoom Out",
        "description": "素早く被写体から引く",
        "camera_type": "zoom",
        "camera_value": -10,
    },

    # ==========================================
    # ↔️ 左右パン（pan）- カメラを左右に振る
    # ==========================================
    "pan_left": {
        "label": "パン左",
        "label_en": "Pan Left",
        "description": "カメラを左に振る",
        "camera_type": "pan",
        "camera_value": -5,
    },
    "pan_right": {
        "label": "パン右",
        "label_en": "Pan Right",
        "description": "カメラを右に振る",
        "camera_type": "pan",
        "camera_value": 5,
    },
    "pan_quick_left": {
        "label": "クイックパン左",
        "label_en": "Quick Pan Left",
        "description": "素早くカメラを左に振る",
        "camera_type": "pan",
        "camera_value": -10,
    },
    "slow_pan_horizon": {
        "label": "スローパン（水平線）",
        "label_en": "Slow Pan Horizon",
        "description": "ゆっくり水平にパン",
        "camera_type": "pan",
        "camera_value": 3,
    },

    # ==========================================
    # ↕️ 上下チルト（tilt）- カメラを上下に振る
    # ==========================================
    "tilt_up": {
        "label": "チルトアップ",
        "label_en": "Tilt Up",
        "description": "カメラを上に振る",
        "camera_type": "tilt",
        "camera_value": 5,
    },
    "tilt_down": {
        "label": "チルトダウン",
        "label_en": "Tilt Down",
        "description": "カメラを下に振る",
        "camera_type": "tilt",
        "camera_value": -5,
    },
    "crane_up": {
        "label": "クレーンアップ",
        "label_en": "Crane Up",
        "description": "高い位置から見下ろす",
        "camera_type": "tilt",
        "camera_value": 7,
    },
    "crane_down": {
        "label": "クレーンダウン",
        "label_en": "Crane Down",
        "description": "低い位置から見上げる",
        "camera_type": "tilt",
        "camera_value": -7,
    },

    # ==========================================
    # 🚶 前後移動（vertical）- カメラが前後に動く
    # ==========================================
    "dolly_in": {
        "label": "ドリーイン",
        "label_en": "Dolly In",
        "description": "カメラが被写体に近づく",
        "camera_type": "vertical",
        "camera_value": 5,
    },
    "dolly_out": {
        "label": "ドリーアウト",
        "label_en": "Dolly Out",
        "description": "カメラが被写体から離れる",
        "camera_type": "vertical",
        "camera_value": -5,
    },
    "push_in": {
        "label": "プッシュイン",
        "label_en": "Push In",
        "description": "力強く被写体に迫る",
        "camera_type": "vertical",
        "camera_value": 7,
    },
    "pull_out": {
        "label": "プルアウト",
        "label_en": "Pull Out",
        "description": "被写体からゆっくり後退",
        "camera_type": "vertical",
        "camera_value": -7,
    },

    # ==========================================
    # ↔️ 左右移動（horizontal）- カメラが横に動く
    # ==========================================
    "truck_left": {
        "label": "トラック左",
        "label_en": "Truck Left",
        "description": "カメラが左に移動",
        "camera_type": "horizontal",
        "camera_value": -5,
    },
    "truck_right": {
        "label": "トラック右",
        "label_en": "Truck Right",
        "description": "カメラが右に移動",
        "camera_type": "horizontal",
        "camera_value": 5,
    },

    # ==========================================
    # 🔄 ロール（roll）- カメラを傾ける
    # ==========================================
    "dutch_angle": {
        "label": "ダッチアングル",
        "label_en": "Dutch Angle",
        "description": "不安定さを演出する傾き",
        "camera_type": "roll",
        "camera_value": 5,
    },

    # ==========================================
    # 🚁 プリセット複合動作
    # ==========================================
    "drone": {
        "label": "ドローン（上昇前進）",
        "label_en": "Drone Shot",
        "description": "上昇しながら前進（空撮風）",
        "camera_type": "forward_up",
        "camera_value": 5,
    },
    "down_back": {
        "label": "後退下降",
        "label_en": "Down & Back",
        "description": "下降しながら後退",
        "camera_type": "down_back",
        "camera_value": 5,
    },
    "right_turn_forward": {
        "label": "右旋回前進",
        "label_en": "Right Turn Forward",
        "description": "右に曲がりながら前進",
        "camera_type": "right_turn_forward",
        "camera_value": 5,
    },
    "left_turn_forward": {
        "label": "左旋回前進",
        "label_en": "Left Turn Forward",
        "description": "左に曲がりながら前進",
        "camera_type": "left_turn_forward",
        "camera_value": 5,
    },
}


# ============================================================================
# 📋 後方互換用マッピング（内部使用）
# ============================================================================
# CAMERA_TYPE_MAPPING は内部処理用。上記 API_GUARANTEED_CAMERA_WORKS と
# 追加の細かいバリエーションを含む。
CAMERA_TYPE_MAPPING: dict[str, tuple[str, int]] = {}

# API_GUARANTEED_CAMERA_WORKS から自動生成
for key, config in API_GUARANTEED_CAMERA_WORKS.items():
    CAMERA_TYPE_MAPPING[key] = (config["camera_type"], config["camera_value"])

# 追加のバリエーション（主に後方互換用）
_ADDITIONAL_CAMERA_MAPPINGS = {
    # 静止 - カメラなし
    "static_shot": ("", 0),
    "over_the_shoulder": ("", 0),

    # ズーム追加
    "zoom_in_background": ("zoom", 6),
    "zoom_out_landscape": ("zoom", -6),
    "zoom_eyes": ("zoom", 8),
    "zoom_object": ("zoom", 6),
    "dramatic_zoom": ("zoom", 10),
    "zoom_out_eye_scene": ("zoom", -7),
    "zoom_out_to_crowd": ("zoom", -8),
    "zoom_news_headline": ("zoom", 8),

    # 前後移動追加
    "rapid_face_approach": ("vertical", 10),
    "slow_approach_building": ("vertical", 3),
    "backward_from_character": ("vertical", -5),
    "dolly_out_doorway": ("vertical", -6),
    "follow_behind": ("vertical", 4),
    "follow_running": ("vertical", 5),
    "push_narrow": ("vertical", 5),
    "backward_hallway": ("vertical", -5),
    "backward_forest": ("vertical", -4),

    # パン追加
    "pan_battlefield": ("pan", 7),
    "pan_sunset_skyline": ("pan", -5),
    "pan_painting": ("pan", 3),

    # 左右移動追加
    "track_left": ("horizontal", -6),
    "track_right": ("horizontal", 6),
    "glide_lake": ("horizontal", 5),
    "glide_river": ("horizontal", 4),
    "glide_desert": ("horizontal", 5),
    "glide_ocean_sunset": ("horizontal", 4),

    # チルト追加
    "pedestal_up": ("tilt", 6),
    "pedestal_down": ("tilt", -6),
    "through_tree_canopy": ("tilt", 5),
    "through_branches": ("tilt", 6),
    "tilt_feet_to_head": ("tilt", 6),
    "tilt_reveal_hidden": ("tilt", -5),
    "tilt_reveal_path": ("tilt", -6),
    "tilt_over_cityscape": ("tilt", -4),
    "quick_tilt_up_sky": ("tilt", 10),
    "quick_tilt_down_ground": ("tilt", -10),
    "top_shot": ("tilt", -8),
    "hero_shot": ("tilt", 5),
    "follow_bird": ("tilt", 6),
    "tilt_up_fireworks": ("tilt", 7),
    "dolly_up_climbing": ("tilt", 5),

    # ロール追加
    "rotational_shot": ("roll", 7),

    # プリセット追加
    "forward_up": ("forward_up", 5),
}
CAMERA_TYPE_MAPPING.update(_ADDITIONAL_CAMERA_MAPPINGS)


def get_guaranteed_camera_works() -> list[dict]:
    """
    API確実制御カメラワークの一覧を取得（フロントエンド用）

    Returns:
        list[dict]: カメラワーク一覧
            - id: カメラワークID（例: "zoom_in"）
            - label: 日本語ラベル
            - label_en: 英語ラベル
            - description: 説明
            - guaranteed: True（常にTrue）
    """
    result = []
    for key, config in API_GUARANTEED_CAMERA_WORKS.items():
        result.append({
            "id": key,
            "label": config["label"],
            "label_en": config["label_en"],
            "description": config["description"],
            "guaranteed": True,
        })
    return result


def get_camera_type_and_value(camera_work_name: str | None) -> tuple[str, int] | None:
    """
    カメラワーク名からimage2video用のcamera_type/camera_valueを取得

    Args:
        camera_work_name: カメラワーク名（例: "zoom_in", "pan_left"）

    Returns:
        tuple[str, int]: (camera_type, camera_value)、見つからない場合はNone
    """
    if not camera_work_name:
        return None

    if camera_work_name in CAMERA_TYPE_MAPPING:
        camera_type, camera_value = CAMERA_TYPE_MAPPING[camera_work_name]
        if camera_type:  # 空文字でない場合のみ
            return (camera_type, camera_value)
        return None

    # マッピングがない場合はログ出力してNoneを返す
    logger.warning(f"No camera_type mapping for: {camera_work_name}")
    return None


def is_simple_camera_work(camera_work_name: str | None) -> bool:
    """
    シンプルなカメラワーク（image2videoで対応可能）かどうかを判定

    Args:
        camera_work_name: カメラワーク名

    Returns:
        bool: image2videoで対応可能ならTrue
    """
    if not camera_work_name:
        return False

    result = get_camera_type_and_value(camera_work_name)
    return result is not None


def _generate_jwt_token() -> str:
    """KlingAI API用のJWTトークンを生成"""
    if not settings.KLING_ACCESS_KEY or not settings.KLING_SECRET_KEY:
        raise ValueError("KLING_ACCESS_KEY and KLING_SECRET_KEY must be configured")

    headers = {
        "alg": "HS256",
        "typ": "JWT"
    }

    payload = {
        "iss": settings.KLING_ACCESS_KEY,
        "exp": int(time.time()) + 1800,  # 30分有効
        "nbf": int(time.time()) - 5
    }

    return jwt.encode(payload, settings.KLING_SECRET_KEY, algorithm="HS256", headers=headers)


async def generate_video(
    image_urls: list[str],
    prompt: str,
    camera_control: dict | None = None,
    aspect_ratio: str = "9:16"
) -> Optional[str]:
    """
    KlingAI Multi-Image to Video APIを使用して動画を生成

    Args:
        image_urls: 入力画像のURLリスト（1〜4枚）
        prompt: 動画生成プロンプト
        camera_control: カメラ制御パラメータ（オプション）
            例: {"type": "simple", "config": {"horizontal": 0, "vertical": 5, "pan": 0, "tilt": 0, "roll": 0, "zoom": 0}}
        aspect_ratio: アスペクト比（"9:16" or "16:9"）

    Returns:
        str: タスクID（成功時）、None（失敗時）
    """
    if not 1 <= len(image_urls) <= 4:
        logger.error(f"Invalid image count: {len(image_urls)}. Must be 1-4.")
        return None

    # プロンプト長さ制限（2000文字）
    if len(prompt) > 2000:
        prompt = prompt[:1997] + "..."
        logger.warning("Kling prompt truncated to 2000 chars")

    try:
        token = _generate_jwt_token()

        # image_listを構築
        image_list = [{"image": url} for url in image_urls]

        # リクエストボディを構築
        request_body = {
            "model_name": "kling-v1-6",
            "image_list": image_list,
            "prompt": prompt,
            "duration": "5",  # 5秒
            "aspect_ratio": aspect_ratio,
            "mode": "std",  # standard mode
        }
        logger.info(f"KlingAI using aspect_ratio: {aspect_ratio}")

        # camera_controlが指定されている場合は追加
        if camera_control:
            request_body["camera_control"] = camera_control
            logger.info(f"Using camera_control: {camera_control}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.klingai.com/v1/videos/multi-image2video",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=request_body,
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()

            # タスクIDを抽出
            task_id = result.get("data", {}).get("task_id")
            if task_id:
                logger.info(f"KlingAI task created: {task_id}")
                return task_id

            logger.error(f"KlingAI response missing task_id: {result}")
            return None

    except httpx.HTTPStatusError as e:
        logger.error(f"KlingAI HTTP error: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.exception(f"KlingAI generation failed: {e}")
        return None


async def generate_video_single(
    image_url: str,
    prompt: str,
    camera_control: dict | None = None,
    aspect_ratio: str = "9:16"
) -> Optional[str]:
    """
    KlingAI Image to Video APIを使用して動画を生成（単一画像、カメラ制御付き）

    Args:
        image_url: 入力画像のURL
        prompt: 動画生成プロンプト
        camera_control: カメラ制御パラメータ
            - type="simple"の場合: {"type": "simple", "config": {"tilt": -7}}
            - プリセットの場合: {"type": "down_back"} (config不要)
        aspect_ratio: アスペクト比（"9:16" or "16:9"）

    Returns:
        str: タスクID（成功時）、None（失敗時）
    """
    # プロンプト長さ制限（2000文字）
    if len(prompt) > 2000:
        prompt = prompt[:1997] + "..."
        logger.warning("Kling single prompt truncated to 2000 chars")

    try:
        token = _generate_jwt_token()
        logger.info(f"KlingAI using aspect_ratio: {aspect_ratio}")

        # リクエストボディを構築
        # camera_control使用時は pro mode + kling-v1-5 が必要
        if camera_control:
            request_body = {
                "model_name": "kling-v1-5",  # camera_control requires v1-5
                "image": image_url,
                "prompt": prompt,
                "duration": "5",  # 5秒
                "aspect_ratio": aspect_ratio,
                "mode": "pro",  # camera_control requires pro mode
                "camera_control": camera_control,
            }
            logger.info(f"Using camera_control with pro mode: {camera_control}")
        else:
            request_body = {
                "model_name": "kling-v1-6",
                "image": image_url,
                "prompt": prompt,
                "duration": "5",  # 5秒
                "aspect_ratio": aspect_ratio,
                "mode": "std",  # standard mode
            }

        logger.info(f"KlingAI request_body: {request_body}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.klingai.com/v1/videos/image2video",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=request_body,
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"KlingAI image2video response: {result}")

            # タスクIDを抽出
            task_id = result.get("data", {}).get("task_id")
            if task_id:
                logger.info(f"KlingAI single-image task created: {task_id}")
                return task_id

            logger.error(f"KlingAI response missing task_id: {result}")
            return None

    except httpx.HTTPStatusError as e:
        logger.error(f"KlingAI HTTP error: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.exception(f"KlingAI single-image generation failed: {e}")
        return None


async def check_video_status_single(task_id: str) -> Optional[dict]:
    """
    単一画像動画生成の進捗を確認

    Args:
        task_id: KlingAIのタスクID

    Returns:
        dict: ステータス情報
    """
    try:
        token = _generate_jwt_token()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.klingai.com/v1/videos/image2video/{task_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        # KlingAI APIのレスポンス構造に基づいて解析
        task_data = result.get("data", {})
        task_status = task_data.get("task_status")

        if task_status == "succeed":
            videos = task_data.get("task_result", {}).get("videos", [])
            if videos:
                return {
                    "status": "completed",
                    "video_url": videos[0].get("url"),
                    "duration": videos[0].get("duration"),
                }

        elif task_status == "failed":
            return {
                "status": "failed",
                "error": task_data.get("task_status_msg", "Unknown error"),
            }

        elif task_status == "processing":
            return {
                "status": "processing",
                "progress": 50,
            }

        elif task_status == "submitted":
            return {
                "status": "pending",
                "progress": 10,
            }

        return {
            "status": "pending",
            "progress": 0,
        }

    except Exception as e:
        logger.exception(f"KlingAI status check failed: {e}")
        return None


async def check_video_status(task_id: str) -> Optional[dict]:
    """
    動画生成の進捗を確認

    Args:
        task_id: KlingAIのタスクID

    Returns:
        dict: ステータス情報
            - status: "pending" | "processing" | "completed" | "failed"
            - video_url: 完了時の動画URL
            - error: エラーメッセージ
    """
    try:
        token = _generate_jwt_token()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.klingai.com/v1/videos/multi-image2video/{task_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        # KlingAI APIのレスポンス構造に基づいて解析
        task_data = result.get("data", {})
        task_status = task_data.get("task_status")

        if task_status == "succeed":
            videos = task_data.get("task_result", {}).get("videos", [])
            if videos:
                return {
                    "status": "completed",
                    "video_url": videos[0].get("url"),
                    "duration": videos[0].get("duration"),
                }

        elif task_status == "failed":
            return {
                "status": "failed",
                "error": task_data.get("task_status_msg", "Unknown error"),
            }

        elif task_status == "processing":
            return {
                "status": "processing",
                "progress": 50,
            }

        elif task_status == "submitted":
            return {
                "status": "pending",
                "progress": 10,
            }

        return {
            "status": "pending",
            "progress": 0,
        }

    except Exception as e:
        logger.exception(f"KlingAI status check failed: {e}")
        return None


async def get_video_result(task_id: str) -> Optional[dict]:
    """動画生成結果を取得（check_video_statusのエイリアス）"""
    return await check_video_status(task_id)


async def download_video(video_url: str, output_path: str) -> bool:
    """
    KlingAIから生成された動画をダウンロード

    Args:
        video_url: 動画のURL
        output_path: 保存先のファイルパス

    Returns:
        bool: 成功時True
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                video_url,
                timeout=120.0,
                follow_redirects=True,
            )
            response.raise_for_status()

            async with aiofiles.open(output_path, "wb") as f:
                await f.write(response.content)

            logger.info(f"Video downloaded: {output_path}")
            return True

    except Exception as e:
        logger.exception(f"Video download failed: {e}")
        return False
