from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any


@dataclass
class ProjectMemory:
    previous_errors: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=20))
    recent_edits: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=50))
    active_tasks: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=50))


class MemoryStore:
    def __init__(self) -> None:
        self._projects: defaultdict[str, ProjectMemory] = defaultdict(ProjectMemory)

    def snapshot(self, project: str) -> dict[str, Any]:
        mem = self._projects[project]
        return {
            'previous_errors': list(mem.previous_errors),
            'recent_edits': list(mem.recent_edits),
            'active_tasks': list(mem.active_tasks),
        }

    def add_error(self, project: str, error: str) -> None:
        self._projects[project].previous_errors.append({'error': error[-4000:], 'at': datetime.now(UTC).isoformat()})

    def add_edit(self, project: str, path: str, summary: str) -> None:
        self._projects[project].recent_edits.append({'path': path, 'summary': summary, 'at': datetime.now(UTC).isoformat()})

    def add_task(self, project: str, title: str, status: str) -> None:
        self._projects[project].active_tasks.append({'title': title, 'status': status, 'at': datetime.now(UTC).isoformat()})
