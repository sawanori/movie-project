"""
Act-Two用モーションライブラリ管理

パフォーマンス動画（モーション）のURL管理を行う。
モーション動画はCloudflare R2の motions/ ディレクトリに保存される。
"""
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# モーションID → ファイルパスマッピング
MOTION_FILES: dict[str, str] = {
    # 表情系
    "smile_gentle": "expressions/smile_gentle.mp4",
    "smile_laugh": "expressions/smile_laugh.mp4",
    "surprised": "expressions/surprised.mp4",
    # ジェスチャー系
    "wave_hand": "gestures/wave_hand.mp4",
    "nod_yes": "gestures/nod_yes.mp4",
    "shake_head_no": "gestures/shake_head_no.mp4",
    # アクション系
    "turn_around": "actions/turn_around.mp4",
    "thinking": "actions/thinking.mp4",
    # 会話系
    "talking_calm": "speaking/talking_calm.mp4",
    "talking_excited": "speaking/talking_excited.mp4",
}

# モーションメタデータ（UI表示用）
MOTION_METADATA: dict[str, dict] = {
    "smile_gentle": {
        "category": "expression",
        "name_ja": "穏やかな笑顔",
        "name_en": "Gentle Smile",
        "duration_seconds": 3,
    },
    "smile_laugh": {
        "category": "expression",
        "name_ja": "笑う",
        "name_en": "Laugh",
        "duration_seconds": 4,
    },
    "surprised": {
        "category": "expression",
        "name_ja": "驚き",
        "name_en": "Surprised",
        "duration_seconds": 3,
    },
    "wave_hand": {
        "category": "gesture",
        "name_ja": "手を振る",
        "name_en": "Wave Hand",
        "duration_seconds": 4,
    },
    "nod_yes": {
        "category": "gesture",
        "name_ja": "頷く",
        "name_en": "Nod Yes",
        "duration_seconds": 3,
    },
    "shake_head_no": {
        "category": "gesture",
        "name_ja": "首を横に振る",
        "name_en": "Shake Head No",
        "duration_seconds": 3,
    },
    "turn_around": {
        "category": "action",
        "name_ja": "振り返る",
        "name_en": "Turn Around",
        "duration_seconds": 5,
    },
    "thinking": {
        "category": "action",
        "name_ja": "考えるポーズ",
        "name_en": "Thinking",
        "duration_seconds": 5,
    },
    "talking_calm": {
        "category": "speaking",
        "name_ja": "落ち着いて話す",
        "name_en": "Talking Calm",
        "duration_seconds": 6,
    },
    "talking_excited": {
        "category": "speaking",
        "name_ja": "興奮して話す",
        "name_en": "Talking Excited",
        "duration_seconds": 6,
    },
}


def get_motion_url(motion_type: str) -> str:
    """
    モーションタイプからR2の動画URLを取得

    Args:
        motion_type: モーションタイプ（例: "smile_gentle", "wave_hand"）

    Returns:
        str: モーション動画のURL

    Raises:
        ValueError: 不明なモーションタイプの場合
    """
    filename = MOTION_FILES.get(motion_type)
    if not filename:
        raise ValueError(f"Unknown motion type: {motion_type}")

    # R2のパブリックURLからモーション動画URLを構築
    base_url = settings.R2_PUBLIC_URL.rstrip("/")
    motion_url = f"{base_url}/motions/{filename}"

    logger.info(f"Motion URL for '{motion_type}': {motion_url}")
    return motion_url


def get_motion_metadata(motion_type: str) -> dict:
    """
    モーションタイプのメタデータを取得

    Args:
        motion_type: モーションタイプ

    Returns:
        dict: メタデータ（category, name_ja, name_en, duration_seconds）

    Raises:
        ValueError: 不明なモーションタイプの場合
    """
    metadata = MOTION_METADATA.get(motion_type)
    if not metadata:
        raise ValueError(f"Unknown motion type: {motion_type}")
    return {
        "id": motion_type,
        **metadata,
    }


def list_all_motions() -> list[dict]:
    """
    利用可能な全モーションのメタデータリストを取得

    Returns:
        list[dict]: モーションメタデータのリスト
    """
    return [
        {
            "id": motion_id,
            **metadata,
        }
        for motion_id, metadata in MOTION_METADATA.items()
    ]


def list_motions_by_category(category: str) -> list[dict]:
    """
    カテゴリ別にモーションをフィルタリング

    Args:
        category: カテゴリ（expression, gesture, action, speaking）

    Returns:
        list[dict]: 該当カテゴリのモーションリスト
    """
    return [
        {
            "id": motion_id,
            **metadata,
        }
        for motion_id, metadata in MOTION_METADATA.items()
        if metadata["category"] == category
    ]
