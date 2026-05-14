---
id: T3-1
step: 3
node: all
title: "E2E 手動検証: 4 ノードすべて UI から動作確認 (実 API 課金あり)"
depends_on: [T2-A-3, T2-B-3, T2-C-3, T2-D-1]
estimated_effort: S
files_touched: []
---

## 目的

Step 2 で実装された 4 ノードすべてを、実際のノードエディタ UI で動作確認する。本タスクは**手動検証**で、検証結果のスクリーンショット or テキストレポートを提出する。

## 前提

- 全 Step 2 タスク (T2-A-1, T2-A-2, T2-A-3, T2-B-1, T2-B-2, T2-B-3, T2-C-1, T2-C-2, T2-C-3, T2-D-1) が**マージ済み**であること。
- 本番もしくはステージング環境の R2 + Supabase + FFmpeg が利用可能であること。
- **実 API 課金が発生する** (R2 ストレージ、FFmpeg 実行コスト) — 最小限の動画素材で検証すること。
- ローカル開発環境 (`pnpm dev` / `uvicorn`) または staging で実施可。

## 変更内容

なし (検証作業のみ)。検証結果を別途レポートとして提出する。

## 検証手順

### 1. パレットからの D&D 確認

- [ ] ノードエディタを開く
- [ ] 左ペインの「ユーティリティ」カテゴリが表示される
- [ ] 4 ノード (フレーム抽出 / トリム / スティッチ / 付箋) のエントリが表示される
- [ ] それぞれ D&D してキャンバスに配置できる

### 2. Get Video Frame (Node A)

- [ ] 既存の動画出力ノード (例: VideoOutputNode, KlingNode 等) を配置
- [ ] その出力 → GetVideoFrameNode の入力 (Video=緑) に接続できる (緑ハンドル同士の接続)
- [ ] direction='first' を選択して実行ボタン押下
- [ ] status='processing' → Loader2 が表示される
- [ ] 2〜5 秒後に status='completed' + 画像プレビュー表示
- [ ] direction='last' に変更して再実行 → 異なるフレームの画像が表示される
- [ ] 出力ハンドル (Image=青) から ImageInputNode 互換ノードへ接続できる (青ハンドル同士)

### 3. Trim Video (Node B)

- [ ] 動画出力ノード → TrimVideoNode の入力に接続 (緑→緑)
- [ ] start=1, end=3 を入力
- [ ] 実行ボタン押下 → 3〜10 秒で完了
- [ ] 出力動画が再生可能 (プレビューまたは下流ノードで確認)
- [ ] **バリデーション検証**: start=5, end=3 にすると実行ボタン disabled + エラーメッセージ表示
- [ ] **バリデーション検証**: end 空欄 (null) で実行できる

### 4. Stitch Videos (Node C) — 動的 Handle 検証

- [ ] StitchVideosNode を配置 → 初期状態で**Handle 1 個のみ**表示 (B1 修正の動的 Handle 検証)
- [ ] 動画出力ノード × 1 を Handle 1 に接続 → **Handle 2 が新たに表示される** (B1 修正必須)
- [ ] 動画出力ノード × 2 を Handle 2 にも接続 → Handle 3 が表示される
- [ ] 5 本接続まで増やせる、6 本目は表示されない (上限 5 制約)
- [ ] **2 本未満では実行ボタン disabled**、エラーメッセージ「2本以上の動画を接続してください」
- [ ] 2 本以上で実行ボタン押下 → status='pending' → 'processing' + 進捗バー (5 秒ごとに更新)
- [ ] 完了時 (最大 10 分) に status='completed' + 出力動画プレビュー
- [ ] **タイムアウト確認 (任意)**: 長尺×多数 (例: 5 本×30 秒) で 10 分以内に完了することを確認

### 5. Sticky Note (Node D)

- [ ] StickyNoteNode を配置
- [ ] **ハンドルなし**: Handle 表示が DOM に存在しない (DevTools で確認)
- [ ] テキスト入力 → 表示が反映される
- [ ] 色変更 (yellow → pink → blue) で背景色が変わる
- [ ] **maxLength**: 500 文字を超える文字列を貼り付け → 500 文字目で切れる
- [ ] ワークフロー保存 → 再ロード → text と color が**保持されている** (既存の保存機構経由)

### 6. ハンドル色規約検証 (Design Doc §3)

- [ ] **Video=緑**: GetVideoFrame 入力 / TrimVideo 両端 / Stitch 全ハンドル
- [ ] **Image=青**: GetVideoFrame 出力
- [ ] 色違いのハンドル接続 (緑→青など) を試して挙動を確認 (将来の型バリデーション参考)

### 7. エラーハンドリング検証 (Design Doc §9.1)

- [ ] GetVideoFrame: 動画未接続 → 実行ボタン disabled
- [ ] Trim: start >= end → インラインエラー
- [ ] Stitch: 接続 1 本 → 実行ボタン disabled
- [ ] BE 側エラー (動画ダウンロード失敗を意図的に発生) → 各ノード status='failed' + エラーメッセージ表示

## 完了条件 (AC)

- [ ] 上記検証手順 §1〜§7 のすべての項目にチェックが入っている
- [ ] 検証中に発見されたバグは GitHub Issue として起票され、修正完了している (もしくは Follow-up として記録)
- [ ] **B1 検証** (Stitch の動的 Handle + useUpdateNodeInternals): Handle 1 接続後の Handle 2 への接続が**成功**することを確認 (失敗する場合は T2-C-2 の B1 修正不備が原因)
- [ ] ワークフロー保存・復元で 4 ノードのデータが保持される (Sticky Note の text/color が特に重要)
- [ ] 検証結果レポート (スクリーンショット + 観察事項) が提出されている

## テスト

- 手動検証のみ。自動 E2E テスト (Playwright 等) は今回スコープ外。

## ロールバック

- 検証作業のためコード変更なし。検証結果のレポートを破棄するのみ。
- バグが見つかった場合は対応する Step 2 タスクをロールバックまたは fixup commit で対応。

## 参照

- Design Doc 全体 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md`
- 特に Design Doc §1 出荷完了の定義 — 行 32-44
- Design Doc §3 Krea 流ハンドル色規約 — 行 134-184
- Design Doc §7.2 B1 修正の検証 (動的 Handle + useUpdateNodeInternals) — 行 932-936
- Design Doc §9.1 エラーハンドリング表 — 行 1240-1253
- 各 Step 2 タスクの AC を再確認
