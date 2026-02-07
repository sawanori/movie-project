# 動画品質向上 実装提案書

## 概要

シーン生成における動画品質を最高レベルに引き上げるための実装提案。
Runway API の最新機能を活用し、Fidelity（鮮明度）、Stability（安定性）、Controllability（制御性）を向上させる。

---

## 現在の実装状況

| 機能 | 使用モデル | 状態 | 備考 |
|------|-----------|------|------|
| I2V（画像→動画） | Gen-4 Turbo | ✅ 実装済 | 5 credits/sec |
| V2V（動画→動画） | Gen-4 Aleph | ✅ 実装済 | シーン継続用 |
| Act-Two（表情/動作制御） | Act-Two | ✅ 実装済 | モーション動画参照 |
| アップスケール | Upscale V1 | ✅ 実装済 | HD/4K対応 |
| カメラワーク | プロンプト埋め込み | ✅ 実装済 | 手動選択可 |
| Motion Score | 固定値（3） | ⚠️ 要改善 | 調整不可 |

### 現在のコード（runway_provider.py）

```python
request_body = {
    "model": "gen4_turbo",
    "promptImage": image_url,
    "promptText": full_prompt,
    "duration": duration,
    "ratio": ratio,
    "motionScore": 3,  # 固定値
}
```

---

## 品質向上のための実装提案

### 優先度：高

| # | 施策 | 効果 | 実装難易度 | 工数目安 |
|---|------|------|-----------|---------|
| 1 | **Gen-4（非Turbo）モデル対応** | 最高品質の動画生成。Fidelity/Stability/Controllabilityが大幅向上 | 低 | 2時間 |
| 2 | **Keyframe（キーフレーム）対応** | First/Last/First+Last frameを指定し、シーン間の一貫性向上 | 中 | 4時間 |
| 3 | **Gen-4 Image References** | 1〜3枚の参照画像でキャラクター一貫性を確保（2ステップワークフロー） | 高 | 8時間 |

### 優先度：中

| # | 施策 | 効果 | 実装難易度 | 工数目安 |
|---|------|------|-----------|---------|
| 4 | **Motion Score調整UI** | シーンに応じて動きの強度を調整（現在固定値3） | 低 | 1時間 |
| 5 | **Duration 10秒対応** | 長いシーンの動きをより自然に | 低 | 1時間 |
| 6 | **高解像度入力画像** | 入力画像を高品質化（Flux等で事前生成） | 中 | 4時間 |
| 7 | **LUT/カラーグレーディング強化** | 映画的な色調補正オプション追加 | 中 | 3時間 |

### 優先度：低（将来対応）

| # | 施策 | 効果 | 備考 |
|---|------|------|------|
| 8 | **Seed値固定** | 再生成時の再現性向上 | API対応確認必要 |
| 9 | **ウォーターマーク除去** | 商用利用向け | 有料プラン必要 |
| 10 | **Gen-4.5対応** | 次世代モデル | API公開待ち |

---

## 詳細実装案

### 1. Gen-4モデル対応（最優先）

#### 概要
Gen-4 Turbo から Gen-4（非Turbo）への切り替えオプションを追加。
Gen-4は最高品質だが、クレジット消費が2.4倍（12 credits/sec vs 5 credits/sec）。

#### 品質比較

| 項目 | Gen-4 Turbo | Gen-4 |
|------|-------------|-------|
| Fidelity（鮮明度） | 高 | **最高** |
| Stability（安定性） | 高 | **最高** |
| Controllability（制御性） | 高 | **最高** |
| 生成速度 | 速い | 遅い |
| コスト | 5 credits/sec | 12 credits/sec |

#### 実装変更

**バックエンド（schemas.py）**
```python
class VideoQuality(str, Enum):
    """動画品質設定"""
    STANDARD = "standard"  # Gen-4 Turbo
    HIGH = "high"          # Gen-4
```

**バックエンド（runway_provider.py）**
```python
async def generate_video(
    self,
    image_url: str,
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    camera_work: Optional[str] = None,
    quality: str = "standard",  # 追加
) -> str:
    model = "gen4" if quality == "high" else "gen4_turbo"

    request_body = {
        "model": model,
        # ...
    }
```

**フロントエンド**
- 生成時に「高品質モード」チェックボックス追加
- クレジット消費量の表示

---

### 2. Keyframe対応

#### 概要
シーンの開始/終了フレームを指定し、シーン間の滑らかな接続を実現。

#### ユースケース
- **First frame**: 前シーンの最終フレームを指定 → シームレスな接続
- **Last frame**: 次シーンの開始フレームを指定 → 意図した構図で終了
- **First + Last**: 両方指定 → 完全な制御

#### 実装変更

**バックエンド（runway_provider.py）**
```python
async def generate_video(
    self,
    image_url: str,
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    camera_work: Optional[str] = None,
    first_frame_url: Optional[str] = None,  # 追加
    last_frame_url: Optional[str] = None,   # 追加
) -> str:
    request_body = {
        "model": "gen4_turbo",
        "promptImage": image_url,
        "promptText": full_prompt,
        "duration": duration,
        "ratio": ratio,
    }

    # Keyframe指定
    if first_frame_url:
        request_body["firstFrame"] = first_frame_url
    if last_frame_url:
        request_body["lastFrame"] = last_frame_url
```

**ワークフロー**
1. シーン1生成 → 最終フレーム抽出
2. シーン2生成時に `firstFrame` として渡す
3. シームレスな接続を実現

---

### 3. Gen-4 Image References

#### 概要
キャラクター/ロケーション/オブジェクトの一貫性を参照画像で確保。
**2ステップワークフロー**が必要（画像生成→動画生成）。

#### 制限事項
- Image References は **Gen-4 Image生成** でのみ使用可能
- I2V（Image-to-Video）APIでは直接使用不可
- 参照画像は最大3枚

#### 実装ワークフロー

```
[ユーザー画像] + [参照画像1-3枚]
        ↓
    Gen-4 Image生成（キャラクター一貫性確保）
        ↓
    生成された画像
        ↓
    Gen-4 I2V（動画生成）
        ↓
    最終動画
```

**バックエンド（新規メソッド）**
```python
async def generate_consistent_image(
    self,
    prompt: str,
    reference_images: list[str],  # 1-3枚
    aspect_ratio: str = "9:16",
) -> str:
    """
    参照画像を使用してキャラクター一貫性のある画像を生成
    """
    request_body = {
        "model": "gen4",
        "prompt": prompt,
        "referenceImages": [
            {"uri": url, "tag": f"ref{i}"}
            for i, url in enumerate(reference_images)
        ],
        "aspectRatio": aspect_ratio,
    }
    # ...
```

**UI設計**
1. ストーリーボード生成時に「キャラクター参照画像」をアップロード
2. 各シーンの画像生成時に自動的に参照
3. 結果：全シーンで同一キャラクター維持

---

### 4. Motion Score調整UI

#### 概要
動きの強度をユーザーが調整可能に。

| 値 | 動きの強度 | ユースケース |
|----|-----------|-------------|
| 0-2 | 非常に低い | 静止画に近い、瞑想シーン |
| 3-4 | 低い | 会話、静かなシーン |
| 5 | 標準 | 一般的なシーン |
| 6-7 | やや高い | アクション、動きのあるシーン |
| 8-10 | 高い | 激しいアクション |

#### 実装変更

**バックエンド（schemas.py）**
```python
class RegenerateVideoRequest(BaseModel):
    # ...
    motion_score: int = Field(3, ge=0, le=10, description="動きの強度（0-10）")
```

**フロントエンド**
- シーン編集モーダルにスライダー追加
- プレビュー時に効果を説明

---

## 推奨実装順序

```
Phase 1: 即効性のある改善（1-2日）
├── 1. Gen-4モデル対応（高品質オプション）
└── 4. Motion Score調整UI

Phase 2: シーン接続改善（2-3日）
└── 2. Keyframe対応

Phase 3: キャラクター一貫性（3-5日）
└── 3. Gen-4 Image References

Phase 4: その他の改善（随時）
├── 5. Duration 10秒対応
├── 6. 高解像度入力画像
└── 7. LUT/カラーグレーディング強化
```

---

## コスト試算

### 現在（Gen-4 Turbo使用時）
- 4シーン × 5秒 × 5 credits = **100 credits**

### Gen-4使用時
- 4シーン × 5秒 × 12 credits = **240 credits**

### Gen-4 Image References使用時（2ステップ）
- 画像生成: 4シーン × 5 credits = 20 credits
- 動画生成: 4シーン × 5秒 × 5 credits = 100 credits
- 合計: **120 credits**

---

## 参考資料

- [Runway API Documentation](https://docs.dev.runwayml.com/api/)
- [Creating with Gen-4 Video](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video)
- [Creating with Gen-4 Image References](https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References)
- [Runway Gen-4 vs Gen-3 Alpha Comparison 2025](https://apatero.com/blog/runway-gen-4-vs-gen-3-alpha-comparison-2025)

---

## 更新履歴

| 日付 | 更新内容 |
|------|---------|
| 2026-01-02 | 初版作成 |
| 2026-01-02 | **プロンプト改善実装完了**: IDENTITY_PRESERVATION_PREFIX有効化、QUALITY_SUFFIX追加、motionScore削除、テンプレート更新 |
