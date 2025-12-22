# Gemini 作業指示書

## プロジェクト概要

**movie-maker** は、ユーザーがアップロードした画像とテキストプロンプトを基に、AI（KlingAI）を活用して5秒間の縦型ショート動画を生成する Web アプリケーションです。

## リポジトリ構成

```
movie-project/
├── movie-maker/          # Next.js フロントエンド
├── movie-maker-api/      # FastAPI バックエンド
└── docs/                 # ドキュメント
    ├── requirements.md   # 総合計画書（プロダクト概要、課金戦略）
    ├── plan.md           # 開発計画書（技術仕様、DB設計、API設計）
    ├── progress.md       # 進捗ダッシュボード
    ├── workbook.md       # 詳細作業チケット（46タスク）
    └── best-practices.md # FastAPI/Next.js ベストプラクティス
```

## 技術スタック

| カテゴリ | 選択 | 備考 |
|:---|:---|:---|
| **フロントエンド** | Next.js 16 + React 19 + TypeScript | App Router 使用 |
| **スタイリング** | Tailwind CSS v4 + shadcn/ui | モダンなUIコンポーネント |
| **バックエンド** | FastAPI (Python 3.11+) | ドメインベースアーキテクチャ |
| **データベース** | Supabase (PostgreSQL) | 無料プランからスタート |
| **認証** | Supabase Auth | Google OAuth のみ |
| **ストレージ** | Cloudflare R2 | 画像・動画の保存 |
| **決済** | Polar | サブスクリプション管理 |
| **動画生成AI** | KlingAI API | Image-to-Video |
| **プロンプト最適化** | OpenAI API (GPT-4) | プロンプト拡張 |
| **動画後処理** | FFmpeg | テキスト・BGM合成 |
| **デプロイ (Frontend)** | Vercel | 自動デプロイ |
| **デプロイ (Backend)** | Railway | FastAPI ホスティング |

## 現在の進捗状況

**進捗率: 0%** - プロジェクト構造のみ作成済み

- 全46タスク中、0タスク完了
- バックエンド: ドメインベースのディレクトリ構造のみ作成済み
- フロントエンド: create-next-app でスキャフォルド済み

## 開発タスク一覧

### Phase 1: 事前準備（並列可能）
- INFRA-001: Supabase プロジェクト作成
- INFRA-003: Cloudflare R2 設定
- INFRA-005: Railway プロジェクト作成
- CONT-001: テンプレートプロンプト作成
- CONT-002: BGM ファイル準備
- CONT-003: フォント準備

### Phase 2: インフラ完了（順次）
- INFRA-002: Supabase Auth 設定
- INFRA-004: データベーステーブル作成
- INFRA-006: 環境変数設定

### Phase 3: バックエンド基盤（順次）
- BE-001: FastAPI プロジェクト初期化
- BE-002: Supabase クライアント実装
- BE-003: 認証ミドルウェア実装
- BE-015: エラーハンドリング・ログ設定

### Phase 4: バックエンド API（並列可能）
- BE-004: テンプレート API
- BE-005: BGM API
- BE-006: 画像アップロード API
- BE-007: プロンプト最適化サービス
- BE-008: KlingAI 連携サービス
- BE-009: FFmpeg 後処理サービス
- BE-010: 動画生成 API
- BE-011: 生成履歴 API
- BE-012: 使用量 API
- BE-013: Polar Webhook 処理
- BE-014: ダウンロード API

### Phase 5: フロントエンド基盤（順次）
- FE-001: shadcn/ui セットアップ
- FE-002: Supabase クライアント設定
- FE-003: 認証コンテキスト実装
- FE-004: API クライアント実装
- FE-005: 共通レイアウト作成

### Phase 6: フロントエンド画面（並列可能）
- FE-006: ランディングページ
- FE-007: ログインページ
- FE-008: ダッシュボード
- FE-009: 動画生成ページ
- FE-010: テンプレート選択
- FE-011: 画像アップローダー
- FE-012: プロンプト入力フォーム
- FE-013: スタイル選択
- FE-014: 生成待機画面
- FE-015: 動画プレビュー
- FE-016: 生成履歴ページ
- FE-017: 料金プランページ
- FE-018: マイページ

### Phase 7: テスト・デプロイ（順次）
- TEST-001: バックエンドテスト
- TEST-002: フロントエンドテスト
- TEST-003: E2E テスト
- TEST-004: 本番デプロイ

## Gemini への作業依頼

以下のタスクを優先的に実装してください：

### 1. バックエンド API 実装 (BE-001 ~ BE-015)

#### 開発環境セットアップ
```bash
cd movie-maker-api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### バックエンド構造
```
movie-maker-api/
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── core/
│   │   ├── config.py        # 環境変数 (Settings)
│   │   └── dependencies.py  # 共通Dependencies
│   ├── auth/                # 認証ドメイン
│   │   ├── router.py
│   │   └── schemas.py
│   ├── videos/              # 動画生成ドメイン
│   │   ├── router.py
│   │   ├── service.py
│   │   └── schemas.py
│   ├── templates/           # テンプレートドメイン
│   │   ├── router.py
│   │   └── schemas.py
│   └── external/            # 外部API
│       ├── openai_client.py
│       ├── kling.py
│       └── r2.py
└── tests/
```

#### API エンドポイント
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | ヘルスチェック |
| GET | `/api/v1/auth/me` | 現在のユーザー情報 |
| POST | `/api/v1/videos` | 動画生成リクエスト |
| GET | `/api/v1/videos` | 生成履歴一覧 |
| GET | `/api/v1/videos/{id}` | 動画詳細 |
| GET | `/api/v1/templates` | テンプレート一覧 |
| GET | `/api/v1/templates/bgm` | BGM一覧 |

### 2. フロントエンド実装 (FE-001 ~ FE-018)

#### 開発環境セットアップ
```bash
cd movie-maker
npm install
npm run dev
```

#### ページ構成
```
/                       # ランディングページ（未認証）
/login                  # ログインページ（Google OAuth）
/dashboard              # ダッシュボード（認証後のホーム）
/generate               # 動画生成ページ（メイン機能）
/generate/[id]          # 生成進捗・結果表示ページ
/history                # 生成履歴一覧
/pricing                # 料金プラン
/settings               # ユーザー設定
```

## 作業上の注意事項

### 1. ドキュメント参照
- **必ず最初に `docs/` ディレクトリのドキュメントを読んでください**
- 特に `docs/plan.md` にはDB設計、API設計の詳細があります
- `docs/workbook.md` には各タスクの詳細な仕様があります

### 2. コーディング規約
- **TypeScript**: strict mode 有効
- **Python**: PEP 8 準拠、型ヒント必須
- **コメント/ドキュメント**: 日本語可

### 3. 進捗報告
- タスク完了時は `docs/progress.md` を更新してください
- 状態アイコン: ⬜未着手 → 🔄進行中 → ✅完了

### 4. セキュリティ
- API キーなどの秘密情報は `.env` ファイルに保存
- `.env` は絶対に git にコミットしない
- Supabase RLS を必ず設定する

### 5. テスト
- 各機能実装後は pytest / Jest でテストを作成
- テストなしの PR はマージ不可

## 環境変数 (.env)

### Backend (.env.example)
```
# Supabase
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# OpenAI
OPENAI_API_KEY=

# KlingAI
KLING_API_KEY=
KLING_API_SECRET=

# Polar
POLAR_API_KEY=
POLAR_WEBHOOK_SECRET=

# App
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## データベース設計 (Supabase)

主要テーブル:
- `users` - ユーザー情報
- `templates` - 動画テンプレート
- `video_generations` - 動画生成リクエスト
- `bgm_tracks` - BGMトラック
- `usage_logs` - 使用履歴

詳細なスキーマは `docs/plan.md` セクション3を参照してください。

## コマンドリファレンス

### Backend
```bash
# 開発サーバー起動
uvicorn app.main:app --reload --port 8000

# テスト実行
pytest

# 特定のテストファイル
pytest tests/videos/test_router.py -v
```

### Frontend
```bash
# 開発サーバー起動
npm run dev

# Turbopack で高速起動
npm run dev -- --turbo

# ビルド
npm run build

# Lint
npm run lint
```

## 質問・不明点

作業中に不明点があれば、以下のドキュメントを参照してください:
1. `docs/requirements.md` - プロダクト要件
2. `docs/plan.md` - 技術仕様
3. `docs/workbook.md` - 詳細タスク
4. `docs/best-practices.md` - ベストプラクティス
5. `movie-maker-api/CLAUDE.md` - バックエンド固有の情報
6. `movie-maker/CLAUDE.md` - フロントエンド固有の情報

---

**作成日:** 2025-12-21
**更新者:** Claude Code
