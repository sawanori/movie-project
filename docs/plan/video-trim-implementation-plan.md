# 動画トリミング機能 実装計画書

## 概要

動画結合ページにおいて、各動画の使用範囲（トリミング）を調整できる機能を実装する。
ユーザーはスライダーUIを使って各動画の開始時間・終了時間を指定し、必要な部分のみを結合できるようになる。

## 現状

| 項目 | 現状 |
|------|------|
| 動画選択 | ✅ 実装済み |
| 順序変更 | ✅ 実装済み |
| トランジション設定 | ✅ 実装済み |
| トリミング調整 | ❌ 未実装 |

## ユーザーフロー

```
1. 動画を選択（現状通り）
      ↓
2. 各動画のトリミング範囲を調整（新機能）
   - スライダーで開始/終了位置を指定
   - プレビュー再生で確認
      ↓
3. トランジション設定（現状通り）
      ↓
4. 結合実行
```

## UI設計

### トリミング調整パネル

```
┌────────────────────────────────────────────────────┐
│ 結合順序 & トリミング調整                            │
├────────────────────────────────────────────────────┤
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │ 1. シーン動画「女性が歩く」            [▲][▼][×]│ │
│ │ ┌──────────┐                                   │ │
│ │ │          │  ●━━━━━━━━━━━━━━━━━━━━━━━●       │ │
│ │ │ プレビュー │  0s                      5s      │ │
│ │ │          │                                   │ │
│ │ └──────────┘  開始: 0.5s  終了: 4.0s           │ │
│ │               使用時間: 3.5秒        [▶再生]   │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │ 2. ストーリー動画「夕焼けの海」        [▲][▼][×]│ │
│ │ ┌──────────┐                                   │ │
│ │ │          │  ●━━━━━━━━━━━━━━━━━━━━━━━●       │ │
│ │ │ プレビュー │  0s                      20s     │ │
│ │ │          │                                   │ │
│ │ └──────────┘  開始: 0.0s  終了: 20.0s          │ │
│ │               使用時間: 20.0秒       [▶再生]   │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ 合計再生時間: 23.5秒（トランジション考慮前）        │
└────────────────────────────────────────────────────┘
```

### レンジスライダー仕様

- 両端ハンドル付きのデュアルスライダー
- 左ハンドル: 開始位置
- 右ハンドル: 終了位置
- 選択範囲はハイライト表示
- 0.1秒単位で調整可能
- **最小トリム時間: 0.5秒**（これ未満はエラー）

---

## 実装タスク

### Phase 1: バックエンド実装

#### Task 1.1: FFmpegService にトリム機能追加

**ファイル**: `movie-maker-api/app/services/ffmpeg_service.py`

```python
async def trim_video(
    self,
    input_path: str,
    output_path: str,
    start_time: float,
    end_time: float | None = None,
) -> str:
    """
    動画をトリミング

    Args:
        input_path: 入力動画パス
        output_path: 出力動画パス
        start_time: 開始位置（秒）
        end_time: 終了位置（秒）、Noneの場合は最後まで

    Returns:
        str: 出力動画パス

    Raises:
        FFmpegError: トリミング失敗時
        ValueError: start_time >= end_time の場合
    """
```

**FFmpegコマンド（精度重視・推奨）**:
```bash
# -ss を -i の後に置くことで正確なシーク
ffmpeg -i input.mp4 -ss 1.5 -to 4.0 -c:v libx264 -c:a aac -y output.mp4
```

**注意**: `-ss` を `-i` の前に置くと高速だが、キーフレーム単位でしかカットできない。
精度を優先するため、`-ss` は `-i` の後に配置する。

#### Task 1.2: APIスキーマ拡張

**ファイル**: `movie-maker-api/app/videos/schemas.py`

```python
class VideoTrimInfo(BaseModel):
    """動画トリミング情報"""
    video_id: str | None = None
    video_url: str | None = None
    start_time: float = Field(
        0.0,
        ge=0.0,
        description="開始位置（秒）"
    )
    end_time: float | None = Field(
        None,
        ge=0.0,
        description="終了位置（秒）、Noneの場合は最後まで"
    )

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_time is not None:
            if self.start_time >= self.end_time:
                raise ValueError("end_time は start_time より大きい必要があります")
            # 最小トリム時間チェック（0.5秒以上）
            if self.end_time - self.start_time < 0.5:
                raise ValueError("トリム範囲は0.5秒以上必要です")
        return self

    @model_validator(mode="after")
    def validate_video_source(self):
        if not self.video_id and not self.video_url:
            raise ValueError("video_id または video_url のいずれかが必要です")
        return self


class ConcatVideoRequestV2(BaseModel):
    """動画結合リクエスト（トリミング対応版）"""
    videos: list[VideoTrimInfo] = Field(
        ...,
        min_length=2,
        max_length=10,
        description="結合する動画のリスト（トリミング情報付き）"
    )
    transition: TransitionType = Field(
        TransitionType.NONE,
        description="トランジション効果"
    )
    transition_duration: float = Field(
        0.5,
        ge=0.0,
        le=2.0,
        description="トランジション時間（秒）"
    )


class ConcatVideoResponseV2(BaseModel):
    """動画結合レスポンス（トリミング対応版）"""
    id: str
    status: str
    message: str
    source_videos: list[VideoTrimInfo]
    transition: str
    transition_duration: float
    created_at: datetime
```

#### Task 1.3: ルーターに新エンドポイント追加

**ファイル**: `movie-maker-api/app/videos/router.py`

```python
@router.post("/concat/v2", response_model=ConcatVideoResponseV2)
async def concat_videos_v2(
    request: ConcatVideoRequestV2,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    動画結合（トリミング対応版）
    各動画の使用範囲を指定して結合
    """
    # 実装
```

**後方互換性**: 既存の `/concat` エンドポイントはそのまま維持。

#### Task 1.4: 結合処理にトリム適用

**ファイル**: `movie-maker-api/app/tasks/video_concat_processor.py`

結合処理フローを以下のように変更:

```
1. 動画ダウンロード
2. 各動画にトリミング適用（start_time/end_time指定がある場合）
   - start_time > 0 または end_time が指定されている場合のみトリム実行
   - トリム不要な場合はスキップ（パフォーマンス向上）
3. トリミング済み動画を結合
4. 一時ファイル削除（トリム済みファイル含む）
```

**エラーハンドリング**:
- トリム範囲が動画の長さを超えている場合: エラーを返す
- トリム処理失敗時: 元の動画を使用してリトライするか、エラーを返す

#### Task 1.5: 動画メタデータ取得API（任意）

動画の長さを取得するAPIがない場合は追加。
フロントエンドでスライダーの最大値を設定するために必要。

**エンドポイント**: `GET /api/videos/{video_id}/metadata`

**レスポンス例**:
```json
{
  "id": "xxx",
  "duration": 5.0,
  "width": 720,
  "height": 1280,
  "fps": 30
}
```

---

### Phase 2: フロントエンド実装

#### Task 2.1: レンジスライダーコンポーネント作成

**ファイル**: `movie-maker/components/ui/range-slider.tsx`

shadcn/ui のスライダーを拡張するか、`react-slider` などのライブラリを使用。

**Props**:
```typescript
interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  minRange?: number;  // 最小範囲（0.5秒）
  value: [number, number];  // [start, end]
  onChange: (value: [number, number]) => void;
  formatLabel?: (value: number) => string;
  disabled?: boolean;
}
```

**バリデーション**:
- `value[1] - value[0] >= minRange` を常に維持
- ハンドルが重なり合わないようにする

#### Task 2.2: VideoTrimCard コンポーネント作成

**ファイル**: `movie-maker/components/video/video-trim-card.tsx`

各動画のトリミング設定UIをカード形式で表示。

**Props**:
```typescript
interface VideoTrimCardProps {
  item: SelectableItem;
  index: number;
  duration: number;  // 動画の長さ
  trimRange: [number, number];  // [startTime, endTime]
  onTrimChange: (range: [number, number]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}
```

**機能**:
- 動画サムネイル/プレビュー表示
- レンジスライダー
- 使用時間表示（`{endTime - startTime}秒使用`）
- プレビュー再生ボタン（指定範囲のみ再生）
- 順序変更ボタン（▲▼）
- 削除ボタン（×）

**プレビュー再生の実装**:
```typescript
const handlePreview = () => {
  if (videoRef.current) {
    videoRef.current.currentTime = trimRange[0];
    videoRef.current.play();
    // end_time に達したら停止
    const checkTime = () => {
      if (videoRef.current && videoRef.current.currentTime >= trimRange[1]) {
        videoRef.current.pause();
      } else {
        requestAnimationFrame(checkTime);
      }
    };
    checkTime();
  }
};
```

#### Task 2.3: concat/page.tsx の修正

**ファイル**: `movie-maker/app/concat/page.tsx`

**変更点**:

1. State追加（Mapではなくオブジェクトを使用）
```typescript
// トリミング情報を保持（JSONシリアライズ可能な形式）
interface TrimSetting {
  startTime: number;
  endTime: number;
  duration: number;
}

const [trimSettings, setTrimSettings] = useState<Record<string, TrimSetting>>({});
```

2. 動画選択時に長さを取得
```typescript
const toggleVideoSelection = async (video: VideoItem) => {
  const itemKey = `${video.id}`;
  const isSelected = selectedItems.some((i) => i.id === video.id && i.type === "scene");

  if (isSelected) {
    // 選択解除時: trimSettingsからも削除
    setSelectedItems(selectedItems.filter((i) => !(i.id === video.id && i.type === "scene")));
    setTrimSettings(prev => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
  } else if (selectedItems.length < 10) {
    // 選択時: 動画の長さを取得してtrimSettingsに追加
    const duration = await getVideoDuration(video.final_video_url);
    const item: SelectableItem = { /* ... */ };
    setSelectedItems([...selectedItems, item]);
    setTrimSettings(prev => ({
      ...prev,
      [itemKey]: {
        startTime: 0,
        endTime: duration,
        duration: duration,
      }
    }));
  }
};
```

3. 動画長さ取得のヘルパー関数
```typescript
const getVideoDuration = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      resolve(video.duration);
    };
    video.onerror = () => {
      // エラー時はデフォルト値（5秒）を返す
      console.warn('Failed to load video metadata, using default duration');
      resolve(5.0);
    };
    // タイムアウト設定（5秒）
    setTimeout(() => {
      resolve(5.0);
    }, 5000);
  });
};
```

4. 結合リクエスト時にトリミング情報を含める
```typescript
const handleConcat = async () => {
  if (selectedItems.length < 2) {
    alert("2本以上の動画を選択してください");
    return;
  }

  // トリミング設定の検証
  for (const item of selectedItems) {
    const trim = trimSettings[item.id];
    if (!trim) {
      alert(`動画「${item.label}」のトリミング情報が取得できませんでした`);
      return;
    }
    if (trim.endTime - trim.startTime < 0.5) {
      alert(`動画「${item.label}」のトリム範囲は0.5秒以上必要です`);
      return;
    }
  }

  setProcessing(true);
  setConcatStatus(null);

  try {
    const videos = selectedItems.map(item => {
      const trim = trimSettings[item.id];
      return {
        video_id: item.type === "scene" ? item.id : undefined,
        video_url: item.type === "storyboard" ? item.videoUrl : undefined,
        start_time: trim?.startTime ?? 0,
        end_time: trim?.endTime ?? undefined,
      };
    });

    const res = await videosApi.concatV2({
      videos,
      transition,
      transition_duration: transition === "none" ? 0 : transitionDuration,
    });
    setConcatJobId(res.id);
  } catch (error) {
    console.error("Failed to start concat:", error);
    alert("結合に失敗しました");
    setProcessing(false);
  }
};
```

5. 合計再生時間の計算を更新
```typescript
const estimatedDuration = useCallback(() => {
  let baseDuration = 0;
  selectedItems.forEach((item) => {
    const trim = trimSettings[item.id];
    if (trim) {
      baseDuration += trim.endTime - trim.startTime;
    }
  });
  if (transition !== "none" && selectedItems.length > 1) {
    return Math.max(0, baseDuration - transitionDuration * (selectedItems.length - 1));
  }
  return baseDuration;
}, [selectedItems, trimSettings, transition, transitionDuration]);
```

6. UIを「結合順序」から「結合順序 & トリミング調整」に変更

#### Task 2.4: API クライアント更新

**ファイル**: `movie-maker/lib/api/client.ts`

```typescript
interface VideoTrimInfo {
  video_id?: string;
  video_url?: string;
  start_time: number;
  end_time?: number;
}

interface ConcatV2Request {
  videos: VideoTrimInfo[];
  transition: string;
  transition_duration: number;
}

interface ConcatV2Response {
  id: string;
  status: string;
  message: string;
  source_videos: VideoTrimInfo[];
  transition: string;
  transition_duration: number;
  created_at: string;
}

// videosApi に追加
concatV2: async (request: ConcatV2Request): Promise<ConcatV2Response> => {
  const response = await apiClient.post('/videos/concat/v2', request);
  return response.data;
}
```

---

### Phase 3: データベース対応（必要な場合）

#### Task 3.1: Supabase マイグレーション確認

**確認事項**:
- `video_concatenations` テーブルにトリミング情報を保存する必要があるか確認
- 必要な場合は以下のカラムを追加:

```sql
-- source_videos カラムを JSONB 型に変更（トリミング情報を含む）
ALTER TABLE video_concatenations
  ALTER COLUMN source_video_ids TYPE JSONB
  USING to_jsonb(source_video_ids);

-- カラム名も変更
ALTER TABLE video_concatenations
  RENAME COLUMN source_video_ids TO source_videos;
```

**マイグレーション実行方法**:
- Supabase MCP を使用して `apply_migration` ツールでマイグレーションを実行
- マイグレーション名: `add_trim_info_to_concatenations`

#### Task 3.2: 既存データの互換性確認

- 既存の `video_concatenations` レコードがある場合、新しいスキーマでも正常に動作するか確認
- 必要に応じてデータマイグレーションスクリプトを作成

---

### Phase 4: テスト & 検証

#### Task 4.1: バックエンド単体テスト

**ファイル**: `movie-maker-api/tests/test_ffmpeg_trim.py`

```python
import pytest
from app.services.ffmpeg_service import FFmpegService

class TestTrimVideo:
    async def test_trim_basic(self):
        """基本的なトリミングが動作すること"""
        pass

    async def test_trim_start_only(self):
        """開始位置のみ指定した場合"""
        pass

    async def test_trim_invalid_range(self):
        """start >= end の場合はエラー"""
        pass

    async def test_trim_too_short(self):
        """0.5秒未満のトリムはエラー"""
        pass

    async def test_trim_exceeds_duration(self):
        """end_time が動画長を超える場合"""
        pass
```

#### Task 4.2: バックエンドAPIテスト

**ファイル**: `movie-maker-api/tests/test_concat_v2.py`

```python
class TestConcatV2:
    async def test_concat_with_trim(self):
        """トリミング付き結合が動作すること"""
        pass

    async def test_concat_without_trim(self):
        """トリミングなしでも動作すること（後方互換性）"""
        pass

    async def test_concat_mixed_trim(self):
        """一部の動画のみトリミング指定"""
        pass

    async def test_concat_invalid_trim_range(self):
        """不正なトリム範囲でエラーが返ること"""
        pass
```

#### Task 4.3: フロントエンドテスト

- スライダー操作の動作確認
- プレビュー再生の動作確認（指定範囲で停止するか）
- 動画選択/解除時のtrimSettings更新
- 複数動画のトリミング設定が正しく送信されるか
- エラーメッセージの表示

#### Task 4.4: E2Eテスト（最終検証）

**テストシナリオ**:

1. **基本フロー**
   - [ ] 動画を2本選択
   - [ ] 1本目を1.0s〜4.0sにトリム
   - [ ] 2本目はトリムなし（全体使用）
   - [ ] ディゾルブトランジション設定
   - [ ] 結合実行
   - [ ] 完成動画をダウンロードして確認

2. **エッジケース**
   - [ ] 最小トリム（0.5秒）で結合
   - [ ] 10本の動画を結合
   - [ ] すべての動画をトリムして結合
   - [ ] ストーリー動画とシーン動画の混合

3. **エラーケース**
   - [ ] トリム範囲が動画長を超える場合
   - [ ] 0.5秒未満のトリムを設定した場合
   - [ ] ネットワークエラー時の挙動

#### Task 4.5: パフォーマンステスト

- 長い動画（20秒以上）のトリミング処理時間
- 複数動画のトリミング + 結合の処理時間
- フロントエンドのスライダー操作のレスポンス

---

## 技術的考慮事項

### 動画の長さ取得

フロントエンドで動画の長さを取得する方法:

**方法A: HTML5 Video API を使用（推奨）**
```typescript
const getVideoDuration = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      resolve(video.duration);
    };
    video.onerror = () => {
      // フォールバック: デフォルト値を返す
      resolve(5.0);
    };
  });
};
```

**方法B: バックエンドAPIで取得**
- 動画メタデータAPIを呼び出す
- 初期ロード時にすべての動画の長さを取得しておく

### FFmpegトリミングの注意点

1. **-ss の位置による挙動の違い**

   | コマンド | 動作 | 精度 | 速度 |
   |---------|------|------|------|
   | `ffmpeg -ss 1.5 -i input.mp4 -to 2.5 ...` | キーフレームシーク | 低 | 高速 |
   | `ffmpeg -i input.mp4 -ss 1.5 -to 4.0 ...` | フレーム精度シーク | 高 | 低速 |

2. **推奨コマンド（精度重視）**
```bash
ffmpeg -i input.mp4 -ss 1.5 -to 4.0 -c:v libx264 -c:a aac -y output.mp4
```

3. **-to vs -t の違い**
   - `-to 4.0`: 絶対時間（4秒地点まで）
   - `-t 2.5`: 相対時間（開始から2.5秒間）
   - **本実装では `-to` を使用**（ユーザーが指定するのは絶対時間のため）

### 後方互換性

- 既存の `POST /concat` エンドポイントはそのまま維持
- 新しい `POST /concat/v2` エンドポイントを追加
- フロントエンドは新しいエンドポイントを使用

### エラーハンドリング一覧

| エラーケース | フロント対応 | バックエンド対応 |
|-------------|-------------|-----------------|
| 動画長さ取得失敗 | デフォルト値(5秒)を使用 | - |
| トリム範囲 < 0.5秒 | スライダーで制限 + 送信前検証 | バリデーションエラー返却 |
| end_time > 動画長 | - | 動画長に丸める or エラー |
| start_time >= end_time | スライダーで制限 | バリデーションエラー返却 |
| FFmpegトリム失敗 | - | エラーメッセージ返却 |

---

## Supabase マイグレーション方針

### マイグレーションが必要な場合

DBスキーマの変更が必要になった場合は、以下の手順で対応する:

1. **マイグレーションファイル作成**
   - 変更内容をSQLで記述
   - ロールバック可能な形で設計

2. **Supabase MCP を使用して適用**
   ```
   mcp__supabase__apply_migration を使用
   - project_id: 対象プロジェクト
   - name: マイグレーション名（snake_case）
   - query: SQLクエリ
   ```

3. **適用後の確認**
   - `mcp__supabase__list_migrations` で適用状況確認
   - `mcp__supabase__list_tables` でスキーマ確認

### 本機能での想定マイグレーション

現時点では、トリミング情報はAPIリクエスト/レスポンスでのみ使用し、
DBには保存しない設計のため、マイグレーションは**不要**の見込み。

ただし、結合履歴にトリミング情報を保存したい場合は、以下のマイグレーションを実行:

```sql
-- video_concatenations テーブルにトリミング情報を追加
ALTER TABLE video_concatenations
  ADD COLUMN source_videos JSONB;

-- 既存データの移行（source_video_ids -> source_videos）
UPDATE video_concatenations
SET source_videos = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'video_id', vid,
      'start_time', 0,
      'end_time', null
    )
  )
  FROM unnest(source_video_ids) AS vid
)
WHERE source_videos IS NULL;
```

---

## 工数見積もり

| Phase | タスク | 見積もり |
|-------|--------|---------|
| Phase 1 | バックエンド実装 | 2-3時間 |
| Phase 2 | フロントエンド実装 | 3-4時間 |
| Phase 3 | DB対応（必要な場合） | 0.5-1時間 |
| Phase 4 | テスト & 検証 | 2-3時間 |
| **合計** | | **7.5-11時間** |

---

## 最終チェックリスト

実装完了後、以下を確認してからリリースする:

### バックエンド
- [ ] FFmpegService.trim_video() が正常動作
- [ ] APIスキーマのバリデーションが正常動作
- [ ] 結合処理でトリミングが正しく適用される
- [ ] エラーケースで適切なエラーメッセージが返る
- [ ] 既存の `/concat` エンドポイントが引き続き動作（後方互換性）

### フロントエンド
- [ ] レンジスライダーが正常動作
- [ ] 動画選択時に長さが正しく取得される
- [ ] 動画選択解除時にtrimSettingsがクリーンアップされる
- [ ] プレビュー再生が指定範囲で動作
- [ ] 合計再生時間が正しく計算される
- [ ] APIリクエストにトリミング情報が正しく含まれる

### 統合テスト
- [ ] E2Eテストシナリオがすべてパス
- [ ] エラーケースで適切なUIフィードバック
- [ ] 長時間動画でもパフォーマンス問題なし

---

## 将来の拡張案

1. **プリセット機能**: よく使うトリム設定を保存
2. **フレーム単位編集**: より精密な編集
3. **波形表示**: 音声波形でカット位置を決定
4. **プレビュー結合**: 結合結果のプレビュー再生
5. **ドラッグ&ドロップでトリム**: タイムライン上でドラッグして範囲選択

---

## 関連ファイル

### バックエンド
- `movie-maker-api/app/services/ffmpeg_service.py`
- `movie-maker-api/app/videos/schemas.py`
- `movie-maker-api/app/videos/router.py`
- `movie-maker-api/app/tasks/video_concat_processor.py`
- `movie-maker-api/tests/test_ffmpeg_trim.py`（新規）
- `movie-maker-api/tests/test_concat_v2.py`（新規）

### フロントエンド
- `movie-maker/app/concat/page.tsx`
- `movie-maker/components/ui/range-slider.tsx`（新規）
- `movie-maker/components/video/video-trim-card.tsx`（新規）
- `movie-maker/lib/api/client.ts`
