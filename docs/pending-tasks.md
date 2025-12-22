# 残タスク一覧

## 1. Supabase マイグレーション実行 - 完了

```sql
-- video_generationsテーブルにfilm_grainカラムを追加
ALTER TABLE video_generations
ADD COLUMN IF NOT EXISTS film_grain TEXT DEFAULT 'medium';

-- CHECK制約も追加済み
ALTER TABLE video_generations
ADD CONSTRAINT film_grain_check CHECK (film_grain IN ('none', 'light', 'medium', 'heavy'));
```

---

## 2. フロントエンド：フィルムグレイン選択UIの追加 - 完了

### 2-1. APIクライアントの更新 - 完了

`movie-maker/lib/api/client.ts` の `confirmStoryVideo` に `film_grain` パラメータを追加済み。

### 2-2. ストーリーページにグレイン選択UIを追加 - 完了

`movie-maker/app/generate/story/page.tsx` に以下を追加：
- `filmGrain` state（デフォルト: 'medium'）
- Step 4のオプション画面にセレクトボックス
- 最終確認サマリーにグレイン設定を表示
- `confirmStoryVideo` 呼び出し時に `film_grain` を送信

---

## 3. 動画削除エラーの確認 - 要手動テスト

コード確認済み。実装は適切：
- 所有者確認
- FK制約対策（usage_logsのvideo_generation_idをNULLに更新）
- 削除ログ記録
- レコード削除

**テスト方法:**
1. サーバー再起動後、履歴画面から動画を削除
2. ターミナルログを確認
3. エラーが出た場合はログの内容を共有

---

## グレイン強度一覧

| プリセット | 強度 | 推奨用途 |
|-----------|------|----------|
| `none` | 0% | グレインなし（クリア映像） |
| `light` | 15% | 料理・風景・プロダクト |
| `medium` | 30% | 標準（デフォルト） |
| `heavy` | 45% | 人物・ポートレート・シネマティック |
