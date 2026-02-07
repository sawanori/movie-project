# Video-to-Video (V2V) 実装計画書

## 概要

ストーリー生成機能において、シーン間の連続性を向上させるため、従来のImage-to-Video (I2V) からVideo-to-Video (V2V) への移行を行う。

| 項目 | 内容 |
|------|------|
| 作成日 | 2025-12-28 |
| ステータス | 計画中 |
| 対象機能 | ストーリー生成（起承転結） |
| 推定工数 | 4-5日 |

---

## 1. 背景と目的

### 現状の課題

現在のストーリー生成は各シーンを独立してImage-to-Video (I2V) で生成しているため、シーン間の動きの連続性が弱い。

```
【現状: I2V】
Scene 1: 元画像 → Video 1
Scene 2: シーン画像 → Video 2（Scene 1との連続性なし）
Scene 3: シーン画像 → Video 3（Scene 2との連続性なし）
Scene 4: シーン画像 → Video 4（Scene 3との連続性なし）
```

### 目的

前シーンの動画を入力として次シーンを生成することで、シーン間の連続性を大幅に向上させる。

```
【目標: V2V】
Scene 1: 元画像 → Video 1（I2V）
Scene 2: Video 1 → Video 2（V2V: 連続性あり）
Scene 3: Video 2 → Video 3（V2V: 連続性あり）
Scene 4: Video 3 → Video 4（V2V: 連続性あり）
```

---

## 2. 基本方針

### 2.1 プロバイダー別対応

| プロバイダー | 対応 | 理由 |
|-------------|------|------|
| **Runway** | V2V実装 | `gen4_aleph` モデルでV2Vサポートあり |
| **VEO** | 従来通り（I2V） | 後日対応。現状は最終フレーム抽出方式を維持 |

### 2.2 モデル使い分け

| モード | 用途 | Runwayモデル | 変更 |
|--------|------|--------------|------|
| シーン生成 | 1枚の画像 → 1本の動画 | `gen4_turbo` | 変更なし |
| ストーリー生成 | 起承転結の連続動画 | `gen4_turbo` + `gen4_aleph` | V2V追加 |

---

## 3. 詳細設計

### 3.1 動画生成フロー

サブシーンを含む完全なフロー:

```
【Scene 1 (起)】
  入力: 元画像（I2V, gen4_turbo）
  出力: video_1.mp4

    【Sub 1.1】
      入力: video_1.mp4（V2V, gen4_aleph）
      出力: video_1_1.mp4

    【Sub 1.2】
      入力: video_1_1.mp4（V2V, gen4_aleph）
      出力: video_1_2.mp4

【Scene 2 (承)】
  入力: video_1_2.mp4（V2V, gen4_aleph）← サブシーンの最後から継続
  出力: video_2.mp4

    【Sub 2.1】
      入力: video_2.mp4（V2V, gen4_aleph）
      出力: video_2_1.mp4

【Scene 3 (転)】
  入力: video_2_1.mp4（V2V, gen4_aleph）← サブシーンの最後から継続
  出力: video_3.mp4

【Scene 4 (結)】
  入力: video_3.mp4（V2V, gen4_aleph）
  出力: video_4.mp4
```

### 3.2 直前動画の取得ロジック

「結合順で直前の動画を参照」するロジックを実装:

```python
def get_previous_video_url(current_scene, all_scenes):
    """結合順で直前のシーンの動画URLを取得"""

    # 結合順でソート（act_order → sub_scene_order → scene_number）
    sorted_scenes = sorted(all_scenes, key=lambda s: (
        s.act_order,
        s.sub_scene_order or 0,
        s.scene_number
    ))

    # 現在のシーンの位置を見つける
    current_index = next(
        i for i, s in enumerate(sorted_scenes)
        if s.id == current_scene.id
    )

    # 最初のシーン → 前の動画なし（I2Vを使用）
    if current_index == 0:
        return None

    # 直前のシーンの動画URLを返す
    previous_scene = sorted_scenes[current_index - 1]
    return previous_scene.video_url
```

### 3.3 プロバイダー別動作

| プロバイダー | Scene 1 | Scene 2以降 | サブシーン |
|-------------|---------|-------------|-----------|
| **Runway** | I2V（元画像, gen4_turbo） | V2V（直前動画, gen4_aleph） | V2V（直前動画, gen4_aleph） |
| **VEO** | I2V（元画像） | I2V（シーン画像） | I2V（最終フレーム抽出）※従来通り |

---

## 4. 実装タスク

### 4.1 タスク一覧

| # | タスク | ファイル | 工数 |
|---|--------|----------|------|
| 1 | V2Vインターフェース追加 | `video_provider.py` | 0.5日 |
| 2 | Runway V2V実装 | `runway_provider.py` | 1-2日 |
| 3 | 直前動画取得ロジック | `storyboard_processor.py` | 1日 |
| 4 | プロバイダー判定・分岐 | `storyboard_processor.py` | 0.5日 |
| 5 | テスト・調整 | - | 1日 |

**合計: 4-5日**

### 4.2 変更ファイル

```
movie-maker-api/
├── app/external/
│   ├── video_provider.py        # extend_video() インターフェース追加
│   └── runway_provider.py       # V2V実装（gen4_aleph）
└── app/tasks/
    └── storyboard_processor.py  # 直前動画参照ロジック、分岐処理
```

---

## 5. API設計

### 5.1 VideoProviderInterface 拡張

```python
class VideoProviderInterface(ABC):
    # 既存メソッド（変更なし）
    @abstractmethod
    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        camera_work: Optional[str] = None,
    ) -> str:
        """I2V: 画像から動画を生成"""
        pass

    # 新規追加
    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """V2V: 前の動画から継続して動画を生成

        デフォルト実装: NotImplementedError
        Runway: gen4_alephで実装（5秒固定）
        VEO: 将来対応

        注意: gen4_alephはduration固定のためパラメータなし
        """
        raise NotImplementedError("V2V not supported by this provider")

    @property
    def supports_v2v(self) -> bool:
        """V2Vサポートの有無"""
        return False
```

### 5.2 Runway V2V実装

**重要**: API調査により判明した正確なパラメータ名を使用

```python
class RunwayProvider(VideoProviderInterface):

    @property
    def supports_v2v(self) -> bool:
        return True

    def _convert_aspect_ratio_v2v(self, aspect_ratio: str) -> str:
        """V2V用のframe_size変換（gen4_alephはframe_sizeを使用）"""
        ratio_mapping = {
            "9:16": "720:1280",
            "16:9": "1280:720",
            "1:1": "960:960",
        }
        return ratio_mapping.get(aspect_ratio, "720:1280")

    async def extend_video(
        self,
        video_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """Runway gen4_aleph を使用したV2V生成

        注意: gen4_alephは5秒固定（durationパラメータなし）
        """

        frame_size = self._convert_aspect_ratio_v2v(aspect_ratio)

        # 正確なAPIパラメータ名（API調査により確認）
        request_body = {
            "model": "gen4_aleph",
            "video_url": video_url,      # ⚠️ promptVideoではなくvideo_url
            "prompt": prompt,             # ⚠️ promptTextではなくprompt
            "frame_size": frame_size,     # ⚠️ ratioではなくframe_size
            # duration: gen4_alephは5秒固定のため指定不要
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RUNWAY_API_BASE}/v1/video_to_video",
                headers=self._get_headers(),
                json=request_body,
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()
            return result.get("id")
```

### 5.3 gen4_alephの制限事項

| 項目 | 制限 |
|------|------|
| Duration | **5秒固定**（可変不可） |
| Max prompt length | 1000文字 |
| Supported frame_size | `1280:720`, `720:1280`, `960:960`, `1584:672` など |
| 入力動画形式 | MP4推奨、安定した照明・フレームが最適 |

---

## 6. 追加実装要件

### 6.1 Video URL有効期限対策

**問題**: Runway APIから返される動画URLには有効期限がある。V2Vチェーンで前の動画を参照する際、URLが期限切れになる可能性がある。

**対策**:

```python
async def ensure_video_accessible(video_url: str) -> str:
    """動画URLがアクセス可能か確認し、必要なら永続URLに変換"""

    # 1. URLアクセス確認
    async with httpx.AsyncClient() as client:
        try:
            response = await client.head(video_url, timeout=10.0)
            if response.status_code == 200:
                return video_url  # アクセス可能
        except Exception:
            pass

    # 2. R2に保存済みの場合はR2 URLを返す
    # (シーン保存時にR2にアップロード済みの場合)
    r2_url = await get_r2_url_for_scene(scene_id)
    if r2_url:
        return r2_url

    # 3. それでもダメならV2V不可（I2Vフォールバック）
    raise VideoUrlExpiredError("Video URL is no longer accessible")
```

**推奨**: シーン動画保存時に常にR2へアップロードし、R2 URLを`video_url`として保存する

### 6.2 処理順序の保証

**問題**: V2Vは前のシーンの動画完成を待つ必要がある。並列処理すると順序が崩れる。

**対策**: シーンを結合順に**逐次処理**する

```python
async def process_storyboard_scenes_v2v(scenes: list, provider):
    """V2V対応のシーン処理（逐次実行）"""

    # 結合順でソート
    sorted_scenes = sorted(scenes, key=lambda s: (
        s.act_order,
        s.sub_scene_order or 0,
        s.scene_number
    ))

    previous_video_url = None

    for scene in sorted_scenes:
        # 前のシーンの動画URLを使用してV2V生成
        video_url = await generate_scene_with_fallback(
            provider=provider,
            scene=scene,
            previous_video_url=previous_video_url,
        )

        # 次のシーン用に保存
        previous_video_url = video_url

        # DB更新
        await update_scene_video_url(scene.id, video_url)
```

### 6.3 エラー回復とチェーン継続

**問題**: Scene 2のV2Vが失敗してI2Vにフォールバックした場合、Scene 3はどうするか？

**対策**: フォールバック後もチェーンを継続

```python
async def generate_scene_with_fallback(provider, scene, previous_video_url):
    """V2V失敗時はI2Vにフォールバックし、チェーンは継続"""

    generation_method = "i2v"  # デフォルト
    result_video_url = None

    if previous_video_url and provider.supports_v2v:
        try:
            # V2V試行
            task_id = await provider.extend_video(
                video_url=previous_video_url,
                prompt=scene.runway_prompt,
            )
            result_video_url = await wait_for_completion(task_id)
            generation_method = "v2v"
        except Exception as e:
            logger.warning(f"V2V failed for scene {scene.id}, falling back to I2V: {e}")

    if not result_video_url:
        # I2Vフォールバック
        task_id = await provider.generate_video(
            image_url=scene.scene_image_url,
            prompt=scene.runway_prompt,
        )
        result_video_url = await wait_for_completion(task_id)

    # 生成方法を記録（デバッグ用）
    await update_scene_generation_method(scene.id, generation_method)

    # ⚠️ 重要: I2Vフォールバックした場合でも、
    # このシーンの動画URLを返す（次のシーンがV2Vで使用可能）
    return result_video_url
```

### 6.4 デバッグ用データ記録

**推奨**: 各シーンの生成方法を記録してデバッグ・分析に活用

```sql
-- storyboard_scenes テーブルに追加（任意）
ALTER TABLE storyboard_scenes ADD COLUMN generation_method VARCHAR(10);
-- 'i2v' または 'v2v'
```

```python
# シーン保存時に記録
await supabase.table("storyboard_scenes").update({
    "video_url": result_video_url,
    "generation_method": generation_method,  # 'i2v' or 'v2v'
}).eq("id", scene.id).execute()
```

---

*注: 詳細なフォールバック実装は上記セクション 6.3 を参照*

---

## 8. テスト要件

### 8.1 単体テスト

| テストケース | 対象 | 確認内容 |
|-------------|------|----------|
| UT-01 | `get_previous_video_url()` | サブシーンなしで正しい順序で前動画を取得 |
| UT-02 | `get_previous_video_url()` | サブシーンありで正しい順序で前動画を取得 |
| UT-03 | `get_previous_video_url()` | 最初のシーンで `None` を返す |
| UT-04 | `RunwayProvider.extend_video()` | 正常なV2Vリクエスト送信 |
| UT-05 | `RunwayProvider.extend_video()` | APIエラー時の例外ハンドリング |
| UT-06 | `RunwayProvider.supports_v2v` | `True` を返す |
| UT-07 | `VeoProvider.supports_v2v` | `False` を返す |
| UT-08 | `ensure_video_accessible()` | 有効なURLでそのまま返す |
| UT-09 | `ensure_video_accessible()` | 期限切れURLでR2フォールバック |
| UT-10 | `_convert_aspect_ratio_v2v()` | 正しいframe_size変換 |

### 8.2 統合テスト

| テストケース | シナリオ | 確認内容 |
|-------------|----------|----------|
| IT-01 | Runway + 4シーン（サブシーンなし） | Scene1=I2V, Scene2-4=V2V で生成される |
| IT-02 | Runway + サブシーンあり | 結合順で正しくV2V連鎖する |
| IT-03 | VEO + 4シーン | 全シーンI2Vで生成される（従来通り） |
| IT-04 | Runway V2V失敗 | I2Vにフォールバックして完了する |
| IT-05 | プロバイダー切り替え | 途中でプロバイダー変更しても動作する |
| IT-06 | Video URL期限切れ | R2 URLにフォールバックする |
| IT-07 | 逐次処理順序 | 結合順通りに処理される |
| IT-08 | チェーン継続（I2Vフォールバック後） | Scene2 I2V → Scene3 V2V（Scene2を参照） |

### 8.3 E2Eテスト

| テストケース | シナリオ | 確認内容 |
|-------------|----------|----------|
| E2E-01 | ストーリー生成（Runway） | 起承転結4シーンが連続性を持って生成 |
| E2E-02 | ストーリー生成（Runway + サブシーン） | 親シーン+サブシーンが正しく連鎖 |
| E2E-03 | ストーリー生成（VEO） | 従来通り動作することを確認 |
| E2E-04 | 最終動画の結合 | V2V生成した動画が正しく結合される |
| E2E-05 | シーン再生成 | V2V後のシーンを再生成してもチェーン維持 |

### 8.4 品質確認（手動）

| 確認項目 | 確認内容 | 合格基準 |
|----------|----------|----------|
| QA-01 | シーン間の連続性 | 前シーンの最終フレームと次シーンの開始が自然につながる |
| QA-02 | 人物の一貫性 | 同一人物が全シーンで維持される |
| QA-03 | 背景・環境の一貫性 | 場所・時間帯が急激に変化しない |
| QA-04 | 動きの自然さ | 不自然なジャンプや歪みがない |
| QA-05 | 品質劣化 | 4シーン目でも著しい画質低下がない |

### 8.5 テストデータ

```
テスト用画像:
- 人物ポートレート（1枚）
- 風景写真（1枚）
- 商品写真（1枚）

テストシナリオ:
- 4シーン（サブシーンなし）
- 4シーン + 各2サブシーン
- 起のみサブシーンあり
```

### 8.6 合格基準

| 項目 | 基準 |
|------|------|
| 単体テスト | 全件パス |
| 統合テスト | 全件パス |
| E2Eテスト | 全件パス |
| 品質確認 | QA-01〜05 すべて合格 |
| 生成時間 | 従来比 +20% 以内 |
| フォールバック | 100% 成功 |

---

## 9. 注意事項

### 9.1 変更しないもの

- **シーン生成機能**: 単発のI2V生成は `gen4_turbo` のまま維持
- **VEOプロバイダー**: 従来通りI2V + 最終フレーム抽出
- **DBスキーマ**: 既存の `video_url` フィールドを参照するだけで対応可能（ただしデバッグ用に `generation_method` 追加を推奨）

### 9.2 リスクと対策

| リスク | 対策 |
|--------|------|
| gen4_aleph APIの仕様が想定と異なる | 事前にAPI検証、フォールバック実装 |
| V2V生成時間の増加 | タイムアウト値の調整（現状300秒→必要に応じて延長） |
| 品質劣化（世代を重ねるごと） | モニタリング、必要に応じてI2Vとのハイブリッド検討 |
| Video URL有効期限切れ | R2へのアップロード必須化、URL検証実装 |
| 逐次処理による全体時間増加 | 進捗表示の改善、ユーザー通知 |
| gen4_aleph が5秒固定 | Duration可変が必要な場合はgen4_turbo（I2V）を検討 |
| APIパラメータ名の変更 | 定期的なAPI仕様確認、エラーハンドリング強化 |

### 9.3 将来の拡張

- **VEO V2V対応**: Veo 3.1 Scene Extension機能の実装
- **ハイブリッドモード**: I2V/V2V切り替えUI
- **品質最適化**: 世代劣化防止のための定期的な元画像参照

---

## 10. 実装チェックリスト

実装時に確認すべき項目:

- [ ] Runway API `/v1/video_to_video` エンドポイントの動作確認
- [ ] `video_url`, `prompt`, `frame_size` パラメータ名の確認
- [ ] gen4_aleph の5秒固定Duration確認
- [ ] R2へのシーン動画アップロードが実装されているか確認
- [ ] 逐次処理でシーン順序が保証されるか確認
- [ ] フォールバック後もチェーンが継続するか確認
- [ ] `generation_method` カラム追加（任意）
- [ ] エラーログにV2V/I2Vの区別が記録されるか確認
- [ ] タイムアウト値が適切か確認

---

## 11. 参考資料

- [Runway API Documentation](https://docs.dev.runwayml.com/)
- [Creating with Gen-4 Video – Runway](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video)
- [Creating with Aleph – Runway](https://help.runwayml.com/hc/en-us/articles/43176400374419-Creating-with-Aleph)
- [gen4_aleph API Reference](https://docs.aimlapi.com/api-references/video-models/runway/gen4_aleph)
- [Extend Veo on Vertex AI-generated videos | Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/video/extend-a-veo-video)

---

*Last Updated: 2025-12-28*
