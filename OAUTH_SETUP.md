# Google OAuth 設定ガイド

## 1. Google Cloud Console でOAuthクライアント作成

1. https://console.cloud.google.com/ にアクセス
2. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」
3. アプリケーションの種類: **ウェブアプリケーション**
4. 名前: 任意（例: `movie-maker`）

### 入力項目

**承認済みの JavaScript 生成元:**
```
http://localhost:3000
```

**承認済みのリダイレクト URI:**
```
https://qhwgvahnccpqudxtnvat.supabase.co/auth/v1/callback
```

5. 「作成」をクリック
6. 表示される**クライアントID**と**クライアントシークレット**をメモ

---

## 2. Supabase で Google Provider 有効化

1. https://supabase.com/dashboard にアクセス
2. プロジェクト `qhwgvahnccpqudxtnvat` を選択
3. 左メニュー「Authentication」→「Providers」
4. 「Google」を選択
5. 「Enable Sign in with Google」をONに
6. 以下を入力:
   - **Client ID**: Google Cloud Consoleで取得したクライアントID
   - **Client Secret**: Google Cloud Consoleで取得したシークレット
7. 「Save」をクリック

---

## 3. 本番環境用（デプロイ時に追加）

本番環境にデプロイする際は、Google Cloud Consoleで以下を追加:

**承認済みの JavaScript 生成元:**
```
https://your-production-domain.com
```

**承認済みのリダイレクト URI:**
```
https://qhwgvahnccpqudxtnvat.supabase.co/auth/v1/callback
```
（リダイレクトURIはSupabase側なので同じ）

---

## 4. テスト

```bash
# Backend起動
cd movie-maker-api && make dev

# Frontend起動（別ターミナル）
cd movie-maker && npm run dev
```

http://localhost:3000 でGoogleログインボタンをクリックして動作確認
