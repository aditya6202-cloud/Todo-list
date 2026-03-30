/**
 * notifications.js — Daynest Reminder & Alert Engine
 * Features: browser push notifications, in-app bell badge,
 *           notification panel, setInterval polling, recurrence support
 */

const DaynestNotify = (() => {

  let pollingInterval = null;
  let notifList = [];   // { id, taskId, text, time, read }

  // ── Permission ────────────────────────────────────────────────
  async function requestPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result === 'granted') showToastSafe('🔔 Notifications enabled!');
    }
  }

  // ── Fire a single notification ────────────────────────────────
  function fire(task) {
    // Browser push
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Daynest Reminder', {
        body: `Time to work on: ${task.text}`,
        icon: 'favicon.ico',
        tag:  task.id,
      });
    }

    // Add to in-app list
    const notif = {
      id:     Date.now(),
      taskId: task.id,
      text:   task.text,
      time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      read:   false,
    };
    notifList.unshift(notif);
    if (notifList.length > 20) notifList.pop();  // keep max 20
    saveNotifList();

    // Update bell badge
    updateBell();

    // Also show an in-page toast
    showToastSafe(`⏰ Reminder: ${task.text}`);
  }

  // ── Polling loop ──────────────────────────────────────────────
  function startPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(checkReminders, 30000);  // every 30s
    checkReminders();  // run immediately on load too
  }

  function checkReminders() {
    const raw   = localStorage.getItem('dn_tasks');
    const tasks = raw ? JSON.parse(raw) : [];
    const now   = Date.now();
    let   changed = false;

    tasks.forEach(task => {
      if (!task.reminder_time || task.done) return;

      const rt  = new Date(task.reminder_time).getTime();
      const key = `dn_notif_fired_${task.id}_${task.reminder_time}`;

      // Fire if within a 60-second window of the scheduled time
      if (Math.abs(rt - now) < 60000 && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        fire(task);

        // Advance recurrence
        if (task.recurrence === 'daily') {
          task.reminder_time = new Date(rt + 86400000).toISOString();
          changed = true;
        } else if (task.recurrence === 'weekly') {
          task.reminder_time = new Date(rt + 7 * 86400000).toISOString();
          changed = true;
        }
      }
    });

    if (changed) {
      localStorage.setItem('dn_tasks', JSON.stringify(tasks));
    }
  }

  // ── Bell badge ────────────────────────────────────────────────
  function updateBell() {
    const bell    = document.getElementById('notif-bell');
    if (!bell) return;
    const unread  = notifList.filter(n => !n.read).length;
    bell.dataset.count = unread;
    bell.classList.toggle('has-badge', unread > 0);
  }

  // ── Panel toggle ──────────────────────────────────────────────
  function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
      panel.classList.remove('open');
    } else {
      renderPanel();
      panel.classList.add('open');
      markAllRead();
    }
  }

  function markAllRead() {
    notifList.forEach(n => n.read = true);
    saveNotifList();
    updateBell();
  }

  function renderPanel() {
    const list = document.getElementById('notif-panel-list');
    if (!list) return;
    if (notifList.length === 0) {
      list.innerHTML = '<div class="notif-empty">No reminders yet 🌱</div>';
      return;
    }
    list.innerHTML = notifList.map(n => `
      <div class="notif-item${n.read ? '' : ' unread'}">
        <div class="notif-item-icon">⏰</div>
        <div class="notif-item-body">
          <div class="notif-item-text">${escHtmlSafe(n.text)}</div>
          <div class="notif-item-time">${n.time}</div>
        </div>
      </div>
    `).join('');
  }

  // ── Persist notif list ────────────────────────────────────────
  function saveNotifList() {
    localStorage.setItem('dn_notif_list', JSON.stringify(notifList));
  }

  function loadNotifList() {
    const raw = localStorage.getItem('dn_notif_list');
    notifList = raw ? JSON.parse(raw) : [];
    updateBell();
  }

  // ── Safe helpers (work even if app.js toast not loaded) ───────
  function showToastSafe(msg) {
    if (typeof showToast === 'function') {
      showToast(msg);
    } else {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }
  }

  function escHtmlSafe(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Public init ───────────────────────────────────────────────
  function init() {
    loadNotifList();
    requestPermission();
    startPolling();

    // Close panel when clicking outside
    document.addEventListener('click', e => {
      const panel = document.getElementById('notif-panel');
      const bell  = document.getElementById('notif-bell');
      if (panel && panel.classList.contains('open') &&
          !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.classList.remove('open');
      }
    });
  }

  return { init, toggleNotifPanel, checkReminders };
})();

// Auto-expose toggleNotifPanel globally (called from onclick in HTML)
function toggleNotifPanel() {
  DaynestNotify.toggleNotifPanel();
}

document.addEventListener('DOMContentLoaded', () => DaynestNotify.init());