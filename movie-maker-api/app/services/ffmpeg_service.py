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
                "-movflags", "+faststart",
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
            "-movflags", "+faststart",
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

    async def convert_to_prores(
        self,
        video_path: str,
        output_path: str,
        deband_strength: float = 1.1,
        deband_radius: int = 20,
        apply_flat_look: bool = True,
        contrast: float = 0.9,
        saturation: float = 0.85,
        brightness: float = 0.03,
    ) -> str:
        """
        AI生成動画をデバンド処理してProRes 422 HQ (10bit)に変換

        生成AI動画特有のバンディング（色の段差）を滑らかにし、
        編集耐性の高いProResフォーマットに変換します。

        Args:
            video_path: 入力動画パス（MP4/H.264/8bit）
            output_path: 出力動画パス（.mov）
            deband_strength: デバンド強度（0.5-2.0、デフォルト1.1）
            deband_radius: デバンド半径（8-64、デフォルト20）
            apply_flat_look: フラットルック適用（編集しやすい色調に）
            contrast: コントラスト調整（0.5-1.5、デフォルト0.9）
            saturation: 彩度調整（0.5-1.5、デフォルト0.85）
            brightness: 明るさ調整（-0.5-0.5、デフォルト0.03）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # フィルター構築
        # gradfun: デバンド処理（グラデーションの段差を滑らかに）
        filters = [f"gradfun={deband_strength}:{deband_radius}"]

        # フラットルック適用（編集前提の色調に）
        if apply_flat_look:
            filters.append(
                f"eq=contrast={contrast}:saturation={saturation}:brightness={brightness}"
            )

        filter_chain = ",".join(filters)

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            # ProRes設定
            "-c:v", "prores_ks",        # ProResエンコーダー
            "-profile:v", "3",           # ProRes 422 HQ
            "-vendor", "apl0",           # Apple互換タグ
            "-bits_per_mb", "8000",      # ビットレート確保
            "-pix_fmt", "yuv422p10le",   # 10bit深度
            # フィルター（デバンド + フラットルック）
            "-vf", filter_chain,
            # 音声設定
            "-c:a", "pcm_s16le",         # ProRes標準の非圧縮音声
            output_path,
        ]

        logger.info(f"ProRes変換コマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"ProRes変換に失敗: {error_msg}")

        logger.info(f"ProRes変換完了: {output_path}")
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
            "-movflags", "+faststart",
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
            "-movflags", "+faststart",
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
            "-movflags", "+faststart",
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

        # 動画に音声トラックがあるかチェック
        has_audio = await self._has_audio_stream(video_path)
        logger.info(f"動画に音声トラック: {'あり' if has_audio else 'なし'}")

        if has_audio:
            # 音声トラックがある場合: 元音声とBGMをミックス
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
        else:
            # 音声トラックがない場合: BGMのみを追加
            filter_complex = (
                f"[1:a]atrim=0:{duration},volume={audio_volume},"
                f"afade=t=out:st={fade_start}:d={fade_out_duration}[out_audio]"
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
            "-movflags", "+faststart",
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
            "-movflags", "+faststart",
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
        film_grain_intensity: int = 0,
        lut_path: Optional[str] = None,
        lut_intensity: float = 0.0,
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
            film_grain_intensity: フィルムグレイン強度（0-100、デフォルト0=無効）
            lut_path: LUTファイルパス（オプション）
            lut_intensity: LUT強度（0.0-1.0、デフォルト0.0=無効）
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

    async def trim_video(
        self,
        input_path: str,
        output_path: str,
        start_time: float,
        end_time: float | None = None,
    ) -> str:
        """
        動画をトリミング

        Args:
            input_path: 入力動画パス
            output_path: 出力動画パス
            start_time: 開始位置（秒）
            end_time: 終了位置（秒）、Noneの場合は最後まで

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: トリミング失敗時
            ValueError: start_time >= end_time の場合
        """
        # 入力ファイル存在確認
        if not os.path.exists(input_path):
            raise FFmpegError(f"入力ファイルが見つかりません: {input_path}")

        # 動画の長さを取得
        duration = await self._get_video_duration(input_path)
        
        # バリデーション
        if end_time is not None:
            if start_time >= end_time:
                raise ValueError("end_time は start_time より大きい必要があります")
            if end_time - start_time < 0.5:
                raise ValueError("トリム範囲は0.5秒以上必要です")
            # end_time が動画長を超えている場合は動画長に丸める
            if duration and end_time > duration:
                logger.warning(f"end_time ({end_time}) が動画長 ({duration}) を超えています。動画長に丸めます。")
                end_time = duration

        # トリムが不要な場合（開始0秒、終了なしまたは動画長と同じ）
        if start_time == 0 and (end_time is None or (duration and abs(end_time - duration) < 0.1)):
            logger.info("トリム不要、入力ファイルをそのまま使用")
            # シンボリックリンクまたはコピーではなく、入力パスを返す
            # 呼び出し元で適切に処理する
            import shutil
            shutil.copy2(input_path, output_path)
            return output_path

        logger.info(f"動画トリミング開始: {start_time}s ~ {end_time if end_time else '最後'}s")

        # FFmpegコマンド構築（精度重視: -ss を -i の後に配置）
        cmd = [
            "ffmpeg",
            "-i", input_path,
            "-ss", str(start_time),
        ]

        # 終了位置指定
        if end_time is not None:
            cmd.extend(["-to", str(end_time)])

        # エンコード設定
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-y",  # 上書き許可
            output_path,
        ])

        logger.info(f"FFmpeg trim command: {' '.join(cmd)}")

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"FFmpeg trim failed: {error_msg}")
                raise FFmpegError(f"動画トリミングに失敗しました: {error_msg[:200]}")

            if not os.path.exists(output_path):
                raise FFmpegError("トリミング後のファイルが生成されませんでした")

            # 出力ファイルのサイズ確認
            output_size = os.path.getsize(output_path)
            if output_size == 0:
                raise FFmpegError("トリミング後のファイルが空です")

            logger.info(f"動画トリミング完了: {output_path} ({output_size} bytes)")
            return output_path

        except FFmpegError:
            raise
        except Exception as e:
            logger.exception(f"動画トリミング中にエラー: {e}")
            raise FFmpegError(f"動画トリミング中にエラーが発生しました: {str(e)}")

    # サポートするトランジション効果
    SUPPORTED_TRANSITIONS = [
        "none",      # トランジションなし（シンプル結合）
        "fade",      # フェード（黒経由）
        "dissolve",  # ディゾルブ（クロスフェード）
        "wipeleft",  # 左へワイプ
        "wiperight", # 右へワイプ
        "slideup",   # 上へスライド
        "slidedown", # 下へスライド
        "circleopen",  # 円形オープン
        "circleclose", # 円形クローズ
    ]

    async def concat_videos(
        self,
        video_paths: list[str],
        output_path: str,
        transition: str = "none",
        transition_duration: float = 0.5,
    ) -> str:
        """
        複数の動画を結合して1本の動画を作成

        Args:
            video_paths: 結合する動画ファイルのパスリスト（順番通りに結合）
            output_path: 出力先パス
            transition: トランジション効果
                - "none": トランジションなし（シンプル結合）
                - "fade": フェード（黒経由）
                - "dissolve": ディゾルブ（クロスフェード）
                - "wipeleft", "wiperight": ワイプ
                - "slideup", "slidedown": スライド
            transition_duration: トランジション時間（秒）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理失敗時
            ValueError: 引数が不正な場合
        """
        if len(video_paths) < 2:
            raise ValueError("結合には最低2本の動画が必要です")

        if len(video_paths) > 10:
            raise ValueError("結合できる動画は最大10本までです")

        if transition not in self.SUPPORTED_TRANSITIONS:
            raise ValueError(f"サポートされていないトランジション: {transition}")

        if transition_duration < 0 or transition_duration > 2.0:
            raise ValueError("トランジション時間は0〜2秒の範囲で指定してください")

        # 全ての動画ファイルが存在するか確認
        for path in video_paths:
            if not os.path.exists(path):
                raise FFmpegError(f"動画ファイルが見つかりません: {path}")

        logger.info(f"動画結合開始: {len(video_paths)}本, transition={transition}")

        if transition == "none":
            # シンプル結合（トランジションなし）
            return await self._concat_simple(video_paths, output_path)
        else:
            # トランジション付き結合
            return await self._concat_with_transition(
                video_paths, output_path, transition, transition_duration
            )

    async def _concat_simple(self, video_paths: list[str], output_path: str) -> str:
        """
        シンプル結合（トランジションなし）
        concat demuxerを使用して高速に結合
        """
        # 一時的なファイルリストを作成
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            filelist_path = f.name
            for path in video_paths:
                # パスをエスケープ
                escaped_path = path.replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")

        try:
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", filelist_path,
                "-c", "copy",  # 再エンコードなしで高速
                output_path,
            ]

            logger.debug(f"FFmpeg concat command: {' '.join(cmd)}")

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"FFmpeg concat failed: {error_msg}")
                raise FFmpegError(f"動画結合に失敗しました: {error_msg}")

            logger.info(f"シンプル結合完了: {output_path}")
            return output_path

        finally:
            # ファイルリストを削除
            if os.path.exists(filelist_path):
                os.unlink(filelist_path)

    async def _has_audio_stream(self, video_path: str) -> bool:
        """動画に音声トラックがあるかチェック"""
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            video_path,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            # 出力があれば音声トラックがある
            return bool(stdout.decode().strip())
        except Exception as e:
            logger.warning(f"音声トラック確認に失敗: {e}")
            return False

    async def _concat_with_transition(
        self,
        video_paths: list[str],
        output_path: str,
        transition: str,
        transition_duration: float,
    ) -> str:
        """
        トランジション付き結合
        xfadeフィルターを使用
        """
        # 各動画の長さを取得
        durations = []
        for path in video_paths:
            duration = await self._get_video_duration(path)
            if duration is None:
                raise FFmpegError(f"動画の長さを取得できません: {path}")
            durations.append(duration)

        # 音声トラックの有無を確認（最初の動画で判定）
        has_audio = await self._has_audio_stream(video_paths[0])
        logger.info(f"動画に音声トラック: {'あり' if has_audio else 'なし'}")

        # filter_complexを構築
        n = len(video_paths)

        # 入力指定
        inputs = []
        for path in video_paths:
            inputs.extend(["-i", path])

        # フィルターグラフを構築
        filter_parts = []

        # 映像フィルター
        video_filter = self._build_video_xfade_filter(
            n, durations, transition, transition_duration
        )
        filter_parts.append(video_filter)

        # 音声フィルター（音声トラックがある場合のみ）
        if has_audio:
            audio_filter = self._build_audio_crossfade_filter(
                n, durations, transition_duration
            )
            filter_parts.append(audio_filter)

        filter_complex = ";".join(filter_parts)

        # コマンド構築
        if has_audio:
            cmd = [
                "ffmpeg", "-y",
                *inputs,
                "-filter_complex", filter_complex,
                "-map", "[vout]",
                "-map", "[aout]",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                output_path,
            ]
        else:
            # 音声なしの場合
            cmd = [
                "ffmpeg", "-y",
                *inputs,
                "-filter_complex", filter_complex,
                "-map", "[vout]",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-an",  # 音声なし
                "-movflags", "+faststart",
                output_path,
            ]

        logger.debug(f"FFmpeg xfade command: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"FFmpeg xfade failed: {error_msg}")
            raise FFmpegError(f"トランジション付き結合に失敗しました: {error_msg}")

        logger.info(f"トランジション付き結合完了: {output_path}")
        return output_path

    def _build_video_xfade_filter(
        self,
        n: int,
        durations: list[float],
        transition: str,
        transition_duration: float,
    ) -> str:
        """
        映像用xfadeフィルターを構築
        各入力を同じフレームレート・タイムベースに正規化してからxfadeを適用

        例: 3本の動画の場合
        [0:v]fps=24,settb=AVTB[v0];[1:v]fps=24,settb=AVTB[v1];[2:v]fps=24,settb=AVTB[v2];
        [v0][v1]xfade=transition=fade:duration=0.5:offset=4.5[v01];
        [v01][v2]xfade=transition=fade:duration=0.5:offset=9.0[vout]
        """
        parts = []
        
        # Step 1: 各入力を正規化（fps=24, settb=AVTB）
        normalize_parts = []
        for i in range(n):
            normalize_parts.append(f"[{i}:v]fps=24,settb=AVTB[v{i}]")
        parts.append(";".join(normalize_parts))
        
        # Step 2: xfadeフィルターを構築
        if n == 2:
            offset = durations[0] - transition_duration
            parts.append(f"[v0][v1]xfade=transition={transition}:duration={transition_duration}:offset={offset}[vout]")
            return ";".join(parts)

        xfade_parts = []

        for i in range(n - 1):
            if i == 0:
                input1 = "[v0]"
                input2 = "[v1]"
                output = "[xf01]" if n > 2 else "[vout]"
            else:
                input1 = f"[xf{str(i-1).zfill(2)}{str(i).zfill(2)}]" if i > 1 else "[xf01]"
                input2 = f"[v{i+1}]"
                output = "[vout]" if i == n - 2 else f"[xf{str(i).zfill(2)}{str(i+1).zfill(2)}]"

            # オフセット計算: 累積時間 - トランジション時間 × 適用済み回数
            offset = sum(durations[:i+1]) - transition_duration * (i + 1)

            xfade_parts.append(
                f"{input1}{input2}xfade=transition={transition}:duration={transition_duration}:offset={offset}{output}"
            )

        parts.append(";".join(xfade_parts))
        return ";".join(parts)

    def _build_audio_crossfade_filter(
        self,
        n: int,
        durations: list[float],
        transition_duration: float,
    ) -> str:
        """
        音声用acrossfadeフィルターを構築

        例: 3本の動画の場合
        [0:a][1:a]acrossfade=d=0.5[a01];
        [a01][2:a]acrossfade=d=0.5[aout]
        """
        if n == 2:
            return f"[0:a][1:a]acrossfade=d={transition_duration}[aout]"

        parts = []

        for i in range(n - 1):
            if i == 0:
                input1 = "[0:a]"
                input2 = "[1:a]"
                output = "[a01]" if n > 2 else "[aout]"
            else:
                input1 = f"[a{str(i-1).zfill(2)}{str(i).zfill(2)}]" if i > 1 else "[a01]"
                input2 = f"[{i+1}:a]"
                output = "[aout]" if i == n - 2 else f"[a{str(i).zfill(2)}{str(i+1).zfill(2)}]"

            parts.append(f"{input1}{input2}acrossfade=d={transition_duration}{output}")

        return ";".join(parts)

    async def extract_last_frame(
        self,
        video_path: str,
        output_path: str,
        offset_seconds: float = 0.1,
    ) -> str:
        """
        動画の最終フレームを画像として抽出

        Args:
            video_path: 入力動画パス
            output_path: 出力画像パス（JPG推奨）
            offset_seconds: 終端からのオフセット（デフォルト0.1秒前）

        Returns:
            出力画像のパス
        """
        self._check_ffmpeg()

        cmd = [
            "ffmpeg", "-y",
            "-sseof", f"-{offset_seconds}",  # 終端からのオフセット
            "-i", video_path,
            "-frames:v", "1",  # 1フレームのみ抽出
            "-q:v", "2",  # 高品質（1-31、低いほど高品質）
            output_path
        ]

        logger.info(f"Extracting last frame: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise FFmpegError(f"Failed to extract last frame: {error_msg}")

        logger.info(f"Last frame extracted to: {output_path}")
        return output_path

    async def downscale_to_hd(
        self,
        video_path: str,
        output_path: str,
    ) -> str:
        """
        動画を1080p (FullHD) にダウンスケール

        Runway AI Upscaleで4Kにアップスケールされた動画を1080pにダウンスケール。
        AI品質を維持しつつ、正確なHD解像度を実現。

        Args:
            video_path: 入力動画パス（4K: 2304x4096等）
            output_path: 出力動画パス（1080p: 1080x1920 or 1920x1080）

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(video_path):
            raise FFmpegError(f"入力動画が見つかりません: {video_path}")

        # 動画の解像度を取得
        info = await self.get_video_info(video_path)
        width = None
        height = None

        for stream in info.get("streams", []):
            if stream.get("codec_type") == "video":
                width = stream.get("width")
                height = stream.get("height")
                break

        if not width or not height:
            raise FFmpegError("動画の解像度を取得できませんでした")

        logger.info(f"Input resolution: {width}x{height}")

        # アスペクト比に基づいて出力解像度を決定
        # 縦長 (9:16): → 1080x1920
        # 横長 (16:9): → 1920x1080
        # 正方形 (1:1): → 1080x1080
        if height > width:
            # 縦長動画
            out_width = 1080
            out_height = 1920
        elif width > height:
            # 横長動画
            out_width = 1920
            out_height = 1080
        else:
            # 正方形動画
            out_width = 1080
            out_height = 1080

        logger.info(f"Output resolution: {out_width}x{out_height}")

        # lanczosアルゴリズムでダウンスケール（高品質を維持）
        scale_filter = f"scale={out_width}:{out_height}:flags=lanczos"

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", scale_filter,
            "-c:v", "libx264",
            "-preset", "slow",  # 高品質
            "-crf", "18",       # 高品質（低いほど高品質）
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ]

        logger.info(f"FFmpeg downscale command: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"HDダウンスケールに失敗: {error_msg}")

        logger.info(f"HDダウンスケール完了: {output_path}")
        return output_path

    async def extract_first_frame(
        self,
        video_path: str,
        output_path: str,
        offset_seconds: float = 0.0,
    ) -> str:
        """
        動画の最初のフレームを画像として抽出

        Args:
            video_path: 入力動画パス
            output_path: 出力画像パス（JPG推奨）
            offset_seconds: 開始からのオフセット（デフォルト0秒）

        Returns:
            出力画像のパス
        """
        self._check_ffmpeg()

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(offset_seconds),  # 開始位置
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "2",
            output_path
        ]

        logger.info(f"Extracting first frame: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise FFmpegError(f"Failed to extract first frame: {error_msg}")

        logger.info(f"First frame extracted to: {output_path}")
        return output_path

    async def time_stretch_audio(
        self,
        input_path: str,
        output_path: str,
        ratio: float,
    ) -> str:
        """
        音声のテンポを調整（ピッチは維持）

        Args:
            input_path: 入力音声ファイル
            output_path: 出力音声ファイル
            ratio: テンポ比率 (1.0 = 変更なし, >1.0 = 速く, <1.0 = 遅く)

        Returns:
            str: 出力ファイルパス

        Note:
            FFmpegのatempoフィルタは0.5〜2.0の範囲のみ対応
            範囲外の場合はチェーンで対応
        """
        if not os.path.exists(input_path):
            raise FFmpegError(f"入力ファイルが見つかりません: {input_path}")

        # atempoの制限対応（0.5〜2.0の範囲）
        if ratio < 0.5:
            # 0.5未満は複数回適用
            filters = []
            remaining = ratio
            while remaining < 0.5:
                filters.append("atempo=0.5")
                remaining *= 2
            filters.append(f"atempo={remaining:.4f}")
            filter_str = ",".join(filters)
        elif ratio > 2.0:
            # 2.0超は複数回適用
            filters = []
            remaining = ratio
            while remaining > 2.0:
                filters.append("atempo=2.0")
                remaining /= 2
            filters.append(f"atempo={remaining:.4f}")
            filter_str = ",".join(filters)
        else:
            filter_str = f"atempo={ratio:.4f}"

        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-filter:a", filter_str,
            "-vn",  # 動画なし
            output_path
        ]

        logger.info(f"Time stretch audio: ratio={ratio:.4f}, filter={filter_str}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"タイムストレッチに失敗: {error_msg}")

        logger.info(f"タイムストレッチ完了: {output_path}")
        return output_path

    async def convert_to_prores_hd(
        self,
        input_path: str,
        output_path: str,
        trim_start: float = 0.0,
        trim_end: float | None = None,
        aspect_ratio: str = "16:9",
    ) -> str:
        """
        動画をFull HD ProRes 422 HQに変換

        編集用素材エクスポート向け。
        - 解像度: アスペクト比に応じて自動決定
          - 16:9 → 1920x1080
          - 9:16 → 1080x1920
          - 1:1 → 1080x1080
        - コーデック: ProRes 422 HQ
        - 10bit深度 (yuv422p10le)
        - 音声: PCM 16bit非圧縮
        - デバンド処理適用
        - トリミング対応

        Args:
            input_path: 入力動画パス
            output_path: 出力動画パス（.mov）
            trim_start: トリム開始時間（秒）
            trim_end: トリム終了時間（秒）、Noneの場合は終端まで
            aspect_ratio: アスペクト比 ("16:9", "9:16", "1:1")

        Returns:
            str: 出力動画パス

        Raises:
            FFmpegError: FFmpeg処理エラー
        """
        if not self._check_ffmpeg():
            raise FFmpegError("FFmpegがインストールされていません")

        if not os.path.exists(input_path):
            raise FFmpegError(f"入力動画が見つかりません: {input_path}")

        # アスペクト比に応じた解像度を決定
        if aspect_ratio == "9:16":
            width, height = 1080, 1920
        elif aspect_ratio == "1:1":
            width, height = 1080, 1080
        else:  # 16:9 or default
            width, height = 1920, 1080

        cmd = ["ffmpeg", "-y"]

        # トリミング（入力側で指定すると高速）
        if trim_start > 0:
            cmd.extend(["-ss", str(trim_start)])

        cmd.extend(["-i", input_path])

        # 終了時間（duration指定）
        if trim_end is not None:
            duration = trim_end - trim_start
            cmd.extend(["-t", str(duration)])

        # フィルター（リサイズ + インターレース解除 + デバンド）
        # scale: 指定サイズにリサイズ（lanczosで高品質）
        # bwdif: インターレース解除
        # gradfun: デバンド処理（バンディング除去）
        vf_filter = f"scale={width}:{height}:flags=lanczos,bwdif,gradfun=strength=1.2:radius=8"

        cmd.extend([
            "-vf", vf_filter,
            "-c:v", "prores_ks",
            "-profile:v", "3",  # ProRes 422 HQ
            "-vendor", "apl0",  # Apple互換タグ
            "-bits_per_mb", "8000",
            "-pix_fmt", "yuv422p10le",
            "-c:a", "pcm_s16le",  # PCM 16bit非圧縮
            output_path,
        ])

        logger.info(f"ProRes HD変換コマンド: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "不明なエラー"
            logger.error(f"FFmpegエラー: {error_msg}")
            raise FFmpegError(f"ProRes HD変換に失敗: {error_msg}")

        logger.info(f"ProRes HD変換完了: {output_path}")
        return output_path


# シングルトンインスタンス
ffmpeg_service = FFmpegService()


def get_ffmpeg_service() -> FFmpegService:
    """FFmpegServiceのインスタンスを取得"""
    return ffmpeg_service
