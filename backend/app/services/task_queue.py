import asyncio
from uuid import uuid4
from backend.app.models import ModelRole, Task, TaskStatus
from backend.app.services.ai_router import AIRouter
from backend.app.services.memory import MemoryStore


class TaskQueue:
    def __init__(self, ai: AIRouter, memory: MemoryStore) -> None:
        self.ai = ai
        self.memory = memory
        self.tasks: dict[str, Task] = {}
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.worker: asyncio.Task | None = None

    def start(self) -> None:
        if self.worker is None or self.worker.done():
            self.worker = asyncio.create_task(self._work())

    async def enqueue(self, project: str, title: str, role: ModelRole, payload: dict, max_attempts: int = 3) -> Task:
        task = Task(id=str(uuid4()), project=project, title=title, role=role, payload=payload, max_attempts=max_attempts)
        self.tasks[task.id] = task
        self.memory.add_task(project, title, TaskStatus.queued)
        await self.queue.put(task.id)
        return task

    async def _work(self) -> None:
        while True:
            task_id = await self.queue.get()
            task = self.tasks[task_id]
            task.status = TaskStatus.running
            task.attempts += 1
            self.memory.add_task(task.project, task.title, TaskStatus.running)
            try:
                result = await self.ai.complete(task.role, task.payload.get('prompt', task.title), task.payload.get('context'))
                task.result = {'content': result}
                task.status = TaskStatus.succeeded
                self.memory.add_task(task.project, task.title, TaskStatus.succeeded)
            except Exception as exc:
                task.error = str(exc)
                if task.attempts < task.max_attempts:
                    await asyncio.sleep(min(2 ** task.attempts, 8))
                    await self.queue.put(task.id)
                else:
                    task.status = TaskStatus.failed
                    self.memory.add_error(task.project, str(exc))
            finally:
                self.queue.task_done()

    def get(self, task_id: str) -> Task | None:
        return self.tasks.get(task_id)

    def list(self, project: str) -> list[Task]:
        return [task for task in self.tasks.values() if task.project == project]
