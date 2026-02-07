1枚の写真から「起承転結」の20秒動画を生成する、次世代AI動画アプリケーションの完全仕様書。

現状の動画生成機能を”シーン生成”機能として残し、新たに”ストーリー生成”機能を追加する。

---

## 1. Concept: ディレクターズ・モード
単なる5秒の動画生成を、4つのシーン（5秒×4）に分割・制御することで、ストーリー性のある20秒のショートフィルムへと昇華させる。

### 特徴
- **AIストーリーテリング**: Claude 3.5が1枚の画像から「起・承・転・結」を立案。
- **一貫性の保持**: シーン間の被写体やトーンのズレをAIプロンプトで高度に制御。
- **監督体験（UX）**: ユーザーが生成前に4つのシーンをプレビュー・修正できる。
- **スマート・リミックス**: 4本の動画をシームレスに結合し、BGMを付与。

---

## 2. Step 1: Logic (Claude 3.5 プロンプト設計)
Claude 3.5を映画監督として機能させ、Runway Gen-3に最適化されたJSONを出力させる。

### System Prompt
あなたは世界最高峰の映画監督兼Runway APIプロンプトエンジニアです。
ユーザーの画像を解析し、20秒間（5秒×4シーン）の構成案を作成してください。

#### 出力ルール
- **一貫性**: 1枚目の画像の特徴（服、光、背景）を全シーンに記述し、被写体の変化を最小化する。
- **物理表現**: "fluttering", "collision", "cinematic lighting" 等、Runwayが好む具体的動詞・名詞を使用。
- **カメラワーク**: 起(静止/Zoom In)、承(追従/Tracking)、転(衝撃/Dynamic)、結(余韻/Zoom Out)の緩急をつける。

---

## 3. Step 2: UI/UX (ストーリーボード・インターフェース)
ユーザーが「制作の主導権」を握るための画面設計。

- **4-Card Layout**: 画面上に「起・承・転・結」の4枚のカードを表示。
- **ディレクション機能**: Claudeの提案した日本語解説を読み、ユーザーが「ここはもっと激しく」「スローで」等の微調整を入力できる。
- **プロダクション演出**: 4本並列生成中、画面に「Scene 2: Shooting...」「Analyzing Physics...」等のステータスを表示し、待ち時間をエンターテインメント化する。

---

## 4. Step 3: Backend (Runway API & Stitching)
技術的制約を克服し、20秒を一本に繋ぐ実装ロジック。

- **Parallel API Control**: 4つのシーンを同時にRunway APIへリクエスト（並列処理）。
- **Polling System**: 各 `task_id` の進捗を監視し、全動画の生成完了を待機。
- **Smart Stitching (FFmpeg)**:
    - 4本のMP4を結合。
    - **0.5s Cross-dissolve**: 継ぎ目に微細なフェードを入れ、AI特有の「パッ」という断絶感を解消。
- **Audio Overlay**: ストーリーの盛り上がりに合わせてBGMとSEを自動合成。

---

## 5. Step 4: Assets (リミックス機能の高度活用)
すでに実装済みのリミックス機能を、編集の最終工程として位置づける。

- **セグメント・リテイク**: 20秒のうち「転」だけを再生成し、既存の3本と即座に差し替え（リミックス）できる柔軟性。
- **ライブラリ化**: 生成した個別の5秒素材を資産化し、後から別の20秒動画に組み込む「リミックス・ライブラリ」機能。

---

## 6. 機能の棲み分け

### 2つの生成モード

| モード | 説明 | 出力 | ユースケース |
|--------|------|------|--------------|
| **シーン生成** | 現行機能。1枚の画像から5秒動画を1本生成 | 5秒動画 | サクッと1シーン作りたい、素材収集 |
| **ストーリー生成** | 新機能。1枚の画像から起承転結4シーンを生成・結合 | 20秒動画 | 本格的なショートフィルム制作 |

### ダッシュボードUI

```
┌─────────────────────────────────────────────────────────────────┐
│  Header                                                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ 📹 シーン生成 │  │ 🎬 ストーリー生成 │  │ 🔗 動画を結合    │   │
│  └──────────────┘  └──────────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  最近の動画                                                       │
│  ┌─────┐ ┌─────┐ ┌─────┐                                        │
│  │ 5秒 │ │ 20秒│ │ 5秒 │  ← シーン/ストーリー混在表示            │
│  └─────┘ └─────┘ └─────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

### ルーティング

| パス | 機能 |
|------|------|
| `/generate/story` | シーン生成（現行、名前変更なし） |
| `/generate/storyboard` | ストーリー生成（新規） |
| `/concat` | 動画結合（既存） |

> **Note**: 現行の `/generate/story` は内部的に「シーン生成」として位置づけるが、URLは変更しない（既存ユーザーへの影響回避）

---

## 7. 実装スケジュール

### 前提条件
- 既存の動画生成機能（シーン生成）はそのまま維持
- 既存のRunway API連携を拡張
- 既存のconcat機能を活用
- Gemini APIを4シーンプロンプト生成に転用

---

### Phase 1: AIストーリーボード生成（バックエンド）

**目標**: 1枚の画像から「起承転結」4シーンのプロンプトをJSON形式で生成

#### タスク

| # | タスク | 詳細 | ファイル |
|---|--------|------|----------|
| 1-1 | Geminiプロンプト設計 | 4シーン構成を出力するシステムプロンプト作成 | `app/external/gemini_client.py` |
| 1-2 | スキーマ定義 | `StoryboardScene`、`StoryboardResponse` | `app/videos/schemas.py` |
| 1-3 | APIエンドポイント | `POST /api/v1/videos/generate-storyboard` | `app/videos/router.py` |
| 1-4 | DBスキーマ拡張 | `storyboard_scenes` テーブル追加（4シーン保存用） | Supabase Migration |

#### 出力JSON例
```json
{
  "title": "朝の出発",
  "scenes": [
    {
      "scene_number": 1,
      "act": "起",
      "description_ja": "窓から差し込む柔らかい朝日。女性がコーヒーカップを手に取る。",
      "runway_prompt": "A woman gently picks up a coffee cup, soft morning light streaming through window, warm cinematic tones, slow zoom in, 5 seconds",
      "camera_work": "slow_zoom_in",
      "mood": "calm"
    },
    // ... scenes 2-4
  ]
}
```

---

### Phase 2: ストーリーボードUI（フロントエンド）

**目標**: 4シーンをカード形式でプレビュー・編集できるUI

#### タスク

| # | タスク | 詳細 | ファイル |
|---|--------|------|----------|
| 2-1 | ストーリーボードページ | `/generate/storyboard/[id]` ルート作成 | `app/generate/storyboard/[id]/page.tsx` |
| 2-2 | 4カードレイアウト | 起承転結を横並びで表示、ドラッグで順序変更可 | `components/storyboard/scene-card.tsx` |
| 2-3 | シーン編集モーダル | 日本語説明・プロンプトを直接編集 | `components/storyboard/edit-modal.tsx` |
| 2-4 | API連携 | storyboard生成・更新・削除 | `lib/api/client.ts` |

#### UI構成
```
┌─────────────────────────────────────────────────────┐
│  📸 アップロード画像                                   │
├─────────┬─────────┬─────────┬─────────┤
│   起    │   承    │   転    │   結    │
│ Scene 1 │ Scene 2 │ Scene 3 │ Scene 4 │
│ ✏️ 編集 │ ✏️ 編集 │ ✏️ 編集 │ ✏️ 編集 │
├─────────┴─────────┴─────────┴─────────┤
│        [ 🎬 すべて生成する ]                          │
└─────────────────────────────────────────────────────┘
```

---

### Phase 3: 4シーン並列生成（バックエンド）

**目標**: 4シーンを並列でRunway APIにリクエストし、完了後に自動結合

#### タスク

| # | タスク | 詳細 | ファイル |
|---|--------|------|----------|
| 3-1 | 並列生成タスク | 4つのRunwayリクエストを`asyncio.gather`で実行 | `app/tasks/storyboard_processor.py` |
| 3-2 | 進捗管理 | 各シーンのステータスを個別追跡（0-100%） | `app/videos/service.py` |
| 3-3 | 自動結合 | 4本完了後にFFmpeg concatを自動実行 | `app/tasks/storyboard_processor.py` |
| 3-4 | エラーハンドリング | 1シーン失敗時のリトライ・部分成功対応 | 同上 |

#### 処理フロー
```
[ストーリーボード確定]
        ↓
[4シーン並列生成開始]
    ├── Scene 1: Runway API → polling → 完了
    ├── Scene 2: Runway API → polling → 完了
    ├── Scene 3: Runway API → polling → 完了
    └── Scene 4: Runway API → polling → 完了
        ↓
[全シーン完了を待機]
        ↓
[FFmpeg concat + BGM付与]
        ↓
[20秒動画をR2にアップロード]
        ↓
[完了通知]
```

---

### Phase 4: 生成中UX演出（フロントエンド）

**目標**: 待機時間をエンターテインメント化

#### タスク

| # | タスク | 詳細 | ファイル |
|---|--------|------|----------|
| 4-1 | 生成進捗画面 | 4シーンの進捗をリアルタイム表示 | `app/generate/storyboard/[id]/progress.tsx` |
| 4-2 | プロダクション演出 | 「Scene 2: Analyzing Physics...」等のステータス | `components/storyboard/progress-card.tsx` |
| 4-3 | 完了プレビュー | 各シーン完了時にサムネイル表示 | 同上 |
| 4-4 | 最終プレビュー | 20秒動画の再生 + ダウンロード | `components/video/player.tsx` |

---

### Phase 5: セグメント・リテイク機能

**目標**: 特定シーンだけを再生成し、既存動画と差し替え

#### タスク

| # | タスク | 詳細 | ファイル |
|---|--------|------|----------|
| 5-1 | リテイクAPI | `POST /api/v1/storyboard/{id}/scenes/{scene_number}/regenerate` | `app/videos/router.py` |
| 5-2 | 差し替え結合 | 指定シーンのみ再生成 → 既存3本と再結合 | `app/tasks/storyboard_processor.py` |
| 5-3 | リテイクUI | 各シーンカードに「🔄 再生成」ボタン | `components/storyboard/scene-card.tsx` |

---

### DBスキーマ追加（Migration）

```sql
-- ストーリーボード管理テーブル
CREATE TABLE storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_image_url TEXT NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'draft', -- draft, generating, completed, failed
  final_video_url TEXT,
  bgm_track_id UUID REFERENCES bgm_tracks(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 各シーン管理テーブル
CREATE TABLE storyboard_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storyboard_id UUID NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL CHECK (scene_number BETWEEN 1 AND 4),
  act TEXT NOT NULL, -- 起, 承, 転, 結
  description_ja TEXT,
  runway_prompt TEXT NOT NULL,
  camera_work TEXT,
  mood TEXT,
  status TEXT DEFAULT 'pending', -- pending, generating, completed, failed
  video_url TEXT,
  runway_task_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(storyboard_id, scene_number)
);

-- インデックス
CREATE INDEX idx_storyboards_user_id ON storyboards(user_id);
CREATE INDEX idx_storyboard_scenes_storyboard_id ON storyboard_scenes(storyboard_id);
```

---

### 実装優先度まとめ

| Phase | 内容 | 重要度 | 依存関係 |
|-------|------|--------|----------|
| **Phase 1** | AIストーリーボード生成 | 🔴 必須 | なし |
| **Phase 2** | ストーリーボードUI | 🔴 必須 | Phase 1 |
| **Phase 3** | 4シーン並列生成 | 🔴 必須 | Phase 1, 2 |
| **Phase 4** | 生成中UX演出 | 🟡 推奨 | Phase 3 |
| **Phase 5** | セグメント・リテイク | 🟢 追加 | Phase 3 |

---

### 技術的な注意点

1. **APIコスト管理**
   - 4シーン生成 = Runway API 4回分
   - ユーザーの月間制限を `videos_limit × 4` で計算するか要検討

2. **タイムアウト対策**
   - 4並列生成は最大2-3分かかる
   - WebSocketでリアルタイム進捗通知を検討

3. **一貫性の限界**
   - AIは被写体を完全に維持できない
   - プロンプトに「same woman from scene 1」等を含めることで緩和

4. **フォールバック**
   - 1シーン失敗時: そのシーンのみリトライ
   - 全シーン失敗時: 従来の5秒生成へフォールバック

---
