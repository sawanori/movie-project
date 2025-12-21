# movie-maker 開発計画書

**作成日:** 2025年12月21日
**ステータス:** 要件定義完了

---

## 1. 確定した技術スタック

| カテゴリ | 選択 | 備考 |
|:---|:---|:---|
| **フロントエンド** | Next.js 16 + React 19 + TypeScript | App Router 使用 |
| **スタイリング** | Tailwind CSS v4 + shadcn/ui | モダンなUIコンポーネント |
| **バックエンド** | FastAPI (Python) | フロントと分離構成 |
| **データベース** | Supabase (PostgreSQL) | 無料プランからスタート |
| **認証** | Supabase Auth | Google OAuth のみ |
| **ストレージ** | Cloudflare R2 | 画像・動画の保存 |
| **決済** | Polar | サブスクリプション管理 |
| **動画生成AI** | KlingAI API | Image-to-Video |
| **プロンプト最適化** | OpenAI API (GPT-4) | プロンプト拡張 |
| **動画後処理** | FFmpeg | テキスト・BGM合成 |
| **デプロイ (Frontend)** | Vercel | 自動デプロイ |
| **デプロイ (Backend)** | Railway | FastAPI ホスティング |

---

## 2. システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザー                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Vercel)                             │
│                    Next.js 16 + shadcn/ui                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  認証    │  │ 動画生成 │  │  履歴    │  │  課金    │        │
│  │ページ   │  │ ページ   │  │ ページ   │  │ ページ   │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
           │                          │
           │ Supabase Auth            │ REST API
           ▼                          ▼
┌──────────────────┐    ┌─────────────────────────────────────────┐
│   Supabase       │    │           Backend (Railway)              │
│  ┌────────────┐  │    │              FastAPI                     │
│  │ Auth       │  │    │  ┌───────────────────────────────────┐  │
│  │ (Google)   │  │    │  │         API Endpoints             │  │
│  └────────────┘  │    │  │  /generate  /templates  /history  │  │
│  ┌────────────┐  │    │  └───────────────────────────────────┘  │
│  │ PostgreSQL │◄─┼────┼──►  ┌─────────┐  ┌─────────┐           │
│  │ Database   │  │    │     │ OpenAI  │  │ KlingAI │           │
│  └────────────┘  │    │     │   API   │  │   API   │           │
└──────────────────┘    │     └─────────┘  └─────────┘           │
                        │            │            │               │
                        │            ▼            ▼               │
                        │     ┌─────────────────────────┐         │
                        │     │       FFmpeg            │         │
                        │     │  (テキスト・BGM合成)    │         │
                        │     └─────────────────────────┘         │
                        └─────────────────────────────────────────┘
                                         │
                                         ▼
                        ┌─────────────────────────────────────────┐
                        │           Cloudflare R2                  │
                        │    (画像・動画ストレージ)                │
                        └─────────────────────────────────────────┘
```

---

## 3. データベース設計

### 3.1 テーブル一覧

```sql
-- ユーザーテーブル（Supabase Auth と連携）
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  display_name TEXT,
  plan_type TEXT DEFAULT 'free', -- 'free', 'starter', 'pro', 'business'
  subscription_id TEXT,          -- Polar subscription ID
  video_count_this_month INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- テンプレートテーブル
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,    -- プロンプトのテンプレート文
  style_keywords TEXT[],            -- スタイルキーワード配列
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 動画生成リクエストテーブル
CREATE TABLE video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id),

  -- 入力データ
  original_image_url TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  optimized_prompt TEXT,            -- OpenAI で最適化後

  -- テキストオーバーレイ設定
  overlay_text TEXT,
  overlay_position TEXT DEFAULT 'bottom', -- 'top', 'center', 'bottom'
  overlay_font TEXT DEFAULT 'default',
  overlay_color TEXT DEFAULT '#FFFFFF',

  -- BGM設定
  bgm_track_id UUID REFERENCES bgm_tracks(id),

  -- 生成状態
  status TEXT DEFAULT 'pending',    -- 'pending', 'processing', 'completed', 'failed'
  progress INT DEFAULT 0,           -- 0-100
  error_message TEXT,

  -- 出力データ
  raw_video_url TEXT,               -- KlingAI からの生の動画
  final_video_url TEXT,             -- FFmpeg 処理後の最終動画

  -- メタデータ
  expires_at TIMESTAMPTZ,           -- 7日後に設定
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BGM トラックテーブル
CREATE TABLE bgm_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  duration_seconds INT,
  mood TEXT,                        -- 'upbeat', 'calm', 'dramatic' など
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 使用履歴テーブル（課金計算用）
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_generation_id UUID REFERENCES video_generations(id),
  action_type TEXT NOT NULL,        -- 'video_generated', 'video_downloaded'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Row Level Security (RLS)

```sql
-- users テーブル: 自分のデータのみアクセス可能
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- video_generations テーブル: 自分のデータのみアクセス可能
ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own videos" ON video_generations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own videos" ON video_generations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

---

## 4. API エンドポイント設計

### 4.1 Backend API (FastAPI)

**Base URL:** `https://api.movie-maker.app/v1`

#### 認証
すべてのエンドポイントは Supabase JWT トークンで認証

```
Authorization: Bearer <supabase_access_token>
```

#### エンドポイント一覧

| Method | Endpoint | 説明 |
|:---|:---|:---|
| GET | `/health` | ヘルスチェック |
| GET | `/templates` | テンプレート一覧取得 |
| GET | `/templates/{id}` | テンプレート詳細取得 |
| POST | `/generate` | 動画生成リクエスト |
| GET | `/generate/{id}` | 生成状態確認 |
| GET | `/generate/{id}/status` | 生成進捗取得（ポーリング用） |
| GET | `/history` | 生成履歴一覧 |
| DELETE | `/history/{id}` | 履歴削除 |
| GET | `/bgm` | BGMトラック一覧 |
| GET | `/user/usage` | 今月の使用状況 |
| POST | `/webhook/polar` | Polar Webhook 受信 |

### 4.2 API 詳細

#### POST /generate - 動画生成リクエスト

**Request:**
```json
{
  "template_id": "uuid",           // 任意
  "image_url": "string",           // R2にアップロード済みの画像URL
  "prompt": "string",              // ユーザー入力プロンプト
  "overlay": {                     // 任意
    "text": "string",
    "position": "top|center|bottom",
    "font": "string",
    "color": "#FFFFFF"
  },
  "bgm_track_id": "uuid"           // 任意
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "pending",
  "estimated_time_seconds": 60,
  "created_at": "2025-12-21T10:00:00Z"
}
```

#### GET /generate/{id}/status - 生成進捗取得

**Response:**
```json
{
  "id": "uuid",
  "status": "processing",
  "progress": 45,
  "message": "動画を生成中...",
  "video_url": null
}
```

**完了時:**
```json
{
  "id": "uuid",
  "status": "completed",
  "progress": 100,
  "message": "完了しました",
  "video_url": "https://r2.example.com/videos/xxx.mp4",
  "expires_at": "2025-12-28T10:00:00Z"
}
```

---

## 5. フロントエンド画面設計

### 5.1 ページ構成

```
/                       # ランディングページ（未認証）
/login                  # ログインページ（Google OAuth）
/dashboard              # ダッシュボード（認証後のホーム）
/generate               # 動画生成ページ（メイン機能）
/generate/[id]          # 生成進捗・結果表示ページ
/history                # 生成履歴一覧
/pricing                # 料金プラン
/settings               # ユーザー設定
```

### 5.2 主要コンポーネント

```
components/
├── layout/
│   ├── Header.tsx           # ナビゲーションヘッダー
│   ├── Sidebar.tsx          # サイドバー（ダッシュボード用）
│   └── Footer.tsx           # フッター
├── auth/
│   └── GoogleLoginButton.tsx
├── generate/
│   ├── ImageUploader.tsx    # 画像アップロード
│   ├── TemplateSelector.tsx # テンプレート選択
│   ├── PromptInput.tsx      # プロンプト入力
│   ├── TextOverlayEditor.tsx # テキスト設定
│   ├── BGMSelector.tsx      # BGM選択
│   ├── GenerateButton.tsx   # 生成開始ボタン
│   └── ProgressDisplay.tsx  # 進捗表示
├── video/
│   ├── VideoPlayer.tsx      # 動画プレイヤー
│   └── DownloadButton.tsx   # ダウンロードボタン
├── history/
│   └── HistoryCard.tsx      # 履歴カード
└── ui/                      # shadcn/ui コンポーネント
```

---

## 6. MVP 機能仕様

### 6.1 ユーザーフロー

```
1. ランディングページ訪問
   ↓
2. Google OAuth でログイン
   ↓
3. ダッシュボードへリダイレクト
   ↓
4. 「動画を作成」ボタンをクリック
   ↓
5. 画像をアップロード（ドラッグ&ドロップ対応）
   ↓
6. テンプレートを選択（3〜5種類から）
   ↓
7. プロンプトを入力
   ↓
8. テキストオーバーレイを設定（任意）
   ↓
9. BGMを選択（任意、3〜5曲から）
   ↓
10. 「生成開始」ボタンをクリック
    ↓
11. リアルタイム進捗表示画面へ遷移
    ↓
12. 完了後、動画プレビュー + ダウンロード
```

### 6.2 テンプレート（MVP: 5種類）

| # | テンプレート名 | 用途 | プロンプトキーワード |
|:--|:---|:---|:---|
| 1 | 商品紹介 | ECサイト向け商品動画 | cinematic, product showcase, elegant, professional |
| 2 | SNS向け | TikTok/Instagram用 | dynamic, eye-catching, trendy, social media style |
| 3 | ビジネス | プレゼン・広告用 | corporate, clean, modern, business presentation |
| 4 | ライフスタイル | 日常・ブログ向け | warm, lifestyle, natural, cozy atmosphere |
| 5 | ドラマチック | インパクト重視 | dramatic, epic, cinematic lighting, powerful |

### 6.3 BGM（MVP: 5曲）

| # | 曲名 | ムード | 用途例 |
|:--|:---|:---|:---|
| 1 | Upbeat Energy | アップビート | 商品紹介、SNS |
| 2 | Corporate Success | ビジネス | プレゼン、広告 |
| 3 | Gentle Acoustic | 穏やか | ライフスタイル |
| 4 | Epic Cinematic | ドラマチック | インパクト動画 |
| 5 | Modern Pop | ポップ | 汎用 |

※ 著作権フリー音源（Pixabay Audio, Mixkit 等）から選定

### 6.4 テキストオーバーレイ設定

**位置オプション:**
- 上部 (top)
- 中央 (center)
- 下部 (bottom) ※デフォルト

**フォントオプション（MVP: 3種類）:**
- Noto Sans JP（デフォルト）
- Noto Serif JP
- M PLUS Rounded 1c

**カラーオプション:**
- 白 (#FFFFFF) ※デフォルト
- 黒 (#000000)
- カスタムカラー（カラーピッカー）

---

## 7. 課金プラン（MVP）

### 7.1 プラン構成

| プラン | 月額 | 動画生成数 | 機能 |
|:---|:---|:---|:---|
| **Free Trial** | ¥0 | 3本まで（7日間） | 基本機能のみ |
| **Starter** | ¥980 | 5本/月 | 全テンプレート、BGM、テキストオーバーレイ |

※ Pro / Business プランは Phase 2 以降

### 7.2 Polar 統合

- Webhook で subscription 状態を同期
- `users.plan_type` を更新
- 月次リセットで `video_count_this_month` を 0 に

---

## 8. 開発タスク（Phase 1: MVP）

### 8.1 インフラ・環境構築

- [ ] Supabase プロジェクト作成
- [ ] Supabase Auth (Google OAuth) 設定
- [ ] Cloudflare R2 バケット作成
- [ ] Railway プロジェクト作成
- [ ] 環境変数設定（本番/開発）
- [ ] データベーステーブル作成・RLS設定

### 8.2 バックエンド（FastAPI）

- [ ] プロジェクト初期化（Poetry / uv）
- [ ] Supabase 認証ミドルウェア実装
- [ ] `/health` エンドポイント
- [ ] `/templates` CRUD
- [ ] `/bgm` 一覧取得
- [ ] `/generate` 動画生成リクエスト
- [ ] KlingAI API 統合
- [ ] OpenAI API プロンプト最適化
- [ ] FFmpeg テキストオーバーレイ処理
- [ ] FFmpeg BGM 合成処理
- [ ] Cloudflare R2 アップロード/ダウンロード
- [ ] 生成進捗管理（ステータス更新）
- [ ] `/history` 履歴管理
- [ ] `/webhook/polar` 決済 Webhook
- [ ] エラーハンドリング・ログ

### 8.3 フロントエンド（Next.js）

- [ ] shadcn/ui 初期設定
- [ ] 共通レイアウト（Header, Sidebar）
- [ ] ランディングページ
- [ ] Google OAuth ログイン実装
- [ ] ダッシュボードページ
- [ ] 動画生成ページ
  - [ ] 画像アップローダー（R2 直接アップロード）
  - [ ] テンプレート選択UI
  - [ ] プロンプト入力フォーム
  - [ ] テキストオーバーレイエディター
  - [ ] BGM セレクター
  - [ ] 生成ボタン・バリデーション
- [ ] 進捗表示ページ（ポーリング or SSE）
- [ ] 動画プレビュー・ダウンロード
- [ ] 履歴一覧ページ
- [ ] 料金プランページ
- [ ] Polar 決済連携
- [ ] ユーザー設定ページ
- [ ] レスポンシブ対応
- [ ] ローディング・エラー状態

### 8.4 コンテンツ準備

- [ ] テンプレート 5種類のプロンプト設計
- [ ] 著作権フリーBGM 5曲の選定・アップロード
- [ ] 日本語フォントファイル準備（FFmpeg用）

### 8.5 テスト・デプロイ

- [ ] E2E テスト（動画生成フロー）
- [ ] Vercel デプロイ設定
- [ ] Railway デプロイ設定
- [ ] 本番環境での動作確認
- [ ] ドメイン設定

---

## 9. 非機能要件

### 9.1 セキュリティ

- すべての API 通信は HTTPS
- Supabase RLS による行レベルセキュリティ
- API レート制限（1分間に10リクエストまで）
- R2 署名付きURLによるアクセス制御

### 9.2 パフォーマンス

- 画像アップロード: 最大 10MB
- 動画生成時間: 最大 2分（タイムアウト）
- 進捗ポーリング間隔: 3秒

### 9.3 信頼性

- KlingAI API エラー時のリトライ（最大3回）
- 生成失敗時のユーザー通知
- エラーログの記録（Sentry 推奨）

### 9.4 データ保持

- 生成動画: 7日間で自動削除
- 履歴メタデータ: 30日間保持
- ユーザーデータ: 退会後30日で削除

---

## 10. リスクと対策

| リスク | 影響 | 対策 |
|:---|:---|:---|
| KlingAI API障害 | 動画生成不可 | エラー通知、ステータスページ設置 |
| KlingAI トライアル枠超過 | 新規生成不可 | 有料プランへの早期移行判断 |
| R2 ストレージコスト増 | コスト増加 | 7日間自動削除の厳守 |
| FFmpeg 処理の負荷 | 遅延 | Railway のスケールアップ |
| 不正利用（大量生成） | リソース枯渇 | レート制限、月間上限の厳守 |

---

## 11. 次のステップ

この計画書に基づき、以下の順序で開発を進めます：

1. **Week 1:** インフラ構築 + データベース設計
2. **Week 2-3:** バックエンド API 実装
3. **Week 4-5:** フロントエンド実装
4. **Week 6:** 統合テスト + デプロイ

開発を開始する準備が整いました。

---

**更新履歴:**
- 2025-12-21: 初版作成
