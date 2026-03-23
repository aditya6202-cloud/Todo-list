# 🐾 Daynest — Cozy To-Do Planner
A warm, illustrated task planner with Supabase cloud sync.

> **Live Demo:** [daynest.vercel.app](https://daynest.vercel.app)  
> **GitHub:** [aditya/daynest](https://github.com/aditya/daynest)

A warm, illustrated task planner with Supabase cloud sync.

## Features
- ✅ Add / complete / delete tasks
- 🔴🟡🟢 Task priority levels (High / Medium / Low)
- 🔍 Search & filter tasks
- 📊 Progress tracker with emoji milestones
- 🗄️ Supabase real-time backend
- 💾 Offline fallback with localStorage

---

## File Structure
```
daynest/
├── index.html      ← App UI (splash + task screen)
├── style.css       ← All styles & animations
├── app.js          ← Core logic (CRUD, filter, progress)
├── supabase.js     ← Supabase REST API wrapper
└── README.md
```

---

## Supabase Setup

### 1. Create a project at https://supabase.com

### 2. Run this SQL in **SQL Editor → New Query**:

```sql
CREATE TABLE tasks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text        text NOT NULL,
  done        boolean DEFAULT false,
  priority    text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  due_date    date,
  created_at  timestamptz DEFAULT now()
);

-- Enable Row Level Security (required)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Allow all access (for personal use — restrict for production)
CREATE POLICY "Public access" ON tasks
  FOR ALL USING (true) WITH CHECK (true);
```

### 3. Get your credentials
Go to **Project Settings → API** and copy:
- **Project URL** — e.g. `https://abcdefgh.supabase.co`
- **Anon public key** — starts with `eyJhbGci...`

### 4. Connect in the app
Click the **"Connect DB"** badge in the top-right of the app and paste your credentials.

---

## Running the App

Just open `index.html` in any browser — no build step needed!

For best results use a local server:
```bash
# Python
python -m http.server 3000

# Node
npx serve .
```

---

## Production Tips
- Add Supabase Auth to restrict tasks per user
- Enable Supabase Realtime for live sync across devices
- Deploy to Netlify / Vercel by dropping the folder
