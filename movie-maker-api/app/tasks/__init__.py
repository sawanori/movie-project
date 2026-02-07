"""
バックグラウンドタスクモジュール
"""

from app.tasks.video_processor import process_video_generation, start_video_processing
from app.tasks.story_processor import process_story_generation, start_story_processing
from app.tasks.video_concat_processor import process_concat_generation, start_concat_processing
from app.tasks.bgm_processor import process_bgm_reprocessing, start_bgm_reprocessing
from app.tasks.storyboard_processor import (
    process_storyboard_generation,
    start_storyboard_processing,
    process_single_scene_regeneration,
    start_single_scene_regeneration,
    process_storyboard_concatenation,
    start_storyboard_concatenation,
)
from app.tasks.upscale_processor import process_upscale, start_upscale_processing
from app.tasks.interpolation_processor import process_interpolation, start_interpolation_processing
from app.tasks.topaz_upscale_processor import process_topaz_upscale, start_topaz_upscale_processing

__all__ = [
    "process_video_generation",
    "start_video_processing",
    "process_story_generation",
    "start_story_processing",
    "process_concat_generation",
    "start_concat_processing",
    "process_bgm_reprocessing",
    "start_bgm_reprocessing",
    "process_storyboard_generation",
    "start_storyboard_processing",
    "process_single_scene_regeneration",
    "start_single_scene_regeneration",
    "process_storyboard_concatenation",
    "start_storyboard_concatenation",
    "process_upscale",
    "start_upscale_processing",
    "process_interpolation",
    "start_interpolation_processing",
    "process_topaz_upscale",
    "start_topaz_upscale_processing",
]
