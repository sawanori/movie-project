# 動画生成API切り替え機能 - 要件定義・作業工程

## 概要

Runway API と Google Gemini Veo API を設定で切り替えて使用できるようにする機能の要件定義および作業工程。

---

## 1. 要件定義

### 1.1 機能要件

| ID | 要件 | 優先度 |
|----|------|--------|
| F-01 | 環境変数`VIDEO_PROVIDER`で`runway`/`veo`を切り替え可能 | 必須 |
| F-02 | 両APIで同一のインターフェース（入力/出力）を提供 | 必須 |
| F-03 | 画像URL→動画URL変換の一貫した処理フロー | 必須 |
| F-04 | エラーメッセージの日本語化（両API共通） | 必須 |
| F-05 | API固有の制限（アスペクト比等）を内部で吸収 | 推奨 |
| F-06 | フォールバック機能（一方が失敗時に他方へ） | 将来 |

### 1.2 非機能要件

| ID | 要件 |
|----|------|
| NF-01 | 既存のストーリーボード処理に影響を与えない |
| NF-02 | 切り替え時にコード変更不要（設定のみ） |
| NF-03 | 各APIのレート制限を適切にハンドリング |

### 1.3 インターフェース仕様

```python
from dataclasses import dataclass
from typing import Optional
from enum import Enum

class VideoGenerationStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class VideoStatus:
    status: VideoGenerationStatus
    progress: int  # 0-100
    video_url: Optional[str] = None
    error_message: Optional[str] = None

class VideoProviderError(Exception):
    """動画生成プロバイダーエラー（ユーザー向けメッセージ付き）"""
    pass

class VideoProviderInterface:
    """動画生成プロバイダーの共通インターフェース"""

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """
        動画生成を開始

        Args:
            image_url: 入力画像のURL
            prompt: 動画生成プロンプト
            duration: 動画長さ（秒）
            aspect_ratio: アスペクト比 ("9:16", "16:9")
            camera_work: カメラワーク指定（オプション）

        Returns:
            str: task_id（ポーリング用識別子）

        Raises:
            VideoProviderError: 生成開始に失敗した場合
        """
        raise NotImplementedError

    async def check_status(self, task_id: str) -> VideoStatus:
        """
        生成状況を確認

        Args:
            task_id: generate_video()で返されたタスクID

        Returns:
            VideoStatus: 現在のステータス情報
        """
        raise NotImplementedError

    async def download_and_upload(self, video_url: str, user_id: str) -> str:
        """
        動画をダウンロードしてR2にアップロード

        Args:
            video_url: プロバイダーから返された動画URL
            user_id: ユーザーID（R2パス用）

        Returns:
            str: R2上の永続URL
        """
        raise NotImplementedError
```

---

## 2. API比較

### 2.1 機能比較

| 項目 | Runway Gen-4 Turbo | Gemini Veo 3.1 / 3.1 Fast |
|------|-------------------|---------------------------|
| **動画長さ** | 5-10秒 | 8秒固定 |
| **解像度** | 720p | 720p / 1080p |
| **アスペクト比** | 9:16, 16:9 等 | 9:16, 16:9 |
| **画像入力** | URL | Base64 / ファイルアップロード |
| **画像制限** | 幅/高さ比 ≥ 0.5 | 20MB以下、比率制限緩い |
| **音声生成** | なし | あり（Veo 3.1） |
| **ポーリング** | task_id でGET | Operation オブジェクト |

### 2.2 料金比較

| モデル | 料金（1秒あたり） | 5秒動画 | 20秒（4シーン） |
|--------|------------------|---------|-----------------|
| Runway Gen-4 | $0.025〜0.05 | $0.125〜0.25 | $0.50〜1.00 |
| Veo 3.1 | $0.20（音声なし） | $1.00 | $4.00 |
| Veo 3.1 Fast | $0.10（音声なし） | $0.50 | $2.00 |

### 2.3 制限比較

| 項目 | Runway | Veo |
|------|--------|-----|
| 日次制限 | 厳しい（プランによる） | 比較的緩い |
| レート制限 | 同時実行数制限あり | RPM制限 |
| アスペクト比制限 | 厳しい（0.5以上必須） | 緩い |

---

## 3. 作業工程

### Phase 1: 基盤整備（1時間）

| # | タスク | 成果物 | 詳細 |
|---|--------|--------|------|
| 1-1 | 共通インターフェース定義 | `video_provider.py` | 抽象クラス・データクラス定義 |
| 1-2 | 共通エラークラス定義 | `VideoProviderError` | ユーザー向けメッセージ対応 |
| 1-3 | 設定項目追加 | `config.py` | `VIDEO_PROVIDER`環境変数 |
| 1-4 | プロバイダーファクトリー実装 | `get_video_provider()` | 設定に応じたインスタンス生成 |

### Phase 2: Runway既存コードリファクタリング（30分）

| # | タスク | 成果物 | 詳細 |
|---|--------|--------|------|
| 2-1 | 既存コードをクラス化 | `RunwayProvider` | インターフェース準拠 |
| 2-2 | エラーハンドリング統一 | - | `VideoProviderError`使用 |
| 2-3 | 既存テストの確認 | - | 回帰テスト |

### Phase 3: Veoクライアント実装（1.5時間）

| # | タスク | 成果物 | 詳細 |
|---|--------|--------|------|
| 3-1 | Veo API認証設定 | `config.py`更新 | Google AI API Key |
| 3-2 | `VeoProvider`クラス実装 | `veo_provider.py` | インターフェース準拠 |
| 3-3 | 画像変換処理 | - | URL→Base64変換 |
| 3-4 | Operation ポーリング | - | 完了待機処理 |
| 3-5 | 動画ダウンロード処理 | - | Veo動画→R2アップロード |

### Phase 4: 統合・テスト（1時間）

| # | タスク | 成果物 | 詳細 |
|---|--------|--------|------|
| 4-1 | `storyboard_processor.py`修正 | - | プロバイダー経由に変更 |
| 4-2 | Runway動作確認 | - | 既存機能の回帰テスト |
| 4-3 | Veo動作確認 | - | 新規機能テスト |
| 4-4 | 切り替え動作確認 | - | 環境変数での切り替え |

---

## 4. ファイル構成

### 4.1 実装後の構成

```
app/
├── core/
│   └── config.py                  # VIDEO_PROVIDER 追加
├── external/
│   ├── video_provider.py          # 【新規】共通インターフェース・ファクトリー
│   ├── runway_provider.py         # 【リファクタ】Runway実装
│   ├── veo_provider.py            # 【新規】Veo実装
│   ├── runway_client.py           # 削除または互換用に残す
│   ├── gemini_client.py           # 既存（画像生成用）
│   └── r2.py                      # 既存（ストレージ）
└── tasks/
    └── storyboard_processor.py    # プロバイダー経由に変更
```

### 4.2 新規ファイル詳細

#### `video_provider.py`
```python
# 共通インターフェース
# VideoProviderInterface（抽象クラス）
# VideoStatus（データクラス）
# VideoProviderError（例外クラス）
# get_video_provider() -> VideoProviderInterface（ファクトリー関数）
```

#### `runway_provider.py`
```python
# RunwayProvider(VideoProviderInterface)
# - generate_video(): Runway API呼び出し
# - check_status(): タスクステータス確認
# - download_and_upload(): 動画をR2に保存
```

#### `veo_provider.py`
```python
# VeoProvider(VideoProviderInterface)
# - generate_video(): Veo API呼び出し
# - check_status(): Operation ポーリング
# - download_and_upload(): 動画をR2に保存
```

---

## 5. 環境変数

### 5.1 追加する環境変数

```env
# 動画生成プロバイダー選択
VIDEO_PROVIDER=runway  # "runway" または "veo"
```

### 5.2 既存の環境変数

```env
# Runway API（既存）
RUNWAY_API_KEY=your_runway_api_key

# Google AI API（既存 - Gemini画像生成で使用中）
GOOGLE_AI_API_KEY=your_google_ai_api_key
```

---

## 6. 使用例

### 6.1 storyboard_processor.py での使用

```python
from app.external.video_provider import get_video_provider

async def process_scene(scene_data: dict) -> str:
    # 設定に応じたプロバイダーを取得
    provider = get_video_provider()

    # 動画生成開始
    task_id = await provider.generate_video(
        image_url=scene_data["image_url"],
        prompt=scene_data["prompt"],
        duration=5,
        aspect_ratio="9:16",
        camera_work=scene_data.get("camera_work"),
    )

    # ポーリングで完了待機
    while True:
        status = await provider.check_status(task_id)

        if status.status == VideoGenerationStatus.COMPLETED:
            # R2にアップロード
            final_url = await provider.download_and_upload(
                status.video_url,
                scene_data["user_id"]
            )
            return final_url

        if status.status == VideoGenerationStatus.FAILED:
            raise VideoProviderError(status.error_message)

        await asyncio.sleep(5)
```

### 6.2 切り替え方法

```bash
# Runway を使用
VIDEO_PROVIDER=runway uvicorn app.main:app --reload

# Veo を使用
VIDEO_PROVIDER=veo uvicorn app.main:app --reload
```

---

## 7. リスク・注意点

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Veo APIの動作検証が必要 | 中 | 事前にAPIキーを取得してテスト |
| 動画長さの違い（5秒 vs 8秒） | 低 | duration パラメータで調整、Veoは8秒固定を許容 |
| 画像入力方式の違い | 中 | プロバイダー内でURL→Base64変換 |
| レート制限の違い | 中 | エラーハンドリングで適切にリトライ |
| 動画品質の違い | 低 | ユーザーに選択肢を提供（将来） |

---

## 8. 将来の拡張

### 8.1 フォールバック機能
一方のAPIが失敗した場合に自動的に他方を試行

### 8.2 ユーザー選択
フロントエンドでユーザーがプロバイダーを選択可能に

### 8.3 コスト最適化
使用量や時間帯に応じて自動的に最適なプロバイダーを選択

### 8.4 他プロバイダー追加
- Pika Labs
- Luma AI
- Kling AI

---

## 9. スケジュール

| Phase | 工数 | 累計 |
|-------|------|------|
| Phase 1: 基盤整備 | 1時間 | 1時間 |
| Phase 2: Runwayリファクタリング | 30分 | 1.5時間 |
| Phase 3: Veo実装 | 1.5時間 | 3時間 |
| Phase 4: 統合・テスト | 1時間 | 4時間 |
| **合計** | **約4時間** | - |

---

## 10. 参考リンク

- [Gemini API Video Generation Docs](https://ai.google.dev/gemini-api/docs/video)
- [Veo 3.1 Announcement](https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/)
- [Veo 3 Fast & Image-to-Video](https://developers.googleblog.com/en/veo-3-fast-image-to-video-capabilities-now-available-gemini-api/)
- [Runway API Documentation](https://docs.dev.runwayml.com/api)
