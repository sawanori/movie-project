# HLS 実装ロードマップ

## 概要

このドキュメントは `hls-adaptive-streaming-implementation.md` の実装計画に基づき、実装の順序と依存関係を明確にしたロードマップです。

---

## 実装フェーズ概要

```
Phase 1: DB準備 ──→ Phase 2: インフラ準備 ──→ Phase 3: Backend ──→ Phase 4: Frontend ──→ Phase 5: 統合テスト
   │                      │                        │                      │
   │                      │                        │                      │
   └── MCP Migration      └── R2 CORS (手動)       ├── hls_service.py    ├── npm install hls.js
                                                   ├── video_processor   ├── hls-player.tsx
                                                   └── schemas.py        ├── quality-selector.tsx
                                                                         ├── client.ts 型追加
                                                                         └── 既存ページ更新
```

---

## Phase 1: データベース準備

### Task 1.1: Supabase マイグレーション実行

**方法**: `mcp__supabase__apply_migration` を使用

**SQL**:
```sql
-- Migration: add_hls_streaming_columns
ALTER TABLE video_generations ADD COLUMN IF NOT EXISTS hls_master_url TEXT;
ALTER TABLE storyboards ADD COLUMN IF NOT EXISTS hls_master_url TEXT;
ALTER TABLE storyboard_scenes ADD COLUMN IF NOT EXISTS hls_master_url TEXT;
ALTER TABLE video_concatenations ADD COLUMN IF NOT EXISTS hls_master_url TEXT;
ALTER TABLE user_videos ADD COLUMN IF NOT EXISTS hls_master_url TEXT;

COMMENT ON COLUMN video_generations.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN storyboards.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN storyboard_scenes.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN video_concatenations.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
COMMENT ON COLUMN user_videos.hls_master_url IS 'HLS master playlist URL for adaptive streaming';
```

**依存**: なし
**所要時間**: 1分

---

## Phase 2: インフラ準備

### Task 2.1: R2 CORS 設定

**方法**: Cloudflare Dashboard で手動設定

**手順**:
1. https://dash.cloudflare.com/ → R2 → バケット選択 → Settings
2. CORS Policy に以下を追加:

```json
[
  {
    "AllowedOrigins": [
      "https://movie-maker-frontend.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range"],
    "MaxAgeSeconds": 86400
  }
]
```

**依存**: なし
**所要時間**: 5分

---

## Phase 3: Backend 実装

### Task 3.1: HLS サービス作成

**ファイル**: `movie-maker-api/app/services/hls_service.py` (新規)

**内容**:
- `HLSConfig` クラス
- `HLSConversionError` 例外クラス
- `convert_to_hls()` 関数
- `_generate_master_playlist()` 関数
- `_upload_file_to_r2_sync()` ヘルパー関数
- `upload_hls_to_r2()` 関数

**依存**: Phase 1 完了
**所要時間**: 15分

---

### Task 3.2: Video Processor 修正

**ファイル**: `movie-maker-api/app/tasks/video_processor.py` (修正)

**追加内容**:
- `process_hls_conversion()` 関数追加
- インポート追加: `os`, `tempfile`, `logging`, `httpx`
- `app.services.hls_service` からのインポート

**依存**: Task 3.1 完了
**所要時間**: 10分

---

### Task 3.3: スキーマ更新

**ファイル**: `movie-maker-api/app/videos/schemas.py` (修正)

**追加内容**:
- `VideoResponse` に `hls_master_url: str | None = None`
- `StoryboardSceneResponse` に `hls_master_url: str | None = None`
- `StoryboardResponse` に `hls_master_url: str | None = None`
- `ConcatVideoResponse` に `hls_master_url: str | None = None`
- `UserVideoResponse` に `hls_master_url: str | None = None`

**依存**: Phase 1 完了
**所要時間**: 5分

---

### Task 3.4: Backend ビルド確認

**コマンド**:
```bash
cd movie-maker-api && python -c "from app.main import app; print('OK')"
```

**依存**: Task 3.1, 3.2, 3.3 完了
**所要時間**: 1分

---

## Phase 4: Frontend 実装

### Task 4.1: hls.js インストール

**コマンド**:
```bash
cd movie-maker && npm install hls.js
```

**依存**: なし（並列実行可能）
**所要時間**: 1分

---

### Task 4.2: HLSPlayer コンポーネント作成

**ファイル**: `movie-maker/components/video/hls-player.tsx` (新規)

**内容**:
- `HLSPlayerProps` インターフェース
- `HLSPlayer` コンポーネント
- Safari/iOS ネイティブ HLS 対応
- hls.js フォールバック
- MP4 フォールバック
- エラーハンドリング

**依存**: Task 4.1 完了
**所要時間**: 15分

---

### Task 4.3: QualitySelector コンポーネント作成（オプション）

**ファイル**: `movie-maker/components/video/quality-selector.tsx` (新規)

**内容**:
- `QualitySelectorProps` インターフェース
- `QualityLevel` インターフェース
- `QualitySelector` コンポーネント
- イベントリスナーのクリーンアップ

**依存**: Task 4.1 完了
**所要時間**: 10分（スキップ可能）

---

### Task 4.4: API Client 型更新

**ファイル**: `movie-maker/lib/api/client.ts` (修正)

**追加内容**:
- `Video` 型に `hls_master_url?: string | null`
- `StoryboardScene` 型に `hls_master_url?: string | null`
- `Storyboard` 型に `hls_master_url?: string | null`
- `UserVideo` 型に `hls_master_url?: string | null`

**依存**: なし
**所要時間**: 5分

---

### Task 4.5: 既存ページの更新

**ファイル（優先順）**:
1. `movie-maker/app/generate/[id]/page.tsx`
2. `movie-maker/app/generate/storyboard/page.tsx`
3. `movie-maker/app/history/page.tsx`
4. `movie-maker/app/dashboard/page.tsx`

**変更内容**:
- `<video>` タグを `<HLSPlayer>` に置き換え
- `hlsUrl` と `fallbackUrl` プロパティを設定

**依存**: Task 4.2, 4.4 完了
**所要時間**: 20分

---

### Task 4.6: Frontend ビルド確認

**コマンド**:
```bash
cd movie-maker && npm run build
```

**依存**: Task 4.1〜4.5 完了
**所要時間**: 2分

---

## Phase 5: 統合テスト

### Task 5.1: 手動テスト

**テスト項目**:
- [ ] 新規動画生成 → HLS 変換完了確認
- [ ] HLS 再生確認（Chrome）
- [ ] HLS 再生確認（Safari/iOS）
- [ ] フォールバック確認（HLS URL なし）
- [ ] 低速回線エミュレーション → 品質切替確認
- [ ] CORS エラーなし確認

**依存**: Phase 3, 4 完了
**所要時間**: 30分

---

## 実装順序まとめ

| 順序 | タスク | 並列可能 |
|------|--------|----------|
| 1 | Task 1.1: DB マイグレーション | - |
| 2 | Task 2.1: R2 CORS 設定 | Phase 1 と並列可 |
| 3 | Task 3.1: hls_service.py | - |
| 4 | Task 3.2: video_processor.py | Task 3.1 後 |
| 5 | Task 3.3: schemas.py | Phase 1 後、3.1/3.2 と並列可 |
| 6 | Task 3.4: Backend ビルド確認 | Task 3.1〜3.3 後 |
| 7 | Task 4.1: npm install hls.js | Phase 3 と並列可 |
| 8 | Task 4.2: hls-player.tsx | Task 4.1 後 |
| 9 | Task 4.3: quality-selector.tsx | Task 4.1 後（オプション） |
| 10 | Task 4.4: client.ts 型更新 | Phase 3 と並列可 |
| 11 | Task 4.5: 既存ページ更新 | Task 4.2, 4.4 後 |
| 12 | Task 4.6: Frontend ビルド確認 | Task 4.1〜4.5 後 |
| 13 | Task 5.1: 統合テスト | Phase 3, 4 完了後 |

---

## コード配置マップ

```
movie-maker-api/
├── app/
│   ├── services/
│   │   └── hls_service.py          ← 新規作成
│   ├── tasks/
│   │   └── video_processor.py      ← 修正（process_hls_conversion 追加）
│   └── videos/
│       └── schemas.py              ← 修正（hls_master_url 追加）

movie-maker/
├── components/
│   └── video/
│       ├── hls-player.tsx          ← 新規作成
│       └── quality-selector.tsx    ← 新規作成（オプション）
├── lib/
│   └── api/
│       └── client.ts               ← 修正（型追加）
└── app/
    ├── generate/
    │   ├── [id]/page.tsx           ← 修正（HLSPlayer 使用）
    │   └── storyboard/page.tsx     ← 修正（HLSPlayer 使用）
    ├── history/page.tsx            ← 修正（HLSPlayer 使用）
    └── dashboard/page.tsx          ← 修正（HLSPlayer 使用）
```

---

## 注意事項

1. **R2 CORS 設定は手動** - MCP では設定不可、Cloudflare Dashboard で実施
2. **HLS 変換は非同期** - 動画生成完了後にバックグラウンドで実行
3. **フォールバック必須** - HLS 未対応/未変換時は MP4 で再生
4. **既存動画への影響なし** - 新規動画からHLS対応、既存はMP4のまま
