# 背景削除機能 技術選定調査レポート

調査日: 2026-06-12
手法: 5角度並列調査＋敵対的検証（一次ソース直接照合、価格は検算、ライセンスはGitHub LICENSE生ファイル確認）。確認110件 / 反証・修正8件。
前提: movie-maker（FastAPI on Railway・GPUなし・R2・非同期プロバイダパターン確立済み）に動画・画像の背景削除を商用SaaS機能として追加する。

---

## 0. 前提となる重要な新事実

1. **Beeble自身が2026年4月2日に単体の「Background Remover」をローンチ済み**。出力はMOV（10-bit RGBA）/ PNGシーケンス / アルファのみマット。入力上限は動画2GB・2K・3600フレーム・60fps。課金は「30フレーム=1クレジット」（≒30fpsで1秒1クレジット）。60秒動画1本 ≈ **$1.9〜2.1**。ただし**APIは依然SwitchXのみで、Background RemoverのAPIは存在しない** — Beebleを裏で呼ぶ実装は引き続き不可能。
2. **Unscreen（Canva傘下の動画背景削除API）は2025年12月1日にサービス恒久終了**。統合候補から除外。
3. **RunwayのGreen Screen機能はアプリ内のみでAPI非提供**。

---

## 1. 動画背景削除 — 候補比較（1080p・30fps・検証済み価格）

| 候補 | 60秒1本 | 入力上限 | アルファ出力 | API型 | ライセンス/商用 |
|------|--------|---------|------------|-------|----------------|
| **Bria 直API** (v2/video/edit/remove_background) | **$0.198**（$0.0033/秒） | **60秒**・16000×16000・H.264/265/VP9/AV1 | webm_vp9 / **mov_proresks（ProRes）** / mkv_vp9 / mov_h265 / gif、preserve_audio、透明or単色合成 | 202+request_id+status_url ポーリング / webhook_url | 学習データ全ライセンス済み・IP補償（Devプランは Standard indemnification） |
| Bria via fal.ai (bria/video/background-removal/v3) | $0.255（$0.00425/秒） | 明示上限なし（要実測） | 同上（VRMBG 3.0、11色背景+Transparent） | falキュー型＋ED25519署名Webhook | Partner・Commercial use表示 |
| VEED via fal (標準) | $0.90〜1.35（$0.015〜0.0225/30f） | 明示上限なし | vp9（アルファ埋込WebM）or h264（RGB+アルファ2本出し） | falキュー型 | Partner・Commercial use |
| VEED via fal (fast) | $0.48〜0.72（$0.008〜0.012/30f） | 同上 | 同上、subject_is_person フラグあり | 同上 | 同上 |
| BiRefNet v2 video via fal | 不明（compute秒課金、認証付き料金APIで要確認） | 同上 | X264/VP9/**PRORES4444**/GIF、マスク出力可、Mattingバリアント、最大2304x2304処理 | 同上 | BiRefNet本体MIT |
| BEN2 via fal | ≈$3.73（$0.001/MP、全フレーム合計仮定） | 同上 | webm（VP9アルファ）/ mp4 | 同上 | BEN2 Base=MIT |
| Cutout.Pro | $3.45〜9.0（パック規模依存） | 2GB・4K・30fps | webm / mov | GETでタスク投入+ポーリング（Webhookはメール依頼の半手動） | 商用可 |
| Replicate RVM (arielreplicate) | ≈$0.01〜0.18/run | — | green-screen / alpha-mask / foreground-mask（MP4、透過WebM直接出力なし） | predictions API＋Webhook（結果1時間で消える→R2即転送必須） | RVM=GPL-3.0（サーバーサイド利用は条文上conveyに非該当、法務確認推奨） |
| **参考: Beeble BR本家** | $1.9〜2.1 | 2GB・2K・3600f | MOV 10-bit RGBA / PNGシーケンス / アルファマット | **API無し** | — |

### セルフホスト経路（Modal / RunPod）

- **RVM**（GPL-3.0、人物特化、リカレント時間メモリ、ソフトアルファ、1080p 104FPS@1080Ti）: Modal L4（$0.000222/s）で30秒動画1本 ≈ **2〜6円**。最安だが2021年以降モデル更新なし・人物限定
- BiRefNet（MIT）: 静止画モデルのフレーム毎適用 → フリッカーリスク（時間的一貫性機構なし）
- BEN2 Base（MIT）: segment_video あり、時間一貫性モジュールなし（第三者レビューは良好）
- **MatAnyone / MatAnyone 2（CVPR 2025/2026、品質SOTA）: S-Lab License 1.0 = 非商用限定。商用は著者個別連絡が必要 → 不可**
- SAM 2（Apache-2.0）: バイナリマスクでソフトアルファ非対応（単体では髪品質が出ない）
- GPUサーバーレス単価: Modal L4 $0.000222/s、RunPod L4 $0.00019/s（FlashBoot実測コールドスタート95%が2.3秒未満）、Replicate L40S $0.000975/s、Baseten L4 $0.8484/h

## 2. 画像背景削除 — 候補比較

| 候補 | 価格/枚 | 備考 |
|------|--------|------|
| 851-labs/background-remover (Replicate) | ≈$0.00051 | InSPyReNet（MIT）、実行2,500万回、T4で3秒 |
| Pixian.AI | ¥0.14〜2.83（MP依存） | **日本円建て表示**、画像専用 |
| Pixelcut via fal | $0.016 | |
| **Bria RMBG 2.0**（fal/直） | $0.018 | ライセンス済みデータのみで学習・商用安全。**HFのオープン重みはCC BY-NC（非商用）なのでAPI経由必須** |
| PhotoRoom | $0.02（Basic） | サンドボックス月1,000回無料 |
| BEN2 image via fal | $0.025/MP（1080p≈$0.052） | |
| remove.bg | ≈$0.11〜0.23 | 最高評判だが最高価格帯。クレジット繰越は2025年10月に廃止済み |

## 3. 出力形式の実務設計（検証済み）

- **NLE納品のマスター**: ProRes 4444（Resolveのアルファ対応書き出しは Uncompressed 10/16-bit・ProRes 4444 (XQ)・DNxHR 444 のみ）。ffmpegの`prores_ks` + `-pix_fmt yuva444p10le` は**CPUエンコードなのでRailwayで実行可能**
- **ブラウザプレビュー**: WebM VP9アルファ（Chrome/Firefox）。SafariはHEVCアルファのみ対応だが、**HEVCアルファのエンコードはmacOS（VideoToolbox）でしか出来ずLinuxサーバーでは事実上不可** → Safari向けは合成済みMP4フォールバックが現実解
- **WebMはResolve非対応・Premiere/AEもプラグイン必要** → WebM=プレビュー用、ProRes 4444/PNGシーケンス=納品用と分離するのが実務標準（Beeble本家もMOV RGBA+PNGシーケンスの構成）
- グリーンバック合成済みMP4の再キーイングは4:2:0クロマサブサンプリングでエッジ品質が落ちるため、アルファ直接出力を主とすべき

## 4. 推奨

### 本命: 経路A「Bria 直API」(動画) ＋ Bria RMBG 2.0 / 851-labs (画像)

理由:
1. **コスト**: 60秒$0.198 ≈ ¥30/本。Beeble本家（$1.9〜2.1）の約1/10
2. **入力上限60秒が要件（10〜60秒）と一致**し、明文化されている唯一の候補
3. **ProRes（mov_proresks）を直接出力** → Railway側のffmpeg変換すら不要のケースが多い。WebM VP9アルファ・音声保持・単色合成も選択可
4. **API設計が既存パターンと同型**: 202+request_id+status_url ポーリング＋webhook_url → `VideoProviderInterface`＋`tasks/`ポーリングプロセッサにそのまま載る
5. **法務リスク最小**: 学習データ全ライセンス済み＋IP補償。生成物の権利問題・OSSライセンス問題なし

### 対抗: 経路A'「fal.ai 1本に集約」

fal経由なら Bria（$0.00425/秒）・VEED・BiRefNet（PRORES4444・Mattingバリアント）・BEN2 を**1つのAPIキー・1つのキュー型クライアント（fal-client）で切り替え可能**。単価は直APIよりやや高いが、品質比較とモデル乗り換えの自由度を重視するならこちら。fal自体は2025年12月シリーズD（$140M、評価額$4.5B）で安定性は高い。

### 非推奨

- セルフホストRVM: 1本数円と圧倒的に安いが、人物限定・モデル陳腐化（2021年）・GPL法務確認・GPU運用負荷を考えると、月数千本規模になるまでは従量APIが合理的
- MatAnyone系: 品質SOTAだが非商用ライセンスで不可
- Cutout.Pro / remove.bg(動画なし) / Unscreen(終了) / Runway(API無し): 除外

### 品質に関する正直な留保

Bria/VEEDとも**時間的一貫性の定量ベンチマークは非公開**。「Beeble同等」の最終判断は実フッテージでのPoC比較（同一テストクリップをBria直・VEED・BEN2に投入して目視比較）が必須。PoC費用は数十円で済む。

## 5. 提案する次のステップ

1. **PoC（半日）**: テストクリップ3本（人物・商品・髪の細かい被写体）でBria直API・VEED fast・BEN2を実行し品質比較 → プロバイダ確定
2. **設計**: `external/bria_provider.py`（または `fal_provider.py`）+ `app/background_removal/` ドメイン + `tasks/bg_removal_processor.py` + フロントエンド（concat ページを雛形に）
3. **実装 → 検証 → リリース**

---

## 主要ソース（一次）

- Bria: engine.prod.bria-api.com API docs / bria.ai 料金ページ（$0.0033/sec, Development プラン）
- fal.ai: 各モデルページ＋llms.txt＋APIドキュメント（13エンドポイント実在確認）/ ToS / status.fal.ai
- Replicate: モデルページ・docs（predictions/webhook/deployments/料金）/ ToS
- GitHub LICENSE生ファイル: PeterL1n/RobustVideoMatting（GPL-3.0）, pq-yang/MatAnyone・MatAnyone2（S-Lab 1.0）, ZhengPeng7/BiRefNet（MIT）, facebookresearch/sam2（Apache-2.0）, PramaLLC/BEN2（MIT）, danielgatis/rembg（MIT）
- Beeble: docs.beeble.ai（Background Remover仕様・課金）/ 料金ページ / CG Channel・RedShark報道（2026年4月）
- Unscreen終了告知（unscreen.com）/ remove.bg公式ヘルプ（ロールオーバー廃止）/ Blackmagic・ffmpegドキュメント（ProRes 4444アルファ）
