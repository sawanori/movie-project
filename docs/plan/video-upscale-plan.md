# 動画アップスケール機能 実装計画書

## 概要

Runway Upscale v1 APIを活用し、生成した動画をフルHD(1080p)または4Kにアップスケールする機能を実装する。

## 機能要件

### ユーザーストーリー
- ユーザーとして、生成した動画をより高解像度で出力したい
- ユーザーとして、HD/4Kの選択肢から出力解像度を選びたい

### 対象画面
1. **ストーリーボード詳細画面** - 結合済み動画のアップスケール
2. **個別シーン** - 各シーン動画のアップスケール（将来対応）

## 技術仕様

### Runway Upscale v1 API

```
POST https://api.dev.runwayml.com/v1/video_upscale
```

**リクエスト:**
```json
{
  "model": "upscale_v1",
  "videoUri": "https://example.com/video.mp4"
}
```

**レスポンス:**
```json
{
  "id": "task-uuid",
  "status": "PENDING"
}
```

**制約:**
- 入力動画: 最大40秒
- 出力解像度: 4倍アップスケール（最大4096px）
- 処理時間: 約1〜2分

### 解像度マッピング

| 入力解像度 | 出力解像度 (4x) | 出力名称 |
|-----------|----------------|----------|
| 720x1280 (9:16) | 2880x5120 → 2160x3840 (4K制限) | 4K縦型 |
| 1280x720 (16:9) | 5120x2880 → 3840x2160 (4K制限) | 4K横型 |
| 720x1280 (9:16) | 1080x1920 | フルHD縦型 |
| 1280x720 (16:9) | 1920x1080 | フルHD横型 |

> Note: Runway Upscale v1は常に4xアップスケールを行う。フルHD出力が必要な場合は、アップスケール後にFFmpegでリサイズする。

## 実装計画

### Phase 1: Backend実装

#### 1.1 RunwayProvider に upscale_video メソッド追加

**ファイル:** `app/external/runway_provider.py`

```python
async def upscale_video(self, video_url: str) -> str:
    """
    動画をアップスケール（4K）

    Args:
        video_url: 入力動画のURL

    Returns:
        str: タスクID
    """
    request_body = {
        "model": "upscale_v1",
        "videoUri": video_url,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{RUNWAY_API_BASE}/v1/video_upscale",
            headers=self._get_headers(),
            json=request_body,
            timeout=60.0,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("id")
```

#### 1.2 APIエンドポイント追加

**ファイル:** `app/videos/router.py`

```python
@router.post("/storyboard/{storyboard_id}/upscale")
async def upscale_storyboard_video(
    storyboard_id: str,
    request: UpscaleRequest,  # resolution: "hd" | "4k"
    current_user: dict = Depends(get_current_user),
):
    """
    ストーリーボードの結合動画をアップスケール
    """
    # 1. ストーリーボードの final_video_url を取得
    # 2. Runway upscale_video を呼び出し
    # 3. ポーリングで完了待機
    # 4. R2にアップロード
    # 5. DBを更新（upscaled_video_url）
    pass
```

#### 1.3 スキーマ追加

**ファイル:** `app/videos/schemas.py`

```python
class UpscaleResolution(str, Enum):
    HD = "hd"      # 1080p
    FOUR_K = "4k"  # 2160p

class UpscaleRequest(BaseModel):
    resolution: UpscaleResolution = Field(
        UpscaleResolution.FOUR_K,
        description="出力解像度"
    )

class UpscaleResponse(BaseModel):
    id: str
    status: str
    upscaled_video_url: str | None = None
    resolution: str
```

#### 1.4 DB変更（任意）

**オプション A: 既存カラム使用**
- `final_video_url` をアップスケール版で上書き

**オプション B: 新規カラム追加**
```sql
ALTER TABLE storyboards
ADD COLUMN upscaled_video_url TEXT DEFAULT NULL,
ADD COLUMN upscaled_resolution TEXT DEFAULT NULL;
```

→ **推奨: オプションB**（元の動画も保持できる）

### Phase 2: Frontend実装

#### 2.1 ダウンロードモーダル追加

**ファイル:** `app/generate/storyboard/page.tsx`

ダウンロードボタンクリック時にモーダルを表示し、解像度を選択:

```tsx
// ダウンロードボタン（モーダル起動）
<Button
  className="w-full"
  variant="outline"
  onClick={() => {
    setSelectedResolution('original');
    setShowDownloadModal(true);
  }}
>
  <Download className="mr-2 h-4 w-4" />
  ダウンロード
</Button>

// モーダル内で解像度選択
// - オリジナル (720p) - 即時ダウンロード
// - フルHD (1080p) - アップスケール後ダウンロード
// - 4K (2160p) - アップスケール後ダウンロード
```

#### 2.2 API呼び出し関数追加

**ファイル:** `lib/api/client.ts`

```typescript
// storyboardApi に追加
upscale: (storyboardId: string, resolution: 'hd' | '4k'): Promise<{
  task_id: string;
  status: string;
}> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/upscale`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  }),

getUpscaleStatus: (storyboardId: string): Promise<{
  status: string;
  upscaled_video_url: string | null;
  progress: number;
}> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/upscale/status`),
```

#### 2.3 ローディング状態管理

```tsx
const [isUpscaling, setIsUpscaling] = useState(false);
const [upscaleProgress, setUpscaleProgress] = useState(0);

const handleUpscale = async (resolution: 'hd' | '4k') => {
  setIsUpscaling(true);
  try {
    const { task_id } = await storyboardApi.upscale(storyboard.id, resolution);

    // ポーリングで完了待機
    const result = await pollUpscaleStatus(storyboard.id);

    if (result.upscaled_video_url) {
      // ダウンロードリンクを表示 or 自動ダウンロード
      downloadVideo(result.upscaled_video_url, `video_${resolution}.mp4`);
    }
  } finally {
    setIsUpscaling(false);
  }
};
```

## ファイル変更一覧

| ファイル | 変更内容 |
|----------|----------|
| `app/external/runway_provider.py` | `upscale_video` メソッド追加 |
| `app/videos/router.py` | `/storyboard/{id}/upscale` エンドポイント追加 |
| `app/videos/schemas.py` | `UpscaleRequest`, `UpscaleResponse` 追加 |
| `lib/api/client.ts` | `upscale`, `getUpscaleStatus` 追加 |
| `app/generate/storyboard/page.tsx` | アップスケールボタンUI追加 |
| (DB Migration) | `upscaled_video_url`, `upscaled_resolution` カラム追加 |

## 処理フロー

```
┌─────────────────┐
│  ユーザー       │
│  「4Kで出力」    │
│  ボタンクリック  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  POST /upscale  │
│  resolution=4k  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Runway API      │
│ video_upscale   │
│ task作成        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ポーリング      │◄──┐
│ (5秒間隔)       │   │
└────────┬────────┘   │
         │            │
    完了? ──No───────┘
         │
        Yes
         │
         ▼
┌─────────────────┐
│ R2にアップロード │
│ DB更新          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ダウンロード    │
│ リンク表示      │
└─────────────────┘
```

## 注意事項

### クレジット消費
- Runway Upscale v1 はクレジットを消費する
- 料金体系を確認し、必要に応じてユーザーへの事前確認を実装

### エラーハンドリング
- 入力動画が40秒を超える場合のエラー処理
- APIレート制限時のリトライ処理
- アップスケール失敗時のユーザー通知

### UX考慮
- 処理中はプログレスバーを表示
- 完了後は自動ダウンロード or ダウンロードボタン表示
- 元の動画も保持し、選択可能にする

## 参考リンク

- [Runway API Reference](https://docs.dev.runwayml.com/api/)
- [Runway Developer Portal](https://dev.runwayml.com/)
