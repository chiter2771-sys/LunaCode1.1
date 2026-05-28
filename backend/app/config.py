from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    workspace_root: Path = Field(default=Path('/workspace'), alias='LUNACODE_WORKSPACE')
    max_retries: int = Field(default=3, alias='LUNACODE_MAX_RETRIES')
    exec_timeout: int = Field(default=30, alias='LUNACODE_EXEC_TIMEOUT')
    frontend_origin: str = Field(default='http://localhost:5173', alias='FRONTEND_ORIGIN')

    qwen_api_key: str | None = Field(default=None, alias='QWEN_API_KEY')
    qwen_base_url: str = Field(default='https://dashscope-intl.aliyuncs.com/compatible-mode/v1', alias='QWEN_BASE_URL')
    qwen_planner_model: str = Field(default='qwen-plus', alias='QWEN_PLANNER_MODEL')
    qwen_debugger_model: str = Field(default='qwen-coder-plus', alias='QWEN_DEBUGGER_MODEL')
    deepseek_api_key: str | None = Field(default=None, alias='DEEPSEEK_API_KEY')
    deepseek_base_url: str = Field(default='https://api.deepseek.com', alias='DEEPSEEK_BASE_URL')
    deepseek_coder_model: str = Field(default='deepseek-coder', alias='DEEPSEEK_CODER_MODEL')

    def ensure_workspace(self) -> Path:
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        return self.workspace_root


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_workspace()
    return settings
