"""
HLS (HTTP Live Streaming) 変換サービス

動画をHLS形式に変換し、R2にアップロードする機能を提供する。
"""
import asyncio
import os
import logging
from typing import Any

logger = logging.getLogger(__name__)


class HLSConfig:
    """HLS変換設定"""
    SEGMENT_DURATION = 2  # 秒

    # 品質設定（縦型動画 9:16 用）
    # FFmpeg scale フィルターは width:height の順
    QUALITIES = [
        {
            "name": "720p",
            "width": 720,
            "height": 1280,
            "bitrate": "2500k",
            "maxrate": "3000k",
            "bufsize": "5000k",
        },
        {
            "name": "360p",
            "width": 360,
            "height": 640,
            "bitrate": "800k",
            "maxrate": "1000k",
            "bufsize": "1600k",
        },
    ]


class HLSConversionError(Exception):
    """HLS変換エラー"""
    pass


async def convert_to_hls(
    input_path: str,
    output_dir: str,
    video_id: str,
) -> dict[str, str]:
    """
    動画をHLS形式に変換

    Args:
        input_path: 入力動画パス
        output_dir: 出力ディレクトリ
        video_id: 動画ID（ファイル名に使用）

    Returns:
        {
            "master_playlist": "path/to/master.m3u8",
            "720p_playlist": "path/to/720p/playlist.m3u8",
            "360p_playlist": "path/to/360p/playlist.m3u8",
        }

    Raises:
        HLSConversionError: FFmpegエラー時
    """
    results: dict[str, str] = {}

    for quality in HLSConfig.QUALITIES:
        quality_dir = os.path.join(output_dir, quality["name"])
        os.makedirs(quality_dir, exist_ok=True)

        playlist_path = os.path.join(quality_dir, "playlist.m3u8")
        segment_pattern = os.path.join(quality_dir, "segment_%03d.m4s")

        # FFmpeg scale フィルターは width:height の順
        # force_original_aspect_ratio=decrease でアスペクト比を維持
        # pad でターゲットサイズにパディング（レターボックス）
        scale_filter = (
            f"scale={quality['width']}:{quality['height']}:"
            f"force_original_aspect_ratio=decrease,"
            f"pad={quality['width']}:{quality['height']}:(ow-iw)/2:(oh-ih)/2:black"
        )

        # FFmpeg コマンド構築
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", scale_filter,
            "-c:v", "libx264",
            "-preset", "fast",
            "-profile:v", "main",  # 互換性のため main プロファイル
            "-level", "4.0",
            "-b:v", quality["bitrate"],
            "-maxrate", quality["maxrate"],
            "-bufsize", quality["bufsize"],
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2",  # ステレオ
            "-f", "hls",
            "-hls_time", str(HLSConfig.SEGMENT_DURATION),
            "-hls_playlist_type", "vod",
            "-hls_segment_type", "fmp4",
            "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", segment_pattern,
            "-movflags", "+faststart",
            playlist_path,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"HLS conversion failed for {quality['name']}: {error_msg}")
            raise HLSConversionError(f"HLS conversion failed for {quality['name']}: {error_msg}")

        results[f"{quality['name']}_playlist"] = playlist_path
        logger.info(f"HLS conversion completed for {quality['name']}")

    # マスタープレイリスト生成
    master_path = os.path.join(output_dir, "master.m3u8")
    _generate_master_playlist(master_path, HLSConfig.QUALITIES)
    results["master_playlist"] = master_path

    return results


def _generate_master_playlist(
    output_path: str,
    qualities: list[dict[str, Any]],
) -> None:
    """マスタープレイリスト生成（同期関数）"""

    # 帯域幅計算（ビットレート + オーディオ 128kbps）
    bandwidth_map = {
        "720p": 2628000,  # 2500k video + 128k audio
        "360p": 928000,   # 800k video + 128k audio
    }

    lines = ["#EXTM3U", "#EXT-X-VERSION:6", ""]

    for quality in qualities:
        name = quality["name"]
        bandwidth = bandwidth_map.get(name, 1000000)
        # HLS RESOLUTION は width x height の順
        resolution = f"{quality['width']}x{quality['height']}"

        lines.append(
            f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},'
            f'RESOLUTION={resolution},'
            f'CODECS="avc1.4d401f,mp4a.40.2",'
            f'NAME="{name}"'
        )
        lines.append(f"{name}/playlist.m3u8")
        lines.append("")

    content = "\n".join(lines)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)


def _upload_file_to_r2_sync(
    client: Any,
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
    cache_control: str,
) -> None:
    """R2へのファイルアップロード（同期、to_thread用）"""
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType=content_type,
        CacheControl=cache_control,
    )


async def upload_hls_to_r2(
    output_dir: str,
    video_id: str,
) -> str:
    """
    HLSファイルをR2にアップロード（非同期）

    boto3 put_object は同期処理のため asyncio.to_thread でラップ

    Args:
        output_dir: HLSファイルが格納されたディレクトリ
        video_id: 動画ID

    Returns:
        マスタープレイリストのURL
    """
    from app.external.r2 import get_r2_client, get_public_url
    from app.core.config import settings

    client = get_r2_client()
    base_key = f"hls/{video_id}"

    # アップロードタスクを収集
    upload_tasks = []

    for root, _dirs, files in os.walk(output_dir):
        for file in files:
            local_path = os.path.join(root, file)
            relative_path = os.path.relpath(local_path, output_dir)
            r2_key = f"{base_key}/{relative_path}"

            # Content-Type 決定
            if file.endswith(".m3u8"):
                content_type = "application/vnd.apple.mpegurl"
            elif file.endswith(".m4s"):
                content_type = "video/iso.segment"
            elif file.endswith(".mp4"):
                content_type = "video/mp4"
            else:
                content_type = "application/octet-stream"

            # ファイル読み込み
            with open(local_path, "rb") as f:
                file_content = f.read()

            # 非同期アップロードタスクを追加
            task = asyncio.to_thread(
                _upload_file_to_r2_sync,
                client,
                settings.R2_BUCKET_NAME,
                r2_key,
                file_content,
                content_type,
                "public, max-age=31536000, immutable",
            )
            upload_tasks.append(task)

    # 並列アップロード実行
    await asyncio.gather(*upload_tasks)

    master_url = get_public_url(f"{base_key}/master.m3u8")
    logger.info(f"HLS files uploaded to R2: {master_url}")
    return master_url
