# アドクリエイター アスペクト比選択機能 実装計画書

## 概要

アドクリエイターページで、動画選択前にアスペクト比（縦長/横長/正方形）を選択する機能を追加する。
選択したアスペクト比に対応する動画のみが選択可能となる。

---

## 背景

広告動画は配信プラットフォームによって最適なアスペクト比が異なる：

| アスペクト比 | 用途 |
|-------------|------|
| 9:16（縦長） | TikTok, Instagram Stories/Reels, YouTube Shorts |
| 16:9（横長） | YouTube, Facebook広告, TV CM |
| 1:1（正方形） | Instagram投稿, Facebook投稿 |

異なるアスペクト比の動画を混在させると品質が低下するため、最初に選択させる。

---

## 現状分析

### 現在のフロー

```
ページ表示
    ↓
動画選択（シーン/ストーリー）
    ↓
順序調整・トリミング
    ↓
トランジション選択
    ↓
広告を作成
```

### 変更後のフロー

```
ページ表示
    ↓
★ アスペクト比を選択 ★  ← 新規追加
    ↓
動画選択（選択した比率の動画のみ表示）
    ↓
順序調整・トリミング
    ↓
トランジション選択
    ↓
広告を作成
```

---

## UI設計

### Step 1: アスペクト比選択画面

```
┌──────────────────────────────────────────────────────────────────┐
│  アドクリエイター                                      [履歴]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    広告のアスペクト比を選択                       │
│                                                                  │
│     ┌─────────┐    ┌─────────────┐    ┌─────────┐               │
│     │         │    │             │    │         │               │
│     │  ████   │    │  █████████  │    │  █████  │               │
│     │  ████   │    │             │    │  █████  │               │
│     │  ████   │    │             │    │  █████  │               │
│     │         │    │             │    │         │               │
│     └─────────┘    └─────────────┘    └─────────┘               │
│       縦長            横長              正方形                   │
│       9:16           16:9               1:1                      │
│                                                                  │
│     TikTok         YouTube           Instagram                   │
│     Reels          Facebook広告       投稿                       │
│     Shorts                                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Step 2: 動画選択画面（既存UIに統合）

- 選択したアスペクト比の動画のみ表示
- 対応する動画がない場合は空状態を表示
- ヘッダーに選択中のアスペクト比を表示（変更可能）

```
┌──────────────────────────────────────────────────────────────────┐
│  アドクリエイター                                      [履歴]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📐 縦長 9:16  [変更]                                            │
│                                                                  │
│  ┌────────────────────────────────┐  ┌──────────────────┐       │
│  │        プレビュー              │  │ 結合順序         │       │
│  │        (9:16)                  │  │                  │       │
│  └────────────────────────────────┘  │                  │       │
│                                      │                  │       │
│  動画を選択（0/10）                  │                  │       │
│  [シーン動画] [ストーリー動画]        │                  │       │
│                                      │                  │       │
│  ┌───┐ ┌───┐ ┌───┐                  │                  │       │
│  │   │ │   │ │   │                  │                  │       │
│  └───┘ └───┘ └───┘                  │                  │       │
│                                      │                  │       │
└──────────────────────────────────────────────────────────────────┘
```

---

## データ構造

### アスペクト比の定義

```typescript
type AspectRatio = "9:16" | "16:9" | "1:1";

interface AspectRatioOption {
  value: AspectRatio;
  label: string;
  description: string;
  platforms: string[];
  icon: string; // アイコン名
}

const ASPECT_RATIOS: AspectRatioOption[] = [
  {
    value: "9:16",
    label: "縦長",
    description: "縦長動画（ショート動画向け）",
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts"],
    icon: "Smartphone",
  },
  {
    value: "16:9",
    label: "横長",
    description: "横長動画（通常動画向け）",
    platforms: ["YouTube", "Facebook広告", "TV CM"],
    icon: "Monitor",
  },
  {
    value: "1:1",
    label: "正方形",
    description: "正方形動画（SNS投稿向け）",
    platforms: ["Instagram投稿", "Facebook投稿"],
    icon: "Square",
  },
];
```

### VideoItem / Storyboard への追加

```typescript
interface VideoItem {
  // 既存フィールド
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
  // 追加フィールド
  aspect_ratio?: AspectRatio; // APIから取得
}

interface Storyboard {
  // 既存フィールド...
  // 追加フィールド
  aspect_ratio?: AspectRatio;
}
```

---

## 実装詳細

### フロントエンド変更

#### 1. 状態の追加

```typescript
// app/concat/page.tsx
const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio | null>(null);
```

#### 2. フィルタリングロジック

```typescript
// 選択したアスペクト比でフィルタリング
const filteredVideos = useMemo(() => {
  if (!selectedAspectRatio) return [];
  return availableVideos.filter(
    (v) => v.aspect_ratio === selectedAspectRatio || !v.aspect_ratio // 未設定は9:16とみなす
  );
}, [availableVideos, selectedAspectRatio]);

const filteredStoryboards = useMemo(() => {
  if (!selectedAspectRatio) return [];
  return availableStoryboards.filter(
    (s) => s.aspect_ratio === selectedAspectRatio || !s.aspect_ratio
  );
}, [availableStoryboards, selectedAspectRatio]);
```

#### 3. 条件付きレンダリング

```tsx
{!selectedAspectRatio ? (
  // アスペクト比選択画面
  <AspectRatioSelector onSelect={setSelectedAspectRatio} />
) : (
  // 既存の動画選択・結合UI
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    {/* プレビュー + 動画選択 */}
    {/* 設定パネル */}
  </div>
)}
```

#### 4. 新規コンポーネント

```tsx
// components/video/aspect-ratio-selector.tsx
interface AspectRatioSelectorProps {
  onSelect: (ratio: AspectRatio) => void;
}

export function AspectRatioSelector({ onSelect }: AspectRatioSelectorProps) {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <h2 className="text-2xl font-bold text-white text-center mb-8">
        広告のアスペクト比を選択
      </h2>
      <div className="grid grid-cols-3 gap-6">
        {ASPECT_RATIOS.map((ratio) => (
          <button
            key={ratio.value}
            onClick={() => onSelect(ratio.value)}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700
                       hover:border-blue-500 rounded-xl p-6 transition-all"
          >
            {/* アスペクト比のビジュアル */}
            <div className="aspect-square flex items-center justify-center mb-4">
              <div
                className="bg-blue-500/20 border-2 border-blue-500"
                style={{
                  aspectRatio: ratio.value.replace(":", "/"),
                  maxWidth: ratio.value === "16:9" ? "100%" : "60%",
                  maxHeight: ratio.value === "9:16" ? "100%" : "60%",
                }}
              />
            </div>
            <p className="text-white font-semibold text-lg">{ratio.label}</p>
            <p className="text-zinc-400 text-sm">{ratio.value}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {ratio.platforms.map((platform) => (
                <span
                  key={platform}
                  className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded"
                >
                  {platform}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### バックエンド変更（将来対応）

現時点では全動画が9:16のため、バックエンド変更は不要。
将来、横長・正方形動画に対応する際に以下を追加：

1. `videos`テーブルに`aspect_ratio`カラム追加
2. `storyboards`テーブルに`aspect_ratio`カラム追加
3. API レスポンスに`aspect_ratio`フィールド追加
4. 結合API で`aspect_ratio`パラメータを受け取り、出力サイズを調整

---

## 実装手順

### Phase 1: フロントエンド（今回実装）

| # | タスク | ファイル |
|---|--------|----------|
| 1 | AspectRatio型定義 | `lib/types/video.ts` |
| 2 | アスペクト比選択コンポーネント作成 | `components/video/aspect-ratio-selector.tsx` |
| 3 | concat/page.tsx に状態追加 | `app/concat/page.tsx` |
| 4 | 条件付きレンダリング実装 | `app/concat/page.tsx` |
| 5 | アスペクト比変更UI追加 | `app/concat/page.tsx` |
| 6 | AdPreviewPlayer のアスペクト比対応 | `components/video/ad-preview-player.tsx` |

### Phase 2: バックエンド対応（将来）

| # | タスク |
|---|--------|
| 1 | DBスキーマにaspect_ratioカラム追加（マイグレーション） |
| 2 | 動画生成時にアスペクト比を保存 |
| 3 | API レスポンスにaspect_ratio追加 |
| 4 | 結合APIでアスペクト比別処理 |

#### Supabaseマイグレーション

Phase 2ではデータベーススキーマの変更が発生するため、Supabase MCPを使用してマイグレーションを実行する。

**マイグレーション対象テーブル:**
- `videos` テーブル: `aspect_ratio` カラム追加
- `storyboards` テーブル: `aspect_ratio` カラム追加

**マイグレーション手順:**

1. Supabase MCP の `mcp__supabase__apply_migration` ツールを使用
2. マイグレーション名: `add_aspect_ratio_column`
3. SQLクエリ例:

```sql
-- videosテーブルにaspect_ratioカラムを追加
ALTER TABLE videos
ADD COLUMN aspect_ratio TEXT DEFAULT '9:16'
CHECK (aspect_ratio IN ('9:16', '16:9', '1:1'));

-- storyboardsテーブルにaspect_ratioカラムを追加
ALTER TABLE storyboards
ADD COLUMN aspect_ratio TEXT DEFAULT '9:16'
CHECK (aspect_ratio IN ('9:16', '16:9', '1:1'));

-- インデックス追加（フィルタリング高速化）
CREATE INDEX idx_videos_aspect_ratio ON videos(aspect_ratio);
CREATE INDEX idx_storyboards_aspect_ratio ON storyboards(aspect_ratio);
```

**注意:** マイグレーション実行前に必ず `mcp__supabase__list_tables` でテーブル構造を確認すること。

---

## テスト項目

| # | 項目 | 確認内容 |
|---|------|----------|
| 1 | 初期表示 | アスペクト比選択画面が表示される |
| 2 | 縦長選択 | 9:16の動画のみ表示される |
| 3 | 横長選択 | 16:9の動画のみ表示される（現在は空） |
| 4 | 正方形選択 | 1:1の動画のみ表示される（現在は空） |
| 5 | 変更ボタン | アスペクト比を再選択できる |
| 6 | プレビュー | 選択したアスペクト比でプレビュー表示 |
| 7 | 結合実行 | 正常に結合できる |
| 8 | 履歴 | 結合履歴に影響なし |

---

## 注意事項

1. **現時点での対応**
   - 全動画が9:16のため、横長・正方形を選択すると「動画がありません」と表示
   - 将来的に横長・正方形動画を生成可能になった際に自動対応

2. **プレビューの対応**
   - `AdPreviewPlayer`コンポーネントにアスペクト比を渡し、表示を切り替え

3. **URLパラメータ対応（オプション）**
   - `/concat?ratio=16:9` のようにURLでアスペクト比を指定可能にする

---

*作成日: 2025年1月3日*
*対象: アドクリエイターページ（`/concat`）*
