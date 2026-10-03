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

CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  caller_name TEXT,
  caller_name_spelled TEXT,
  caller_phone TEXT,
  caller_email TEXT,
  call_type TEXT DEFAULT 'inbound_ai',
  is_after_hours INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  intent TEXT DEFAULT 'general_inquiry',
  ai_summary TEXT,
  transcript TEXT,
  sentiment TEXT DEFAULT 'neutral',
  status TEXT DEFAULT 'open',
  is_won_back INTEGER DEFAULT 0,
  appointment_id INTEGER REFERENCES appointments(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  greeting_script TEXT DEFAULT 'Thank you for calling {practice_name}. This is Neerja, your AI receptionist. How can I help you today?',
  voice_id TEXT DEFAULT 'en-IN-NeerjaExpressiveNeural',
  voice_name TEXT DEFAULT 'Neerja (Expressive Female)',
  language TEXT DEFAULT 'en-IN',
  enable_sms_confirmation INTEGER DEFAULT 1,
  enable_email_confirmation INTEGER DEFAULT 1,
  enable_whatsapp_confirmation INTEGER DEFAULT 0,
  after_hours_enabled INTEGER DEFAULT 1,
  emergency_forward_phone TEXT,
  voice_clone_sample_name TEXT
);
`);

try { db.exec(`ALTER TABLE appointments ADD COLUMN booked_by_ai INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN call_log_id INTEGER REFERENCES call_logs(id)`); } catch(e) {}
try { db.exec(`ALTER TABLE alerts ADD COLUMN call_log_id INTEGER REFERENCES call_logs(id)`); } catch(e) {}
try { db.exec(`ALTER TABLE alerts ADD COLUMN escalation_type TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE ai_settings ADD COLUMN groq_api_key TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE ai_settings ADD COLUMN openai_api_key TEXT`); } catch(e) {}

export default db;
