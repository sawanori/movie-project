# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**movie-maker-api** is the FastAPI backend for the movie-maker application. It handles video generation using KlingAI, prompt optimization with OpenAI, and video post-processing with FFmpeg.

## Development Commands

```bash
# Setup virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --port 8000

# Run tests
pytest

# Run single test file
pytest tests/videos/test_router.py -v
```

## Tech Stack

- **Framework**: FastAPI
- **Python**: 3.11+
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloudflare R2 (S3-compatible)
- **AI**: OpenAI GPT-4, KlingAI
- **Video Processing**: FFmpeg

## Project Structure (Domain-Based)

```
movie-maker-api/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── core/                # 共通設定
│   │   ├── config.py        # 環境変数 (Settings)
│   │   └── dependencies.py  # 共通Dependencies (認証等)
│   │
│   ├── auth/                # 認証ドメイン
│   │   ├── router.py        # GET /api/v1/auth/me
│   │   └── schemas.py       # UserResponse
│   │
│   ├── videos/              # 動画生成ドメイン
│   │   ├── router.py        # POST/GET /api/v1/videos
│   │   ├── service.py       # ビジネスロジック
│   │   └── schemas.py       # VideoCreate, VideoResponse
│   │
│   ├── templates/           # テンプレート・BGMドメイン
│   │   ├── router.py        # GET /api/v1/templates
│   │   └── schemas.py       # TemplateResponse, BGMResponse
│   │
│   └── external/            # 外部API連携
│       ├── openai_client.py # プロンプト最適化
│       ├── kling.py         # KlingAI動画生成
│       └── r2.py            # Cloudflare R2ストレージ
│
├── tests/                   # ドメイン別テスト
│   ├── auth/
│   ├── videos/
│   └── templates/
├── requirements.txt
└── .env.example
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | ヘルスチェック |
| GET | `/api/v1/auth/me` | 現在のユーザー情報 |
| POST | `/api/v1/videos` | 動画生成リクエスト |
| GET | `/api/v1/videos` | 生成履歴一覧 |
| GET | `/api/v1/videos/{id}` | 動画詳細 |
| GET | `/api/v1/templates` | テンプレート一覧 |
| GET | `/api/v1/templates/bgm` | BGM一覧 |

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:
- `SUPABASE_URL`, `SUPABASE_KEY` - Database connection
- `R2_*` - Cloudflare R2 storage credentials
- `OPENAI_API_KEY` - For prompt optimization
- `KLING_API_KEY` - For video generation

## Documentation

See `../docs/` for full project specifications (Japanese):
- `../docs/plan.md` - API design, DB schema
- `../docs/workbook.md` - Development tickets (BE-001 to BE-015)
- `../docs/best-practices.md` - FastAPI/Next.js ベストプラクティス
