import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Code2, FilePlus2, Files, FolderPlus, Home, PanelRightOpen, Play, RefreshCw, Rocket, Search, Settings, Sparkles, TerminalSquare, Trash2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { FileNode, LunaAPI, PublicSettings, RunResult } from './lib/api';

type Tab = { path: string; content: string; dirty: boolean };
type Message = { role: 'user' | 'assistant'; content: string };
type Page = 'home' | 'ide' | 'preview' | 'settings';

function flatten(node?: FileNode): FileNode[] {
  if (!node) return [];
  return [node, ...node.children.flatMap(flatten)];
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
      <div className={active === node.path ? 'active file-row' : 'file-row'}>
        <button className="file-button" onClick={() => node.type === 'file' && onOpen(node.path)} title={node.path}>
          <span className="file-dot">{node.type === 'folder' ? '⌁' : '•'}</span>{node.name}
        </button>
        {node.type === 'file' && <button className="icon-button subtle" onClick={() => onDelete(node.path)} title="Удалить файл"><Trash2 size={13} /></button>}
      </div>
      {node.type === 'folder' && <div className="tree-children">{node.children.map((child) => <FileTree key={child.path} node={child} active={active} onOpen={onOpen} onDelete={onDelete} />)}</div>}
    </div>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('ide');
  const [tree, setTree] = useState<FileNode>();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [terminal, setTerminal] = useState<RunResult[]>([]);
  const [command, setCommand] = useState('python main.py');
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Привет! Я Луна. Опишите задачу на русском: создать приложение, объяснить код, запустить или исправить ошибку.' }]);
  const [prompt, setPrompt] = useState('Создай простое todo приложение');
  const [busy, setBusy] = useState(false);
  const [chatWidth, setChatWidth] = useState(390);
  const [settings, setSettings] = useState<PublicSettings>();
  const messagesRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((tab) => tab.path === activePath);
  const flatFiles = useMemo(() => flatten(tree).filter((file) => file.type === 'file'), [tree]);
  const refreshTree = useCallback(() => LunaAPI.tree().then(setTree).catch(console.error), []);

  useEffect(() => { refreshTree(); LunaAPI.settings().then(setSettings).catch(console.error); }, [refreshTree]);
  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chatWidth;
    const move = (moveEvent: PointerEvent) => setChatWidth(Math.min(620, Math.max(300, startWidth - (moveEvent.clientX - startX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function openFile(path: string) {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) { setActivePath(path); setPage('ide'); return; }
    const file = await LunaAPI.read(path);
    setTabs((current) => [...current, { path, content: file.content, dirty: false }]);
    setActivePath(path);
    setPage('ide');
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
    const text = action ? `${action}: ${prompt || 'текущий файл'}` : prompt;
    if (!text.trim()) return;
    setMessages((current) => [...current, { role: 'user', content: text }]);
    setPrompt('');
    setBusy(true);
    try {
      const response = await LunaAPI.chat(text, activePath);
      setMessages((current) => [...current, { role: 'assistant', content: `### План\n\n${response.plan}\n\nЗадача поставлена в очередь: \`${response.task_id}\`` }]);
      const timer = window.setInterval(async () => {
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

  const navigation = [
    { id: 'home' as Page, label: 'Главная', icon: Home },
    { id: 'ide' as Page, label: 'Редактор', icon: Code2 },
    { id: 'preview' as Page, label: 'Превью', icon: Rocket },
    { id: 'settings' as Page, label: 'ИИ настройки', icon: Settings },
  ];

  return (
    <main className="app-shell" style={{ '--chat-width': `${chatWidth}px` } as React.CSSProperties}>
      <aside className="sidebar panel">
        <div className="brand"><span className="moon">◐</span><div><strong>LunaCode</strong><small>русская AI IDE</small></div></div>
        <nav className="main-nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}><Icon size={16} />{item.label}</button>;
          })}
        </nav>
        <div className="sidebar-header"><Files size={16} /> <span>{flatFiles.length} файлов</span><button className="icon-button" onClick={refreshTree}><RefreshCw size={14} /></button></div>
        <div className="file-actions"><button onClick={createFile}><FilePlus2 size={14} />Файл</button><button onClick={createFolder}><FolderPlus size={14} />Папка</button></div>
        <div className="search"><Search size={14} /><input placeholder="Поиск файлов" /></div>
        <nav className="tree"><FileTree node={tree} active={activePath} onOpen={openFile} onDelete={deleteFile} /></nav>
      </aside>

      <section className="workspace panel">
        <div className="topbar">
          <div className="tabs"><AnimatePresence>{tabs.map((tab) => <motion.button layout key={tab.path} className={tab.path === activePath ? 'tab active' : 'tab'} onClick={() => { setActivePath(tab.path); setPage('ide'); }}>{tab.path}{tab.dirty && ' •'}</motion.button>)}</AnimatePresence></div>
          <button className="primary" onClick={saveActive} disabled={!activeTab || !activeTab.dirty}>Сохранить</button>
        </div>

        {page === 'home' && <section className="page-card"><Sparkles /><h1>Рабочая область LunaCode</h1><p>Создавайте файлы, запускайте код, смотрите превью и отправляйте задачи Луне без перегруза контекстом.</p><div className="cards"><button onClick={createFile}>Создать первый файл</button><button onClick={() => setPage('settings')}>Настроить OpenRouter</button><button onClick={() => sendChat('Создай проект')}>Поручить ИИ</button></div></section>}

        {page === 'settings' && <section className="settings-page">
          <h1>Настройки ИИ</h1>
          <p>Ключи вводятся в Railway Variables или в локальный `.env`; frontend их не получает. Рекомендуемый вариант — один `OPENROUTER_API_KEY`, а LunaCode сам разносит задачи по ролям.</p>
          <div className="settings-grid">
            <div><span>Провайдер</span><strong>{settings?.provider || 'загрузка...'}</strong></div>
            <div><span>OpenRouter</span><strong>{settings?.openrouter_configured ? 'подключён' : 'не настроен'}</strong></div>
            <div><span>Планировщик</span><code>{settings?.models.planner}</code></div>
            <div><span>Программист</span><code>{settings?.models.coder}</code></div>
            <div><span>Отладчик</span><code>{settings?.models.debugger}</code></div>
          </div>
          <pre className="env-snippet">OPENROUTER_API_KEY=sk-or-...{`\n`}OPENROUTER_PLANNER_MODEL=qwen/qwen-2.5-72b-instruct{`\n`}OPENROUTER_CODER_MODEL=deepseek/deepseek-chat{`\n`}OPENROUTER_DEBUGGER_MODEL=qwen/qwen-2.5-coder-32b-instruct</pre>
        </section>}

        {(page === 'ide' || page === 'preview') && <div className="editor-layout">
          <div className="editor-pane">
            {activeTab ? <Editor theme="vs-dark" path={activeTab.path} value={activeTab.content} onChange={(value) => setTabs((current) => current.map((tab) => tab.path === activeTab.path ? { ...tab, content: value || '', dirty: true } : tab))} options={{ minimap: { enabled: false }, fontSize: 14, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', padding: { top: 18 }, wordWrap: 'on', automaticLayout: true }} /> : <div className="empty-state"><Sparkles /><h2>Откройте файл или создайте новый проект.</h2><p>Слева есть кнопки «Файл» и «Папка», справа — чат Луны.</p><button className="primary" onClick={createFile}>Создать файл</button></div>}
          </div>
          <div className="preview-pane">
            <div className="pane-title"><PanelRightOpen size={15} />Предварительный просмотр</div>
            {previewUrl ? <iframe src={previewUrl} title="Предварительный просмотр" /> : <div className="preview-empty">Запустите веб-приложение — LunaCode найдёт localhost URL и откроет его здесь.</div>}
          </div>
        </div>}

        <div className="terminal">
          <div className="terminal-bar"><TerminalSquare size={16} /><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runCommand()} /><button onClick={() => runCommand()} disabled={busy}><Play size={14} />Запустить</button><button onClick={() => runCommand(true)} disabled={busy}>Исправить</button></div>
          <div className="terminal-output">{terminal.map((entry, index) => <pre key={`${entry.command}-${index}`}>$ {entry.command}\n{entry.stdout}{entry.stderr}</pre>)}</div>
        </div>
      </section>

      <aside className="ai-panel panel">
        <div className="resize-handle" onPointerDown={startResize} title="Потяните, чтобы изменить ширину чата" />
        <div className="ai-title"><Bot size={18} /><div><strong>Луна ИИ</strong><small>Планировщик → Программист → Отладчик</small></div></div>
        <div className="quick-actions"><button onClick={() => sendChat('Запусти')}>Запустить</button><button onClick={() => sendChat('Исправь')}>Исправить</button><button onClick={() => sendChat('Объясни')}>Объяснить</button><button onClick={() => sendChat('Улучши')}>Улучшить</button></div>
        <div className="messages" ref={messagesRef}>{messages.map((msg, index) => <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={index} className={`message ${msg.role}`}><ReactMarkdown>{msg.content}</ReactMarkdown></motion.div>)}</div>
        <div className="composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Попросите Луну собрать, изменить или отладить проект..." onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') sendChat(); }} /><button className="primary" disabled={busy} onClick={() => sendChat()}>{busy ? 'Думаю…' : 'Отправить'}</button></div>
      </aside>
    </main>
  );
}
