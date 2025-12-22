# movie-maker 開発ワークブック

**作成日:** 2025年12月21日
**目的:** 複数の生成AI（Claude / Gemini）間で作業を分担するための詳細タスク定義書

---

## 運用ルール

### チケット管理

1. **担当者の記録**: 作業開始時に `担当` 欄に `Claude` または `Gemini` を記入
2. **ステータス更新**: 作業完了時に `ステータス` を `完了` に変更し、完了日を記録
3. **依存関係の確認**: `前提条件` に記載されたチケットが完了していることを確認してから着手
4. **成果物の確認**: `完了条件` をすべて満たしていることを確認してから完了とする

### ステータス定義

| ステータス | 意味 |
|:---|:---|
| 未着手 | 作業開始前 |
| 進行中 | 作業中 |
| レビュー待ち | 作業完了、確認待ち |
| 完了 | すべて完了 |
| ブロック | 依存関係や問題で停止中 |

### ブランチ命名規則

```
feature/{チケットID}-{簡潔な説明}
例: feature/BE-001-fastapi-setup
```

---

## チケット一覧サマリー

| カテゴリ | チケット数 | 説明 |
|:---|:---|:---|
| INFRA | 6 | インフラ・環境構築 |
| BE | 15 | バックエンド（FastAPI） |
| FE | 18 | フロントエンド（Next.js） |
| CONT | 3 | コンテンツ準備 |
| TEST | 4 | テスト・デプロイ |
| **合計** | **46** | |

---

# INFRA: インフラ・環境構築

---

## INFRA-001: Supabase プロジェクト作成

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | Claude |
| **優先度** | P0（最優先） |
| **前提条件** | なし |
| **推定作業時間** | 30分 |

### 概要
Supabaseでプロジェクトを新規作成し、データベースと認証の基盤を構築する。

### 詳細手順

1. **Supabase アカウント確認**
   - https://supabase.com/ にアクセス
   - アカウントがない場合は新規作成（GitHub連携推奨）

2. **プロジェクト作成**
   - ダッシュボードで「New Project」をクリック
   - 以下の設定で作成：
     - **Name**: `movie-maker`
     - **Database Password**: 強力なパスワードを生成（必ず控える）
     - **Region**: `Northeast Asia (Tokyo)` を選択
     - **Pricing Plan**: `Free` を選択

3. **API キーの取得**
   - プロジェクト作成完了後、Settings > API に移動
   - 以下の値を控える：
     - `Project URL`: `https://xxxxx.supabase.co`
     - `anon public`: 公開キー
     - `service_role`: サービスキー（バックエンド用、秘密）

4. **接続情報の記録**
   - Settings > Database に移動
   - 以下を控える：
     - `Host`: `db.xxxxx.supabase.co`
     - `Database name`: `postgres`
     - `Port`: `5432`
     - `User`: `postgres`
     - `Password`: 作成時に設定したもの

### 成果物

以下の情報を `docs/credentials.md`（gitignore対象）に記録：

```markdown
# Supabase Credentials (CONFIDENTIAL)

## Project Info
- Project URL: https://xxxxx.supabase.co
- Region: Northeast Asia (Tokyo)

## API Keys
- anon (public): eyJxxxxxx...
- service_role (secret): eyJxxxxxx...

## Database
- Host: db.xxxxx.supabase.co
- Port: 5432
- Database: postgres
- User: postgres
- Password: xxxxxxxxxx
```

### 完了条件

- [ ] Supabase プロジェクトが作成されている
- [ ] Project URL が発行されている
- [ ] anon key と service_role key が取得できている
- [ ] Database 接続情報が取得できている
- [ ] `docs/credentials.md` に情報が記録されている
- [ ] `.gitignore` に `docs/credentials.md` が追加されている

---

## INFRA-002: Supabase Auth (Google OAuth) 設定

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | Claude |
| **優先度** | P0（最優先） |
| **前提条件** | INFRA-001 |
| **推定作業時間** | 45分 |

### 概要
Google OAuth を使用したログイン機能を Supabase Auth で設定する。

### 詳細手順

1. **Google Cloud Console でOAuth設定**

   a. https://console.cloud.google.com/ にアクセス

   b. プロジェクト作成（または既存を使用）
      - プロジェクト名: `movie-maker`

   c. 「APIとサービス」>「OAuth同意画面」に移動
      - User Type: `外部` を選択
      - アプリ名: `movie-maker`
      - ユーザーサポートメール: 自分のメールアドレス
      - デベロッパー連絡先: 自分のメールアドレス
      - スコープ: `email`, `profile`, `openid` を追加

   d. 「認証情報」>「認証情報を作成」>「OAuthクライアントID」
      - アプリケーションの種類: `ウェブアプリケーション`
      - 名前: `movie-maker-web`
      - 承認済みのJavaScript生成元:
        - `http://localhost:3000`（開発用）
        - `https://movie-maker.vercel.app`（本番用、後で追加可）
      - 承認済みのリダイレクトURI:
        - `https://xxxxx.supabase.co/auth/v1/callback`
        （xxxxxは INFRA-001 で取得した Project URL のサブドメイン）

   e. クライアントIDとクライアントシークレットを控える

2. **Supabase で Google Provider 設定**

   a. Supabase ダッシュボード > Authentication > Providers に移動

   b. 「Google」を探してクリック

   c. 以下を入力：
      - **Google Enabled**: ON
      - **Client ID**: Google Cloud で取得した値
      - **Client Secret**: Google Cloud で取得した値

   d. 「Save」をクリック

3. **リダイレクトURL設定**

   a. Authentication > URL Configuration に移動

   b. 以下を設定：
      - **Site URL**: `http://localhost:3000`（開発中）
      - **Redirect URLs**:
        - `http://localhost:3000/auth/callback`
        - `https://movie-maker.vercel.app/auth/callback`（本番用）

### 成果物

`docs/credentials.md` に追記：

```markdown
## Google OAuth
- Client ID: xxxxx.apps.googleusercontent.com
- Client Secret: GOCSPX-xxxxxx
```

### 完了条件

- [ ] Google Cloud Console でOAuthクライアントが作成されている
- [ ] Supabase で Google Provider が有効化されている
- [ ] Client ID と Client Secret が Supabase に設定されている
- [ ] Redirect URLs が正しく設定されている
- [ ] `docs/credentials.md` に Google OAuth 情報が追記されている

---

## INFRA-003: Cloudflare R2 バケット作成

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | なし |
| **推定作業時間** | 30分 |

### 概要
画像と動画を保存するための Cloudflare R2 ストレージを設定する。

### 詳細手順

1. **Cloudflare アカウント確認**
   - https://dash.cloudflare.com/ にアクセス
   - アカウントがない場合は新規作成

2. **R2 有効化**
   - 左メニューから「R2」を選択
   - 初回の場合は有効化手続きを行う（クレジットカード登録が必要だが、無料枠あり）

3. **バケット作成**

   a. 「Create bucket」をクリック

   b. **Bucket name**: `movie-maker-storage`

   c. **Location**: `Asia Pacific` を選択

   d. 「Create bucket」をクリック

4. **CORS 設定**

   a. 作成したバケットをクリック

   b. 「Settings」タブに移動

   c. 「CORS Policy」セクションで「Edit CORS policy」をクリック

   d. 以下のJSONを入力：

   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:3000",
         "https://movie-maker.vercel.app"
       ],
       "AllowedMethods": [
         "GET",
         "PUT",
         "POST",
         "DELETE",
         "HEAD"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "ExposeHeaders": [
         "ETag"
       ],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. **API トークン作成**

   a. 右上のプロフィール > 「My Profile」> 「API Tokens」に移動

   b. 「Create Token」をクリック

   c. 「Create Custom Token」を選択

   d. 以下を設定：
      - **Token name**: `movie-maker-r2-access`
      - **Permissions**:
        - Account > Cloudflare R2 > Edit
      - **Account Resources**:
        - Include > 自分のアカウント

   e. 「Continue to summary」>「Create Token」

   f. 表示されたトークンを控える（一度しか表示されない）

6. **アカウントID確認**
   - R2の概要ページで「Account ID」を控える

### 成果物

`docs/credentials.md` に追記：

```markdown
## Cloudflare R2
- Account ID: xxxxxxxxxx
- Bucket Name: movie-maker-storage
- API Token: xxxxxxxxxx
- Endpoint: https://xxxxxxxxxx.r2.cloudflarestorage.com
```

### 完了条件

- [ ] R2 が有効化されている
- [ ] `movie-maker-storage` バケットが作成されている
- [ ] CORS ポリシーが設定されている
- [ ] API トークンが作成されている
- [ ] `docs/credentials.md` に R2 情報が追記されている

---

## INFRA-004: Supabase データベーステーブル作成

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | Claude |
| **優先度** | P0（最優先） |
| **前提条件** | INFRA-001 |
| **推定作業時間** | 45分 |

### 概要
plan.md で定義したデータベーススキーマを Supabase に作成する。

### 詳細手順

1. **Supabase SQL Editor を開く**
   - Supabase ダッシュボード > SQL Editor に移動

2. **テーブル作成SQLを実行**

   以下のSQLを順番に実行する：

   ```sql
   -- ========================================
   -- 1. BGM トラックテーブル（先に作成、参照されるため）
   -- ========================================
   CREATE TABLE bgm_tracks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     description TEXT,
     file_url TEXT NOT NULL,
     duration_seconds INT,
     mood TEXT,
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- コメント追加
   COMMENT ON TABLE bgm_tracks IS 'BGM トラック管理テーブル';
   COMMENT ON COLUMN bgm_tracks.mood IS 'upbeat, calm, dramatic, pop など';
   ```

   ```sql
   -- ========================================
   -- 2. テンプレートテーブル
   -- ========================================
   CREATE TABLE templates (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     description TEXT,
     prompt_template TEXT NOT NULL,
     style_keywords TEXT[],
     thumbnail_url TEXT,
     is_active BOOLEAN DEFAULT true,
     sort_order INT DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- コメント追加
   COMMENT ON TABLE templates IS '動画生成テンプレート管理テーブル';
   COMMENT ON COLUMN templates.prompt_template IS 'KlingAI に送るプロンプトのテンプレート';
   COMMENT ON COLUMN templates.style_keywords IS 'スタイルキーワードの配列';
   ```

   ```sql
   -- ========================================
   -- 3. ユーザーテーブル
   -- ========================================
   CREATE TABLE users (
     id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     email TEXT NOT NULL,
     display_name TEXT,
     plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'pro', 'business')),
     subscription_id TEXT,
     video_count_this_month INT DEFAULT 0,
     trial_videos_remaining INT DEFAULT 3,
     trial_expires_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- コメント追加
   COMMENT ON TABLE users IS 'ユーザー情報テーブル（Supabase Auth と連携）';
   COMMENT ON COLUMN users.plan_type IS 'free, starter, pro, business のいずれか';
   COMMENT ON COLUMN users.trial_videos_remaining IS '無料トライアルの残り生成数';

   -- 更新日時自動更新トリガー
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ language 'plpgsql';

   CREATE TRIGGER update_users_updated_at
     BEFORE UPDATE ON users
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();
   ```

   ```sql
   -- ========================================
   -- 4. 動画生成リクエストテーブル
   -- ========================================
   CREATE TABLE video_generations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     template_id UUID REFERENCES templates(id),

     -- 入力データ
     original_image_url TEXT NOT NULL,
     user_prompt TEXT NOT NULL,
     optimized_prompt TEXT,

     -- テキストオーバーレイ設定
     overlay_text TEXT,
     overlay_position TEXT DEFAULT 'bottom' CHECK (overlay_position IN ('top', 'center', 'bottom')),
     overlay_font TEXT DEFAULT 'NotoSansJP',
     overlay_color TEXT DEFAULT '#FFFFFF',

     -- BGM設定
     bgm_track_id UUID REFERENCES bgm_tracks(id),

     -- 生成状態
     status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
     progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
     error_message TEXT,

     -- KlingAI 関連
     kling_task_id TEXT,

     -- 出力データ
     raw_video_url TEXT,
     final_video_url TEXT,

     -- メタデータ
     expires_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- コメント追加
   COMMENT ON TABLE video_generations IS '動画生成リクエスト管理テーブル';
   COMMENT ON COLUMN video_generations.status IS 'pending, processing, completed, failed のいずれか';
   COMMENT ON COLUMN video_generations.kling_task_id IS 'KlingAI API から返されるタスクID';

   -- インデックス作成
   CREATE INDEX idx_video_generations_user_id ON video_generations(user_id);
   CREATE INDEX idx_video_generations_status ON video_generations(status);
   CREATE INDEX idx_video_generations_created_at ON video_generations(created_at DESC);

   -- 更新日時自動更新トリガー
   CREATE TRIGGER update_video_generations_updated_at
     BEFORE UPDATE ON video_generations
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();
   ```

   ```sql
   -- ========================================
   -- 5. 使用履歴テーブル
   -- ========================================
   CREATE TABLE usage_logs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     video_generation_id UUID REFERENCES video_generations(id) ON DELETE SET NULL,
     action_type TEXT NOT NULL CHECK (action_type IN ('video_generated', 'video_downloaded', 'video_deleted')),
     metadata JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- コメント追加
   COMMENT ON TABLE usage_logs IS '使用履歴テーブル（課金計算・分析用）';

   -- インデックス作成
   CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
   CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at DESC);
   ```

3. **Row Level Security (RLS) 設定**

   ```sql
   -- ========================================
   -- RLS 有効化とポリシー設定
   -- ========================================

   -- users テーブル
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own data"
     ON users FOR SELECT
     USING (auth.uid() = id);

   CREATE POLICY "Users can update own data"
     ON users FOR UPDATE
     USING (auth.uid() = id);

   -- video_generations テーブル
   ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own videos"
     ON video_generations FOR SELECT
     USING (auth.uid() = user_id);

   CREATE POLICY "Users can insert own videos"
     ON video_generations FOR INSERT
     WITH CHECK (auth.uid() = user_id);

   CREATE POLICY "Users can update own videos"
     ON video_generations FOR UPDATE
     USING (auth.uid() = user_id);

   CREATE POLICY "Users can delete own videos"
     ON video_generations FOR DELETE
     USING (auth.uid() = user_id);

   -- usage_logs テーブル
   ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view own logs"
     ON usage_logs FOR SELECT
     USING (auth.uid() = user_id);

   -- templates テーブル（全員が閲覧可能）
   ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Anyone can view active templates"
     ON templates FOR SELECT
     USING (is_active = true);

   -- bgm_tracks テーブル（全員が閲覧可能）
   ALTER TABLE bgm_tracks ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Anyone can view active bgm tracks"
     ON bgm_tracks FOR SELECT
     USING (is_active = true);
   ```

4. **ユーザー作成時の自動レコード作成**

   ```sql
   -- ========================================
   -- 新規ユーザー作成時に users テーブルにレコードを自動作成
   -- ========================================
   CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS TRIGGER AS $$
   BEGIN
     INSERT INTO public.users (id, email, display_name, trial_expires_at)
     VALUES (
       NEW.id,
       NEW.email,
       COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
       NOW() + INTERVAL '7 days'
     );
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```

### 完了条件

- [ ] `bgm_tracks` テーブルが作成されている
- [ ] `templates` テーブルが作成されている
- [ ] `users` テーブルが作成されている
- [ ] `video_generations` テーブルが作成されている
- [ ] `usage_logs` テーブルが作成されている
- [ ] すべてのテーブルで RLS が有効化されている
- [ ] すべてのポリシーが作成されている
- [ ] `handle_new_user` トリガーが作成されている
- [ ] Supabase Table Editor でテーブルが確認できる

---

## INFRA-005: Railway プロジェクト作成

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | なし |
| **推定作業時間** | 20分 |

### 概要
FastAPI バックエンドをホスティングする Railway プロジェクトを作成する。

### 詳細手順

1. **Railway アカウント確認**
   - https://railway.app/ にアクセス
   - GitHub アカウントでログイン（推奨）

2. **プロジェクト作成**
   - 「New Project」をクリック
   - 「Empty Project」を選択
   - プロジェクト名: `movie-maker-api`

3. **サービス追加（後でデプロイ時に使用）**
   - 今は空のプロジェクトのみ作成
   - バックエンドコード完成後に GitHub リポジトリを接続

4. **環境変数の準備**
   - Settings > Variables に以下を設定予定（BE-001 完了後）：
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY`
     - `KLING_API_KEY`
     - `OPENAI_API_KEY`
     - `R2_ACCOUNT_ID`
     - `R2_ACCESS_KEY`
     - `R2_SECRET_KEY`
     - `R2_BUCKET_NAME`

### 成果物

`docs/credentials.md` に追記：

```markdown
## Railway
- Project Name: movie-maker-api
- Project URL: https://movie-maker-api.up.railway.app（デプロイ後に確定）
```

### 完了条件

- [ ] Railway プロジェクトが作成されている
- [ ] プロジェクト名が `movie-maker-api` である
- [ ] `docs/credentials.md` に Railway 情報が追記されている

---

## INFRA-006: 環境変数設定ファイル作成

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | Claude |
| **優先度** | P0（最優先） |
| **前提条件** | INFRA-001, INFRA-002, INFRA-003 |
| **推定作業時間** | 15分 |

### 概要
フロントエンド用の環境変数ファイルを作成する。

### 詳細手順

1. **`.env.local` ファイル作成**

   プロジェクトルートに `.env.local` を作成：

   ```bash
   # ファイルパス: /movie-maker/.env.local
   ```

   内容：

   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxx...

   # Backend API
   NEXT_PUBLIC_API_URL=http://localhost:8000

   # Cloudflare R2 (公開用)
   NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
   ```

2. **`.env.example` ファイル作成**

   プロジェクトルートに `.env.example` を作成（Git にコミット用）：

   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

   # Backend API
   NEXT_PUBLIC_API_URL=http://localhost:8000

   # Cloudflare R2 (公開用)
   NEXT_PUBLIC_R2_PUBLIC_URL=your_r2_public_url
   ```

3. **`.gitignore` 確認**

   `.gitignore` に以下が含まれていることを確認：

   ```
   .env.local
   .env*.local
   docs/credentials.md
   ```

### 成果物

- `/movie-maker/.env.local`（gitignore対象）
- `/movie-maker/.env.example`（コミット対象）

### 完了条件

- [ ] `.env.local` が作成されている
- [ ] `.env.example` が作成されている
- [ ] `.gitignore` に `.env.local` が含まれている
- [ ] 実際の値が `.env.local` に設定されている

---

# BE: バックエンド（FastAPI）

---

## BE-001: FastAPI プロジェクト初期化

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 完了 |
| **担当** | Gemini |
| **優先度** | P0（最優先） |
| **前提条件** | なし |
| **推定作業時間** | 30分 |

### 概要
FastAPI バックエンドプロジェクトを **別リポジトリ** として新規作成し、基本構造を構築する。

> **重要**: バックエンドは `movie-maker-api` という別リポジトリとして管理します。
> フロントエンド（movie-maker）とは独立したリポジトリです。

### 詳細手順

1. **バックエンド用リポジトリ作成**

   ```bash
   # movie-maker と同じ階層に新しいディレクトリを作成
   cd /Users/noritakasawada/AI_P/practice
   mkdir movie-maker-api
   cd movie-maker-api

   # Git初期化
   git init
   ```

   GitHubで `movie-maker-api` リポジトリを作成後：
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/movie-maker-api.git
   ```

2. **Python 仮想環境作成**

   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```

3. **依存パッケージインストール**

   `requirements.txt` を作成（リポジトリルート）：

   ```txt
   # Web Framework
   fastapi==0.115.6
   uvicorn[standard]==0.34.0

   # Database
   supabase==2.11.0

   # External APIs
   openai==1.58.1
   httpx==0.28.1

   # Cloudflare R2 (S3互換)
   boto3==1.35.86

   # Video Processing
   ffmpeg-python==0.2.0

   # Utilities
   python-dotenv==1.0.1
   python-multipart==0.0.20
   pydantic==2.10.4
   pydantic-settings==2.7.0

   # CORS
   starlette==0.45.2
   ```

   インストール：

   ```bash
   pip install -r requirements.txt
   ```

4. **ディレクトリ構造作成**

   ```
   movie-maker-api/
   ├── app/
   │   ├── __init__.py
   │   ├── main.py              # FastAPI アプリケーションエントリーポイント
   │   ├── config.py            # 設定管理
   │   ├── dependencies.py      # 依存性注入
   │   ├── api/
   │   │   ├── __init__.py
   │   │   └── v1/
   │   │       ├── __init__.py
   │   │       ├── router.py    # ルーター集約
   │   │       ├── health.py    # ヘルスチェック
   │   │       ├── templates.py # テンプレートAPI
   │   │       ├── generate.py  # 動画生成API
   │   │       ├── history.py   # 履歴API
   │   │       ├── bgm.py       # BGM API
   │   │       ├── user.py      # ユーザーAPI
   │   │       └── webhooks.py  # Webhook API
   │   ├── services/
   │   │   ├── __init__.py
   │   │   ├── supabase.py      # Supabase クライアント
   │   │   ├── kling.py         # KlingAI API
   │   │   ├── openai.py        # OpenAI API
   │   │   ├── r2.py            # Cloudflare R2
   │   │   └── ffmpeg.py        # FFmpeg 処理
   │   ├── models/
   │   │   ├── __init__.py
   │   │   └── schemas.py       # Pydantic スキーマ
   │   └── utils/
   │       ├── __init__.py
   │       └── auth.py          # 認証ユーティリティ
   ├── tests/
   │   └── __init__.py
   ├── .env                     # 環境変数（gitignore）
   ├── .env.example             # 環境変数サンプル
   ├── requirements.txt
   ├── Dockerfile
   └── .gitignore
   ```

5. **基本ファイル作成**

   `app/__init__.py`:
   ```python
   # Empty file
   ```

   `app/config.py`:
   ```python
   from pydantic_settings import BaseSettings
   from functools import lru_cache


   class Settings(BaseSettings):
       # Supabase
       supabase_url: str
       supabase_service_key: str

       # KlingAI
       kling_api_key: str
       kling_api_base_url: str = "https://api.klingai.com"

       # OpenAI
       openai_api_key: str

       # Cloudflare R2
       r2_account_id: str
       r2_access_key: str
       r2_secret_key: str
       r2_bucket_name: str
       r2_public_url: str

       # App
       environment: str = "development"
       api_v1_prefix: str = "/api/v1"

       class Config:
           env_file = ".env"
           case_sensitive = False


   @lru_cache
   def get_settings() -> Settings:
       return Settings()
   ```

   `app/main.py`:
   ```python
   from fastapi import FastAPI
   from fastapi.middleware.cors import CORSMiddleware
   from app.config import get_settings
   from app.api.v1.router import api_router

   settings = get_settings()

   app = FastAPI(
       title="movie-maker API",
       description="AI動画生成サービスのバックエンドAPI",
       version="1.0.0",
   )

   # CORS設定
   app.add_middleware(
       CORSMiddleware,
       allow_origins=[
           "http://localhost:3000",
           "https://movie-maker.vercel.app",
       ],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )

   # ルーター登録
   app.include_router(api_router, prefix=settings.api_v1_prefix)


   @app.get("/")
   async def root():
       return {"message": "movie-maker API", "version": "1.0.0"}
   ```

   `app/api/__init__.py`:
   ```python
   # Empty file
   ```

   `app/api/v1/__init__.py`:
   ```python
   # Empty file
   ```

   `app/api/v1/router.py`:
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   # 他のルーターは各チケットで追加
   ```

   `app/api/v1/health.py`:
   ```python
   from fastapi import APIRouter

   router = APIRouter()


   @router.get("/health")
   async def health_check():
       return {
           "status": "healthy",
           "service": "movie-maker-api",
       }
   ```

6. **環境変数ファイル作成**

   `.env.example`:
   ```env
   # Supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key

   # KlingAI
   KLING_API_KEY=your_kling_api_key

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key

   # Cloudflare R2
   R2_ACCOUNT_ID=your_r2_account_id
   R2_ACCESS_KEY=your_r2_access_key
   R2_SECRET_KEY=your_r2_secret_key
   R2_BUCKET_NAME=movie-maker-storage
   R2_PUBLIC_URL=your_r2_public_url

   # App
   ENVIRONMENT=development
   ```

   `.env`（実際の値を設定、gitignore対象）

7. **Dockerfile 作成**

   `Dockerfile`:
   ```dockerfile
   FROM python:3.11-slim

   # FFmpeg インストール
   RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

   WORKDIR /app

   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY . .

   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

8. **gitignore 作成**

   `.gitignore`:
   ```
   __pycache__/
   *.py[cod]
   venv/
   .env
   .env.local
   *.log
   .pytest_cache/
   ```

9. **動作確認**

   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

   ブラウザで http://localhost:8000 にアクセスし、以下が表示されることを確認：
   ```json
   {"message": "movie-maker API", "version": "1.0.0"}
   ```

   http://localhost:8000/api/v1/health で：
   ```json
   {"status": "healthy", "service": "movie-maker-api"}
   ```

### 成果物

```
movie-maker-api/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py
│   │       └── health.py
│   ├── services/
│   │   └── __init__.py
│   ├── models/
│   │   └── __init__.py
│   └── utils/
│       └── __init__.py
├── tests/
│   └── __init__.py
├── .env.example
├── requirements.txt
├── Dockerfile
└── .gitignore
```

### 完了条件

- [ ] `movie-maker-api` リポジトリが作成されている
- [ ] 上記のディレクトリ構造が作成されている
- [ ] `requirements.txt` に必要なパッケージが記載されている
- [ ] `uvicorn app.main:app --reload` でサーバーが起動する
- [ ] `/` エンドポイントが正常にレスポンスを返す
- [ ] `/api/v1/health` エンドポイントが正常にレスポンスを返す
- [ ] `Dockerfile` が作成されている

---

## BE-002: Supabase クライアント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | BE-001, INFRA-001 |
| **推定作業時間** | 30分 |

### 概要
Supabase との接続を管理するクライアントサービスを実装する。

### 詳細手順

1. **Supabase クライアント実装**

   `app/services/supabase.py`:
   ```python
   from supabase import create_client, Client
   from app.config import get_settings
   from functools import lru_cache

   settings = get_settings()


   @lru_cache
   def get_supabase_client() -> Client:
       """
       Supabase クライアントを取得する（シングルトン）
       service_role キーを使用するため、RLS をバイパスできる
       """
       return create_client(
           settings.supabase_url,
           settings.supabase_service_key
       )


   class SupabaseService:
       def __init__(self):
           self.client = get_supabase_client()

       # ========================================
       # Users
       # ========================================

       async def get_user_by_id(self, user_id: str) -> dict | None:
           """ユーザーIDでユーザー情報を取得"""
           response = self.client.table("users").select("*").eq("id", user_id).single().execute()
           return response.data

       async def update_user(self, user_id: str, data: dict) -> dict:
           """ユーザー情報を更新"""
           response = self.client.table("users").update(data).eq("id", user_id).execute()
           return response.data[0] if response.data else None

       async def increment_video_count(self, user_id: str) -> dict:
           """今月の動画生成数をインクリメント"""
           # まず現在の値を取得
           user = await self.get_user_by_id(user_id)
           if not user:
               raise ValueError(f"User not found: {user_id}")

           new_count = user.get("video_count_this_month", 0) + 1
           return await self.update_user(user_id, {"video_count_this_month": new_count})

       # ========================================
       # Templates
       # ========================================

       async def get_templates(self) -> list[dict]:
           """アクティブなテンプレート一覧を取得"""
           response = self.client.table("templates").select("*").eq("is_active", True).order("sort_order").execute()
           return response.data

       async def get_template_by_id(self, template_id: str) -> dict | None:
           """テンプレートIDでテンプレートを取得"""
           response = self.client.table("templates").select("*").eq("id", template_id).single().execute()
           return response.data

       # ========================================
       # BGM Tracks
       # ========================================

       async def get_bgm_tracks(self) -> list[dict]:
           """アクティブなBGMトラック一覧を取得"""
           response = self.client.table("bgm_tracks").select("*").eq("is_active", True).execute()
           return response.data

       async def get_bgm_track_by_id(self, track_id: str) -> dict | None:
           """BGMトラックIDでトラックを取得"""
           response = self.client.table("bgm_tracks").select("*").eq("id", track_id).single().execute()
           return response.data

       # ========================================
       # Video Generations
       # ========================================

       async def create_video_generation(self, data: dict) -> dict:
           """動画生成リクエストを作成"""
           response = self.client.table("video_generations").insert(data).execute()
           return response.data[0] if response.data else None

       async def get_video_generation_by_id(self, generation_id: str) -> dict | None:
           """動画生成IDで生成情報を取得"""
           response = self.client.table("video_generations").select("*").eq("id", generation_id).single().execute()
           return response.data

       async def update_video_generation(self, generation_id: str, data: dict) -> dict:
           """動画生成情報を更新"""
           response = self.client.table("video_generations").update(data).eq("id", generation_id).execute()
           return response.data[0] if response.data else None

       async def get_user_video_generations(self, user_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
           """ユーザーの動画生成履歴を取得"""
           response = (
               self.client.table("video_generations")
               .select("*, templates(name), bgm_tracks(name)")
               .eq("user_id", user_id)
               .order("created_at", desc=True)
               .range(offset, offset + limit - 1)
               .execute()
           )
           return response.data

       async def delete_video_generation(self, generation_id: str, user_id: str) -> bool:
           """動画生成を削除（ユーザーIDで所有権確認）"""
           response = (
               self.client.table("video_generations")
               .delete()
               .eq("id", generation_id)
               .eq("user_id", user_id)
               .execute()
           )
           return len(response.data) > 0

       # ========================================
       # Usage Logs
       # ========================================

       async def create_usage_log(self, user_id: str, action_type: str, video_generation_id: str = None, metadata: dict = None) -> dict:
           """使用ログを作成"""
           data = {
               "user_id": user_id,
               "action_type": action_type,
               "video_generation_id": video_generation_id,
               "metadata": metadata,
           }
           response = self.client.table("usage_logs").insert(data).execute()
           return response.data[0] if response.data else None


   # シングルトンインスタンス
   supabase_service = SupabaseService()
   ```

2. **依存性注入の設定**

   `app/dependencies.py`:
   ```python
   from app.services.supabase import SupabaseService, supabase_service


   def get_supabase_service() -> SupabaseService:
       return supabase_service
   ```

### 完了条件

- [ ] `app/services/supabase.py` が作成されている
- [ ] `app/dependencies.py` が作成されている
- [ ] Supabase への接続が正常に動作する（テストは BE-003 で実施）

---

## BE-003: 認証ミドルウェア実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | BE-002 |
| **推定作業時間** | 45分 |

### 概要
Supabase JWT トークンを検証する認証ミドルウェアを実装する。

### 詳細手順

1. **認証ユーティリティ実装**

   `app/utils/auth.py`:
   ```python
   from fastapi import HTTPException, Security
   from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
   from supabase import create_client
   from app.config import get_settings
   import httpx

   settings = get_settings()
   security = HTTPBearer()


   async def verify_supabase_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
       """
       Supabase JWT トークンを検証し、ユーザー情報を返す

       Returns:
           dict: ユーザー情報（id, email, user_metadata など）

       Raises:
           HTTPException: トークンが無効な場合
       """
       token = credentials.credentials

       try:
           # Supabase の /auth/v1/user エンドポイントでトークンを検証
           async with httpx.AsyncClient() as client:
               response = await client.get(
                   f"{settings.supabase_url}/auth/v1/user",
                   headers={
                       "Authorization": f"Bearer {token}",
                       "apikey": settings.supabase_service_key,
                   },
               )

               if response.status_code != 200:
                   raise HTTPException(
                       status_code=401,
                       detail="Invalid or expired token",
                   )

               user_data = response.json()
               return {
                   "id": user_data["id"],
                   "email": user_data.get("email"),
                   "user_metadata": user_data.get("user_metadata", {}),
               }

       except httpx.RequestError as e:
           raise HTTPException(
               status_code=503,
               detail=f"Authentication service unavailable: {str(e)}",
           )


   async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
       """
       現在のユーザーを取得する依存性関数
       verify_supabase_token のエイリアス
       """
       return await verify_supabase_token(credentials)
   ```

2. **Pydantic スキーマ作成**

   `app/models/schemas.py`:
   ```python
   from pydantic import BaseModel, Field
   from datetime import datetime
   from typing import Optional
   from enum import Enum


   # ========================================
   # Enums
   # ========================================

   class PlanType(str, Enum):
       FREE = "free"
       STARTER = "starter"
       PRO = "pro"
       BUSINESS = "business"


   class VideoStatus(str, Enum):
       PENDING = "pending"
       PROCESSING = "processing"
       COMPLETED = "completed"
       FAILED = "failed"


   class OverlayPosition(str, Enum):
       TOP = "top"
       CENTER = "center"
       BOTTOM = "bottom"


   # ========================================
   # User Schemas
   # ========================================

   class UserResponse(BaseModel):
       id: str
       email: str
       display_name: Optional[str] = None
       plan_type: PlanType = PlanType.FREE
       video_count_this_month: int = 0
       trial_videos_remaining: int = 3
       created_at: datetime

       class Config:
           from_attributes = True


   class UserUsageResponse(BaseModel):
       plan_type: PlanType
       video_count_this_month: int
       monthly_limit: int
       trial_videos_remaining: int
       can_generate: bool


   # ========================================
   # Template Schemas
   # ========================================

   class TemplateResponse(BaseModel):
       id: str
       name: str
       description: Optional[str] = None
       prompt_template: str
       style_keywords: list[str] = []
       thumbnail_url: Optional[str] = None

       class Config:
           from_attributes = True


   # ========================================
   # BGM Schemas
   # ========================================

   class BGMTrackResponse(BaseModel):
       id: str
       name: str
       description: Optional[str] = None
       file_url: str
       duration_seconds: Optional[int] = None
       mood: Optional[str] = None

       class Config:
           from_attributes = True


   # ========================================
   # Video Generation Schemas
   # ========================================

   class TextOverlaySettings(BaseModel):
       text: Optional[str] = None
       position: OverlayPosition = OverlayPosition.BOTTOM
       font: str = "NotoSansJP"
       color: str = "#FFFFFF"


   class GenerateVideoRequest(BaseModel):
       template_id: Optional[str] = None
       image_url: str = Field(..., description="R2にアップロード済みの画像URL")
       prompt: str = Field(..., min_length=1, max_length=500, description="ユーザー入力プロンプト")
       overlay: Optional[TextOverlaySettings] = None
       bgm_track_id: Optional[str] = None


   class GenerateVideoResponse(BaseModel):
       id: str
       status: VideoStatus
       estimated_time_seconds: int = 60
       created_at: datetime


   class VideoStatusResponse(BaseModel):
       id: str
       status: VideoStatus
       progress: int = Field(..., ge=0, le=100)
       message: str
       video_url: Optional[str] = None
       expires_at: Optional[datetime] = None


   class VideoHistoryItem(BaseModel):
       id: str
       template_name: Optional[str] = None
       user_prompt: str
       status: VideoStatus
       final_video_url: Optional[str] = None
       created_at: datetime
       expires_at: Optional[datetime] = None

       class Config:
           from_attributes = True


   class VideoHistoryResponse(BaseModel):
       items: list[VideoHistoryItem]
       total: int
       limit: int
       offset: int


   # ========================================
   # Common Schemas
   # ========================================

   class MessageResponse(BaseModel):
       message: str


   class ErrorResponse(BaseModel):
       detail: str
   ```

3. **認証テスト用エンドポイント追加**

   `app/api/v1/health.py` を更新：
   ```python
   from fastapi import APIRouter, Depends
   from app.utils.auth import get_current_user

   router = APIRouter()


   @router.get("/health")
   async def health_check():
       return {
           "status": "healthy",
           "service": "movie-maker-api",
       }


   @router.get("/health/auth")
   async def auth_health_check(current_user: dict = Depends(get_current_user)):
       """認証が必要なヘルスチェック（テスト用）"""
       return {
           "status": "authenticated",
           "user_id": current_user["id"],
           "email": current_user.get("email"),
       }
   ```

### 完了条件

- [ ] `app/utils/auth.py` が作成されている
- [ ] `app/models/schemas.py` が作成されている
- [ ] `/api/v1/health/auth` エンドポイントが認証を要求する
- [ ] 有効なトークンで `/api/v1/health/auth` にアクセスするとユーザー情報が返る
- [ ] 無効なトークンで 401 エラーが返る

---

## BE-004: テンプレート API 実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-002, BE-003 |
| **推定作業時間** | 30分 |

### 概要
テンプレート一覧・詳細取得 API を実装する。

### 詳細手順

1. **テンプレート API 実装**

   `app/api/v1/templates.py`:
   ```python
   from fastapi import APIRouter, Depends, HTTPException
   from app.services.supabase import SupabaseService
   from app.dependencies import get_supabase_service
   from app.models.schemas import TemplateResponse

   router = APIRouter(prefix="/templates", tags=["templates"])


   @router.get("", response_model=list[TemplateResponse])
   async def get_templates(
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       アクティブなテンプレート一覧を取得

       認証不要（公開API）
       """
       templates = await supabase.get_templates()
       return templates


   @router.get("/{template_id}", response_model=TemplateResponse)
   async def get_template(
       template_id: str,
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       テンプレート詳細を取得

       認証不要（公開API）
       """
       template = await supabase.get_template_by_id(template_id)
       if not template:
           raise HTTPException(status_code=404, detail="Template not found")
       return template
   ```

2. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health, templates

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   api_router.include_router(templates.router)
   ```

### 完了条件

- [ ] `app/api/v1/templates.py` が作成されている
- [ ] `GET /api/v1/templates` でテンプレート一覧が取得できる
- [ ] `GET /api/v1/templates/{id}` でテンプレート詳細が取得できる
- [ ] 存在しないIDで 404 エラーが返る

---

## BE-005: BGM API 実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-002, BE-003 |
| **推定作業時間** | 20分 |

### 概要
BGMトラック一覧取得 API を実装する。

### 詳細手順

1. **BGM API 実装**

   `app/api/v1/bgm.py`:
   ```python
   from fastapi import APIRouter, Depends
   from app.services.supabase import SupabaseService
   from app.dependencies import get_supabase_service
   from app.models.schemas import BGMTrackResponse

   router = APIRouter(prefix="/bgm", tags=["bgm"])


   @router.get("", response_model=list[BGMTrackResponse])
   async def get_bgm_tracks(
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       アクティブなBGMトラック一覧を取得

       認証不要（公開API）
       """
       tracks = await supabase.get_bgm_tracks()
       return tracks
   ```

2. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health, templates, bgm

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   api_router.include_router(templates.router)
   api_router.include_router(bgm.router)
   ```

### 完了条件

- [ ] `app/api/v1/bgm.py` が作成されている
- [ ] `GET /api/v1/bgm` でBGMトラック一覧が取得できる

---

## BE-006: Cloudflare R2 サービス実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | BE-001, INFRA-003 |
| **推定作業時間** | 45分 |

### 概要
Cloudflare R2 へのファイルアップロード・ダウンロード機能を実装する。

### 詳細手順

1. **R2 サービス実装**

   `app/services/r2.py`:
   ```python
   import boto3
   from botocore.config import Config
   from app.config import get_settings
   from datetime import datetime
   import uuid
   import httpx

   settings = get_settings()


   class R2Service:
       def __init__(self):
           self.s3_client = boto3.client(
               "s3",
               endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
               aws_access_key_id=settings.r2_access_key,
               aws_secret_access_key=settings.r2_secret_key,
               config=Config(signature_version="s3v4"),
               region_name="auto",
           )
           self.bucket_name = settings.r2_bucket_name
           self.public_url = settings.r2_public_url

       def _generate_key(self, prefix: str, extension: str) -> str:
           """ユニークなファイルキーを生成"""
           date_str = datetime.now().strftime("%Y/%m/%d")
           unique_id = uuid.uuid4().hex[:12]
           return f"{prefix}/{date_str}/{unique_id}.{extension}"

       async def upload_image(self, file_content: bytes, content_type: str = "image/jpeg") -> str:
           """
           画像をアップロードし、公開URLを返す

           Args:
               file_content: 画像のバイナリデータ
               content_type: MIMEタイプ

           Returns:
               str: 公開URL
           """
           extension = content_type.split("/")[-1]
           if extension == "jpeg":
               extension = "jpg"

           key = self._generate_key("images", extension)

           self.s3_client.put_object(
               Bucket=self.bucket_name,
               Key=key,
               Body=file_content,
               ContentType=content_type,
           )

           return f"{self.public_url}/{key}"

       async def upload_video(self, file_content: bytes, prefix: str = "videos") -> str:
           """
           動画をアップロードし、公開URLを返す

           Args:
               file_content: 動画のバイナリデータ
               prefix: 保存先プレフィックス（videos または processed）

           Returns:
               str: 公開URL
           """
           key = self._generate_key(prefix, "mp4")

           self.s3_client.put_object(
               Bucket=self.bucket_name,
               Key=key,
               Body=file_content,
               ContentType="video/mp4",
           )

           return f"{self.public_url}/{key}"

       async def download_file(self, url: str) -> bytes:
           """
           URLからファイルをダウンロード

           Args:
               url: ダウンロード元URL

           Returns:
               bytes: ファイルのバイナリデータ
           """
           async with httpx.AsyncClient() as client:
               response = await client.get(url, timeout=120.0)
               response.raise_for_status()
               return response.content

       async def delete_file(self, url: str) -> bool:
           """
           ファイルを削除

           Args:
               url: 削除するファイルのURL

           Returns:
               bool: 削除成功かどうか
           """
           # URLからキーを抽出
           key = url.replace(f"{self.public_url}/", "")

           try:
               self.s3_client.delete_object(
                   Bucket=self.bucket_name,
                   Key=key,
               )
               return True
           except Exception:
               return False

       def generate_presigned_upload_url(self, file_name: str, content_type: str, expires_in: int = 3600) -> dict:
           """
           署名付きアップロードURLを生成（フロントエンドからの直接アップロード用）

           Args:
               file_name: ファイル名
               content_type: MIMEタイプ
               expires_in: 有効期限（秒）

           Returns:
               dict: {"upload_url": str, "file_url": str}
           """
           extension = file_name.split(".")[-1].lower()
           key = self._generate_key("images", extension)

           presigned_url = self.s3_client.generate_presigned_url(
               "put_object",
               Params={
                   "Bucket": self.bucket_name,
                   "Key": key,
                   "ContentType": content_type,
               },
               ExpiresIn=expires_in,
           )

           return {
               "upload_url": presigned_url,
               "file_url": f"{self.public_url}/{key}",
           }


   # シングルトンインスタンス
   r2_service = R2Service()
   ```

2. **依存性注入に追加**

   `app/dependencies.py` を更新：
   ```python
   from app.services.supabase import SupabaseService, supabase_service
   from app.services.r2 import R2Service, r2_service


   def get_supabase_service() -> SupabaseService:
       return supabase_service


   def get_r2_service() -> R2Service:
       return r2_service
   ```

3. **アップロードURL取得エンドポイント追加**

   `app/api/v1/upload.py`:
   ```python
   from fastapi import APIRouter, Depends, HTTPException
   from pydantic import BaseModel
   from app.services.r2 import R2Service
   from app.dependencies import get_r2_service
   from app.utils.auth import get_current_user

   router = APIRouter(prefix="/upload", tags=["upload"])


   class PresignedUrlRequest(BaseModel):
       file_name: str
       content_type: str  # 例: "image/jpeg", "image/png"


   class PresignedUrlResponse(BaseModel):
       upload_url: str
       file_url: str


   @router.post("/presigned-url", response_model=PresignedUrlResponse)
   async def get_presigned_upload_url(
       request: PresignedUrlRequest,
       current_user: dict = Depends(get_current_user),
       r2: R2Service = Depends(get_r2_service),
   ):
       """
       画像アップロード用の署名付きURLを取得

       フロントエンドはこのURLに直接PUTリクエストを送信して画像をアップロードする
       """
       # 許可するコンテンツタイプを制限
       allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
       if request.content_type not in allowed_types:
           raise HTTPException(
               status_code=400,
               detail=f"Content type not allowed. Allowed types: {allowed_types}",
           )

       result = r2.generate_presigned_upload_url(
           file_name=request.file_name,
           content_type=request.content_type,
       )

       return result
   ```

4. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health, templates, bgm, upload

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   api_router.include_router(templates.router)
   api_router.include_router(bgm.router)
   api_router.include_router(upload.router)
   ```

### 完了条件

- [ ] `app/services/r2.py` が作成されている
- [ ] `app/api/v1/upload.py` が作成されている
- [ ] `POST /api/v1/upload/presigned-url` で署名付きURLが取得できる
- [ ] 取得したURLに画像をアップロードできる

---

## BE-007: OpenAI プロンプト最適化サービス実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-001 |
| **推定作業時間** | 30分 |

### 概要
OpenAI API を使用してユーザーのプロンプトを動画生成に適した形式に最適化する。

### 詳細手順

1. **OpenAI サービス実装**

   `app/services/openai_service.py`:
   ```python
   from openai import OpenAI
   from app.config import get_settings

   settings = get_settings()


   class OpenAIService:
       def __init__(self):
           self.client = OpenAI(api_key=settings.openai_api_key)

       async def optimize_prompt(
           self,
           user_prompt: str,
           template_keywords: list[str] = None,
           style: str = None,
       ) -> str:
           """
           ユーザーのプロンプトを動画生成に適した形式に最適化

           Args:
               user_prompt: ユーザーが入力したプロンプト
               template_keywords: テンプレートのスタイルキーワード
               style: 追加のスタイル指定

           Returns:
               str: 最適化されたプロンプト
           """
           system_prompt = """あなたはAI動画生成のプロンプトエンジニアです。
ユーザーの簡単な説明を、KlingAI（Image-to-Video AI）に最適な詳細なプロンプトに変換してください。

ルール：
1. 英語で出力すること
2. 動きの描写を具体的に含めること（例：slowly moving, gently swaying, camera panning）
3. 照明や雰囲気を含めること（例：soft lighting, dramatic shadows, golden hour）
4. 5秒の短い動画に適した、シンプルで明確な動きを指定すること
5. 100語以内に収めること
6. プロンプトのみを出力し、説明や前置きは不要"""

           user_message = f"ユーザーの説明: {user_prompt}"

           if template_keywords:
               user_message += f"\n\nスタイルキーワード: {', '.join(template_keywords)}"

           if style:
               user_message += f"\n\n追加スタイル: {style}"

           response = self.client.chat.completions.create(
               model="gpt-4o-mini",
               messages=[
                   {"role": "system", "content": system_prompt},
                   {"role": "user", "content": user_message},
               ],
               max_tokens=200,
               temperature=0.7,
           )

           return response.choices[0].message.content.strip()


   # シングルトンインスタンス
   openai_service = OpenAIService()
   ```

2. **依存性注入に追加**

   `app/dependencies.py` を更新：
   ```python
   from app.services.supabase import SupabaseService, supabase_service
   from app.services.r2 import R2Service, r2_service
   from app.services.openai_service import OpenAIService, openai_service


   def get_supabase_service() -> SupabaseService:
       return supabase_service


   def get_r2_service() -> R2Service:
       return r2_service


   def get_openai_service() -> OpenAIService:
       return openai_service
   ```

### 完了条件

- [ ] `app/services/openai_service.py` が作成されている
- [ ] `dependencies.py` に `get_openai_service` が追加されている
- [ ] 日本語プロンプトが英語の詳細なプロンプトに変換される

---

## BE-008: KlingAI API サービス実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | BE-001 |
| **推定作業時間** | 60分 |

### 概要
KlingAI の Image-to-Video API を使用して動画を生成するサービスを実装する。

### 詳細手順

1. **KlingAI サービス実装**

   `app/services/kling.py`:
   ```python
   import httpx
   from app.config import get_settings
   from enum import Enum
   import asyncio

   settings = get_settings()


   class KlingTaskStatus(str, Enum):
       SUBMITTED = "submitted"
       PROCESSING = "processing"
       SUCCEED = "succeed"
       FAILED = "failed"


   class KlingAIService:
       def __init__(self):
           self.api_key = settings.kling_api_key
           self.base_url = settings.kling_api_base_url
           self.headers = {
               "Authorization": f"Bearer {self.api_key}",
               "Content-Type": "application/json",
           }

       async def create_image_to_video_task(
           self,
           image_url: str,
           prompt: str,
           duration: int = 5,
           aspect_ratio: str = "9:16",
       ) -> dict:
           """
           Image-to-Video タスクを作成

           Args:
               image_url: 入力画像のURL
               prompt: 動画生成プロンプト
               duration: 動画の長さ（秒）、5 または 10
               aspect_ratio: アスペクト比、"16:9", "9:16", "1:1"

           Returns:
               dict: {"task_id": str, "status": str}
           """
           payload = {
               "model_name": "kling-v1",
               "input": {
                   "image_url": image_url,
                   "prompt": prompt,
               },
               "config": {
                   "duration": duration,
                   "aspect_ratio": aspect_ratio,
               },
           }

           async with httpx.AsyncClient() as client:
               response = await client.post(
                   f"{self.base_url}/v1/videos/image2video",
                   headers=self.headers,
                   json=payload,
                   timeout=30.0,
               )

               if response.status_code != 200:
                   error_detail = response.text
                   raise Exception(f"KlingAI API error: {response.status_code} - {error_detail}")

               data = response.json()
               return {
                   "task_id": data["data"]["task_id"],
                   "status": data["data"]["task_status"],
               }

       async def get_task_status(self, task_id: str) -> dict:
           """
           タスクのステータスを取得

           Args:
               task_id: KlingAI タスクID

           Returns:
               dict: {
                   "status": str,
                   "progress": int (0-100),
                   "video_url": str or None,
                   "error_message": str or None
               }
           """
           async with httpx.AsyncClient() as client:
               response = await client.get(
                   f"{self.base_url}/v1/videos/image2video/{task_id}",
                   headers=self.headers,
                   timeout=30.0,
               )

               if response.status_code != 200:
                   raise Exception(f"KlingAI API error: {response.status_code}")

               data = response.json()["data"]
               task_status = data["task_status"]

               result = {
                   "status": task_status,
                   "progress": 0,
                   "video_url": None,
                   "error_message": None,
               }

               if task_status == KlingTaskStatus.PROCESSING:
                   # KlingAI は進捗を返さないので推定値を使用
                   result["progress"] = 50

               elif task_status == KlingTaskStatus.SUCCEED:
                   result["progress"] = 100
                   # 動画URLを取得
                   if "videos" in data and len(data["videos"]) > 0:
                       result["video_url"] = data["videos"][0]["url"]

               elif task_status == KlingTaskStatus.FAILED:
                   result["error_message"] = data.get("task_status_msg", "Unknown error")

               return result

       async def wait_for_completion(
           self,
           task_id: str,
           timeout_seconds: int = 180,
           poll_interval: int = 5,
       ) -> dict:
           """
           タスク完了まで待機

           Args:
               task_id: KlingAI タスクID
               timeout_seconds: タイムアウト（秒）
               poll_interval: ポーリング間隔（秒）

           Returns:
               dict: 最終ステータス
           """
           elapsed = 0
           while elapsed < timeout_seconds:
               status = await self.get_task_status(task_id)

               if status["status"] == KlingTaskStatus.SUCCEED:
                   return status

               if status["status"] == KlingTaskStatus.FAILED:
                   raise Exception(f"Video generation failed: {status['error_message']}")

               await asyncio.sleep(poll_interval)
               elapsed += poll_interval

           raise Exception("Video generation timed out")


   # シングルトンインスタンス
   kling_service = KlingAIService()
   ```

   **注意**: KlingAI API の仕様は実際のドキュメントに基づいて調整が必要な場合があります。

2. **依存性注入に追加**

   `app/dependencies.py` を更新：
   ```python
   from app.services.supabase import SupabaseService, supabase_service
   from app.services.r2 import R2Service, r2_service
   from app.services.openai_service import OpenAIService, openai_service
   from app.services.kling import KlingAIService, kling_service


   def get_supabase_service() -> SupabaseService:
       return supabase_service


   def get_r2_service() -> R2Service:
       return r2_service


   def get_openai_service() -> OpenAIService:
       return openai_service


   def get_kling_service() -> KlingAIService:
       return kling_service
   ```

### 完了条件

- [ ] `app/services/kling.py` が作成されている
- [ ] `dependencies.py` に `get_kling_service` が追加されている
- [ ] KlingAI API にタスクを送信できる
- [ ] タスクステータスを取得できる

---

## BE-009: FFmpeg 動画処理サービス実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-001 |
| **推定作業時間** | 60分 |

### 概要
FFmpeg を使用して動画にテキストオーバーレイとBGMを合成する。

### 詳細手順

1. **FFmpeg サービス実装**

   `app/services/ffmpeg_service.py`:
   ```python
   import ffmpeg
   import tempfile
   import os
   from pathlib import Path


   class FFmpegService:
       def __init__(self):
           # フォントファイルのパス（Docker内）
           self.font_paths = {
               "NotoSansJP": "/usr/share/fonts/noto/NotoSansJP-Regular.ttf",
               "NotoSerifJP": "/usr/share/fonts/noto/NotoSerifJP-Regular.ttf",
               "MPLUSRounded1c": "/usr/share/fonts/mplus/MPLUSRounded1c-Regular.ttf",
           }
           # デフォルトフォント
           self.default_font = self.font_paths.get("NotoSansJP", "")

       async def add_text_overlay(
           self,
           video_path: str,
           output_path: str,
           text: str,
           position: str = "bottom",
           font: str = "NotoSansJP",
           color: str = "#FFFFFF",
           font_size: int = 48,
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

           Returns:
               str: 出力動画パス
           """
           # 位置の計算
           if position == "top":
               y_position = "h*0.1"
           elif position == "center":
               y_position = "(h-text_h)/2"
           else:  # bottom
               y_position = "h*0.85"

           font_path = self.font_paths.get(font, self.default_font)

           # FFmpeg フィルター
           (
               ffmpeg
               .input(video_path)
               .output(
                   output_path,
                   vf=f"drawtext=text='{text}':fontfile={font_path}:fontsize={font_size}:fontcolor={color}:x=(w-text_w)/2:y={y_position}:borderw=2:bordercolor=black",
                   acodec="copy",
               )
               .overwrite_output()
               .run(capture_stdout=True, capture_stderr=True)
           )

           return output_path

       async def add_bgm(
           self,
           video_path: str,
           audio_path: str,
           output_path: str,
           video_volume: float = 0.3,
           audio_volume: float = 0.7,
       ) -> str:
           """
           動画にBGMを追加

           Args:
               video_path: 入力動画パス
               audio_path: BGMファイルパス
               output_path: 出力動画パス
               video_volume: 元動画の音量（0.0-1.0）
               audio_volume: BGMの音量（0.0-1.0）

           Returns:
               str: 出力動画パス
           """
           video = ffmpeg.input(video_path)
           audio = ffmpeg.input(audio_path)

           # 動画の長さを取得
           probe = ffmpeg.probe(video_path)
           duration = float(probe["format"]["duration"])

           (
               ffmpeg
               .output(
                   video.video,
                   audio.audio.filter("atrim", duration=duration).filter("volume", audio_volume),
                   output_path,
                   vcodec="copy",
                   acodec="aac",
                   shortest=None,
               )
               .overwrite_output()
               .run(capture_stdout=True, capture_stderr=True)
           )

           return output_path

       async def process_video(
           self,
           input_video_bytes: bytes,
           text: str = None,
           text_position: str = "bottom",
           text_font: str = "NotoSansJP",
           text_color: str = "#FFFFFF",
           bgm_bytes: bytes = None,
       ) -> bytes:
           """
           動画を処理（テキスト追加 + BGM追加）

           Args:
               input_video_bytes: 入力動画のバイナリ
               text: オーバーレイテキスト（None の場合はスキップ）
               text_position: テキスト位置
               text_font: フォント
               text_color: テキスト色
               bgm_bytes: BGMのバイナリ（None の場合はスキップ）

           Returns:
               bytes: 処理済み動画のバイナリ
           """
           with tempfile.TemporaryDirectory() as temp_dir:
               input_path = os.path.join(temp_dir, "input.mp4")
               current_path = input_path

               # 入力動画を保存
               with open(input_path, "wb") as f:
                   f.write(input_video_bytes)

               # テキストオーバーレイ追加
               if text:
                   text_output_path = os.path.join(temp_dir, "with_text.mp4")
                   await self.add_text_overlay(
                       video_path=current_path,
                       output_path=text_output_path,
                       text=text,
                       position=text_position,
                       font=text_font,
                       color=text_color,
                   )
                   current_path = text_output_path

               # BGM追加
               if bgm_bytes:
                   bgm_path = os.path.join(temp_dir, "bgm.mp3")
                   with open(bgm_path, "wb") as f:
                       f.write(bgm_bytes)

                   bgm_output_path = os.path.join(temp_dir, "with_bgm.mp4")
                   await self.add_bgm(
                       video_path=current_path,
                       audio_path=bgm_path,
                       output_path=bgm_output_path,
                   )
                   current_path = bgm_output_path

               # 最終動画を読み込み
               with open(current_path, "rb") as f:
                   return f.read()


   # シングルトンインスタンス
   ffmpeg_service = FFmpegService()
   ```

2. **Dockerfile にフォントを追加**

   `Dockerfile` を更新：
   ```dockerfile
   FROM python:3.11-slim

   # FFmpeg とフォントのインストール
   RUN apt-get update && apt-get install -y \
       ffmpeg \
       fonts-noto-cjk \
       && rm -rf /var/lib/apt/lists/*

   # フォントディレクトリ作成
   RUN mkdir -p /usr/share/fonts/noto /usr/share/fonts/mplus

   WORKDIR /app

   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY . .

   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

3. **依存性注入に追加**

   `app/dependencies.py` を更新：
   ```python
   from app.services.supabase import SupabaseService, supabase_service
   from app.services.r2 import R2Service, r2_service
   from app.services.openai_service import OpenAIService, openai_service
   from app.services.kling import KlingAIService, kling_service
   from app.services.ffmpeg_service import FFmpegService, ffmpeg_service


   def get_supabase_service() -> SupabaseService:
       return supabase_service


   def get_r2_service() -> R2Service:
       return r2_service


   def get_openai_service() -> OpenAIService:
       return openai_service


   def get_kling_service() -> KlingAIService:
       return kling_service


   def get_ffmpeg_service() -> FFmpegService:
       return ffmpeg_service
   ```

### 完了条件

- [ ] `app/services/ffmpeg_service.py` が作成されている
- [ ] `Dockerfile` にフォントインストールが追加されている
- [ ] 動画にテキストオーバーレイを追加できる
- [ ] 動画にBGMを追加できる

---

## BE-010: 動画生成 API 実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | BE-006, BE-007, BE-008, BE-009 |
| **推定作業時間** | 90分 |

### 概要
動画生成リクエストを受け付け、バックグラウンドで処理を実行するAPIを実装する。

### 詳細手順

1. **動画生成 API 実装**

   `app/api/v1/generate.py`:
   ```python
   from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
   from datetime import datetime, timedelta
   from app.services.supabase import SupabaseService
   from app.services.r2 import R2Service
   from app.services.openai_service import OpenAIService
   from app.services.kling import KlingAIService
   from app.services.ffmpeg_service import FFmpegService
   from app.dependencies import (
       get_supabase_service,
       get_r2_service,
       get_openai_service,
       get_kling_service,
       get_ffmpeg_service,
   )
   from app.utils.auth import get_current_user
   from app.models.schemas import (
       GenerateVideoRequest,
       GenerateVideoResponse,
       VideoStatusResponse,
       VideoStatus,
   )

   router = APIRouter(prefix="/generate", tags=["generate"])


   # プラン別の月間上限
   PLAN_LIMITS = {
       "free": 3,      # トライアル
       "starter": 5,
       "pro": 15,
       "business": 50,
   }


   async def check_generation_limit(user: dict, supabase: SupabaseService) -> bool:
       """ユーザーの生成上限をチェック"""
       user_data = await supabase.get_user_by_id(user["id"])
       if not user_data:
           return False

       plan_type = user_data.get("plan_type", "free")
       video_count = user_data.get("video_count_this_month", 0)
       limit = PLAN_LIMITS.get(plan_type, 3)

       # 無料トライアルの場合は trial_videos_remaining をチェック
       if plan_type == "free":
           remaining = user_data.get("trial_videos_remaining", 0)
           return remaining > 0

       return video_count < limit


   async def process_video_generation(
       generation_id: str,
       supabase: SupabaseService,
       r2: R2Service,
       openai: OpenAIService,
       kling: KlingAIService,
       ffmpeg: FFmpegService,
   ):
       """バックグラウンドで動画生成を処理"""
       try:
           # 生成情報を取得
           generation = await supabase.get_video_generation_by_id(generation_id)
           if not generation:
               return

           # ステータスを processing に更新
           await supabase.update_video_generation(generation_id, {
               "status": "processing",
               "progress": 10,
           })

           # プロンプト最適化
           template = None
           if generation.get("template_id"):
               template = await supabase.get_template_by_id(generation["template_id"])

           optimized_prompt = await openai.optimize_prompt(
               user_prompt=generation["user_prompt"],
               template_keywords=template.get("style_keywords") if template else None,
           )

           await supabase.update_video_generation(generation_id, {
               "optimized_prompt": optimized_prompt,
               "progress": 20,
           })

           # KlingAI で動画生成
           kling_result = await kling.create_image_to_video_task(
               image_url=generation["original_image_url"],
               prompt=optimized_prompt,
               duration=5,
               aspect_ratio="9:16",
           )

           await supabase.update_video_generation(generation_id, {
               "kling_task_id": kling_result["task_id"],
               "progress": 30,
           })

           # KlingAI の完了を待機
           kling_status = await kling.wait_for_completion(
               task_id=kling_result["task_id"],
               timeout_seconds=180,
           )

           if not kling_status.get("video_url"):
               raise Exception("No video URL returned from KlingAI")

           # 生成された動画をダウンロード
           raw_video_bytes = await r2.download_file(kling_status["video_url"])

           await supabase.update_video_generation(generation_id, {
               "raw_video_url": kling_status["video_url"],
               "progress": 70,
           })

           # FFmpeg で後処理
           bgm_bytes = None
           if generation.get("bgm_track_id"):
               bgm_track = await supabase.get_bgm_track_by_id(generation["bgm_track_id"])
               if bgm_track:
                   bgm_bytes = await r2.download_file(bgm_track["file_url"])

           processed_video_bytes = await ffmpeg.process_video(
               input_video_bytes=raw_video_bytes,
               text=generation.get("overlay_text"),
               text_position=generation.get("overlay_position", "bottom"),
               text_font=generation.get("overlay_font", "NotoSansJP"),
               text_color=generation.get("overlay_color", "#FFFFFF"),
               bgm_bytes=bgm_bytes,
           )

           await supabase.update_video_generation(generation_id, {
               "progress": 90,
           })

           # 最終動画を R2 にアップロード
           final_video_url = await r2.upload_video(processed_video_bytes, prefix="processed")

           # 完了
           expires_at = datetime.utcnow() + timedelta(days=7)
           await supabase.update_video_generation(generation_id, {
               "status": "completed",
               "progress": 100,
               "final_video_url": final_video_url,
               "expires_at": expires_at.isoformat(),
           })

           # 使用ログを記録
           await supabase.create_usage_log(
               user_id=generation["user_id"],
               action_type="video_generated",
               video_generation_id=generation_id,
           )

           # 生成カウントを更新
           user = await supabase.get_user_by_id(generation["user_id"])
           if user and user.get("plan_type") == "free":
               remaining = user.get("trial_videos_remaining", 0)
               await supabase.update_user(generation["user_id"], {
                   "trial_videos_remaining": max(0, remaining - 1),
               })
           else:
               await supabase.increment_video_count(generation["user_id"])

       except Exception as e:
           # エラー時はステータスを failed に更新
           await supabase.update_video_generation(generation_id, {
               "status": "failed",
               "error_message": str(e),
           })


   @router.post("", response_model=GenerateVideoResponse)
   async def create_video_generation(
       request: GenerateVideoRequest,
       background_tasks: BackgroundTasks,
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
       r2: R2Service = Depends(get_r2_service),
       openai: OpenAIService = Depends(get_openai_service),
       kling: KlingAIService = Depends(get_kling_service),
       ffmpeg: FFmpegService = Depends(get_ffmpeg_service),
   ):
       """
       動画生成リクエストを作成

       バックグラウンドで処理を開始し、すぐにレスポンスを返す
       """
       # 生成上限チェック
       can_generate = await check_generation_limit(current_user, supabase)
       if not can_generate:
           raise HTTPException(
               status_code=403,
               detail="Monthly generation limit reached. Please upgrade your plan.",
           )

       # 生成リクエストをDBに保存
       generation_data = {
           "user_id": current_user["id"],
           "template_id": request.template_id,
           "original_image_url": request.image_url,
           "user_prompt": request.prompt,
           "status": "pending",
       }

       if request.overlay:
           generation_data["overlay_text"] = request.overlay.text
           generation_data["overlay_position"] = request.overlay.position.value
           generation_data["overlay_font"] = request.overlay.font
           generation_data["overlay_color"] = request.overlay.color

       if request.bgm_track_id:
           generation_data["bgm_track_id"] = request.bgm_track_id

       generation = await supabase.create_video_generation(generation_data)

       # バックグラウンドで処理を開始
       background_tasks.add_task(
           process_video_generation,
           generation_id=generation["id"],
           supabase=supabase,
           r2=r2,
           openai=openai,
           kling=kling,
           ffmpeg=ffmpeg,
       )

       return GenerateVideoResponse(
           id=generation["id"],
           status=VideoStatus.PENDING,
           estimated_time_seconds=60,
           created_at=generation["created_at"],
       )


   @router.get("/{generation_id}", response_model=VideoStatusResponse)
   async def get_generation_status(
       generation_id: str,
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       動画生成のステータスを取得
       """
       generation = await supabase.get_video_generation_by_id(generation_id)

       if not generation:
           raise HTTPException(status_code=404, detail="Generation not found")

       if generation["user_id"] != current_user["id"]:
           raise HTTPException(status_code=403, detail="Access denied")

       # ステータスに応じたメッセージ
       messages = {
           "pending": "処理を開始しています...",
           "processing": "動画を生成中...",
           "completed": "完了しました",
           "failed": f"エラーが発生しました: {generation.get('error_message', '不明なエラー')}",
       }

       return VideoStatusResponse(
           id=generation["id"],
           status=VideoStatus(generation["status"]),
           progress=generation.get("progress", 0),
           message=messages.get(generation["status"], ""),
           video_url=generation.get("final_video_url"),
           expires_at=generation.get("expires_at"),
       )


   @router.get("/{generation_id}/status", response_model=VideoStatusResponse)
   async def get_generation_status_polling(
       generation_id: str,
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       動画生成のステータスを取得（ポーリング用、get_generation_status と同じ）
       """
       return await get_generation_status(generation_id, current_user, supabase)
   ```

2. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health, templates, bgm, upload, generate

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   api_router.include_router(templates.router)
   api_router.include_router(bgm.router)
   api_router.include_router(upload.router)
   api_router.include_router(generate.router)
   ```

### 完了条件

- [ ] `app/api/v1/generate.py` が作成されている
- [ ] `POST /api/v1/generate` で生成リクエストが作成できる
- [ ] `GET /api/v1/generate/{id}` でステータスが取得できる
- [ ] バックグラウンド処理が正常に動作する
- [ ] 生成上限チェックが機能する

---

## BE-011: 履歴 API 実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-002, BE-003 |
| **推定作業時間** | 30分 |

### 概要
ユーザーの動画生成履歴を取得・削除するAPIを実装する。

### 詳細手順

1. **履歴 API 実装**

   `app/api/v1/history.py`:
   ```python
   from fastapi import APIRouter, Depends, HTTPException, Query
   from app.services.supabase import SupabaseService
   from app.services.r2 import R2Service
   from app.dependencies import get_supabase_service, get_r2_service
   from app.utils.auth import get_current_user
   from app.models.schemas import (
       VideoHistoryItem,
       VideoHistoryResponse,
       MessageResponse,
       VideoStatus,
   )

   router = APIRouter(prefix="/history", tags=["history"])


   @router.get("", response_model=VideoHistoryResponse)
   async def get_history(
       limit: int = Query(default=20, ge=1, le=100),
       offset: int = Query(default=0, ge=0),
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       ユーザーの動画生成履歴を取得
       """
       generations = await supabase.get_user_video_generations(
           user_id=current_user["id"],
           limit=limit,
           offset=offset,
       )

       items = []
       for gen in generations:
           template_name = None
           if gen.get("templates"):
               template_name = gen["templates"].get("name")

           items.append(VideoHistoryItem(
               id=gen["id"],
               template_name=template_name,
               user_prompt=gen["user_prompt"],
               status=VideoStatus(gen["status"]),
               final_video_url=gen.get("final_video_url"),
               created_at=gen["created_at"],
               expires_at=gen.get("expires_at"),
           ))

       return VideoHistoryResponse(
           items=items,
           total=len(items),  # 実際はカウントクエリが必要
           limit=limit,
           offset=offset,
       )


   @router.delete("/{generation_id}", response_model=MessageResponse)
   async def delete_history_item(
       generation_id: str,
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
       r2: R2Service = Depends(get_r2_service),
   ):
       """
       履歴アイテムを削除
       """
       # まず生成情報を取得
       generation = await supabase.get_video_generation_by_id(generation_id)

       if not generation:
           raise HTTPException(status_code=404, detail="History item not found")

       if generation["user_id"] != current_user["id"]:
           raise HTTPException(status_code=403, detail="Access denied")

       # R2 からファイルを削除
       if generation.get("final_video_url"):
           await r2.delete_file(generation["final_video_url"])

       if generation.get("raw_video_url"):
           await r2.delete_file(generation["raw_video_url"])

       # DBから削除
       deleted = await supabase.delete_video_generation(generation_id, current_user["id"])

       if not deleted:
           raise HTTPException(status_code=500, detail="Failed to delete history item")

       # 使用ログを記録
       await supabase.create_usage_log(
           user_id=current_user["id"],
           action_type="video_deleted",
           video_generation_id=generation_id,
       )

       return MessageResponse(message="History item deleted successfully")
   ```

2. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health, templates, bgm, upload, generate, history

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   api_router.include_router(templates.router)
   api_router.include_router(bgm.router)
   api_router.include_router(upload.router)
   api_router.include_router(generate.router)
   api_router.include_router(history.router)
   ```

### 完了条件

- [ ] `app/api/v1/history.py` が作成されている
- [ ] `GET /api/v1/history` で履歴一覧が取得できる
- [ ] `DELETE /api/v1/history/{id}` で履歴が削除できる
- [ ] 他人の履歴にアクセスできないことを確認

---

## BE-012: ユーザー API 実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-002, BE-003 |
| **推定作業時間** | 20分 |

### 概要
ユーザー情報と使用状況を取得するAPIを実装する。

### 詳細手順

1. **ユーザー API 実装**

   `app/api/v1/user.py`:
   ```python
   from fastapi import APIRouter, Depends
   from app.services.supabase import SupabaseService
   from app.dependencies import get_supabase_service
   from app.utils.auth import get_current_user
   from app.models.schemas import UserResponse, UserUsageResponse, PlanType

   router = APIRouter(prefix="/user", tags=["user"])

   # プラン別の月間上限
   PLAN_LIMITS = {
       "free": 3,
       "starter": 5,
       "pro": 15,
       "business": 50,
   }


   @router.get("/me", response_model=UserResponse)
   async def get_current_user_info(
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       現在のユーザー情報を取得
       """
       user_data = await supabase.get_user_by_id(current_user["id"])
       return user_data


   @router.get("/usage", response_model=UserUsageResponse)
   async def get_usage(
       current_user: dict = Depends(get_current_user),
       supabase: SupabaseService = Depends(get_supabase_service),
   ):
       """
       今月の使用状況を取得
       """
       user_data = await supabase.get_user_by_id(current_user["id"])

       plan_type = user_data.get("plan_type", "free")
       video_count = user_data.get("video_count_this_month", 0)
       trial_remaining = user_data.get("trial_videos_remaining", 0)
       monthly_limit = PLAN_LIMITS.get(plan_type, 3)

       # 生成可能かどうか
       if plan_type == "free":
           can_generate = trial_remaining > 0
       else:
           can_generate = video_count < monthly_limit

       return UserUsageResponse(
           plan_type=PlanType(plan_type),
           video_count_this_month=video_count,
           monthly_limit=monthly_limit,
           trial_videos_remaining=trial_remaining,
           can_generate=can_generate,
       )
   ```

2. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from fastapi import APIRouter
   from app.api.v1 import health, templates, bgm, upload, generate, history, user

   api_router = APIRouter()

   api_router.include_router(health.router, tags=["health"])
   api_router.include_router(templates.router)
   api_router.include_router(bgm.router)
   api_router.include_router(upload.router)
   api_router.include_router(generate.router)
   api_router.include_router(history.router)
   api_router.include_router(user.router)
   ```

### 完了条件

- [ ] `app/api/v1/user.py` が作成されている
- [ ] `GET /api/v1/user/me` でユーザー情報が取得できる
- [ ] `GET /api/v1/user/usage` で使用状況が取得できる

---

## BE-013: Polar Webhook 実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P2 |
| **前提条件** | BE-002 |
| **推定作業時間** | 45分 |

### 概要
Polar からの Webhook を受信し、サブスクリプション状態を同期する。

### 詳細手順

1. **Webhook API 実装**

   `app/api/v1/webhooks.py`:
   ```python
   from fastapi import APIRouter, Request, HTTPException, Header
   from app.services.supabase import SupabaseService
   from app.dependencies import get_supabase_service
   from app.config import get_settings
   import hmac
   import hashlib

   router = APIRouter(prefix="/webhook", tags=["webhooks"])
   settings = get_settings()


   def verify_polar_signature(payload: bytes, signature: str, secret: str) -> bool:
       """Polar Webhook の署名を検証"""
       expected = hmac.new(
           secret.encode(),
           payload,
           hashlib.sha256
       ).hexdigest()
       return hmac.compare_digest(f"sha256={expected}", signature)


   @router.post("/polar")
   async def polar_webhook(
       request: Request,
       x_polar_signature: str = Header(None, alias="X-Polar-Signature"),
       supabase: SupabaseService = get_supabase_service(),
   ):
       """
       Polar Webhook を受信

       イベントタイプ:
       - subscription.created: 新規サブスクリプション
       - subscription.updated: サブスクリプション更新
       - subscription.canceled: サブスクリプションキャンセル
       """
       payload = await request.body()

       # 署名検証（本番環境で有効化）
       # if settings.environment == "production":
       #     if not verify_polar_signature(payload, x_polar_signature, settings.polar_webhook_secret):
       #         raise HTTPException(status_code=401, detail="Invalid signature")

       data = await request.json()
       event_type = data.get("type")
       subscription = data.get("data", {})

       # ユーザーのメールアドレスからユーザーを特定
       customer_email = subscription.get("customer", {}).get("email")
       if not customer_email:
           return {"status": "ignored", "reason": "No customer email"}

       # プランタイプを決定
       plan_id = subscription.get("product", {}).get("id")
       plan_mapping = {
           # Polar の product ID と plan_type のマッピング（実際の値に置き換え）
           "prod_starter": "starter",
           "prod_pro": "pro",
           "prod_business": "business",
       }
       plan_type = plan_mapping.get(plan_id, "free")

       if event_type == "subscription.created":
           # 新規サブスクリプション
           await supabase.client.table("users").update({
               "plan_type": plan_type,
               "subscription_id": subscription.get("id"),
               "video_count_this_month": 0,
           }).eq("email", customer_email).execute()

       elif event_type == "subscription.updated":
           # サブスクリプション更新（プラン変更など）
           await supabase.client.table("users").update({
               "plan_type": plan_type,
           }).eq("email", customer_email).execute()

       elif event_type == "subscription.canceled":
           # サブスクリプションキャンセル
           await supabase.client.table("users").update({
               "plan_type": "free",
               "subscription_id": None,
           }).eq("email", customer_email).execute()

       return {"status": "ok"}
   ```

2. **config.py に Polar 設定追加**

   `app/config.py` を更新：
   ```python
   class Settings(BaseSettings):
       # ... 既存の設定 ...

       # Polar
       polar_webhook_secret: str = ""
   ```

3. **ルーターに追加**

   `app/api/v1/router.py` を更新：
   ```python
   from app.api.v1 import health, templates, bgm, upload, generate, history, user, webhooks

   # ... 既存のコード ...
   api_router.include_router(webhooks.router)
   ```

### 完了条件

- [ ] `app/api/v1/webhooks.py` が作成されている
- [ ] `POST /api/v1/webhook/polar` で Webhook を受信できる
- [ ] サブスクリプション作成時に `plan_type` が更新される
- [ ] サブスクリプションキャンセル時に `plan_type` が `free` に戻る

---

## BE-014: 月次リセットバッチ処理

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P2 |
| **前提条件** | BE-002 |
| **推定作業時間** | 30分 |

### 概要
毎月1日に `video_count_this_month` をリセットするバッチ処理を実装する。

### 詳細手順

1. **バッチ処理スクリプト作成**

   `app/jobs/monthly_reset.py`:
   ```python
   """
   月次リセットジョブ

   毎月1日の0:00 (JST) に実行
   - video_count_this_month を 0 にリセット

   Railway の Cron Job または Supabase の pg_cron で実行
   """
   import asyncio
   from app.services.supabase import get_supabase_client


   async def reset_monthly_video_counts():
       """全ユーザーの月間動画生成数をリセット"""
       client = get_supabase_client()

       # 全ユーザーの video_count_this_month を 0 にリセット
       result = client.table("users").update({
           "video_count_this_month": 0
       }).neq("plan_type", "free").execute()  # 無料ユーザーは trial_videos_remaining を使用

       print(f"Reset video count for {len(result.data)} users")
       return result


   async def cleanup_expired_videos():
       """期限切れ動画の削除"""
       from datetime import datetime
       from app.services.r2 import r2_service

       client = get_supabase_client()

       # 期限切れの動画を取得
       expired = client.table("video_generations").select("*").lt(
           "expires_at", datetime.utcnow().isoformat()
       ).execute()

       for video in expired.data:
           # R2 からファイルを削除
           if video.get("final_video_url"):
               await r2_service.delete_file(video["final_video_url"])
           if video.get("raw_video_url"):
               await r2_service.delete_file(video["raw_video_url"])

       # DB から削除
       if expired.data:
           ids = [v["id"] for v in expired.data]
           client.table("video_generations").delete().in_("id", ids).execute()

       print(f"Cleaned up {len(expired.data)} expired videos")


   if __name__ == "__main__":
       asyncio.run(reset_monthly_video_counts())
       asyncio.run(cleanup_expired_videos())
   ```

2. **Railway Cron Job 設定（デプロイ後）**

   `railway.json` を作成：
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "DOCKERFILE",
       "dockerfilePath": "Dockerfile"
     },
     "deploy": {
       "cronSchedule": "0 15 1 * *"
     }
   }
   ```

   ※ `0 15 1 * *` は毎月1日の15:00 UTC (= 0:00 JST)

### 完了条件

- [ ] `app/jobs/monthly_reset.py` が作成されている
- [ ] スクリプトを手動実行してリセットが機能することを確認
- [ ] 期限切れ動画の削除が機能することを確認

---

## BE-015: エラーハンドリング・ログ設定

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-001 |
| **推定作業時間** | 30分 |

### 概要
グローバルエラーハンドリングとロギングを設定する。

### 詳細手順

1. **ログ設定**

   `app/utils/logging.py`:
   ```python
   import logging
   import sys
   from app.config import get_settings

   settings = get_settings()


   def setup_logging():
       """ログ設定を初期化"""
       log_level = logging.DEBUG if settings.environment == "development" else logging.INFO

       logging.basicConfig(
           level=log_level,
           format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
           handlers=[
               logging.StreamHandler(sys.stdout),
           ],
       )

       # 外部ライブラリのログレベルを調整
       logging.getLogger("httpx").setLevel(logging.WARNING)
       logging.getLogger("boto3").setLevel(logging.WARNING)
       logging.getLogger("botocore").setLevel(logging.WARNING)


   def get_logger(name: str) -> logging.Logger:
       """名前付きロガーを取得"""
       return logging.getLogger(name)
   ```

2. **グローバルエラーハンドリング**

   `app/utils/exceptions.py`:
   ```python
   from fastapi import Request, HTTPException
   from fastapi.responses import JSONResponse
   from app.utils.logging import get_logger

   logger = get_logger(__name__)


   class AppException(Exception):
       """アプリケーション固有の例外"""
       def __init__(self, message: str, status_code: int = 500):
           self.message = message
           self.status_code = status_code
           super().__init__(message)


   class VideoGenerationError(AppException):
       """動画生成エラー"""
       def __init__(self, message: str):
           super().__init__(message, status_code=500)


   class RateLimitError(AppException):
       """レート制限エラー"""
       def __init__(self, message: str = "Rate limit exceeded"):
           super().__init__(message, status_code=429)


   async def app_exception_handler(request: Request, exc: AppException):
       """AppException のハンドラー"""
       logger.error(f"AppException: {exc.message}")
       return JSONResponse(
           status_code=exc.status_code,
           content={"detail": exc.message},
       )


   async def general_exception_handler(request: Request, exc: Exception):
       """一般的な例外のハンドラー"""
       logger.exception(f"Unhandled exception: {exc}")
       return JSONResponse(
           status_code=500,
           content={"detail": "Internal server error"},
       )
   ```

3. **main.py に登録**

   `app/main.py` を更新：
   ```python
   from fastapi import FastAPI
   from fastapi.middleware.cors import CORSMiddleware
   from app.config import get_settings
   from app.api.v1.router import api_router
   from app.utils.logging import setup_logging
   from app.utils.exceptions import (
       AppException,
       app_exception_handler,
       general_exception_handler,
   )

   # ログ設定
   setup_logging()

   settings = get_settings()

   app = FastAPI(
       title="movie-maker API",
       description="AI動画生成サービスのバックエンドAPI",
       version="1.0.0",
   )

   # 例外ハンドラー登録
   app.add_exception_handler(AppException, app_exception_handler)
   app.add_exception_handler(Exception, general_exception_handler)

   # CORS設定
   app.add_middleware(
       CORSMiddleware,
       allow_origins=[
           "http://localhost:3000",
           "https://movie-maker.vercel.app",
       ],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )

   # ルーター登録
   app.include_router(api_router, prefix=settings.api_v1_prefix)


   @app.get("/")
   async def root():
       return {"message": "movie-maker API", "version": "1.0.0"}
   ```

### 完了条件

- [ ] `app/utils/logging.py` が作成されている
- [ ] `app/utils/exceptions.py` が作成されている
- [ ] ログが標準出力に出力される
- [ ] カスタム例外が適切なレスポンスを返す
- [ ] 未処理の例外が 500 エラーとして返される

---

# FE: フロントエンド（Next.js）

---

## FE-001: shadcn/ui 初期設定

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | なし（Next.js プロジェクト作成済み） |
| **推定作業時間** | 20分 |

### 概要
shadcn/ui をプロジェクトに導入し、基本的なUIコンポーネントをインストールする。

### 詳細手順

1. **shadcn/ui 初期化**

   ```bash
   cd /Users/noritakasawada/AI_P/practice/movie-maker
   npx shadcn@latest init
   ```

   質問への回答：
   - Which style would you like to use? → `Default`
   - Which color would you like to use as base color? → `Slate`
   - Would you like to use CSS variables for colors? → `yes`

2. **必要なコンポーネントをインストール**

   ```bash
   npx shadcn@latest add button
   npx shadcn@latest add card
   npx shadcn@latest add input
   npx shadcn@latest add label
   npx shadcn@latest add textarea
   npx shadcn@latest add select
   npx shadcn@latest add dialog
   npx shadcn@latest add dropdown-menu
   npx shadcn@latest add avatar
   npx shadcn@latest add progress
   npx shadcn@latest add toast
   npx shadcn@latest add skeleton
   npx shadcn@latest add tabs
   npx shadcn@latest add separator
   ```

3. **追加パッケージインストール**

   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   npm install lucide-react
   npm install clsx tailwind-merge
   ```

4. **utils.ts 確認**

   `lib/utils.ts` が以下の内容で作成されていることを確認：
   ```typescript
   import { clsx, type ClassValue } from "clsx"
   import { twMerge } from "tailwind-merge"

   export function cn(...inputs: ClassValue[]) {
     return twMerge(clsx(inputs))
   }
   ```

### 完了条件

- [ ] `components.json` が作成されている
- [ ] `components/ui/` ディレクトリに shadcn コンポーネントがある
- [ ] `lib/utils.ts` が存在する
- [ ] `@supabase/supabase-js` がインストールされている
- [ ] `npm run dev` でエラーなく起動する

---

## FE-002: Supabase クライアント設定

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-001, INFRA-001, INFRA-006 |
| **推定作業時間** | 30分 |

### 概要
Next.js で Supabase クライアントを設定し、サーバー/クライアントコンポーネント両方で使用できるようにする。

### 詳細手順

1. **Supabase クライアント作成**

   `lib/supabase/client.ts`:
   ```typescript
   import { createBrowserClient } from '@supabase/ssr'

   export function createClient() {
     return createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
     )
   }
   ```

   `lib/supabase/server.ts`:
   ```typescript
   import { createServerClient } from '@supabase/ssr'
   import { cookies } from 'next/headers'

   export async function createClient() {
     const cookieStore = await cookies()

     return createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return cookieStore.getAll()
           },
           setAll(cookiesToSet) {
             try {
               cookiesToSet.forEach(({ name, value, options }) =>
                 cookieStore.set(name, value, options)
               )
             } catch {
               // Server Component からの呼び出しでは無視
             }
           },
         },
       }
     )
   }
   ```

   `lib/supabase/middleware.ts`:
   ```typescript
   import { createServerClient } from '@supabase/ssr'
   import { NextResponse, type NextRequest } from 'next/server'

   export async function updateSession(request: NextRequest) {
     let supabaseResponse = NextResponse.next({
       request,
     })

     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return request.cookies.getAll()
           },
           setAll(cookiesToSet) {
             cookiesToSet.forEach(({ name, value }) =>
               request.cookies.set(name, value)
             )
             supabaseResponse = NextResponse.next({
               request,
             })
             cookiesToSet.forEach(({ name, value, options }) =>
               supabaseResponse.cookies.set(name, value, options)
             )
           },
         },
       }
     )

     const {
       data: { user },
     } = await supabase.auth.getUser()

     // 認証が必要なルートの保護
     const protectedRoutes = ['/dashboard', '/generate', '/history', '/settings']
     const isProtectedRoute = protectedRoutes.some(route =>
       request.nextUrl.pathname.startsWith(route)
     )

     if (isProtectedRoute && !user) {
       const url = request.nextUrl.clone()
       url.pathname = '/login'
       return NextResponse.redirect(url)
     }

     // ログイン済みユーザーがログインページにアクセスした場合
     if (request.nextUrl.pathname === '/login' && user) {
       const url = request.nextUrl.clone()
       url.pathname = '/dashboard'
       return NextResponse.redirect(url)
     }

     return supabaseResponse
   }
   ```

2. **Middleware 作成**

   `middleware.ts`（プロジェクトルート）:
   ```typescript
   import { type NextRequest } from 'next/server'
   import { updateSession } from '@/lib/supabase/middleware'

   export async function middleware(request: NextRequest) {
     return await updateSession(request)
   }

   export const config = {
     matcher: [
       '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
     ],
   }
   ```

3. **型定義**

   `types/supabase.ts`:
   ```typescript
   export type User = {
     id: string
     email: string
     display_name: string | null
     plan_type: 'free' | 'starter' | 'pro' | 'business'
     video_count_this_month: number
     trial_videos_remaining: number
     created_at: string
   }

   export type Template = {
     id: string
     name: string
     description: string | null
     prompt_template: string
     style_keywords: string[]
     thumbnail_url: string | null
   }

   export type BGMTrack = {
     id: string
     name: string
     description: string | null
     file_url: string
     duration_seconds: number | null
     mood: string | null
   }

   export type VideoGeneration = {
     id: string
     user_id: string
     template_id: string | null
     original_image_url: string
     user_prompt: string
     optimized_prompt: string | null
     overlay_text: string | null
     overlay_position: 'top' | 'center' | 'bottom'
     overlay_font: string
     overlay_color: string
     bgm_track_id: string | null
     status: 'pending' | 'processing' | 'completed' | 'failed'
     progress: number
     error_message: string | null
     raw_video_url: string | null
     final_video_url: string | null
     expires_at: string | null
     created_at: string
   }
   ```

### 完了条件

- [ ] `lib/supabase/client.ts` が作成されている
- [ ] `lib/supabase/server.ts` が作成されている
- [ ] `lib/supabase/middleware.ts` が作成されている
- [ ] `middleware.ts` が作成されている
- [ ] `types/supabase.ts` が作成されている
- [ ] 保護されたルートに未認証でアクセスすると `/login` にリダイレクトされる

---

## FE-003: API クライアント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-002 |
| **推定作業時間** | 30分 |

### 概要
バックエンド API と通信するためのクライアントを実装する。

### 詳細手順

1. **API クライアント作成**

   `lib/api/client.ts`:
   ```typescript
   import { createClient } from '@/lib/supabase/client'

   const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

   async function getAuthHeader(): Promise<Record<string, string>> {
     const supabase = createClient()
     const { data: { session } } = await supabase.auth.getSession()

     if (!session?.access_token) {
       throw new Error('Not authenticated')
     }

     return {
       'Authorization': `Bearer ${session.access_token}`,
       'Content-Type': 'application/json',
     }
   }

   export async function apiGet<T>(endpoint: string): Promise<T> {
     const headers = await getAuthHeader()
     const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
       method: 'GET',
       headers,
     })

     if (!response.ok) {
       const error = await response.json()
       throw new Error(error.detail || 'API request failed')
     }

     return response.json()
   }

   export async function apiPost<T>(endpoint: string, data: unknown): Promise<T> {
     const headers = await getAuthHeader()
     const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
       method: 'POST',
       headers,
       body: JSON.stringify(data),
     })

     if (!response.ok) {
       const error = await response.json()
       throw new Error(error.detail || 'API request failed')
     }

     return response.json()
   }

   export async function apiDelete<T>(endpoint: string): Promise<T> {
     const headers = await getAuthHeader()
     const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
       method: 'DELETE',
       headers,
     })

     if (!response.ok) {
       const error = await response.json()
       throw new Error(error.detail || 'API request failed')
     }

     return response.json()
   }

   // 認証不要のAPI用
   export async function apiGetPublic<T>(endpoint: string): Promise<T> {
     const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
       method: 'GET',
       headers: {
         'Content-Type': 'application/json',
       },
     })

     if (!response.ok) {
       const error = await response.json()
       throw new Error(error.detail || 'API request failed')
     }

     return response.json()
   }
   ```

2. **API 関数作成**

   `lib/api/templates.ts`:
   ```typescript
   import { apiGetPublic } from './client'
   import type { Template } from '@/types/supabase'

   export async function getTemplates(): Promise<Template[]> {
     return apiGetPublic<Template[]>('/templates')
   }

   export async function getTemplate(id: string): Promise<Template> {
     return apiGetPublic<Template>(`/templates/${id}`)
   }
   ```

   `lib/api/bgm.ts`:
   ```typescript
   import { apiGetPublic } from './client'
   import type { BGMTrack } from '@/types/supabase'

   export async function getBGMTracks(): Promise<BGMTrack[]> {
     return apiGetPublic<BGMTrack[]>('/bgm')
   }
   ```

   `lib/api/generate.ts`:
   ```typescript
   import { apiPost, apiGet } from './client'

   export interface GenerateRequest {
     template_id?: string
     image_url: string
     prompt: string
     overlay?: {
       text?: string
       position?: 'top' | 'center' | 'bottom'
       font?: string
       color?: string
     }
     bgm_track_id?: string
   }

   export interface GenerateResponse {
     id: string
     status: 'pending' | 'processing' | 'completed' | 'failed'
     estimated_time_seconds: number
     created_at: string
   }

   export interface StatusResponse {
     id: string
     status: 'pending' | 'processing' | 'completed' | 'failed'
     progress: number
     message: string
     video_url: string | null
     expires_at: string | null
   }

   export async function generateVideo(data: GenerateRequest): Promise<GenerateResponse> {
     return apiPost<GenerateResponse>('/generate', data)
   }

   export async function getGenerationStatus(id: string): Promise<StatusResponse> {
     return apiGet<StatusResponse>(`/generate/${id}/status`)
   }
   ```

   `lib/api/history.ts`:
   ```typescript
   import { apiGet, apiDelete } from './client'

   export interface HistoryItem {
     id: string
     template_name: string | null
     user_prompt: string
     status: 'pending' | 'processing' | 'completed' | 'failed'
     final_video_url: string | null
     created_at: string
     expires_at: string | null
   }

   export interface HistoryResponse {
     items: HistoryItem[]
     total: number
     limit: number
     offset: number
   }

   export async function getHistory(limit = 20, offset = 0): Promise<HistoryResponse> {
     return apiGet<HistoryResponse>(`/history?limit=${limit}&offset=${offset}`)
   }

   export async function deleteHistoryItem(id: string): Promise<{ message: string }> {
     return apiDelete<{ message: string }>(`/history/${id}`)
   }
   ```

   `lib/api/upload.ts`:
   ```typescript
   import { apiPost } from './client'

   interface PresignedUrlResponse {
     upload_url: string
     file_url: string
   }

   export async function getPresignedUploadUrl(
     fileName: string,
     contentType: string
   ): Promise<PresignedUrlResponse> {
     return apiPost<PresignedUrlResponse>('/upload/presigned-url', {
       file_name: fileName,
       content_type: contentType,
     })
   }

   export async function uploadFileToR2(
     presignedUrl: string,
     file: File
   ): Promise<void> {
     const response = await fetch(presignedUrl, {
       method: 'PUT',
       body: file,
       headers: {
         'Content-Type': file.type,
       },
     })

     if (!response.ok) {
       throw new Error('Failed to upload file')
     }
   }
   ```

   `lib/api/user.ts`:
   ```typescript
   import { apiGet } from './client'

   export interface UserUsage {
     plan_type: 'free' | 'starter' | 'pro' | 'business'
     video_count_this_month: number
     monthly_limit: number
     trial_videos_remaining: number
     can_generate: boolean
   }

   export async function getUserUsage(): Promise<UserUsage> {
     return apiGet<UserUsage>('/user/usage')
   }
   ```

### 完了条件

- [ ] `lib/api/client.ts` が作成されている
- [ ] `lib/api/templates.ts` が作成されている
- [ ] `lib/api/bgm.ts` が作成されている
- [ ] `lib/api/generate.ts` が作成されている
- [ ] `lib/api/history.ts` が作成されている
- [ ] `lib/api/upload.ts` が作成されている
- [ ] `lib/api/user.ts` が作成されている

---

## FE-004: 共通レイアウト実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-001, FE-002 |
| **推定作業時間** | 45分 |

### 概要
ヘッダー、サイドバー、フッターを含む共通レイアウトを実装する。

### 詳細手順

1. **ヘッダーコンポーネント**

   `components/layout/Header.tsx`:
   ```typescript
   'use client'

   import Link from 'next/link'
   import { useRouter } from 'next/navigation'
   import { createClient } from '@/lib/supabase/client'
   import { Button } from '@/components/ui/button'
   import {
     DropdownMenu,
     DropdownMenuContent,
     DropdownMenuItem,
     DropdownMenuSeparator,
     DropdownMenuTrigger,
   } from '@/components/ui/dropdown-menu'
   import { Avatar, AvatarFallback } from '@/components/ui/avatar'
   import { User, LogOut, Settings, CreditCard } from 'lucide-react'

   interface HeaderProps {
     user: {
       email: string
       user_metadata?: {
         full_name?: string
         avatar_url?: string
       }
     } | null
   }

   export function Header({ user }: HeaderProps) {
     const router = useRouter()
     const supabase = createClient()

     const handleSignOut = async () => {
       await supabase.auth.signOut()
       router.push('/')
       router.refresh()
     }

     const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
     const initials = displayName.slice(0, 2).toUpperCase()

     return (
       <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
         <div className="container flex h-14 items-center">
           <Link href={user ? '/dashboard' : '/'} className="flex items-center space-x-2">
             <span className="font-bold text-xl">movie-maker</span>
           </Link>

           <nav className="flex items-center space-x-6 ml-6">
             {user && (
               <>
                 <Link href="/generate" className="text-sm font-medium hover:text-primary">
                   動画を作成
                 </Link>
                 <Link href="/history" className="text-sm font-medium hover:text-primary">
                   履歴
                 </Link>
               </>
             )}
             <Link href="/pricing" className="text-sm font-medium hover:text-primary">
               料金プラン
             </Link>
           </nav>

           <div className="ml-auto flex items-center space-x-4">
             {user ? (
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                     <Avatar className="h-8 w-8">
                       <AvatarFallback>{initials}</AvatarFallback>
                     </Avatar>
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent className="w-56" align="end" forceMount>
                   <div className="flex items-center justify-start gap-2 p-2">
                     <div className="flex flex-col space-y-1 leading-none">
                       <p className="font-medium">{displayName}</p>
                       <p className="text-xs text-muted-foreground">{user.email}</p>
                     </div>
                   </div>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem asChild>
                     <Link href="/dashboard">
                       <User className="mr-2 h-4 w-4" />
                       ダッシュボード
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuItem asChild>
                     <Link href="/settings">
                       <Settings className="mr-2 h-4 w-4" />
                       設定
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuItem asChild>
                     <Link href="/pricing">
                       <CreditCard className="mr-2 h-4 w-4" />
                       プランを変更
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={handleSignOut}>
                     <LogOut className="mr-2 h-4 w-4" />
                     ログアウト
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             ) : (
               <Button asChild>
                 <Link href="/login">ログイン</Link>
               </Button>
             )}
           </div>
         </div>
       </header>
     )
   }
   ```

2. **フッターコンポーネント**

   `components/layout/Footer.tsx`:
   ```typescript
   import Link from 'next/link'

   export function Footer() {
     return (
       <footer className="border-t py-6 md:py-0">
         <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
           <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
             © 2025 movie-maker. All rights reserved.
           </p>
           <div className="flex items-center space-x-4">
             <Link href="/terms" className="text-sm text-muted-foreground hover:underline">
               利用規約
             </Link>
             <Link href="/privacy" className="text-sm text-muted-foreground hover:underline">
               プライバシーポリシー
             </Link>
             <Link href="/contact" className="text-sm text-muted-foreground hover:underline">
               お問い合わせ
             </Link>
           </div>
         </div>
       </footer>
     )
   }
   ```

3. **ルートレイアウト更新**

   `app/layout.tsx`:
   ```typescript
   import type { Metadata } from 'next'
   import { Geist, Geist_Mono } from 'next/font/google'
   import { createClient } from '@/lib/supabase/server'
   import { Header } from '@/components/layout/Header'
   import { Footer } from '@/components/layout/Footer'
   import { Toaster } from '@/components/ui/toaster'
   import './globals.css'

   const geistSans = Geist({
     variable: '--font-geist-sans',
     subsets: ['latin'],
   })

   const geistMono = Geist_Mono({
     variable: '--font-geist-mono',
     subsets: ['latin'],
   })

   export const metadata: Metadata = {
     title: 'movie-maker | AI動画生成サービス',
     description: '画像とテキストから5秒の縦型ショート動画を生成',
   }

   export default async function RootLayout({
     children,
   }: {
     children: React.ReactNode
   }) {
     const supabase = await createClient()
     const { data: { user } } = await supabase.auth.getUser()

     return (
       <html lang="ja">
         <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
           <Header user={user} />
           <main className="flex-1">
             {children}
           </main>
           <Footer />
           <Toaster />
         </body>
       </html>
     )
   }
   ```

### 完了条件

- [ ] `components/layout/Header.tsx` が作成されている
- [ ] `components/layout/Footer.tsx` が作成されている
- [ ] `app/layout.tsx` が更新されている
- [ ] ヘッダーにナビゲーションリンクが表示される
- [ ] ログイン状態によってヘッダーの表示が切り替わる

---

## FE-005: ランディングページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-004 |
| **推定作業時間** | 60分 |

### 概要
未ログインユーザー向けのランディングページを実装する。

### 詳細手順

`app/page.tsx` を以下の内容で置き換え：
- ヒーローセクション（キャッチコピー + CTA）
- 機能紹介セクション（3つの特徴）
- 料金プラン概要
- CTA セクション

### 完了条件

- [ ] ヒーローセクションが表示される
- [ ] 「無料で始める」ボタンが `/login` にリンク
- [ ] 機能紹介が3つ表示される
- [ ] レスポンシブ対応している

---

## FE-006: ログインページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-002 |
| **推定作業時間** | 30分 |

### 概要
Google OAuth ログインページを実装する。

### 詳細手順

1. `app/login/page.tsx` を作成
2. Google ログインボタンを配置
3. Supabase Auth の `signInWithOAuth` を呼び出す
4. `app/auth/callback/route.ts` でコールバック処理

### 完了条件

- [ ] `/login` ページが表示される
- [ ] Google ログインボタンをクリックすると Google 認証画面に遷移
- [ ] 認証成功後 `/dashboard` にリダイレクト
- [ ] 認証失敗時にエラーメッセージが表示される

---

## FE-007: ダッシュボードページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-003, FE-004 |
| **推定作業時間** | 45分 |

### 概要
ログイン後のダッシュボードページを実装する。

### 詳細手順

1. `app/dashboard/page.tsx` を作成
2. 使用状況（今月の生成数/上限）を表示
3. 「動画を作成」CTAボタン
4. 最近の履歴（3件）を表示

### 完了条件

- [ ] `/dashboard` ページが表示される
- [ ] 使用状況が正しく表示される
- [ ] 「動画を作成」ボタンが `/generate` にリンク
- [ ] 最近の履歴が表示される

---

## FE-008: 画像アップローダーコンポーネント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-003 |
| **推定作業時間** | 60分 |

### 概要
画像をドラッグ&ドロップでアップロードできるコンポーネントを実装する。

### 詳細手順

1. `components/generate/ImageUploader.tsx` を作成
2. ドラッグ&ドロップ対応
3. ファイル選択ダイアログ対応
4. プレビュー表示
5. R2 への署名付きURLアップロード

### 完了条件

- [ ] ドラッグ&ドロップで画像を選択できる
- [ ] クリックでファイル選択ダイアログが開く
- [ ] 選択した画像のプレビューが表示される
- [ ] アップロード進捗が表示される
- [ ] アップロード完了後に画像URLが返される

---

## FE-009: テンプレートセレクターコンポーネント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-003 |
| **推定作業時間** | 30分 |

### 概要
テンプレートを選択するコンポーネントを実装する。

### 詳細手順

1. `components/generate/TemplateSelector.tsx` を作成
2. API からテンプレート一覧を取得
3. カード形式で表示
4. 選択状態を管理

### 完了条件

- [ ] テンプレート一覧が表示される
- [ ] テンプレートをクリックで選択できる
- [ ] 選択中のテンプレートがハイライトされる
- [ ] 「テンプレートなし」オプションがある

---

## FE-010: プロンプト入力コンポーネント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-001 |
| **推定作業時間** | 20分 |

### 概要
プロンプトを入力するテキストエリアコンポーネントを実装する。

### 詳細手順

1. `components/generate/PromptInput.tsx` を作成
2. テキストエリア + 文字数カウンター
3. プレースホルダーで入力例を表示
4. 500文字制限

### 完了条件

- [ ] テキストエリアが表示される
- [ ] 文字数カウンターが表示される
- [ ] 500文字を超えると警告が表示される

---

## FE-011: テキストオーバーレイエディターコンポーネント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-001 |
| **推定作業時間** | 45分 |

### 概要
動画に追加するテキストオーバーレイの設定コンポーネントを実装する。

### 詳細手順

1. `components/generate/TextOverlayEditor.tsx` を作成
2. テキスト入力フィールド
3. 位置選択（上/中央/下）
4. フォント選択（3種類）
5. 色選択（カラーピッカー）

### 完了条件

- [ ] テキスト入力ができる
- [ ] 位置を選択できる
- [ ] フォントを選択できる
- [ ] 色を選択できる
- [ ] 「テキストなし」オプションがある

---

## FE-012: BGMセレクターコンポーネント実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-003 |
| **推定作業時間** | 30分 |

### 概要
BGMを選択するコンポーネントを実装する。

### 詳細手順

1. `components/generate/BGMSelector.tsx` を作成
2. API から BGM 一覧を取得
3. 試聴ボタン付きリスト表示
4. 選択状態を管理

### 完了条件

- [ ] BGM 一覧が表示される
- [ ] 試聴ボタンで音声を再生できる
- [ ] BGM を選択できる
- [ ] 「BGMなし」オプションがある

---

## FE-013: 動画生成ページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-008, FE-009, FE-010, FE-011, FE-012 |
| **推定作業時間** | 60分 |

### 概要
動画生成のメインページを実装する。

### 詳細手順

1. `app/generate/page.tsx` を作成
2. 各コンポーネントを配置
3. フォームバリデーション
4. 生成リクエスト送信
5. 進捗ページへリダイレクト

### 完了条件

- [ ] すべてのコンポーネントが正しく配置されている
- [ ] 画像とプロンプトが必須
- [ ] 「生成開始」ボタンでリクエストが送信される
- [ ] 生成開始後、進捗ページにリダイレクトされる
- [ ] 生成上限に達している場合はエラーメッセージが表示される

---

## FE-014: 進捗表示ページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | FE-003 |
| **推定作業時間** | 45分 |

### 概要
動画生成の進捗をリアルタイムで表示するページを実装する。

### 詳細手順

1. `app/generate/[id]/page.tsx` を作成
2. 3秒間隔でステータスをポーリング
3. プログレスバー表示
4. 完了時に動画プレビュー表示
5. ダウンロードボタン

### 完了条件

- [ ] 進捗がリアルタイムで更新される
- [ ] プログレスバーが進捗に応じて増加する
- [ ] 完了時に動画が自動再生される
- [ ] ダウンロードボタンが機能する
- [ ] エラー時にエラーメッセージが表示される

---

## FE-015: 履歴一覧ページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-003, FE-004 |
| **推定作業時間** | 45分 |

### 概要
過去の動画生成履歴を一覧表示するページを実装する。

### 詳細手順

1. `app/history/page.tsx` を作成
2. 履歴一覧を取得
3. カード形式で表示
4. ステータスバッジ（完了/処理中/失敗）
5. 削除ボタン

### 完了条件

- [ ] 履歴一覧が表示される
- [ ] ステータスに応じたバッジが表示される
- [ ] 完了した動画をクリックするとプレビューが表示される
- [ ] 削除ボタンで履歴が削除される
- [ ] 履歴がない場合は空状態メッセージが表示される

---

## FE-016: 料金プランページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P2 |
| **前提条件** | FE-004 |
| **推定作業時間** | 45分 |

### 概要
料金プランを表示し、Polar 決済に誘導するページを実装する。

### 詳細手順

1. `app/pricing/page.tsx` を作成
2. 3つのプランをカード形式で表示
3. 各プランの機能比較表
4. Polar チェックアウトへのリンク

### 完了条件

- [ ] 3つのプランが表示される
- [ ] 各プランの機能が一覧表示される
- [ ] 現在のプランがハイライトされる
- [ ] 「アップグレード」ボタンが Polar にリンク

---

## FE-017: 設定ページ実装

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P2 |
| **前提条件** | FE-003, FE-004 |
| **推定作業時間** | 30分 |

### 概要
ユーザー設定ページを実装する。

### 詳細手順

1. `app/settings/page.tsx` を作成
2. 表示名の変更
3. 現在のプラン表示
4. アカウント削除ボタン

### 完了条件

- [ ] 現在のプラン情報が表示される
- [ ] ログアウトボタンが機能する
- [ ] アカウント削除の確認ダイアログがある

---

## FE-018: レスポンシブ対応・最終調整

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | FE-005〜FE-017 |
| **推定作業時間** | 60分 |

### 概要
全ページのレスポンシブ対応とUI調整を行う。

### 詳細手順

1. モバイルでの表示確認
2. タブレットでの表示確認
3. ヘッダーのハンバーガーメニュー対応
4. 各ページのスペーシング調整
5. ローディング状態の統一

### 完了条件

- [ ] モバイル（375px）で正しく表示される
- [ ] タブレット（768px）で正しく表示される
- [ ] デスクトップ（1024px以上）で正しく表示される
- [ ] すべてのインタラクティブ要素がタッチ対応している

---

# CONT: コンテンツ準備

---

## CONT-001: テンプレート設計・データ投入

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | INFRA-004 |
| **推定作業時間** | 60分 |

### 概要
5種類のテンプレートを設計し、Supabase に投入する。

### 詳細手順

1. **テンプレートデータを作成**

   ```sql
   INSERT INTO templates (name, description, prompt_template, style_keywords, sort_order) VALUES
   (
     '商品紹介',
     'ECサイト向け商品紹介動画に最適',
     'A cinematic product showcase video featuring the subject with elegant, professional lighting. The camera slowly orbits around the product, highlighting its details and craftsmanship. Soft shadows and a clean, minimal background emphasize the premium quality.',
     ARRAY['cinematic', 'product showcase', 'elegant', 'professional', 'premium'],
     1
   ),
   (
     'SNS向け',
     'TikTok/Instagram向けのダイナミックな動画',
     'A dynamic, eye-catching video with trendy visual effects and energetic movement. Quick camera movements and vibrant colors create an engaging social media style. Modern and youthful atmosphere with attention-grabbing transitions.',
     ARRAY['dynamic', 'eye-catching', 'trendy', 'social media', 'energetic'],
     2
   ),
   (
     'ビジネス',
     'プレゼンテーション・広告向け',
     'A clean, corporate video with modern aesthetics and professional presentation style. Smooth camera movements and balanced composition convey trust and reliability. Subtle animations and refined color grading.',
     ARRAY['corporate', 'clean', 'modern', 'professional', 'business'],
     3
   ),
   (
     'ライフスタイル',
     '日常・ブログ向けの温かみのある動画',
     'A warm, lifestyle video with natural lighting and cozy atmosphere. Gentle camera movements create a relaxed, authentic feeling. Soft focus and warm color tones evoke comfort and everyday beauty.',
     ARRAY['warm', 'lifestyle', 'natural', 'cozy', 'authentic'],
     4
   ),
   (
     'ドラマチック',
     'インパクト重視の迫力ある動画',
     'A dramatic, epic video with cinematic lighting and powerful visual impact. Bold camera angles and intense atmosphere create a sense of grandeur. High contrast and dynamic composition for maximum effect.',
     ARRAY['dramatic', 'epic', 'cinematic', 'powerful', 'intense'],
     5
   );
   ```

### 完了条件

- [ ] 5つのテンプレートが Supabase に登録されている
- [ ] API から正しく取得できる
- [ ] 各テンプレートの説明が日本語で記載されている

---

## CONT-002: BGM選定・データ投入

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | INFRA-003, INFRA-004 |
| **推定作業時間** | 90分 |

### 概要
著作権フリーのBGM 5曲を選定し、R2にアップロード、Supabaseに登録する。

### 詳細手順

1. **音源の選定**
   - Pixabay (https://pixabay.com/music/)
   - Mixkit (https://mixkit.co/free-stock-music/)
   から以下のムードの曲を選定：
   - Upbeat（アップビート）
   - Corporate（ビジネス）
   - Acoustic（アコースティック）
   - Cinematic（シネマティック）
   - Pop（ポップ）

2. **R2 にアップロード**
   - ファイル名: `bgm_01_upbeat.mp3`, `bgm_02_corporate.mp3`, ...
   - パス: `bgm/`

3. **Supabase にデータ投入**

   ```sql
   INSERT INTO bgm_tracks (name, description, file_url, duration_seconds, mood) VALUES
   ('Upbeat Energy', 'アップテンポで明るい曲', 'https://xxx.r2.dev/bgm/bgm_01_upbeat.mp3', 30, 'upbeat'),
   ('Corporate Success', 'ビジネス向けの落ち着いた曲', 'https://xxx.r2.dev/bgm/bgm_02_corporate.mp3', 30, 'corporate'),
   ('Gentle Acoustic', '穏やかなアコースティック', 'https://xxx.r2.dev/bgm/bgm_03_acoustic.mp3', 30, 'calm'),
   ('Epic Cinematic', 'ドラマチックな映画風', 'https://xxx.r2.dev/bgm/bgm_04_cinematic.mp3', 30, 'dramatic'),
   ('Modern Pop', '現代的なポップ', 'https://xxx.r2.dev/bgm/bgm_05_pop.mp3', 30, 'pop');
   ```

### 完了条件

- [ ] 5曲の著作権フリーBGMがダウンロードされている
- [ ] R2 にアップロードされている
- [ ] Supabase に登録されている
- [ ] API から正しく取得できる
- [ ] 各曲が再生できる

---

## CONT-003: 日本語フォント準備

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-009 |
| **推定作業時間** | 30分 |

### 概要
FFmpegで使用する日本語フォントを準備する。

### 詳細手順

1. **フォントのダウンロード**
   - Noto Sans JP: https://fonts.google.com/noto/specimen/Noto+Sans+JP
   - Noto Serif JP: https://fonts.google.com/noto/specimen/Noto+Serif+JP
   - M PLUS Rounded 1c: https://fonts.google.com/specimen/M+PLUS+Rounded+1c

2. **Dockerfile 更新**
   - フォントファイルを Docker イメージに含める
   - または `fonts-noto-cjk` パッケージを使用（BE-009で対応済み）

3. **フォントパス確認**
   - FFmpegService で参照するパスが正しいことを確認

### 完了条件

- [ ] Docker イメージに日本語フォントが含まれている
- [ ] FFmpeg でテキストオーバーレイが正しく表示される
- [ ] 3種類のフォントが使用可能

---

# TEST: テスト・デプロイ

---

## TEST-001: バックエンドテスト

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P1 |
| **前提条件** | BE-001〜BE-015 |
| **推定作業時間** | 120分 |

### 概要
バックエンド API のテストを実装・実行する。

### 詳細手順

1. **pytest インストール**
   ```bash
   pip install pytest pytest-asyncio httpx
   ```

2. **テストファイル作成**
   - `tests/test_health.py`
   - `tests/test_templates.py`
   - `tests/test_generate.py`

3. **テスト実行**
   ```bash
   cd backend
   pytest
   ```

### 完了条件

- [ ] 全エンドポイントのテストが存在する
- [ ] テストがすべてパスする
- [ ] エラーケースのテストがある

---

## TEST-002: フロントエンドテスト

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P2 |
| **前提条件** | FE-001〜FE-018 |
| **推定作業時間** | 60分 |

### 概要
フロントエンドの手動テストを実施する。

### 詳細手順

1. **テストケース確認**
   - ログイン/ログアウト
   - 動画生成フロー
   - 履歴表示・削除
   - 各ページの表示

2. **クロスブラウザテスト**
   - Chrome
   - Safari
   - Firefox

3. **モバイルテスト**
   - iOS Safari
   - Android Chrome

### 完了条件

- [ ] 全ページが正しく表示される
- [ ] 動画生成フローが完了する
- [ ] モバイルで操作可能

---

## TEST-003: 本番デプロイ

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P0（最優先） |
| **前提条件** | TEST-001, TEST-002 |
| **推定作業時間** | 60分 |

### 概要
本番環境へのデプロイを実施する。

### 詳細手順

1. **Vercel デプロイ**
   - GitHub リポジトリを接続
   - 環境変数を設定
   - デプロイ実行

2. **Railway デプロイ**
   - GitHub リポジトリを接続（backend ディレクトリ）
   - 環境変数を設定
   - デプロイ実行

3. **環境変数更新**
   - `NEXT_PUBLIC_API_URL` を本番URLに更新
   - CORS設定を本番ドメインに更新

4. **動作確認**
   - 本番環境でログイン
   - 動画生成テスト

### 完了条件

- [ ] Vercel に Next.js がデプロイされている
- [ ] Railway に FastAPI がデプロイされている
- [ ] 本番URLでアクセスできる
- [ ] 動画生成が本番環境で動作する

---

## TEST-004: ドメイン設定

| 項目 | 内容 |
|:---|:---|
| **ステータス** | 未着手 |
| **担当** | （未割当） |
| **優先度** | P2 |
| **前提条件** | TEST-003 |
| **推定作業時間** | 30分 |

### 概要
カスタムドメインを設定する。

### 詳細手順

1. **ドメイン取得**（任意）
   - お好みのドメインレジストラで取得

2. **Vercel ドメイン設定**
   - Settings > Domains で追加
   - DNS設定を反映

3. **Supabase Redirect URL 更新**
   - 新しいドメインを追加

4. **Google OAuth 更新**
   - 承認済みリダイレクトURIを更新

### 完了条件

- [ ] カスタムドメインでアクセスできる
- [ ] HTTPS が有効
- [ ] OAuth が正しく動作する

---

# チケット一覧（依存関係順）

以下の順序で作業を進めることを推奨：

## Phase 1: インフラ構築（並列可能）
- INFRA-001: Supabase プロジェクト作成
- INFRA-003: Cloudflare R2 バケット作成
- INFRA-005: Railway プロジェクト作成

## Phase 2: インフラ設定
- INFRA-002: Supabase Auth設定（INFRA-001 後）
- INFRA-004: データベーステーブル作成（INFRA-001 後）
- INFRA-006: 環境変数設定（INFRA-001, 002, 003 後）

## Phase 3: バックエンド基盤（順次）
- BE-001: FastAPI プロジェクト初期化
- BE-002: Supabase クライアント実装
- BE-003: 認証ミドルウェア実装
- BE-015: エラーハンドリング・ログ設定

## Phase 4: バックエンド API（並列可能）
- BE-004: テンプレート API
- BE-005: BGM API
- BE-006: R2 サービス
- BE-007: OpenAI サービス
- BE-008: KlingAI サービス
- BE-009: FFmpeg サービス

## Phase 5: バックエンド統合
- BE-010: 動画生成 API（BE-006, 007, 008, 009 後）
- BE-011: 履歴 API
- BE-012: ユーザー API
- BE-013: Polar Webhook
- BE-014: 月次リセットバッチ

## Phase 6: フロントエンド基盤（順次）
- FE-001: shadcn/ui 初期設定
- FE-002: Supabase クライアント設定
- FE-003: API クライアント実装
- FE-004: 共通レイアウト

## Phase 7: フロントエンドページ（並列可能）
- FE-005: ランディングページ
- FE-006: ログインページ
- FE-007: ダッシュボード
- FE-016: 料金プランページ
- FE-017: 設定ページ

## Phase 8: 動画生成機能
- FE-008: 画像アップローダー
- FE-009: テンプレートセレクター
- FE-010: プロンプト入力
- FE-011: テキストオーバーレイエディター
- FE-012: BGMセレクター
- FE-013: 動画生成ページ
- FE-014: 進捗表示ページ
- FE-015: 履歴一覧ページ

## Phase 9: コンテンツ（並列可能）
- CONT-001: テンプレート投入
- CONT-002: BGM投入
- CONT-003: フォント準備

## Phase 10: 最終調整・デプロイ
- FE-018: レスポンシブ対応
- TEST-001: バックエンドテスト
- TEST-002: フロントエンドテスト
- TEST-003: 本番デプロイ
- TEST-004: ドメイン設定

---

**更新履歴:**
- 2025-12-21: 初版作成（46チケット）
