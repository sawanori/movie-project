---
id: T2-B-1
step: 2
node: B
title: "BE: POST /api/v1/videos/trim 同期エンドポイント実装 + Pydantic スキーマ + 単体テスト"
depends_on: [T1-common-1]
estimated_effort: M
files_touched:
  - movie-maker-api/app/videos/router.py
  - movie-maker-api/app/videos/schemas.py
  - movie-maker-api/tests/videos/test_trim_video.py (新規)
---

## 目的

動画 URL と `start_seconds` / `end_seconds` を受け取り、トリム済み動画の URL を返す **同期 API** を実装する。FE の `TrimVideoNode` が呼び出す。

## 前提

- Design Doc §6.1〜§6.2 に準拠。
- 既存 FFmpeg 実装: `ffmpeg_service.trim_video(input_path, output_path, start_time, end_time)` — `movie-maker-api/app/services/ffmpeg_service.py` L1046
- L1081 の `end_seconds - start_seconds >= 0.5` バリデーションに準拠
- L1083 で `end_seconds > duration` の場合は動画長に丸める実装に準拠 (BE 側で吸収するため FE で動画長チェック不要)
- 同期処理 (FastAPI デフォルト 60s 以内) で完了する想定 (3〜10 秒)

## 変更内容

### 1. Pydantic スキーマ追加 (`movie-maker-api/app/videos/schemas.py`)

Design Doc §6.2 のシグネチャに準拠:

```python
from typing import Self
from pydantic import BaseModel, Field, model_validator

class TrimVideoRequest(BaseModel):
    video_url: str
    start_seconds: float = Field(ge=0.0, description="開始位置（秒）")
    end_seconds: float | None = Field(None, ge=0.0, description="終了位置（秒）、Noneで最後まで")

    @model_validator(mode='after')
    def validate_range(self) -> Self:
        # end_seconds が None でなければ start < end を検証
        if self.end_seconds is not None and self.end_seconds <= self.start_seconds:
            raise ValueError('end_seconds は start_seconds より大きい必要があります')
        # トリム範囲 >= 0.5 秒を検証 (ffmpeg_service L1081 に準拠)
        if self.end_seconds is not None and (self.end_seconds - self.start_seconds) < 0.5:
            raise ValueError('トリム範囲は 0.5 秒以上必要です')
        return self

class TrimVideoResponse(BaseModel):
    output_video_url: str
```

### 2. ルーター追加 (`movie-maker-api/app/videos/router.py`)

```python
@router.post("/trim", response_model=TrimVideoResponse)
async def trim_video(
    request: TrimVideoRequest,
    current_user = Depends(get_current_user),
) -> TrimVideoResponse:
    # 1. video_url から動画を tmpfile にダウンロード
    # 2. ffmpeg_service.trim_video(tmp_path, out_path, request.start_seconds, request.end_seconds)
    #    - end_seconds が None の場合の扱いは ffmpeg_service の仕様に従う (動画長に丸め)
    # 3. 生成された動画を R2 にアップロード
    # 4. TrimVideoResponse(output_video_url=...) を返す
    ...
```

**エラー処理**:
- 動画ダウンロード失敗 → エラーレスポンス
- FFmpeg 失敗 → エラーレスポンス + 「動画のトリムに失敗しました」
- 必ず tmpfile を finally で削除

### 3. 単体テスト (`movie-maker-api/tests/videos/test_trim_video.py` 新規)

Design Doc §10.3 に準拠。境界値テスト中心:

| テストケース | 確認内容 |
|-------------|---------|
| start=0, end=5 で正常 | `ffmpeg_service.trim_video` が呼ばれ 200 + `output_video_url` が返る |
| start=2.5, end=8.0 で正常 | float 値が正しく渡される |
| end=null で実行 | `ffmpeg_service.trim_video` に end=None が渡される (動画長に丸めは ffmpeg_service の責務) |
| start=5, end=3 (start > end) | 422 (Pydantic validation error) |
| start=5, end=5 (start == end) | 422 |
| start=0, end=0.3 (範囲 < 0.5s) | 422 |
| start=-1 (負値) | 422 (ge=0.0 違反) |
| 動画ダウンロード失敗 | エラーステータス + メッセージ |
| FFmpeg 失敗 | エラーステータス + 「動画のトリムに失敗しました」 |
| 認証なし | 401 |

## 完了条件 (AC)

- [x] `TrimVideoRequest` / `TrimVideoResponse` が `schemas.py` に追加されている (`grep -n "class TrimVideoRequest\|class TrimVideoResponse" movie-maker-api/app/videos/schemas.py` で 2 件ヒット)
- [x] `TrimVideoRequest.validate_range` model_validator が start < end と範囲 >= 0.5s の両方を検証
- [x] `/trim` エンドポイントが `router.py` に追加されている (`grep -n "/trim" movie-maker-api/app/videos/router.py` でヒット)
- [x] `test_trim_video.py` に 8 件以上のテストが含まれ、すべて pass (`cd movie-maker-api && pytest tests/videos/test_trim_video.py -v`)
- [x] 境界値テスト (start=end, range<0.5, 負値, start>end) がすべてカバーされている
- [x] 既存テスト (`pytest tests/videos/`) が壊れていない
- [x] `ruff check` が clean (新規ファイルのみ。router.py の既存 F401/F841 は事前から存在)
- [x] tmpfile が finally で確実に削除される (リソースリーク防止)

## テスト

- 単体テスト: 上記 10 ケース最低 (TDD: 失敗テスト → 実装 → green)
- 結合テスト: T3-1 で実 R2 と接続して FE から動作確認

## ロールバック

- `router.py` / `schemas.py` の追加分のみ `git revert` で元に戻せる。
- `test_trim_video.py` は新規ファイルなので削除のみで完了。

## 参照

- Design Doc §6.1 詳細仕様 — `/Users/noritakasawada/AI_P/practice/movie-project/docs/plans/2026-05-14_utility-nodes-mvp.md` 行 683-690
- Design Doc §6.2 BE API: POST /api/v1/videos/trim — 行 691-740 (バリデーション仕様含む)
- Design Doc §6.4 バリデーション設計 — 行 853-861
- Design Doc §10.3 BE 単体テスト — 行 1321-1325
- 既存実装: `movie-maker-api/app/services/ffmpeg_service.py` L1046 (`trim_video`), L1081 (範囲チェック), L1083 (動画長丸め)
