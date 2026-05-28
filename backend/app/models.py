from enum import Enum
from pydantic import BaseModel, Field
from typing import Any


class ModelRole(str, Enum):
    planner = 'planner'
    coder = 'coder'
    debugger = 'debugger'


class FileNode(BaseModel):
    name: str
    path: str
    type: str
    children: list['FileNode'] = Field(default_factory=list)


class FileWrite(BaseModel):
    path: str
    content: str


class FilePatch(BaseModel):
    path: str
    diff: str


class RunRequest(BaseModel):
    project: str = 'default'
    command: str


class RunResult(BaseModel):
    command: str
    exit_code: int | None
    stdout: str
    stderr: str
    detected_url: str | None = None
    timed_out: bool = False


class ChatRequest(BaseModel):
    project: str = 'default'
    message: str
    active_file: str | None = None
    selected_text: str | None = None


class TaskStatus(str, Enum):
    queued = 'queued'
    running = 'running'
    succeeded = 'succeeded'
    failed = 'failed'


class Task(BaseModel):
    id: str
    project: str
    title: str
    role: ModelRole
    payload: dict[str, Any]
    status: TaskStatus = TaskStatus.queued
    attempts: int = 0
    max_attempts: int = 3
    result: dict[str, Any] | None = None
    error: str | None = None
