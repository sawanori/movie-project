# API Keys 発行・設定ガイド

このドキュメントでは、movie-maker プロジェクトで必要な全APIキーの発行方法を説明します。

---

## 1. Google API Key (Gemini AI)

### 用途
- 画像分析
- ストーリー提案
- プロンプト最適化
- AI画像生成

### 発行手順

1. **Google AI Studio にアクセス**
   - URL: https://aistudio.google.com/apikey

2. **Googleアカウントでログイン**

3. **APIキーを作成**
   - 左メニューの「Get API key」をクリック
   - 「Create API key」ボタンをクリック
   - プロジェクトを選択（なければ「Create API key in new project」）

4. **キーをコピー**
   - 表示されたAPIキーをコピー
   - 形式: `AIza...` で始まる文字列

### 環境変数
```
GOOGLE_API_KEY=AIzaSy.....your-key-here
```

---

## 2. Supabase (データベース・認証)

### 用途
- ユーザー認証
- データベース (PostgreSQL)
- ストレージ

### 発行手順

1. **Supabase Dashboard にアクセス**
   - URL: https://supabase.com/dashboard

2. **プロジェクトを選択**
   - 左サイドバーからプロジェクトをクリック

3. **Project Settings に移動**
   - 左下の歯車アイコン「Project Settings」をクリック

4. **API セクション**
   - 左メニューの「API」をクリック

5. **必要な値をコピー**
   - **Project URL**: `https://xxxxx.supabase.co` の形式
   - **anon public key**: `eyJhbG...` で始まる長い文字列（公開可能）
   - **service_role key**: `eyJhbG...` で始まる長い文字列（秘密！）
     - 「Reveal」ボタンをクリックして表示

### 環境変数
```
# バックエンド用
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbG...service_role_key（秘密鍵）

# フロントエンド用
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...anon_key（公開鍵）
```

### キーのローテーション（漏洩時）

1. Project Settings → API
2. 「JWT Settings」セクション
3. 「Generate new JWT secret」をクリック
4. 確認ダイアログで「Generate」
5. 新しいキーが発行される（古いキーは即座に無効化）

---

## 3. KlingAI API Key (動画生成)

### 用途
- AI動画生成

### 発行手順

1. **KlingAI 開発者ポータルにアクセス**
   - URL: https://klingai.com/
   - または https://platform.klingai.com/

2. **アカウント作成/ログイン**
   - 右上の「Sign Up」または「Log In」

3. **API Keys ページに移動**
   - ログイン後、右上のアカウントメニュー
   - 「API Keys」または「Developer」をクリック

4. **新しいAPIキーを作成**
   - 「Create API Key」ボタンをクリック
   - キー名を入力（例: "movie-maker-prod"）
   - 「Create」をクリック

5. **Access Key と Secret Key をコピー**
   - Access Key ID と Secret Access Key の両方が必要
   - 作成時に1度だけ表示されるので必ずコピー

### 環境変数
```
KLING_ACCESS_KEY=your-access-key-id
KLING_SECRET_KEY=your-secret-access-key
```

---

## 4. Cloudflare R2 (ストレージ)

### 用途
- 画像アップロード
- 動画保存
- 静的ファイル配信

### 発行手順

1. **Cloudflare Dashboard にアクセス**
   - URL: https://dash.cloudflare.com/

2. **R2 に移動**
   - 左サイドバーの「R2 Object Storage」をクリック

3. **バケットを作成（初回のみ）**
   - 「Create bucket」をクリック
   - バケット名を入力（例: "movie-maker-storage"）
   - リージョンを選択（APAC推奨）
   - 「Create bucket」

4. **APIトークンを作成**
   - R2 ページ右上の「Manage R2 API Tokens」をクリック
   - 「Create API token」をクリック

5. **トークン設定**
   - Token name: 任意（例: "movie-maker-api"）
   - Permissions: 「Object Read & Write」を選択
   - Specify bucket(s): 作成したバケットを選択
   - TTL: 必要に応じて設定
   - 「Create API Token」をクリック

6. **認証情報をコピー**
   - Access Key ID
   - Secret Access Key
   - エンドポイントURL（R2のOverviewページに記載）

### 環境変数
```
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=movie-maker-storage
R2_ENDPOINT=https://xxxxxxxxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-custom-domain.com または R2のパブリックURL
```

### パブリックアクセス設定

1. バケットを選択
2. 「Settings」タブ
3. 「Public Access」セクション
4. 「Allow Access」を有効化
5. カスタムドメインまたはR2.devサブドメインを設定

---

## 5. Polar (決済・サブスクリプション)

### 用途
- サブスクリプション管理
- 決済処理
- Webhook受信

### 発行手順

1. **Polar Dashboard にアクセス**
   - URL: https://polar.sh/

2. **ログイン**
   - GitHubアカウントでログイン

3. **Organization Settings に移動**
   - 左サイドバーの「Settings」

4. **Developers セクション**
   - 「Developers」または「API」タブをクリック

5. **APIキーを作成**
   - 「Create Access Token」をクリック
   - トークン名を入力
   - 権限を選択（必要な範囲のみ）
   - 「Create」

6. **Webhook Secret を取得**
   - 「Webhooks」セクション
   - エンドポイントURLを設定: `https://your-api.com/api/v1/webhooks/polar`
   - イベントを選択（subscription.created, subscription.updated など）
   - 作成後、Webhook Secret が表示される

### 環境変数
```
POLAR_ACCESS_TOKEN=polar_at_...your-access-token
POLAR_WEBHOOK_SECRET=whsec_...your-webhook-secret
POLAR_ORGANIZATION_ID=your-org-id（ダッシュボードURLから取得）
```

---

## 環境変数ファイルのテンプレート

### バックエンド (.env)
```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbG...service_role_key

# Google AI (Gemini)
GOOGLE_API_KEY=AIzaSy...

# KlingAI
KLING_ACCESS_KEY=xxx
KLING_SECRET_KEY=xxx

# Cloudflare R2
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=movie-maker-storage
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://xxx

# Polar
POLAR_ACCESS_TOKEN=polar_at_xxx
POLAR_WEBHOOK_SECRET=whsec_xxx
```

### フロントエンド (.env.local)
```env
# Supabase (公開キーのみ)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...anon_key

# API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## セキュリティ注意事項

1. **絶対にGitにコミットしない**
   - `.env` ファイルは `.gitignore` に含める
   - `.env.example` にはプレースホルダーのみ記載

2. **漏洩時は即座にローテーション**
   - 各サービスのダッシュボードで新しいキーを発行
   - 古いキーは削除/無効化

3. **本番と開発で別のキーを使用**
   - 開発用キーには制限をかける
   - 本番キーは最小権限で

4. **定期的なローテーション推奨**
   - 3-6ヶ月ごとにキーを更新
