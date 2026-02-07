# 引き継ぎ: 動画再生成時のプロンプト修正機能の問題

## ステータス: 解決済み (2025-12-26)

### 解決内容

#### 1. FastAPI Body パラメータのバグ修正

問題の原因は `router.py` での FastAPI Body パラメータの不正な構文でした。

**修正前（バグ）:**
```python
request: RegenerateVideoRequest = Body(default_factory=RegenerateVideoRequest)
```

**修正後（正常）:**
```python
request: RegenerateVideoRequest = Body(default=None)
```

`default_factory` は Pydantic の Field 概念であり、FastAPI の Body パラメータでは使用できません。
正しい構文は `Body(default=None)` で、オプショナルなリクエストボディを受け取ります。

#### 2. VEO動画の再生成時にRunway APIを使おうとする問題

**問題**: VEOで作成したストーリーボードの動画を再生成すると、Runway APIを使おうとしてエラーになる

**原因**: `regenerate_scene_video`エンドポイントで：
- DBからストーリーボードを取得する際、`video_provider`フィールドを取得していなかった
- リクエストに`video_provider`が含まれていない場合、環境変数のデフォルト（runway）にフォールバックしていた

**修正**: `movie-maker-api/app/videos/router.py`
```python
# 修正前
sb_response = supabase.table("storyboards").select("id, status")...

# video_providerの決定（リクエスト指定 > 環境変数）
video_provider = None
if request and request.video_provider:
    video_provider = request.video_provider.value

# 修正後
sb_response = supabase.table("storyboards").select("id, status, video_provider")...
sb_video_provider = sb_response.data.get("video_provider")

# video_providerの決定（リクエスト指定 > ストーリーボードDB値 > 環境変数）
video_provider = None
if request and request.video_provider:
    video_provider = request.video_provider.value
elif sb_video_provider:
    video_provider = sb_video_provider
```

これにより、VEOで作成されたストーリーボードは再生成時も正しくVEO APIを使用します。

### 新しいフロー（保存→確認→再生成）

ユーザーからのフィードバックに基づき、フローを変更:

1. **保存ボタン追加**: プロンプトを編集後、「保存」ボタンでDBに保存
2. **未保存表示**: プロンプトが変更されると「未保存の変更あり」表示
3. **保存済み表示**: 保存成功後「保存済み ✓」表示
4. **再生成ボタン制御**: 未保存の変更がある場合は「再生成」ボタンが無効化
5. **DBプロンプト使用**: 再生成時はAPIにプロンプトを渡さず、DBに保存済みのプロンプトを使用

### Playwright テストで確認済み

Playwrightテストで以下を確認:
1. 日本語プロンプト入力 → 英語翻訳が正常に動作
2. 未保存時は再生成ボタンが無効化される
3. 保存ボタンでPUT APIが正しく送信される
4. 保存後に再生成ボタンが有効化される
5. モーダルを閉じて再度開いても保存済みプロンプトが表示される
6. 再生成リクエストにはプロンプトが含まれない（DBの値を使用）
7. 動画が新しく生成される

---

## 問題の概要（修正前）

動画プレビュー画面から動画を再生成する際に、プロンプトを修正しても以下の問題が発生する：

1. **動画が変わらない** - 再生成後も修正前の動画が表示される
2. **プロンプトが保存されない** - 再度モーダルを開くと変更前のプロンプトが表示される

## 期待する動作

1. ユーザーがプロンプトを編集して「再生成」をクリック
2. 編集されたプロンプトがDBに保存される
3. 新しいプロンプトで動画が生成される
4. 新しい動画がUIに表示される
5. 再度モーダルを開くと編集後のプロンプトが表示される

---

## 現在の実装状況

### フロントエンド

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

#### 再生成モーダル（L1767-1841）
- 日本語説明入力 → 「英語に翻訳」ボタン → 英語プロンプト表示
- 「再生成」ボタンクリックで `handleRegenerateVideo(regenerateModalScene, regeneratePrompt)` を呼び出し

#### handleRegenerateVideo関数（L535-575）
```typescript
const handleRegenerateVideo = async (sceneNumber: number, customPrompt?: string) => {
  console.log('[DEBUG] handleRegenerateVideo called with:', { sceneNumber, customPrompt: customPrompt?.substring(0, 50) });
  // ...
  await storyboardApi.regenerateVideo(storyboard.id, sceneNumber, {
    video_provider: videoProvider,
    prompt: customPrompt,
  });
  // ...
};
```

#### APIクライアント（`movie-maker/lib/api/client.ts` L344-352）
```typescript
regenerateVideo: (storyboardId: string, sceneNumber: number, options?: {
  video_provider?: 'runway' | 'veo';
  prompt?: string;
}): Promise<Storyboard> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/scenes/${sceneNumber}/regenerate-video`, {
    method: "POST",
    body: JSON.stringify(options || {}),
  }),
```

---

### バックエンド

**エンドポイント**: `movie-maker-api/app/videos/router.py` L1089-1163

```python
@router.post("/storyboard/{storyboard_id}/scenes/{scene_number}/regenerate-video")
async def regenerate_scene_video(
    storyboard_id: str,
    scene_number: int,
    background_tasks: BackgroundTasks,
    request: RegenerateVideoRequest = None,  # ← ここでリクエストを受け取る
    current_user: dict = Depends(check_usage_limit),
):
    # ...
    logger.info(f"[DEBUG] Request object: {request}")

    # promptの取得
    custom_prompt = None
    if request and request.prompt:
        custom_prompt = request.prompt
        logger.info(f"[DEBUG] Custom prompt received: ...")
    else:
        logger.info("[DEBUG] No custom prompt provided")

    # バックグラウンドタスクで再生成
    background_tasks.add_task(start_single_scene_regeneration, storyboard_id, scene_number, video_provider, custom_prompt)
```

**スキーマ**: `movie-maker-api/app/videos/schemas.py` L399-402
```python
class RegenerateVideoRequest(BaseModel):
    """シーン動画再生成リクエスト"""
    video_provider: VideoProvider | None = Field(None, description="動画生成プロバイダー")
    prompt: str | None = Field(None, description="動画生成プロンプト（未指定時は既存のrunway_promptを使用）")
```

**タスク処理**: `movie-maker-api/app/tasks/storyboard_processor.py` L411-561

```python
async def process_single_scene_regeneration(
    storyboard_id: str,
    scene_number: int,
    video_provider: str = None,
    custom_prompt: str = None,  # ← カスタムプロンプトを受け取る
):
    # ...
    logger.info(f"[DEBUG] custom_prompt parameter: {custom_prompt[:50] if custom_prompt else 'None'}...")

    if custom_prompt:
        runway_prompt = custom_prompt
        # DBを更新
        update_result = supabase.table("storyboard_scenes").update({
            "runway_prompt": custom_prompt,
        }).eq("id", scene_id).execute()
        logger.info(f"Scene {scene_number}: Updated runway_prompt in DB. Result: {update_result.data}")
    else:
        runway_prompt = scene["runway_prompt"]
        logger.info(f"[DEBUG] Using existing runway_prompt from DB")

    # 動画生成
    task_id = await provider.generate_video(
        image_url=scene_image_url,
        prompt=runway_prompt,  # ← このプロンプトで動画生成
        duration=5,
        aspect_ratio="9:16",
        camera_work=camera_work,
    )
    # ...
```

---

## デバッグ用ログ

以下のログが追加されている：

### フロントエンド（ブラウザコンソール）
```
[DEBUG] handleRegenerateVideo called with: { sceneNumber: X, customPrompt: "..." }
[DEBUG] Calling regenerateVideo with: { storyboardId: "...", sceneNumber: X, promptLength: N, promptPreview: "..." }
```

### バックエンド（ターミナル）
```
[DEBUG] Request object: ...
[DEBUG] Custom prompt received: ... / No custom prompt provided
[DEBUG] Calling start_single_scene_regeneration with custom_prompt=Yes/No
[DEBUG] custom_prompt parameter: ...
Scene X: Updated runway_prompt in DB. Result: ...
```

---

## 考えられる問題箇所

### 1. フロントエンドでプロンプトが渡されていない
- `handleRegenerateVideo`の`customPrompt`パラメータが`undefined`
- `regeneratePrompt`ステートが正しく更新されていない

### 2. APIリクエストでプロンプトが送信されていない
- `JSON.stringify(options)`でプロンプトが含まれていない
- Content-Typeの問題

### 3. バックエンドでプロンプトを受け取れていない
- `request`オブジェクトが`None`
- `request.prompt`が`None`

### 4. バックグラウンドタスクにプロンプトが渡されていない
- `background_tasks.add_task`の引数の問題

### 5. DB更新が失敗している
- Supabaseのupdate処理が失敗

### 6. 動画生成にプロンプトが使われていない
- `provider.generate_video`に渡されるプロンプトが古い

### 7. 動画URLがキャッシュされている
- ブラウザキャッシュまたはCDNキャッシュ

---

## 調査手順

1. **バックエンドサーバーを再起動**
```bash
cd movie-maker-api
uvicorn app.main:app --reload --port 8000
```

2. **フロントエンドを起動**（開発モード）
```bash
cd movie-maker
npm run dev
```

3. **ブラウザのDevToolsを開く**（F12 → Console & Network）

4. **再生成を実行し、ログを確認**
   - ブラウザコンソールのログ
   - バックエンドターミナルのログ
   - NetworkタブでPOSTリクエストのペイロードを確認

5. **問題箇所を特定**
   - どの段階でプロンプトが失われているかを確認

---

## 関連ファイル一覧

| ファイル | 役割 |
|----------|------|
| `movie-maker/app/generate/storyboard/page.tsx` | フロントエンドUI・ロジック |
| `movie-maker/lib/api/client.ts` | APIクライアント |
| `movie-maker-api/app/videos/router.py` | APIエンドポイント |
| `movie-maker-api/app/videos/schemas.py` | リクエスト/レスポンススキーマ |
| `movie-maker-api/app/tasks/storyboard_processor.py` | バックグラウンド処理 |
| `movie-maker-api/app/tasks/__init__.py` | タスクエクスポート |

---

## 補足情報

- 動画生成プロバイダー: Runway / Veo（環境変数で切り替え）
- 動画URLはR2にアップロード後、タイムスタンプ付きファイル名で保存（キャッシュ回避）
- DBテーブル: `storyboard_scenes`（`runway_prompt`カラムにプロンプト保存）
