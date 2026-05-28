from backend.app.models import RunResult
from backend.app.services.executor import Executor
from backend.app.services.file_manager import FileManager

TEST_TEMPLATE = """
import {{ test, expect }} from '@playwright/test';

test('LunaCode smoke test', async ({{ page }}) => {{
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {{ if (msg.type() === 'error') errors.push(msg.text()); }});
  await page.goto('{url}', {{ waitUntil: 'networkidle' }});
  await expect(page.locator('body')).toBeVisible();
  if (errors.length) throw new Error(errors.join('\\n'));
}});
"""


class PlaywrightTester:
    def __init__(self, executor: Executor, files: FileManager) -> None:
        self.executor = executor
        self.files = files

    async def smoke(self, project: str, url: str) -> RunResult:
        self.files.write(project, '.lunacode/smoke.spec.ts', TEST_TEMPLATE.format(url=url))
        return await self.executor.run(project, 'npx playwright test .lunacode/smoke.spec.ts --reporter=line')
