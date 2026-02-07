# 絵コンテPDF出力 実装計画書

## 概要

### 目的
アドクリエイターで生成されたCM構成（絵コンテ）をPDFとしてエクスポートし、クライアントへの共有や制作チームへの指示書として使用可能にする。

### 技術選定
**推奨: オプションA（フロントエンド生成）**
- ライブラリ: `@react-pdf/renderer`
- 理由:
  - バックエンドへのAPI追加不要
  - クライアント側で完結（サーバーコスト0）
  - 日本語フォント対応（Noto Sans JP）
  - Reactコンポーネントで直感的にレイアウト定義可能

---

## ⚠️ レビュー結果：発見した問題点

### 🔴 Critical（必須修正）

#### 1. SSR/Dynamic Import問題
**問題**: @react-pdf/rendererはSSRに対応していない。通常のimportを使用するとNext.jsビルドエラーが発生する。

**対策**: `next/dynamic`を使用してSSRを無効化
```typescript
import dynamic from 'next/dynamic';

const StoryboardPDFExport = dynamic(
  () => import('./storyboard-pdf-export').then(mod => mod.StoryboardPDFExport),
  { ssr: false, loading: () => <span>読込中...</span> }
);
```

**参考**: [NextJS 14 and react-pdf integration](https://benhur-martins.medium.com/nextjs-14-and-react-pdf-integration-ccd38b1fd515)

#### 2. パッケージバージョン問題
**問題**:
- v4.3.1にはNoto Sans fontWeight 700でのリグレッションがある
- React 19対応はv4.1.0以降

**対策**: バージョンを4.3.0に固定
```bash
npm install @react-pdf/renderer@4.3.0
```

**参考**: [Regression in v4.3.1](https://github.com/diegomura/react-pdf/issues/3247)

#### 3. フォント読み込み問題
**問題**:
- Variable fontsはPDF 2.0仕様で非対応
- CDNフォントが失敗した場合のフォールバックがない
- 一部のNoto Sans CJKフォントは動作しない

**対策**:
- 静的ウェイトのフォントファイルを使用
- ローカルフォントをpublic/fontsに配置（推奨）
- フォールバックフォント設定を追加

### 🟡 Medium（推奨修正）

#### 4. データ構造の不整合
**問題**: AdStoryboardは`EditableCut`を使用しているが、計画書では`AdCut`を使用。

**対策**: 両方の型を受け入れるよう修正（EditableCutはAdCutを拡張）
```typescript
type CutData = AdCut | EditableCut;
```

#### 5. エラーハンドリング不足
**問題**: PDF生成失敗時の処理が`console.error`のみ。

**対策**: 既存パターンに合わせて`alert()`を使用
```typescript
catch (error) {
  console.error("PDF generation failed:", error);
  alert("PDF生成に失敗しました。もう一度お試しください。");
}
```

#### 6. カット数0のエッジケース
**問題**: cutsが空配列の場合の処理がない。

**対策**: 空配列チェックを追加
```typescript
if (script.cuts.length === 0) {
  alert("カットがありません");
  return;
}
```

### 🟢 Low（任意修正）

#### 7. フォント読み込み完了待機
**問題**: フォント読み込み中にPDF生成するとフォールバックフォントになる可能性。

**対策**: Font.load()で事前読み込みを確認

---

## データ構造（既存）

### AdCut インターフェース
```typescript
// movie-maker/lib/api/client.ts:86-96
export interface AdCut {
  id: string;
  cut_number: number;
  scene_type: string;
  scene_type_label: string;
  description_ja: string;
  description_en: string;
  duration: number;
  dialogue?: string;      // セリフ
  sound_effect?: string;  // 効果音/SE
}
```

### EditableCut インターフェース（実際に使用される型）
```typescript
// movie-maker/components/video/ad-cut-card.tsx:34-42
export interface EditableCut extends AdCut {
  video: SelectedVideo | null;
  generatedImageUrl?: string;
  generatedPromptJa?: string;
  generatedPromptEn?: string;
}
```

### AdScriptResponse インターフェース
```typescript
// movie-maker/lib/api/client.ts:98-104
export interface AdScriptResponse {
  id: string;
  theory: AdTheory;
  theory_label: string;
  total_duration: number;
  cuts: AdCut[];
}
```

---

## 依存パッケージ（修正版）

| パッケージ | バージョン | 用途 | 注意 |
|-----------|-----------|------|------|
| `@react-pdf/renderer` | **4.3.0** | PDF生成エンジン | ⚠️ 4.3.1はフォント問題あり |
| `file-saver` | ^2.x | ブラウザでのファイルダウンロード | |
| `@types/file-saver` | ^2.x | TypeScript型定義 | |

### インストールコマンド
```bash
cd movie-maker
npm install @react-pdf/renderer@4.3.0 file-saver
npm install -D @types/file-saver
```

---

## PDF レイアウト設計

### ページ構成
```
┌──────────────────────────────────────────────────────────┐
│  【ヘッダー】                                              │
│  ────────────────────────────────────────────────────────  │
│  CM絵コンテ                    2026年1月22日               │
│  構成理論: AIDA法              合計尺: 30秒                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  【カットテーブル】                                        │
│  ┌────┬─────────┬────────────────────┬────┬──────┬──────┐ │
│  │ # │シーン種別│ 内容説明          │秒数│セリフ│SE    │ │
│  ├────┼─────────┼────────────────────┼────┼──────┼──────┤ │
│  │ 1 │ 導入    │ 商品ロゴ表示...   │ 5  │ ...  │ ...  │ │
│  ├────┼─────────┼────────────────────┼────┼──────┼──────┤ │
│  │ 2 │ 訴求    │ 使用シーン...     │ 8  │ ...  │ ...  │ │
│  └────┴─────────┴────────────────────┴────┴──────┴──────┘ │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  【フッター】                                              │
│  ────────────────────────────────────────────────────────  │
│  Generated by Movie Maker                   Page 1 of 1   │
└──────────────────────────────────────────────────────────┘
```

### テーブルカラム定義

| カラム | 幅比率 | 内容 |
|--------|--------|------|
| カット番号 | 5% | `cut_number` |
| シーン種別 | 12% | `scene_type_label` |
| 内容説明 | 38% | `description_ja` |
| 秒数 | 8% | `duration` |
| セリフ | 18% | `dialogue` |
| 効果音/SE | 19% | `sound_effect` |

---

## ファイル構成（修正版）

```
movie-maker/
├── public/
│   └── fonts/
│       ├── NotoSansJP-Regular.ttf       # 静的フォントファイル（ローカル）
│       └── NotoSansJP-Bold.ttf
├── components/
│   └── pdf/
│       ├── storyboard-pdf-document.tsx   # PDFドキュメント定義
│       ├── storyboard-pdf-export.tsx     # エクスポートボタン+ロジック（内部）
│       └── index.tsx                     # Dynamic import wrapper（公開用）
├── lib/
│   └── pdf/
│       └── fonts.ts                      # フォント登録
```

### 0. フォントファイル準備

**推奨**: ローカルフォントファイルを使用（CDN障害回避）

```bash
# Google Fontsからダウンロード
mkdir -p movie-maker/public/fonts
# https://fonts.google.com/noto/specimen/Noto+Sans+JP からダウンロード
# Regular (400) と Bold (700) の.ttfファイルを配置
```

### 1. フォント登録 (`lib/pdf/fonts.ts`)

```typescript
import { Font } from "@react-pdf/renderer";

let fontsRegistered = false;

// Noto Sans JP（ローカルファイル優先、CDNフォールバック）
export async function registerFonts(): Promise<void> {
  if (fontsRegistered) return;

  try {
    Font.register({
      family: "NotoSansJP",
      fonts: [
        {
          // ローカルファイル優先（public/fonts/）
          src: "/fonts/NotoSansJP-Regular.ttf",
          fontWeight: 400,
        },
        {
          src: "/fonts/NotoSansJP-Bold.ttf",
          fontWeight: 700,
        },
      ],
    });
    fontsRegistered = true;
  } catch (error) {
    console.warn("Local font loading failed, trying CDN fallback:", error);

    // CDNフォールバック
    Font.register({
      family: "NotoSansJP",
      fonts: [
        {
          src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.0/files/noto-sans-jp-japanese-400-normal.woff2",
          fontWeight: 400,
        },
        {
          // Note: weight 700 has issues in v4.3.1, using 600 as fallback
          src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.0/files/noto-sans-jp-japanese-600-normal.woff2",
          fontWeight: 700,
        },
      ],
    });
    fontsRegistered = true;
  }
}

// フォント読み込み完了を待機
export async function ensureFontsLoaded(): Promise<void> {
  await registerFonts();
  // Font.load()でフォントがロード済みか確認
  try {
    await Font.load({ fontFamily: "NotoSansJP" });
  } catch {
    // ロード失敗してもデフォルトフォントで続行
    console.warn("Font preload failed, using fallback");
  }
}
```

### 2. PDFドキュメント (`components/pdf/storyboard-pdf-document.tsx`)

```typescript
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { AdCut } from "@/lib/api/client";

// EditableCutも受け入れ可能（AdCutを拡張しているため）
type CutData = AdCut;

interface StoryboardPDFDocumentProps {
  /** CM構成理論ラベル（例: "AIDA法"） */
  theoryLabel: string;
  /** 合計秒数 */
  totalDuration: number;
  /** カット一覧 */
  cuts: CutData[];
  /** プロジェクト名（オプション） */
  projectTitle?: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 10,
    padding: 40,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaItem: {
    fontSize: 10,
  },
  table: {
    display: "flex",
    flexDirection: "column",
    border: "1pt solid #333",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderBottom: "1pt solid #333",
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #ccc",
    minHeight: 30,
  },
  // 最後の行はボーダーなし
  tableRowLast: {
    flexDirection: "row",
    minHeight: 30,
  },
  cell: {
    padding: 6,
    borderRight: "0.5pt solid #ccc",
    justifyContent: "center",
  },
  cellNumber: { width: "5%" },
  cellType: { width: "12%" },
  cellDescription: { width: "38%" },
  cellDuration: { width: "8%", textAlign: "center" },
  cellDialogue: { width: "18%" },
  cellSE: { width: "19%", borderRight: "none" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#666",
  },
  // 空データ用メッセージ
  emptyMessage: {
    padding: 20,
    textAlign: "center",
    color: "#666",
  },
});

export function StoryboardPDFDocument({
  theoryLabel,
  totalDuration,
  cuts,
  projectTitle,
}: StoryboardPDFDocumentProps) {
  const today = new Date().toLocaleDateString("ja-JP");

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {projectTitle || "CM絵コンテ"}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaItem}>構成理論: {theoryLabel}</Text>
            <Text style={styles.metaItem}>合計尺: {totalDuration}秒</Text>
            <Text style={styles.metaItem}>{today}</Text>
          </View>
        </View>

        {/* テーブル */}
        <View style={styles.table}>
          {/* ヘッダー行 */}
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.cellNumber]}>#</Text>
            <Text style={[styles.cell, styles.cellType]}>シーン種別</Text>
            <Text style={[styles.cell, styles.cellDescription]}>内容説明</Text>
            <Text style={[styles.cell, styles.cellDuration]}>秒数</Text>
            <Text style={[styles.cell, styles.cellDialogue]}>セリフ</Text>
            <Text style={[styles.cell, styles.cellSE]}>効果音/SE</Text>
          </View>

          {/* データ行 */}
          {cuts.length === 0 ? (
            <View style={styles.emptyMessage}>
              <Text>カットがありません</Text>
            </View>
          ) : (
            cuts.map((cut, index) => (
              <View
                key={cut.id}
                style={index === cuts.length - 1 ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.cell, styles.cellNumber]}>
                  {cut.cut_number}
                </Text>
                <Text style={[styles.cell, styles.cellType]}>
                  {cut.scene_type_label}
                </Text>
                <Text style={[styles.cell, styles.cellDescription]}>
                  {cut.description_ja || "-"}
                </Text>
                <Text style={[styles.cell, styles.cellDuration]}>
                  {cut.duration}s
                </Text>
                <Text style={[styles.cell, styles.cellDialogue]}>
                  {cut.dialogue || "-"}
                </Text>
                <Text style={[styles.cell, styles.cellSE]}>
                  {cut.sound_effect || "-"}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* フッター */}
        <View style={styles.footer} fixed>
          <Text>Generated by Movie Maker</Text>
          <Text render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
}
```

### 3. エクスポートボタン（内部） (`components/pdf/storyboard-pdf-export.tsx`)

⚠️ **このファイルは直接importしない**。必ず`index.tsx`経由でdynamic importする。

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdCut } from "@/lib/api/client";
import { StoryboardPDFDocument } from "./storyboard-pdf-document";
import { ensureFontsLoaded } from "@/lib/pdf/fonts";

export interface StoryboardPDFExportProps {
  /** CM構成理論ラベル */
  theoryLabel: string;
  /** 合計秒数 */
  totalDuration: number;
  /** カット一覧（AdCutまたはEditableCut） */
  cuts: AdCut[];
  /** スクリプトID（ファイル名に使用） */
  scriptId: string;
  /** プロジェクト名（オプション） */
  projectTitle?: string;
  /** ボタン無効化 */
  disabled?: boolean;
}

export function StoryboardPDFExportInternal({
  theoryLabel,
  totalDuration,
  cuts,
  scriptId,
  projectTitle,
  disabled,
}: StoryboardPDFExportProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  // フォント事前読み込み
  useEffect(() => {
    ensureFontsLoaded()
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true)); // 失敗してもデフォルトフォントで続行
  }, []);

  const handleExport = useCallback(async () => {
    // カット数チェック
    if (cuts.length === 0) {
      alert("カットがありません。PDF出力できません。");
      return;
    }

    setIsGenerating(true);
    try {
      // フォント読み込み確認
      await ensureFontsLoaded();

      const doc = (
        <StoryboardPDFDocument
          theoryLabel={theoryLabel}
          totalDuration={totalDuration}
          cuts={cuts}
          projectTitle={projectTitle}
        />
      );
      const blob = await pdf(doc).toBlob();

      const filename = `storyboard_${scriptId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      saveAs(blob, filename);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("PDF生成に失敗しました。もう一度お試しください。");
    } finally {
      setIsGenerating(false);
    }
  }, [theoryLabel, totalDuration, cuts, scriptId, projectTitle]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || isGenerating || !fontsReady}
      className="gap-1"
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      {fontsReady ? "PDF出力" : "準備中..."}
    </Button>
  );
}
```

### 4. Dynamic Import Wrapper (`components/pdf/index.tsx`)

⚠️ **必須**: SSRを無効化するラッパー

```typescript
"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// SSRを無効化してPDFコンポーネントを読み込み
const StoryboardPDFExportInternal = dynamic(
  () => import("./storyboard-pdf-export").then((mod) => mod.StoryboardPDFExportInternal),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" disabled className="gap-1">
        <Loader2 className="w-4 h-4 animate-spin" />
        読込中...
      </Button>
    ),
  }
);

// 公開用コンポーネント（型を再エクスポート）
export type { StoryboardPDFExportProps } from "./storyboard-pdf-export";
export { StoryboardPDFExportInternal as StoryboardPDFExport };
```

---

## 統合: AdStoryboard への組み込み

### 変更箇所: `components/video/ad-storyboard.tsx`

```diff
+ import { StoryboardPDFExport } from "@/components/pdf";

  // ヘッダー部分（line 243-259付近）
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-3">
      <h2 className="text-lg font-semibold">
        CM構成（全{cuts.length}カット / 合計{totalDuration}秒）
      </h2>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRegenerate}
        className="gap-1 text-muted-foreground"
      >
        <RefreshCw className="w-4 h-4" />
        再生成
      </Button>
+     <StoryboardPDFExport
+       theoryLabel={script.theory_label}
+       totalDuration={totalDuration}
+       cuts={cuts}
+       scriptId={script.id}
+     />
    </div>
  </div>
```

**注意**: `import` は `@/components/pdf` からの公開APIを使用。直接 `storyboard-pdf-export.tsx` をimportしないこと。

---

## 実装手順（修正版）

### Phase 1: セットアップ
1. [ ] パッケージインストール (`@react-pdf/renderer@4.3.0`, `file-saver`, `@types/file-saver`)
2. [ ] フォントファイル配置 (`public/fonts/NotoSansJP-*.ttf`)
3. [ ] フォント登録ファイル作成 (`lib/pdf/fonts.ts`)

### Phase 2: PDFコンポーネント作成
4. [ ] PDFドキュメントコンポーネント作成 (`components/pdf/storyboard-pdf-document.tsx`)
5. [ ] エクスポートボタンコンポーネント作成 (`components/pdf/storyboard-pdf-export.tsx`)
6. [ ] Dynamic import wrapper作成 (`components/pdf/index.tsx`) ⚠️ 必須

### Phase 3: 統合
7. [ ] AdStoryboard にエクスポートボタンを追加
8. [ ] 動作確認: PDF生成・ダウンロード
9. [ ] エラーケース確認: カット0件、フォント読み込み失敗

### Phase 4: 品質改善（オプション）
10. [ ] 複数ページ対応（カット数が多い場合）
11. [ ] プロジェクト名の入力UI追加
12. [ ] PDF内にサムネイル画像を含める（生成済み画像がある場合）

---

## テスト計画（修正版）

### 1. 単体テスト
- [ ] PDFドキュメントがエラーなくレンダリングされること
- [ ] 全AdCutフィールドが正しく表示されること
- [ ] 空のdialogue/sound_effectで "-" が表示されること
- [ ] **空のcutsでエラーにならず適切なメッセージが表示されること**
- [ ] **EditableCut型でも正しく動作すること**

### 2. E2Eテスト
- [ ] エクスポートボタンクリックでPDFがダウンロードされること
- [ ] 日本語文字が正しく表示されること（文字化けなし）
- [ ] ファイル名に日付とscript.idが含まれること
- [ ] **SSRエラーが発生しないこと（ビルド確認）**
- [ ] **フォント読み込み失敗時もPDF生成できること（デフォルトフォント）**

### 3. ビルドテスト
```bash
cd movie-maker
npm run build  # SSRエラーがないこと
```

---

## リスク・考慮事項（修正版）

| リスク | 影響度 | 対策 | ステータス |
|--------|--------|------|-----------|
| SSR非対応 | **高** | Dynamic import + ssr: false | ✅ 計画に反映 |
| パッケージリグレッション | **高** | v4.3.0に固定 | ✅ 計画に反映 |
| フォント読み込み失敗 | 中 | ローカル優先 + CDNフォールバック | ✅ 計画に反映 |
| 空カット配列 | 中 | 事前チェック + 空表示 | ✅ 計画に反映 |
| 大量カット時のメモリ | 低 | ページネーション（Phase 4） | 📝 オプション |
| ブラウザ互換性 | 低 | 主要ブラウザ対応済み | - |

---

## 完了条件（修正版）

### 必須
- [ ] `npm run build` がエラーなく完了する（SSRエラーなし）
- [ ] PDF出力ボタンがAdStoryboardヘッダーに表示される
- [ ] ボタンクリックでPDFが生成・ダウンロードされる
- [ ] PDFに全カット情報が表形式で含まれる
- [ ] 日本語が文字化けせずに表示される
- [ ] ファイル名が `storyboard_{id}_{日付}.pdf` 形式
- [ ] カット0件の場合エラーではなくalertが表示される

### 推奨
- [ ] フォント読み込み失敗時もデフォルトフォントでPDF生成できる
- [ ] ローカルフォントファイルが配置されている

---

## 参考

- [@react-pdf/renderer 公式ドキュメント](https://react-pdf.org/)
- [@react-pdf/renderer 互換性情報](https://react-pdf.org/compatibility)
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)
- [NextJS 14 and react-pdf integration](https://benhur-martins.medium.com/nextjs-14-and-react-pdf-integration-ccd38b1fd515)
- [Regression in v4.3.1: Noto Sans fontWeight 700](https://github.com/diegomura/react-pdf/issues/3247)
- [ESM packages need to be imported](https://github.com/diegomura/react-pdf/issues/2992)
