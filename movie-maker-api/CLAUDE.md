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
```

## Tech Stack

- **Framework**: FastAPI
- **Python**: 3.11+
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloudflare R2 (S3-compatible)
- **AI**: OpenAI GPT-4, KlingAI
- **Video Processing**: FFmpeg

## Project Structure

```
movie-maker-api/
├── app/
│   ├── main.py          # FastAPI app entry point
│   ├── core/            # Config, security, dependencies
│   ├── routers/         # API route handlers
│   ├── services/        # Business logic (KlingAI, OpenAI, FFmpeg)
│   ├── models/          # Database models
│   └── schemas/         # Pydantic schemas for request/response
├── tests/               # Test files
├── requirements.txt     # Python dependencies
└── .env                 # Environment variables (create from .env.example)
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Required:
- `SUPABASE_URL`, `SUPABASE_KEY` - Database connection
- `R2_*` - Cloudflare R2 storage credentials
- `OPENAI_API_KEY` - For prompt optimization
- `KLING_API_KEY` - For video generation

## Documentation

See `../docs/` for full project specifications (Japanese):
- `../docs/plan.md` - API design, DB schema
- `../docs/workbook.md` - Development tickets (BE-001 to BE-015)
