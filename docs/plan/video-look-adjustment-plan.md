# 動画ルック調整機能 実装計画書

## 概要

ストーリーボード動画の結合時に、フィルムグレインとLUT（カラーグレーディング）を調整できる機能を実装する。

## 現状分析

### 現在のフロー
```
画像アップロード → 4シーンプレビュー生成 → シーン編集/確認
       ↓
  動画生成（4シーン）← エフェクトなし（素の動画）
       ↓
  プレビュー画面 ← 現状: 調整UIなし
       ↓
  結合 ← グレインのみ適用、LUTなし
       ↓
  完成動画
```

### 現在の実装状況

| ファイル | 機能 | グレイン | LUT |
|---------|------|---------|-----|
| `storyboard_processor.py` - 各シーン生成 | 動画生成 | ❌ | ❌ |
| `storyboard_processor.py` - 結合 | 動画結合 | ✅ | ❌ |
| `ffmpeg_service.py` | FFmpeg処理 | ✅ | ✅ |

## 実装計画

### Phase 1: バックエンド - 結合時のLUT対応

#### 1.1 `process_storyboard_concatenation` の修正
**ファイル**: `app/tasks/storyboard_processor.py`

```python
async def process_storyboard_concatenation(
    storyboard_id: str,
    film_grain: str = "medium",
    use_lut: bool = True,        # 追加
    lut_intensity: float = 0.3,  # 追加
):
```

変更点:
- `use_lut` パラメータ追加
- `lut_intensity` パラメータ追加
- LUT適用処理を追加

#### 1.2 `start_storyboard_concatenation` の修正
**ファイル**: `app/tasks/storyboard_processor.py`

```python
def start_storyboard_concatenation(
    storyboard_id: str,
    film_grain: str = "medium",
    use_lut: bool = True,
    lut_intensity: float = 0.3,
):
```

#### 1.3 APIエンドポイントの修正
**ファイル**: `app/videos/router.py`

結合リクエストスキーマにLUTオプションを追加。

### Phase 2: バックエンド - スキーマ更新

#### 2.1 結合リクエストスキーマ
**ファイル**: `app/videos/schemas.py`

```python
class StoryboardConcatenateRequest(BaseModel):
    """ストーリーボード結合リクエスト"""
    film_grain: FilmGrainPreset = Field(
        FilmGrainPreset.MEDIUM,
        description="フィルムグレイン強度"
    )
    use_lut: bool = Field(True, description="LUTを適用するか")
    lut_intensity: float = Field(
        0.3,
        ge=0.0,
        le=1.0,
        description="LUT適用強度（0.0-1.0）"
    )
```

### Phase 3: フロントエンド - ルック調整UI

#### 3.1 プレビュー画面にルック調整パネル追加
**ファイル**: `app/generate/storyboard/page.tsx`

レビューステップ（`step === "review"`）に以下を追加:

```tsx
// ルック調整セクション
<div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
  <h3 className="mb-4 font-medium">ルック調整</h3>

  {/* フィルムグレイン選択 */}
  <div className="mb-4">
    <label>フィルムグレイン</label>
    <select value={filmGrain} onChange={...}>
      <option value="none">なし</option>
      <option value="light">軽め（15%）</option>
      <option value="medium">標準（30%）</option>
      <option value="heavy">強め（45%）</option>
    </select>
  </div>

  {/* LUT設定 */}
  <div className="mb-4">
    <label>カラーグレーディング（LUT）</label>
    <input type="checkbox" checked={useLut} onChange={...} />
    {useLut && (
      <input
        type="range"
        min="0"
        max="100"
        value={lutIntensity * 100}
        onChange={...}
      />
    )}
  </div>
</div>
```

#### 3.2 状態管理
```tsx
const [filmGrain, setFilmGrain] = useState<'none' | 'light' | 'medium' | 'heavy'>('medium');
const [useLut, setUseLut] = useState(true);
const [lutIntensity, setLutIntensity] = useState(0.3);
```

#### 3.3 APIクライアント更新
**ファイル**: `lib/api/client.ts`

```typescript
concatenate: (storyboardId: string, options?: {
  film_grain?: 'none' | 'light' | 'medium' | 'heavy';
  use_lut?: boolean;
  lut_intensity?: number;
}): Promise<Storyboard> =>
  fetchWithAuth(`/api/v1/videos/storyboard/${storyboardId}/concatenate`, {
    method: "POST",
    body: JSON.stringify(options || {}),
  }),
```

### Phase 4: FFmpegサービス確認

#### 4.1 既存機能の確認
**ファイル**: `app/services/ffmpeg_service.py`

以下の機能が既に実装されていることを確認:
- `add_film_grain(video_path, output_path, intensity)` ✅
- `apply_lut(video_path, output_path, lut_path, intensity)` ✅ or 実装

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `app/tasks/storyboard_processor.py` | LUT適用処理追加 |
| `app/videos/router.py` | 結合エンドポイント修正 |
| `app/videos/schemas.py` | `StoryboardConcatenateRequest` 修正 |
| `lib/api/client.ts` | `concatenate` 関数修正 |
| `app/generate/storyboard/page.tsx` | ルック調整UI追加 |
| `app/services/ffmpeg_service.py` | LUT適用関数確認/追加 |

## UI設計

### レビュー画面レイアウト
```
┌─────────────────────────────────────────────────┐
│  4シーンプレビュー（動画サムネイル）              │
├─────────────────────────────────────────────────┤
│  ルック調整                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ フィルムグレイン: [なし|軽め|標準|強め]    │   │
│  │                                         │   │
│  │ カラーグレーディング: [✓] 有効           │   │
│  │ 強度: ━━━━━━━●━━━ 30%                   │   │
│  └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  [← 戻る]                    [動画を結合する →] │
└─────────────────────────────────────────────────┘
```

## テスト計画

1. **単体テスト**
   - LUT適用処理のテスト
   - パラメータバリデーションテスト

2. **統合テスト**
   - 各パラメータ組み合わせでの結合テスト
   - UI操作→API→結合の一連フロー

3. **確認項目**
   - グレインなし + LUTなし → 素の動画
   - グレイン強め + LUT強め → 重いエフェクト
   - 各プリセットの見た目確認

## 実装順序

1. ✅ FFmpegサービスのLUT適用機能確認
2. ✅ バックエンド: 結合処理にLUT追加
3. ✅ バックエンド: スキーマ・エンドポイント更新
4. ✅ フロントエンド: APIクライアント更新
5. ✅ フロントエンド: ルック調整UI実装
6. ⬜ テスト・動作確認

## 備考

- LUTファイルは `app/assets/luts/clean_film.cube` を使用（既存）
- 将来的に複数LUTプリセット対応も可能（今回はスコープ外）
- プレビュー機能（結合前にエフェクト確認）は今回スコープ外
