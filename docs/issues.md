# 問題一覧 (2025-12-22)

## 問題サマリー

| # | カテゴリ | 問題 | 影響 | 緊急度 | 状態 |
|---|---------|------|------|--------|------|
| 1 | Backend | モックユーザーのUUIDが不正 | `/api/v1/videos` 全滅 | **高** | **解決済** |
| 2 | Backend | DBのuser_idがUUID型だがモックが文字列 | 動画CRUD不可 | **高** | **解決済** |
| 3 | Frontend | ポート3000が競合 | 起動失敗 | 中 | **解決済** |
| 4 | Frontend | `.next/dev/lock`ファイル残留 | 起動失敗 | 中 | **解決済** |
| 5 | Backend | RLSポリシー違反 | 動画作成不可 | **高** | **解決済** |
| 6 | Backend | 外部キー制約違反 | 動画作成不可 | **高** | **解決済** |
| 7 | Storage | R2バケット未作成 | 画像/動画保存不可 | 中 | **解決済** |
| 8 | Content | BGMファイルがプレースホルダー | BGM機能不可 | 低 | 未解決 |

---

## 解決済みの問題

### 1. モックユーザーのUUIDが不正 (解決済)

**ファイル:** `movie-maker-api/app/core/dependencies.py`

**問題:** `dev-user-00000000-...` は有効なUUID形式ではなかった

**解決方法:** 実際のauth.usersに存在するユーザーIDを使用
```python
MOCK_USER = {
    "user_id": "a2022e56-1d9e-4430-a7a0-2c868d9b5bcd",
    ...
}
```

---

### 2. DBのuser_idがUUID型だがモックが文字列 (解決済)

**問題:** 問題1と同じ。解決済み。

---

### 3. ポート3000が競合 (解決済)

**解決方法:**
```bash
lsof -ti:3000 | xargs kill -9
```

---

### 4. `.next/dev/lock`ファイル残留 (解決済)

**解決方法:**
```bash
rm -rf movie-maker/.next/dev/lock
```

---

### 5. RLSポリシー違反 (解決済 - 新規発見)

**問題:** SupabaseのRow Level Securityがバックエンドからの書き込みをブロック

**エラーメッセージ:**
```
new row violates row-level security policy for table "video_generations"
```

**解決方法:** `supabase.py`でSERVICE_ROLE_KEYを使用するように変更
```python
key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
```

---

### 6. 外部キー制約違反 (解決済 - 新規発見)

**問題:** video_generations.user_id が users.id を参照しており、モックユーザーがDBに存在しなかった

**エラーメッセージ:**
```
insert or update on table "video_generations" violates foreign key constraint "video_generations_user_id_fkey"
```

**解決方法:** 実際にauth.usersとusersテーブルに存在するユーザーIDをモックユーザーとして使用

---

### 7. R2バケット未作成 (解決済)

**問題:** Cloudflare R2に`movie-maker`バケットが存在しなかった

**解決方法:**
1. Cloudflare Dashboard → R2 → Create bucket
2. バケット名: `movie-maker`
3. CORS設定を追加

**テスト結果 (2025-12-22):**
- バケットアクセス: OK
- ファイルアップロード: OK
- ファイル削除: OK

---

## 未解決の問題

### 8. BGMファイルがプレースホルダー (低)

**問題:** BGMトラックのURLがプレースホルダーのまま

**現状:**
```json
{
  "file_url": "https://placeholder.r2.dev/bgm/upbeat-energy.mp3"
}
```

**修正方法:**
1. 実際のBGMファイルを用意
2. R2にアップロード
3. DBのfile_urlを更新

---

## API動作状況 (2025-12-22 テスト結果)

| エンドポイント | メソッド | 状態 | 備考 |
|---------------|---------|------|------|
| `/health` | GET | **OK** | |
| `/api/v1/auth/me` | GET | **OK** | |
| `/api/v1/auth/usage` | GET | **OK** | |
| `/api/v1/templates` | GET | **OK** | 5件のテンプレート |
| `/api/v1/templates/{id}` | GET | 未テスト | |
| `/api/v1/templates/bgm/list` | GET | **OK** | 5件のBGM (プレースホルダーURL) |
| `/api/v1/videos` | GET | **OK** | 修正後動作確認済み |
| `/api/v1/videos` | POST | **OK** | 動画生成+プロンプト最適化動作確認済み |
| `/api/v1/videos/{id}` | GET | 未テスト | |
| `/api/v1/videos/{id}` | DELETE | 未テスト | |
| `/api/v1/videos/{id}/status` | GET | 未テスト | |
| `/api/v1/videos/upload-image` | POST | 未テスト | R2バケット作成後テスト必要 |
| `/api/v1/webhooks/polar` | POST | **OK** | |
| `/docs` | GET | **OK** | Swagger UI |

---

## フロントエンド動作状況

| 機能 | 状態 | 備考 |
|------|------|------|
| 開発サーバー起動 | **OK** | localhost:3000 |
| Google OAuth ログイン | **OK** | Supabase Auth連携済み |
| ダッシュボード表示 | **OK** | /dashboard アクセス確認 |

---

## テスト結果詳細

### POST /api/v1/videos テスト (2025-12-22)

**リクエスト:**
```json
{
  "image_url": "https://example.com/test.jpg",
  "prompt": "test video"
}
```

**レスポンス:**
```json
{
  "id": "5d803e82-4e84-4eda-bcad-5d778b5b6276",
  "user_id": "a2022e56-1d9e-4430-a7a0-2c868d9b5bcd",
  "status": "pending",
  "progress": 0,
  "original_image_url": "https://example.com/test.jpg",
  "user_prompt": "test video",
  "optimized_prompt": "\"Generate a video of a test pattern...\"",
  "created_at": "2025-12-22T00:22:02.068873Z"
}
```

**確認事項:**
- OpenAI APIによるプロンプト最適化: **動作確認済み**
- Supabase DB書き込み: **動作確認済み**

---

## E2Eテスト結果 (2025-12-22)

**動画生成フロー: 全て動作確認済み**

| ステップ | 状態 |
|----------|------|
| 1. 画像アップロード | **OK** |
| 2. R2保存 | **OK** |
| 3. プロンプト最適化 (OpenAI) | **OK** |
| 4. 動画生成 (KlingAI) | **OK** |
| 5. 公開URL配信 | **OK** |

---

## 次のアクション

1. ~~R2バケット作成~~ → 完了
2. ~~画像アップロードテスト~~ → 完了
3. ~~動画生成フローE2Eテスト~~ → 完了
4. **BGMファイル準備** (問題8) - 後回し可
5. **本番デプロイ** - Railway/Vercel設定
