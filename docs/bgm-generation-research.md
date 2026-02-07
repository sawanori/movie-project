# BGM生成機能 調査レポート

## 概要

動画生成アプリにAI BGM生成機能を追加するための技術選定調査。

## 選択肢の比較

### 1. Mubert API（推奨）

BGM・インストゥルメンタル音楽生成に特化したAPI。

| 項目 | 内容 |
|------|------|
| **価格** | Trial: $49/月、Startup: 要問合せ |
| **特徴** | リアルタイム生成、150+ムード/テーマ、最大25分のトラック |
| **ライセンス** | 完全ロイヤリティフリー、DMCA-free |
| **統合実績** | ゲーム、ウェルネスアプリ、配信サービス多数 |

**メリット:**
- API優先設計でアプリ統合が容易
- 12,000+のキュレーション済みトラックライブラリ
- テキストプロンプトからの生成対応
- ムード、ジャンル、BPMでのフィルタリング
- 商用利用可、サブライセンス可（Startup+プラン）

**デメリット:**
- 無料プランなし
- ボーカル付き楽曲は生成不可

**ドキュメント:** [Mubert API 3.0](https://mubertmusicapiv3.docs.apiary.io/)

---

### 2. SOUNDRAW API

高品質なBGM生成プラットフォーム。

| 項目 | 内容 |
|------|------|
| **価格** | API: $500/月（エンタープライズ向け） |
| **特徴** | 自社制作音源のみで学習、高品質 |
| **ライセンス** | 永続商用ライセンス、100%ロイヤリティ所有 |
| **統合実績** | Canva（1.75億ユーザー）等 |

**メリット:**
- 法的に完全クリアな音源（自社制作のみ）
- 永続ライセンス（解約後も使用可）
- YouTube、広告、店舗BGM等あらゆる用途対応

**デメリット:**
- API価格が高い（$500/月）
- 小規模プロジェクトには過剰

**公式サイト:** [SOUNDRAW Business](https://soundraw.io/business)

---

### 3. Meta MusicGen（セルフホスト）

オープンソースのAI音楽生成モデル。

| 項目 | 内容 |
|------|------|
| **価格** | 無料（インフラ費用のみ） |
| **モデルサイズ** | Small(300M)、Medium(1.5B)、Large(3.3B) |
| **ライセンス** | コード: MIT、モデル: CC-BY-NC 4.0 |
| **要件** | GPU（16GB VRAM推奨） |

**メリット:**
- 初期費用・月額費用なし
- 完全なコントロール
- テキストプロンプト＋メロディ条件付け

**デメリット:**
- **CC-BY-NC 4.0**: 商用利用に制限あり（要確認）
- GPU必要（Railwayでは困難）
- 自前でのインフラ管理が必要
- 生成品質はAPIサービスに劣る可能性

**GitHub:** [facebookresearch/audiocraft](https://github.com/facebookresearch/audiocraft)

---

### 4. Suno / Udio

主にボーカル付き楽曲向け。

| 項目 | Suno | Udio |
|------|------|------|
| **価格** | $10/月〜 | $10/月〜 |
| **特徴** | 高速生成、使いやすい | 高品質ボーカル、細かい制御 |
| **API** | 非公開 | 非公開 |

**デメリット:**
- 公式APIが提供されていない
- BGMよりボーカル楽曲向け
- プログラマティック利用には不向き

---

## 推奨アプローチ

### Phase 1: Mubert API（推奨）

**理由:**
1. **BGM特化**: インストゥルメンタル音楽生成に最適化
2. **価格**: $49/月のトライアルから開始可能
3. **統合の容易さ**: RESTful API、豊富なドキュメント
4. **ライセンス**: 完全ロイヤリティフリー、法的リスクなし
5. **柔軟性**: ムード、ジャンル、長さの指定が可能

### 実装イメージ

```python
# movie-maker-api/app/external/mubert_client.py

import httpx
from app.core.config import settings

class MubertClient:
    BASE_URL = "https://api.mubert.com/v2"

    async def generate_bgm(
        self,
        mood: str,          # "cinematic", "upbeat", "relaxing"
        duration: int,      # 秒数
        intensity: str,     # "low", "medium", "high"
    ) -> str:
        """BGMを生成してURLを返す"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/GenerateTrack",
                headers={"Authorization": f"Bearer {settings.MUBERT_API_KEY}"},
                json={
                    "mood": mood,
                    "duration": duration,
                    "intensity": intensity,
                    "format": "mp3",
                }
            )
            data = response.json()
            return data["track_url"]
```

### 動画生成フローへの統合

```
1. ユーザーがムード/ジャンルを選択
2. 動画の長さに合わせてBGM生成リクエスト
3. Mubert APIがBGMを生成
4. FFmpegで動画とBGMを合成
5. 最終動画を出力
```

---

## 代替案: ハイブリッドアプローチ

予算に応じて段階的に導入：

| Phase | アプローチ | コスト |
|-------|-----------|--------|
| MVP | 既存プリセットBGM（現状） | $0 |
| Phase 1 | Mubert API Trial | $49/月 |
| Phase 2 | Mubert Startup | 要見積 |
| 将来 | MusicGenセルフホスト（ライセンス確認後） | GPU費用 |

---

## 次のステップ

1. [ ] Mubert APIのトライアルアカウント取得
2. [ ] API統合のPoCを実装
3. [ ] 動画長に応じたBGM長の自動計算ロジック
4. [ ] ムード選択UIの設計
5. [ ] FFmpeg合成処理の調整

---

## 参考リンク

- [Mubert API](https://landing.mubert.com/)
- [Mubert API Documentation](https://mubertmusicapiv3.docs.apiary.io/)
- [SOUNDRAW](https://soundraw.io/)
- [Meta AudioCraft](https://ai.meta.com/resources/models-and-libraries/audiocraft/)
- [MusicGen on Hugging Face](https://huggingface.co/facebook/musicgen-large)
- [AI Music Generator Comparison](https://superprompt.com/blog/best-ai-music-generators)
