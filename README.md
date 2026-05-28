# LunaCode

LunaCode is a modular AI-powered IDE inspired by Cursor, Replit AI, and Windsurf, optimized for stability, low API cost, and Railway deployment.

## Architecture

- **FastAPI backend** with REST + WebSocket APIs.
- **React + Monaco frontend** with a dark, responsive IDE layout.
- **AI Router** that separates planner, coder, and debugger responsibilities.
- **Task Queue** for sequential execution, retries, and crash-resistant workflows.
- **Chunking** that sends only relevant files and errors to the LLM.
- **Auto-fix loop** with a hard retry cap of 3.
- **Lightweight memory** stored per project without a vector database.

## Quick Start

```bash
cp .env.example .env
pip install -r requirements.txt
npm run install:all
npm run dev
```

Open the frontend at `http://localhost:5173` and the API at `http://localhost:8000`.

## Railway

Railway uses `railway.json`:

```bash
npm run build
npm run start
```

Set provider API keys as Railway environment variables. API keys are only read by the backend and are never sent to the browser.

## Workspace

Projects are isolated below `LUNACODE_WORKSPACE` (default: `/workspace`). File APIs reject path traversal outside the workspace.
