from pathlib import Path
import shutil
from backend.app.config import get_settings
from backend.app.models import FileNode

IGNORED = {'node_modules', '.git', '__pycache__', '.venv', 'dist', 'build'}


class FileManager:
    def __init__(self) -> None:
        self.root = get_settings().ensure_workspace().resolve()

    def project_root(self, project: str) -> Path:
        path = (self.root / project).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError('Project path escapes workspace')
        path.mkdir(parents=True, exist_ok=True)
        return path

    def resolve(self, project: str, relative: str = '') -> Path:
        base = self.project_root(project)
        path = (base / relative.lstrip('/')).resolve()
        if not str(path).startswith(str(base)):
            raise ValueError('Path escapes project workspace')
        return path

    def tree(self, project: str) -> FileNode:
        base = self.project_root(project)
        def walk(path: Path) -> FileNode:
            rel = path.relative_to(base).as_posix() if path != base else ''
            if path.is_dir():
                children = [walk(child) for child in sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())) if child.name not in IGNORED]
                return FileNode(name=path.name or project, path=rel, type='folder', children=children)
            return FileNode(name=path.name, path=rel, type='file')
        return walk(base)

    def read(self, project: str, relative: str) -> str:
        path = self.resolve(project, relative)
        return path.read_text(encoding='utf-8')

    def write(self, project: str, relative: str, content: str) -> None:
        path = self.resolve(project, relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')

    def delete(self, project: str, relative: str) -> None:
        path = self.resolve(project, relative)
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()

    def mkdir(self, project: str, relative: str) -> None:
        self.resolve(project, relative).mkdir(parents=True, exist_ok=True)

    def relevant_files(self, project: str, query: str, active_file: str | None = None, limit: int = 5) -> dict[str, str]:
        base = self.project_root(project)
        candidates: list[Path] = []
        if active_file:
            active = self.resolve(project, active_file)
            if active.is_file():
                candidates.append(active)
        terms = {term.lower() for term in query.replace('/', ' ').replace('.', ' ').split() if len(term) > 2}
        for path in base.rglob('*'):
            if len(candidates) >= limit:
                break
            if any(part in IGNORED for part in path.parts) or not path.is_file() or path.stat().st_size > 80_000:
                continue
            haystack = path.relative_to(base).as_posix().lower()
            if terms and not any(term in haystack for term in terms):
                continue
            if path not in candidates:
                candidates.append(path)
        return {p.relative_to(base).as_posix(): p.read_text(encoding='utf-8', errors='ignore')[:12_000] for p in candidates[:limit]}
