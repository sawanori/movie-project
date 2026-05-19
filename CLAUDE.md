# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This is a monorepo for **movie-maker**, an AI video generation web app (originally 5-second vertical shorts; now expanded to multi-provider video generation, storyboards, TTS, lip-sync, BGM, upscaling, concatenation, and Seedance 2.0 omni_reference (video/audio/image references with @-syntax)).

```
movie-project/
├── movie-maker/         # Next.js 16 + React 19 frontend (Vercel)
├── movie-maker-api/     # FastAPI + Python 3.11+ backend (Railway)
├── mobile/              # Expo / React Native app (separate product: メシプロAI)
├── docs/                # Specs, plans, migrations
│   ├── migrations/      # Supabase SQL migrations (see "Supabase Migrations" below)
│   ├── plans/           # Per-feature work plans + decomposed tasks
│   ├── plan.md          # DB schema, API design
│   ├── requirements.md  # Product / pricing
│   └── workbook.md      # Ticket-level specs
└── LOCAL_SETUP.md       # End-to-end local setup
```

Each subproject has its own `CLAUDE.md` with project-local detail — read it first when working inside that subdirectory.

## Common Commands

### Backend (`movie-maker-api/`)

```bash
make install            # Create venv and install requirements
make dev                # uvicorn app.main:app --reload --port 8000
make test               # pytest (config in pytest.ini, asyncio_mode=auto)
pytest tests/videos/test_router.py::test_name -v   # single test
docker-compose up --build                          # Docker path
```

Swagger UI: http://localhost:8000/docs · Health: `/health`

### Frontend (`movie-maker/`)

```bash
npm run dev             # Next dev server on :3000 (auto-clears .next via predev)
npm run build           # Production build
npm run lint            # ESLint 9 flat config
npm run test            # Vitest (jsdom)
npm run test:watch
npm run test:e2e        # Playwright (auto-starts dev:test with NEXT_PUBLIC_E2E_TEST_MODE)
npm run test:e2e:ui
npm run free:3000       # Kill stuck process on :3000
```

E2E tests inject dummy Supabase env vars via `playwright.config.ts` — do not require real credentials for E2E.

## High-Level Architecture

**Frontend ↔ Backend** are deployed independently and communicate over REST. The frontend uses Supabase directly for auth (Google OAuth) and reads/writes some user-owned tables; the backend uses Supabase service-role for privileged ops and orchestrates all external AI providers.

**Backend (`movie-maker-api/app/`) — domain-based layout**:
- `main.py` mounts routers under `/api/v1`: `auth`, `videos`, `templates`, `library`, `workflows`, `webhooks` (Polar + Suno), `tts`, `lip_sync`. CORS is wide-open when `DEBUG=True`.
- `core/` — `config.py` (Pydantic Settings, env-driven; lists every provider key) and shared dependencies.
- Domain folders (`videos/`, `auth/`, `templates/`, `library/`, `workflows/`, `tts/`, `lip_sync/`, `concat/`, `dashboard/`, `generate/`, `webhooks/`) each contain `router.py` + `service.py` + `schemas.py`.
- `external/` — **provider abstraction layer**. `video_provider.py` defines `VideoProviderInterface` (`generate_video`, `check_status`); concrete implementations live alongside (`runway_provider.py`, `veo_provider.py`, `piapi_kling_provider.py`, `hailuo_provider.py`, `domoai_provider.py`). Same pattern for `tts_provider.py` (ElevenLabs / OpenAI TTS) and `lip_sync_provider.py` (Hedra). `unified_gateway.py` + `model_registry.py` provide a higher-level routing layer gated by `GATEWAY_ENABLED`. The active provider is selected via `settings.VIDEO_PROVIDER` (`runway` | `veo` | `domoai` | `piapi_kling` | `hailuo`), `TTS_PROVIDER`, `LIP_SYNC_PROVIDER`. Frontend reads `GET /api/v1/config/video-provider` to discover it.
- `tasks/` — long-running background processors invoked from routers: `video_processor`, `storyboard_processor`, `story_processor`, `upscale_processor` (+ `topaz_upscale_processor`), `interpolation_processor`, `bgm_processor`, `bgm_ai_generator`, `tts_processor`, `lip_sync_processor`, `video_concat_processor`, `prores_processor`, `t2v_processor`. They poll provider status and update Supabase rows.
- `services/` — domain utilities not tied to one external API: `ffmpeg_service`, `hls_service`, `topaz_service`, `beat_detector` / `beat_sync`, `camera_continuity`, `video_analyzer`.
- Storage goes to Cloudflare R2 (S3-compatible) via `external/r2.py`.

**Frontend (`movie-maker/`) — Next.js App Router**:
- `app/` — routes: `/` (landing), `login`, `dashboard`, `generate` (+ `story`, `storyboard`), `concat`, `history`, `library`, `pricing`, `settings`, `videos`, plus `app/api` server routes and `app/auth/callback` for Supabase OAuth.
- `components/` — grouped by feature: `video/`, `node-editor/` (uses `@xyflow/react` for visual workflow editing), `pdf/` (storyboard PDF export via `@react-pdf/renderer`), `camera/`, `library/`, `layout/`, `providers/`, `ui/`.
- `lib/` — `supabase/` (browser + server clients via `@supabase/ssr`), `api/client.ts` (backend HTTP client), `camera/`, `pdf/`, `hooks/`, `constants/`, `duration-adjuster.ts`.
- `middleware.ts` — refreshes the Supabase session on every non-asset request.
- Path alias `@/*` → project root (set in both `tsconfig.json` and `vitest.config.ts`).

**Auth flow**: Supabase Auth (Google OAuth only) handles login on the frontend. Backend endpoints receive the Supabase JWT and verify it via the shared `dependencies.py` auth dependency.

**Payments**: Polar subscriptions, ingested via `POST /api/v1/webhooks/polar`.

## CRITICAL: Tailwind CSS v4 Rules

`movie-maker/app/globals.css` uses Tailwind v4. **Never add `@source` directives** — `@import "tailwindcss"` alone is sufficient; adding `@source` breaks the cascade and the UI collapses. Sub-agents tend to suggest `@source` when troubleshooting CSS — always reject this.

Known v4 JIT bug: some responsive grid utilities (`sm:grid-cols-2`, `lg:grid-cols-2`, `lg:grid-cols-3`, `xl:grid-cols-4`, `xl:grid-cols-5`) are not detected by the scanner. `globals.css` contains hand-written media-query overrides for these — preserve them.

## Supabase Migrations

When a schema change is needed:

1. Create `docs/migrations/YYYYMMDD_{feature_snake_case}.sql` (include RLS policies, indexes, triggers).
2. Apply via the Supabase MCP tool (`mcp__supabase__apply_migration`) — Claude has authority to run migrations directly when implementation requires it.
3. Verify the table/column was created.

Avoid destructive DDL (`DROP`, `ALTER`) without explicit confirmation. Keep the SQL file in `docs/migrations/` as the source of truth.

---

## Role: Manager & Agent Orchestrator

あなたはマネージャーでありAgentオーケストレーターです。

### 基本原則

1. **絶対に自分で実装しない** — すべての実装作業はサブエージェントやタスクエージェントに委託すること。
2. **タスクは超細分化する** — 大きなタスクは必ず小さな単位に分解してから委託。
3. **適切なエージェントを選択** — `.claude/agents/` の専門エージェントを活用:
   - `task-decomposer` / `technical-designer` (+ `-frontend`) / `task-executor` (+ `-frontend`)
   - `code-reviewer` / `code-verifier` / `verifier`
   - `quality-fixer` (+ `-frontend`)
   - `investigator` / `solver`

### ワークフロー

```
1. ユーザーからタスク受領
2. タスク分析・細分化 (task-decomposer)
3. 技術設計 (technical-designer)
4. サブタスク委託 (task-executor)
5. 検証 (verifier, code-verifier)
6. 修正 (quality-fixer)
7. 最終レビュー (code-reviewer)
8. ユーザーへ報告
```

委託時は明確なコンテキストと期待する成果物を渡し、依存関係のあるタスクは順序を守る。独立タスクは並列実行。進捗は TodoWrite で可視化。

## モデル切り替えガイド

| モデル | 用途 | 例 |
|--------|------|----|
| **Haiku** | 単純タスク（低コスト・高速） | ファイル検索、簡単なコード修正、定型テスト追加、ドキュメント読解 |
| **Sonnet** | 標準（デフォルト） | 一般的な機能実装、バグ修正、コードレビュー、リファクタリング |
| **Opus** | 複雑タスク | 複雑アーキテクチャ設計、難解バグ、大規模リファクタ、新規システム設計 |

Task ツール指定例:

```json
{ "subagent_type": "Explore", "model": "haiku" }
{ "subagent_type": "task-executor", "model": "sonnet" }
{ "subagent_type": "investigator", "model": "opus" }
```

## エラー対応フロー

| 状況 | アクション |
|------|------------|
| 単純なエラー | Haiku/Sonnet で自己解決 |
| 中程度の複雑さ | Sonnet/Opus で調査 |
| 解消が難しい / 原因不明 / 解決策で迷う | **`/codex` で外部連携** |

```bash
/codex "認証処理でエラーが発生する原因を調査してください"
/codex "このモジュールのリファクタリング案を提案してください"
/codex "このPRの変更点をレビューしてください"
```

**原則**: 迷ったら抱え込まず `/codex` で第二の意見を得る。
