"""
FFmpeg動画処理サービス

動画にテキストオーバーレイとBGMを合成する機能を提供する。
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class FFmpegError(Exception):
    """FFmpeg処理エラー"""
    pass


class FFmpegService:
    """FFmpegを使用した動画処理サービス"""

    def __init__(self):
        # フォントファイルのパス
        # Docker環境とローカル環境の両方に対応
        self.font_paths = {
            "NotoSansJP": self._find_font([
                "/usr/share/fonts/noto/NotoSansJP-Regular.ttf",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf",
                "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",  # macOS
            ]),
            "NotoSerifJP": self._find_font([
                "/usr/share/fonts/noto/NotoSerifJP-Regular.ttf",
                "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
                "/usr/share/fonts/truetype/noto/NotoSerifJP-Regular.ttf",
                "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",  # macOS
            ]),
            "MPLUSRounded1c": self._find_font([
                "/usr/share/fonts/mplus/MPLUSRounded1c-Regular.ttf",
                "/usr/share/fonts/truetype/mplus/MPLUSRounded1c-Regular.ttf",
            ]),
        }
        self.default_font = self.font_paths.get("NotoSansJP") or ""

    def _find_font(self, paths: list[str]) -> Optional[str]:
        """利用可能なフォントパスを検索"""
        for path in paths:
            if os.path.exists(path):
                return path
        return None

    def _check_ffmpeg(self) -> bool:
        """FFmpegがインストールされているか確認"""
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
            )
            return result.returncode == 0
        except FileNotFoundError:
            return False

    def _escape_text(self, text: str) -> str:
        """FFmpegのdrawtextフィルター用にテキストをエスケープ"""
        # 特殊文字をエスケープ
        text = text.replace("\\", "\\\\")
        text = text.replace(":", "\\:")
        text = text.replace("'", "\\'")
        text = text.replace("[", "\\[")
        text = text.replace("]", "\\]")
        return text

    async def add_text_overlay(
        self,
        video_path: str,
        output_path: str,
        text: str,
        position: str = "bottom",
        font: str = "NotoSansJP",
        color: str = "#FFFFFF",
        font_size: int = 48,
        animation: str = "none",
    ) -> str:
        """
        動画にテキストオーバーレイを追加

        Args:
            video_path: 入力動画パス
            output_path: 出力動画パス
            text: 表示するテキスト
            position: "top", "center", "bottom"
            font: フォント名
            color: テキスト色（#RRGGBB形式）
            font_size: フォントサイズ
            animation: アニメーション種類 ("none", "fade_in", "slide_up")

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # 位置の計算
        if position == "top":
            y_position = "h*0.1"
        elif position == "center":
            y_position = "(h-text_h)/2"
        else:  # bottom
            y_position = "h*0.85-text_h"

        font_path = self.font_paths.get(font, self.default_font)
        if not font_path:
            logger.warning(f"フォントが見つかりません: {font}、テキストなしで処理します")
            # フォントがない場合はそのままコピー
            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-c", "copy",
                output_path,
            ]
        else:
            escaped_text = self._escape_text(text)

            # アニメーションフィルターの構築
            if animation == "fade_in":
                alpha_expr = "alpha='if(lt(t,0.5),t*2,1)'"
            elif animation == "slide_up":
                y_expr = f"y='if(lt(t,0.5),h-(h*0.15+text_h)*(t*2),{y_position})'"
            else:
                alpha_expr = ""
                y_expr = ""

            # 基本のdrawtextフィルター
            drawtext_filter = (
                f"drawtext="
                f"text='{escaped_text}':"
                f"fontfile='{font_path}':"
                f"fontsize={font_size}:"
                f"fontcolor={color}:"
                f"x=(w-text_w)/2:"
                f"y={y_position}:"
                f"borderw=2:"
                f"bordercolor=black"
            )

            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-vf", drawtext_filter,
                "-c:a", "copy",
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                output_path,
            ]

        logger.info(f"FFmpegコマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"テキストオーバーレイの追加に失敗: {error_msg}")

        logger.info(f"テキストオーバーレイ完了: {output_path}")
        return output_path

    async def add_film_grain(
        self,
        video_path: str,
        output_path: str,
        intensity: int = 20,
    ) -> str:
        """
        動画にフィルムグレイン効果を追加（AI生成感を軽減）

        Args:
            video_path: 入力動画パス
            output_path: 出力動画パス
            intensity: グレイン強度（0-100、デフォルト20%）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # noiseフィルターでフィルムグレインを追加
        # alls: 全チャンネルのノイズ強度
        # allf=t+u: temporal(時間的変化) + uniform(均一分布) でフィルムらしい粒子感
        noise_filter = f"noise=alls={intensity}:allf=t+u"

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", noise_filter,
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            output_path,
        ]

        logger.info(f"フィルムグレイン追加コマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"フィルムグレインの追加に失敗: {error_msg}")

        logger.info(f"フィルムグレイン追加完了: {output_path}")
        return output_path

    async def apply_color_grading(
        self,
        video_path: str,
        output_path: str,
    ) -> str:
        """
        動画にシネマティックなカラーグレーディングを適用（脱AI感）

        color.mdの仕様に基づく処理:
        1. シャドウのフェード + ブルー/グリーンのカラーキャスト
        2. 暖色系のミッドトーン（スキントーン補正）
        3. 彩度を少し下げて落ち着いた色調に
        4. ビネット（周辺減光）効果

        Args:
            video_path: 入力動画パス
            output_path: 出力動画パス

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # カラーグレーディングフィルターを構築
        # 1. curves: シャドウをリフト（黒を浮かせる）+ シャドウにブルー/グリーンを追加
        # 2. colorbalance: ミッドトーンに暖色（オレンジ/イエロー）を追加
        # 3. eq: 彩度を少し下げる
        # 4. vignette: 周辺減光

        color_filters = [
            # シャドウをリフト（黒を0.03まで持ち上げ）+ シャドウにブルー/シアンを追加（軽減版）
            "curves=m='0/0.03 0.25/0.26 0.5/0.5 0.75/0.75 1/1':b='0/0.015 1/1'",
            # ミッドトーンに暖色を追加（軽減版: 約半分）
            "colorbalance=rm=0.03:gm=0.03:bm=-0.02",
            # 彩度を少し下げる（0.95 = 95%、より控えめに）
            "eq=saturation=0.95",
            # ビネット効果（より緩やかに: PI/5）
            "vignette=PI/5",
        ]

        filter_chain = ",".join(color_filters)

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", filter_chain,
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            output_path,
        ]

        logger.info(f"カラーグレーディングコマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"カラーグレーディングの適用に失敗: {error_msg}")

        logger.info(f"カラーグレーディング完了: {output_path}")
        return output_path

    async def apply_promist_effect(
        self,
        video_path: str,
        output_path: str,
        intensity: float = 0.125,
    ) -> str:
        """
        ブラックプロミスト1/8効果を適用

        - ハイライトに微かな光の滲み（グロー/ハレーション）
        - コントラストを少し抑える
        - エッジを柔らかくしつつ解像感は維持

        Args:
            video_path: 入力動画パス
            output_path: 出力動画パス
            intensity: 効果の強度（デフォルト0.125 = 1/8）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # Pro-Mist効果をシミュレート
        # 1. ハイライト部分にブラーをかけてグロー効果
        # 2. オリジナルとブレンド
        # 3. コントラストを少し下げる

        blur_amount = max(3, int(15 * intensity))  # ブラー量（最低3で視認可能なグロー）
        bloom_opacity = intensity * 0.8 + 0.05     # ブルームの不透明度（ベース5%追加）
        contrast_reduction = 1.0 - (intensity * 0.12)  # コントラスト軽減

        # フィルターチェーン:
        # split -> 片方をぼかしてハイライト抽出 -> screenブレンド -> コントラスト調整
        promist_filter = (
            f"split[original][blur];"
            f"[blur]gblur=sigma={blur_amount},"
            f"curves=m='0/0 0.3/0 0.5/0.3 1/1'[bloom];"  # ハイライトのみ抽出
            f"[original][bloom]blend=all_mode=screen:all_opacity={bloom_opacity},"
            f"eq=contrast={contrast_reduction}:brightness=0.02"  # 少しコントラスト下げて明るく
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-filter_complex", promist_filter,
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            output_path,
        ]

        logger.info(f"Pro-Mist効果適用コマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"Pro-Mist効果の適用に失敗: {error_msg}")

        logger.info(f"Pro-Mist効果適用完了: {output_path}")
        return output_path

    async def apply_lut(
        self,
        video_path: str,
        output_path: str,
        lut_path: str,
        intensity: float = 0.5,
    ) -> str:
        """
        動画にLUT（ルックアップテーブル）を適用

        Args:
            video_path: 入力動画パス
            output_path: 出力動画パス
            lut_path: LUTファイルパス（.cube等）
            intensity: LUTの強度（0.0-1.0、デフォルト0.5=50%）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        if not os.path.exists(lut_path):
            raise FFmpegError(f"LUTファイルが見つかりません: {lut_path}")

        # 強度を0-1の範囲にクランプ
        intensity = max(0.0, min(1.0, intensity))

        # LUTを指定の強度で適用（split + lut3d + mix でブレンド）
        # 元映像とLUT適用映像をmixでブレンド
        original_weight = 1.0 - intensity
        lut_weight = intensity

        # LUTパスのエスケープ（スペース対応）
        escaped_lut_path = lut_path.replace("'", "'\\''")

        lut_filter = (
            f"split[original][tolut];"
            f"[tolut]lut3d='{escaped_lut_path}'[luted];"
            f"[original][luted]mix=weights='{original_weight} {lut_weight}'"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-filter_complex", lut_filter,
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            output_path,
        ]

        logger.info(f"LUT適用コマンド（強度{intensity*100:.0f}%）: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"LUTの適用に失敗: {error_msg}")

        logger.info(f"LUT適用完了: {output_path}")
        return output_path

    async def add_bgm(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        video_volume: float = 0.3,
        audio_volume: float = 0.7,
        fade_out_duration: float = 1.0,
    ) -> str:
        """
        動画にBGMを追加

        Args:
            video_path: 入力動画パス
            audio_path: BGMファイルパス
            output_path: 出力動画パス
            video_volume: 動画の音声ボリューム（0.0-1.0）
            audio_volume: BGMのボリューム（0.0-1.0）
            fade_out_duration: フェードアウト時間（秒）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        if not os.path.exists(audio_path):
            raise FFmpegError(f"BGMファイルが見つかりません: {audio_path}")

        # 動画の長さを取得
        duration = await self._get_video_duration(video_path)
        if duration is None:
            duration = 5.0  # デフォルト5秒

        # フェードアウト開始時間
        fade_start = max(0, duration - fade_out_duration)

        # 複雑なフィルターグラフを構築
        filter_complex = (
            f"[0:a]volume={video_volume}[v_audio];"
            f"[1:a]atrim=0:{duration},volume={audio_volume},"
            f"afade=t=out:st={fade_start}:d={fade_out_duration}[bgm];"
            f"[v_audio][bgm]amix=inputs=2:duration=first:dropout_transition=2[out_audio]"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[out_audio]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path,
        ]

        logger.info(f"FFmpegコマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"BGMの追加に失敗: {error_msg}")

        logger.info(f"BGM追加完了: {output_path}")
        return output_path

    async def convert_fps(
        self,
        video_path: str,
        output_path: str,
        target_fps: int = 24,
    ) -> str:
        """
        動画のフレームレートを変換（シネマティック24fps等）

        Args:
            video_path: 入力動画パス
            output_path: 出力動画パス
            target_fps: 目標フレームレート（デフォルト24fps）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # fpsフィルターでフレームレート変換
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", f"fps={target_fps}",
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            output_path,
        ]

        logger.info(f"FPS変換コマンド（{target_fps}fps）: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"FPS変換に失敗: {error_msg}")

        logger.info(f"FPS変換完了（{target_fps}fps）: {output_path}")
        return output_path

    async def add_logo_watermark(
        self,
        video_path: str,
        logo_path: str,
        output_path: str,
        position: str = "bottom_right",
        opacity: float = 0.7,
        scale: float = 0.15,
    ) -> str:
        """
        動画にロゴ（ウォーターマーク）を追加

        Args:
            video_path: 入力動画パス
            logo_path: ロゴ画像パス
            output_path: 出力動画パス
            position: "top_left", "top_right", "bottom_left", "bottom_right"
            opacity: 透明度（0.0-1.0）
            scale: ロゴのスケール（動画幅に対する比率）

        Returns:
            str: 出力動画パス
        """
        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        if not os.path.exists(logo_path):
            raise FFmpegError(f"ロゴファイルが見つかりません: {logo_path}")

        # 位置の計算
        positions = {
            "top_left": "10:10",
            "top_right": "main_w-overlay_w-10:10",
            "bottom_left": "10:main_h-overlay_h-10",
            "bottom_right": "main_w-overlay_w-10:main_h-overlay_h-10",
        }
        overlay_position = positions.get(position, positions["bottom_right"])

        # フィルター構築
        filter_complex = (
            f"[1:v]scale=iw*{scale}:-1,format=rgba,"
            f"colorchannelmixer=aa={opacity}[logo];"
            f"[0:v][logo]overlay={overlay_position}"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", logo_path,
            "-filter_complex", filter_complex,
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            output_path,
        ]

        logger.info(f"FFmpegコマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            raise FFmpegError(f"ロゴの追加に失敗: {error_msg}")

        logger.info(f"ロゴ追加完了: {output_path}")
        return output_path

    async def process_video(
        self,
        video_path: str,
        output_path: str,
        text: Optional[str] = None,
        text_position: str = "bottom",
        text_font: str = "NotoSansJP",
        text_color: str = "#FFFFFF",
        text_size: int = 48,
        bgm_path: Optional[str] = None,
        bgm_volume: float = 0.7,
        logo_path: Optional[str] = None,
        logo_position: str = "bottom_right",
        film_grain_intensity: int = 30,
        lut_path: Optional[str] = None,
        lut_intensity: float = 0.5,
        promist_enabled: bool = True,
        promist_intensity: float = 0.125,
        target_fps: Optional[int] = 24,
    ) -> str:
        """
        動画に複数の処理を一括で適用

        Args:
            video_path: 入力動画パス
            output_path: 最終出力パス
            text: オーバーレイテキスト
            text_position: テキスト位置
            text_font: フォント名
            text_color: テキスト色
            text_size: フォントサイズ
            bgm_path: BGMファイルパス
            bgm_volume: BGMボリューム
            logo_path: ロゴ画像パス
            logo_position: ロゴ位置
            film_grain_intensity: フィルムグレイン強度（0-100、デフォルト30%）
            lut_path: LUTファイルパス（オプション）
            lut_intensity: LUT強度（0.0-1.0、デフォルト0.5=50%）
            promist_enabled: Pro-Mist効果を有効にするか（デフォルトTrue）
            promist_intensity: Pro-Mist強度（デフォルト0.125 = 1/8）
            target_fps: 目標フレームレート（デフォルト24fps、Noneで変換なし）

        Returns:
            str: 出力動画パス
        """
        current_path = video_path
        temp_files = []

        try:
            # FPS変換（シネマティック24fps）
            if target_fps:
                logger.info(f"Starting FPS conversion to {target_fps}fps")
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.convert_fps(
                    video_path=current_path,
                    output_path=temp_path,
                    target_fps=target_fps,
                )
                logger.info(f"FPS conversion completed: {target_fps}fps")

            # カラーグレーディング適用（脱AI感・シネマティックな色調）
            # lut_pathがある場合のみ適用（use_lut=Falseの場合はスキップ）
            if lut_path:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.apply_color_grading(
                    video_path=current_path,
                    output_path=temp_path,
                )

            # Pro-Mist効果適用（ハイライトの滲み・コントラスト軽減）
            # lut_pathがある場合のみ適用（use_lut=Falseの場合はスキップ）
            if lut_path and promist_enabled:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.apply_promist_effect(
                    video_path=current_path,
                    output_path=temp_path,
                    intensity=promist_intensity,
                )

            # LUT適用（シネマティックルック）
            if lut_path and os.path.exists(lut_path):
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.apply_lut(
                    video_path=current_path,
                    output_path=temp_path,
                    lut_path=lut_path,
                    intensity=lut_intensity,
                )

            # フィルムグレイン追加（AI生成感を軽減）
            if film_grain_intensity > 0:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.add_film_grain(
                    video_path=current_path,
                    output_path=temp_path,
                    intensity=film_grain_intensity,
                )

            # テキストオーバーレイ
            if text:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.add_text_overlay(
                    video_path=current_path,
                    output_path=temp_path,
                    text=text,
                    position=text_position,
                    font=text_font,
                    color=text_color,
                    font_size=text_size,
                )

            # ロゴ追加
            if logo_path:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                    temp_path = f.name
                    temp_files.append(temp_path)

                current_path = await self.add_logo_watermark(
                    video_path=current_path,
                    logo_path=logo_path,
                    output_path=temp_path,
                    position=logo_position,
                )

            # BGM追加
            if bgm_path:
                current_path = await self.add_bgm(
                    video_path=current_path,
                    audio_path=bgm_path,
                    output_path=output_path,
                    audio_volume=bgm_volume,
                )
            else:
                # BGMがない場合は最後のファイルをコピー
                if current_path != output_path:
                    cmd = [
                        "ffmpeg", "-y",
                        "-i", current_path,
                        "-c", "copy",
                        output_path,
                    ]
                    process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await process.communicate()

            return output_path

        finally:
            # 一時ファイルをクリーンアップ
            for temp_file in temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.unlink(temp_file)
                except Exception as e:
                    logger.warning(f"一時ファイルの削除に失敗: {temp_file}, {e}")

    async def _get_video_duration(self, video_path: str) -> Optional[float]:
        """動画の長さを取得（秒）"""
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0 and stdout:
                return float(stdout.decode().strip())
        except Exception as e:
            logger.warning(f"動画の長さ取得に失敗: {e}")

        return None

    async def get_video_info(self, video_path: str) -> dict:
        """動画の情報を取得"""
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0 and stdout:
                import json
                return json.loads(stdout.decode())
        except Exception as e:
            logger.warning(f"動画情報取得に失敗: {e}")

        return {}


# シングルトンインスタンス
ffmpeg_service = FFmpegService()


def get_ffmpeg_service() -> FFmpegService:
    """FFmpegServiceのインスタンスを取得"""
    return ffmpeg_service
