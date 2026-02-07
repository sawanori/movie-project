"""
カメラワーク連続性サービス

親シーンのカメラワークに基づいて、サブシーンに適したカメラワークを自動選択する。
"""

# カメラワーク連続性マッピング
# 親のカメラワーク: [サブシーン1用, サブシーン2用, サブシーン3用]
CAMERA_CONTINUITY_MAP = {
    # 静的ショット
    "Static shot": ["Slow push in", "Gentle arc right", "Pull back to wide"],
    "static": ["Slow push in", "Gentle arc right", "Pull back to wide"],

    # ズーム系
    "Slow zoom in": ["Hold on subject", "Slow pan right", "Ease out to static"],
    "zoom in": ["Hold on subject", "Slow pan right", "Ease out to static"],
    "Slow zoom out": ["Continue zoom out", "Pan to follow", "Static wide"],
    "zoom out": ["Continue zoom out", "Pan to follow", "Static wide"],

    # パン系
    "Pan left": ["Slow to static", "Reverse pan right", "Tilt up"],
    "pan left": ["Slow to static", "Reverse pan right", "Tilt up"],
    "Pan right": ["Continue pan", "Slow to static", "Arc around subject"],
    "pan right": ["Continue pan", "Slow to static", "Arc around subject"],

    # ティルト系
    "Tilt up": ["Hold at top", "Slow tilt down", "Pan right"],
    "tilt up": ["Hold at top", "Slow tilt down", "Pan right"],
    "Tilt down": ["Hold at bottom", "Reverse tilt up", "Push in"],
    "tilt down": ["Hold at bottom", "Reverse tilt up", "Push in"],

    # ドリー/トラッキング系
    "Tracking shot": ["Continue tracking", "Slow to static", "Pull back"],
    "tracking": ["Continue tracking", "Slow to static", "Pull back"],
    "Dolly in": ["Hold close", "Slow dolly out", "Arc right"],
    "dolly in": ["Hold close", "Slow dolly out", "Arc right"],
    "Dolly out": ["Continue dolly out", "Static wide", "Pan to reveal"],
    "dolly out": ["Continue dolly out", "Static wide", "Pan to reveal"],

    # クレーン系
    "Crane up": ["Hold at height", "Slow crane down", "Pan horizon"],
    "crane up": ["Hold at height", "Slow crane down", "Pan horizon"],
    "Crane down": ["Hold low", "Push forward", "Tilt up"],
    "crane down": ["Hold low", "Push forward", "Tilt up"],

    # 特殊系
    "Handheld": ["Stabilize to static", "Gentle movement", "Follow action"],
    "handheld": ["Stabilize to static", "Gentle movement", "Follow action"],
    "360 orbit": ["Slow orbit", "Stop and hold", "Reverse orbit"],
    "orbit": ["Slow orbit", "Stop and hold", "Reverse orbit"],

    # Runway特有のカメラワーク
    "push in": ["Hold close", "Gentle arc", "Pull back slowly"],
    "pull back": ["Static wide", "Slow pan", "Push in gently"],
    "arc left": ["Continue arc", "Stop and hold", "Reverse arc right"],
    "arc right": ["Continue arc", "Stop and hold", "Reverse arc left"],
}

# デフォルトのカメラワーク（マッチしない場合）
DEFAULT_CONTINUATIONS = ["Static hold", "Slow push in", "Gentle movement"]


def get_continuation_camera_work(
    parent_camera_work: str | None,
    sub_scene_order: int,
) -> str:
    """
    親カメラワークに基づいて自然な続きのカメラワークを返す

    Args:
        parent_camera_work: 親シーンのカメラワーク
        sub_scene_order: サブシーン順序（1, 2, 3）

    Returns:
        推奨カメラワーク文字列
    """
    if not parent_camera_work:
        # カメラワークが未設定の場合はデフォルト
        index = min(sub_scene_order - 1, len(DEFAULT_CONTINUATIONS) - 1)
        return DEFAULT_CONTINUATIONS[max(0, index)]

    # 正規化（前後空白を除去）
    normalized = parent_camera_work.strip().lower()

    # 完全一致を探す
    for key, options in CAMERA_CONTINUITY_MAP.items():
        if key.lower() == normalized:
            index = min(sub_scene_order - 1, len(options) - 1)
            return options[max(0, index)]

    # 部分一致を探す
    for key, options in CAMERA_CONTINUITY_MAP.items():
        if key.lower() in normalized or normalized in key.lower():
            index = min(sub_scene_order - 1, len(options) - 1)
            return options[max(0, index)]

    # マッチしない場合はデフォルト
    index = min(sub_scene_order - 1, len(DEFAULT_CONTINUATIONS) - 1)
    return DEFAULT_CONTINUATIONS[max(0, index)]


def get_optimal_transition(
    scene_a_act: str,
    scene_b_act: str,
    is_sub_scene: bool = False,
) -> dict:
    """
    2つのシーン間の最適なトランジションを自動選択

    Args:
        scene_a_act: 前のシーンのact（起/承/転/結）
        scene_b_act: 後のシーンのact
        is_sub_scene: scene_bがサブシーンかどうか

    Returns:
        {"type": "cut" | "dissolve" | "fade", "duration": float}
    """
    # 同一act内（親→サブ、サブ→サブ）の場合
    if scene_a_act == scene_b_act:
        if is_sub_scene:
            # サブシーン間はハードカット（自然な連続感）
            return {"type": "cut", "duration": 0}
        else:
            # 同一act内の親シーン間（通常は発生しない）
            return {"type": "dissolve", "duration": 0.3}

    # act間のトランジション
    return {"type": "dissolve", "duration": 0.5}
