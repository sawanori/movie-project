# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**movie-maker** is a web application that generates 5-second vertical short videos from user-uploaded images and text prompts using AI (KlingAI). The project is in early development stage (just scaffolded with create-next-app).

## Development Commands

```bash
npm run dev      # Start development server at http://localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

For faster development builds, use Turbopack:
```bash
npm run dev -- --turbo
```

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **React**: 19
- **Language**: TypeScript (strict mode enabled in tsconfig.json)
- **Styling**: Tailwind CSS v4 (via @tailwindcss/postcss)
- **Linting**: ESLint 9 flat config (`eslint.config.mjs`) with Next.js core-web-vitals + TypeScript rules
- **Path Alias**: `@/*` maps to project root

## Architecture

This is the **frontend repository**. The backend lives in a separate repository.

| Repository | Purpose | Deploy |
|------------|---------|--------|
| `movie-maker` | Next.js Frontend | Vercel |
| `movie-maker-api` | FastAPI Backend | Railway |

**Target Stack**:
- Database: Supabase (auth + postgres)
- Storage: Cloudflare R2
- Video Generation: KlingAI API
- Prompt Enhancement: OpenAI GPT-4
- Video Processing: FFmpeg
- Payments: Polar

## Documentation

All detailed specifications are in `../docs/` (parent directory, Japanese):
- `../docs/requirements.md` - Product concept and pricing strategy
- `../docs/plan.md` - Technical specifications, DB schema, API design
- `../docs/workbook.md` - 46 development tickets organized by phase
- `../docs/progress.md` - Task progress dashboard

The project uses a multi-AI development workflow. Tickets are organized into 7 phases with dependencies tracked between tasks.
