# OpenAI → Google Gemini 移行作業書

## 概要

プロンプト最適化機能で使用しているAI APIを、OpenAI (GPT-4) から Google Gemini に移行する。
また、将来的な画像生成機能のために Nano Banana モデルも利用可能にする。

---

## 使用するモデル

| 用途 | モデルID | 名称 | 特徴 |
|------|----------|------|------|
| テキスト生成 | `gemini-3-flash-preview` | Gemini 3 Flash | 高速・コスト効率・高品質 |
| 画像生成 | `gemini-3-pro-image-preview` | Nano Banana Pro | 高精度・思考モード搭載・高忠実度テキストレンダリング |

> **決定事項**
> - プロンプト最適化: `gemini-3-flash-preview`
> - 画像生成: `gemini-3-pro-image-preview` (Nano Banana Pro)

---

## 現状 (Before)

| 項目 | 値 |
|------|-----|
| 使用API | OpenAI Chat Completions API |
| モデル | gpt-4 |
| ライブラリ | openai (Python) |
| 環境変数 | `OPENAI_API_KEY` |
| ファイル | `app/external/openai_client.py` |

### 現在の使用箇所

```
movie-maker-api/
├── app/
│   ├── core/config.py          # OPENAI_API_KEY 設定
│   ├── external/openai_client.py  # optimize_prompt() 関数
│   └── videos/service.py       # optimize_prompt をインポート
├── requirements.txt            # openai パッケージ
└── .env                        # OPENAI_API_KEY
```

---

## 目標 (After)

| 項目 | 値 |
|------|-----|
| 使用API | Google Gemini API |
| テキストモデル | `gemini-3-flash-preview` |
| 画像モデル | `gemini-3-pro-image-preview` (Nano Banana Pro) |
| ライブラリ | google-genai (Python) |
| 環境変数 | `GOOGLE_API_KEY` |
| ファイル | `app/external/gemini_client.py` (新規作成) |

---

## 料金比較

### テキスト生成

| API | モデル | 入力 (1M tokens) | 出力 (1M tokens) |
|-----|--------|-----------------|------------------|
| OpenAI | gpt-4 | $30.00 | $60.00 |
| Google | gemini-3-flash-preview | $0.50 | $3.00 |
| Google | gemini-3-pro-preview | $2.00〜$4.00 | $12.00〜$18.00 |

> **Gemini 3 Flash は GPT-4 の約60分の1のコスト**

### 画像生成 (Nano Banana)

| モデル | 料金 |
|--------|------|
| gemini-2.5-flash-image | $0.02 / 画像 |
| gemini-3-pro-image-preview | $0.04 / 画像 |

---

## 作業一覧

### 生成AIが実施する作業

| # | 作業内容 | 対象ファイル | 備考 |
|---|---------|-------------|------|
| 1 | Geminiクライアント作成 | `app/external/gemini_client.py` | テキスト+画像生成両対応 |
| 2 | 設定クラス更新 | `app/core/config.py` | GOOGLE_API_KEY追加 |
| 3 | requirements.txt更新 | `requirements.txt` | google-genai, Pillow追加 |
| 4 | サービス層の参照更新 | `app/videos/service.py` | import先変更 |
| 5 | .env.example更新 | `.env.example` | GOOGLE_API_KEY追加 |
| 6 | 旧ファイル削除/リネーム | `app/external/openai_client.py` | 必要に応じて |
| 7 | テストコード更新 | `tests/` | モック対象変更 |

### 手動で実施する作業 (ユーザー)

| # | 作業内容 | 手順 | 備考 |
|---|---------|------|------|
| 1 | Google AI Studio でAPI Key取得 | [Google AI Studio](https://aistudio.google.com/) にアクセス | 最も簡単な方法 |
| 2 | .env ファイル更新 | `GOOGLE_API_KEY=取得したキー` を追記 | |
| 3 | 依存関係インストール | `pip install -r requirements.txt` | 新しいパッケージを追加後 |
| 4 | 動作確認テスト | 動画生成フローをE2Eテスト | |

---

## 詳細手順

### 手動作業1: Google AI Studio でAPI Key取得

**これが最も簡単な方法です**

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. Googleアカウントでログイン
3. 左メニュー「Get API key」をクリック
4. 「Create API key」をクリック
5. 生成されたキーをコピー（`AIzaSy...` で始まる）

> **注意**: API Keyは一度しか表示されないため、必ずコピーして保存してください
> **1つのAPI Keyで全モデル（Gemini 3 + Nano Banana）が利用可能**

### 手動作業2: .env ファイル更新

```bash
# movie-maker-api/.env

# 以下を追加
GOOGLE_API_KEY=AIzaSy...（取得したキー）

# 以下は削除または残しておいても可（ロールバック用）
# OPENAI_API_KEY=sk-...
```

### 手動作業3: 依存関係インストール

```bash
cd movie-maker-api
source venv/bin/activate
pip install -r requirements.txt
```

### 手動作業4: 動作確認テスト

```bash
# バックエンドサーバー起動
make dev

# フロントエンドから動画生成フローをテスト
# 1. 画像アップロード
# 2. プロンプト入力
# 3. 生成開始
# 4. ログでプロンプト最適化結果を確認
```

---

## Gemini SDK 使用例

### テキスト生成 (Gemini 3 Flash)

```python
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")

# プロンプト最適化
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents="ユーザーの入力プロンプト",
)

print(response.text)
```

### 画像生成 (Nano Banana Pro)

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client(api_key="YOUR_API_KEY")

# 思考モードで高品質画像生成
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents="プロフェッショナルな製品写真: 高級腕時計",
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(
            thinking_level="high"
        )
    )
)

# 画像を取得
for part in response.parts:
    if part.inline_data:
        image = part.as_image()
        image.save("output.png")
```

---

## 将来的な活用案

Nano Banana Pro (`gemini-3-pro-image-preview`) を使用した機能拡張の可能性：

| 機能 | 説明 |
|------|------|
| サムネイル自動生成 | 動画のサムネイルを自動生成 |
| プレビュー画像生成 | 動画生成前のプレビュー |
| テキストオーバーレイ画像 | 高忠実度テキスト付き画像 |
| 背景画像生成 | 動画の背景素材生成 |

---

## ロールバック手順

万が一問題が発生した場合：

1. `app/videos/service.py` のimportを `openai_client` に戻す
2. `.env` の `OPENAI_API_KEY` を有効化
3. サーバー再起動

---

## チェックリスト

### 移行前
- [ ] Google AI Studio でAPI Key取得済み

### 移行作業（生成AI実施）
- [ ] gemini_client.py 作成（テキスト+画像生成対応）
- [ ] config.py 更新
- [ ] requirements.txt 更新（google-genai, Pillow）
- [ ] service.py 更新
- [ ] .env.example 更新

### 移行作業（手動）
- [ ] .env に GOOGLE_API_KEY 追記
- [ ] 依存関係インストール

### 移行後テスト
- [ ] バックエンドサーバー起動確認
- [ ] プロンプト最適化API動作確認（Gemini 3）
- [ ] 画像生成テスト（Nano Banana）※オプション
- [ ] 動画生成E2Eテスト
- [ ] エラーハンドリング確認

---

## 参考リンク

- [Gemini 3 公式ドキュメント](https://ai.google.dev/gemini-api/docs/gemini-3?hl=ja)
- [Nano Banana（画像生成）ドキュメント](https://ai.google.dev/gemini-api/docs/nanobanana?hl=ja)
- [Google AI Studio](https://aistudio.google.com/)
- [Python SDK - google-genai](https://pypi.org/project/google-genai/)
