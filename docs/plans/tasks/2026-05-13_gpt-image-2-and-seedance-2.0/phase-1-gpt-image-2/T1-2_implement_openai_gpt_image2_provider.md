---
id: T1-2
phase: 1
title: openai_gpt_image2_provider.py 新規実装
depends_on:
  - T1-1
estimated_effort: M
files_touched:
  - movie-maker-api/app/external/openai_gpt_image2_provider.py
---

## 目的

`OpenAIGPTImage2Provider` クラスを新規作成する。OpenAI `gpt-image-2` モデルで画像生成し、base64 レスポンスを R2 にアップロードして公開 URL を返す。

## 前提

- T1-1 完了 (`OPENAI_IMAGE_MODEL` が `settings` に存在する)
- `movie-maker-api/app/external/r2.py` の `upload_image(bytes, key)` 関数が利用可能
- `movie-maker-api/app/external/bfl_flux2_provider.py` を参照パターンとして確認すること
- OpenAI Python SDK (`openai`) が `requirements.txt` に含まれること

## 変更内容

新規ファイル `movie-maker-api/app/external/openai_gpt_image2_provider.py` を作成する。

Design Doc §3.1 のクラス骨子を実装する。主要実装ポイント:

**`generate_image()` メソッド本体:**
```python
import base64
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=self.api_key)
resolved_size = self._resolve_size(aspect_ratio, size)
response = await client.images.generate(
    model=self.model,
    prompt=prompt,
    n=n,
    size=resolved_size,
    quality=quality,
    response_format="b64_json",
    output_format=output_format,
)
b64 = response.data[0].b64_json
image_bytes = base64.b64decode(b64)
return await self._upload_to_r2(image_bytes, output_format)
```

**`_upload_to_r2()` メソッド本体:**
```python
from app.external.r2 import upload_image

key = f"generated/gpt2_{uuid4().hex}.{output_format}"
await upload_image(image_bytes, key)
from app.core.config import settings
return f"{settings.R2_PUBLIC_URL}/{key}"
```

**エラーハンドリング (`generate_image` の except ブロック):**

Design Doc §3.1 エラーマッピングテーブルを実装:

| 捕捉する例外 | raiseする ValueError メッセージ |
|---|---|
| `openai.PermissionDeniedError` (HTTP 403) | `"OpenAI の組織確認が完了していません。OpenAI ダッシュボードで Org Verification を完了してください。"` |
| `openai.BadRequestError` + `"content_policy_violation"` in error code | `"画像の生成がコンテンツポリシーにより拒否されました。プロンプトを変更して再試行してください。"` |
| `openai.RateLimitError` | `"OpenAI API のレート制限に達しました。しばらく待ってから再試行してください。"` |
| `openai.APIStatusError` (その他) | `f"GPT Image 2 API エラー: {e.status_code}"` |
| その他 `Exception` | `f"画像生成に失敗しました: {str(e)}"` |

**`_resolve_size()` は Design Doc §3.1 のスケルトンをそのまま実装する (ロジック確定済み)。**

`SUPPORTED_SIZES` と `ASPECT_RATIO_TO_SIZE` 定数はスケルトン通り定義する。

## 完了条件 (AC)

- [ ] `movie-maker-api/app/external/openai_gpt_image2_provider.py` が存在する
- [ ] `OpenAIGPTImage2Provider` クラスが import できる
- [ ] `generate_image()` が `AsyncOpenAI` を呼び出し、b64_json をデコードして `upload_image` に渡す
- [ ] `_resolve_size("9:16", None)` が `"1024x1536"` を返す
- [ ] `PermissionDeniedError` を受けると `ValueError` に `"Org Verification"` が含まれる
- [ ] `BadRequestError(content_policy_violation)` を受けると `ValueError` に `"コンテンツポリシー"` が含まれる
- [ ] `pytest` 既存テストが全て PASS する (既知の 2 件失敗を除く)

## テスト

テストは T1-4 で追加。このタスクでは T1-4 が実行できるだけの実装を完成させる。

TDD サイクル: T1-4 のテストを先に書き (RED)、本タスクの実装で GREEN にする。

## ロールバック

`movie-maker-api/app/external/openai_gpt_image2_provider.py` を削除する。他ファイルへの変更なし。

## 参照

- Design Doc §3.1 (クラス骨子、エラーマッピングテーブル)
- Design Doc §6.1 (GPT Image 2 エラーパターン)
- `movie-maker-api/app/external/bfl_flux2_provider.py` (R2 アップロード参照パターン)
- `movie-maker-api/app/external/r2.py` (`upload_image` シグネチャ確認)
