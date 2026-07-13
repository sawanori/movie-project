# 背景置換＋ライティング整合機能 実現可能性調査

調査日: 2026-06-12
手法: 検証ワークフロー（3角度・敵対的検証、一次ソース逐語照合）＋ lightx 実機PoC

## 0. 結論サマリー

「背景削除 → 新背景合成 → 背景に合わせた被写体リライト」は、**intrinsic decomposition（最難関層）を自作せずに、外部APIの組み合わせで実現可能**。有力経路は3つあり、品質・コスト・制約のトレードオフで使い分ける。

| 経路 | 動画対応 | 被写体保持 | 60秒対応 | コスト(60秒1080p) | 備考 |
|------|---------|-----------|---------|------------------|------|
| **A. Beeble SwitchX API** | ✅ | ✅ ピクセル保持＋PBRリライト | ❌ **240フレーム(8秒@30fps)/ジョブ** | $18（$0.30/30f） | 品質本命。自前アルファ(custom)・背景参照画像対応。要新規アカウント($50〜) |
| **B. fal-ai/lightx/relight** | ✅ | △ 生成系（要画質検証） | 要検証（内部49フレーム単位の可能性） | $6（$0.10/秒） | 既存FALキーで利用可。**PoCでキュー詰まり>30分を観測 — 運用リスク** |
| **C. Bria Video Replace Background** | ✅ | ✅ | ✅ 最大60秒 | **$0.20（$0.0033/秒）** | 既存統合ベンダー。「置換」は確実だがリライト品質は要検証。直API（要Briaアカウント、無料100生成） |

**推奨**: C（Bria置換・最安・60秒対応）をベースラインに、A（SwitchX・ショートクリップの品質枠）をプレミアムとして段階導入。Bは品質次第の補欠。

## 1. 最重要の事実確定: SwitchX APIは実在する

持ち込み分析の「公開APIは文書化されていない」は誤り（ただし無理もない誤解）:
- docs.beeble.ai/api-reference/openapi.json は **Mintlifyのサンプル（Plant Store）の放置プレースホルダー**（逐語確認済み）
- 本物は **developer.beeble.ai**（"Now available in public beta"）と **api.beeble.ai/developer-api-docs/openapi.json**（title: Beeble Developer API v1.0.0）

### SwitchX API 仕様（OpenAPI逐語確認済み）

- `POST /v1/uploads`（presigned URL、有効1時間）→ `POST /v1/switchx/generations` → ポーリング or `callback_url`(HTTPS webhook)。`x-api-key`認証、`idempotency_key`対応
- **入力**: `generation_type`(image|video)、`source_uri`、`alpha_mode`、`prompt`(≤2000字) と/または `reference_image_uri`（少なくとも一方必須）、`seed`、`max_resolution`(720|1080)
- **alpha_mode 4種**: auto / fill / **custom（自前のフル動画アルファマット）** / select（キーフレームマスク1枚＋AI伝播、`alpha_keyframe_index`）
  - → **当アプリの既存Bria背景削除のマットを custom でそのまま渡せる**（公式仕様で確認）
- **reference_image_uri** = 「style と lighting の設計図」。公式Overview原文: 「Source Video + Alpha Mask + Reference Image を与えると、新しい要素を生成し**被写体を新背景に合わせてリライト**する（relights your original subject to match perfectly）」「参照画像の提供を常に強く推奨」
- **制約**: 動画 **最大240フレーム**、ソース総画素 ≤2,770,000（≈1080p）、MP4/MOV(H.264/HEVC)、出力MP4 720p/1080p
- **料金**: 720p $0.10/30f、1080p $0.30/30f（ceil(frames/30)単位）。最低チャージ$50・無料枠なし・Build枠は同時5ジョブ/10rpm/月$5,000上限。**「Powered by SwitchX/Beeble」表示義務**（Build）
- 60fps素材は同じ実時間で2倍課金 → 投入前に30fps正規化推奨

### 持ち込み分析の検証結果

16主張すべて確認（refutedゼロ）。マスク4モード（Upload含む）、「unmasked areas は参照画像から style と lighting だけ抽出し元ピクセル保持」の原文、前景からのカメラモーション推定制約、Canvasのモデル構成（SwitchLight 3.0 / MatAnyone / CorridorKey / Video Depth Anything / SAM3 / Flux-2-Pro / Nano-Banana-Pro / Seedance 2.0 / Topaz）、クレジット単価、240フレーム/2K上限 — すべてdocs原文と逐語一致。**API存在の1点のみ訂正**。

## 2. 代替候補の検証結果

### 動画対応

- **fal-ai/lightx/relight**（Light-X、$0.10/出力秒、商用可）: `relit_cond_type=bg` + `relit_cond_img_url` で**背景画像を光源条件として動画をリライト** — 要件に最も直接対応するfal上のモデル。ただし:
  - 入力長の上限が未文書化（`ref_id` 0〜48 → 内部49フレーム単位の可能性）
  - **実機PoCで30分以上IN_QUEUEのまま**（GPUワーカー僅少とみられる）→ 本番UXに重大な運用リスク
- **Bria Video Replace Background**（直API `POST /replace_background`、$0.0033/秒、最大60秒）: 背景を画像/動画に直接置換。画像版では「lighting consistency, perspective, shadow logic を維持」と公式に謳う。動画版のリライト品質は要PoC。**既存統合ベンダーで最安・60秒対応**
- Lucy Edit（Decart、$0.04〜0.15/秒、テキスト指示型）/ Kling O3 Video-Edit（$0.084/秒・10秒/ジョブ）: プロンプト一括変換型の補欠
- **Runway Aleph: 2026-07-30 サンセット確定 — 除外**。Luma Modify Video: 高コスト（30秒$8〜24）＋10〜15秒分割
- Seedance 2.0 ref-to-video: 生成型で被写体同一性非保証（公式ガイドがエッジ劣化・ライティング不整合に言及）

### 画像（静止画）

- **第一候補: fal-ai/bria/background/replace**（$0.04/枚、`ref_images`対応、既存FALキー）
- 補完: bria/fibo-edit/relight（$0.04/枚、光の種類/方向の構造化指定）、IC-Light v1 fbc（背景画像条件、Apache-2.0、Replicate $0.023/枚）
- 注意: **IC-Light v2 は非商用ライセンス**（商用はfal API経由のみ、$0.10/MP、背景参照入力なし）

## 3. 推奨アーキテクチャ（段階導入）

```
[既存] 背景削除 (Bria) ──→ 透過WebM/ProRes ＋ アルファマット
                                    │
Phase 1: Bria Video Replace Background（直API）
  動画＋背景画像 → 置換合成（〜60秒、$0.20/60秒）→ 既存パターンで統合
                                    │
Phase 2: SwitchX API（プレミアム枠・〜8秒クリップ）
  source + 既存Briaマット(alpha_mode=custom) + 背景参照画像
  → PBRベースのリライト合成（$0.80〜2.40/ジョブ）
  ※ CM・SNSショート等の「決めカット」用
```

- 両方とも既存の `external/` プロバイダ抽象化＋`tasks/`ポーリングにそのまま適合（非同期ジョブ型）
- Phase 1はBriaアカウント作成（無料100生成でPoC可）、Phase 2はBeeble開発者アカウント＋$50チャージが必要
- lightxは品質が良くてもキュー詰まりが解消されない限り本番非推奨（PoC結果は追記）

## 4. 自作する場合の評価（参考）

intrinsic decomposition（SwitchLight相当）の自作は、ライトステージ級データと研究開発体制が必要で**非現実的**。一方「クラシック合成強化」（色転送＋ライトラップ＋ドロップシャドウのffmpeg実装）は安価な簡易版として将来検討可。

## 5. 未確定事項

- lightx PoC結果（キュー待ち中、結果待ち）
- Bria Video Replace Background の実リライト品質（要アカウント作成→PoC）
- SwitchXの8秒超クリップのチャンク分割時の継ぎ目品質（同一seed＋同一参照でどこまで揃うか）
