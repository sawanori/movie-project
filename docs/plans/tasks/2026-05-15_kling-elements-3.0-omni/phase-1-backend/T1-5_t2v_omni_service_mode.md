---
id: T1-5
phase: 1
title: 3.0 Omni T2V 経路に config.service_mode 追加
depends_on:
  - T1-3
estimated_effort: S
files_touched:
  - movie-maker-api/app/external/piapi_kling_provider.py
---

## 目的

`generate_video_from_text` メソッドの 3.0 Omni 経路 (L265-277) に `config: {"service_mode": "public"}` を追加する。  
T2V には画像参照がないため `@image_i` 付加は不要だが、公式サンプル形式の統一のため `service_mode` のみ追加する。

Design Doc §6-2 の Note「B1 解決」と同 §8-2「実装上の保証」に基づく。

## 前提

- T1-3 完了済み (T2V 経路では `_inject_image_references_into_prompt` を呼ばない — 画像なし)
- T1-4 と並行して実装可能 (変更箇所が異なる: T1-4 は L376-407、本タスクは L265-277)
- 変更範囲は **`if self.version.startswith("3"):` ブランチの内側のみ**。L278 以降の else ブランチには触れない

## 変更内容

`generate_video_from_text` の 3.0 ブランチ (L265-277) を修正する。

```python
# 修正前 (L265-277)
if self.version.startswith("3"):
    request_body = {
        "model": "kling",
        "task_type": "omni_video_generation",
        "input": {
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "version": "3.0",
            "resolution": self.resolution,
            "enable_audio": self.enable_audio,
        }
    }

# 修正後
if self.version.startswith("3"):
    request_body = {
        "model": "kling",
        "task_type": "omni_video_generation",
        "input": {
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "version": "3.0",
            "resolution": self.resolution,
            "enable_audio": self.enable_audio,
        },
        # ▼ NEW: 公式サンプルに合わせ service_mode を明示 (Design Doc §6-2)
        "config": {
            "service_mode": "public",
        },
    }
```

変更行数: 3 行追加 (`"config": {` + `"service_mode": "public",` + `},`)。

## 完了条件 (AC)

- [x] `grep -n "service_mode" movie-maker-api/app/external/piapi_kling_provider.py` で T2V 経路 (L265-290 付近) にも `service_mode` が確認できる
- [x] T2V の else ブランチ (L278 以降) に変更がないこと: `git diff HEAD` で L278- の変更がないことを確認
- [x] `pytest movie-maker-api/` が新たに失敗しない
- [x] `grep -n "service_mode" movie-maker-api/app/external/piapi_kling_provider.py | wc -l` で 2 件以上 (I2V 経路 + T2V 経路) になること (T1-4 完了後に確認)

## テスト

正式テストは T1-7 の `test_generate_video_from_text_omni_includes_service_mode` で実施。

```bash
cd movie-maker-api
pytest -q --tb=short 2>&1 | tail -10
```

## ロールバック

```bash
git revert HEAD
```

## 参照

- Design Doc §6-2: Note「B1 解決: `generate_video_from_text` への適用も検討」
- Design Doc §10-1-3: `test_generate_video_from_text_omni_includes_service_mode` テスト仕様
- `movie-maker-api/app/external/piapi_kling_provider.py` L265-290 (`generate_video_from_text` 3.0 ブランチ)
