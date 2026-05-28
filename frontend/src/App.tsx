import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Files, Play, RefreshCw, Search, Sparkles, TerminalSquare } from 'lucide-react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { FileNode, LunaAPI, RunResult } from './lib/api';

type Tab = { path: string; content: string; dirty: boolean };
type Message = { role: 'user' | 'assistant'; content: string };

function flatten(node?: FileNode): FileNode[] {
  if (!node) return [];
  return [node, ...node.children.flatMap(flatten)];
}

function FileTree({ node, active, onOpen }: { node?: FileNode; active?: string; onOpen: (path: string) => void }) {
  if (!node) return <p className="muted">No project files yet.</p>;
  if (node.path === '') return <>{node.children.map((child) => <FileTree key={child.path} node={child} active={active} onOpen={onOpen} />)}</>;
  return (
    <div className="tree-item">
      <button className={active === node.path ? 'active file-button' : 'file-button'} onClick={() => node.type === 'file' && onOpen(node.path)}>
        <span>{node.type === 'folder' ? '⌁' : '·'}</span>{node.name}
      </button>
      {node.type === 'folder' && <div className="tree-children">{node.children.map((child) => <FileTree key={child.path} node={child} active={active} onOpen={onOpen} />)}</div>}
    </div>
  );
}

export function App() {
  const [tree, setTree] = useState<FileNode>();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [terminal, setTerminal] = useState<RunResult[]>([]);
  const [command, setCommand] = useState('python main.py');
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Hi, I’m Luna. Ask me to build, explain, improve, run, or fix your project.' }]);
  const [prompt, setPrompt] = useState('Build a clean todo app');
  const [busy, setBusy] = useState(false);

  const activeTab = tabs.find((tab) => tab.path === activePath);
  const fileCount = useMemo(() => flatten(tree).filter((file) => file.type === 'file').length, [tree]);
  const refreshTree = useCallback(() => LunaAPI.tree().then(setTree).catch(console.error), []);

  useEffect(() => { refreshTree(); }, [refreshTree]);

  async function openFile(path: string) {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) return setActivePath(path);
    const file = await LunaAPI.read(path);
    setTabs((current) => [...current, { path, content: file.content, dirty: false }]);
    setActivePath(path);
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
      const result = autoFix ? await LunaAPI.autoFix(command) as unknown as RunResult : await LunaAPI.run(command);
      if ('attempts' in (result as unknown as Record<string, unknown>)) {
        const attempts = (result as unknown as { attempts: RunResult[] }).attempts;
        setTerminal((current) => [...attempts, ...current].slice(0, 8));
      } else {
        setTerminal((current) => [result, ...current].slice(0, 8));
        if (result.detected_url) setPreviewUrl(result.detected_url);
      }
    } finally { setBusy(false); }
  }

  async function sendChat(action?: string) {
    const text = action ? `${action}: ${prompt}` : prompt;
    if (!text.trim()) return;
    setMessages((current) => [...current, { role: 'user', content: text }]);
    setPrompt('');
    setBusy(true);
    try {
      const response = await LunaAPI.chat(text, activePath);
      setMessages((current) => [...current, { role: 'assistant', content: `### Plan\n\n${response.plan}\n\nTask queued: \`${response.task_id}\`` }]);
      const timer = window.setInterval(async () => {
        const task = await LunaAPI.task(response.task_id);
        if (task.status === 'succeeded' || task.status === 'failed') {
          window.clearInterval(timer);
          setMessages((current) => [...current, { role: 'assistant', content: task.result?.content || task.error || 'Task finished.' }]);
          setBusy(false);
        }
      }, 1200);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: String(error) }]);
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar panel">
        <div className="brand"><span className="moon">◐</span><div><strong>LunaCode</strong><small>AI IDE</small></div></div>
        <div className="sidebar-header"><Files size={16} /> <span>{fileCount} files</span><button onClick={refreshTree}><RefreshCw size={14} /></button></div>
        <div className="search"><Search size={14} /><input placeholder="Search files" /></div>
        <nav className="tree"><FileTree node={tree} active={activePath} onOpen={openFile} /></nav>
      </aside>

      <section className="editor-zone panel">
        <div className="topbar">
          <div className="tabs"><AnimatePresence>{tabs.map((tab) => <motion.button layout key={tab.path} className={tab.path === activePath ? 'tab active' : 'tab'} onClick={() => setActivePath(tab.path)}>{tab.path}{tab.dirty && ' •'}</motion.button>)}</AnimatePresence></div>
          <button className="primary" onClick={saveActive} disabled={!activeTab || !activeTab.dirty}>Save</button>
        </div>
        <div className="split-editor">
          <div className="editor-pane">
            {activeTab ? <Editor theme="vs-dark" path={activeTab.path} value={activeTab.content} onChange={(value) => setTabs((current) => current.map((tab) => tab.path === activeTab.path ? { ...tab, content: value || '', dirty: true } : tab))} options={{ minimap: { enabled: false }, fontSize: 14, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', padding: { top: 18 }, wordWrap: 'on' }} /> : <div className="empty-state"><Sparkles /><h2>Open a file or ask Luna to create one.</h2><p>Patch-based AI edits, isolated execution, and live preview are ready.</p></div>}
          </div>
          <div className="preview-pane">
            <div className="pane-title">Preview</div>
            {previewUrl ? <iframe src={previewUrl} title="Live preview" /> : <div className="preview-empty">Run a web app to detect localhost preview.</div>}
          </div>
        </div>
        <div className="terminal">
          <div className="terminal-bar"><TerminalSquare size={16} /><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runCommand()} /><button onClick={() => runCommand()} disabled={busy}><Play size={14} />Run</button><button onClick={() => runCommand(true)} disabled={busy}>Fix</button></div>
          <div className="terminal-output">{terminal.map((entry, index) => <pre key={`${entry.command}-${index}`}>$ {entry.command}\n{entry.stdout}{entry.stderr}</pre>)}</div>
        </div>
      </section>

      <aside className="ai-panel panel">
        <div className="ai-title"><Bot size={18} /><div><strong>Luna AI</strong><small>Planner → DeepSeek Coder → Qwen Debugger</small></div></div>
        <div className="quick-actions"><button onClick={() => sendChat('Run')}>Run</button><button onClick={() => sendChat('Fix')}>Fix</button><button onClick={() => sendChat('Explain')}>Explain</button><button onClick={() => sendChat('Improve')}>Improve</button></div>
        <div className="messages">{messages.map((msg, index) => <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={index} className={`message ${msg.role}`}><ReactMarkdown>{msg.content}</ReactMarkdown></motion.div>)}</div>
        <div className="composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask Luna to build, edit, debug..." /><button className="primary" disabled={busy} onClick={() => sendChat()}>{busy ? 'Thinking…' : 'Send'}</button></div>
      </aside>
    </main>
  );
}
