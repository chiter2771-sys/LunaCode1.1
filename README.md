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

Railway uses `nixpacks.toml` plus `railway.json` so both Python and Node are installed during build. Nix Python is PEP 668 externally managed, so LunaCode installs backend dependencies into `/opt/venv` instead of trying to mutate the global Nix Python environment:

```bash
virtualenv /opt/venv
. /opt/venv/bin/activate && pip install -r requirements.txt
npm --prefix frontend install
npm --prefix frontend run build
/opt/venv/bin/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Set provider API keys as Railway runtime environment variables. API keys are only read by the backend and are never sent to the browser. If Docker reports `SecretsUsedInArgOrEnv` for provider key names, keep those variables scoped to runtime/deploy settings rather than build-time variables when possible; LunaCode does not require secrets during the frontend build.

## AI routing

Recommended setup uses OpenRouter so one backend-only key can route each role to a different model:

- `OPENROUTER_PLANNER_MODEL` for task splitting and routing.
- `OPENROUTER_CODER_MODEL` for implementation and patch generation.
- `OPENROUTER_DEBUGGER_MODEL` for stack traces and minimal fixes.

If OpenRouter is not configured, LunaCode falls back to direct Qwen/DeepSeek keys. Provider billing or quota errors are returned as readable Russian messages instead of crashing the chat.

## Workspace

Projects are isolated below `LUNACODE_WORKSPACE` (default: `/workspace`). File APIs reject path traversal outside the workspace.
