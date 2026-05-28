from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from backend.app.config import get_settings
from backend.app.models import ChatRequest, FilePatch, FileWrite, ModelRole, RunRequest
from backend.app.services.ai_router import AIRouter
from backend.app.services.autofix import AutoFixer
from backend.app.services.executor import Executor
from backend.app.services.file_manager import FileManager
from backend.app.services.memory import MemoryStore
from backend.app.services.playwright_tester import PlaywrightTester
from backend.app.services.task_queue import TaskQueue

settings = get_settings()
files = FileManager()
memory = MemoryStore()
ai = AIRouter()
executor = Executor(files)
queue = TaskQueue(ai, memory)
autofixer = AutoFixer(ai, executor, files, memory, settings.max_retries)
tester = PlaywrightTester(executor, files)

app = FastAPI(title='LunaCode API', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.on_event('startup')
async def startup() -> None:
    queue.start()
    files.project_root('default')


@app.get('/api/health')
async def health() -> dict:
    return {'ok': True, 'name': 'LunaCode'}


@app.get('/api/projects/{project}/tree')
async def tree(project: str):
    return files.tree(project)


@app.get('/api/projects/{project}/files/{path:path}')
async def read_file(project: str, path: str) -> dict:
    try:
        return {'path': path, 'content': files.read(project, path)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='File not found') from exc


@app.put('/api/projects/{project}/files/{path:path}')
async def write_file(project: str, path: str, body: FileWrite) -> dict:
    files.write(project, path, body.content)
    memory.add_edit(project, path, 'Saved file')
    return {'ok': True}


@app.delete('/api/projects/{project}/files/{path:path}')
async def delete_file(project: str, path: str) -> dict:
    files.delete(project, path)
    memory.add_edit(project, path, 'Deleted file')
    return {'ok': True}


@app.post('/api/projects/{project}/folders/{path:path}')
async def create_folder(project: str, path: str) -> dict:
    files.mkdir(project, path)
    return {'ok': True}


@app.post('/api/run')
async def run(req: RunRequest):
    result = await executor.run(req.project, req.command)
    if result.exit_code not in (0, None):
        memory.add_error(req.project, result.stderr or result.stdout)
    return result


@app.post('/api/autofix')
async def autofix(req: RunRequest):
    return await autofixer.run(req.project, req.command)


@app.post('/api/test-preview')
async def test_preview(req: dict):
    project = req.get('project', 'default')
    url = req.get('url')
    if not url:
        raise HTTPException(status_code=400, detail='url is required')
    return await tester.smoke(project, url)


@app.post('/api/chat')
async def chat(req: ChatRequest) -> dict:
    context = {
        'memory': memory.snapshot(req.project),
        'active_file': req.active_file,
        'selected_text': req.selected_text,
        'relevant_files': files.relevant_files(req.project, req.message, req.active_file),
    }
    plan = await ai.complete(ModelRole.planner, req.message, context)
    task = await queue.enqueue(req.project, f'AI: {req.message[:64]}', ModelRole.coder, {'prompt': req.message, 'context': {**context, 'plan': plan}})
    return {'plan': plan, 'task_id': task.id}


@app.get('/api/tasks/{task_id}')
async def task(task_id: str):
    found = queue.get(task_id)
    if not found:
        raise HTTPException(status_code=404, detail='Task not found')
    return found


@app.get('/api/projects/{project}/tasks')
async def tasks(project: str):
    return queue.list(project)


@app.get('/api/projects/{project}/memory')
async def project_memory(project: str):
    return memory.snapshot(project)


@app.websocket('/ws/terminal/{project}')
async def terminal_ws(websocket: WebSocket, project: str):
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            command = payload.get('command', '')
            if not command:
                continue
            result = await executor.run(project, command)
            await websocket.send_json(result.model_dump())
    except WebSocketDisconnect:
        return


frontend_dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
if frontend_dist.exists():
    app.mount('/assets', StaticFiles(directory=frontend_dist / 'assets'), name='assets')

    @app.get('/{full_path:path}')
    async def spa(full_path: str):
        target = frontend_dist / full_path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(frontend_dist / 'index.html')
