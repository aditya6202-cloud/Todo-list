/**
 * supabase.js — Daynest Supabase Integration
 * Handles Auth + Tasks CRUD + Categories + Habits CRUD + Habit Logs
 */

const SupabaseDB = (() => {

  // ── YOUR SUPABASE CREDENTIALS ─────────────────
  const SUPABASE_URL = 'https://skcayzoiqhbxwheilxpi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gg7tI15UElt-FoWSwZ7pCA_bSKamcom';

  function getUrl()   { return SUPABASE_URL; }
  function getKey()   { return SUPABASE_KEY; }
  function getToken() { return localStorage.getItem('dn_auth_token') || SUPABASE_KEY; }

  // ── Headers ───────────────────────────────────
  function headers(useToken = false) {
    return {
      'Content-Type':  'application/json',
      'apikey':        getKey(),
      'Authorization': `Bearer ${useToken ? getToken() : getKey()}`,
      'Prefer':        'return=representation',
    };
  }

  // ── REST request ──────────────────────────────
  async function request(path, options = {}) {
    const res = await fetch(`${getUrl()}/rest/v1${path}`, {
      ...options,
      headers: { ...headers(true), ...(options.headers || {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  }

  // ── Auth request ──────────────────────────────
  async function authRequest(endpoint, body) {
    const res = await fetch(`${getUrl()}/auth/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': getKey() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || `Auth error ${res.status}`);
    }
    return data;
  }

  // ── SIGNUP ────────────────────────────────────
  async function signup(email, password, fullName) {
    const data = await authRequest('signup', {
      email, password,
      data: { full_name: fullName },
    });
    if (data.access_token) {
      localStorage.setItem('dn_auth_token', data.access_token);
      localStorage.setItem('dn_auth_user', JSON.stringify({
        id:        data.user.id,
        email:     data.user.email,
        full_name: fullName,
      }));
    }
    return data.user || data;
  }

  // ── LOGIN ─────────────────────────────────────
  async function login(email, password) {
    const data = await authRequest('token?grant_type=password', { email, password });
    localStorage.setItem('dn_auth_token', data.access_token);

    let fullName = email.split('@')[0];
    try {
      const profile = await request(`/profiles?id=eq.${data.user.id}&select=full_name`);
      if (profile && profile[0] && profile[0].full_name) fullName = profile[0].full_name;
    } catch (e) { /* fallback */ }

    localStorage.setItem('dn_auth_user', JSON.stringify({
      id:        data.user.id,
      email:     data.user.email,
      full_name: fullName,
    }));
    return { ...data.user, full_name: fullName };
  }

  // ── LOGOUT ────────────────────────────────────
  function logout() {
    localStorage.removeItem('dn_auth_token');
    localStorage.removeItem('dn_auth_user');
  }

  function getUser() {
    const u = localStorage.getItem('dn_auth_user');
    return u ? JSON.parse(u) : null;
  }

  // ── TASKS CRUD ────────────────────────────────

  async function loadAll() {
    const user = getUser();
    if (!user) return null;
    return request(`/tasks?user_id=eq.${user.id}&select=*&order=created_at.asc`);
  }

  async function insert(task) {
    const user = getUser();
    if (!user) return null;
    const rows = await request('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        user_id:       user.id,
        text:          task.text,
        done:          task.done,
        priority:      task.priority,
        due_date:      task.due_date      || null,
        category:      task.category      || 'Personal',
        reminder_time: task.reminder_time || null,
        recurrence:    task.recurrence    || 'none',
        started_at:    task.started_at    || null,
        completed_at:  task.completed_at  || null,
      }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function update(id, changes) {
    const rows = await request(`/tasks?id=eq.${id}`, {
      method:  'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body:    JSON.stringify(changes),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function remove(id) {
    await request(`/tasks?id=eq.${id}`, {
      method:  'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    });
  }

  async function clearDoneTasks() {
    const user = getUser();
    if (!user) return;
    await request(`/tasks?done=eq.true&user_id=eq.${user.id}`, {
      method:  'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    });
  }

  // ── CUSTOM CATEGORIES CRUD ────────────────────

  async function getCategories() {
    const user = getUser();
    if (!user) return [];
    return request(`/categories?user_id=eq.${user.id}&select=*&order=created_at.asc`);
  }

  async function insertCategory(cat) {
    const user = getUser();
    if (!user) return null;
    const rows = await request('/categories', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        name:    cat.name,
        emoji:   cat.emoji,
      }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function deleteCategory(name) {
    const user = getUser();
    if (!user) return;
    await request(`/categories?user_id=eq.${user.id}&name=eq.${encodeURIComponent(name)}`, {
      method:  'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    });
  }

  // ── HABITS CRUD ───────────────────────────────
  // habits table: id, user_id, name, color, created_at
  // habit_logs table: id, habit_id, user_id, log_date (date), status ('done'|'missed')

  async function loadHabits() {
    const user = getUser();
    if (!user) return [];

    // Load habits
    const habits = await request(
      `/habits?user_id=eq.${user.id}&select=*&order=created_at.desc`
    );

    if (!habits || !habits.length) return [];

    // Load all logs for this user this month
    const now      = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
    const logs     = await request(
      `/habit_logs?user_id=eq.${user.id}&log_date=gte.${monthStr}-01&select=*`
    ).catch(() => []);

    // Merge logs into habits
    return habits.map(h => {
      const habitLogs = {};
      logs
        .filter(l => l.habit_id === h.id)
        .forEach(l => { habitLogs[l.log_date] = l.status; });
      return { id: h.id, name: h.name, color: h.color || '#7A9E5F', logs: habitLogs };
    });
  }

  async function insertHabit(habit) {
    const user = getUser();
    if (!user) return null;
    const rows = await request('/habits', {
      method: 'POST',
      body: JSON.stringify({
        id:      habit.id,
        user_id: user.id,
        name:    habit.name,
        color:   habit.color,
      }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function deleteHabit(id) {
    const user = getUser();
    if (!user) return;
    // Logs cascade-delete via FK in Supabase if you set ON DELETE CASCADE
    // Otherwise delete logs first:
    await request(`/habit_logs?habit_id=eq.${id}`, {
      method:  'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    }).catch(() => {});
    await request(`/habits?id=eq.${id}`, {
      method:  'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    });
  }

  // Upsert a single day log (insert or update)
  async function upsertHabitLog(habitId, logDate, status) {
    const user = getUser();
    if (!user) return null;
    const rows = await request('/habit_logs', {
      method: 'POST',
      headers: {
        'Prefer': 'return=representation,resolution=merge-duplicates',
        'On-Conflict': 'habit_id,log_date',
      },
      body: JSON.stringify({
        habit_id: habitId,
        user_id:  user.id,
        log_date: logDate,
        status,
      }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  // ── DB Modal connect ──────────────────────────
  async function connect(url, key) {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/tasks?limit=1&select=id`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) throw new Error(`Connection failed: ${res.status}`);
    return true;
  }

  function isConnected()       { return true; }
  async function tryAutoConnect() {}

  return {
    signup, login, logout, getUser,
    loadAll, insert, update, remove, clearDoneTasks,
    connect, isConnected, tryAutoConnect,
    getCategories, insertCategory, deleteCategory,
    // ── Habits ──
    loadHabits, insertHabit, deleteHabit, upsertHabitLog,
  };

})();

// ── Forgot Password ───────────────────────────
SupabaseDB.forgotPassword = async function(email) {
  const SUPABASE_URL = 'https://skcayzoiqhbxwheilxpi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gg7tI15UElt-FoWSwZ7pCA_bSKamcom';
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.msg || 'Failed to send reset email');
  }
  return true;
};

// ── Update Profile ────────────────────────────
SupabaseDB.updateProfile = async function(userId, changes) {
  const SUPABASE_URL = 'https://skcayzoiqhbxwheilxpi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gg7tI15UElt-FoWSwZ7pCA_bSKamcom';
  const token = localStorage.getItem('dn_auth_token') || SUPABASE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error('Profile update failed');
  return res.json();
};