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
from app.tasks.prores_processor import process_prores_conversion, start_prores_processing
from app.tasks.tts_processor import process_tts_generation, start_tts_processing
from app.tasks.t2v_processor import process_t2v_generation, start_t2v_processing
from app.tasks.lip_sync_processor import process_lip_sync_generation, start_lip_sync_processing
from app.tasks.dialogue_processor import process_dialogue_generation, start_dialogue_processing

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
    "process_prores_conversion",
    "start_prores_processing",
    "process_tts_generation",
    "start_tts_processing",
    "process_t2v_generation",
    "start_t2v_processing",
    "process_lip_sync_generation",
    "start_lip_sync_processing",
    "process_dialogue_generation",
    "start_dialogue_processing",
]
