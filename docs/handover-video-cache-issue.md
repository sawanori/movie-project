# 引き継ぎ書: 動画再生成時のキャッシュ問題

## 問題の概要

ストーリーボード機能で動画を再生成しても、フロントエンドのプレビューに古い動画が表示され続ける。

## 対象ストーリーボード

- ID: `3eee8fcd-1edb-472d-acc9-b18e774f25b7`
- URL: `http://localhost:3000/generate/storyboard?id=3eee8fcd-1edb-472d-acc9-b18e774f25b7`

## 現在の状況

### バックエンド（正常に動作）

1. **動画再生成は正常に動作している**
   - 再生成時にタイムスタンプ付きファイル名でR2にアップロード
   - 例: `scene_1.mp4` → `scene_1_1766628404.mp4`

2. **データベースは正しく更新されている**
   ```
   Scene 1: scene_1_1766628404.mp4 ✓
   Scene 2: scene_2_1766628220.mp4 ✓
   Scene 3: scene_3_1766628572.mp4 ✓
   Scene 4: scene_4.mp4 (未再生成)
   ```

3. **APIは正しいURLを返している**
   - GET `/api/v1/videos/storyboard/{id}` → 新しいURL
   - GET `/api/v1/videos/storyboard/{id}/status` → 新しいURL

4. **R2に新しいファイルが存在する**
   - `curl -I` で確認済み、200 OKで返ってくる

### フロントエンド（問題あり）

古い動画が表示され続ける。

## 実施した修正

### 1. バックエンド: タイムスタンプ付きファイル名

**ファイル**: `movie-maker-api/app/tasks/storyboard_processor.py`

```python
# 行 258-259: 初回生成
timestamp = int(time.time())
r2_filename = f"{storyboard_id}/scene_{scene_number}_{timestamp}.mp4"

# 行 427-428: 再生成
timestamp = int(time.time())
r2_filename = f"{storyboard_id}/scene_{scene_number}_{timestamp}.mp4"

# 行 601-602: 最終結合動画
timestamp = int(time.time())
final_filename = f"{user_id}/storyboard_{storyboard_id}_{timestamp}.mp4"
```

### 2. フロントエンド: video要素にkey属性追加

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

```tsx
// 行 1199-1200, 1253-1254, 1439-1440, 1472-1473
<video
  key={scene.video_url}  // ← 追加
  src={scene.video_url}
  ...
/>
```

### 3. フロントエンド: デバッグログ追加

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

```tsx
// 行 109-112: 初期ロード時
console.log('[DEBUG] Initial load - scenes:', sb.scenes.map(...));

// 行 442-446, 454-455: ポーリング時
console.log('[DEBUG] Polling status response:', status.scenes.map(...));
console.log(`[DEBUG] Scene ${s.scene_number}: ${s.video_url?.split('/').pop()} -> ${updated.video_url?.split('/').pop()}`);
```

## 調査すべきポイント

1. **ブラウザコンソールのデバッグログ確認**
   - `[DEBUG] Initial load` で正しいファイル名が表示されるか
   - `[DEBUG] Polling status response` で正しいファイル名が表示されるか

2. **Network タブの確認**
   - APIレスポンスに正しいURLが含まれているか
   - video要素がリクエストしているURLは何か

3. **React DevToolsの確認**
   - `storyboard.scenes[n].video_url` の値は何か

4. **考えられる原因**
   - Next.jsのキャッシュ
   - ブラウザのビデオキャッシュ
   - React の状態更新の問題
   - `key` 属性が正しく機能していない

## 関連ファイル

### バックエンド
- `movie-maker-api/app/tasks/storyboard_processor.py` - 動画生成処理
- `movie-maker-api/app/videos/router.py` - APIエンドポイント
- `movie-maker-api/app/external/r2.py` - R2アップロード

### フロントエンド
- `movie-maker/app/generate/storyboard/page.tsx` - ストーリーボードページ
- `movie-maker/lib/api/client.ts` - APIクライアント

## テスト手順

1. バックエンド起動: `cd movie-maker-api && source venv/bin/activate && uvicorn app.main:app --reload --port 8000`
2. フロントエンド起動: `cd movie-maker && npm run dev`
3. ブラウザで `http://localhost:3000/generate/storyboard?id=3eee8fcd-1edb-472d-acc9-b18e774f25b7` を開く
4. 開発者ツール (F12) → Console タブを開く
5. ページをハードリフレッシュ (Cmd+Shift+R)
6. `[DEBUG]` ログを確認
7. 任意のシーンの「再生成」ボタンをクリック
8. 再生成完了後のログとプレビューを確認

## データベース確認コマンド

```bash
cd movie-maker-api
source venv/bin/activate
python -c "
from app.core.supabase import get_supabase
supabase = get_supabase()
response = supabase.table('storyboard_scenes').select('scene_number, video_url').eq('storyboard_id', '3eee8fcd-1edb-472d-acc9-b18e774f25b7').order('scene_number').execute()
for scene in response.data:
    print(f\"Scene {scene['scene_number']}: {scene['video_url'].split('/')[-1]}\")
"
```

## API確認コマンド

```bash
curl -s "http://localhost:8000/api/v1/videos/storyboard/3eee8fcd-1edb-472d-acc9-b18e774f25b7/status" | python -m json.tool
```

---

作成日: 2025-12-25
