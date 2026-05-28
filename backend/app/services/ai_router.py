import json
from dataclasses import dataclass

import httpx

from backend.app.config import get_settings
from backend.app.models import ModelRole

SYSTEMS = {
    ModelRole.planner: 'Ты планировщик LunaCode. Разбей запрос на маленькие последовательные задачи. Отвечай кратким JSON на русском.',
    ModelRole.coder: 'Ты программист LunaCode. Генерируй минимальные изменения кода. Предпочитай unified diff и не переписывай файлы целиком.',
    ModelRole.debugger: 'Ты отладчик LunaCode. Анализируй ошибки и возвращай минимальный patch/diff плюс короткое объяснение на русском.',
}


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    base_url: str
    model: str
    api_key: str | None


class AIRouter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def provider_for(self, role: ModelRole) -> ProviderConfig:
        if self.settings.openrouter_api_key:
            return ProviderConfig(
                name='OpenRouter',
                base_url=self.settings.openrouter_base_url,
                model=self.openrouter_model_for(role),
                api_key=self.settings.openrouter_api_key,
            )
        if role == ModelRole.coder:
            return ProviderConfig('DeepSeek', self.settings.deepseek_base_url, self.settings.deepseek_coder_model, self.settings.deepseek_api_key)
        model = self.settings.qwen_planner_model if role == ModelRole.planner else self.settings.qwen_debugger_model
        return ProviderConfig('Qwen', self.settings.qwen_base_url, model, self.settings.qwen_api_key)

    def openrouter_model_for(self, role: ModelRole) -> str:
        if role == ModelRole.planner:
            return self.settings.openrouter_planner_model
        if role == ModelRole.debugger:
            return self.settings.openrouter_debugger_model
        return self.settings.openrouter_coder_model

    async def complete(self, role: ModelRole, prompt: str, context: dict | None = None) -> str:
        provider = self.provider_for(role)
        compact_context = json.dumps(context or {}, ensure_ascii=False)[:24_000]
        if not provider.api_key:
            return self.offline_response(role, prompt, context or {})
        try:
            return await self.call_provider(provider, role, prompt, compact_context)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 402, 403, 429}:
                return self.provider_error_response(provider, exc.response.status_code)
            raise

    async def call_provider(self, provider: ProviderConfig, role: ModelRole, prompt: str, compact_context: str) -> str:
        headers = {
            'Authorization': f'Bearer {provider.api_key}',
            'Content-Type': 'application/json',
        }
        if provider.name == 'OpenRouter':
            headers.update({
                'HTTP-Referer': self.settings.openrouter_site_url,
                'X-Title': 'LunaCode',
            })
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f'{provider.base_url.rstrip("/")}/chat/completions',
                headers=headers,
                json={
                    'model': provider.model,
                    'temperature': 0.2,
                    'messages': [
                        {'role': 'system', 'content': SYSTEMS[role]},
                        {'role': 'user', 'content': f'Контекст:\n{compact_context}\n\nЗапрос:\n{prompt}'},
                    ],
                },
            )
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content']

    def provider_error_response(self, provider: ProviderConfig, status_code: int) -> str:
        if status_code == 402:
            return (
                f'Провайдер {provider.name} вернул 402 Payment Required: на ключе закончился баланс или модель `{provider.model}` платная.\n\n'
                'Что сделать:\n'
                '1. Добавьте `OPENROUTER_API_KEY` в переменные Railway или `.env`.\n'
                '2. Укажите дешёвые/бесплатные модели через `OPENROUTER_PLANNER_MODEL`, `OPENROUTER_CODER_MODEL`, `OPENROUTER_DEBUGGER_MODEL`.\n'
                '3. Перезапустите приложение. LunaCode автоматически будет отправлять planner/coder/debugger запросы через OpenRouter.'
            )
        return (
            f'Провайдер {provider.name} вернул HTTP {status_code} для модели `{provider.model}`. '
            'Проверьте API-ключ, лимиты, название модели и настройки роутинга.'
        )

    def offline_response(self, role: ModelRole, prompt: str, context: dict) -> str:
        if role == ModelRole.planner:
            return json.dumps({'tasks': [
                {'title': 'Проверить релевантные файлы', 'role': 'coder'},
                {'title': 'Подготовить минимальный diff/patch', 'role': 'coder'},
                {'title': 'Запустить проект и исправить простые ошибки', 'role': 'debugger'},
            ]}, ensure_ascii=False, indent=2)
        if role == ModelRole.debugger:
            return 'API-ключ не настроен. Добавьте OPENROUTER_API_KEY или ключ Qwen, чтобы LunaCode подготовила patch для ошибки.\n\n```diff\n# здесь появится diff от отладчика\n```'
        return 'API-ключ кодовой модели не настроен. Добавьте OPENROUTER_API_KEY или DEEPSEEK_API_KEY, чтобы LunaCode генерировала patch-based изменения.'
