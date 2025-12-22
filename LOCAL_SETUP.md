# movie-maker ローカル環境セットアップガイド

## 前提条件

- Node.js 18+
- Python 3.11+
- npm または yarn

---

## 1. Backend セットアップ

```bash
cd movie-maker-api

# 仮想環境を作成
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係をインストール
pip install -r requirements.txt

# 環境変数ファイルを作成
cp .env.example .env
```

### .env の設定（最低限必要）

```bash
# Supabase（必須）
SUPABASE_URL=https://qhwgvahnccpqudxtnvat.supabase.co
SUPABASE_KEY=<Supabase Dashboard → Settings → API → anon public>
SUPABASE_SERVICE_ROLE_KEY=<Supabase Dashboard → Settings → API → service_role>

# その他はデフォルト値でOK（動画生成機能を使わない場合）
```

### Backend 起動

```bash
uvicorn app.main:app --reload --port 8000
```

**確認:** http://localhost:8000/docs でSwagger UIが表示されればOK

---

## 2. Frontend セットアップ

```bash
cd movie-maker

# 依存関係をインストール
npm install

# 環境変数ファイルを作成
cp .env.local.example .env.local
```

### .env.local の設定

```bash
NEXT_PUBLIC_SUPABASE_URL=https://qhwgvahnccpqudxtnvat.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase Dashboard → Settings → API → anon public>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Frontend 起動

```bash
npm run dev
```

**確認:** http://localhost:3000 でランディングページが表示されればOK

---

## 3. Supabase APIキーの取得方法

1. https://supabase.com/dashboard にアクセス
2. プロジェクト「sawanori's Project」を選択
3. 左メニュー → **Settings** → **API**
4. 以下をコピー:
   - **Project URL**: `https://qhwgvahnccpqudxtnvat.supabase.co`
   - **anon public**: フロントエンド・バックエンド両方で使用
   - **service_role**: バックエンドのみで使用（秘密）

---

## 4. 動作確認チェックリスト

### Backend
- [ ] http://localhost:8000/health → `{"status": "healthy"}` が返る
- [ ] http://localhost:8000/docs → Swagger UIが表示される

### Frontend
- [ ] http://localhost:3000 → ランディングページが表示される
- [ ] http://localhost:3000/login → ログインページが表示される
- [ ] http://localhost:3000/pricing → 料金ページが表示される

### 認証（Google OAuth設定後）
- [ ] Googleログインが動作する
- [ ] ログイン後、ダッシュボードにリダイレクトされる

---

## 5. Google OAuth 設定（認証機能を使う場合）

詳細は `docs/credentials.md` を参照してください。

### 簡易手順:
1. Google Cloud Console でOAuthクライアントIDを作成
2. リダイレクトURIに `https://qhwgvahnccpqudxtnvat.supabase.co/auth/v1/callback` を追加
3. Supabase Dashboard → Authentication → Providers → Google を有効化
4. Client ID と Client Secret を設定

---

## 6. トラブルシューティング

### Backend が起動しない
```bash
# 仮想環境が有効か確認
which python  # venv/bin/python になっているか

# 依存関係を再インストール
pip install -r requirements.txt
```

### Frontend が起動しない
```bash
# node_modules を削除して再インストール
rm -rf node_modules
npm install
```

### CORS エラーが出る
- Backend の `.env` で `CORS_ORIGINS=["http://localhost:3000"]` が設定されているか確認

### Supabase 接続エラー
- API キーが正しくコピーされているか確認
- プロジェクトがアクティブか確認: https://supabase.com/dashboard

---

## 7. 開発用コマンド一覧

### Backend
```bash
# 開発サーバー起動
uvicorn app.main:app --reload --port 8000

# テスト実行
pytest

# Docker で起動
docker-compose up --build
```

### Frontend
```bash
# 開発サーバー起動
npm run dev

# 高速起動（Turbopack）
npm run dev -- --turbo

# ビルド
npm run build

# Lint
npm run lint
```

---

## アクセス先一覧

| サービス | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API ドキュメント | http://localhost:8000/docs |
| Supabase Dashboard | https://supabase.com/dashboard |

---

**作成日:** 2025-12-21
