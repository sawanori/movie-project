# Beeble AI（SwitchLight）徹底調査・分析レポート

調査日: 2026-06-11
手法: deep-research ワークフロー2ラウンド（計108エージェント / 約40ソース / 抽出100主張のうち上位80件を敵対的検証、反証された誤情報は修正済み）

---

## 1. エグゼクティブサマリー

Beeble AI は、**査読付き論文（CVPR 2024）の研究成果をそのまま製品化した「研究直結型」のAI映像処理スタートアップ**。コア技術は、フッテージ（動画/画像）から物理ベースレンダリング（PBR）のマテリアルパス一式 — Normal / Base Color / Roughness / Metallic / Specular / Alpha / Depth の7パス — をAIで推定し、撮影済み映像を「**再ライティング可能な2.5Dアセット**」に変換すること。

事業構造は3層:

1. **Beeble Cloud**（Web、クレジット制、無料〜$75/月）— ライト層の獲得
2. **Beeble Studio**（デスクトップ、ローカルGPU実行、$60〜$400/月）— プロVFX向け収益源
3. **SwitchX API**（従量課金、2026年4月〜パブリックベータ）— B2B組み込み（OpenArt VFX等が採用）

差別化は「リライト機能そのもの」ではなく、**動画対応 × PBRパス素材出力 × 16-bit EXR/DCCプラグインによるパイプライン統合 × ローカル処理**の組み合わせ。この4点を同時に満たす競合は2026年6月時点で確認できない。

---

## 2. 会社情報・資金調達・沿革

### 会社概要

| 項目 | 内容 |
|------|------|
| 法人 | Beeble AI Inc.（規約上の主体は米デラウェア州ウィルミントン登記。本社はソウル） |
| 創業 | 2022年。韓国ゲーム大手 Krafton（PUBG）のAI研究・MLチーム出身の5人が共同創業 |
| 共同創業者 | Hoon Kim（CEO）、Jisoo Lee、Donghyun Na、Wonjun Yoon、Minje Jang — CVPR 2024論文のBeeble所属著者5人と完全一致（第6著者 Sanghyun Woo はNYU所属の外部共同研究者） |
| CEO経歴 | Hoon Kim: KAIST 電気工学・CS二重専攻学士（2017）→ 同電気工学修士（2019）→ Lunit 研究員（2019–2020）→ Krafton 音声合成チームリーダー（2020–2022） |
| 資金調達 | 2024年7月、シードで**$4.75M**（リード: Basis Set Ventures、参加: Fika Ventures、既存: Mashup Ventures・Kakao Ventures）。評価額**$25M**。以降の追加ラウンドは2026年6月時点で公表なし |
| 規模 | 従業員11名（Tracxn、2026年5月末時点）。公式チームページ掲載は8名 |

### 沿革タイムライン（検証済み・日付は公式発表基準）

| 時期 | 出来事 |
|------|--------|
| 2022 | 創業 |
| 2023頃 | モバイルAIセルフィーリライトアプリ「SwitchLight」（約300万DL、2023年10月収益化。B2B顧客にReelShort） |
| 2024-02 | SwitchLight論文 arXiv公開 → **CVPR 2024採録**（同社公表ではレビュー満点5,5,5・highlight指定） |
| 2024前半 | デスクトップ「SwitchLight Studio」無料オープンベータ（v0.6.x） |
| 2024-07 | $4.75M シード調達（TechCrunch報道） |
| 2025-07-01 | **SwitchLight 2.0** — 完全新アーキテクチャ。モデル10倍・学習データ13倍（ベンダー自己申告）。人物限定→全シーン対応のVideo-to-PBRへ |
| 2025-11-05 | **SwitchLight 3.0** — マルチフレーム同時処理の「真の動画モデル」（旧版はフレーム単体処理+デフリッカー後処理）。データさらに10倍。同時にブランド再編: デスクトップ=Beeble Studio / Web=Beeble Cloud |
| 2025-12-17 | **Beeble Studio 正式ローンチ**（当初Windows専用→現在はRocky Linux 8/9も対応） |
| 2026-02-06 | **SwitchX** — 同社初のvideo-to-video生成モデル。約5分で2K出力 |
| 2026-04 | **SwitchX API** パブリックベータ公開 |
| 2026-05 | **Canvas** — ノードベースAIコンポジティング環境を発表 |
| 2026-06 | OpenArtの新サービス「OpenArt VFX」がSwitchXをエンジン採用 |

### 採用事例

- **Boxel Studio** が「Superman & Lois」シーズン4のヒーローFXシーンの再照明にSwitchLightを本格導入（実写プレートから法線・アルベド・スペキュラ・ラフネスのパスを生成し、Nukeでインタラクティブにリライト）。現在進行中の複数のTV・映画・アニメ案件の標準コンポジットワークフローに組み込み
- NAB 2026でThe VPX Labと共同のポータブル・バーチャルプロダクションデモ
- OpenArt VFX（背景置換・全面リライト・領域編集の3モードすべてがSwitchX駆動）

---

## 3. 技術の仕組み

### 3.1 出自: CVPR 2024 論文

「**SwitchLight: Co-design of Physics-driven Architecture and Pre-training Framework for Human Portrait Relighting**」（Kim, Jang, Yoon, Lee, Na, Woo — pp. 25096-25106）。arXivのコメント欄に「Live demos available at https://www.beeble.ai/」と明記されており、サービス＝論文の製品化であることが一次ソースで確認できる。

### 3.2 物理ガイド型アーキテクチャ（v1.0、論文公開分）

- **Cook-Torrance反射モデル**（PBRの代表的マイクロファセットBRDF）をネットワーク設計に組み込み、光と表面の相互作用を物理的にシミュレートする構成
- 3ネットワーク構成: **Illum Net**（照明=HDRI環境推定）/ **Diffuse Net**（アルベド推定）/ **Specular Net**（Cook-Torranceパラメータ: roughness α・Fresnel反射率 f0 を明示推定）
- レンダリング段でマイクロファセットBRDF **D·G·F / [4⟨n·l⟩⟨n·v⟩]** を計算。先行研究 Total Relighting（Google）の経験的Phongモデルを物理ベースモデルに置換した点が新規性
- 「ニューラルネットに物理レンダリング方程式の構造を埋め込む」設計であり、ブラックボックス生成モデル（拡散モデル系リライト）とは根本的に異なるアプローチ

### 3.3 学習データ戦略

- 高品質な**ライトステージ**（多方向ライティングで人物を撮影する特殊スタジオ）データは極めて希少 → **MMAE（Multi-Masked Autoencoder）** と呼ばれるMAE型の自己教師あり事前学習をラベルなしポートレート画像に適用し、高コストなライトステージ収集への依存を低減してスケール
- 「物理モデリング × 拡張学習データ」の組み合わせがリライティングのリアリズムで新ベンチマークを確立、というのが論文の主張

### 3.4 留意点

- 査読論文で裏付けられているのは**v1.0（人物ポートレート限定）のみ**。2.0以降の内部アーキテクチャは非公開で、「Cook-Torranceベース継続」は出力がPBRパスであることからの推定にとどまる
- SwitchX（video-to-video生成）のアーキテクチャ（拡散モデルか否か等）も非公開。公式説明は「元映像のピクセルレベルのガイダンスで被写体のアイデンティティと演技を保持したまま変換する生成モデル」
- 「モデル10倍・データ13倍/10倍」「世界最高のVideo-to-PBRモデル」はすべて**ベンダー自己申告**。モデル非公開のため独立ベンチマークは存在しない

---

## 4. プロダクト群と製品アーキテクチャ

### 4.1 Beeble Cloud（Web版）

4ツール構成 + Canvas:

| ツール | 機能 |
|--------|------|
| **SwitchX** | video-to-video生成。被写体を保持したまま背景・ライティング・小道具・スタイルを変更（Cloud専用） |
| **Background Remover** | 「スタジオ品質のロトスコープを数秒で」（Cloud専用） |
| **VFX Pass Generator** | SwitchLight 3.0で7パス（Alpha/Depth/Normal/BaseColor/Roughness/Specular/Metallic）を生成 |
| **Beeble Editor** | ポイント/エリア/太陽光/ビデオライト/HDRI環境を使うリアルタイム3Dリライティングエディタ |
| **Canvas**（2026-05〜） | ノードベースのAIコンポジティング環境。自社モデル＋外部モデル＋ロトをノードグラフで統合 |

**Cloud版の出力制限（重要）**: 8-bit PNGシーケンス / MP4のみ（深度のみ16-bit float EXR）。最大2K・60秒または2,000フレーム。**マルチチャンネル16-bit EXRはStudio限定**。

### 4.2 Beeble Studio（デスクトップ版）

- SwitchLight 3.0を**ユーザーのNVIDIA GPU上で完全ローカル実行**。「ファイルがマシンから出ない」ことを訴求（機密案件向け）
- ネイティブ4K、1回のレンダリングで最長1時間のシーケンス、クレジット制限なし
- **全AOVパスを1ファイルに収めたマルチチャンネル16-bit EXR出力**
- **Nuke / Blender / Unreal Engine 用公式プラグイン**（2026年6月時点で活発に保守。UE 5.6対応済み）
- 要件: NVIDIA RTX 30系以上・VRAM 12GB以上（推奨RTX 40系・24GB）、RAM 16GB、Windows 10/11 または Rocky Linux 8/9。**Mac非対応**
- ネット接続はインストール・認証・更新時のみ

### 4.3 SwitchX API（developer.beeble.ai）

- **API提供はSwitchXのみ**（SwitchLight/VFX Pass GeneratorはAPI未提供 — 公式FAQ明記）
- 非同期ジョブ型REST: `POST /v1/uploads`（presigned URL取得）→ PUTアップロード → `POST /v1/switchx/generations` → `GET /v1/switchx/generations/{id}` を約5秒間隔でポーリング、または `callback_url`（HTTPS Webhook）
- 認証は `x-api-key`、`idempotency_key` 対応。アカウント情報・課金・クレジット購入・自動リチャージまでAPIで完結
- 入力: PNG/JPEG/WebP、MP4/MOV（H.264/HEVC）、最大240フレーム、総ピクセル277万以下、プロンプト最大2,000字
- 出力: MP4のみ（結果URLは72時間で失効）。**APIにEXR出力はない**
- 規約: 生成物の権利はユーザー帰属 / ユーザーコンテンツをML学習に不使用 / 公開アプリには「Powered by SwitchX/Beeble」表示必須（Scale以上で書面免除可）/ クレジットは購入から1年で失効 / 準拠法デラウェア州法

---

## 5. 料金体系（2026-06-11時点・公式ページ実測）

### Beeble Cloud（クレジット制SaaS）

| プラン | 月額 | クレジット | 備考 |
|--------|------|-----------|------|
| Starter | 無料 | 90/月 | **非商用限定**・SwitchX 720pまで・無料ユーザーのコンテンツはR&D利用される |
| Creator | $19（年払い$16） | 540/月 | 1080p・フル商用ライセンス・AI学習不使用 |
| Professional | $75（年払い$60） | 2,400/月 | 1分動画・SwitchX 1080p・プラグイン連携 |

SwitchXクレジット消費: 720p 30フレーム=3cr、1080p 30フレーム=10cr（1080pはProfessional限定）

### Beeble Studio（デスクトップ）

| プラン | 月額 | 条件 |
|--------|------|------|
| Indie | $60（年払い$42 ≒ $504/年） | 年商20万米ドル未満の組織限定の商用ライセンス |
| Standard | $400（年払い$250 = $3,000/年) | フル商用利用権 |
| Enterprise | 個別見積もり | CLI統合・API統合・カスタムライセンス・シート管理（現行ページからは表記が消えており要問い合わせ） |

両プラン7日間無料トライアルあり。

### SwitchX API（前払い従量課金）

| ティア | 価格 | 条件 |
|--------|------|------|
| Build | 動画/画像とも 720p $0.10/30f、1080p $0.30/30f | 最低チャージ$50、月間上限$5,000、5 RPM・同時10ジョブ程度（公式ページ間で数値に揺れ） |
| Scale | 個別 | Net-15/30後払い・専任AM・SLA・ホワイトラベル |

---

## 6. 競合比較

### 比較マトリクス（検証済み事実ベース）

| ツール | 動画対応 | PBRパス出力 | ローカル実行 | EXR/DCC統合 | 価格帯 |
|--------|---------|------------|------------|------------|--------|
| **Beeble Studio** | ✅ | ✅ 7パス | ✅ NVIDIA GPU | ✅ 16-bit EXR + Nuke/Blender/UE | $60〜400/月 |
| **Beeble Cloud** | ✅ | ✅（8-bit PNG/MP4） | ❌ | △ | 無料〜$75/月 |
| ClipDrop Relight（Jasper傘下） | ❌ 静止画のみ | ❌ | ❌ | ❌ | 無料20回/24h、Pro 約€13/月 |
| Magnific Relight（旧Freepik、2026-04リブランド） | ✅ 最大1080p | ❌ | ❌ | ❌ | $14.5〜20/月、API €0.10/枚 |
| Adobe Project Light Touch | （静止画） | ❌ | ❌ | ❌ | **未製品化**（MAX 2025 Sneak＝研究プレビュー） |
| Adobe Photoshop Harmonize | ❌ 静止画合成 | ❌ | ❌ | — | Photoshop 27.0（2025-10）で正式機能化 |
| Adobe Premiere/AE 2026 | ✅ | ❌ マスクベース調整のみ | ✅ | — | CC契約 |
| **DaVinci Resolve Relight FX** | ✅ | ❌ サーフェスマップ内部利用のみ・書き出し不可・影/深度生成不可 | ✅ | ❌ | Studio $295 買い切り |
| Autodesk Flow Studio（旧Wonder Studio） | ✅ | ❌（CGキャラ合成が主目的＝隣接領域） | ❌ | △ Pro限定でパス書き出し | 無料〜$95/月 |
| Cuebric | ❌ 静止画ベース2.5D環境生成（LEDウォール向け） | △ 深度のみ | ❌ | △ Disguise統合 | $15〜120/月 |
| Runway Aleph | ✅ 生成系 | ❌ | ❌ | ❌ | $12〜76/月 |
| Luma Modify Video | ✅ 生成系 | ❌ | ❌ | ❌ | API約$0.35/秒 |
| Pika（Pikaswaps等） | ✅ 生成系 | ❌ | ❌ | ❌ | 無料〜$76/月 |

### 競合分析の結論

1. **「AI動画リライティング」単体はもはやBeeble独占ではない** — Resolve Relight FX（ローカル・$295買い切り）、Magnific、Runway Aleph、Luma Modify Videoが動画リライトを提供
2. しかし「**動画 × PBRパス素材出力 × 16-bit EXR/DCCプラグイン統合 × ローカル処理**」の4点同時成立はBeeble Studioのみ（2026年6月時点・今回調査範囲で同等品確認できず）
3. つまりBeebleの本質的価値は「ワンクリックでリライトされた完成映像」ではなく、「**撮影素材をVFXパイプラインに乗る中間素材（AOVパス）に変換する**」こと。プロVFX/ポスプロのコンポジターが従来のNuke/Fusionワークフローの中で自由にライティングを作り込める
4. SwitchX（生成系video-to-video）は逆にRunway/Luma側の土俵に出た製品で、こちらは競争が激しい

---

## 7. 映像制作会社（御社）視点での示唆

### 7.1 ワークフロー活用

- **最小コストの検証パス**: Cloud Starter（無料・非商用）→ Creator $19/月で商用検証 → 本格導入ならStudio Indie $60/月（年商$200K未満の組織条件に注意。超える場合はStandard $400/月）
- **即効性のあるユースケース**: ①撮影後のライティング変更（リシュート回避）、②人物切り抜き（ロト）の自動化、③実写素材とCG背景の合成時のライティングマッチング、④バーチャルプロダクション的な背景差し替え（SwitchX）
- **導入障壁**: Studio版はNVIDIA GPU必須（VRAM 12GB+）・**Mac非対応** — Macベースの制作環境ではCloud版のみ。Cloud版はEXR不可（8-bit）なので本格的なカラーパイプラインにはStudio必須
- **日本市場の状況**: 日本代理店・日本語サポート・円建て決済はなし。日本語の解説記事は少数（note、CineD日本語版等）存在するが、日本企業の公表導入事例は未発見 → **国内では先行者の余地あり**

### 7.2 類似サービス構築の参考（movie-maker事業視点）

- **ビジネスモデルの型**: 研究直結型（論文→製品）/ 低額クレジットSaaS（獲得）＋高額ローカル版（収益）＋API従量課金（B2B）の3層 / DCCプラグインで既存パイプラインに食い込む戦略
- **SwitchX APIはmovie-maker-apiの既存構造と同型**: presigned URLアップロード → ジョブ作成 → ステータスポーリング/Webhook という非同期ジョブ型で、`external/` の `VideoProviderInterface`（`generate_video` / `check_status`）+ `tasks/` のポーリング型プロセッサのパターンにそのまま適合する。プロバイダとして組み込む場合の構造的障害はない
- **規約上の注意**: API利用時は「Powered by SwitchX/Beeble」表示必須（Scale以上で免除交渉可）/ 出力URL72時間失効のため自前ストレージ（R2）への退避が前提 / クレジット1年失効

---

## 8. 留保事項（検証で判明した限界・訂正）

1. **ベンダー自己申告値**: モデル10倍・データ13倍/10倍、「世界最高」等は独立検証不能。すべてBeebleの主張として扱うこと
2. **時間依存**: 料金・仕様は2026-06-11時点のライブ確認値。モデル世代交代が速い（約4ヶ月ごとに大型発表）
3. **「2.5D/3Dアセット」の表記揺れ**: 公式docsは2.5D、マーケページは3D。実体は画像空間のAOVパスシーケンス＋深度であり、3Dメッシュではない
4. **検証で訂正された誤情報の例**: 「Cloud版にEXR出力がある」（誤り — EXRはStudio限定）/「Harmonizeはベータ」（誤り — 2025年10月にGA）/ 各モデルの発表日は報道日ではなく公式リサーチページ基準に統一
5. 2.0以降のモデルアーキテクチャ・SwitchXの学習データの出所/権利処理は非公開のまま

---

## 主要ソース

- 論文: arxiv.org/abs/2402.18848 / CVF Open Access (CVPR 2024)
- 公式: beeble.ai（/research, /beeble-studio, /pricing, /pricing-cloud）, docs.beeble.ai, developer.beeble.ai
- 報道: TechCrunch (2024-07-10), CG Channel, CineD, RedShark News, VP Land, ProVideo Coalition, No Film School, Digital Production, Newsshooter
- 競合一次ソース: clipdrop.co, docs.magnific.com, Adobe公式ブログ, DaVinci Resolve 18.6マニュアル, Blackmagic Design, Runway, Luma, pika.art
- 会社情報: Tracxn, Hoon Kim個人サイト (gnsrla12.github.io), Beeble公式チームページ
