# 完成動画の編集機能 実装計画書

## 概要

完成した動画（status === "completed"）から編集モードに戻り、シーンの再生成・再結合ができるようにする。

## 現状

```
完成画面（step === "completed"）
├── 動画プレーヤー
├── ダウンロードボタン
└── 新しく作成ボタン（stateをリセットして最初から）
```

完成後は編集画面に戻る手段がない。

## 実装後

```
完成画面（step === "completed"）
├── 動画プレーヤー
├── ダウンロードボタン
├── 編集に戻るボタン ← 新規追加
└── 新しく作成ボタン
```

「編集に戻る」→ `review` step に遷移 → シーン再生成可能 → 再結合で完成動画を上書き

---

## 実装内容

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `movie-maker/app/generate/storyboard/page.tsx` | 完成画面に「編集に戻る」ボタン追加 |

### 詳細

**ファイル**: `movie-maker/app/generate/storyboard/page.tsx`

**変更箇所**: L1683-1706（完成画面のボタン部分）

#### Before

```tsx
<div className="mt-6 flex gap-4">
  <a
    href={storyboard.final_video_url}
    download
    className="flex-1"
  >
    <Button className="w-full" variant="outline">
      <Download className="mr-2 h-4 w-4" />
      ダウンロード
    </Button>
  </a>
  <Button
    className="flex-1"
    onClick={() => {
      setStep("upload");
      setStoryboard(null);
      setImageFile(null);
      setImagePreview(null);
    }}
  >
    <Clapperboard className="mr-2 h-4 w-4" />
    新しく作成
  </Button>
</div>
```

#### After

```tsx
<div className="mt-6 flex flex-col gap-3">
  {/* ダウンロードボタン */}
  <a
    href={storyboard.final_video_url}
    download
    className="w-full"
  >
    <Button className="w-full" variant="outline">
      <Download className="mr-2 h-4 w-4" />
      ダウンロード
    </Button>
  </a>

  {/* アクションボタン */}
  <div className="flex gap-3">
    {/* 編集に戻るボタン */}
    <Button
      className="flex-1"
      variant="outline"
      onClick={() => {
        if (confirm("動画を編集しますか？再結合すると現在の完成動画は上書きされます。")) {
          setStep("review");
        }
      }}
    >
      <RotateCcw className="mr-2 h-4 w-4" />
      編集に戻る
    </Button>

    {/* 新しく作成ボタン */}
    <Button
      className="flex-1"
      onClick={() => {
        setStep("upload");
        setStoryboard(null);
        setImageFile(null);
        setImagePreview(null);
      }}
    >
      <Clapperboard className="mr-2 h-4 w-4" />
      新しく作成
    </Button>
  </div>
</div>
```

---

## ユーザーフロー

```
1. ダッシュボード → 完成した動画をクリック
2. 完成画面が表示される
3. 「編集に戻る」をクリック
4. 確認ダイアログ「動画を編集しますか？再結合すると現在の完成動画は上書きされます。」
5. OK → review step に遷移
6. 各シーンの動画プレビューが表示される
7. 再生成したいシーンの「再生成」ボタンをクリック
8. プロンプト編集モーダルでプロンプトを修正（前回実装した機能）
9. 再生成実行
10. 全シーン確認後「動画を結合する」で再結合
11. 新しい完成動画が生成される（元の動画は上書き）
```

---

## 工数見積もり

| 作業 | 時間 |
|------|------|
| ボタンUI追加 | 15分 |
| テスト | 15分 |
| **合計** | **30分** |

## 難易度

**低** - 単純なUI追加とstep遷移のみ

---

## 注意事項

1. **上書き警告**: ユーザーに「再結合すると上書きされる」ことを明示する
2. **既存機能の活用**: 先ほど実装したプロンプト編集機能がそのまま使える
3. **DBステータス**: 再結合後は status が再び "completed" になる（既存ロジック）

---

## テスト項目

- [ ] 完成画面に「編集に戻る」ボタンが表示される
- [ ] ボタンクリックで確認ダイアログが表示される
- [ ] キャンセルで完成画面のまま
- [ ] OKで review step に遷移
- [ ] review step で各シーンの動画が表示される
- [ ] シーンの再生成ができる
- [ ] 再結合で新しい完成動画が生成される
