# アスペクト比選択機能 実装計画書

## 概要

シーン動画生成（1シーンのみ）において、画像アップロード後にアスペクト比を選択できる機能を追加する。

- **現状**: 縦長（9:16）固定
- **目標**: 縦長（9:16）/ 横長（16:9）を選択可能

## 工数見積もり

| 作業内容 | 工数 | 難易度 |
|---------|------|--------|
| フロントエンド: アスペクト比選択UI追加 | 1-1.5h | 低 |
| バックエンドAPI: schemas/router修正 | 1h | 低 |
| Kling APIのハードコード修正 | 0.5h | 低 |
| storyboard/video processorの修正 | 1h | 低 |
| テスト・動作確認 | 0.5h | - |
| **合計** | **4-5時間** | **中** |

## 現状分析

### 既に対応済みのコンポーネント

| ファイル | 状況 |
|---------|------|
| `app/external/video_provider.py` | ✅ `aspect_ratio`パラメータ定義済み |
| `app/external/runway_provider.py` | ✅ `aspect_ratio`対応済み、変換メソッドあり |
| `app/external/veo_provider.py` | ✅ `aspect_ratio`対応済み |
| `app/external/gemini_client.py` | ✅ `aspect_ratio`対応済み |

### 修正が必要なコンポーネント（ハードコード箇所）

| ファイル | 現状 | 修正内容 |
|---------|------|----------|
| `app/external/kling.py` | `"aspect_ratio": "9:16"` 固定 | パラメータ化 |
| `app/tasks/storyboard_processor.py` | `aspect_ratio="9:16"` 固定 | パラメータ化 |
| `app/tasks/video_processor.py` | `ratio="720:1280"` 固定 | パラメータ化 |

## 実装詳細

### Phase 1: バックエンドAPI修正

#### 1.1 スキーマ修正 (`app/videos/schemas.py`)

```python
from enum import Enum

class AspectRatio(str, Enum):
    PORTRAIT = "9:16"   # 縦長（デフォルト）
    LANDSCAPE = "16:9"  # 横長

# StoryVideoCreateRequest に追加
class StoryVideoCreateRequest(BaseModel):
    image_url: str
    story_text: str
    aspect_ratio: AspectRatio = AspectRatio.PORTRAIT  # 追加
    # ... 既存フィールド
```

#### 1.2 ルーター修正 (`app/videos/router.py`)

- `create_story_video` エンドポイントで `aspect_ratio` を受け取る
- DBに保存（`video_generations` テーブル）
- バックグラウンドタスクに渡す

#### 1.3 DBマイグレーション（オプション）

`video_generations` テーブルに `aspect_ratio` カラムを追加:

```sql
ALTER TABLE video_generations
ADD COLUMN aspect_ratio VARCHAR(10) DEFAULT '9:16';
```

### Phase 2: 動画生成プロセッサ修正

#### 2.1 video_processor.py 修正

```python
# Before
ratio="720:1280"  # ハードコード

# After
aspect_ratio = video_data.get("aspect_ratio", "9:16")
ratio = "720:1280" if aspect_ratio == "9:16" else "1280:720"
```

#### 2.2 kling.py 修正

```python
# Before
"aspect_ratio": "9:16"  # ハードコード

# After
"aspect_ratio": aspect_ratio  # パラメータから取得
```

#### 2.3 storyboard_processor.py 修正

```python
# Before
aspect_ratio="9:16"  # ハードコード

# After
aspect_ratio=storyboard_data.get("aspect_ratio", "9:16")
```

### Phase 3: フロントエンド修正

#### 3.1 UI追加箇所

`movie-maker/app/generate/story/page.tsx` のステップ1（画像アップロード後）

#### 3.2 UI設計

```
┌─────────────────────────────────────┐
│  1. 画像をアップロード              │
│                                     │
│  [画像プレビュー]                   │
│                                     │
│  アスペクト比を選択:                │
│  ┌─────────┐  ┌─────────┐          │
│  │ ▢ 縦長  │  │ ▢ 横長  │          │
│  │  9:16   │  │  16:9   │          │
│  │ (推奨)  │  │         │          │
│  └─────────┘  └─────────┘          │
│                                     │
│              [次へ →]               │
└─────────────────────────────────────┘
```

#### 3.3 コード変更

```tsx
// State追加
const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");

// APIリクエスト修正
const videoRes = await videosApi.createStoryVideo({
  image_url: imageUrl,
  story_text: storyText,
  aspect_ratio: aspectRatio,  // 追加
  // ...
});
```

#### 3.4 APIクライアント修正 (`lib/api/client.ts`)

```typescript
createStoryVideo: (data: {
  image_url: string;
  story_text: string;
  aspect_ratio?: "9:16" | "16:9";  // 追加
  // ...
}) => ...
```

## テスト項目

### 機能テスト

- [ ] 縦長（9:16）で動画生成できること
- [ ] 横長（16:9）で動画生成できること
- [ ] デフォルトは縦長になること
- [ ] 各プロバイダー（Kling, Runway, Veo）で正しく動作すること

### UIテスト

- [ ] アスペクト比選択UIが表示されること
- [ ] 選択状態が正しく反映されること
- [ ] 選択したアスペクト比がAPIに送信されること

## 注意事項

1. **後方互換性**: `aspect_ratio`が指定されない場合は従来通り`9:16`をデフォルトとする
2. **プレビュー表示**: 画像プレビューのアスペクト比も選択に応じて変更する
3. **ストーリーボード**: 今回はシーン動画（1シーン）のみ対応。ストーリーボード機能への拡張は別タスク

## ファイル変更一覧

### バックエンド

| ファイル | 変更内容 |
|---------|----------|
| `app/videos/schemas.py` | `AspectRatio` Enum追加、リクエストスキーマ修正 |
| `app/videos/router.py` | `aspect_ratio`パラメータ受け取り・保存 |
| `app/videos/service.py` | `aspect_ratio`をDB保存に追加 |
| `app/tasks/video_processor.py` | ハードコード解除、パラメータ化 |
| `app/tasks/storyboard_processor.py` | ハードコード解除、パラメータ化 |
| `app/external/kling.py` | ハードコード解除、パラメータ化 |

### フロントエンド

| ファイル | 変更内容 |
|---------|----------|
| `app/generate/story/page.tsx` | アスペクト比選択UI追加 |
| `lib/api/client.ts` | `aspect_ratio`パラメータ追加 |

### データベース（オプション）

| テーブル | 変更内容 |
|---------|----------|
| `video_generations` | `aspect_ratio`カラム追加 |
| `storyboards` | `aspect_ratio`カラム追加（将来拡張用） |

## 実装順序

1. バックエンドスキーマ・ルーター修正
2. DBマイグレーション（必要な場合）
3. 動画生成プロセッサ修正
4. フロントエンドUI追加
5. テスト・動作確認

---

作成日: 2025-12-27
