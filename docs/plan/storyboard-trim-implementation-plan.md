# ストーリーボード動画トリム機能 実装計画書

## 概要

ストーリーボードページの動画プレビュー（reviewステップ）で、各シーン動画のトリミング（開始・終了時刻の調整）を可能にする機能を実装する。

## 現状分析

### 現在のフロー
```
ストーリー入力 → 画像生成 → 動画生成 → プレビュー（review） → 結合・書き出し
                                              ↑
                                        現在: 再生のみ
                                        目標: トリム調整可能に
```

### 既存コンポーネント
| コンポーネント | 場所 | 用途 |
|--------------|------|------|
| `RangeSlider` | `components/ui/range-slider.tsx` | デュアルハンドルスライダー |
| `VideoTrimCard` | `components/video/video-trim-card.tsx` | トリム機能付き動画カード |
| Storyboard Review | `app/generate/storyboard/page.tsx` | シーン動画プレビュー |

## UI設計

### トリム機能付きReviewステップ

```
┌──────────────────────────────────────────────────────────────────────┐
│ Step 4: 動画確認・調整                                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                           │
│  │ 起 Scene 1      │  │ 承 Scene 2      │                           │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │                           │
│  │ │             │ │  │ │             │ │                           │
│  │ │  動画プレビュー │ │  │ │  動画プレビュー │ │                           │
│  │ │   (9:16)    │ │  │ │   (9:16)    │ │                           │
│  │ │             │ │  │ │             │ │                           │
│  │ └─────────────┘ │  │ └─────────────┘ │                           │
│  │ ━━━━●━━━━━━●━━━ │  │ ━━●━━━━━━━━━━●━ │  ← スライダー              │
│  │ 0.5s    4.5s   │  │ 0.0s      5.0s │                            │
│  │ 使用: 4.0秒     │  │ 使用: 5.0秒     │                            │
│  └─────────────────┘  └─────────────────┘                           │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                           │
│  │ 転 Scene 3      │  │ 結 Scene 4      │                           │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │                           │
│  │ │             │ │  │ │             │ │                           │
│  │ │  動画プレビュー │ │  │ │  動画プレビュー │ │                           │
│  │ │   (9:16)    │ │  │ │   (9:16)    │ │                           │
│  │ │             │ │  │ │             │ │                           │
│  │ └─────────────┘ │  │ └─────────────┘ │                           │
│  │ ━━━━━●━━━━●━━━━ │  │ ━━━━●━━━━━━●━━━ │                           │
│  │ 1.0s    3.5s   │  │ 0.5s      4.0s │                            │
│  │ 使用: 2.5秒     │  │ 使用: 3.5秒     │                            │
│  └─────────────────┘  └─────────────────┘                           │
│                                                                      │
│  ───────────────────────────────────────                            │
│  合計使用時間: 15.0秒                                                 │
│                                                                      │
│  [フィルム設定]  [✓ トリムを適用して結合]  [結合開始]                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### ホバープレビュー機能
- スライダー上をホバーすると、その時点のフレームを動画プレビューに表示
- 黄色インジケーターでホバー位置を視覚化
- 既存の `RangeSlider` の `onHoverTime` / `onHoverEnd` を活用

## 実装計画

### Phase 1: フロントエンド - シーン用トリムコンポーネント

#### Task 1.1: SceneTrimCard コンポーネント作成
**ファイル:** `components/video/scene-trim-card.tsx`

VideoTrimCardをベースに、シーン情報表示を統合した専用コンポーネントを作成。

```tsx
interface SceneTrimCardProps {
  scene: StoryboardScene;
  duration: number;
  trimRange: [number, number];
  onTrimChange: (range: [number, number]) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}
```

**機能:**
- シーン番号・act表示（起承転結）
- 動画プレビュー（9:16アスペクト比）
- ホバーシーク機能
- トリムスライダー
- 再生成ボタン（オプション）

#### Task 1.2: storyboard/page.tsx の修正
**ファイル:** `app/generate/storyboard/page.tsx`

**追加するstate:**
```tsx
// 各シーンのトリム設定
const [sceneTrimSettings, setSceneTrimSettings] = useState<
  Record<string, { startTime: number; endTime: number; duration: number }>
>({});

// トリム適用フラグ
const [applyTrim, setApplyTrim] = useState(true);
```

**修正箇所:**
1. reviewステップのシーン表示部分を `SceneTrimCard` に置き換え
2. 動画読み込み時にdurationを取得してstateに保存
3. 結合ボタンでトリム情報を送信

### Phase 2: バックエンド - 結合APIのトリム対応

#### Task 2.1: 既存の `/concat/v2` エンドポイントを活用

既に実装済みの `/api/v1/videos/concat/v2` エンドポイントを使用。

**リクエスト形式:**
```json
{
  "videos": [
    {
      "video_url": "https://r2.example.com/scene1.mp4",
      "start_time": 0.5,
      "end_time": 4.5
    },
    {
      "video_url": "https://r2.example.com/scene2.mp4",
      "start_time": 0.0,
      "end_time": 5.0
    }
  ],
  "transition": "fade",
  "transition_duration": 0.5
}
```

#### Task 2.2: ストーリーボード結合エンドポイントの拡張（オプション）

現在の `/storyboard/{id}/concatenate` エンドポイントにトリム情報を追加。

**ファイル:** `app/videos/router.py`

```python
class StoryboardConcatenateRequest(BaseModel):
    film_grain: str | None = None
    use_lut: bool | None = None
    lut_intensity: float | None = None
    # 追加
    scene_trims: dict[int, dict[str, float]] | None = None
    # 例: {1: {"start_time": 0.5, "end_time": 4.0}, 2: {...}}
```

### Phase 3: フロントエンド - 結合処理の修正

#### Task 3.1: 結合API呼び出しの修正
**ファイル:** `app/generate/storyboard/page.tsx`

```tsx
const handleConcatenate = async () => {
  // シーンをdisplay_order順にソート
  const sortedScenes = [...scenes]
    .filter(s => s.video_url) // video_urlがあるシーンのみ
    .sort((a, b) => a.display_order - b.display_order);

  if (applyTrim && Object.keys(sceneTrimSettings).length > 0) {
    // トリム付き結合 (/concat/v2 を使用)
    const videos = sortedScenes.map(scene => ({
      video_url: scene.video_url,
      start_time: sceneTrimSettings[scene.id]?.startTime ?? 0,
      end_time: sceneTrimSettings[scene.id]?.endTime ?? sceneTrimSettings[scene.id]?.duration ?? 5,
    }));

    const result = await videosApi.concatV2({
      videos,
      transition: selectedTransition ?? 'fade',  // ユーザー選択可能に
      transition_duration: transitionDuration ?? 0.5,
    });

    // 結合完了後、storyboardのfinal_video_urlを更新
    // ※ポーリングでconcat完了を待ってから更新
    setConcatId(result.id);
    startConcatPolling(result.id);
  } else {
    // 従来の結合（トリムなし）
    await storyboardApi.concatenate(storyboardId, options);
  }
};

// concat/v2使用時のポーリング処理
const startConcatPolling = async (concatId: string) => {
  const poll = async () => {
    const status = await videosApi.getConcatStatus(concatId);
    if (status.status === 'completed') {
      // final_video_urlをstoryboardに反映（手動更新 or 別API）
      setFinalVideoUrl(status.video_url);
    } else if (status.status === 'failed') {
      setError(status.error_message);
    } else {
      setTimeout(poll, 3000);
    }
  };
  poll();
};
```

#### Task 3.2: 動画再生成時のトリムリセット

```tsx
const handleRegenerateVideo = async (sceneNumber: number) => {
  const scene = scenes.find(s => s.scene_number === sceneNumber);
  if (!scene) return;

  // トリム設定をリセット
  setSceneTrimSettings(prev => {
    const updated = { ...prev };
    delete updated[scene.id];
    return updated;
  });

  // 再生成実行
  await storyboardApi.regenerateVideo(storyboardId, sceneNumber, options);
};
```

#### Task 3.3: duration取得タイミング

```tsx
// ポーリングでシーン完了を検知した時にdurationを取得
useEffect(() => {
  scenes.forEach(scene => {
    if (scene.status === 'completed' && scene.video_url && !sceneTrimSettings[scene.id]) {
      // duration取得
      getVideoDuration(scene.video_url).then(duration => {
        setSceneTrimSettings(prev => ({
          ...prev,
          [scene.id]: {
            startTime: 0,
            endTime: duration,
            duration: duration,
          },
        }));
      });
    }
  });
}, [scenes]);

// duration取得ユーティリティ（既存のものを再利用）
const getVideoDuration = (url: string): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(video.duration);
      video.remove();
    };
    video.onerror = () => {
      resolve(5); // デフォルト5秒
      video.remove();
    };
    // タイムアウト
    setTimeout(() => {
      resolve(5);
      video.remove();
    }, 5000);
    video.src = url;
  });
};
```

#### Task 3.4: 合計時間表示
```tsx
const totalUsedDuration = useMemo(() => {
  return scenes.reduce((total, scene) => {
    const trim = sceneTrimSettings[scene.id];
    if (trim) {
      return total + (trim.endTime - trim.startTime);
    }
    return total + (trim?.duration ?? 5);
  }, 0);
}, [scenes, sceneTrimSettings]);
```

#### Task 3.5: フィルム設定（Film Grain / LUT）の統合

**問題**: `/concat/v2` は現在 film_grain や use_lut をサポートしていない

**解決策A（推奨）**: バックエンドで `/concat/v2` にフィルム設定オプションを追加

```python
# app/videos/schemas.py
class ConcatVideoRequestV2(BaseModel):
    videos: list[VideoTrimInfo]
    transition: TransitionType = TransitionType.NONE
    transition_duration: float = Field(0.5, ge=0.1, le=2.0)
    # 追加
    film_grain: str | None = None  # 'none' | 'light' | 'medium' | 'heavy'
    use_lut: bool = False
    lut_intensity: float = Field(0.5, ge=0.0, le=1.0)
```

**解決策B**: トリム使用時は既存の `/storyboard/{id}/concatenate` にトリム情報を渡す（Task 2.2）

### Phase 4: データベースマイグレーション（必要に応じて）

#### Task 4.1: マイグレーション判断

**マイグレーションが必要なケース:**
- シーンごとのトリム設定をDBに永続化したい場合
- 結合後もトリム情報を保持したい場合

**マイグレーションが不要なケース（推奨）:**
- トリム設定はフロントエンドのstateのみで管理
- 結合時にAPIパラメータとして送信するだけ

#### Task 4.2: マイグレーション実施手順（必要な場合）

Supabase MCPを使用してマイグレーションを実施。

```sql
-- storyboard_scenes テーブルにトリム情報を追加
ALTER TABLE storyboard_scenes
ADD COLUMN trim_start_time REAL DEFAULT 0.0,
ADD COLUMN trim_end_time REAL DEFAULT NULL;
```

**MCP使用例:**
```
mcp__supabase__apply_migration({
  project_id: "PROJECT_ID",
  name: "add_scene_trim_columns",
  query: "ALTER TABLE storyboard_scenes ADD COLUMN trim_start_time REAL DEFAULT 0.0, ADD COLUMN trim_end_time REAL DEFAULT NULL;"
})
```

### Phase 5: テスト実施

#### Task 5.1: フロントエンドビルドテスト
```bash
cd movie-maker
npm run build
```

**確認項目:**
- TypeScriptエラーなし
- ビルド成功

#### Task 5.2: コンポーネント動作テスト

| テスト項目 | 期待結果 |
|-----------|---------|
| スライダーホバー | 動画が該当時刻にシーク |
| トリム範囲変更 | 開始・終了時刻が更新 |
| 最小トリム時間 | 0.5秒未満に設定不可 |
| プレビュー再生 | トリム範囲内のみ再生 |

#### Task 5.3: バックエンドテスト
```bash
cd movie-maker-api
source venv/bin/activate
pytest tests/ -v
```

**確認項目:**
- 既存テストがパス
- `/concat/v2` エンドポイントが正常動作

#### Task 5.4: E2Eテスト（手動）

1. ストーリーボード作成
2. 動画生成完了まで待機
3. reviewステップでトリム調整
4. ホバープレビュー動作確認
5. 結合実行
6. 出力動画がトリム適用されていることを確認

## ファイル変更一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `components/video/scene-trim-card.tsx` | 新規作成 | シーン専用トリムカード |
| `app/generate/storyboard/page.tsx` | 修正 | トリムUI統合、state追加、結合処理修正 |
| `lib/api/client.ts` | 修正（オプション） | concatV2にfilm_grain等オプション追加 |
| `app/videos/schemas.py` | 修正（オプション） | ConcatVideoRequestV2にfilm_grain等追加 |
| `app/videos/router.py` | 修正（オプション） | concatenateエンドポイント拡張 |
| `app/tasks/video_concat_processor.py` | 修正（オプション） | film_grain/LUT処理追加 |

## 実装優先順位

```
[必須] Phase 1: SceneTrimCardコンポーネント作成
        ↓
[必須] Phase 3: 結合処理修正（Task 3.1〜3.4）
        ↓
[推奨] Task 3.5: フィルム設定統合（film_grain/LUT対応）
        ↓
[必須] Phase 5: テスト実施
        ↓
[任意] Phase 2: バックエンド拡張（既存concatenateにトリム対応）
        ↓
[任意] Phase 4: DBマイグレーション（永続化が必要な場合のみ）
```

### 最小実装（MVP）
- Phase 1 + Phase 3（Task 3.1〜3.4） + Phase 5
- フィルム設定は従来通りトリムなし結合時のみ使用可能

## 注意事項

1. **最小トリム時間**: 0.5秒を下回らないようバリデーション
2. **動画duration取得**: `loadedmetadata`イベントで取得、タイムアウト処理も考慮
3. **ホバーシーク**: 再生中にホバーした場合は一時停止してからシーク
4. **キャッシュ対策**: 動画URLにはキャッシュバスターを適用
5. **シーン順序**: display_order順で結合する（並び替え対応）
6. **動画再生成時**: トリム設定をリセットする
7. **video_url未存在**: 生成失敗シーンはトリムUIを非表示にする

## 潜在的エラー要因と対策

| エラー要因 | 発生条件 | 対策 |
|-----------|---------|------|
| duration取得失敗 | CORS、ネットワークエラー | タイムアウト付きでデフォルト5秒にフォールバック |
| トリム範囲不正 | start_time >= end_time | スキーマバリデーション（既存実装済み） |
| シーン順序不整合 | display_orderが重複 | ソート後にindexで順序保証 |
| メモリリーク | video要素のクリーンアップ漏れ | useEffectのcleanupで要素を削除 |
| 結合中のUI操作 | 結合処理中にトリム変更 | 結合中はUIをdisabled化 |
| キャッシュ問題 | 再生成後に古い動画が表示 | getVideoCacheBustedUrl使用（既存実装済み） |

## Supabaseマイグレーション対応

マイグレーションが必要になった場合は、以下の手順で実施：

1. **変更内容の確認**: スキーマ変更が必要か判断
2. **MCPでマイグレーション適用**:
   ```
   mcp__supabase__apply_migration を使用
   ```
3. **マイグレーション確認**:
   ```
   mcp__supabase__list_migrations で適用状況を確認
   ```
4. **型定義更新**: 必要に応じてTypeScript型を再生成
   ```
   mcp__supabase__generate_typescript_types
   ```

## 最終テストチェックリスト

実装完了後、以下を全て確認：

### ビルド・テスト
- [ ] フロントエンドビルド成功（`npm run build`）
- [ ] バックエンドテスト通過（`pytest tests/ -v`）

### トリムUI動作
- [ ] スライダーホバーで動画シークが動作
- [ ] トリム範囲調整が正しく反映
- [ ] 最小トリム時間（0.5秒）のバリデーション動作
- [ ] 合計使用時間が正しく計算される

### シーン操作連携
- [ ] シーン並び替え後もトリム設定が正しく維持される
- [ ] 動画再生成時にトリム設定がリセットされる
- [ ] video_urlがないシーンでエラーが発生しない

### 結合処理
- [ ] トリム適用結合が正常動作
- [ ] 出力動画の長さがトリム設定と一致
- [ ] display_order順で結合される
- [ ] フィルム設定（film_grain/LUT）が適用される

### 後方互換性
- [ ] 既存機能（トリムなし結合）が引き続き動作
- [ ] 従来のconcatenate APIが正常に動作

### エラーハンドリング
- [ ] ネットワークエラー時に適切なメッセージ表示
- [ ] 結合失敗時にエラー状態が表示される

---

作成日: 2026-01-02
最終更新: 2026-01-02
