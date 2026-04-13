/**
 * app.js — Daynest Core Logic
 * Features: task CRUD, priority levels, search/filter, progress tracker, Supabase sync
 */

// ── State ──────────────────────────────────────────────────────
let tasks = [];          // master list (from Supabase or localStorage)
let currentFilter = 'all';
let searchQuery = '';

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setHeaderDate();
  setDefaultDueDate();
  await loadTasks();
  renderTasks();
});

function setHeaderDate() {
  const el = document.getElementById('header-date');
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString(undefined, opts);
}

function setDefaultDueDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('due-date-input').value = today;
}




// ── Load Tasks ─────────────────────────────────────────────────
async function loadTasks() {
  try {
    const localU = JSON.parse(localStorage.getItem('dn_user'));
    const userId = localU ? localU.id : "guest";
    const res = await fetch(`http://localhost:5000/tasks/${userId}`);
    if (res.ok) {
      const rows = await res.json();
      tasks = rows.map(normalizeRow);
      saveToCacheLocal();
      return;
    }
  } catch (e) {
    console.error("Failed to load from DB:", e);
  }
  // Fallback: localStorage
  const cached = localStorage.getItem('dn_tasks');
  tasks = cached ? JSON.parse(cached) : defaultTasks();
}

function normalizeRow(row) {
  return {
    id:       row._id || row.id,
    text:     row.text,
    done:     row.done,
    priority: row.priority || 'medium',
    due_date: row.due_date || row.dueDate || '',
    category: row.category || 'Personal',  // ← add this line
  };
}

function defaultTasks() {
  return [
    { id: uid(), text: 'Read 10 pages of a book',       done: false, priority: 'low',    due_date: today() },
    { id: uid(), text: 'Organize your workspace',        done: false, priority: 'medium', due_date: today() },
    { id: uid(), text: 'Prepare slides for meeting',     done: true,  priority: 'high',   due_date: today() },
    { id: uid(), text: 'Team call at 3:00 PM',           done: false, priority: 'high',   due_date: today() },
  ];
}

function saveToCacheLocal() {
  localStorage.setItem('dn_tasks', JSON.stringify(tasks));
}

// ── CRUD ───────────────────────────────────────────────────────
async function addTask() {
  const input = document.getElementById('new-task-input');

  const text  = input.value.trim();
  if (!text) { input.focus(); return; }

  const priority = document.getElementById('priority-select').value;
  const due_date = document.getElementById('due-date-input').value;

  let newTask = { id: uid(), text, done: false, priority, due_date: due_date, category: "Personal" };

  try {
    const res = await fetch("http://localhost:5000/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        done: false,
        priority: priority,
        dueDate: due_date,
        userId: JSON.parse(localStorage.getItem('dn_user'))?.id || "guest",
        category: "Personal"
      })
    });
    if (res.ok) {
      const savedTask = await res.json();
      newTask.id = savedTask._id;
    }
  } catch (error) {
    console.error(error);
  }

  tasks.unshift(newTask);
  saveToCacheLocal();
  input.value = '';
  renderTasks();
  showToast('Task added 🌱');
}

async function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;

  try {
    await fetch("http://localhost:5000/tasks/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: task.done })
    });
  } catch (e) {
    console.error(`⚠️ DB update failed: ${e.message}`);
  }

  saveToCacheLocal();
  renderTasks();
}

async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);

  try {
    await fetch("http://localhost:5000/tasks/" + id, { method: "DELETE" });
  } catch (e) {
    console.error(e);
  }

  saveToCacheLocal();
  renderTasks();
  showToast('Task removed 🗑️');
}

async function clearDone() {
  const hasDone = tasks.some(t => t.done);
  if (!hasDone) { showToast('No done tasks to clear'); return; }

  const doneTasks = tasks.filter(t => t.done);
  tasks = tasks.filter(t => !t.done);

  try {
    await Promise.all(doneTasks.map(t => fetch("http://localhost:5000/tasks/" + t.id, { method: "DELETE" })));
  } catch (e) {
    console.error(e);
  }

  saveToCacheLocal();
  renderTasks();
  showToast('Done tasks cleared ✨');
}

// ── Search & Filter ────────────────────────────────────────────
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

function filterTasks() {
  searchQuery = document.getElementById('search-input').value.toLowerCase();
  renderTasks();
}

function getFilteredTasks() {
  return tasks.filter(t => {
    const matchSearch   = t.text.toLowerCase().includes(searchQuery);
    const matchFilter   =
      currentFilter === 'all'    ? true :
      currentFilter === 'done'   ? t.done :
      currentFilter === 'high'   ? t.priority === 'high'   && !t.done :
      currentFilter === 'medium' ? t.priority === 'medium' && !t.done :
      currentFilter === 'low'    ? t.priority === 'low'    && !t.done :
      true;
    return matchSearch && matchFilter;
  });
}

// ── Render ─────────────────────────────────────────────────────
function renderTasks() {
  updateProgress();
  const filtered = getFilteredTasks();
  const list     = document.getElementById('task-list');
  const empty    = document.getElementById('empty-state');

  list.innerHTML = '';

  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Sort: undone first, then by priority weight
  const weight = { high: 0, medium: 1, low: 2 };
  const sorted = [...filtered].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (weight[a.priority] || 1) - (weight[b.priority] || 1);
  });

  sorted.forEach(task => {const today = new Date().toISOString().split("T")[0];

    list.appendChild(buildTaskEl(task));
  });
}

function buildTaskEl(task) { {
  const el = document.createElement('div');

const today = new Date();

let warning = "";

if (task.due_date) {
  const taskDate = new Date(task.due_date);

  if (taskDate.toDateString() === today.toDateString()) {
    warning = "⚠️ Due Today!";
  }
}


  el.className = `task-item${task.done ? ' done' : ''}`;
  el.dataset.priority = task.priority;
  el.dataset.id = task.id;

  el.innerHTML = `
  <div style="font-weight:600;">${task.text}</div>

  <div style="font-size:12px; color:gray;">
    📅 ${task.due_date || "No date"}
  </div>

  <div style="color:red; font-size:12px;">
    ${warning}
  </div>
`;
}
  

if (task.due_date === today) {
  warning = "⚠️ Due Today!";
}
  el.className = `task-item${task.done ? ' done' : ''}`;
  el.dataset.priority = task.priority;
  el.dataset.id = task.id;

  const isOverdue = task.due_date && !task.done && task.due_date < today();
  const dueLabel  = task.due_date
    ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${formatDate(task.due_date)}${isOverdue ? ' ⚠️' : ''}</span>`
    : '';

  const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

  el.innerHTML = `
    <div class="task-check ${task.done ? 'checked' : ''}" onclick="toggleDone('${task.id}')">
      ${task.done ? '✓' : ''}
    </div>
    <div class="task-body">
      <div class="task-text">${escHtml(task.text)}</div>
      <div class="task-meta">
        <span class="priority-badge ${task.priority}">${priorityEmoji[task.priority]} ${task.priority}</span>
        ${dueLabel}
      </div>
    </div>
    <button class="task-delete" onclick="deleteTask('${task.id}')" title="Delete task">✕</button>
  `;
  return el;
}

// ── Progress Tracker ───────────────────────────────────────────
function updateProgress() {
  const total = tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById('progress-count').textContent = `${done} / ${total} done`;
  document.getElementById('progress-bar').style.width   = `${pct}%`;

  const emoji =
    pct === 0   ? '🌱' :
    pct < 25    ? '🐣' :
    pct < 50    ? '🌤️' :
    pct < 75    ? '⚡' :
    pct < 100   ? '🔥' :
                  '🎉';
  document.getElementById('progress-emoji').textContent = emoji;
}

// ── Splash / Navigation ────────────────────────────────────────
function goToApp() {
  document.getElementById('splash-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
}

// ── Helpers ────────────────────────────────────────────────────
function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function today() { return new Date().toISOString().split('T')[0]; }

function formatDate(d) {
  if (!d) return '';
  const dt  = new Date(d + 'T00:00:00');
  const now = new Date();
  if (d === today()) return 'Today';
  const diff = Math.round((dt - now) / 86400000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast') || createToast();
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function createToast() {
  const t = document.createElement('div');
  t.id = 'toast';
  document.body.appendChild(t);
  return t;
}

// Enter key to add task
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'new-task-input') addTask();
});

// ── Screen Navigation ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goAsGuest() {
  setUser({ name: 'Guest', email: 'Local mode', isGuest: true });
  showScreen('app-screen');
  showToast('Welcome, Guest! Tasks saved locally 🌱');
}

// ── Auth ───────────────────────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  setUser({ name: email.split('@')[0], email: email, isGuest: false });
  showScreen('app-screen');
  await loadTasks();
  renderTasks();
  showToast(`Welcome back! 🎉`);
}

async function handleSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  setUser({ name, email, isGuest: false });
  showScreen('app-screen');
  await loadTasks();
  renderTasks();
  showToast(`Account created! Welcome, ${name}! 🎉`);
}

function handleLogout() {
  tasks = [];
  setUser({ name: 'Guest', email: '', isGuest: true });
  showScreen('splash-screen');
  showToast('Logged out 👋');
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── User State ─────────────────────────────────────────────────
function setUser(user) {
  document.getElementById('sidebar-username').textContent = user.name || 'Guest';
  document.getElementById('sidebar-email').textContent    = user.email || 'Local mode';
  document.getElementById('sidebar-avatar').textContent   = user.isGuest ? '👤' : user.name.charAt(0).toUpperCase();
  document.getElementById('btn-logout').style.display     = user.isGuest ? 'none' : 'block';
}

// ── Sidebar ────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  if (isOpen) { closeSidebar(); } else {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ── Password toggle ────────────────────────────────────────────
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

async function loadCategories() {
  const res = await fetch("http://localhost:5000/categories");
  const data = await res.json();

  console.log("Categories:", data);
}

async function addCategory(name, emoji) {
  await fetch("http://localhost:5000/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: name,
      emoji: emoji,
      userId: JSON.parse(localStorage.getItem('dn_user'))?.id || "guest"
    })
  });
}