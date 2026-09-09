import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'dentalflow.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS practices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'America/New_York'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- owner_admin, manager, front_desk
  email TEXT
);

CREATE TABLE IF NOT EXISTS practitioners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  name TEXT NOT NULL,
  specialty TEXT
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active', -- active, inactive
  last_visit_date TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  practitioner_id INTEGER REFERENCES practitioners(id),
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT DEFAULT 'booked', -- booked, completed, missed, cancelled
  reason TEXT,
  fee REAL DEFAULT 150
);

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  caller_name TEXT,
  source TEXT DEFAULT 'phone', -- phone, web, walk_in
  status TEXT DEFAULT 'open', -- open, resolved, missed
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  type TEXT NOT NULL, -- recall, no_show_rebook, pending_message, consult_followup
  priority TEXT DEFAULT 'medium', -- high, medium, low
  status TEXT DEFAULT 'pending', -- pending, done
  due_date TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  type TEXT NOT NULL, -- revenue_target, missed_appointment, missed_call
  severity TEXT DEFAULT 'high', -- critical, high, medium
  title TEXT NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'active', -- active, dismissed
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voice_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  transcript TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  transcript TEXT NOT NULL,
  key_points TEXT, -- JSON array
  next_actions TEXT, -- JSON array
  risk_flag TEXT, -- none, low, medium, high
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  role TEXT NOT NULL, -- user, assistant
  content TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

export default db;
