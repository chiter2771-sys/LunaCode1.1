import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Code2, Database, Eye, FilePlus2, Files, FolderPlus, Globe2, Home, KeyRound, LayoutDashboard, Package, PanelRightOpen, Play, Plus, RefreshCw, Search, Settings, Sparkles, TerminalSquare, Trash2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { FileNode, LunaAPI, PublicSettings, RunResult } from './lib/api';

type Tab = { path: string; content: string; dirty: boolean };
type Message = { role: 'user' | 'assistant'; content: string };
type Page = 'home' | 'workspace' | 'preview' | 'settings' | 'deployments' | 'database' | 'secrets' | 'packages';

const CHAT_STORAGE_KEY = 'lunacode.chat.default';
const DEFAULT_MESSAGES: Message[] = [{ role: 'assistant', content: 'Привет! Я Луна. Могу просто общаться, а для задач по коду — планировать, писать, запускать и исправлять проект.' }];

function flatten(node?: FileNode): FileNode[] {
  if (!node) return [];
  return [node, ...node.children.flatMap(flatten)];
}

function loadMessages(): Message[] {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_MESSAGES;
  } catch {
    return DEFAULT_MESSAGES;
  }
}

function starterContent(path: string) {
  if (path.endsWith('.html')) return '<!doctype html>\n<html lang="ru">\n  <head><meta charset="UTF-8" /><title>LunaCode</title></head>\n  <body><h1>Привет из LunaCode</h1></body>\n</html>\n';
  if (path.endsWith('.py')) return 'print("Привет из LunaCode")\n';
  if (path.endsWith('.js') || path.endsWith('.ts')) return 'console.log("Привет из LunaCode");\n';
  if (path.endsWith('.css')) return 'body { font-family: system-ui; }\n';
  return '';
}

function FileTree({ node, active, onOpen, onDelete }: { node?: FileNode; active?: string; onOpen: (path: string) => void; onDelete: (path: string) => void }) {
  if (!node) return <p className="muted">Проект пока пуст.</p>;
  if (node.path === '') return <>{node.children.map((child) => <FileTree key={child.path} node={child} active={active} onOpen={onOpen} onDelete={onDelete} />)}</>;
  return (
    <div className="tree-item">
      <div className={active === node.path ? 'file-row active' : 'file-row'}>
        <button className="file-button" onClick={() => node.type === 'file' && onOpen(node.path)} title={node.path}>
          <span className="file-dot">{node.type === 'folder' ? '▸' : '•'}</span>{node.name}
        </button>
        {node.type === 'file' && <button className="icon-button subtle" onClick={() => onDelete(node.path)} title="Удалить файл"><Trash2 size={13} /></button>}
      </div>
      {node.type === 'folder' && <div className="tree-children">{node.children.map((child) => <FileTree key={child.path} node={child} active={active} onOpen={onOpen} onDelete={onDelete} />)}</div>}
    </div>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('workspace');
  const [tree, setTree] = useState<FileNode>();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [terminal, setTerminal] = useState<RunResult[]>([]);
  const [command, setCommand] = useState('python main.py');
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [prompt, setPrompt] = useState('Привет');
  const [busy, setBusy] = useState(false);
  const [chatWidth, setChatWidth] = useState(410);
  const [settings, setSettings] = useState<PublicSettings>();
  const messagesRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((tab) => tab.path === activePath);
  const flatFiles = useMemo(() => flatten(tree).filter((file) => file.type === 'file'), [tree]);
  const refreshTree = useCallback(() => LunaAPI.tree().then(setTree).catch(console.error), []);

  useEffect(() => { refreshTree(); LunaAPI.settings().then(setSettings).catch(console.error); }, [refreshTree]);
  useEffect(() => { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chatWidth;
    const move = (moveEvent: PointerEvent) => setChatWidth(Math.min(680, Math.max(320, startWidth - (moveEvent.clientX - startX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function openFile(path: string) {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) { setActivePath(path); setPage('workspace'); return; }
    const file = await LunaAPI.read(path);
    setTabs((current) => [...current, { path, content: file.content, dirty: false }]);
    setActivePath(path);
    setPage('workspace');
  }

  async function createFile() {
    const path = window.prompt('Путь нового файла', flatFiles.length ? 'src/App.tsx' : 'main.py');
    if (!path) return;
    await LunaAPI.write(path, starterContent(path));
    await refreshTree();
    await openFile(path);
  }

  async function createFolder() {
    const path = window.prompt('Путь новой папки', 'src');
    if (!path) return;
    await LunaAPI.mkdir(path);
    refreshTree();
  }

  async function deleteFile(path: string) {
    if (!window.confirm(`Удалить ${path}?`)) return;
    await LunaAPI.delete(path);
    setTabs((current) => current.filter((tab) => tab.path !== path));
    if (activePath === path) setActivePath(undefined);
    refreshTree();
  }

  async function saveActive() {
    if (!activeTab) return;
    await LunaAPI.write(activeTab.path, activeTab.content);
    setTabs((current) => current.map((tab) => tab.path === activeTab.path ? { ...tab, dirty: false } : tab));
    refreshTree();
  }

  async function runCommand(autoFix = false) {
    setBusy(true);
    try {
      if (autoFix) {
        const result = await LunaAPI.autoFix(command);
        setTerminal((current) => [...result.attempts, ...current].slice(0, 10));
        const lastAttempt = result.attempts[result.attempts.length - 1];
        if (lastAttempt?.detected_url) setPreviewUrl(lastAttempt.detected_url);
        if (result.note) setMessages((current) => [...current, { role: 'assistant', content: result.note || '' }]);
      } else {
        const result = await LunaAPI.run(command);
        setTerminal((current) => [result, ...current].slice(0, 10));
        if (result.detected_url) { setPreviewUrl(result.detected_url); setPage('preview'); }
      }
    } finally { setBusy(false); }
  }

  async function sendChat(action?: string) {
    const text = action ? `${action}: ${prompt || 'текущий проект'}` : prompt;
    if (!text.trim()) return;
    setMessages((current) => [...current, { role: 'user', content: text }]);
    setPrompt('');
    setBusy(true);
    try {
      const response = await LunaAPI.chat(text, activePath);
      if (response.mode === 'chat' || response.mode === 'scaffold') {
        setMessages((current) => [...current, { role: 'assistant', content: response.answer || 'Я на связи.' }]);
        if (response.mode === 'scaffold') {
          await refreshTree();
          if (response.files?.[0]) await openFile(response.files[0]);
        }
        setBusy(false);
        return;
      }
      setMessages((current) => [...current, { role: 'assistant', content: `### План\n\n${response.plan}\n\nЗадача поставлена в очередь: \`${response.task_id}\`` }]);
      const timer = window.setInterval(async () => {
        if (!response.task_id) return;
        const task = await LunaAPI.task(response.task_id);
        if (task.status === 'succeeded' || task.status === 'failed') {
          window.clearInterval(timer);
          setMessages((current) => [...current, { role: 'assistant', content: task.result?.content || task.error || 'Задача завершена.' }]);
          setBusy(false);
        }
      }, 1200);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: `Не удалось выполнить запрос. ${String(error)}` }]);
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages(DEFAULT_MESSAGES);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }

  const nav = [
    { id: 'home' as Page, label: 'Домой', icon: Home },
    { id: 'workspace' as Page, label: 'Код', icon: Code2 },
    { id: 'preview' as Page, label: 'Превью', icon: Eye },
    { id: 'deployments' as Page, label: 'Деплой', icon: Globe2 },
    { id: 'database' as Page, label: 'БД', icon: Database },
    { id: 'secrets' as Page, label: 'Secrets', icon: KeyRound },
    { id: 'packages' as Page, label: 'Пакеты', icon: Package },
    { id: 'settings' as Page, label: 'ИИ', icon: Settings },
  ];

  return (
    <main className="replit-shell" style={{ '--chat-width': `${chatWidth}px` } as React.CSSProperties}>
      <header className="app-header">
        <div className="project-brand"><span className="moon">◐</span><div><strong>LunaCode</strong><small>русская AI IDE</small></div></div>
        <div className="header-center"><Search size={15} /><input placeholder="Найти файл, команду или спросить Луну…" onFocus={() => setPage('workspace')} /></div>
        <div className="header-actions"><span className="provider-pill">{settings?.provider || 'offline'}</span><button onClick={() => runCommand()} disabled={busy}><Play size={14} />Запуск</button><button className="primary" onClick={saveActive} disabled={!activeTab || !activeTab.dirty}>Сохранить</button></div>
      </header>

      <div className="workspace-grid">
        <aside className="rail">
          {nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'rail-button active' : 'rail-button'} onClick={() => setPage(item.id)} title={item.label}><Icon size={19} /><span>{item.label}</span></button>; })}
        </aside>

        <aside className="files-panel panel-lite">
          <div className="panel-title"><Files size={16} /><strong>Файлы</strong><button className="icon-button" onClick={refreshTree}><RefreshCw size={14} /></button></div>
          <div className="project-actions"><button onClick={createFile}><FilePlus2 size={14} />Файл</button><button onClick={createFolder}><FolderPlus size={14} />Папка</button></div>
          <div className="file-search"><Search size={14} /><input placeholder="Поиск" /></div>
          <div className="template-card"><Sparkles size={16} /><span>Попросите Луну создать React, FastAPI, Express или HTML проект.</span></div>
          <nav className="tree"><FileTree node={tree} active={activePath} onOpen={openFile} onDelete={deleteFile} /></nav>
        </aside>

        <section className="main-stage panel-lite">
          <div className="tabs-bar">
            <div className="tabs"><AnimatePresence>{tabs.map((tab) => <motion.button layout key={tab.path} className={tab.path === activePath ? 'tab active' : 'tab'} onClick={() => { setActivePath(tab.path); setPage('workspace'); }}>{tab.path}{tab.dirty && ' •'}</motion.button>)}</AnimatePresence></div>
            <button className="ghost" onClick={createFile}><Plus size={14} />Новый</button>
          </div>

          {page === 'home' && <section className="home-page"><LayoutDashboard size={34} /><h1>Рабочая область как в Replit, но проще</h1><p>Слева файлы и проект, в центре редактор и превью, снизу консоль, справа Луна. Всё на русском и без лишнего шума.</p><div className="home-cards"><button onClick={createFile}>Создать файл</button><button onClick={() => sendChat('Создай todo приложение')}>Создать через ИИ</button><button onClick={() => setPage('settings')}>OpenRouter</button></div></section>}

          {page === 'settings' && <section className="settings-page"><h1>ИИ и модели</h1><p>Ключи вводятся в Railway Variables или `.env`. Frontend видит только статус, ключи остаются на backend.</p><div className="settings-grid"><div><span>Провайдер</span><strong>{settings?.provider || 'загрузка...'}</strong></div><div><span>OpenRouter</span><strong>{settings?.openrouter_configured ? 'подключён' : 'не настроен'}</strong></div><div><span>Планировщик</span><code>{settings?.models.planner}</code></div><div><span>Программист</span><code>{settings?.models.coder}</code></div><div><span>Отладчик</span><code>{settings?.models.debugger}</code></div></div><pre className="env-snippet">OPENROUTER_API_KEY=sk-or-...{`\n`}OPENROUTER_PLANNER_MODEL=qwen/qwen-2.5-72b-instruct{`\n`}OPENROUTER_CODER_MODEL=deepseek/deepseek-chat{`\n`}OPENROUTER_DEBUGGER_MODEL=qwen/qwen-2.5-coder-32b-instruct</pre></section>}

          {(['deployments', 'database', 'secrets', 'packages'] as Page[]).includes(page) && <section className="replit-tool-page">
            <div className="tool-hero">
              <span className="tool-kicker">Раздел LunaCode</span>
              <h1>{page === 'deployments' ? 'Deployments' : page === 'database' ? 'Database' : page === 'secrets' ? 'Secrets' : 'Packages'}</h1>
              <p>{page === 'deployments' ? 'Подготовка Railway/Vercel-like деплоя, команды запуска и preview URL.' : page === 'database' ? 'Подключения к SQLite/Postgres будут храниться как лёгкие project resources.' : page === 'secrets' ? 'Переменные окружения и API-ключи остаются на backend и не попадают во frontend.' : 'Установка npm/pip пакетов и быстрые шаблоны команд.'}</p>
            </div>
            <div className="tool-grid">
              <article><strong>Статус</strong><span>готово для MVP</span></article>
              <article><strong>Команда</strong><code>{page === 'deployments' ? 'npm run start' : page === 'packages' ? 'npm install / pip install' : page === 'secrets' ? '.env / Railway Variables' : 'sqlite / postgres'}</code></article>
              <article><strong>Следующий шаг</strong><span>Попросите Луну настроить этот раздел под проект.</span></article>
            </div>
          </section>}

          {(page === 'workspace' || page === 'preview') && <div className="work-split">
            <div className="editor-pane">
              {activeTab ? <Editor theme="vs-dark" path={activeTab.path} value={activeTab.content} onChange={(value) => setTabs((current) => current.map((tab) => tab.path === activeTab.path ? { ...tab, content: value || '', dirty: true } : tab))} options={{ minimap: { enabled: false }, fontSize: 14, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', padding: { top: 16 }, wordWrap: 'on', automaticLayout: true }} /> : <div className="empty-state"><Sparkles /><h2>Начните с файла или запроса к Луне</h2><p>Создайте файл слева или попросите Луну собрать приложение целиком.</p><button className="primary" onClick={createFile}>Создать файл</button></div>}
            </div>
            <div className="preview-pane"><div className="pane-title"><PanelRightOpen size={15} />Превью</div>{previewUrl ? <iframe src={previewUrl} title="Предварительный просмотр" /> : <div className="preview-empty">Запустите веб-сервер — localhost откроется здесь.</div>}</div>
          </div>}

          <div className="console-panel"><div className="console-bar"><TerminalSquare size={16} /><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runCommand()} /><button onClick={() => runCommand()} disabled={busy}>Run</button><button onClick={() => runCommand(true)} disabled={busy}>Fix</button></div><div className="terminal-output">{terminal.map((entry, index) => <pre key={`${entry.command}-${index}`}>$ {entry.command}\n{entry.stdout}{entry.stderr}</pre>)}</div></div>
        </section>

        <aside className="assistant-panel panel-lite">
          <div className="resize-handle" onPointerDown={startResize} title="Изменить ширину чата" />
          <div className="assistant-title"><Bot size={18} /><div><strong>Луна</strong><small>чат + агент разработки</small></div><button onClick={clearChat}>Очистить</button></div>
          <div className="quick-actions"><button onClick={() => sendChat('Запусти')}>Запуск</button><button onClick={() => sendChat('Исправь')}>Фикс</button><button onClick={() => sendChat('Объясни')}>Объяснить</button><button onClick={() => sendChat('Улучши')}>Улучшить</button></div>
          <div className="messages" ref={messagesRef}>{messages.map((msg, index) => <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={index} className={`message ${msg.role}`}><ReactMarkdown>{msg.content}</ReactMarkdown></motion.div>)}</div>
          <div className="composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Напишите сообщение или задачу для проекта…" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') sendChat(); }} /><button className="primary" disabled={busy} onClick={() => sendChat()}>{busy ? 'Думаю…' : 'Отправить'}</button></div>
        </aside>
      </div>
    </main>
  );
}
