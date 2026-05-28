from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.services.file_manager import FileManager
    from backend.app.services.memory import MemoryStore

SCAFFOLD_WORDS = {'создай', 'сделай', 'собери', 'прототип', 'сайт', 'лендинг', 'todo', 'туду', 'приложение'}


def should_scaffold(message: str) -> bool:
    normalized = message.lower().replace('ё', 'е')
    return any(word in normalized for word in SCAFFOLD_WORDS) and any(word in normalized for word in {'создай', 'сделай', 'собери', 'прототип'})


def scaffold_web_prototype(files: FileManager, memory: MemoryStore, project: str, message: str) -> list[str]:
    normalized = message.lower().replace('ё', 'е')
    is_todo = 'todo' in normalized or 'туду' in normalized or 'задач' in normalized
    title = 'Luna Todo' if is_todo else 'Luna Prototype'
    heading = 'Умный список задач' if is_todo else 'Современный прототип сайта'
    subtitle = 'Добавляйте задачи, отмечайте выполнение и быстро проверяйте идею.' if is_todo else 'Готовая структура landing page: hero, преимущества, карточки и CTA.'

    files.write(project, 'index.html', f'''<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="app">
      <section class="hero">
        <div class="badge">Собрано в LunaCode</div>
        <h1>{heading}</h1>
        <p>{subtitle}</p>
        <div class="actions">
          <button id="primaryAction">{'Добавить демо-задачу' if is_todo else 'Начать проект'}</button>
          <a href="#features">Посмотреть блоки</a>
        </div>
      </section>

      <section id="features" class="grid">
        <article><span>01</span><h3>Быстрый старт</h3><p>Чистая структура файлов и понятные компоненты.</p></article>
        <article><span>02</span><h3>Адаптивность</h3><p>Сетка сразу работает на ноутбуке и планшете.</p></article>
        <article><span>03</span><h3>Готово к доработке</h3><p>Луна может расширить этот прототип следующими шагами.</p></article>
      </section>

      <section class="todo-card">
        <h2>{'Задачи' if is_todo else 'Интерактивный блок'}</h2>
        <form id="todoForm">
          <input id="todoInput" placeholder="Новая задача" />
          <button type="submit">Добавить</button>
        </form>
        <ul id="todoList"></ul>
      </section>
    </main>
    <script src="script.js"></script>
  </body>
</html>
''')
    files.write(project, 'styles.css', '''* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; font-family: Inter, system-ui, sans-serif; color: #eef2ff; background: radial-gradient(circle at top left, #5b4bff55, transparent 34%), #080b12; }
.app { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0; }
.hero { padding: 56px; border: 1px solid #ffffff18; border-radius: 32px; background: linear-gradient(135deg, #161b2acc, #10131fcc); box-shadow: 0 30px 100px #0008; }
.badge { display: inline-flex; padding: 8px 12px; border-radius: 999px; color: #bda8ff; background: #8b5cf622; margin-bottom: 18px; }
h1 { margin: 0; font-size: clamp(40px, 7vw, 82px); line-height: .92; letter-spacing: -0.06em; }
p { color: #aab4c8; font-size: 18px; line-height: 1.65; max-width: 680px; }
.actions { display: flex; gap: 14px; align-items: center; margin-top: 28px; }
button, .actions a { border: 0; border-radius: 14px; padding: 13px 18px; font-weight: 800; color: white; background: linear-gradient(135deg, #8b5cf6, #4f9cff); text-decoration: none; cursor: pointer; }
.actions a { background: #ffffff12; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 22px 0; }
article, .todo-card { padding: 22px; border: 1px solid #ffffff14; border-radius: 22px; background: #121724; }
article span { color: #8b5cf6; font-weight: 900; }
.todo-card form { display: flex; gap: 10px; }
input { flex: 1; min-width: 0; border: 1px solid #ffffff18; border-radius: 14px; padding: 13px 14px; color: white; background: #090d16; }
li { margin-top: 10px; padding: 12px 14px; border-radius: 12px; background: #ffffff0d; list-style: none; }
li.done { color: #32d583; text-decoration: line-through; }
@media (max-width: 760px) { .hero { padding: 28px; } .grid { grid-template-columns: 1fr; } .todo-card form, .actions { flex-direction: column; align-items: stretch; } }
''')
    files.write(project, 'script.js', '''const form = document.querySelector('#todoForm');
const input = document.querySelector('#todoInput');
const list = document.querySelector('#todoList');
const primary = document.querySelector('#primaryAction');

function addTask(text) {
  const item = document.createElement('li');
  item.textContent = text;
  item.addEventListener('click', () => item.classList.toggle('done'));
  list.prepend(item);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!input.value.trim()) return;
  addTask(input.value.trim());
  input.value = '';
});

primary.addEventListener('click', () => addTask('Проверить прототип в LunaCode'));
addTask('Открыть index.html или запустить локальный сервер');
''')
    files.write(project, 'README.md', f'''# {title}

Этот прототип был создан LunaCode по запросу:

> {message}

## Запуск

```bash
python -m http.server 3000
```

После запуска откройте preview на `http://localhost:3000`.
''')
    created = ['index.html', 'styles.css', 'script.js', 'README.md']
    for path in created:
        memory.add_edit(project, path, 'Создан прототип сайта')
    return created
