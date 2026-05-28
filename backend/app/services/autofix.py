from backend.app.models import ModelRole, RunResult
from backend.app.services.ai_router import AIRouter
from backend.app.services.executor import Executor
from backend.app.services.file_manager import FileManager
from backend.app.services.memory import MemoryStore


class AutoFixer:
    def __init__(self, ai: AIRouter, executor: Executor, files: FileManager, memory: MemoryStore, max_retries: int = 3) -> None:
        self.ai = ai
        self.executor = executor
        self.files = files
        self.memory = memory
        self.max_retries = max_retries

    async def run(self, project: str, command: str, active_file: str | None = None) -> dict:
        attempts = []
        for index in range(self.max_retries + 1):
            result = await self.executor.run(project, command)
            attempts.append(result.model_dump())
            if result.exit_code == 0 and not result.timed_out:
                return {'fixed': index > 0, 'attempts': attempts}
            error = (result.stderr or result.stdout)[-6000:]
            self.memory.add_error(project, error)
            if index == self.max_retries:
                break
            context = {
                'error': error,
                'relevant_files': self.files.relevant_files(project, error, active_file, limit=3),
                'instruction': 'Return only a minimal unified diff. Do not rewrite complete files unless necessary.',
            }
            patch = await self.ai.complete(ModelRole.debugger, 'Fix this project error with a minimal patch.', context)
            attempts[-1]['suggested_patch'] = patch
            # Safe MVP: keep human-in-the-loop for applying patches to prevent destructive edits.
        return {'fixed': False, 'attempts': attempts, 'note': 'Patches are suggested but not auto-applied in MVP safety mode.'}
