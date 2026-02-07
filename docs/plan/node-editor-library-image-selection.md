# ノードエディタ：画像保管庫選択機能 実装計画書

## 概要

ノードエディタの `ImageInputNode` に画像保管庫（ライブラリ）からの画像選択機能を追加する。

### 現状

| 機能 | ガイドモード | ノードモード |
|------|-------------|-------------|
| アップロード | ✅ | ✅ |
| URL入力 | ✅ | ✅ |
| 画像保管庫 | ✅ | ❌ |
| スクリーンショット | ✅ | ❌ |

### 目標

ノードモードの `ImageInputNode` に以下を追加：
- 画像保管庫タブ（ライブラリ画像 + スクリーンショットを統合表示）

---

## 技術設計

### 1. 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `components/node-editor/nodes/ImageInputNode.tsx` | ライブラリ選択UI追加 |

### 2. 参考実装

既存の `ReferenceImageSelector` (`components/ui/reference-image-selector.tsx`) のライブラリ選択ロジックを参考にする。

### 3. UI設計

#### 3.1 タブ構成

現在の2タブから3タブに拡張：

```
┌────────────┬────────────┬────────────┐
│ アップロード │   URL     │  保管庫    │
└────────────┴────────────┴────────────┘
```

**保管庫タブの内容**:
- ライブラリ画像とスクリーンショットを統合表示
- セクション分け: 「ライブラリ」「スクリーンショット」

#### 3.2 保管庫タブのレイアウト

```
┌─────────────────────────────────────┐
│ ライブラリ                           │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────────────┤
│ スクリーンショット                    │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────────────┤
│         [もっと読み込む]             │
└─────────────────────────────────────┘

エラー時:
┌─────────────────────────────────────┐
│ ⚠️ 読み込みに失敗しました            │
│         [再試行]                     │
└─────────────────────────────────────┘
```

### 4. 実装詳細

#### 4.1 型定義の追加

```typescript
type ImageInputMode = 'upload' | 'url' | 'library';
```

#### 4.2 State追加

```typescript
import { libraryApi, type LibraryImage, type Screenshot } from '@/lib/api/client';

// Library tab state
const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
const [libraryLoading, setLibraryLoading] = useState(false);
const [libraryError, setLibraryError] = useState<string | null>(null);
const [libraryPage, setLibraryPage] = useState(1);
const [totalLibrary, setTotalLibrary] = useState(0);
const [totalScreenshots, setTotalScreenshots] = useState(0);
```

#### 4.3 API呼び出し（ページネーション修正版）

```typescript
const PER_PAGE = 20;

const loadLibraryImages = useCallback(async (page = 1) => {
  setLibraryLoading(true);
  setLibraryError(null);

  try {
    const response = await libraryApi.listAll({
      page,
      per_page: PER_PAGE,
      source_filter: 'all',
    });

    if (page === 1) {
      setLibraryImages(response.library_images || []);
      setScreenshots(response.screenshots || []);
    } else {
      setLibraryImages(prev => [...prev, ...(response.library_images || [])]);
      setScreenshots(prev => [...prev, ...(response.screenshots || [])]);
    }

    setLibraryPage(page);
    setTotalLibrary(response.total_library);
    setTotalScreenshots(response.total_screenshots);
  } catch (error) {
    console.error('Failed to load library images:', error);

    // 認証エラーの判定
    if (error instanceof Error && error.message.includes('401')) {
      setLibraryError('ログインが必要です');
    } else {
      setLibraryError('画像の読み込みに失敗しました');
    }
  } finally {
    setLibraryLoading(false);
  }
}, []);

// ページネーション判定（totalsから計算）
const hasMoreLibrary = useMemo(() => {
  const currentCount = libraryImages.length + screenshots.length;
  const totalCount = totalLibrary + totalScreenshots;
  return currentCount < totalCount;
}, [libraryImages.length, screenshots.length, totalLibrary, totalScreenshots]);
```

#### 4.4 画像選択ハンドラ（型別に分離）

```typescript
// ライブラリ画像選択
const handleSelectLibraryImage = useCallback((image: LibraryImage) => {
  updateNodeData({
    imageUrl: image.image_url,
    imagePreview: image.thumbnail_url || image.image_url,
    isValid: true,
    errorMessage: undefined,
  });
}, [updateNodeData]);

// スクリーンショット選択
const handleSelectScreenshot = useCallback((screenshot: Screenshot) => {
  updateNodeData({
    imageUrl: screenshot.image_url,
    imagePreview: screenshot.image_url,
    isValid: true,
    errorMessage: undefined,
  });
}, [updateNodeData]);
```

#### 4.5 タブ切り替え時の読み込み

```typescript
useEffect(() => {
  if (mode === 'library' && libraryImages.length === 0 && !libraryError) {
    loadLibraryImages(1);
  }
}, [mode, libraryImages.length, libraryError, loadLibraryImages]);
```

#### 4.6 UI コンポーネント

```tsx
{mode === 'library' && (
  <div className="space-y-2 mb-3">
    {/* エラー表示 */}
    {libraryError && (
      <div className="text-center py-3">
        <p className="text-xs text-red-400 mb-2">{libraryError}</p>
        <button
          onClick={() => loadLibraryImages(1)}
          className="text-xs text-[#fce300] hover:underline"
        >
          再試行
        </button>
      </div>
    )}

    {/* ローディング（初回） */}
    {libraryLoading && libraryImages.length === 0 && !libraryError && (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-[#fce300]" />
      </div>
    )}

    {/* コンテンツ */}
    {!libraryError && (libraryImages.length > 0 || screenshots.length > 0) && (
      <div className="max-h-48 overflow-y-auto space-y-3">
        {/* ライブラリ画像セクション */}
        {libraryImages.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-500 mb-1">ライブラリ</p>
            <div className="grid grid-cols-3 gap-1">
              {libraryImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleSelectLibraryImage(img)}
                  className="relative aspect-square rounded overflow-hidden hover:ring-2 hover:ring-[#fce300] transition-all"
                >
                  <img
                    src={img.thumbnail_url || img.image_url}
                    alt={img.name || 'ライブラリ画像'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* スクリーンショットセクション */}
        {screenshots.length > 0 && (
          <div>
            <p className="text-[10px] text-zinc-500 mb-1">スクリーンショット</p>
            <div className="grid grid-cols-3 gap-1">
              {screenshots.map((ss) => (
                <button
                  key={ss.id}
                  onClick={() => handleSelectScreenshot(ss)}
                  className="relative aspect-square rounded overflow-hidden hover:ring-2 hover:ring-[#fce300] transition-all"
                >
                  <img
                    src={ss.image_url}
                    alt="スクリーンショット"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* もっと読み込む */}
        {hasMoreLibrary && (
          <button
            onClick={() => loadLibraryImages(libraryPage + 1)}
            disabled={libraryLoading}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-50"
          >
            {libraryLoading ? (
              <Loader2 className="w-3 h-3 animate-spin mx-auto" />
            ) : (
              'もっと読み込む'
            )}
          </button>
        )}
      </div>
    )}

    {/* 空状態 */}
    {!libraryLoading && !libraryError &&
     libraryImages.length === 0 && screenshots.length === 0 && (
      <p className="text-xs text-zinc-500 text-center py-4">
        保管庫に画像がありません
      </p>
    )}
  </div>
)}
```

---

## 実装タスク

### Phase 1: 基本実装

| # | タスク | 工数 | 担当 |
|---|--------|------|------|
| 1-1 | ImageInputNode に型・state追加 | S | - |
| 1-2 | libraryApi インポート追加 | XS | - |
| 1-3 | ライブラリ読み込み関数実装（ページネーション対応） | S | - |
| 1-4 | エラーハンドリング・リトライUI実装 | S | - |
| 1-5 | 保管庫タブUI実装（セクション分け） | M | - |
| 1-6 | 画像選択ハンドラ実装（型別分離） | S | - |
| 1-7 | タブ切り替え時の遅延読み込み | S | - |

### Phase 2: UX改善（オプション）

| # | タスク | 工数 | 担当 |
|---|--------|------|------|
| 2-1 | カテゴリフィルター追加 | M | - |
| 2-2 | 検索機能追加 | M | - |

### Phase 3: 品質保証（必須）

| # | タスク | 工数 | 担当 |
|---|--------|------|------|
| 3-1 | ユニットテスト作成 | M | - |
| 3-2 | TypeScript型チェック通過確認 | XS | - |
| 3-3 | ESLint通過確認 | XS | - |
| 3-4 | 手動テスト実施 | S | - |

---

## テスト計画

### ユニットテスト

**ファイル**: `components/node-editor/nodes/ImageInputNode.test.tsx`

```typescript
describe('ImageInputNode - Library Tab', () => {
  describe('loadLibraryImages', () => {
    it('should load library images on first page', async () => {
      // API mock, state verification
    });

    it('should append images on subsequent pages', async () => {
      // Pagination verification
    });

    it('should handle API errors gracefully', async () => {
      // Error state verification
    });

    it('should handle 401 authentication errors', async () => {
      // Auth error message verification
    });
  });

  describe('handleSelectLibraryImage', () => {
    it('should update node data with selected library image', () => {
      // Node data update verification
    });
  });

  describe('handleSelectScreenshot', () => {
    it('should update node data with selected screenshot', () => {
      // Node data update verification
    });
  });

  describe('hasMoreLibrary', () => {
    it('should return true when more items available', () => {
      // Pagination calculation verification
    });

    it('should return false when all items loaded', () => {
      // End of list verification
    });
  });
});
```

### 手動テスト項目

| # | テスト項目 | 期待結果 | 確認 |
|---|-----------|---------|------|
| M1 | 保管庫タブ切り替え | タブ切り替えで保管庫が表示される | [ ] |
| M2 | 初回読み込み | 2秒以内に画像が表示される | [ ] |
| M3 | ライブラリ画像選択 | クリックでプレビューが更新される | [ ] |
| M4 | スクリーンショット選択 | クリックでプレビューが更新される | [ ] |
| M5 | ページネーション | 「もっと読み込む」で追加画像表示 | [ ] |
| M6 | 全件読み込み後 | ボタンが非表示になる | [ ] |
| M7 | 空状態 | 適切なメッセージが表示される | [ ] |
| M8 | APIエラー | エラーメッセージと再試行ボタン表示 | [ ] |
| M9 | 再試行 | 再試行ボタンで再読み込みされる | [ ] |
| M10 | ノードデータ連携 | 選択画像が動画生成に使用される | [ ] |

---

## 依存関係

```
libraryApi (lib/api/client.ts)
  ├── LibraryImage 型 (line 1282-1302)
  ├── Screenshot 型 (line 1252-1261)
  ├── UnifiedImageListResponse 型 (line 1305-1312)
  │     ├── library_images: LibraryImage[]
  │     ├── screenshots: Screenshot[]
  │     ├── total_library: number
  │     ├── total_screenshots: number
  │     ├── page: number
  │     └── per_page: number
  └── listAll() メソッド (line 1372-1386)
```

すべて既存実装を再利用可能。新規API開発は不要。

---

## リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|-------|---------|------|
| ノードサイズ増大 | 低 | 中 | max-height + overflow-y-auto で対応 |
| 画像読み込み遅延 | 中 | 中 | サムネイル使用、`loading="lazy"` 属性 |
| API呼び出し頻度 | 低 | 低 | タブ切り替え時のみ初回読み込み |
| **認証トークン期限切れ** | 中 | 低 | 401エラー検知、適切なエラーメッセージ表示 |
| **ネットワークエラー** | 中 | 低 | エラー状態管理、再試行ボタン提供 |

---

## 完了条件（Acceptance Criteria）

### 機能要件

- [ ] ImageInputNode に「保管庫」タブが追加されている
- [ ] 保管庫タブでライブラリ画像が表示される
- [ ] 保管庫タブでスクリーンショットが表示される
- [ ] 画像をクリックして選択できる
- [ ] 選択した画像がノードのプレビューに表示される
- [ ] 選択した画像が動画生成に正しく使用される

### 非機能要件

- [ ] 初回読み込みが2秒以内に完了する
- [ ] エラー時に100ms以内にエラーメッセージが表示される
- [ ] 既存のアップロード・URL機能に影響がない

### 品質要件

- [ ] TypeScript型チェックがエラーなく通過する
- [ ] ESLintがエラーなく通過する
- [ ] ユニットテストが全て通過する
- [ ] 手動テスト項目が全て合格する

---

## レビュー履歴

| 日付 | バージョン | レビュー結果 | 主な修正内容 |
|------|-----------|-------------|-------------|
| 2026-02-06 | v1.0 | 要修正 | 初版作成 |
| 2026-02-06 | v1.1 | - | I001-I008対応: ページネーション修正、エラーハンドリング追加、型別ハンドラ分離、テスト計画追加、QAフェーズ追加 |
