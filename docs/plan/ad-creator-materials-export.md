# Ad Creator 編集用素材エクスポート機能 実装計画書

## 概要

Ad Creatorで作成したCM動画の個々のカット素材を、ProRes形式でZIPファイルにまとめてダウンロードする機能。

### ユースケース

- ユーザーがAd CreatorでCM動画を作成
- 結合動画とは別に、編集ソフト（Premiere Pro、DaVinci Resolve等）で再編集するために個々の素材が必要
- 「編集用素材ダウンロード」ボタンで一括ダウンロード

---

## 技術仕様

### 出力形式

| 項目 | 仕様 |
|------|------|
| 解像度 | 1920x1080 (Full HD) |
| コーデック | ProRes 422 HQ |
| ビット深度 | 10bit (yuv422p10le) |
| 音声 | PCM 16bit (非圧縮) |
| コンテナ | .mov |
| 圧縮形式 | ZIP (無圧縮/STORED) |

### ファイル命名規則

```
materials_YYYYMMDD_HHmmss.zip
├── 01_オープニング.mov
├── 02_商品紹介.mov
├── 03_機能説明.mov
└── 04_クロージング.mov
```

### ファイルサイズ目安

- 1カット（5秒）: 約150MB
- 4カット（20秒）: 約600MB
- 8カット（40秒）: 約1.2GB

---

## ストレージ方針

**R2は使用しない。サーバー一時ディレクトリ（/tmp）のみ使用。**

```
処理フロー:
1. /tmp/{task_id}/ に作業ディレクトリ作成
2. 各動画をダウンロード → ProRes変換
3. ZIPファイル作成
4. StreamingResponse でクライアントに直接送信
5. 処理完了後、/tmp/{task_id}/ を削除
```

---

## API設計

### エンドポイント

```
POST /api/v1/videos/ad-creator/export-materials
```

### リクエスト

```json
{
  "cuts": [
    {
      "cut_number": 1,
      "label": "オープニング",
      "video_url": "https://r2.example.com/video1.mp4",
      "trim_start": 0.0,
      "trim_end": 5.0
    },
    {
      "cut_number": 2,
      "label": "商品紹介",
      "video_url": "https://r2.example.com/video2.mp4",
      "trim_start": 0.5,
      "trim_end": 4.5
    }
  ]
}
```

### レスポンス

成功時: `StreamingResponse` でZIPファイルを直接返却

```
Content-Type: application/zip
Content-Disposition: attachment; filename="materials_20260108_143052.zip"
```

エラー時:

```json
{
  "detail": "ProRes変換に失敗しました: cut_02"
}
```

---

## バックエンド実装

### 1. スキーマ追加

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class MaterialExportCut(BaseModel):
    """エクスポート対象カット"""
    cut_number: int
    label: str
    video_url: str
    trim_start: float = 0.0
    trim_end: float | None = None


class MaterialExportRequest(BaseModel):
    """編集用素材エクスポートリクエスト"""
    cuts: list[MaterialExportCut]
```

### 2. FFmpegサービス拡張

**ファイル**: `movie-maker-api/app/services/ffmpeg_service.py`

```python
async def convert_to_prores_hd(
    self,
    input_path: str,
    output_path: str,
    trim_start: float = 0.0,
    trim_end: float | None = None,
) -> None:
    """
    動画をFull HD ProRes 422 HQに変換

    - 解像度: 1920x1080
    - デバンド処理適用
    - トリミング対応
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
    ]

    # トリミング
    if trim_start > 0:
        cmd.extend(["-ss", str(trim_start)])
    if trim_end is not None:
        cmd.extend(["-t", str(trim_end - trim_start)])

    # フィルター（リサイズ + デバンド）
    cmd.extend([
        "-vf", "scale=1920:1080:flags=lanczos,bwdif,gradfun=strength=1.2:radius=8",
        "-c:v", "prores_ks",
        "-profile:v", "3",  # ProRes 422 HQ
        "-pix_fmt", "yuv422p10le",
        "-c:a", "pcm_s16le",
        output_path,
    ])

    # 実行...
```

### 3. エンドポイント追加

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
@router.post("/ad-creator/export-materials")
async def export_materials(
    request: MaterialExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    編集用素材をProRes形式でZIPダウンロード

    各カットをFull HD ProResに変換し、ZIPファイルとして返却。
    R2は使用せず、サーバー一時ディレクトリで処理。
    """
    task_id = str(uuid.uuid4())
    temp_dir = f"/tmp/materials_{task_id}"

    try:
        os.makedirs(temp_dir, exist_ok=True)

        converted_files = []
        for cut in request.cuts:
            # 1. 動画ダウンロード
            input_path = await download_video(cut.video_url, temp_dir)

            # 2. ProRes変換
            output_filename = f"{cut.cut_number:02d}_{cut.label}.mov"
            output_path = os.path.join(temp_dir, output_filename)
            await ffmpeg.convert_to_prores_hd(
                input_path, output_path,
                trim_start=cut.trim_start,
                trim_end=cut.trim_end,
            )
            converted_files.append((output_filename, output_path))

        # 3. ZIP作成
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"materials_{timestamp}.zip"
        zip_path = os.path.join(temp_dir, zip_filename)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED) as zf:
            for filename, filepath in converted_files:
                zf.write(filepath, filename)

        # 4. StreamingResponse で返却
        async def stream_and_cleanup():
            with open(zip_path, 'rb') as f:
                while chunk := f.read(8192):
                    yield chunk
            # クリーンアップ
            shutil.rmtree(temp_dir, ignore_errors=True)

        return StreamingResponse(
            stream_and_cleanup(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_filename}"',
            },
        )

    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
```

---

## フロントエンド実装

### 1. APIクライアント追加

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
export interface MaterialExportCut {
  cut_number: number;
  label: string;
  video_url: string;
  trim_start: number;
  trim_end: number | null;
}

export const adCreatorApi = {
  // 既存のメソッド...

  /**
   * 編集用素材をProRes形式でZIPダウンロード
   */
  exportMaterials: async (cuts: MaterialExportCut[]): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/api/v1/videos/ad-creator/export-materials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({ cuts }),
    });

    if (!response.ok) {
      throw new Error("素材エクスポートに失敗しました");
    }

    return response.blob();
  },
};
```

### 2. UIコンポーネント

**ファイル**: `movie-maker/app/concat/page.tsx`

書き出し完了後の画面に「編集用素材ダウンロード」ボタンを追加。

```tsx
const [isExporting, setIsExporting] = useState(false);

const handleExportMaterials = async () => {
  if (!storyboardCuts.length) return;

  setIsExporting(true);
  try {
    const cuts = storyboardCuts
      .filter(cut => cut.video)
      .map(cut => ({
        cut_number: cut.cut_number,
        label: cut.scene_type_label || `カット${cut.cut_number}`,
        video_url: cut.video!.videoUrl,
        trim_start: cut.video!.trimStart,
        trim_end: cut.video!.trimEnd,
      }));

    const blob = await adCreatorApi.exportMaterials(cuts);

    // ダウンロード実行
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materials_${new Date().toISOString().slice(0,10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert("素材エクスポートに失敗しました");
  } finally {
    setIsExporting(false);
  }
};

// ボタン表示
{concatStatus?.status === "completed" && (
  <Button
    onClick={handleExportMaterials}
    disabled={isExporting}
    variant="outline"
    className="..."
  >
    {isExporting ? (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        書き出し中...
      </>
    ) : (
      <>
        <Download className="mr-2 h-4 w-4" />
        編集用素材ダウンロード
      </>
    )}
  </Button>
)}
```

---

## 実装ステップ

### Phase 1: バックエンド

1. [ ] `schemas.py` に `MaterialExportCut`, `MaterialExportRequest` 追加
2. [ ] `ffmpeg_service.py` に `convert_to_prores_hd` メソッド追加
3. [ ] `router.py` に `/ad-creator/export-materials` エンドポイント追加
4. [ ] 動作確認（curl等でテスト）

### Phase 2: フロントエンド

5. [ ] `client.ts` に `exportMaterials` 関数追加
6. [ ] `concat/page.tsx` に「編集用素材ダウンロード」ボタン追加
7. [ ] ローディング状態・エラーハンドリング実装
8. [ ] 動作確認

### Phase 3: テスト・調整

9. [ ] 複数カットでの動作確認
10. [ ] 大容量ファイル（8カット以上）での動作確認
11. [ ] タイムアウト設定調整（必要に応じて）

---

## Supabase マイグレーション

**この機能ではデータベース変更は不要です。**

今後、エクスポート履歴を保存する場合は、MCPを使ってマイグレーションを実行してください：

```
Supabase MCPを使用してマイグレーションを実行：
mcp__supabase__apply_migration
```

---

## 注意事項

### サーバーリソース

- 同時処理数を制限（サーバー負荷対策）
- 処理中のメモリ使用量に注意
- `/tmp` の容量確認（Railway環境では制限あり）

### タイムアウト

- 処理時間が長い場合、HTTPタイムアウトに注意
- 必要に応じてタイムアウト値を延長

### エラーハンドリング

- 動画ダウンロード失敗時の対応
- FFmpeg変換失敗時の対応
- 一時ファイルのクリーンアップ保証

---

## 将来の拡張案

1. **解像度選択**: HD / Full HD / 4K から選択可能に
2. **フォーマット選択**: ProRes / DNxHD / MP4 から選択可能に
3. **非同期処理**: 大容量エクスポート時はバックグラウンド処理 + 通知
4. **エクスポート履歴**: 過去のエクスポート履歴を保存・再ダウンロード
