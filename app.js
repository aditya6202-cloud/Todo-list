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
  await initSupabase();
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

// ── Supabase Setup ─────────────────────────────────────────────
async function initSupabase() {
  setStatusDot('pending');
  await SupabaseDB.tryAutoConnect();
  updateStatusBadge();

  document.getElementById('supabase-status').addEventListener('click', openModal);
}

function updateStatusBadge() {
  const dot  = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  if (SupabaseDB.isConnected()) {
    dot.className  = 'status-dot connected';
    text.textContent = 'Live ✦';
  } else {
    dot.className  = 'status-dot';
    text.textContent = 'Connect DB';
  }
}

function setStatusDot(state) {
  const dot = document.querySelector('.status-dot');
  if (state === 'error') dot.className = 'status-dot error';
  else dot.className = 'status-dot';
}

// ── Modal ──────────────────────────────────────────────────────
function openModal() {
  const url = localStorage.getItem('dn_sb_url') || '';
  const key = localStorage.getItem('dn_sb_key') || '';
  document.getElementById('sb-url').value = url;
  document.getElementById('sb-key').value = key;
  document.getElementById('config-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('config-modal').classList.add('hidden');
}

async function saveSupabaseConfig() {
  const url = document.getElementById('sb-url').value.trim();
  const key = document.getElementById('sb-key').value.trim();
  if (!url || !key) { showToast('Please enter both URL and key ⚠️'); return; }

  showToast('Connecting…');
  try {
    await SupabaseDB.connect(url, key);
    updateStatusBadge();
    closeModal();
    await loadTasks();
    renderTasks();
    showToast('Connected to Supabase! 🎉');
  } catch (e) {
    setStatusDot('error');
    showToast(`Connection failed: ${e.message}`);
  }
}

// ── Load Tasks ─────────────────────────────────────────────────
async function loadTasks() {
  if (SupabaseDB.isConnected()) {
    const rows = await SupabaseDB.loadAll().catch(() => null);
    if (rows) {
      tasks = rows.map(normalizeRow);
      applyHabitResets();
      saveToCacheLocal();
      return;
    }
  }
  // Fallback: localStorage
  const cached = localStorage.getItem('dn_tasks');
  tasks = cached ? JSON.parse(cached) : defaultTasks();
  applyHabitResets();
}

function applyHabitResets() {
  const todayStr = today();
  let dirty = false;
  
  tasks.forEach(t => {
    if (t.recurrence === 'daily') {
      if (t.done && t.last_completed && t.last_completed < todayStr) {
        t.done = false;
        t.completed_at = null;
        t.due_date = todayStr;
        dirty = true;
      }
      if (!t.done && t.last_completed && t.last_completed < todayStr) {
        const dtLast = new Date(t.last_completed + 'T00:00:00');
        const dtNow  = new Date(todayStr + 'T00:00:00');
        const diff = Math.round((dtNow - dtLast) / 86400000);
        if (diff > 1 && t.streak > 0) {
          t.streak = 0;
          dirty = true;
        }
      }
    } else if (t.recurrence === 'weekly') {
      if (t.done && t.last_completed) {
        const dtLast = new Date(t.last_completed + 'T00:00:00');
        const dtNow  = new Date(todayStr + 'T00:00:00');
        const diff = Math.round((dtNow - dtLast) / 86400000);
        if (diff >= 7) {
          t.done = false;
          t.completed_at = null;
          t.due_date = todayStr;
          dirty = true;
        }
      }
    }
  });

  if (dirty) {
    saveToCacheLocal();
    if (SupabaseDB.isConnected()) {
      tasks.forEach(t => {
        if (t.recurrence !== 'none') {
          SupabaseDB.update(t.id, { 
            done: t.done, completed_at: t.completed_at, due_date: t.due_date, streak: t.streak 
          }).catch(()=>{});
        }
      });
    }
  }
}

function normalizeRow(row) {
  return {
    id:             row.id,
    text:           row.text,
    done:           row.done,
    priority:       row.priority    || 'medium',
    due_date:       row.due_date    || '',
    category:       row.category    || 'Personal',
    reminder_time:  row.reminder_time  || null,
    recurrence:     row.recurrence     || 'none',
    started_at:     row.started_at     || null,
    completed_at:   row.completed_at   || null,
    streak:         row.streak         || 0,
    last_completed: row.last_completed || null,
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

  // Start with a temp local id (replaced by Supabase uuid on success)
  const newTask = {
   id: uid(), text, done: false, priority, due_date,
   category: document.getElementById('cat-select')?.value || 'Personal',
   reminder_time: document.getElementById('reminder-input').value || null,
   recurrence:    document.getElementById('recurrence-select').value || 'none',
   started_at:    null,
   completed_at:  null,
   streak:        0,
   last_completed: null
 };
  

  if (SupabaseDB.isConnected()) {
    try {
      const saved = await SupabaseDB.insert(newTask);
      if (saved && saved.id) {
        // Use Supabase's generated uuid so future updates/deletes work correctly
        newTask.id = saved.id;
      } else {
        throw new Error('No record returned from Supabase');
      }
    } catch (e) {
      showToast(`⚠️ DB save failed: ${e.message}`);
      // Still add locally so the user doesn't lose their input
    }
  }

  tasks.unshift(newTask);
  saveToCacheLocal();
  input.value = '';
  renderTasks();
  showToast(SupabaseDB.isConnected() ? 'Task saved to DB! 🌱' : 'Task added locally 🌱');
}

async function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;

  if (SupabaseDB.isConnected()) {
    try {
      await SupabaseDB.update(id, { done: task.done });
    } catch (e) {
      showToast(`⚠️ DB update failed: ${e.message}`);
    }
  }
  saveToCacheLocal();
  renderTasks();
}

async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);

  if (SupabaseDB.isConnected()) {
    await SupabaseDB.remove(id).catch(() => {});
  }
  saveToCacheLocal();
  renderTasks();
  showToast('Task removed 🗑️');
}

async function clearDone() {
  const hasDone = tasks.some(t => t.done);
  if (!hasDone) { showToast('No done tasks to clear'); return; }

  tasks = tasks.filter(t => !t.done);

  if (SupabaseDB.isConnected()) {
    await SupabaseDB.clearDoneTasks().catch(() => {});
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
      currentFilter === 'habits' ? (t.recurrence && t.recurrence !== 'none') :
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

  sorted.forEach(task => {
    list.appendChild(buildTaskEl(task));
  });
}

function buildTaskEl(task) {
  const el = document.createElement('div');
  el.className = `task-item${task.done ? ' done' : ''}`;
  el.dataset.priority = task.priority;
  el.dataset.id = task.id;

  const isOverdue = task.due_date && !task.done && task.due_date < today();
  const dueLabel  = task.due_date
    ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${formatDate(task.due_date)}${isOverdue ? ' ⚠️' : ''}</span>`
    : '';

  const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
  
  let habitBadge = '';
  if (task.recurrence && task.recurrence !== 'none') {
    habitBadge = `<span class="streak-badge" title="Habit Streak">🔥 ${task.streak || 0}</span>`;
  }

  el.innerHTML = `
    <div class="task-check ${task.done ? 'checked' : ''}" onclick="toggleDone('${task.id}')">
      ${task.done ? '✓' : ''}
    </div>
    <div class="task-body">
      <div class="task-text">${escHtml(task.text)}</div>
      <div class="task-meta">
        <span class="priority-badge ${task.priority}">${priorityEmoji[task.priority]} ${task.priority}</span>
        ${habitBadge}
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
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.querySelector('#login-screen .btn-auth');

  if (!email || !password) { showAuthError(errEl, 'Please fill in all fields'); return; }

  btn.textContent = 'Logging in…';
  btn.disabled = true;

  try {
    const user = await SupabaseDB.login(email, password);
    setUser({ name: user.email.split('@')[0], email: user.email, isGuest: false });
    showScreen('app-screen');
    await loadTasks();
    renderTasks();
    showToast(`Welcome back! 🎉`);
  } catch (e) {
    showAuthError(errEl, e.message || 'Login failed. Check your credentials.');
  } finally {
    btn.textContent = 'Login ✦';
    btn.disabled = false;
  }
}

async function handleSignup() {
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl    = document.getElementById('signup-error');
  const btn      = document.querySelector('#signup-screen .btn-auth');

  if (!name || !email || !password) { showAuthError(errEl, 'Please fill in all fields'); return; }
  if (password.length < 6)          { showAuthError(errEl, 'Password must be at least 6 characters'); return; }

  btn.textContent = 'Creating account…';
  btn.disabled = true;

  try {
    const user = await SupabaseDB.signup(email, password);
    setUser({ name, email: user.email, isGuest: false });
    showScreen('app-screen');
    await loadTasks();
    renderTasks();
    showToast(`Account created! Welcome, ${name}! 🎉`);
  } catch (e) {
    showAuthError(errEl, e.message || 'Signup failed. Try a different email.');
  } finally {
    btn.textContent = 'Create Account ✦';
    btn.disabled = false;
  }
}

function handleLogout() {
  SupabaseDB.logout();
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

async function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;

  const todayStr = today();

  if (task.done) {
    task.completed_at = new Date().toISOString();
    if (!task.started_at) task.started_at = task.completed_at;
    
    if (task.recurrence === 'daily' || task.recurrence === 'weekly') {
      task.last_completed = todayStr;
      task.streak = (task.streak || 0) + 1;
    }
  } else {
    task.completed_at = null; // un-done resets it
    
    if (task.recurrence === 'daily' || task.recurrence === 'weekly') {
      if (task.last_completed === todayStr) {
        task.streak = Math.max(0, (task.streak || 1) - 1);
        task.last_completed = null;
      }
    }
  }

  if (SupabaseDB.isConnected()) {
    await SupabaseDB.update(id, {
      done:           task.done,
      completed_at:   task.completed_at,
      started_at:     task.started_at,
      streak:         task.streak,
      last_completed: task.last_completed
    }).catch(() => {});
  }
  saveToCacheLocal();
  renderTasks();
}
