# アドクリエイター BGM生成機能 実装計画書

## 概要

アドクリエイターで結合した動画に対して、Suno AIを使用してコンテンツにマッチしたBGMを自動生成し、動画のカット変わり目とBGMのビートを同期させる機能を実装する。

## ゴール

1. 結合動画の内容を分析し、適切なBGMを自動生成
2. 生成されたBGMのビートと動画のカット位置を同期
3. ユーザーが簡単にBGM付き動画を作成できるUX

---

## 現状の把握（重要）

### 既存のテーブル・API構造

| 項目 | 実際の名前 | 備考 |
|------|-----------|------|
| 結合動画テーブル | `video_concatenations` | ※`concat_videos`ではない |
| 結合エンドポイント | `/api/v1/videos/concat` | `videos/router.py`内 |
| BGM追加処理 | `app/tasks/bgm_processor.py` | 既存実装あり |
| FFmpeg BGM追加 | `FFmpegService.add_bgm()` | 既存実装あり |
| 非同期処理 | `BackgroundTasks` | ※Celeryではない |

### 既存の関連コード

```
movie-maker-api/
├── app/
│   ├── videos/
│   │   └── router.py          # /concat エンドポイント (line 314~)
│   ├── tasks/
│   │   ├── bgm_processor.py   # BGM追加の既存処理
│   │   └── video_concat_processor.py  # 動画結合処理
│   └── services/
│       └── ffmpeg_service.py  # add_bgm() メソッド (line 564~)
```

---

## 技術スタック

| 要素 | 技術 | 用途 | 備考 |
|------|------|------|------|
| 音楽生成 | Suno API (サードパーティ) | BGM生成 | 公式APIは非公開のため |
| ビート検出 | librosa | 生成音楽のビート位置検出 | 重い依存あり（後述） |
| 動画分析 | Gemini API | 動画内容の分析・プロンプト生成 | 既存実装を拡張 |
| 音声処理 | FFmpeg | タイムストレッチ・合成 | 既存 |
| 非同期処理 | FastAPI BackgroundTasks | 生成タスク管理 | 既存パターン踏襲 |

### Suno API プロバイダー選択

公式SunoはAPIを公開していないため、サードパーティを使用：

| プロバイダー | URL | 料金 | 推奨度 |
|-------------|-----|------|--------|
| **SunoAPI.org** | https://sunoapi.org | $0.01/曲〜 | ★★★ |
| GoAPI | https://goapi.ai | 従量課金 | ★★ |
| API非公式実装 | 自前構築 | 無料（工数大） | ★ |

**推奨**: SunoAPI.org（安定性・ドキュメント充実）

---

## データ型定義

### Python側（schemas追加）

```python
# app/videos/schemas.py に追加

from pydantic import BaseModel
from typing import Optional
from enum import Enum

class BGMMood(str, Enum):
    UPBEAT = "upbeat"
    CALM = "calm"
    DRAMATIC = "dramatic"
    ENERGETIC = "energetic"
    MELANCHOLIC = "melancholic"
    CINEMATIC = "cinematic"

class BGMGenre(str, Enum):
    ELECTRONIC = "electronic"
    ACOUSTIC = "acoustic"
    ORCHESTRAL = "orchestral"
    POP = "pop"
    ROCK = "rock"
    AMBIENT = "ambient"

class BGMPromptSuggestion(BaseModel):
    """動画分析から生成されるBGM提案"""
    mood: BGMMood
    genre: BGMGenre
    tempo_bpm: int  # 推定BPM (60-180)
    prompt: str  # Suno用の完成プロンプト
    reasoning: str  # 分析理由

class BeatInfo(BaseModel):
    """ビート検出結果"""
    tempo: float  # 検出BPM
    beat_times: list[float]  # ビート位置（秒）
    downbeat_times: list[float]  # 強拍位置（小節頭）

class SyncResult(BaseModel):
    """同期計算結果"""
    original_cut_points: list[float]
    adjusted_cut_points: list[float]
    time_stretch_ratio: float  # 1.0 = 変更なし
    sync_quality_score: float  # 0.0-1.0

class BGMGenerateRequest(BaseModel):
    auto_analyze: bool = True
    custom_prompt: Optional[str] = None
    mood: Optional[BGMMood] = None
    genre: Optional[BGMGenre] = None
    sync_to_beats: bool = True
    duration_seconds: Optional[int] = None  # None=動画長に合わせる

class BGMGenerateResponse(BaseModel):
    bgm_generation_id: str
    concat_id: str
    status: str  # pending, analyzing, generating, syncing, completed, failed
    message: str

class BGMStatusResponse(BaseModel):
    id: str
    status: str
    progress: int  # 0-100
    bgm_url: Optional[str] = None
    sync_quality_score: Optional[float] = None
    error_message: Optional[str] = None

class ApplyBGMRequest(BaseModel):
    bgm_generation_id: str
    volume: float = 0.7  # 0.0-1.0
    original_audio_volume: float = 0.3  # 元動画の音声
    fade_in_seconds: float = 0.5
    fade_out_seconds: float = 1.5

class ApplyBGMResponse(BaseModel):
    concat_id: str
    status: str
    final_video_url: Optional[str] = None
```

---

## 実装フェーズ

### Phase 1: Suno APIクライアント実装

**目標**: Suno APIで音楽を生成できる状態にする

#### Step 1-1: 環境変数追加

```python
# app/core/config.py に追加
class Settings(BaseSettings):
    # ... 既存 ...

    # Suno API（サードパーティ）
    SUNO_API_KEY: str = ""
    SUNO_API_BASE_URL: str = "https://api.sunoapi.org"  # SunoAPI.org使用
    SUNO_CALLBACK_URL: str = ""  # Webhook用（オプション）
```

```bash
# .env.example に追加
SUNO_API_KEY=your_suno_api_key
SUNO_API_BASE_URL=https://api.sunoapi.org
```

#### Step 1-2: Suno APIクライアント実装

```python
# app/external/suno_client.py（新規作成）

import httpx
import logging
from typing import Optional
from pydantic import BaseModel
from app.core.config import settings

logger = logging.getLogger(__name__)

class SunoGenerationResult(BaseModel):
    task_id: str
    status: str  # pending, processing, completed, failed
    audio_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None

class SunoClient:
    """Suno API サードパーティクライアント"""

    def __init__(self):
        self.base_url = settings.SUNO_API_BASE_URL
        self.api_key = settings.SUNO_API_KEY
        self.timeout = 60.0

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_music(
        self,
        prompt: str,
        duration_seconds: int = 30,
        make_instrumental: bool = True,  # 歌詞なし
    ) -> SunoGenerationResult:
        """
        BGMを生成

        Args:
            prompt: 音楽の説明（英語推奨）
            duration_seconds: 生成する音楽の長さ（秒）
            make_instrumental: インストゥルメンタルのみ

        Returns:
            SunoGenerationResult: タスクID含む結果

        Raises:
            SunoAPIError: API呼び出し失敗時
        """
        if not self.api_key:
            raise SunoAPIError("SUNO_API_KEY が設定されていません")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/v1/music/generate",
                    headers=self._get_headers(),
                    json={
                        "prompt": prompt,
                        "duration": duration_seconds,
                        "make_instrumental": make_instrumental,
                        "model": "suno-v3.5",  # 最新モデル
                    }
                )
                response.raise_for_status()
                data = response.json()

                return SunoGenerationResult(
                    task_id=data["task_id"],
                    status=data.get("status", "pending"),
                )
        except httpx.HTTPStatusError as e:
            logger.error(f"Suno API error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                raise SunoAPIError("Suno APIキーが無効です")
            elif e.response.status_code == 402:
                raise SunoAPIError("Sunoクレジットが不足しています")
            elif e.response.status_code == 429:
                raise SunoAPIError("Sunoレート制限に達しました")
            raise SunoAPIError(f"Suno API エラー: {e.response.status_code}")
        except Exception as e:
            logger.exception(f"Suno API call failed: {e}")
            raise SunoAPIError(f"音楽生成に失敗: {str(e)}")

    async def check_status(self, task_id: str) -> SunoGenerationResult:
        """生成タスクのステータスを確認"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/v1/music/status/{task_id}",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                data = response.json()

                return SunoGenerationResult(
                    task_id=task_id,
                    status=data.get("status", "pending"),
                    audio_url=data.get("audio_url"),
                    duration_seconds=data.get("duration"),
                    error_message=data.get("error"),
                )
        except Exception as e:
            logger.exception(f"Suno status check failed: {e}")
            return SunoGenerationResult(
                task_id=task_id,
                status="failed",
                error_message=str(e),
            )

    async def download_audio(self, audio_url: str) -> bytes:
        """生成された音声をダウンロード"""
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            response = await client.get(audio_url)
            response.raise_for_status()
            return response.content


class SunoAPIError(Exception):
    """Suno API エラー"""
    pass


# シングルトンインスタンス
suno_client = SunoClient()
```

#### Step 1-3: 単体テスト

```python
# tests/external/test_suno_client.py

import pytest
from unittest.mock import AsyncMock, patch
from app.external.suno_client import SunoClient, SunoAPIError

@pytest.mark.asyncio
async def test_generate_music_success():
    client = SunoClient()
    with patch.object(client, '_get_headers', return_value={}):
        with patch('httpx.AsyncClient.post') as mock_post:
            mock_post.return_value.json.return_value = {
                "task_id": "test-123",
                "status": "pending"
            }
            mock_post.return_value.raise_for_status = lambda: None

            result = await client.generate_music("upbeat electronic music")
            assert result.task_id == "test-123"
            assert result.status == "pending"

@pytest.mark.asyncio
async def test_generate_music_no_api_key():
    client = SunoClient()
    client.api_key = ""

    with pytest.raises(SunoAPIError, match="SUNO_API_KEY"):
        await client.generate_music("test prompt")
```

**Phase 1 完了条件**:
- [ ] 環境変数設定完了
- [ ] SunoClientクラス実装
- [ ] エラーハンドリング実装
- [ ] 単体テスト通過

---

### Phase 2: 動画分析・プロンプト生成

**目標**: 動画内容を分析してBGM生成用プロンプトを自動生成

#### Step 2-1: 動画フレーム抽出

```python
# app/services/ffmpeg_service.py に追加

async def extract_frames(
    self,
    video_path: str,
    output_dir: str,
    num_frames: int = 4,
) -> list[str]:
    """
    動画から等間隔でフレームを抽出

    Args:
        video_path: 入力動画パス
        output_dir: 出力ディレクトリ
        num_frames: 抽出フレーム数

    Returns:
        list[str]: 抽出したフレームのパスリスト
    """
    duration = await self._get_video_duration(video_path)
    interval = duration / (num_frames + 1)

    frame_paths = []
    for i in range(1, num_frames + 1):
        timestamp = interval * i
        output_path = os.path.join(output_dir, f"frame_{i:02d}.jpg")

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(timestamp),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            output_path
        ]
        await self._run_ffmpeg(cmd)
        frame_paths.append(output_path)

    return frame_paths
```

#### Step 2-2: 動画分析サービス

```python
# app/services/video_analyzer.py（新規作成）

import logging
from typing import Optional
from app.external.gemini_client import gemini_client
from app.services.ffmpeg_service import get_ffmpeg_service
from app.videos.schemas import BGMPromptSuggestion, BGMMood, BGMGenre

logger = logging.getLogger(__name__)

# BPM推定用のマッピング
TEMPO_MAPPING = {
    "slow": (60, 80),
    "medium": (90, 120),
    "fast": (130, 160),
}

class VideoAnalyzer:
    """動画分析サービス"""

    async def analyze_for_bgm(
        self,
        video_path: str,
        cut_points: list[float],
        video_duration: float,
    ) -> BGMPromptSuggestion:
        """
        動画を分析してBGM生成用プロンプトを生成

        Args:
            video_path: 動画ファイルパス
            cut_points: カット位置（秒）のリスト
            video_duration: 動画の総時間（秒）

        Returns:
            BGMPromptSuggestion: BGM生成用の提案
        """
        ffmpeg = get_ffmpeg_service()

        # フレーム抽出
        import tempfile
        with tempfile.TemporaryDirectory() as temp_dir:
            frame_paths = await ffmpeg.extract_frames(video_path, temp_dir, num_frames=4)

            # フレームを読み込み
            frames_base64 = []
            for path in frame_paths:
                import base64
                with open(path, "rb") as f:
                    frames_base64.append(base64.b64encode(f.read()).decode())

        # カット間隔からテンポを推定
        if len(cut_points) > 1:
            avg_cut_interval = video_duration / len(cut_points)
            if avg_cut_interval < 2.0:
                tempo_category = "fast"
            elif avg_cut_interval < 4.0:
                tempo_category = "medium"
            else:
                tempo_category = "slow"
        else:
            tempo_category = "medium"

        tempo_range = TEMPO_MAPPING[tempo_category]
        estimated_bpm = (tempo_range[0] + tempo_range[1]) // 2

        # Geminiで動画内容を分析
        analysis = await self._analyze_with_gemini(frames_base64, video_duration, len(cut_points))

        # プロンプト生成
        prompt = self._build_suno_prompt(
            mood=analysis["mood"],
            genre=analysis["genre"],
            tempo_category=tempo_category,
            duration=int(video_duration),
        )

        return BGMPromptSuggestion(
            mood=BGMMood(analysis["mood"]),
            genre=BGMGenre(analysis["genre"]),
            tempo_bpm=estimated_bpm,
            prompt=prompt,
            reasoning=analysis["reasoning"],
        )

    async def _analyze_with_gemini(
        self,
        frames_base64: list[str],
        duration: float,
        num_cuts: int,
    ) -> dict:
        """Geminiで動画フレームを分析"""

        prompt = f"""
あなたは映像のBGM選定の専門家です。
以下の動画フレーム（{len(frames_base64)}枚）を分析し、適切なBGMの特徴を提案してください。

動画情報:
- 長さ: {duration:.1f}秒
- カット数: {num_cuts}

以下のJSON形式で回答してください:
{{
    "mood": "upbeat" | "calm" | "dramatic" | "energetic" | "melancholic" | "cinematic",
    "genre": "electronic" | "acoustic" | "orchestral" | "pop" | "rock" | "ambient",
    "reasoning": "選択理由（日本語、50文字以内）"
}}
"""

        # Gemini API呼び出し（既存のgemini_clientを使用）
        result = await gemini_client.analyze_images_with_prompt(
            images_base64=frames_base64,
            prompt=prompt,
        )

        import json
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            # パースに失敗したらデフォルト値
            logger.warning(f"Failed to parse Gemini response: {result}")
            return {
                "mood": "cinematic",
                "genre": "orchestral",
                "reasoning": "デフォルト設定を使用"
            }

    def _build_suno_prompt(
        self,
        mood: str,
        genre: str,
        tempo_category: str,
        duration: int,
    ) -> str:
        """Suno用のプロンプトを構築"""

        tempo_desc = {
            "slow": "slow tempo, 70 BPM",
            "medium": "medium tempo, 110 BPM",
            "fast": "fast tempo, 140 BPM",
        }

        return f"{mood} {genre} music, {tempo_desc[tempo_category]}, instrumental, {duration} seconds, professional production quality, suitable for video background"


# シングルトン
video_analyzer = VideoAnalyzer()
```

#### Step 2-3: Gemini連携拡張

```python
# app/external/gemini_client.py に追加（既存クラスに）

async def analyze_images_with_prompt(
    self,
    images_base64: list[str],
    prompt: str,
) -> str:
    """
    複数の画像をプロンプトと共に分析

    Args:
        images_base64: Base64エンコードされた画像のリスト
        prompt: 分析プロンプト

    Returns:
        str: Geminiの応答テキスト
    """
    import google.generativeai as genai

    model = genai.GenerativeModel("gemini-1.5-flash")

    # 画像をPartに変換
    parts = [prompt]
    for img_b64 in images_base64:
        import base64
        img_bytes = base64.b64decode(img_b64)
        parts.append({
            "mime_type": "image/jpeg",
            "data": img_bytes
        })

    response = await model.generate_content_async(parts)
    return response.text
```

**Phase 2 完了条件**:
- [ ] フレーム抽出機能実装
- [ ] VideoAnalyzerクラス実装
- [ ] Gemini連携拡張
- [ ] プロンプト生成テスト通過

---

### Phase 3: ビート検出・同期処理

**目標**: 生成されたBGMのビートと動画カットを同期

#### Step 3-0: librosa依存関係の対応

**重要**: librosaは重い依存関係を持つ

```bash
# requirements.txt に追加
librosa==0.10.1
numpy>=1.20.0
scipy>=1.7.0
# numba, llvmlite は librosa が自動インストール
```

**代替案（librosaが問題を起こす場合）**:
```bash
# 軽量代替: aubio
aubio==0.4.9
```

#### Step 3-1: ビート検出サービス

```python
# app/services/beat_detector.py（新規作成）

import logging
from typing import Optional
from app.videos.schemas import BeatInfo

logger = logging.getLogger(__name__)

class BeatDetector:
    """ビート検出サービス"""

    def detect_beats(self, audio_path: str) -> BeatInfo:
        """
        音声ファイルからビート位置を検出

        Args:
            audio_path: 音声ファイルパス（MP3, WAV等）

        Returns:
            BeatInfo: ビート情報
        """
        try:
            import librosa
            import numpy as np

            # 音声読み込み（モノラル、22050Hz）
            y, sr = librosa.load(audio_path, sr=22050, mono=True)

            # テンポとビート位置を検出
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)

            # 強拍（ダウンビート）を推定（4拍子と仮定）
            downbeat_times = beat_times[::4].tolist() if len(beat_times) >= 4 else beat_times.tolist()

            return BeatInfo(
                tempo=float(tempo),
                beat_times=beat_times.tolist(),
                downbeat_times=downbeat_times,
            )
        except ImportError:
            logger.warning("librosa not available, using fallback")
            return self._fallback_beat_detection(audio_path)
        except Exception as e:
            logger.exception(f"Beat detection failed: {e}")
            raise BeatDetectionError(f"ビート検出に失敗: {str(e)}")

    def _fallback_beat_detection(self, audio_path: str) -> BeatInfo:
        """
        librosaが使えない場合のフォールバック
        FFprobeで長さを取得し、仮定のBPMでビートを生成
        """
        import subprocess
        import json

        # FFprobeで長さ取得
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            audio_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        duration = float(data["format"]["duration"])

        # 仮定: 120 BPM
        assumed_bpm = 120.0
        beat_interval = 60.0 / assumed_bpm

        beat_times = []
        t = 0.0
        while t < duration:
            beat_times.append(t)
            t += beat_interval

        return BeatInfo(
            tempo=assumed_bpm,
            beat_times=beat_times,
            downbeat_times=beat_times[::4],
        )


class BeatDetectionError(Exception):
    """ビート検出エラー"""
    pass


# シングルトン
beat_detector = BeatDetector()
```

#### Step 3-2: 同期アルゴリズム

```python
# app/services/beat_sync.py（新規作成）

import logging
from typing import Optional
from app.videos.schemas import SyncResult

logger = logging.getLogger(__name__)

class BeatSynchronizer:
    """ビート同期サービス"""

    # 許容するズレの最大値（秒）
    MAX_ADJUSTMENT = 0.3

    # タイムストレッチの許容範囲
    MIN_STRETCH_RATIO = 0.9
    MAX_STRETCH_RATIO = 1.1

    def calculate_sync_adjustments(
        self,
        cut_points: list[float],
        beat_times: list[float],
        video_duration: float,
        bgm_duration: float,
    ) -> SyncResult:
        """
        カット位置をビートに合わせるための調整を計算

        Args:
            cut_points: 動画のカット位置（秒）
            beat_times: BGMのビート位置（秒）
            video_duration: 動画の長さ（秒）
            bgm_duration: BGMの長さ（秒）

        Returns:
            SyncResult: 同期結果
        """
        if not cut_points or not beat_times:
            return SyncResult(
                original_cut_points=cut_points,
                adjusted_cut_points=cut_points,
                time_stretch_ratio=1.0,
                sync_quality_score=0.0,
            )

        # 1. まずタイムストレッチ比率を計算（BGMを動画長に合わせる）
        stretch_ratio = video_duration / bgm_duration
        stretch_ratio = max(self.MIN_STRETCH_RATIO, min(self.MAX_STRETCH_RATIO, stretch_ratio))

        # ストレッチ後のビート位置を計算
        adjusted_beat_times = [t * stretch_ratio for t in beat_times]

        # 2. 各カット位置を最も近いビートに調整
        adjusted_cuts = []
        total_quality = 0.0

        for cut in cut_points:
            nearest_beat = min(adjusted_beat_times, key=lambda b: abs(b - cut))
            diff = abs(nearest_beat - cut)

            if diff <= self.MAX_ADJUSTMENT:
                # 許容範囲内なら調整
                adjusted_cuts.append(nearest_beat)
                quality = 1.0 - (diff / self.MAX_ADJUSTMENT)
            else:
                # 許容範囲外なら元のまま
                adjusted_cuts.append(cut)
                quality = 0.0

            total_quality += quality

        avg_quality = total_quality / len(cut_points) if cut_points else 0.0

        return SyncResult(
            original_cut_points=cut_points,
            adjusted_cut_points=adjusted_cuts,
            time_stretch_ratio=stretch_ratio,
            sync_quality_score=avg_quality,
        )


# シングルトン
beat_synchronizer = BeatSynchronizer()
```

#### Step 3-3: オーディオタイムストレッチ

```python
# app/services/ffmpeg_service.py に追加

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
    # atempoの制限対応
    if ratio < 0.5:
        # 0.5未満は複数回適用
        filters = []
        remaining = ratio
        while remaining < 0.5:
            filters.append("atempo=0.5")
            remaining *= 2
        filters.append(f"atempo={remaining}")
        filter_str = ",".join(filters)
    elif ratio > 2.0:
        # 2.0超は複数回適用
        filters = []
        remaining = ratio
        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2
        filters.append(f"atempo={remaining}")
        filter_str = ",".join(filters)
    else:
        filter_str = f"atempo={ratio}"

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-filter:a", filter_str,
        "-vn",  # 動画なし
        output_path
    ]

    await self._run_ffmpeg(cmd)
    return output_path
```

**Phase 3 完了条件**:
- [ ] librosa または代替ライブラリ導入
- [ ] BeatDetector実装
- [ ] BeatSynchronizer実装
- [ ] タイムストレッチ機能追加
- [ ] 同期品質スコア算出確認

---

### Phase 4: APIエンドポイント実装

**目標**: フロントエンドから呼び出せるAPIを実装

#### Step 4-1: エンドポイント追加

```python
# app/videos/router.py に追加（既存の /concat エンドポイント付近に）

from app.videos.schemas import (
    BGMGenerateRequest, BGMGenerateResponse,
    BGMStatusResponse, ApplyBGMRequest, ApplyBGMResponse,
)
from app.tasks.bgm_ai_generator import start_bgm_ai_generation

# ===== BGM AI生成エンドポイント =====

@router.post("/concat/{concat_id}/generate-bgm", response_model=BGMGenerateResponse)
async def generate_bgm_for_concat(
    concat_id: str,
    request: BGMGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    結合動画用のBGMをAI生成

    1. 動画を分析してプロンプト生成（auto_analyze=Trueの場合）
    2. Suno APIでBGM生成
    3. ビート検出・同期計算（sync_to_beats=Trueの場合）
    """
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 結合動画を取得
    response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="結合動画が見つかりません")

    concat_data = response.data
    if concat_data["status"] != "completed":
        raise HTTPException(status_code=400, detail="動画の結合が完了していません")

    # BGM生成レコード作成
    bgm_generation_id = str(uuid.uuid4())
    bgm_record = {
        "id": bgm_generation_id,
        "user_id": user_id,
        "concat_id": concat_id,
        "status": "pending",
        "custom_prompt": request.custom_prompt,
        "auto_analyze": request.auto_analyze,
        "sync_to_beats": request.sync_to_beats,
    }

    supabase.table("bgm_generations").insert(bgm_record).execute()

    # バックグラウンドで生成開始
    background_tasks.add_task(
        start_bgm_ai_generation,
        bgm_generation_id,
        concat_id,
        user_id,
        request.dict(),
    )

    return BGMGenerateResponse(
        bgm_generation_id=bgm_generation_id,
        concat_id=concat_id,
        status="pending",
        message="BGM生成を開始しました",
    )


@router.get("/concat/{concat_id}/bgm-status", response_model=BGMStatusResponse)
async def get_bgm_generation_status(
    concat_id: str,
    current_user: dict = Depends(get_current_user),
):
    """BGM生成のステータスを取得"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # 最新のBGM生成を取得
    response = (
        supabase.table("bgm_generations")
        .select("*")
        .eq("concat_id", concat_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="BGM生成が見つかりません")

    bgm = response.data[0]

    return BGMStatusResponse(
        id=bgm["id"],
        status=bgm["status"],
        progress=bgm.get("progress", 0),
        bgm_url=bgm.get("bgm_url"),
        sync_quality_score=bgm.get("sync_quality_score"),
        error_message=bgm.get("error_message"),
    )


@router.post("/concat/{concat_id}/apply-bgm", response_model=ApplyBGMResponse)
async def apply_bgm_to_concat(
    concat_id: str,
    request: ApplyBGMRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """生成されたBGMを動画に適用"""
    supabase = get_supabase()
    user_id = current_user["user_id"]

    # BGM生成を取得
    bgm_response = (
        supabase.table("bgm_generations")
        .select("*")
        .eq("id", request.bgm_generation_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not bgm_response.data:
        raise HTTPException(status_code=404, detail="BGM生成が見つかりません")

    bgm = bgm_response.data
    if bgm["status"] != "completed" or not bgm.get("bgm_url"):
        raise HTTPException(status_code=400, detail="BGMが準備できていません")

    # 結合動画を取得
    concat_response = (
        supabase.table("video_concatenations")
        .select("*")
        .eq("id", concat_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not concat_response.data:
        raise HTTPException(status_code=404, detail="結合動画が見つかりません")

    # バックグラウンドでBGM適用開始
    from app.tasks.bgm_ai_generator import start_bgm_apply
    background_tasks.add_task(
        start_bgm_apply,
        concat_id,
        bgm["bgm_url"],
        request.volume,
        request.original_audio_volume,
        request.fade_in_seconds,
        request.fade_out_seconds,
    )

    return ApplyBGMResponse(
        concat_id=concat_id,
        status="processing",
        final_video_url=None,
    )
```

**Phase 4 完了条件**:
- [ ] 3つのエンドポイント実装
- [ ] リクエスト/レスポンススキーマ追加
- [ ] エラーハンドリング実装
- [ ] 手動テスト通過

---

### Phase 5: データベーススキーマ

#### Step 5-1: マイグレーションSQL

```sql
-- bgm_generations テーブル作成
CREATE TABLE IF NOT EXISTS bgm_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    concat_id UUID REFERENCES video_concatenations(id) ON DELETE SET NULL,

    -- ステータス
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    -- pending, analyzing, generating, syncing, completed, failed
    progress INTEGER DEFAULT 0,

    -- Suno関連
    suno_task_id VARCHAR(255),

    -- 生成パラメータ
    custom_prompt TEXT,
    auto_analyze BOOLEAN DEFAULT TRUE,
    sync_to_beats BOOLEAN DEFAULT TRUE,

    -- 分析結果
    auto_generated_prompt TEXT,
    detected_mood VARCHAR(100),
    detected_genre VARCHAR(100),
    detected_tempo_bpm INTEGER,
    analysis_reasoning TEXT,

    -- 同期情報
    original_cut_points JSONB,
    adjusted_cut_points JSONB,
    beat_times JSONB,
    downbeat_times JSONB,
    time_stretch_ratio FLOAT,
    sync_quality_score FLOAT,

    -- 生成結果
    bgm_url TEXT,
    bgm_duration_seconds FLOAT,

    -- メタデータ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT,

    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'analyzing', 'generating', 'syncing', 'completed', 'failed')
    ),
    CONSTRAINT valid_progress CHECK (progress >= 0 AND progress <= 100)
);

-- インデックス
CREATE INDEX idx_bgm_generations_user_id ON bgm_generations(user_id);
CREATE INDEX idx_bgm_generations_concat_id ON bgm_generations(concat_id);
CREATE INDEX idx_bgm_generations_status ON bgm_generations(status);
CREATE INDEX idx_bgm_generations_created_at ON bgm_generations(created_at DESC);

-- RLS（Row Level Security）ポリシー
ALTER TABLE bgm_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bgm_generations"
    ON bgm_generations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bgm_generations"
    ON bgm_generations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bgm_generations"
    ON bgm_generations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bgm_generations"
    ON bgm_generations FOR DELETE
    USING (auth.uid() = user_id);

-- video_concatenations に BGM適用済み動画URLカラム追加
ALTER TABLE video_concatenations
ADD COLUMN IF NOT EXISTS final_video_with_bgm_url TEXT;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bgm_generations_updated_at
    BEFORE UPDATE ON bgm_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Phase 5 完了条件**:
- [ ] マイグレーション実行
- [ ] RLSポリシー適用
- [ ] インデックス作成確認

---

### Phase 6: 非同期タスク実装

#### Step 6-1: BGM生成タスク

```python
# app/tasks/bgm_ai_generator.py（新規作成）

import asyncio
import logging
import os
import tempfile

from app.core.supabase import get_supabase
from app.external.suno_client import suno_client, SunoAPIError
from app.external.r2 import r2_client, download_file
from app.services.video_analyzer import video_analyzer
from app.services.beat_detector import beat_detector
from app.services.beat_sync import beat_synchronizer
from app.services.ffmpeg_service import get_ffmpeg_service

logger = logging.getLogger(__name__)


async def update_bgm_status(
    bgm_id: str,
    status: str,
    progress: int = None,
    error_message: str = None,
    **extra_fields,
) -> None:
    """BGM生成ステータスを更新"""
    supabase = get_supabase()
    update_data = {"status": status}
    if progress is not None:
        update_data["progress"] = progress
    if error_message is not None:
        update_data["error_message"] = error_message
    update_data.update(extra_fields)

    supabase.table("bgm_generations").update(update_data).eq("id", bgm_id).execute()


async def process_bgm_ai_generation(
    bgm_generation_id: str,
    concat_id: str,
    user_id: str,
    request_params: dict,
) -> None:
    """
    BGM AI生成の非同期タスク

    処理フロー:
    1. 結合動画をダウンロード
    2. 動画分析（auto_analyze=Trueの場合）
    3. Suno APIでBGM生成
    4. ビート検出（sync_to_beats=Trueの場合）
    5. 同期計算
    6. タイムストレッチ
    7. R2にアップロード
    """
    supabase = get_supabase()
    ffmpeg = get_ffmpeg_service()

    try:
        # 結合動画情報を取得
        concat_response = (
            supabase.table("video_concatenations")
            .select("*")
            .eq("id", concat_id)
            .single()
            .execute()
        )
        concat_data = concat_response.data
        video_url = concat_data["final_video_url"]
        video_duration = concat_data.get("total_duration", 30)

        with tempfile.TemporaryDirectory() as temp_dir:
            # Step 1: 動画ダウンロード
            await update_bgm_status(bgm_generation_id, "analyzing", progress=5)

            video_path = os.path.join(temp_dir, "video.mp4")
            video_content = await download_file(video_url)
            with open(video_path, "wb") as f:
                f.write(video_content)

            # Step 2: 動画分析・プロンプト生成
            if request_params.get("auto_analyze", True):
                await update_bgm_status(bgm_generation_id, "analyzing", progress=15)

                # カット位置を取得（簡易的に均等分割）
                # TODO: 実際のカット位置をconcat_dataから取得
                num_cuts = len(concat_data.get("source_video_ids", [])) or 3
                cut_points = [video_duration * i / num_cuts for i in range(num_cuts)]

                suggestion = await video_analyzer.analyze_for_bgm(
                    video_path, cut_points, video_duration
                )

                prompt = suggestion.prompt
                await update_bgm_status(
                    bgm_generation_id, "analyzing", progress=25,
                    auto_generated_prompt=prompt,
                    detected_mood=suggestion.mood.value,
                    detected_genre=suggestion.genre.value,
                    detected_tempo_bpm=suggestion.tempo_bpm,
                    analysis_reasoning=suggestion.reasoning,
                    original_cut_points=cut_points,
                )
            else:
                prompt = request_params.get("custom_prompt", "cinematic instrumental music")
                cut_points = []

            # Step 3: Suno APIでBGM生成
            await update_bgm_status(bgm_generation_id, "generating", progress=30)

            suno_result = await suno_client.generate_music(
                prompt=prompt,
                duration_seconds=int(video_duration) + 5,  # 少し長めに
                make_instrumental=True,
            )

            await update_bgm_status(
                bgm_generation_id, "generating", progress=40,
                suno_task_id=suno_result.task_id,
            )

            # Suno生成完了を待機（ポーリング）
            max_wait = 180  # 3分
            wait_interval = 5
            elapsed = 0

            while elapsed < max_wait:
                await asyncio.sleep(wait_interval)
                elapsed += wait_interval

                status = await suno_client.check_status(suno_result.task_id)
                progress = 40 + int((elapsed / max_wait) * 30)  # 40-70%
                await update_bgm_status(bgm_generation_id, "generating", progress=min(progress, 70))

                if status.status == "completed" and status.audio_url:
                    break
                elif status.status == "failed":
                    raise SunoAPIError(status.error_message or "BGM生成に失敗しました")
            else:
                raise SunoAPIError("BGM生成がタイムアウトしました")

            # Step 4: BGMダウンロード
            await update_bgm_status(bgm_generation_id, "syncing", progress=75)

            bgm_content = await suno_client.download_audio(status.audio_url)
            bgm_path = os.path.join(temp_dir, "bgm.mp3")
            with open(bgm_path, "wb") as f:
                f.write(bgm_content)

            bgm_duration = status.duration_seconds or video_duration

            # Step 5: ビート検出・同期（オプション）
            final_bgm_path = bgm_path
            sync_result = None

            if request_params.get("sync_to_beats", True) and cut_points:
                await update_bgm_status(bgm_generation_id, "syncing", progress=80)

                beat_info = beat_detector.detect_beats(bgm_path)

                sync_result = beat_synchronizer.calculate_sync_adjustments(
                    cut_points=cut_points,
                    beat_times=beat_info.beat_times,
                    video_duration=video_duration,
                    bgm_duration=bgm_duration,
                )

                # タイムストレッチが必要な場合
                if abs(sync_result.time_stretch_ratio - 1.0) > 0.01:
                    await update_bgm_status(bgm_generation_id, "syncing", progress=85)

                    stretched_path = os.path.join(temp_dir, "bgm_stretched.mp3")
                    await ffmpeg.time_stretch_audio(
                        bgm_path, stretched_path, sync_result.time_stretch_ratio
                    )
                    final_bgm_path = stretched_path

                await update_bgm_status(
                    bgm_generation_id, "syncing", progress=90,
                    beat_times=beat_info.beat_times[:50],  # 最初の50個のみ保存
                    downbeat_times=beat_info.downbeat_times[:20],
                    adjusted_cut_points=sync_result.adjusted_cut_points,
                    time_stretch_ratio=sync_result.time_stretch_ratio,
                    sync_quality_score=sync_result.sync_quality_score,
                )

            # Step 6: R2にアップロード
            await update_bgm_status(bgm_generation_id, "syncing", progress=95)

            with open(final_bgm_path, "rb") as f:
                bgm_bytes = f.read()

            bgm_key = f"bgm/{user_id}/{bgm_generation_id}.mp3"
            bgm_url = await r2_client.upload_file(
                file_data=bgm_bytes,
                key=bgm_key,
                content_type="audio/mpeg",
            )

            # 完了
            await update_bgm_status(
                bgm_generation_id, "completed", progress=100,
                bgm_url=bgm_url,
                bgm_duration_seconds=bgm_duration,
            )

            logger.info(f"BGM generation completed: {bgm_generation_id}")

    except SunoAPIError as e:
        logger.error(f"Suno API error for {bgm_generation_id}: {e}")
        await update_bgm_status(bgm_generation_id, "failed", error_message=str(e))
    except Exception as e:
        logger.exception(f"BGM generation failed for {bgm_generation_id}: {e}")
        await update_bgm_status(bgm_generation_id, "failed", error_message=str(e))


async def process_bgm_apply(
    concat_id: str,
    bgm_url: str,
    bgm_volume: float,
    original_volume: float,
    fade_in: float,
    fade_out: float,
) -> None:
    """BGMを動画に適用"""
    supabase = get_supabase()
    ffmpeg = get_ffmpeg_service()

    try:
        # 結合動画情報を取得
        concat_response = (
            supabase.table("video_concatenations")
            .select("*")
            .eq("id", concat_id)
            .single()
            .execute()
        )
        concat_data = concat_response.data
        video_url = concat_data["final_video_url"]
        user_id = concat_data["user_id"]

        with tempfile.TemporaryDirectory() as temp_dir:
            # ダウンロード
            video_path = os.path.join(temp_dir, "video.mp4")
            bgm_path = os.path.join(temp_dir, "bgm.mp3")
            output_path = os.path.join(temp_dir, "output_with_bgm.mp4")

            video_content = await download_file(video_url)
            with open(video_path, "wb") as f:
                f.write(video_content)

            bgm_content = await download_file(bgm_url)
            with open(bgm_path, "wb") as f:
                f.write(bgm_content)

            # BGM追加（既存のadd_bgmメソッドを使用）
            await ffmpeg.add_bgm(
                video_path=video_path,
                audio_path=bgm_path,
                output_path=output_path,
                video_volume=original_volume,
                audio_volume=bgm_volume,
                fade_out_duration=fade_out,
            )

            # R2にアップロード
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            final_key = f"videos/{user_id}/concat/{concat_id}/final_with_bgm.mp4"
            final_url = await r2_client.upload_file(
                file_data=video_bytes,
                key=final_key,
                content_type="video/mp4",
            )

            # 更新
            supabase.table("video_concatenations").update({
                "final_video_with_bgm_url": final_url,
            }).eq("id", concat_id).execute()

            logger.info(f"BGM applied to concat: {concat_id}")

    except Exception as e:
        logger.exception(f"BGM apply failed for {concat_id}: {e}")
        raise


def start_bgm_ai_generation(
    bgm_generation_id: str,
    concat_id: str,
    user_id: str,
    request_params: dict,
) -> None:
    """BGM生成タスクを開始（同期ラッパー）"""
    asyncio.create_task(
        process_bgm_ai_generation(bgm_generation_id, concat_id, user_id, request_params)
    )


def start_bgm_apply(
    concat_id: str,
    bgm_url: str,
    bgm_volume: float,
    original_volume: float,
    fade_in: float,
    fade_out: float,
) -> None:
    """BGM適用タスクを開始（同期ラッパー）"""
    asyncio.create_task(
        process_bgm_apply(concat_id, bgm_url, bgm_volume, original_volume, fade_in, fade_out)
    )
```

**Phase 6 完了条件**:
- [ ] 非同期タスク実装
- [ ] ポーリング処理実装
- [ ] エラーリカバリー実装
- [ ] 結合テスト通過

---

### Phase 7: フロントエンド実装

#### Step 7-1: API クライアント拡張

```typescript
// lib/api/client.ts に追加

// BGM生成API
export const bgmApi = {
  generate: (concatId: string, options: {
    autoAnalyze?: boolean;
    customPrompt?: string;
    syncToBeats?: boolean;
  } = {}) =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/generate-bgm`, {
      method: "POST",
      body: JSON.stringify({
        auto_analyze: options.autoAnalyze ?? true,
        custom_prompt: options.customPrompt,
        sync_to_beats: options.syncToBeats ?? true,
      }),
    }),

  getStatus: (concatId: string) =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/bgm-status`),

  apply: (concatId: string, bgmGenerationId: string, options: {
    volume?: number;
    originalAudioVolume?: number;
    fadeIn?: number;
    fadeOut?: number;
  } = {}) =>
    fetchWithAuth(`/api/v1/videos/concat/${concatId}/apply-bgm`, {
      method: "POST",
      body: JSON.stringify({
        bgm_generation_id: bgmGenerationId,
        volume: options.volume ?? 0.7,
        original_audio_volume: options.originalAudioVolume ?? 0.3,
        fade_in_seconds: options.fadeIn ?? 0.5,
        fade_out_seconds: options.fadeOut ?? 1.5,
      }),
    }),
};
```

#### Step 7-2: BGM生成コンポーネント

```tsx
// components/concat/BGMGenerator.tsx（新規作成）

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { bgmApi } from '@/lib/api/client';
import { Music, Loader2, Check, AlertCircle, Wand2 } from 'lucide-react';

interface BGMGeneratorProps {
  concatId: string;
  videoDuration: number;
  onBGMGenerated?: (bgmUrl: string) => void;
  onBGMApplied?: (finalVideoUrl: string) => void;
}

type Status = 'idle' | 'generating' | 'ready' | 'applying' | 'applied' | 'error';

export function BGMGenerator({
  concatId,
  videoDuration,
  onBGMGenerated,
  onBGMApplied,
}: BGMGeneratorProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [bgmGenerationId, setBgmGenerationId] = useState<string | null>(null);
  const [bgmUrl, setBgmUrl] = useState<string | null>(null);
  const [syncScore, setSyncScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  // ステータスポーリング
  useEffect(() => {
    if (status !== 'generating' || !bgmGenerationId) return;

    const interval = setInterval(async () => {
      try {
        const res = await bgmApi.getStatus(concatId);
        setProgress(res.progress);

        if (res.status === 'completed' && res.bgm_url) {
          setStatus('ready');
          setBgmUrl(res.bgm_url);
          setSyncScore(res.sync_quality_score);
          onBGMGenerated?.(res.bgm_url);
          clearInterval(interval);
        } else if (res.status === 'failed') {
          setStatus('error');
          setError(res.error_message || 'BGM生成に失敗しました');
          clearInterval(interval);
        }
      } catch (e) {
        console.error('Status check failed:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, bgmGenerationId, concatId, onBGMGenerated]);

  const handleGenerate = async () => {
    setStatus('generating');
    setProgress(0);
    setError(null);

    try {
      const res = await bgmApi.generate(concatId, {
        autoAnalyze: !customPrompt,
        customPrompt: customPrompt || undefined,
        syncToBeats: true,
      });
      setBgmGenerationId(res.bgm_generation_id);
    } catch (e: any) {
      setStatus('error');
      setError(e.message || 'BGM生成の開始に失敗しました');
    }
  };

  const handleApply = async () => {
    if (!bgmGenerationId) return;

    setStatus('applying');

    try {
      await bgmApi.apply(concatId, bgmGenerationId);
      setStatus('applied');
      // TODO: 適用完了後のURL取得
    } catch (e: any) {
      setStatus('error');
      setError(e.message || 'BGMの適用に失敗しました');
    }
  };

  return (
    <div className="rounded-xl bg-[#2a2a2a] border border-[#404040] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#fce300]/10 border border-[#fce300]/30 flex items-center justify-center">
          <Music className="w-5 h-5 text-[#fce300]" />
        </div>
        <div>
          <h3 className="font-semibold text-white">AI BGM生成</h3>
          <p className="text-sm text-gray-400">動画に合わせたBGMを自動生成</p>
        </div>
      </div>

      {status === 'idle' && (
        <>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">
              カスタムプロンプト（任意）
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例: upbeat electronic music, energetic"
              className="w-full px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#404040] text-white placeholder-gray-500 focus:border-[#fce300] focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              空欄の場合、動画を分析して自動生成します
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            className="w-full bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            BGMを生成
          </Button>
        </>
      )}

      {status === 'generating' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[#fce300]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>BGMを生成中...</span>
          </div>
          <div className="w-full h-2 bg-[#404040] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fce300] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-400">
            {progress < 30 ? '動画を分析中...' :
             progress < 70 ? 'BGMを生成中...' :
             'ビートを同期中...'}
          </p>
        </div>
      )}

      {status === 'ready' && bgmUrl && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <Check className="w-4 h-4" />
            <span>BGM生成完了</span>
          </div>

          {syncScore !== null && (
            <div className="text-sm text-gray-400">
              同期スコア: {Math.round(syncScore * 100)}%
            </div>
          )}

          <audio controls src={bgmUrl} className="w-full" />

          <div className="flex gap-3">
            <Button
              onClick={handleGenerate}
              variant="outline"
              className="flex-1 border-[#404040] text-gray-300 hover:bg-[#333333]"
            >
              再生成
            </Button>
            <Button
              onClick={handleApply}
              className="flex-1 bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold"
            >
              動画に適用
            </Button>
          </div>
        </div>
      )}

      {status === 'applying' && (
        <div className="flex items-center gap-2 text-[#fce300]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>BGMを適用中...</span>
        </div>
      )}

      {status === 'applied' && (
        <div className="flex items-center gap-2 text-green-400">
          <Check className="w-4 h-4" />
          <span>BGMを適用しました</span>
        </div>
      )}

      {status === 'error' && error && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <Button
            onClick={() => { setStatus('idle'); setError(null); }}
            variant="outline"
            className="border-[#404040] text-gray-300 hover:bg-[#333333]"
          >
            やり直す
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Phase 7 完了条件**:
- [ ] APIクライアント拡張
- [ ] BGMGeneratorコンポーネント実装
- [ ] アドクリエイターページに統合
- [ ] E2Eテスト通過

---

## 実装スケジュール（修正版）

| フェーズ | 内容 | 見積もり | 依存 |
|---------|------|---------|------|
| Phase 1 | Suno APIクライアント | 1日 | なし |
| Phase 2 | 動画分析・プロンプト生成 | 1日 | Phase 1 |
| Phase 3 | ビート検出・同期処理 | 1.5日 | なし（並行可） |
| Phase 4 | APIエンドポイント | 0.5日 | Phase 1,2 |
| Phase 5 | データベース | 0.5日 | なし（最初に実行可） |
| Phase 6 | 非同期タスク | 1日 | Phase 1,2,3,4,5 |
| Phase 7 | フロントエンド | 1.5日 | Phase 4,6 |
| **合計** | | **約7日** | |

### 並行実行可能なタスク

```
Phase 5 (DB) ─────┬─────────────────────────────────────────┐
                  │                                         │
Phase 1 (Suno) ───┼── Phase 2 (分析) ──┬── Phase 4 (API) ──┼── Phase 6 (タスク) ── Phase 7 (FE)
                  │                    │                    │
Phase 3 (ビート) ─┴────────────────────┘                    │
                                                            │
```

---

## リスクと対策（修正版）

| リスク | 対策 | 優先度 |
|--------|------|--------|
| Suno APIプロバイダーの不安定性 | 複数プロバイダー対応、フォールバック実装 | 高 |
| librosaのインストール失敗 | aubioによる代替実装、フォールバック | 中 |
| ビート同期の品質低下 | 同期スコア表示、手動調整オプション | 中 |
| 音声品質の劣化（タイムストレッチ） | 比率制限（0.9-1.1）、品質プレビュー | 中 |
| コスト超過 | ユーザー制限、使用量ダッシュボード | 低 |

---

## 次のアクション

1. **Phase 5を最初に実行**（DB準備）
2. **Suno APIプロバイダーを決定**（SunoAPI.org推奨）
3. **APIキー取得・環境変数設定**
4. **Phase 1から順次実装開始**

---

## 参考リンク

- [SunoAPI.org Documentation](https://sunoapi.org/docs)
- [librosa Documentation](https://librosa.org/doc/latest/)
- [FFmpeg Audio Filters](https://ffmpeg.org/ffmpeg-filters.html#Audio-Filters)
- [FastAPI BackgroundTasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
