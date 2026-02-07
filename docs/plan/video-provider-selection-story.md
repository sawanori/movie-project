# シーン動画生成 API選択機能 実装計画書

## 概要

シーン動画生成（1シーンのみ）において、動画生成APIプロバイダー（Runway/Veo）を選択できる機能を追加する。

- **現状**: Runway API固定
- **目標**: Runway / Veo を選択可能（ストーリーボード機能と同様）

## 工数見積もり

| 作業内容 | 工数 | 難易度 |
|---------|------|--------|
| バックエンド: スキーマ修正（video_provider追加） | 0.5h | 低 |
| バックエンド: ルーター修正（受け取り・保存） | 0.5h | 低 |
| バックエンド: video_processor.py修正（プロバイダー切替） | 1h | 中 |
| フロントエンド: APIクライアント修正 | 0.5h | 低 |
| フロントエンド: プロバイダー選択UI追加 | 0.5h | 低 |
| テスト・動作確認 | 0.5h | - |
| **合計** | **3-3.5時間** | **低〜中** |

## 現状分析

### 既に対応済みのコンポーネント（ストーリーボード用）

| ファイル | 状況 |
|---------|------|
| `app/external/video_provider.py` | ✅ VideoProviderInterface定義済み |
| `app/external/runway_provider.py` | ✅ RunwayProvider実装済み |
| `app/external/veo_provider.py` | ✅ VeoProvider実装済み |
| `app/videos/schemas.py` | ✅ `VideoProvider` Enum定義済み |

### 修正が必要なコンポーネント

| ファイル | 現状 | 修正内容 |
|---------|------|----------|
| `app/videos/schemas.py` | `StoryVideoCreate`に`video_provider`なし | フィールド追加 |
| `app/videos/router.py` | `/story`エンドポイントでプロバイダー固定 | パラメータ受け取り・DB保存 |
| `app/tasks/video_processor.py` | `runway_client`を直接使用 | `get_video_provider()`使用に変更 |
| `movie-maker/lib/api/client.ts` | `createStoryVideo`に`video_provider`なし | パラメータ追加 |
| `movie-maker/app/generate/story/page.tsx` | プロバイダー選択UIなし | 選択UI追加 |

## 実装詳細

### Phase 1: バックエンドAPI修正

#### 1.1 スキーマ修正 (`app/videos/schemas.py`)

```python
# StoryVideoCreate に追加（既存のVideoProvider Enumを再利用）
class StoryVideoCreate(BaseModel):
    image_url: str
    story_text: str
    aspect_ratio: AspectRatio = AspectRatio.PORTRAIT
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー（未指定時は環境変数で決定）")
    # ... 既存フィールド

# StoryVideoResponse に追加
class StoryVideoResponse(BaseModel):
    # ... 既存フィールド
    video_provider: str | None = None
```

#### 1.2 ルーター修正 (`app/videos/router.py`)

`create_story_video` エンドポイントで:
- `video_provider` を受け取る
- 未指定時は環境変数 `VIDEO_PROVIDER` を使用
- DBの `video_generations` テーブルに保存
- バックグラウンドタスクに渡す

```python
# video_providerの決定
video_provider = request.video_provider.value if request.video_provider else settings.VIDEO_PROVIDER.lower()

# video_dataに追加
video_data = {
    # ... 既存フィールド
    "video_provider": video_provider,
}

# バックグラウンドタスクに渡す
background_tasks.add_task(start_story_processing, video_id, video_provider)
```

#### 1.3 タスクプロセッサ修正 (`app/tasks/video_processor.py`)

現状: `runway_client` を直接インポートして使用
変更後: `get_video_provider()` を使用してプロバイダーを動的に取得

```python
# Before
from app.external.runway_client import (
    generate_video_single,
    check_video_status_single,
    download_video,
)

runway_task_id = await generate_video_single(...)

# After
from app.external.video_provider import get_video_provider

async def process_video_generation(video_id: str, video_provider: str = None) -> None:
    # プロバイダーを取得
    provider = get_video_provider(video_provider)

    # プロバイダーのインターフェースを使用
    task_id = await provider.generate_video(
        image_url=image_url,
        prompt=prompt,
        duration=5,
        aspect_ratio=aspect_ratio,
        camera_work=camera_work,
    )

    # ステータスチェック
    status = await provider.check_status(task_id)

    # ダウンロード
    video_bytes = await provider.download_video_bytes(task_id)
```

#### 1.4 タスク起動関数修正 (`app/tasks/__init__.py`)

```python
# Before
def start_story_processing(video_id: str):
    asyncio.run(process_video_generation(video_id))

# After
def start_story_processing(video_id: str, video_provider: str = None):
    asyncio.run(process_video_generation(video_id, video_provider))
```

### Phase 2: フロントエンド修正

#### 2.1 APIクライアント修正 (`lib/api/client.ts`)

```typescript
createStoryVideo: (data: {
  image_url: string;
  story_text: string;
  aspect_ratio?: '9:16' | '16:9';
  video_provider?: 'runway' | 'veo';  // 追加
  bgm_track_id?: string;
  // ... 既存フィールド
}) => fetchWithAuth("/api/v1/videos/story", { method: "POST", body: JSON.stringify(data) }),
```

#### 2.2 UI追加 (`app/generate/story/page.tsx`)

**ステップ3（オプション設定、動画生成直前）** にプロバイダー選択UIを追加:

```
┌─────────────────────────────────────┐
│  3. オプション設定                   │
│                                     │
│  [選択した画像とストーリーのプレビュー]│
│                                     │
│  動画生成エンジン:                   │
│  ┌─────────────┐  ┌─────────────┐   │
│  │ ✓ Runway    │  │   Veo       │   │
│  │  (推奨)     │  │  (高品質)   │   │
│  └─────────────┘  └─────────────┘   │
│                                     │
│  BGM（任意）: ...                   │
│  テキストオーバーレイ: ...          │
│  フィルムグレイン: ...              │
│  LUT: ...                           │
│  カメラワーク: ...                  │
│                                     │
│  [生成内容の確認]                   │
│  ・ストーリー: xxx                  │
│  ・アスペクト比: 縦長 (9:16)        │
│  ・動画生成エンジン: Runway         │  ← 追加
│  ・BGM: なし                        │
│  ...                                │
│                                     │
│  [← 戻る]        [動画を生成 →]     │
└─────────────────────────────────────┘
```

```tsx
// State追加
const [videoProvider, setVideoProvider] = useState<'runway' | 'veo'>('runway');

// APIリクエスト修正
const videoRes = await videosApi.createStoryVideo({
  // ... 既存フィールド
  video_provider: videoProvider,
});
```

## テスト項目

### 機能テスト

- [ ] Runwayで動画生成できること
- [ ] Veoで動画生成できること
- [ ] デフォルトはRunwayになること（環境変数設定に依存）
- [ ] 選択したプロバイダーがDBに保存されること

### UIテスト

- [ ] プロバイダー選択UIが表示されること
- [ ] 選択状態が正しく反映されること
- [ ] サマリーに選択したプロバイダーが表示されること

## 注意事項

1. **後方互換性**: `video_provider`が指定されない場合は環境変数`VIDEO_PROVIDER`の値を使用
2. **プロバイダー差異**: Runway/Veoでカメラワークのサポート状況が異なる場合がある
3. **料金**: プロバイダーによって料金が異なる可能性がある（将来的にUI上で注意喚起）

## ファイル変更一覧

### バックエンド

| ファイル | 変更内容 |
|---------|----------|
| `app/videos/schemas.py` | `StoryVideoCreate`/`StoryVideoResponse`に`video_provider`追加 |
| `app/videos/router.py` | `/story`エンドポイントで`video_provider`受け取り・保存 |
| `app/tasks/__init__.py` | `start_story_processing`に`video_provider`引数追加 |
| `app/tasks/video_processor.py` | `get_video_provider()`使用に変更 |

### フロントエンド

| ファイル | 変更内容 |
|---------|----------|
| `lib/api/client.ts` | `createStoryVideo`に`video_provider`追加 |
| `app/generate/story/page.tsx` | プロバイダー選択UI追加 |

### データベース

| テーブル | 変更内容 |
|---------|----------|
| `video_generations` | `video_provider`カラムは既存（NULLで保存されていたものにRUNWAY/VEOが入る） |

## 実装順序

1. バックエンドスキーマ修正
2. ルーター修正（受け取り・保存）
3. タスクプロセッサ修正（プロバイダー切替）
4. フロントエンドAPIクライアント修正
5. フロントエンドUI追加
6. テスト・動作確認

---

作成日: 2025-12-27
