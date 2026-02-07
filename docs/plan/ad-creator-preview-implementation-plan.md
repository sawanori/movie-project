# アドクリエイター プレビュー機能 実装計画書

## 概要

アドクリエイター（旧：動画を統合）ページに、選択した動画をリアルタイムでプレビュー再生する機能を追加する。

---

## 現状分析

### 現在のレイアウト（2カラム）

```
┌─────────────────────────────────────────────────────┐
│  左カラム (lg:col-span-2)    │  右カラム           │
│                              │                     │
│  動画選択グリッド             │  結合順序           │
│  - シーン動画タブ            │  - ドラッグ並替     │
│  - ストーリー動画タブ         │  - 削除ボタン       │
│                              │                     │
│                              │  トリミング調整     │
│                              │  - 開始/終了時間    │
│                              │  - スライダー       │
│                              │                     │
│                              │  トランジション     │
│                              │  - 種類選択         │
│                              │  - 秒数設定         │
│                              │                     │
│                              │  [広告を作成]       │
└─────────────────────────────────────────────────────┘
```

### 対象ファイル

| ファイル | 役割 |
|----------|------|
| `app/concat/page.tsx` | メインページ |
| `components/video/video-trim-card.tsx` | トリミングカード（既存） |

---

## 変更後のレイアウト

```
┌──────────────────────────────────────────────────────────────────┐
│  アドクリエイター                                      [履歴]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────┐  ┌──────────────────┐   │
│  │                                    │  │ 📋 結合順序      │   │
│  │        🎬 プレビュー               │  │                  │   │
│  │        (9:16 縦長表示)             │  │  [1] 動画A  ✕   │   │
│  │                                    │  │  [2] 動画B  ✕   │   │
│  │        [▶ 1] [2] [3]               │  │  [3] 動画C  ✕   │   │
│  │                                    │  │                  │   │
│  └────────────────────────────────────┘  │  ↕ ドラッグで    │   │
│                                          │    順序変更      │   │
│  ┌────────────────────────────────────┐  ├──────────────────┤   │
│  │ 動画を選択                         │  │ ✂️ トリミング    │   │
│  │                                    │  │                  │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │  │  開始: 0.0s     │   │
│  │  │ ✓  │ │     │ │ ✓  │ │     │  │  │  終了: 5.0s     │   │
│  │  │ [1] │ │     │ │ [2] │ │     │  │  │  [=====----]    │   │
│  │  └─────┘ └─────┘ └─────┘ └─────┘  │  │                  │   │
│  │                                    │  ├──────────────────┤   │
│  │  シーン動画 | ストーリー動画        │  │ 🎞️ トランジション│   │
│  └────────────────────────────────────┘  │  フェード ▼      │   │
│                                          ├──────────────────┤   │
│                                          │ [広告を作成]     │   │
│                                          └──────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 新規コンポーネント

### `components/video/ad-preview-player.tsx`

シーケンシャル動画プレビューコンポーネント

#### Props

```typescript
interface AdPreviewPlayerProps {
  videos: {
    id: string;
    videoUrl: string;
    label: string;
    startTime: number;
    endTime: number;
  }[];
  onVideoChange?: (index: number) => void;
}
```

#### 機能

| 機能 | 説明 |
|------|------|
| 自動再生 | 選択順に動画を自動再生 |
| ループ再生 | 最後まで再生したら最初に戻る |
| ミュート | デフォルトでミュート（トグル可能） |
| 再生位置インジケーター | 現在どの動画を再生中か表示 |
| クリックで移動 | インジケーターをクリックで任意の動画へ |
| トリミング反映 | 設定したトリミング範囲で再生 |
| 再生/一時停止 | 手動で再生制御可能 |

#### 実装イメージ

```tsx
"use client";

import { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoItem {
  id: string;
  videoUrl: string;
  label: string;
  startTime: number;
  endTime: number;
}

interface AdPreviewPlayerProps {
  videos: VideoItem[];
  onVideoChange?: (index: number) => void;
}

export function AdPreviewPlayer({ videos, onVideoChange }: AdPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  const currentVideo = videos[currentIndex];

  // 動画が変わったら再生開始
  useEffect(() => {
    if (videoRef.current && currentVideo) {
      videoRef.current.currentTime = currentVideo.startTime;
      if (isPlaying) {
        videoRef.current.play();
      }
    }
    onVideoChange?.(currentIndex);
  }, [currentIndex, currentVideo?.videoUrl]);

  // トリミング終了時間で次の動画へ
  const handleTimeUpdate = () => {
    if (videoRef.current && currentVideo) {
      if (videoRef.current.currentTime >= currentVideo.endTime) {
        goToNext();
      }
    }
  };

  const goToNext = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0); // ループ
    }
  };

  const goToIndex = (index: number) => {
    setCurrentIndex(index);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  if (videos.length === 0) {
    return (
      <div className="aspect-[9/16] max-h-[400px] bg-zinc-900 rounded-xl flex items-center justify-center">
        <p className="text-zinc-500 text-sm">動画を選択してください</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 動画プレーヤー */}
      <div className="aspect-[9/16] max-h-[400px] bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          src={currentVideo?.videoUrl}
          className="w-full h-full object-contain"
          muted={isMuted}
          autoPlay
          onTimeUpdate={handleTimeUpdate}
          onEnded={goToNext}
        />
      </div>

      {/* コントロール */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center justify-between bg-black/60 rounded-lg px-3 py-2">
          {/* 再生/一時停止 */}
          <button onClick={togglePlay} className="text-white">
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          {/* 再生位置インジケーター */}
          <div className="flex gap-2">
            {videos.map((_, i) => (
              <button
                key={i}
                onClick={() => goToIndex(i)}
                className={cn(
                  "w-8 h-8 rounded-full text-xs font-medium transition-colors",
                  i === currentIndex
                    ? "bg-white text-black"
                    : "bg-white/30 text-white hover:bg-white/50"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* ミュート */}
          <button onClick={toggleMute} className="text-white">
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 現在の動画ラベル */}
      <div className="absolute top-4 left-4 bg-black/60 rounded-lg px-3 py-1">
        <p className="text-white text-sm">
          {currentIndex + 1}/{videos.length}: {currentVideo?.label}
        </p>
      </div>
    </div>
  );
}
```

---

## `app/concat/page.tsx` の変更

### 1. インポート追加

```typescript
import { AdPreviewPlayer } from "@/components/video/ad-preview-player";
```

### 2. レイアウト変更

**変更前（左カラム）:**
```tsx
<div className="lg:col-span-2">
  <h2>動画を選択（{selectedItems.length}/10）</h2>
  {/* タブ + 動画グリッド */}
</div>
```

**変更後（左カラム）:**
```tsx
<div className="lg:col-span-2 space-y-6">
  {/* プレビューエリア（新規追加） */}
  <div className="bg-zinc-900 rounded-xl p-4">
    <h2 className="text-lg font-semibold text-white mb-4">プレビュー</h2>
    <div className="flex justify-center">
      <AdPreviewPlayer
        videos={selectedItems.map(item => ({
          id: item.id,
          videoUrl: item.videoUrl,
          label: item.label,
          startTime: trimSettings[item.id]?.startTime || 0,
          endTime: trimSettings[item.id]?.endTime || trimSettings[item.id]?.duration || 5,
        }))}
      />
    </div>
  </div>

  {/* 動画選択（既存） */}
  <div>
    <h2>動画を選択（{selectedItems.length}/10）</h2>
    {/* タブ + 動画グリッド */}
  </div>
</div>
```

### 3. 右カラム

変更なし（現状維持）

---

## 実装手順

### Step 1: プレビューコンポーネント作成

1. `components/video/ad-preview-player.tsx` を作成
2. 基本的な動画再生機能を実装
3. シーケンシャル再生（次の動画へ自動切替）を実装
4. 再生位置インジケーターを実装

### Step 2: ページレイアウト変更

1. `app/concat/page.tsx` にプレビューコンポーネントを追加
2. 左カラムのレイアウトを調整（上：プレビュー、下：選択グリッド）
3. propsの連携（selectedItems, trimSettings）

### Step 3: トリミング連携

1. trimSettingsの変更をプレビューに反映
2. startTime/endTimeでの再生範囲制限
3. 右カラムでトリミング調整時にプレビュー更新

### Step 4: UX改善

1. 空状態のUI
2. ローディング状態
3. エラーハンドリング
4. レスポンシブ対応

---

## テスト項目

| # | 項目 | 確認内容 |
|---|------|----------|
| 1 | 初期表示 | 動画未選択時に「動画を選択してください」表示 |
| 2 | 動画選択 | 動画選択時にプレビュー開始 |
| 3 | 順序再生 | 選択順に動画が再生される |
| 4 | ループ再生 | 最後まで再生後、最初に戻る |
| 5 | インジケーター | 現在再生中の動画番号がハイライト |
| 6 | クリック移動 | インジケータークリックで任意の動画へ |
| 7 | 再生/一時停止 | ボタンで制御可能 |
| 8 | ミュート | ボタンで音声ON/OFF |
| 9 | トリミング反映 | 設定範囲のみ再生 |
| 10 | 順序変更反映 | ドラッグで順序変更後、プレビュー更新 |
| 11 | レスポンシブ | モバイルでも適切に表示 |

---

## 将来の拡張（対象外）

- トランジション効果のプレビュー
- BGMプレビュー
- 複数プラットフォーム向けプレビュー切替（9:16, 16:9, 1:1）

---

*作成日: 2026年1月3日*
*対象: アドクリエイターページ（`/concat`）*
