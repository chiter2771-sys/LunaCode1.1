export type FileNode = { name: string; path: string; type: 'file' | 'folder'; children: FileNode[] };
export type RunResult = { command: string; exit_code: number | null; stdout: string; stderr: string; detected_url?: string | null; timed_out: boolean };
export type AutoFixResult = { fixed: boolean; attempts: Array<RunResult & { suggested_patch?: string }>; note?: string };
export type PublicSettings = { provider: string; openrouter_configured: boolean; models: { planner: string; coder: string; debugger: string } };

const json = { 'Content-Type': 'application/json' };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const LunaAPI = {
  settings: () => api<PublicSettings>('/api/settings/public'),
  tree: (project = 'default') => api<FileNode>(`/api/projects/${project}/tree`),
  read: (path: string, project = 'default') => api<{ path: string; content: string }>(`/api/projects/${project}/files/${path}`),
  write: (path: string, content: string, project = 'default') => api(`/api/projects/${project}/files/${path}`, { method: 'PUT', headers: json, body: JSON.stringify({ path, content }) }),
  mkdir: (path: string, project = 'default') => api(`/api/projects/${project}/folders/${path}`, { method: 'POST' }),
  delete: (path: string, project = 'default') => api(`/api/projects/${project}/files/${path}`, { method: 'DELETE' }),
  run: (command: string, project = 'default') => api<RunResult>('/api/run', { method: 'POST', headers: json, body: JSON.stringify({ project, command }) }),
  autoFix: (command: string, project = 'default') => api<AutoFixResult>('/api/autofix', { method: 'POST', headers: json, body: JSON.stringify({ project, command }) }),
  chat: (message: string, active_file?: string, selected_text?: string, project = 'default') => api<{ plan: string; task_id: string }>('/api/chat', { method: 'POST', headers: json, body: JSON.stringify({ project, message, active_file, selected_text }) }),
  task: (id: string) => api<{ status: string; result?: { content: string }; error?: string }>(`/api/tasks/${id}`)
};
