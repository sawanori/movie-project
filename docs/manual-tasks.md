# 手動作業ガイド

このドキュメントでは、AIでは実行できない手動作業の手順を説明します。

---

## 1. Cloudflare R2 バケット作成 (必須)

画像・動画の保存に必要です。

### 手順

1. **Cloudflare Dashboard にアクセス**
   - https://dash.cloudflare.com/
   - ログイン

2. **R2 に移動**
   - 左メニューから「R2 Object Storage」を選択

3. **バケット作成**
   - 「Create bucket」ボタンをクリック
   - バケット名: `movie-maker`
   - リージョン: 「Automatic」または最寄りのリージョン
   - 「Create bucket」をクリック

4. **CORS設定**
   - 作成したバケットをクリック
   - 「Settings」タブを選択
   - 「CORS Policy」セクションで「Edit CORS policy」をクリック
   - 以下のJSONを入力:

   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:3000",
         "https://your-production-domain.com"
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
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   - 「Save」をクリック

5. **公開アクセス設定 (オプション)**

   動画を公開URLで配信する場合:
   - 「Settings」タブ → 「Public Access」
   - 「Allow Access」を有効化
   - または、カスタムドメインを設定

### 確認方法

バケット作成後、以下のコマンドでテスト:

```bash
cd movie-maker-api
source venv/bin/activate
python -c "from app.external.r2 import get_r2_client; print(get_r2_client().list_buckets())"
```

---

## 2. BGMファイル準備 (任意・後回し可)

動画にBGMを追加する機能に必要です。

### 必要なファイル

| ファイル名 | 用途 | 長さ |
|-----------|------|------|
| upbeat-energy.mp3 | 商品紹介、SNS向け | 5秒 |
| corporate-success.mp3 | ビジネス向け | 5秒 |
| gentle-acoustic.mp3 | ライフスタイル向け | 5秒 |
| epic-cinematic.mp3 | ドラマチック演出 | 5秒 |
| modern-pop.mp3 | 汎用 | 5秒 |

### 手順

1. **BGMファイルを用意**
   - 著作権フリーの5秒音源を用意
   - MP3形式で保存

2. **R2にアップロード**
   - Cloudflare Dashboard → R2 → `movie-maker`バケット
   - 「Upload」ボタンをクリック
   - `bgm/` フォルダを作成
   - 各ファイルをアップロード

3. **データベース更新**

   Supabase Dashboard → SQL Editor で以下を実行:

   ```sql
   UPDATE bgm_tracks
   SET file_url = 'https://your-r2-public-url.com/bgm/upbeat-energy.mp3'
   WHERE name = 'Upbeat Energy';

   UPDATE bgm_tracks
   SET file_url = 'https://your-r2-public-url.com/bgm/corporate-success.mp3'
   WHERE name = 'Corporate Success';

   UPDATE bgm_tracks
   SET file_url = 'https://your-r2-public-url.com/bgm/gentle-acoustic.mp3'
   WHERE name = 'Gentle Acoustic';

   UPDATE bgm_tracks
   SET file_url = 'https://your-r2-public-url.com/bgm/epic-cinematic.mp3'
   WHERE name = 'Epic Cinematic';

   UPDATE bgm_tracks
   SET file_url = 'https://your-r2-public-url.com/bgm/modern-pop.mp3'
   WHERE name = 'Modern Pop';
   ```

   ※ `your-r2-public-url.com` を実際のR2公開URLに置き換えてください

---

## 3. 本番デプロイ前の追加設定

### Google OAuth 本番設定

本番ドメインでログインを動作させるには:

1. **Google Cloud Console**
   - https://console.cloud.google.com/
   - 「APIとサービス」→「認証情報」
   - 作成済みのOAuthクライアントを編集

2. **承認済みの JavaScript 生成元に追加**
   ```
   https://your-production-domain.com
   ```

3. **承認済みのリダイレクト URI**
   ```
   https://qhwgvahnccpqudxtnvat.supabase.co/auth/v1/callback
   ```
   ※ リダイレクトURIはSupabase側なので変更不要

### 環境変数の本番値設定

デプロイ先（Railway/Vercel）で以下を設定:

**Backend (Railway)**
```
ENV=production
DEBUG=false
CORS_ORIGINS=["https://your-production-domain.com"]
```

**Frontend (Vercel)**
```
NEXT_PUBLIC_API_URL=https://your-api-domain.railway.app
```

---

## 確認チェックリスト

- [ ] R2バケット `movie-maker` を作成した
- [ ] R2のCORSポリシーを設定した
- [ ] (任意) BGMファイルをアップロードした
- [ ] (任意) BGMのDBレコードを更新した
- [ ] (本番前) Google OAuth本番ドメインを追加した
- [ ] (本番前) 環境変数を本番値に設定した
