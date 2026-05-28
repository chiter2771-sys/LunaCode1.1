import json
import httpx
from backend.app.config import get_settings
from backend.app.models import ModelRole

SYSTEMS = {
    ModelRole.planner: 'You are LunaCode Planner. Split requests into small sequential subtasks. Return concise JSON with tasks.',
    ModelRole.coder: 'You are LunaCode Coder. Generate minimal code changes. Prefer unified diffs and avoid rewriting full files.',
    ModelRole.debugger: 'You are LunaCode Debugger. Analyze errors and return a minimal patch in diff format plus a short reason.',
}


class AIRouter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def provider_for(self, role: ModelRole) -> tuple[str, str, str | None]:
        if role == ModelRole.coder:
            return self.settings.deepseek_base_url, self.settings.deepseek_coder_model, self.settings.deepseek_api_key
        model = self.settings.qwen_planner_model if role == ModelRole.planner else self.settings.qwen_debugger_model
        return self.settings.qwen_base_url, model, self.settings.qwen_api_key

    async def complete(self, role: ModelRole, prompt: str, context: dict | None = None) -> str:
        base_url, model, api_key = self.provider_for(role)
        compact_context = json.dumps(context or {}, ensure_ascii=False)[:24_000]
        if not api_key:
            return self.offline_response(role, prompt, context or {})
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f'{base_url.rstrip("/")}/chat/completions',
                headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
                json={
                    'model': model,
                    'temperature': 0.2,
                    'messages': [
                        {'role': 'system', 'content': SYSTEMS[role]},
                        {'role': 'user', 'content': f'Context:\n{compact_context}\n\nRequest:\n{prompt}'},
                    ],
                },
            )
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content']

    def offline_response(self, role: ModelRole, prompt: str, context: dict) -> str:
        if role == ModelRole.planner:
            return json.dumps({'tasks': [
                {'title': 'Inspect relevant files', 'role': 'coder'},
                {'title': 'Apply minimal implementation', 'role': 'coder'},
                {'title': 'Run and fix simple errors', 'role': 'debugger'},
            ]}, indent=2)
        if role == ModelRole.debugger:
            return 'No API key configured. Review the captured error and apply a minimal patch manually.\n\n```diff\n# debugger patch will appear here when QWEN_API_KEY is configured\n```'
        return 'No DeepSeek API key configured. LunaCode prepared the relevant context and is ready to generate patch-based edits once DEEPSEEK_API_KEY is set.'
