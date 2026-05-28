import asyncio
import re
from pathlib import Path
from backend.app.config import get_settings
from backend.app.models import RunResult
from backend.app.services.file_manager import FileManager

URL_RE = re.compile(r'(https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s]*)')


class Executor:
    def __init__(self, files: FileManager) -> None:
        self.files = files
        self.settings = get_settings()

    async def run(self, project: str, command: str) -> RunResult:
        cwd = self.files.project_root(project)
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        timed_out = False
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=self.settings.exec_timeout)
        except asyncio.TimeoutError:
            timed_out = True
            proc.kill()
            stdout_b, stderr_b = await proc.communicate()
        stdout = stdout_b.decode(errors='ignore')
        stderr = stderr_b.decode(errors='ignore')
        detected = self.detect_url(stdout + '\n' + stderr)
        return RunResult(command=command, exit_code=proc.returncode, stdout=stdout[-12000:], stderr=stderr[-12000:], detected_url=detected, timed_out=timed_out)

    def detect_url(self, output: str) -> str | None:
        match = URL_RE.search(output)
        if not match:
            return None
        return match.group(1).replace('0.0.0.0', 'localhost')
