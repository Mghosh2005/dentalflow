import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'dentalflow.db');

// Ensure database directory exists if custom path is provided (e.g. persistent volume mount on Render/Railway)
const dbDir = path.dirname(path.resolve(dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

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

// Existing safe migrations
try { db.exec(`ALTER TABLE appointments ADD COLUMN booked_by_ai INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN call_log_id INTEGER REFERENCES call_logs(id)`); } catch(e) {}
try { db.exec(`ALTER TABLE alerts ADD COLUMN call_log_id INTEGER REFERENCES call_logs(id)`); } catch(e) {}
try { db.exec(`ALTER TABLE alerts ADD COLUMN escalation_type TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE ai_settings ADD COLUMN groq_api_key TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE ai_settings ADD COLUMN openai_api_key TEXT`); } catch(e) {}

// ===== NEW MIGRATIONS FOR FEATURE UPGRADE =====

// --- User accounts table for authentication ---
db.exec(`
CREATE TABLE IF NOT EXISTS user_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- staff, patient
  staff_user_id INTEGER REFERENCES users(id),
  patient_id INTEGER REFERENCES patients(id),
  display_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login TEXT
);
`);

// --- Patient extended fields ---
try { db.exec(`ALTER TABLE patients ADD COLUMN first_name TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN last_name TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN date_of_birth TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN gender TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN address TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN medical_notes TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN emergency_contact TEXT`); } catch(e) {}

// --- Treatment plans ---
db.exec(`
CREATE TABLE IF NOT EXISTS treatment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  plan_name TEXT NOT NULL,
  procedure_name TEXT,
  practitioner_id INTEGER REFERENCES practitioners(id),
  status TEXT DEFAULT 'planned', -- planned, in_progress, completed, on_hold
  notes TEXT,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// --- Follow-up messages (automated messaging system) ---
db.exec(`
CREATE TABLE IF NOT EXISTS follow_up_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  patient_id INTEGER REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  call_log_id INTEGER REFERENCES call_logs(id),
  trigger_type TEXT NOT NULL, -- appointment_reminder, no_show, cancellation, missed_call
  trigger_event_id TEXT, -- unique ID to prevent duplicates: e.g. "appt_reminder_42"
  message_text TEXT NOT NULL,
  template_id INTEGER,
  status TEXT DEFAULT 'pending_approval', -- pending_approval, approved, sending, sent, failed, cancelled
  delivery_method TEXT DEFAULT 'sms', -- sms, email, whatsapp
  delivery_result TEXT,
  staff_approved_by INTEGER REFERENCES user_accounts(id),
  approved_at TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// --- Message templates ---
db.exec(`
CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practice_id INTEGER REFERENCES practices(id),
  trigger_type TEXT NOT NULL, -- appointment_reminder, no_show, cancellation, missed_call
  name TEXT NOT NULL,
  template_text TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// --- Practitioner extended fields ---
try { db.exec(`ALTER TABLE practitioners ADD COLUMN phone TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE practitioners ADD COLUMN email TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE practitioners ADD COLUMN title TEXT`); } catch(e) {}

// --- Practitioner availability ---
db.exec(`
CREATE TABLE IF NOT EXISTS practitioner_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER REFERENCES practitioners(id),
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ... 6=Saturday
  start_time TEXT NOT NULL, -- HH:MM
  end_time TEXT NOT NULL, -- HH:MM
  slot_duration_minutes INTEGER DEFAULT 30
);
`);

// Create indexes for performance
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_user_accounts_username ON user_accounts(username)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_user_accounts_patient ON user_accounts(patient_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patient_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_follow_up_messages_trigger ON follow_up_messages(trigger_event_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`); } catch(e) {}

// ===== PHASE 2: CANONICAL PATIENT INTELLIGENCE & IMAGING WORKFLOW EXTENSIONS =====

// 1. Patient identity and clinical metadata extensions
try { db.exec(`ALTER TABLE patients ADD COLUMN canonical_uuid TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN medical_record_number TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN allergies_json TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN medical_alerts_json TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN matching_status TEXT DEFAULT 'verified'`); } catch(e) {}
try { db.exec(`ALTER TABLE patients ADD COLUMN merged_into_patient_id INTEGER REFERENCES patients(id)`); } catch(e) {}

// 2. Clinician-entered consultation and encounter notes
db.exec(`
CREATE TABLE IF NOT EXISTS clinical_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  practitioner_id INTEGER REFERENCES practitioners(id),
  appointment_id INTEGER REFERENCES appointments(id),
  note_type TEXT DEFAULT 'general_encounter',
  content TEXT NOT NULL,
  signed_by_practitioner_id INTEGER REFERENCES practitioners(id),
  signed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// 3. Imaging studies and radiography files
db.exec(`
CREATE TABLE IF NOT EXISTS imaging_studies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  study_instance_uid TEXT,
  study_date TEXT NOT NULL,
  modality TEXT NOT NULL, -- IO (Intraoral), PX (Panoramic), DX
  study_description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imaging_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  study_id INTEGER NOT NULL REFERENCES imaging_studies(id),
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  file_storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_format TEXT NOT NULL, -- dicom, png, jpeg
  file_size_bytes INTEGER NOT NULL,
  sha256_hash TEXT NOT NULL,
  pixel_width INTEGER,
  pixel_height INTEGER,
  dicom_metadata_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// 4. AI inference executions and candidate findings
db.exec(`
CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  imaging_file_id INTEGER NOT NULL REFERENCES imaging_files(id),
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  model_identifier TEXT NOT NULL, -- adr/6
  model_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
  raw_inference_json TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES ai_analyses(id),
  condition_label TEXT NOT NULL, -- cavity, periapical_lesion
  confidence_score REAL NOT NULL,
  bbox_x REAL NOT NULL,
  bbox_y REAL NOT NULL,
  bbox_width REAL NOT NULL,
  bbox_height REAL NOT NULL,
  tooth_number_fdi TEXT,
  initial_status TEXT DEFAULT 'potential'
);
`);

// 5. Clinician attestation and itemized decisions
db.exec(`
CREATE TABLE IF NOT EXISTS clinician_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  analysis_id INTEGER NOT NULL REFERENCES ai_analyses(id),
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  reviewer_user_id INTEGER NOT NULL REFERENCES user_accounts(id),
  review_status TEXT NOT NULL, -- accepted_as_is, accepted_with_edits, rejected_false_positive
  clinical_notes TEXT,
  reviewed_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clinician_finding_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES clinician_reviews(id),
  finding_id INTEGER NOT NULL REFERENCES ai_findings(id),
  decision TEXT NOT NULL, -- confirmed, rejected, adjusted
  confirmed_condition TEXT,
  treatment_recommended TEXT
);
`);

// 6. HIPAA / GDPR audit logging
db.exec(`
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  practice_id INTEGER REFERENCES practices(id),
  user_account_id INTEGER REFERENCES user_accounts(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// 7. Safe patient matching quarantine queue
db.exec(`
CREATE TABLE IF NOT EXISTS quarantine_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  file_storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_format TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  sha256_hash TEXT NOT NULL,
  candidate_patient_id INTEGER REFERENCES patients(id),
  extracted_metadata_json TEXT,
  quarantine_reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending_review', -- pending_review, resolved_linked, rejected
  resolved_by_user_id INTEGER REFERENCES user_accounts(id),
  resolved_patient_id INTEGER REFERENCES patients(id),
  resolved_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Safe unique constraints and indexes for new architecture
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_uuid ON patients(canonical_uuid)`); } catch(e) {}
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_mrn ON patients(practice_id, medical_record_number)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_imaging_studies_patient ON imaging_studies(patient_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_imaging_files_study ON imaging_files(study_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_analyses_file ON ai_analyses(imaging_file_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_findings_analysis ON ai_findings(analysis_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_clinician_reviews_analysis ON clinician_reviews(analysis_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_events_practice ON audit_events(practice_id)`); } catch(e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_quarantine_practice ON quarantine_records(practice_id)`); } catch(e) {}

// Deterministic Backfill for Existing Patients
import('crypto').then(({ randomUUID }) => {
  try {
    const unmigrated = db.prepare(`
      SELECT id, practice_id, name, medical_notes, canonical_uuid, medical_record_number, allergies_json, medical_alerts_json
      FROM patients
      WHERE canonical_uuid IS NULL OR medical_record_number IS NULL
    `).all();

    if (unmigrated.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE patients
        SET canonical_uuid = ?,
            medical_record_number = ?,
            allergies_json = ?,
            medical_alerts_json = ?,
            matching_status = COALESCE(matching_status, 'verified')
        WHERE id = ?
      `);

      const runTx = db.transaction(() => {
        for (const pat of unmigrated) {
          const canonicalUuid = pat.canonical_uuid || randomUUID();
          const practiceId = pat.practice_id || 1;
          const mrn = pat.medical_record_number || `MRN-${practiceId}-${String(pat.id).padStart(6, '0')}`;

          let allergies = [];
          try {
            if (pat.allergies_json) allergies = JSON.parse(pat.allergies_json);
          } catch(e) {}
          if (allergies.length === 0 && pat.medical_notes) {
            if (/penicillin/i.test(pat.medical_notes)) allergies.push('Penicillin');
            if (/latex/i.test(pat.medical_notes)) allergies.push('Latex');
            if (/sulfa/i.test(pat.medical_notes)) allergies.push('Sulfa');
            if (/aspirin/i.test(pat.medical_notes)) allergies.push('Aspirin');
          }

          let alerts = [];
          try {
            if (pat.medical_alerts_json) alerts = JSON.parse(pat.medical_alerts_json);
          } catch(e) {}
          if (alerts.length === 0 && pat.medical_notes) {
            if (/hypertension/i.test(pat.medical_notes)) alerts.push('Hypertension');
            if (/diabetes/i.test(pat.medical_notes)) alerts.push('Diabetes');
            if (/anticoagulant|blood thinner/i.test(pat.medical_notes)) alerts.push('Blood Thinners / Anticoagulant');
          }

          updateStmt.run(
            canonicalUuid,
            mrn,
            JSON.stringify(allergies),
            JSON.stringify(alerts),
            pat.id
          );
        }
      });
      runTx();
    }
  } catch(err) {
    console.error('Error during patient backfill migration:', err);
  }
}).catch(() => {});

export default db;
