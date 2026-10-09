// Required env var: ELEVENLABS_API_KEY=<your_elevenlabs_api_key>
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const isProduction = process.env.NODE_ENV === 'production';
let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  const secretFilename = isProduction ? '.jwt_secret_prod' : '.jwt_secret_dev';
  const secretFile = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), secretFilename);
  try {
    if (fs.existsSync(secretFile)) {
      JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
    } else {
      JWT_SECRET = crypto.randomBytes(32).toString('hex'); // 64 cryptographically secure hex characters
      fs.writeFileSync(secretFile, JWT_SECRET, 'utf8');
    }
  } catch {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
  }
  if (isProduction) {
    console.warn('[Security Warning] JWT_SECRET environment variable was not set. Generated a persistent 64-character secret. For multi-instance scaling, configure JWT_SECRET in your hosting environment variables.');
  }
} else if (isProduction && (JWT_SECRET.length < 32 || JWT_SECRET.includes('change_in_production'))) {
  throw new Error(
    'FATAL: When JWT_SECRET is provided in production, it must be at least 32 characters long and cannot use placeholder values.'
  );
}
const JWT_EXPIRES = '24h';

const PRACTICE_ID = 1; // single-practice Phase 1 scope

// ===================== RATE LIMITING =====================

const loginAttempts = new Map(); // ip_username -> { count, resetAt }
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = (req.body.username || '').toLowerCase().trim();
  const key = `${ip}_${username}`;
  const now = Date.now();

  const record = loginAttempts.get(key);
  if (record) {
    if (now < record.resetAt) {
      if (record.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: `Too many failed login attempts. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
          retryAfter: retryAfterSeconds
        });
      }
    } else {
      loginAttempts.delete(key);
    }
  }
  next();
}

function recordLoginFailure(req) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = (req.body.username || '').toLowerCase().trim();
  const key = `${ip}_${username}`;
  const now = Date.now();

  const record = loginAttempts.get(key);
  if (!record || now >= record.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_LOCKOUT_MS });
  } else {
    record.count += 1;
  }
}

function clearLoginAttempts(req) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = (req.body.username || '').toLowerCase().trim();
  loginAttempts.delete(`${ip}_${username}`);
}

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now >= record.resetAt) loginAttempts.delete(key);
  }
}, 15 * 60 * 1000);

// ===================== AUTH MIDDLEWARE =====================

function generateToken(account) {
  return jwt.sign({
    id: account.id,
    role: account.role,
    practice_id: account.practice_id,
    patient_id: account.patient_id,
    staff_user_id: account.staff_user_id,
    display_name: account.display_name
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function staffOnly(req, res, next) {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
}

function patientOnly(req, res, next) {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access required' });
  }
  next();
}

// Optional auth middleware for endpoints that behave differently when authenticated
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // ignore invalid optional token
    }
  }
  next();
}

// ===================== AUTH ENDPOINTS =====================

// Public self-registration (Patients only; creates their own patient record)
app.post('/api/auth/register', optionalAuth, async (req, res) => {
  try {
    const { username, password, role, patient_id, display_name, first_name, last_name, phone, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // 1. Disable public staff registration
    if (role === 'staff') {
      if (!req.user || req.user.role !== 'staff') {
        return res.status(403).json({
          error: 'Public staff registration is disabled. Staff accounts must be provisioned by an authorized administrator.'
        });
      }
    }

    // 2. Prevent arbitrary patient ID linking during public registration
    if (patient_id) {
      if (!req.user || req.user.role !== 'staff') {
        return res.status(400).json({
          error: 'Specifying arbitrary patient_id during public registration is not permitted.'
        });
      }
    }

    // Check username uniqueness
    const existing = db.prepare('SELECT id FROM user_accounts WHERE username = ?').get(username.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    let linkedPatientId = null;

    if (role === 'staff' && req.user && req.user.role === 'staff') {
      // Authorized staff creation
      const info = db.prepare(
        `INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
         VALUES (?, ?, ?, 'staff', NULL, NULL, ?)`
      ).run(PRACTICE_ID, username.toLowerCase().trim(), password_hash, display_name || username);

      return res.status(201).json({
        ok: true,
        user: { id: info.lastInsertRowid, username: username.toLowerCase().trim(), role: 'staff', display_name: display_name || username }
      });
    }

    // Patient registration: automatically create their own patient record
    const fullName = [first_name, last_name].filter(Boolean).join(' ') || display_name || username;
    const registerPatientTx = db.transaction(() => {
      const pInfo = db.prepare(`
        INSERT INTO patients (practice_id, name, first_name, last_name, phone, email, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(PRACTICE_ID, fullName, first_name || null, last_name || null, phone || null, email || null);

      linkedPatientId = pInfo.lastInsertRowid;

      const accInfo = db.prepare(
        `INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
         VALUES (?, ?, ?, 'patient', NULL, ?, ?)`
      ).run(PRACTICE_ID, username.toLowerCase().trim(), password_hash, linkedPatientId, fullName);

      return accInfo.lastInsertRowid;
    });

    const accountId = registerPatientTx();
    const account = db.prepare('SELECT * FROM user_accounts WHERE id = ?').get(accountId);
    const token = generateToken(account);

    res.status(201).json({
      token,
      user: {
        id: account.id,
        username: account.username,
        role: account.role,
        display_name: account.display_name,
        patient_id: account.patient_id
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Authorized staff account creation (Staff only)
app.post('/api/auth/staff-accounts', authMiddleware, staffOnly, async (req, res) => {
  try {
    const { username, password, display_name, email } = req.body;
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'Username, password, and display name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const existing = db.prepare('SELECT id FROM user_accounts WHERE username = ?').get(username.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const staffUser = db.prepare('INSERT INTO users (practice_id, name, role, email) VALUES (?, ?, ?, ?)').run(
      PRACTICE_ID, display_name, 'staff', email || null
    );

    const info = db.prepare(
      `INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
       VALUES (?, ?, ?, 'staff', ?, NULL, ?)`
    ).run(PRACTICE_ID, username.toLowerCase().trim(), password_hash, staffUser.lastInsertRowid, display_name);

    res.status(201).json({
      ok: true,
      user: {
        id: info.lastInsertRowid,
        username: username.toLowerCase().trim(),
        role: 'staff',
        display_name
      }
    });
  } catch (err) {
    console.error('Staff account creation error:', err);
    res.status(500).json({ error: 'Failed to create staff account' });
  }
});

// Authorized patient account provisioning for verified patients (Staff only)
app.post('/api/auth/patient-accounts', authMiddleware, staffOnly, async (req, res) => {
  try {
    const { patient_id, username, password, display_name } = req.body;
    if (!patient_id || !username || !password) {
      return res.status(400).json({ error: 'patient_id, username, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Verify patient exists
    const patient = db.prepare('SELECT id, name FROM patients WHERE id = ? AND practice_id = ?').get(patient_id, PRACTICE_ID);
    if (!patient) {
      return res.status(404).json({ error: 'Verified patient record not found' });
    }

    // Check if patient already has an account
    const existingPatientAcc = db.prepare('SELECT id FROM user_accounts WHERE patient_id = ?').get(patient_id);
    if (existingPatientAcc) {
      return res.status(409).json({ error: 'This patient already has an active portal account' });
    }

    const existingUser = db.prepare('SELECT id FROM user_accounts WHERE username = ?').get(username.toLowerCase().trim());
    if (existingUser) {
      return res.status(409).json({ error: 'Username already in use' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const info = db.prepare(
      `INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
       VALUES (?, ?, ?, 'patient', NULL, ?, ?)`
    ).run(PRACTICE_ID, username.toLowerCase().trim(), password_hash, patient_id, display_name || patient.name);

    res.status(201).json({
      ok: true,
      user: {
        id: info.lastInsertRowid,
        username: username.toLowerCase().trim(),
        role: 'patient',
        patient_id,
        display_name: display_name || patient.name
      }
    });
  } catch (err) {
    console.error('Patient account provisioning error:', err);
    res.status(500).json({ error: 'Failed to provision patient account' });
  }
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const account = db.prepare('SELECT * FROM user_accounts WHERE username = ?').get(username.toLowerCase().trim());
    if (!account) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Login succeeded: clear rate limiter
    clearLoginAttempts(req);

    // Update last login timestamp
    db.prepare('UPDATE user_accounts SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(account.id);

    const token = generateToken(account);
    res.json({
      token,
      user: {
        id: account.id,
        username: account.username,
        role: account.role,
        display_name: account.display_name,
        patient_id: account.patient_id
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const account = db.prepare('SELECT id, username, role, display_name, patient_id, practice_id FROM user_accounts WHERE id = ?').get(req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json(account);
});

// ===================== SEED DEFAULT ACCOUNTS =====================
// In production, demo accounts are never automatically seeded
(async function seedDefaultAccounts() {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEMO_SEEDING) {
      if (process.env.INITIAL_ADMIN_USERNAME && process.env.INITIAL_ADMIN_PASSWORD) {
        const staffCount = db.prepare('SELECT COUNT(*) as c FROM user_accounts WHERE role = ?').get('staff').c;
        if (staffCount === 0) {
          const hash = await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD, 12);
          db.prepare(
            `INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
             VALUES (?, ?, ?, 'staff', 1, NULL, 'System Administrator')`
          ).run(PRACTICE_ID, process.env.INITIAL_ADMIN_USERNAME.toLowerCase().trim(), hash);
          console.log(`[Auth] Initial production staff administrator created: ${process.env.INITIAL_ADMIN_USERNAME}`);
        }
      } else {
        console.log('[Auth] Production mode active: Demo accounts are not automatically seeded.');
      }
      return;
    }

    // Development demo account auto-seeding
    const staffCount = db.prepare('SELECT COUNT(*) as c FROM user_accounts WHERE role = ?').get('staff').c;
    if (staffCount === 0) {
      const hash = await bcrypt.hash('admin123', 12);
      db.prepare(
        `INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(PRACTICE_ID, 'admin', hash, 'staff', 1, null, 'Dr. Sarah Mitchell');
      console.log('[Auth] Development staff account initialized: admin');
    }

    const patientCount = db.prepare('SELECT COUNT(*) as c FROM user_accounts WHERE role = ?').get('patient').c;
    if (patientCount === 0) {
      const patients = db.prepare('SELECT id, name, email FROM patients WHERE practice_id = ? LIMIT 3').all(PRACTICE_ID);
      for (const p of patients) {
        const username = p.email ? p.email.split('@')[0] : `patient${p.id}`;
        const hash = await bcrypt.hash('patient123', 12);
        try {
          db.prepare(
            `INSERT INTO user_accounts (practice_id, username, password_hash, role, patient_id, display_name)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(PRACTICE_ID, username, hash, 'patient', p.id, p.name);
        } catch { /* skip if conflict */ }
      }
    }
  } catch(e) {
    console.log('[Auth] Account seeding skipped:', e.message);
  }
})();

// Seed default message templates
(function seedMessageTemplates() {
  const count = db.prepare('SELECT COUNT(*) as c FROM message_templates WHERE practice_id = ?').get(PRACTICE_ID).c;
  if (count === 0) {
    const templates = [
      {
        trigger_type: 'appointment_reminder',
        name: 'Appointment Reminder (30 min)',
        template_text: 'Hello {{patient_name}}, this is a reminder of your dental appointment with {{practitioner_name}} on {{appointment_date}} at {{appointment_time}}. Please contact us if you need to make any changes. — DentalFlow Downtown'
      },
      {
        trigger_type: 'no_show',
        name: 'No-Show Follow-up',
        template_text: 'Hello {{patient_name}}, we noticed you were unable to attend your appointment on {{appointment_date}} at {{appointment_time}} with {{practitioner_name}}. We would love to help you reschedule at a convenient time. Please call us or reply to book a new appointment. — DentalFlow Downtown'
      },
      {
        trigger_type: 'cancellation',
        name: 'Cancellation Follow-up',
        template_text: 'Hello {{patient_name}}, we are sorry to hear you had to cancel your appointment on {{appointment_date}} with {{practitioner_name}}. We would be happy to reschedule at your convenience. Please call us or reply to find a new time. — DentalFlow Downtown'
      },
      {
        trigger_type: 'missed_call',
        name: 'Missed Call Follow-up',
        template_text: 'Hello {{patient_name}}, we noticed we missed your call. We apologize for the inconvenience. Our team is available Monday–Friday 8 AM–6 PM and Saturdays 9 AM–1 PM. Please call us back or reply, and we will be happy to assist you. — DentalFlow Downtown'
      }
    ];
    const stmt = db.prepare(
      `INSERT INTO message_templates (practice_id, trigger_type, name, template_text) VALUES (?, ?, ?, ?)`
    );
    for (const t of templates) {
      stmt.run(PRACTICE_ID, t.trigger_type, t.name, t.template_text);
    }
    console.log('[Templates] Default message templates seeded');
  }
})();

// Seed default practitioner availability
(function seedPractitionerAvailability() {
  const count = db.prepare('SELECT COUNT(*) as c FROM practitioner_availability').get().c;
  if (count === 0) {
    const practitioners = db.prepare('SELECT id FROM practitioners WHERE practice_id = ?').all(PRACTICE_ID);
    const stmt = db.prepare(
      `INSERT INTO practitioner_availability (practitioner_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES (?, ?, ?, ?, ?)`
    );
    for (const p of practitioners) {
      // Monday-Friday, 08:00-18:00, 30-min slots
      for (let day = 1; day <= 5; day++) {
        stmt.run(p.id, day, '08:00', '18:00', 30);
      }
    }
    console.log('[Availability] Default practitioner availability seeded');
  }
})();

// ===================== PATIENT PORTAL ENDPOINTS =====================

// Patient dashboard summary
app.get('/api/patient/dashboard', authMiddleware, patientOnly, (req, res) => {
  const patientId = req.user.patient_id;
  const now = new Date().toISOString();

  const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND practice_id = ?').get(patientId, PRACTICE_ID);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  // Next upcoming appointment (or nearest booked appointment)
  let nextAppointment = db.prepare(`
    SELECT a.*, pr.name as practitioner_name, pr.specialty as practitioner_specialty
    FROM appointments a
    JOIN practitioners pr ON pr.id = a.practitioner_id
    WHERE a.patient_id = ? AND a.practice_id = ? AND a.status = 'booked' AND a.start_time >= ?
    ORDER BY a.start_time ASC LIMIT 1
  `).get(patientId, PRACTICE_ID, now.slice(0, 19));

  // Fallback if no future appointment: show most recent booked appointment
  if (!nextAppointment) {
    nextAppointment = db.prepare(`
      SELECT a.*, pr.name as practitioner_name, pr.specialty as practitioner_specialty
      FROM appointments a
      JOIN practitioners pr ON pr.id = a.practitioner_id
      WHERE a.patient_id = ? AND a.practice_id = ? AND a.status = 'booked'
      ORDER BY a.start_time DESC LIMIT 1
    `).get(patientId, PRACTICE_ID);
  }

  const totalAppointments = db.prepare(
    `SELECT COUNT(*) as c FROM appointments WHERE patient_id = ? AND practice_id = ?`
  ).get(patientId, PRACTICE_ID).c;

  const completedVisits = db.prepare(
    `SELECT COUNT(*) as c FROM appointments WHERE patient_id = ? AND practice_id = ? AND status = 'completed'`
  ).get(patientId, PRACTICE_ID).c;

  res.json({
    patient: { id: patient.id, name: patient.name, email: patient.email, phone: patient.phone },
    patient_name: patient.name,
    next_appointment: nextAppointment || null,
    total_appointments: totalAppointments,
    total_completed: completedVisits,
    completed_visits: completedVisits
  });
});

// Patient appointments list
app.get('/api/patient/appointments', authMiddleware, patientOnly, (req, res) => {
  const patientId = req.user.patient_id;
  const rows = db.prepare(`
    SELECT a.*, pr.name as practitioner_name
    FROM appointments a
    JOIN practitioners pr ON pr.id = a.practitioner_id
    WHERE a.patient_id = ? AND a.practice_id = ?
    ORDER BY a.start_time DESC
  `).all(patientId, PRACTICE_ID);
  res.json(rows);
});

// Patient: get available appointment types
app.get('/api/patient/appointment-types', authMiddleware, patientOnly, (req, res) => {
  res.json([
    { id: 'hygiene', name: 'Hygiene & Cleaning', duration: 30, fee: 120 },
    { id: 'checkup', name: 'Check-up', duration: 30, fee: 150 },
    { id: 'whitening', name: 'Teeth Whitening', duration: 60, fee: 400 },
    { id: 'extraction', name: 'Extraction', duration: 45, fee: 250 },
    { id: 'consultation', name: 'Consultation', duration: 30, fee: 100 },
    { id: 'orthodontics', name: 'Orthodontics Consult', duration: 45, fee: 220 },
  ]);
});

// Patient: get practitioners for booking
app.get('/api/patient/practitioners', authMiddleware, patientOnly, (req, res) => {
  const rows = db.prepare(`SELECT id, name, specialty, title FROM practitioners WHERE practice_id = ?`).all(PRACTICE_ID);
  res.json(rows);
});

// Patient: get available slots for a practitioner on a date
app.get('/api/patient/available-slots', authMiddleware, patientOnly, (req, res) => {
  const { practitioner_id, date, duration } = req.query;
  if (!practitioner_id || !date) {
    return res.status(400).json({ error: 'practitioner_id and date are required' });
  }

  const slotDuration = parseInt(duration) || 30;
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Sunday...6=Saturday

  // Get practitioner availability for this day
  const availability = db.prepare(`
    SELECT * FROM practitioner_availability
    WHERE practitioner_id = ? AND day_of_week = ?
  `).all(parseInt(practitioner_id), dayOfWeek);

  if (availability.length === 0) {
    return res.json([]);
  }

  // Get existing appointments for this practitioner on this date
  const existingAppts = db.prepare(`
    SELECT start_time, end_time FROM appointments
    WHERE practitioner_id = ? AND practice_id = ? AND date(start_time) = ? AND status != 'cancelled'
  `).all(parseInt(practitioner_id), PRACTICE_ID, date);

  const bookedSlots = existingAppts.map(a => ({
    start: a.start_time,
    end: a.end_time
  }));

  // Generate available time slots
  const slots = [];
  const now = new Date();

  for (const avail of availability) {
    const [startH, startM] = avail.start_time.split(':').map(Number);
    const [endH, endM] = avail.end_time.split(':').map(Number);
    const totalStartMin = startH * 60 + startM;
    const totalEndMin = endH * 60 + endM;

    for (let min = totalStartMin; min + slotDuration <= totalEndMin; min += slotDuration) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const slotStart = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      const slotEndMin = min + slotDuration;
      const eh = Math.floor(slotEndMin / 60);
      const em = slotEndMin % 60;
      const slotEnd = `${date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;

      // Check if slot is in the past
      const slotDate = new Date(slotStart);
      if (slotDate <= now) continue;

      // Check for conflicts
      const hasConflict = bookedSlots.some(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        const sStart = new Date(slotStart);
        const sEnd = new Date(slotEnd);
        return sStart < bEnd && sEnd > bStart;
      });

      if (!hasConflict) {
        slots.push({
          start_time: slotStart,
          end_time: slotEnd,
          display: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        });
      }
    }
  }

  res.json(slots);
});

// ===================== APPOINTMENT CATALOG & TRANSACTIONAL BOOKING =====================

const APPOINTMENT_CATALOG = {
  'hygiene': { name: 'Dental Hygiene & Cleaning', duration: 30, fee: 120 },
  'checkup': { name: 'Routine Check-up & Exam', duration: 30, fee: 150 },
  'whitening': { name: 'Teeth Whitening', duration: 60, fee: 350 },
  'ortho': { name: 'Orthodontic / Invisalign Consult', duration: 45, fee: 220 },
  'emergency': { name: 'Emergency Dental Consultation', duration: 45, fee: 180 },
  'extraction': { name: 'Extraction', duration: 45, fee: 200 },
  'filling': { name: 'Cavity Filling / Composite Resin', duration: 45, fee: 180 },
  'root_canal': { name: 'Root Canal Treatment', duration: 60, fee: 400 },
};

function resolveAppointmentType(inputName) {
  if (!inputName) return { name: 'Routine Check-up', duration: 30, fee: 150 };
  const lower = String(inputName).toLowerCase().trim();
  for (const [key, val] of Object.entries(APPOINTMENT_CATALOG)) {
    if (val.name.toLowerCase() === lower || key === lower || lower.includes(key)) {
      return val;
    }
  }
  return { name: String(inputName).slice(0, 80), duration: 30, fee: 150 };
}

function executeAppointmentBooking(data) {
  const {
    practiceId,
    patientId,
    practitionerId,
    startTimeStr,
    durationMinutes,
    reason,
    fee,
    bookedByAi = 0
  } = data;

  const startDate = new Date(startTimeStr);
  if (isNaN(startDate.getTime())) {
    const err = new Error('Invalid start_time format');
    err.statusCode = 400;
    throw err;
  }
  if (startDate.getTime() <= Date.now()) {
    const err = new Error('Appointments must be booked for a future date and time');
    err.statusCode = 400;
    throw err;
  }

  // Calculate effective end time BEFORE conflict check
  const duration = Math.max(10, Math.min(240, Number(durationMinutes) || 30));
  const endDate = new Date(startDate.getTime() + duration * 60000);
  const isoStart = startDate.toISOString().slice(0, 19);
  const isoEnd = endDate.toISOString().slice(0, 19);

  // Validate practitioner exists
  const pract = db.prepare('SELECT id, name FROM practitioners WHERE id = ? AND practice_id = ?').get(practitionerId, practiceId);
  if (!pract) {
    const err = new Error('Practitioner not found');
    err.statusCode = 404;
    throw err;
  }

  // Validate practitioner availability rules
  const dayOfWeek = startDate.getDay();
  const startHM = startDate.toTimeString().slice(0, 5);
  const endHM = endDate.toTimeString().slice(0, 5);

  const avail = db.prepare('SELECT * FROM practitioner_availability WHERE practitioner_id = ? AND day_of_week = ?').get(practitionerId, dayOfWeek);
  if (avail) {
    if (startHM < avail.start_time || endHM > avail.end_time) {
      const err = new Error(`Practitioner is only available between ${avail.start_time} and ${avail.end_time} on this day.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (dayOfWeek === 0) {
    const err = new Error('The clinic is closed on Sundays.');
    err.statusCode = 400;
    throw err;
  }

  // Transactional overlap check and creation
  const bookTx = db.transaction(() => {
    // Conflict condition: any booked or completed appointment overlapping [isoStart, isoEnd)
    const conflict = db.prepare(`
      SELECT id, start_time, end_time, reason FROM appointments
      WHERE practitioner_id = ? AND practice_id = ?
        AND status IN ('booked', 'completed')
        AND start_time < ?
        AND COALESCE(NULLIF(end_time, ''), datetime(start_time, '+30 minutes')) > ?
      LIMIT 1
    `).get(practitionerId, practiceId, isoEnd, isoStart);

    if (conflict) {
      const err = new Error('APPOINTMENT_CONFLICT');
      err.statusCode = 409;
      err.conflict = conflict;
      throw err;
    }

    const info = db.prepare(`
      INSERT INTO appointments (practice_id, patient_id, practitioner_id, start_time, end_time, status, reason, fee, booked_by_ai)
      VALUES (?, ?, ?, ?, ?, 'booked', ?, ?, ?)
    `).run(practiceId, patientId, practitionerId, isoStart, isoEnd, reason, fee, bookedByAi);

    return { id: info.lastInsertRowid, start_time: isoStart, end_time: isoEnd, fee };
  });

  return bookTx();
}

// Patient: book appointment with server-validated fees, durations, and transactional conflict check
app.post('/api/patient/appointments', authMiddleware, patientOnly, (req, res) => {
  const patientId = req.user.patient_id;
  const { practitioner_id, start_time, reason, appointment_type } = req.body;

  if (!practitioner_id || !start_time) {
    return res.status(400).json({ error: 'Practitioner and appointment time are required' });
  }

  // Server-determined fee and duration — never trust client overrides for patients
  const catalogEntry = resolveAppointmentType(appointment_type || reason);

  try {
    const result = executeAppointmentBooking({
      practiceId: PRACTICE_ID,
      patientId,
      practitionerId: Number(practitioner_id),
      startTimeStr: start_time,
      durationMinutes: catalogEntry.duration,
      reason: catalogEntry.name,
      fee: catalogEntry.fee,
      bookedByAi: 0
    });

    res.status(201).json({
      id: result.id,
      message: 'Appointment booked successfully',
      start_time: result.start_time,
      end_time: result.end_time,
      fee: result.fee
    });
  } catch (err) {
    if (err.statusCode === 409 || err.message === 'APPOINTMENT_CONFLICT') {
      return res.status(409).json({
        error: 'This time slot overlaps with an existing appointment for the selected practitioner. Please choose another time.'
      });
    }
    return res.status(err.statusCode || 400).json({ error: err.message || 'Booking failed' });
  }
});

// Patient: get treatment plans
app.get('/api/patient/treatment-plans', authMiddleware, patientOnly, (req, res) => {
  const patientId = req.user.patient_id;
  const rows = db.prepare(`
    SELECT tp.*, pr.name as practitioner_name
    FROM treatment_plans tp
    LEFT JOIN practitioners pr ON pr.id = tp.practitioner_id
    WHERE tp.patient_id = ? AND tp.practice_id = ?
    ORDER BY tp.created_at DESC
  `).all(patientId, PRACTICE_ID);
  res.json(rows);
});


// ===================== STAFF ENDPOINTS (existing + enhanced) =====================

// --- Dashboard summary ---
app.get('/api/dashboard/summary', authMiddleware, staffOnly, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const todaysAppointments = db.prepare(
    `SELECT COUNT(*) c FROM appointments WHERE practice_id = ? AND date(start_time) = ? AND status != 'cancelled'`
  ).get(PRACTICE_ID, today).c;

  const activePatients = db.prepare(
    `SELECT COUNT(*) c FROM patients WHERE practice_id = ? AND status = 'active'`
  ).get(PRACTICE_ID).c;

  const missedCalls = db.prepare(
    `SELECT COUNT(*) c FROM enquiries WHERE practice_id = ? AND status = 'missed'`
  ).get(PRACTICE_ID).c;

  const pendingFollowUps = db.prepare(
    `SELECT COUNT(*) c FROM follow_ups WHERE practice_id = ? AND status = 'pending'`
  ).get(PRACTICE_ID).c;

  const missedAppointments = db.prepare(
    `SELECT COUNT(*) c FROM appointments WHERE practice_id = ? AND status = 'missed'`
  ).get(PRACTICE_ID).c;

  const revenueRow = db.prepare(
    `SELECT COALESCE(SUM(fee), 0) as total FROM appointments
     WHERE practice_id = ? AND status = 'completed' AND strftime('%Y-%m', start_time) = strftime('%Y-%m', 'now')`
  ).get(PRACTICE_ID);
  const revenueProtected = revenueRow.total;
  const conversionRate = (() => {
    const totalEnquiries = db.prepare(`SELECT COUNT(*) c FROM enquiries WHERE practice_id = ?`).get(PRACTICE_ID).c;
    const resolvedEnquiries = db.prepare(`SELECT COUNT(*) c FROM enquiries WHERE practice_id = ? AND status = 'resolved'`).get(PRACTICE_ID).c;
    return totalEnquiries > 0 ? Number(((resolvedEnquiries / totalEnquiries) * 100).toFixed(1)) : 0;
  })();

  const callsHandledAfterHours = db.prepare(
    `SELECT COUNT(*) c FROM call_logs WHERE practice_id = ? AND is_after_hours = 1`
  ).get(PRACTICE_ID).c;

  const missedCallsWonBack = db.prepare(
    `SELECT COUNT(*) c FROM call_logs WHERE practice_id = ? AND is_won_back = 1`
  ).get(PRACTICE_ID).c;

  const treatmentRevenueAi = db.prepare(
    `SELECT COALESCE(SUM(a.fee), 0) as total FROM appointments a WHERE a.practice_id = ? AND a.booked_by_ai = 1 AND a.status != 'cancelled'`
  ).get(PRACTICE_ID).total;

  res.json({
    todaysAppointments,
    activePatients,
    revenueProtected,
    conversionRate,
    missedCalls,
    missedAppointments,
    pendingFollowUps,
    date: today,
    callsHandledAfterHours,
    missedCallsWonBack,
    treatmentRevenueAi
  });
});

// --- Alerts ---
app.get('/api/alerts', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM alerts WHERE practice_id = ? AND status = 'active' ORDER BY
     CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at DESC`
  ).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/alerts/:id/dismiss', authMiddleware, staffOnly, (req, res) => {
  db.prepare(`UPDATE alerts SET status = 'dismissed' WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Appointments ---
app.get('/api/appointments', authMiddleware, staffOnly, (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = db.prepare(
      `SELECT a.*, p.name as patient_name, pr.name as practitioner_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN practitioners pr ON pr.id = a.practitioner_id
       WHERE a.practice_id = ? AND date(a.start_time) = ?
       ORDER BY a.start_time`
    ).all(PRACTICE_ID, date);
  } else {
    rows = db.prepare(
      `SELECT a.*, p.name as patient_name, pr.name as practitioner_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN practitioners pr ON pr.id = a.practitioner_id
       WHERE a.practice_id = ?
       ORDER BY a.start_time`
    ).all(PRACTICE_ID);
  }
  res.json(rows);
});

app.post('/api/appointments', authMiddleware, staffOnly, (req, res) => {
  const { patient_id, practitioner_id, start_time, end_time, reason, fee } = req.body;

  if (!patient_id || !practitioner_id || !start_time) {
    return res.status(400).json({ error: 'patient_id, practitioner_id, and start_time are required' });
  }

  // Validate fee: must be a non-negative finite number
  const parsedFee = Number(fee);
  if (fee === undefined || fee === null || fee === '' || !Number.isFinite(parsedFee) || parsedFee < 0) {
    return res.status(400).json({ error: 'fee is required and must be a non-negative number' });
  }

  // Calculate duration if end_time is provided, otherwise fallback to catalog or 30 min
  let durationMinutes = 30;
  if (end_time && start_time) {
    const diff = Math.round((new Date(end_time) - new Date(start_time)) / 60000);
    if (diff > 0 && diff <= 360) durationMinutes = diff;
  } else {
    durationMinutes = resolveAppointmentType(reason).duration;
  }

  try {
    const result = executeAppointmentBooking({
      practiceId: PRACTICE_ID,
      patientId: Number(patient_id),
      practitionerId: Number(practitioner_id),
      startTimeStr: start_time,
      durationMinutes,
      reason: reason || 'Dental Consultation',
      fee: parsedFee,
      bookedByAi: 0
    });

    res.status(201).json({ id: result.id, start_time: result.start_time, end_time: result.end_time, fee: result.fee });
  } catch (err) {
    if (err.statusCode === 409 || err.message === 'APPOINTMENT_CONFLICT') {
      return res.status(409).json({
        error: 'This time slot overlaps with an existing appointment for the selected practitioner. Please choose another time.'
      });
    }
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to book appointment' });
  }
});

app.patch('/api/appointments/:id', authMiddleware, staffOnly, (req, res) => {
  const { status, fee } = req.body;
  const oldAppt = db.prepare('SELECT * FROM appointments WHERE id = ? AND practice_id = ?').get(req.params.id, PRACTICE_ID);

  // Validate fee if provided
  if (fee !== undefined && fee !== null) {
    const parsedFee = Number(fee);
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      return res.status(400).json({ error: 'fee must be a non-negative number' });
    }
    // Update both status and fee (COALESCE keeps existing value if null)
    db.prepare(
      `UPDATE appointments SET status = COALESCE(?, status), fee = ? WHERE id = ? AND practice_id = ?`
    ).run(status || null, parsedFee, req.params.id, PRACTICE_ID);
  } else {
    // Status-only update (backward compatible)
    db.prepare(
      `UPDATE appointments SET status = COALESCE(?, status) WHERE id = ? AND practice_id = ?`
    ).run(status || null, req.params.id, PRACTICE_ID);
  }

  // Auto-generate follow-up messages on status change
  if (status && oldAppt && oldAppt.status !== status) {
    if (status === 'missed') {
      generateFollowUpMessage(req.params.id, 'no_show');
    } else if (status === 'cancelled') {
      generateFollowUpMessage(req.params.id, 'cancellation');
    }
  }

  res.json({ ok: true });
});

// --- Patients ---
app.get('/api/patients', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(`SELECT * FROM patients WHERE practice_id = ? ORDER BY name`).all(PRACTICE_ID);
  res.json(rows);
});

app.get('/api/patients/:id', authMiddleware, staffOnly, (req, res) => {
  const patient = db.prepare(`SELECT * FROM patients WHERE id = ? AND practice_id = ?`).get(req.params.id, PRACTICE_ID);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json(patient);
});

app.post('/api/patients', authMiddleware, staffOnly, (req, res) => {
  const { first_name, last_name, phone, email, date_of_birth, gender, address, medical_notes, emergency_contact } = req.body;
  const name = [first_name, last_name].filter(Boolean).join(' ') || req.body.name;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const info = db.prepare(
    `INSERT INTO patients (practice_id, name, first_name, last_name, phone, email, status, date_of_birth, gender, address, medical_notes, emergency_contact)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, name, first_name || null, last_name || null, phone || null, email || null,
    date_of_birth || null, gender || null, address || null, medical_notes || null, emergency_contact || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// --- Practitioners ---
app.get('/api/practitioners', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(`SELECT * FROM practitioners WHERE practice_id = ? ORDER BY name`).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/practitioners', authMiddleware, staffOnly, (req, res) => {
  const { name, specialty, title, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const info = db.prepare(
    `INSERT INTO practitioners (practice_id, name, specialty, title, phone, email) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, name, specialty || null, title || null, phone || null, email || null);

  // Create default availability (Mon-Fri 8-18)
  const stmt = db.prepare(
    `INSERT INTO practitioner_availability (practitioner_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES (?, ?, ?, ?, ?)`
  );
  for (let day = 1; day <= 5; day++) {
    stmt.run(info.lastInsertRowid, day, '08:00', '18:00', 30);
  }

  res.status(201).json({ id: info.lastInsertRowid });
});

// --- Enquiries / Inbox ---
app.get('/api/enquiries', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(
    `SELECT e.*, p.name as patient_name FROM enquiries e
     LEFT JOIN patients p ON p.id = e.patient_id
     WHERE e.practice_id = ? ORDER BY e.created_at DESC`
  ).all(PRACTICE_ID);
  res.json(rows);
});

// --- Follow-ups ---
app.get('/api/follow-ups', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(
    `SELECT f.*, p.name as patient_name FROM follow_ups f
     JOIN patients p ON p.id = f.patient_id
     WHERE f.practice_id = ? AND f.status = 'pending'
     ORDER BY CASE f.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.due_date`
  ).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/follow-ups/:id/complete', authMiddleware, staffOnly, (req, res) => {
  db.prepare(`UPDATE follow_ups SET status = 'done' WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Suggested actions (derived view, Phase 1: rule-based, not AI yet) ---
app.get('/api/suggested-actions', authMiddleware, staffOnly, (req, res) => {
  const overdueHygiene = db.prepare(
    `SELECT COUNT(*) c FROM follow_ups WHERE practice_id = ? AND type = 'recall' AND status = 'pending'`
  ).get(PRACTICE_ID).c;
  const noShowRebook = db.prepare(
    `SELECT COUNT(*) c FROM follow_ups WHERE practice_id = ? AND type = 'no_show_rebook' AND status = 'pending'`
  ).get(PRACTICE_ID).c;
  const pendingMessages = db.prepare(
    `SELECT COUNT(*) c FROM follow_ups WHERE practice_id = ? AND type = 'pending_message' AND status = 'pending'`
  ).get(PRACTICE_ID).c;
  const consultFollowups = db.prepare(
    `SELECT COUNT(*) c FROM follow_ups WHERE practice_id = ? AND type = 'consult_followup' AND status = 'pending'`
  ).get(PRACTICE_ID).c;

  const actions = [];
  if (overdueHygiene > 0) actions.push({ priority: 'high', title: 'Patients overdue for hygiene', detail: `${overdueHygiene} patients have no visit in 6 months` });
  if (noShowRebook > 0) actions.push({ priority: 'high', title: 'Missed appointment rebooking', detail: `${noShowRebook} no-shows need rebooking` });
  if (pendingMessages > 0) actions.push({ priority: 'medium', title: 'Pending follow-ups to approve', detail: `${pendingMessages} messages waiting for approval` });
  if (consultFollowups > 0) actions.push({ priority: 'medium', title: 'Implant/treatment consultation follow-up', detail: `${consultFollowups} leads awaiting follow-up` });

  res.json(actions);
});

// --- Analytics (Phase 1: computed from real stored data) ---
app.get('/api/analytics', authMiddleware, staffOnly, (req, res) => {
  const revenueByMonth = db.prepare(`
    SELECT strftime('%Y-%m', start_time) as month, SUM(fee) as revenue, COUNT(*) as visits
    FROM appointments
    WHERE practice_id = ? AND status = 'completed'
    GROUP BY month ORDER BY month
  `).all(PRACTICE_ID);

  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count FROM appointments WHERE practice_id = ? GROUP BY status
  `).all(PRACTICE_ID);

  const patientGrowth = db.prepare(`
    SELECT id FROM patients WHERE practice_id = ? ORDER BY id
  `).all(PRACTICE_ID).length;

  const topPractitioners = db.prepare(`
    SELECT pr.name, COUNT(a.id) as appointment_count, SUM(a.fee) as revenue
    FROM appointments a JOIN practitioners pr ON pr.id = a.practitioner_id
    WHERE a.practice_id = ? AND a.status = 'completed'
    GROUP BY pr.id ORDER BY revenue DESC
  `).all(PRACTICE_ID);

  const totalRevenue = revenueByMonth.reduce((sum, r) => sum + (r.revenue || 0), 0);

  res.json({ revenueByMonth, statusBreakdown, totalPatients: patientGrowth, topPractitioners, totalRevenue });
});

// --- Enquiries: create ---
app.post('/api/enquiries', authMiddleware, staffOnly, (req, res) => {
  const { caller_name, source, status, notes, patient_id } = req.body;
  const info = db.prepare(
    `INSERT INTO enquiries (practice_id, patient_id, caller_name, source, status, notes) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, patient_id || null, caller_name, source || 'phone', status || 'open', notes || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch('/api/enquiries/:id', authMiddleware, staffOnly, (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE enquiries SET status = ? WHERE id = ? AND practice_id = ?`).run(status, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Follow-ups: create ---
app.post('/api/follow-ups', authMiddleware, staffOnly, (req, res) => {
  const { patient_id, type, priority, due_date, notes } = req.body;
  const info = db.prepare(
    `INSERT INTO follow_ups (practice_id, patient_id, type, priority, status, due_date, notes) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  ).run(PRACTICE_ID, patient_id, type, priority || 'medium', due_date || null, notes || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// --- Patients: edit + delete ---
app.patch('/api/patients/:id', authMiddleware, staffOnly, (req, res) => {
  const { name, first_name, last_name, phone, email, status, date_of_birth, gender, address, medical_notes, emergency_contact } = req.body;
  const fullName = (first_name || last_name) ? [first_name, last_name].filter(Boolean).join(' ') : name;
  db.prepare(`UPDATE patients SET
    name = COALESCE(?, name),
    first_name = COALESCE(?, first_name),
    last_name = COALESCE(?, last_name),
    phone = COALESCE(?, phone),
    email = COALESCE(?, email),
    status = COALESCE(?, status),
    date_of_birth = COALESCE(?, date_of_birth),
    gender = COALESCE(?, gender),
    address = COALESCE(?, address),
    medical_notes = COALESCE(?, medical_notes),
    emergency_contact = COALESCE(?, emergency_contact)
    WHERE id = ? AND practice_id = ?`)
    .run(fullName, first_name, last_name, phone, email, status, date_of_birth, gender, address, medical_notes, emergency_contact, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

app.delete('/api/patients/:id', authMiddleware, staffOnly, (req, res) => {
  db.prepare(`DELETE FROM patients WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

app.delete('/api/appointments/:id', authMiddleware, staffOnly, (req, res) => {
  db.prepare(`DELETE FROM appointments WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Treatment Plans (Staff management) ---
app.get('/api/treatment-plans', authMiddleware, staffOnly, (req, res) => {
  const { patient_id } = req.query;
  let rows;
  if (patient_id) {
    rows = db.prepare(`
      SELECT tp.*, p.name as patient_name, pr.name as practitioner_name
      FROM treatment_plans tp
      JOIN patients p ON p.id = tp.patient_id
      LEFT JOIN practitioners pr ON pr.id = tp.practitioner_id
      WHERE tp.practice_id = ? AND tp.patient_id = ?
      ORDER BY tp.created_at DESC
    `).all(PRACTICE_ID, patient_id);
  } else {
    rows = db.prepare(`
      SELECT tp.*, p.name as patient_name, pr.name as practitioner_name
      FROM treatment_plans tp
      JOIN patients p ON p.id = tp.patient_id
      LEFT JOIN practitioners pr ON pr.id = tp.practitioner_id
      WHERE tp.practice_id = ?
      ORDER BY tp.created_at DESC
    `).all(PRACTICE_ID);
  }
  res.json(rows);
});

app.post('/api/treatment-plans', authMiddleware, staffOnly, (req, res) => {
  const { patient_id, plan_name, procedure_name, practitioner_id, status, notes, start_date, end_date } = req.body;
  if (!patient_id || !plan_name) return res.status(400).json({ error: 'Patient and plan name are required' });

  const info = db.prepare(
    `INSERT INTO treatment_plans (practice_id, patient_id, plan_name, procedure_name, practitioner_id, status, notes, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, patient_id, plan_name, procedure_name || null, practitioner_id || null,
    status || 'planned', notes || null, start_date || null, end_date || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch('/api/treatment-plans/:id', authMiddleware, staffOnly, (req, res) => {
  const { plan_name, procedure_name, practitioner_id, status, notes, start_date, end_date } = req.body;
  db.prepare(`UPDATE treatment_plans SET
    plan_name = COALESCE(?, plan_name),
    procedure_name = COALESCE(?, procedure_name),
    practitioner_id = COALESCE(?, practitioner_id),
    status = COALESCE(?, status),
    notes = COALESCE(?, notes),
    start_date = COALESCE(?, start_date),
    end_date = COALESCE(?, end_date),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND practice_id = ?`)
    .run(plan_name, procedure_name, practitioner_id, status, notes, start_date, end_date, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// ===================== FOLLOW-UP MESSAGES SYSTEM =====================

// Helper: generate follow-up message from template
function generateFollowUpMessage(appointmentId, triggerType) {
  try {
    const appt = db.prepare(`
      SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.email as patient_email,
             pr.name as practitioner_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN practitioners pr ON pr.id = a.practitioner_id
      WHERE a.id = ? AND a.practice_id = ?
    `).get(appointmentId, PRACTICE_ID);

    if (!appt) return;

    // Check for duplicate trigger
    const triggerEventId = `${triggerType}_${appointmentId}`;
    const existing = db.prepare('SELECT id FROM follow_up_messages WHERE trigger_event_id = ?').get(triggerEventId);
    if (existing) return; // Already generated

    // Get template
    const template = db.prepare(
      'SELECT * FROM message_templates WHERE practice_id = ? AND trigger_type = ? AND is_active = 1 LIMIT 1'
    ).get(PRACTICE_ID, triggerType);

    if (!template) return;

    // Fill template
    const startDate = new Date(appt.start_time);
    const messageText = template.template_text
      .replace(/\{\{patient_name\}\}/g, appt.patient_name || 'Patient')
      .replace(/\{\{practitioner_name\}\}/g, appt.practitioner_name || 'your dentist')
      .replace(/\{\{appointment_date\}\}/g, startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
      .replace(/\{\{appointment_time\}\}/g, startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
      .replace(/\{\{practice_name\}\}/g, 'DentalFlow Downtown');

    db.prepare(`
      INSERT INTO follow_up_messages (practice_id, patient_id, appointment_id, trigger_type, trigger_event_id, message_text, template_id, status, delivery_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?)
    `).run(PRACTICE_ID, appt.patient_id, appointmentId, triggerType, triggerEventId, messageText, template.id,
      appt.patient_phone ? 'sms' : (appt.patient_email ? 'email' : 'sms'));

    console.log(`[FollowUp] Generated ${triggerType} message for appointment ${appointmentId}`);
  } catch (e) {
    console.error('[FollowUp] Error generating message:', e.message);
  }
}

// Generate missed call follow-up
function generateMissedCallMessage(callLogId) {
  try {
    const cl = db.prepare(`
      SELECT cl.*, p.name as patient_name, p.phone as patient_phone, p.email as patient_email
      FROM call_logs cl
      LEFT JOIN patients p ON p.id = cl.patient_id
      WHERE cl.id = ? AND cl.practice_id = ?
    `).get(callLogId, PRACTICE_ID);

    if (!cl) return;

    const triggerEventId = `missed_call_${callLogId}`;
    const existing = db.prepare('SELECT id FROM follow_up_messages WHERE trigger_event_id = ?').get(triggerEventId);
    if (existing) return;

    const template = db.prepare(
      'SELECT * FROM message_templates WHERE practice_id = ? AND trigger_type = ? AND is_active = 1 LIMIT 1'
    ).get(PRACTICE_ID, 'missed_call');

    if (!template) return;

    const messageText = template.template_text
      .replace(/\{\{patient_name\}\}/g, cl.patient_name || cl.caller_name || 'Patient')
      .replace(/\{\{practice_name\}\}/g, 'DentalFlow Downtown');

    db.prepare(`
      INSERT INTO follow_up_messages (practice_id, patient_id, call_log_id, trigger_type, trigger_event_id, message_text, template_id, status, delivery_method)
      VALUES (?, ?, ?, 'missed_call', ?, ?, ?, 'pending_approval', ?)
    `).run(PRACTICE_ID, cl.patient_id, callLogId, triggerEventId, messageText, template.id,
      cl.patient_phone || cl.caller_phone ? 'sms' : 'email');

    console.log(`[FollowUp] Generated missed_call message for call log ${callLogId}`);
  } catch (e) {
    console.error('[FollowUp] Error generating missed call message:', e.message);
  }
}

// Follow-up messages API endpoints
app.get('/api/follow-up-messages', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT fm.*, p.name as patient_name, p.phone as patient_phone, p.email as patient_email
    FROM follow_up_messages fm
    LEFT JOIN patients p ON p.id = fm.patient_id
    WHERE fm.practice_id = ?
    ORDER BY
      CASE fm.status WHEN 'pending_approval' THEN 0 WHEN 'approved' THEN 1 WHEN 'sending' THEN 2 ELSE 3 END,
      fm.created_at DESC
  `).all(PRACTICE_ID);
  res.json(rows);
});

app.patch('/api/follow-up-messages/:id', authMiddleware, staffOnly, (req, res) => {
  const { message_text, status } = req.body;
  if (message_text) {
    db.prepare('UPDATE follow_up_messages SET message_text = ? WHERE id = ? AND practice_id = ?')
      .run(message_text, req.params.id, PRACTICE_ID);
  }
  if (status) {
    if (status === 'sent' || status === 'approved' || status === 'sending') {
      return res.status(400).json({ error: 'Directly transitioning to sent/sending/approved via PATCH is not permitted. Use the approve and send workflow.' });
    }
    db.prepare('UPDATE follow_up_messages SET status = ? WHERE id = ? AND practice_id = ?')
      .run(status, req.params.id, PRACTICE_ID);
  }
  res.json({ ok: true });
});

// Approve & Send follow-up message (Real provider integration only, no fake success)
app.post('/api/follow-up-messages/:id/send', authMiddleware, staffOnly, async (req, res) => {
  try {
    const msg = db.prepare('SELECT * FROM follow_up_messages WHERE id = ? AND practice_id = ?').get(req.params.id, PRACTICE_ID);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    if (msg.status === 'sent') {
      return res.status(400).json({ error: 'Message has already been sent' });
    }
    if (msg.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot send a dismissed or cancelled message' });
    }

    // Atomic status transition to 'sending' to lock message and prevent duplicate sends
    const updateLock = db.prepare(`
      UPDATE follow_up_messages
      SET status = 'sending', staff_approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ? AND practice_id = ? AND status IN ('pending_approval', 'failed')
    `).run(req.user.id, msg.id, PRACTICE_ID);

    if (updateLock.changes === 0) {
      return res.status(409).json({
        error: `Message cannot be sent from current state '${msg.status}'. It may already be sent or is currently being dispatched.`
      });
    }

    // Retrieve recipient contact info
    let recipientPhone = null;
    let recipientEmail = null;

    if (msg.patient_id) {
      const patient = db.prepare('SELECT phone, email FROM patients WHERE id = ?').get(msg.patient_id);
      if (patient) {
        recipientPhone = patient.phone;
        recipientEmail = patient.email;
      }
    } else if (msg.call_log_id) {
      const callLog = db.prepare('SELECT caller_phone FROM call_logs WHERE id = ?').get(msg.call_log_id);
      if (callLog) recipientPhone = callLog.caller_phone;
    }

    const deliveryMethod = (msg.delivery_method || 'sms').toLowerCase();

    // EMAIL DISPATCH VIA SENDGRID
    if (deliveryMethod === 'email') {
      const apiKey = process.env.SENDGRID_API_KEY;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL;

      if (!apiKey || !fromEmail) {
        const errorMsg = 'SendGrid email provider is not configured. Environment variables SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required.';
        db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(errorMsg, msg.id);
        return res.status(503).json({
          error: 'Email provider not configured',
          details: errorMsg
        });
      }

      if (!recipientEmail) {
        const errorMsg = 'Failed: Recipient has no valid email address on file.';
        db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(errorMsg, msg.id);
        return res.status(400).json({ error: errorMsg });
      }

      try {
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: recipientEmail }] }],
            from: { email: fromEmail },
            subject: 'DentalFlow Practice Notification',
            content: [{ type: 'text/plain', value: msg.message_text }]
          })
        });

        if (sgRes.status >= 200 && sgRes.status < 300) {
          const resultStr = `Delivered via SendGrid (Status: ${sgRes.status})`;
          db.prepare(`UPDATE follow_up_messages SET status = 'sent', delivery_result = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?`).run(resultStr, msg.id);
          return res.json({
            ok: true,
            status: 'sent',
            message: 'Follow-up email dispatched successfully via SendGrid.'
          });
        } else {
          const errBody = await sgRes.text();
          const resultStr = `SendGrid error (${sgRes.status}): ${errBody.slice(0, 200)}`;
          db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(resultStr, msg.id);
          return res.status(502).json({
            error: 'Provider delivery failed',
            details: resultStr
          });
        }
      } catch (networkErr) {
        const resultStr = `SendGrid network error: ${networkErr.message}`;
        db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(resultStr, msg.id);
        return res.status(502).json({ error: 'Failed to contact email provider', details: resultStr });
      }
    }

    // SMS OR WHATSAPP DISPATCH VIA TWILIO
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM;

    if (!twilioSid || !twilioAuthToken || !twilioFrom) {
      const errorMsg = 'Twilio SMS provider is not configured. Environment variables TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required.';
      db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(errorMsg, msg.id);
      return res.status(503).json({
        error: 'SMS provider not configured',
        details: errorMsg
      });
    }

    if (!recipientPhone) {
      const errorMsg = 'Failed: Recipient has no valid phone number on file.';
      db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(errorMsg, msg.id);
      return res.status(400).json({ error: errorMsg });
    }

    try {
      const isWhatsApp = deliveryMethod === 'whatsapp';
      const fromNumber = isWhatsApp ? `whatsapp:${twilioFrom}` : twilioFrom;
      const toNumber = isWhatsApp ? `whatsapp:${recipientPhone}` : recipientPhone;

      const params = new URLSearchParams();
      params.append('From', fromNumber);
      params.append('To', toNumber);
      params.append('Body', msg.message_text);

      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const responseData = await twilioRes.json();
      if (twilioRes.status >= 200 && twilioRes.status < 300 && responseData.sid) {
        const resultStr = `Dispatched via Twilio (SID: ${responseData.sid}, Status: ${responseData.status})`;
        db.prepare(`UPDATE follow_up_messages SET status = 'sent', delivery_result = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?`).run(resultStr, msg.id);
        return res.json({
          ok: true,
          status: 'sent',
          message: `Follow-up message successfully dispatched via Twilio (${responseData.sid}).`
        });
      } else {
        const errDetail = responseData.message || JSON.stringify(responseData).slice(0, 200);
        const resultStr = `Twilio error (${twilioRes.status}): ${errDetail}`;
        db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(resultStr, msg.id);
        return res.status(502).json({
          error: 'Provider delivery failed',
          details: resultStr
        });
      }
    } catch (networkErr) {
      const resultStr = `Twilio network error: ${networkErr.message}`;
      db.prepare(`UPDATE follow_up_messages SET status = 'failed', delivery_result = ? WHERE id = ?`).run(resultStr, msg.id);
      return res.status(502).json({ error: 'Failed to contact SMS provider', details: resultStr });
    }
  } catch (err) {
    console.error('Follow-up delivery handler error:', err);
    res.status(500).json({ error: 'Internal error processing message delivery' });
  }
});

app.post('/api/follow-up-messages/:id/cancel', authMiddleware, staffOnly, (req, res) => {
  db.prepare(`UPDATE follow_up_messages SET status = 'cancelled' WHERE id = ? AND practice_id = ?`)
    .run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// Message Templates
app.get('/api/message-templates', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM message_templates WHERE practice_id = ? ORDER BY trigger_type').all(PRACTICE_ID);
  res.json(rows);
});

app.patch('/api/message-templates/:id', authMiddleware, staffOnly, (req, res) => {
  const { name, template_text, is_active } = req.body;
  db.prepare(`UPDATE message_templates SET
    name = COALESCE(?, name),
    template_text = COALESCE(?, template_text),
    is_active = COALESCE(?, is_active),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND practice_id = ?`)
    .run(name, template_text, is_active, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// ===================== APPOINTMENT REMINDER SCHEDULER =====================

function checkUpcomingReminders() {
  try {
    const now = new Date();
    const reminderWindow = new Date(now.getTime() + 30 * 60000); // 30 minutes from now

    // Find appointments starting within the next 30 minutes that don't have a reminder yet
    const upcoming = db.prepare(`
      SELECT a.id FROM appointments a
      WHERE a.practice_id = ? AND a.status = 'booked'
      AND a.start_time > ? AND a.start_time <= ?
    `).all(PRACTICE_ID, now.toISOString().slice(0, 19), reminderWindow.toISOString().slice(0, 19));

    for (const appt of upcoming) {
      generateFollowUpMessage(appt.id, 'appointment_reminder');
    }
  } catch (e) {
    console.error('[Scheduler] Reminder check error:', e.message);
  }
}

// Run reminder check every 5 minutes
setInterval(checkUpcomingReminders, 5 * 60 * 1000);
// Also run once on startup
setTimeout(checkUpcomingReminders, 5000);

// --- Call Logs ---
app.get('/api/call-logs', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare(
    `SELECT cl.*, p.name as patient_name FROM call_logs cl
     LEFT JOIN patients p ON p.id = cl.patient_id
     WHERE cl.practice_id = ? ORDER BY cl.created_at DESC`
  ).all(PRACTICE_ID);
  res.json(rows);
});

app.get('/api/call-logs/:id', authMiddleware, staffOnly, (req, res) => {
  const row = db.prepare(
    `SELECT cl.*, p.name as patient_name FROM call_logs cl
     LEFT JOIN patients p ON p.id = cl.patient_id
     WHERE cl.id = ? AND cl.practice_id = ?`
  ).get(req.params.id, PRACTICE_ID);
  if (!row) return res.status(404).json({ error: 'Call log not found' });
  res.json(row);
});

app.post('/api/call-logs', authMiddleware, (req, res) => {
  const { caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id } = req.body;
  const effectivePatientId = req.user.role === 'patient' ? req.user.patient_id : (req.body.patient_id || null);
  const effectiveCallerName = caller_name || (req.user.role === 'patient' ? req.user.display_name : 'Caller');
  const info = db.prepare(
    `INSERT INTO call_logs (practice_id, patient_id, caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, effectivePatientId, effectiveCallerName, caller_name_spelled || null, caller_phone || null, caller_email || null, call_type || 'inbound_ai', is_after_hours || 0, duration_seconds || null, intent || 'general_inquiry', ai_summary || null, transcript || null, sentiment || 'neutral', status || 'open', is_won_back || 0, appointment_id || null);

  // Auto-escalate clinical emergencies and patient complaints
  if (intent === 'clinical_emergency' || intent === 'patient_complaint') {
    const severity = intent === 'clinical_emergency' ? 'critical' : 'high';
    const alertType = intent === 'clinical_emergency' ? 'clinical_emergency' : 'patient_complaint';
    const title = intent === 'clinical_emergency'
      ? `Clinical Emergency – ${effectiveCallerName || 'Unknown'}`
      : `Patient Complaint – ${effectiveCallerName || 'Unknown'}`;
    db.prepare(
      `INSERT INTO alerts (practice_id, type, severity, title, message, status, call_log_id, escalation_type)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(PRACTICE_ID, alertType, severity, title, ai_summary || 'AI escalated this call for human review.', info.lastInsertRowid, alertType);
  }

  // Auto-generate missed call follow-up
  if (status === 'missed' || intent === 'missed_call') {
    generateMissedCallMessage(info.lastInsertRowid);
  }

  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch('/api/call-logs/:id', authMiddleware, staffOnly, (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE call_logs SET status = ? WHERE id = ? AND practice_id = ?`).run(status, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Helper: Shared Booking Logic ---
function executeBooking(bookingData, practiceId = PRACTICE_ID) {
  const { caller_name, caller_phone, caller_email, practitioner_name, practitioner_id, start_time, reason, fee, call_summary, call_transcript, is_after_hours } = bookingData;

  // Resolve practitioner
  let practitioner;
  if (practitioner_id) {
    practitioner = db.prepare(`SELECT * FROM practitioners WHERE id = ? AND practice_id = ?`).get(practitioner_id, practiceId);
  } else if (practitioner_name) {
    practitioner = db.prepare(`SELECT * FROM practitioners WHERE practice_id = ? AND name LIKE ?`).get(practiceId, `%${practitioner_name}%`);
  }
  if (!practitioner) {
    practitioner = db.prepare(`SELECT * FROM practitioners WHERE practice_id = ? LIMIT 1`).get(practiceId);
  }
  if (!practitioner) {
    const err = new Error('Practitioner not found');
    err.status = 400;
    throw err;
  }

  // Calculate start and end time before conflict checking
  const effectiveStartTime = start_time || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(17, 0, 0, 0);
    return d.toISOString().slice(0, 19);
  })();

  const apptType = resolveAppointmentType(reason);
  const durationMinutes = apptType.duration || 45;
  const startDate = new Date(effectiveStartTime);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const end_time = endDate.toISOString().slice(0, 19);

  // Validate practitioner availability / working hours if available
  const dayOfWeek = startDate.getDay();
  const startHM = startDate.toTimeString().slice(0, 5);
  const endHM = endDate.toTimeString().slice(0, 5);
  const avail = db.prepare('SELECT * FROM practitioner_availability WHERE practitioner_id = ? AND day_of_week = ?').get(practitioner.id, dayOfWeek);
  if (avail && (startHM < avail.start_time || endHM > avail.end_time)) {
    const err = new Error(`Practitioner is only available between ${avail.start_time} and ${avail.end_time} on this day.`);
    err.status = 400;
    throw err;
  }

  // Transactional conflict check & booking creation
  const parsedFee = Number(fee) || apptType.fee || 150;
  const bookingTx = db.transaction(() => {
    // Interval overlap conflict check
    const conflict = db.prepare(`
      SELECT id FROM appointments
      WHERE practice_id = ? AND practitioner_id = ?
        AND status IN ('booked', 'completed')
        AND start_time < ?
        AND COALESCE(NULLIF(end_time, ''), datetime(start_time, '+30 minutes')) > ?
      LIMIT 1
    `).get(practiceId, practitioner.id, end_time, effectiveStartTime);

    if (conflict) {
      const err = new Error('Time slot not available due to an overlapping appointment');
      err.conflict_id = conflict.id;
      err.status = 409;
      throw err;
    }

    // Find or create patient
    let patient = null;
    if (caller_phone) {
      patient = db.prepare(`SELECT * FROM patients WHERE practice_id = ? AND phone = ?`).get(practiceId, caller_phone);
    }
    if (!patient && caller_email) {
      patient = db.prepare(`SELECT * FROM patients WHERE practice_id = ? AND email = ?`).get(practiceId, caller_email);
    }
    if (!patient && caller_name) {
      const info = db.prepare(
        `INSERT INTO patients (practice_id, name, phone, email, status) VALUES (?, ?, ?, ?, 'active')`
      ).run(practiceId, caller_name, caller_phone || null, caller_email || null);
      patient = { id: info.lastInsertRowid, name: caller_name };
    }
    if (!patient) {
      const defaultName = caller_name || 'New Patient';
      const info = db.prepare(
        `INSERT INTO patients (practice_id, name, phone, email, status) VALUES (?, ?, ?, ?, 'active')`
      ).run(practiceId, defaultName, caller_phone || null, caller_email || null);
      patient = { id: info.lastInsertRowid, name: defaultName };
    }

    // Book appointment
    const apptInfo = db.prepare(
      `INSERT INTO appointments (practice_id, patient_id, practitioner_id, start_time, end_time, status, reason, fee, booked_by_ai, call_log_id)
       VALUES (?, ?, ?, ?, ?, 'booked', ?, ?, 1, NULL)`
    ).run(practiceId, patient.id, practitioner.id, effectiveStartTime, end_time, reason || apptType.name, parsedFee);

    // Create call log
    const spelled = (caller_name || patient.name) ? (caller_name || patient.name).toUpperCase().split('').join('-').replace(/ /g, '  ') : null;
    const clInfo = db.prepare(
      `INSERT INTO call_logs (practice_id, patient_id, caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id)
       VALUES (?, ?, ?, ?, ?, ?, 'inbound_ai', ?, ?, 'appointment_booking', ?, ?, 'positive', 'resolved', ?, ?)`
    ).run(practiceId, patient.id, caller_name || patient.name, spelled, caller_phone || null, caller_email || null, is_after_hours || 0, null, call_summary || `AI booked ${reason || 'appointment'} with ${practitioner.name}`, call_transcript || null, is_after_hours ? 1 : 0, apptInfo.lastInsertRowid);

    // Link call_log_id back to appointment
    db.prepare(`UPDATE appointments SET call_log_id = ? WHERE id = ?`).run(clInfo.lastInsertRowid, apptInfo.lastInsertRowid);

    return {
      appointment_id: apptInfo.lastInsertRowid,
      call_log_id: clInfo.lastInsertRowid,
      patient_id: patient.id,
      patient_name: patient.name,
      practitioner: practitioner.name,
      practitioner_id: practitioner.id,
      start_time: effectiveStartTime,
      end_time,
      reason: reason || apptType.name,
      fee: parsedFee
    };
  });

  const txResult = bookingTx();

  // Get settings for confirmation info
  const settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(practiceId);
  const confirmations = {
    sms: settings?.enable_sms_confirmation ? true : false,
    email: settings?.enable_email_confirmation ? true : false,
    whatsapp: settings?.enable_whatsapp_confirmation ? true : false,
  };

  return {
    ok: true,
    appointment_id: txResult.appointment_id,
    call_log_id: txResult.call_log_id,
    patient_id: txResult.patient_id,
    patient_name: txResult.patient_name,
    practitioner: txResult.practitioner,
    practitioner_id: txResult.practitioner_id,
    start_time: txResult.start_time,
    end_time: txResult.end_time,
    reason: txResult.reason,
    fee: txResult.fee,
    confirmations_sent: confirmations,
  };
}

// --- AI Booking Webhook ---
app.post('/api/ai-booking-webhook', (req, res) => {
  try {
    const result = executeBooking(req.body, PRACTICE_ID);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, conflict_id: err.conflict_id });
  }
});

// Helper: assemble a single spelled token e.g. "R-E-Y-A-N" -> "Reyan"
function assembleSpelledWord(word) {
  const cleaned = word.replace(/[^A-Za-z-]/g, '').trim();
  const letterPattern = /^[A-Za-z](-[A-Za-z]){1,}$/;
  if (letterPattern.test(cleaned)) {
    const letters = cleaned.replace(/-/g, '');
    return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
  }
  return null;
}

// Helper: detect if text is spelled-out letters and assemble into a name (e.g. "P-E-T-E-R" -> "Peter", "R-E-Y-A-N D-A-S" -> "Reyan Das")
function assembleSpelledName(text) {
  if (!text) return null;
  let cleaned = text.trim()
    .replace(/^(no,?\s*)?(actually,?\s*)?(it'?s\s+|it is\s+|my name is\s+|spelled\s+|spelt\s+|this is\s+)?/i, '')
    .trim();
  cleaned = cleaned.replace(/\./g, '').trim();

  // Pattern 1: space or comma separated spelled tokens e.g. "R-E-Y-A-N D-A-S" or "R-E-Y-A-N, D-A-S"
  const tokens = cleaned.split(/[\s,]+/);
  const assembledTokens = tokens.map(t => assembleSpelledWord(t)).filter(Boolean);
  if (assembledTokens.length > 0 && assembledTokens.length === tokens.length) {
    return assembledTokens.join(' ');
  }

  // Pattern 2: single spelled token with hyphens e.g. "P-E-T-E-R"
  const single = assembleSpelledWord(cleaned);
  if (single) return single;

  // Pattern 3: single letters separated by spaces e.g. "P E T E R"
  const letterPattern = /^[A-Za-z]([\s,-]+[A-Za-z]){1,}$/;
  if (letterPattern.test(cleaned)) {
    const letters = cleaned.replace(/[\s,-]+/g, '');
    return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
  }

  return null;
}

// Conversational words that should NEVER be accepted as a person's name
const NON_NAME_WORDS = /\b(surname|first name|last name|just|wrong|not|spelled|spelt|instead|mean|calling|said|spelling|actually|here|speaking|this is|that is|it is|it's|no|nope|yes|yeah)\b/i;

// Helper: extract name or name correction from conversational utterance
function extractNameFromCorrection(message, existingName = '') {
  let cleaned = message.trim();

  // Pattern 1: User explicitly gives surname, e.g. "No, this surname is just DAS", "surname is Das", "last name is Das"
  const surnameMatch = cleaned.match(/(?:surname|last\s*name)\s+(?:is\s+)?(?:just\s+)?([A-Za-z]+)/i);
  // Pattern 2: User explicitly gives first name, e.g. "first name is Reyan"
  const firstNameMatch = cleaned.match(/(?:first\s*name)\s+(?:is\s+)?(?:just\s+)?([A-Za-z]+)/i);

  if (surnameMatch || firstNameMatch) {
    const newSurname = surnameMatch ? surnameMatch[1].charAt(0).toUpperCase() + surnameMatch[1].slice(1).toLowerCase() : '';
    const newFirstName = firstNameMatch ? firstNameMatch[1].charAt(0).toUpperCase() + firstNameMatch[1].slice(1).toLowerCase() : '';
    
    const existingParts = (existingName || '').split(/\s+/);
    const existingFirst = existingParts[0] || '';
    const finalFirst = newFirstName || existingFirst;
    const finalLast = newSurname || (existingParts.length > 1 ? existingParts[existingParts.length - 1] : '');
    
    return [finalFirst, finalLast].filter(Boolean).join(' ');
  }

  // Pattern 3: User spells it out, e.g. "It's R-E-Y-A-N D-A-S" or "D-A-S"
  const spelled = assembleSpelledName(message);
  if (spelled) return spelled;

  // Pattern 4: Stripped correction e.g. "No, it's Peter Strain" or "Hi, my name is Reyan Das"
  let direct = message.replace(/^(no,?\s*|nope,?\s*|hi,?\s*|hello,?\s*|hey,?\s*|actually,?\s*|sorry,?\s*|yes,?\s*|yeah,?\s*|sure,?\s*)?(it'?s\s+|it is\s+|my name is\s+|my name's\s+|this is\s+|i am\s+|myself\s+|this side\s+|speaking\s+|call me\s+|i'm\s+|the name is\s+|the name's\s+|name is\s+)?/i, '')
    .replace(/\s+(here|speaking|calling|this side)$/i, '')
    .replace(/[.,!]/g, '')
    .trim();
  
  if (NON_NAME_WORDS.test(direct)) {
    return null;
  }

  if (direct && direct.length >= 2 && !/^(no|nope|wrong|incorrect|yes|yeah|sure|ok|okay|hi|hello)$/i.test(direct)) {
    return direct.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return null;
}

// Helper: format a clean name as spelled letters (e.g. "Peter" -> "P-E-T-E-R")
function formatSpelling(name) {
  if (!name) return '';
  const clean = name.replace(/[^A-Za-z\s]/g, '').trim();
  const words = clean.split(/\s+/);
  return words.map(w => w.toUpperCase().split('').join('-')).join('  ');
}

// Helper: parse spoken emails (e.g. "xyz at the rate gmail dot com" -> "xyz@gmail.com")
function parseSpokenEmail(text) {
  if (!text) return null;
  let normalized = text.toLowerCase()
    .replace(/\s*(at the rate of|at the rate|at sign)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*(dot)\s*/gi, '.')
    .replace(/\s+/g, '');
  const match = normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

// --- Mock AI Conversation Logic (Voice Receptionist "Neerja") ---
app.post('/api/simulate-ai-chat', (req, res) => {
  const { message = '', history = [], context = {}, session_id = 'session_' + Date.now() } = req.body;
  const lower = message.toLowerCase().trim();

  const ctx = {
    caller_name: context.caller_name || '',
    caller_name_spelled: context.caller_name_spelled || '',
    caller_phone: context.caller_phone || '',
    caller_email: context.caller_email || '',
    intent: context.intent || 'general_inquiry',
    booking_step: context.booking_step || 'idle',
    selected_practitioner_name: context.selected_practitioner_name || 'Dr. Lindsay Wren',
    selected_time: context.selected_time || '',
    selected_time_display: context.selected_time_display || 'Wednesday at 5:00 PM',
    reason: context.reason || 'Check-up',
    booking_completed: context.booking_completed || false,
    alert_created: context.alert_created || false,
    ...context
  };

  let reply = '';
  let action = null;
  let action_label = '';
  let appointment = null;
  let alert = null;

  // 1. Check for Emergency / Clinical Urgency
  const emergencyKeywords = ['emergency', 'severe pain', 'swelling', 'swollen', 'abscess', 'knocked out', 'bleeding', 'broke my tooth', 'broken tooth', 'trauma', 'unbearable pain', 'hard to breathe', 'cannot swallow'];
  const isEmergency = emergencyKeywords.some(k => lower.includes(k));

  if (isEmergency && !ctx.alert_created) {
    ctx.intent = 'clinical_emergency';
    ctx.alert_created = true;
    const callerDisplay = ctx.caller_name || 'Patient';
    const alertTitle = `Clinical Emergency – ${callerDisplay}`;
    const alertMsg = `Urgent clinical caller: "${message}". AI receptionist escalated for immediate clinical triage callback. Patient advised on red-flag ER symptoms.`;
    
    const alertInfo = db.prepare(
      `INSERT INTO alerts (practice_id, type, severity, title, message, status, escalation_type)
       VALUES (?, 'clinical_emergency', 'critical', ?, ?, 'active', 'clinical_emergency')`
    ).run(PRACTICE_ID, alertTitle, alertMsg);

    alert = { id: alertInfo.lastInsertRowid, severity: 'critical', title: alertTitle };
    action = 'emergency_escalated';
    action_label = 'Clinical Emergency Escalated to On-Call Dentist';

    reply = `I'm so sorry you're dealing with that, and I want to make sure you get help right away. Because severe swelling and pain require prompt clinical evaluation, I've escalated this as an urgent clinical alert for Dr. Mitchell and our team to call you back immediately. In the meantime, if you experience difficulty breathing, swallowing, or spreading facial swelling, please proceed to the nearest emergency room right away. Could I confirm your best callback phone number?`;
    return res.json({ reply, action, action_label, appointment, alert, context: ctx, session_id });
  }

  // 2. Check for Patient Complaint / Billing Dispute
  const complaintKeywords = ['overcharged', 'billing dispute', 'complaint', 'charged twice', 'unhappy with treatment', 'speak to a manager', 'rude'];
  const isComplaint = complaintKeywords.some(k => lower.includes(k));

  if (isComplaint && !ctx.alert_created) {
    ctx.intent = 'patient_complaint';
    ctx.alert_created = true;
    const callerDisplay = ctx.caller_name || 'Patient';
    const alertTitle = `Patient Complaint – ${callerDisplay}`;
    const alertMsg = `Patient complaint: "${message}". Escalated to practice manager for review and callback.`;
    
    const alertInfo = db.prepare(
      `INSERT INTO alerts (practice_id, type, severity, title, message, status, escalation_type)
       VALUES (?, 'patient_complaint', 'high', ?, ?, 'active', 'patient_complaint')`
    ).run(PRACTICE_ID, alertTitle, alertMsg);

    alert = { id: alertInfo.lastInsertRowid, severity: 'high', title: alertTitle };
    action = 'complaint_escalated';
    action_label = 'Complaint Escalated to Practice Manager';

    reply = `I completely understand your frustration and I'm very sorry for the inconvenience. Billing and service issues are reviewed directly by our practice manager. I've flagged this with high priority for our manager to investigate your file and call you back today. Could I take your name and preferred phone number?`;
    return res.json({ reply, action, action_label, appointment, alert, context: ctx, session_id });
  }

  // 3. Multi-turn Appointment Booking Flow
  const asksToBook = ['book', 'appointment', 'check-up', 'check up', 'schedule', 'see the dentist', 'consultation', 'cleaning'].some(k => lower.includes(k));

  // Determine or advance booking steps
  if (ctx.booking_step === 'idle' && asksToBook) {
    ctx.intent = 'appointment_booking';
    ctx.booking_step = 'ask_new_patient';
    reply = "Lovely — let's get that sorted for you. Have you been to us before, or will you be a new patient?";
  } else if (ctx.booking_step === 'ask_new_patient') {
    ctx.is_new_patient = !lower.includes('yes') && !lower.includes('before') && !lower.includes('returning');
    ctx.booking_step = 'ask_day_time';
    reply = "Welcome! What day and time were you hoping to come in? We have daytime and late afternoon availability.";
  } else if (ctx.booking_step === 'ask_day_time') {
    // Query available practitioners
    const practitioners = db.prepare(`SELECT name, specialty FROM practitioners WHERE practice_id = ?`).all(PRACTICE_ID);
    const p1 = practitioners[1]?.name || 'Dr. Lindsay Wren';
    const p2 = practitioners[2]?.name || 'Helen Styles';

    ctx.booking_step = 'choose_slot';
    action = 'check_availability';
    action_label = `check_availability → 6 evening slots - Next Wednesday`;
    reply = `Let me check what's available for you then. I've got a couple of options next Wednesday: 5 o'clock with ${p1}, or 6:10 with ${p2}. Which of those suits you better?`;
  } else if (ctx.booking_step === 'choose_slot') {
    if (lower.includes('helen') || lower.includes('6') || lower.includes('styles')) {
      ctx.selected_practitioner_name = 'Helen Styles';
      ctx.selected_time_display = 'Wednesday at 6:10 PM';
    } else {
      ctx.selected_practitioner_name = 'Dr. Lindsay Wren';
      ctx.selected_time_display = 'Wednesday at 5:00 PM';
    }

    // Set approximate target start_time 3 days from now
    const d = new Date();
    d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7 || 7));
    d.setHours(17, 0, 0, 0);
    ctx.selected_time = d.toISOString().slice(0, 19);

    ctx.booking_step = 'ask_name';
    reply = `One sec... perfect. Can I take your name, please?`;
  } else if (ctx.booking_step === 'ask_name') {
    // Check if user spelled out their name letter by letter
    const assembledFromSpelling = assembleSpelledName(message);
    let cleanName = '';

    if (assembledFromSpelling) {
      cleanName = assembledFromSpelling;
    } else {
      // First try intelligent extraction
      const extracted = extractNameFromCorrection(message, '');
      if (extracted) {
        cleanName = extracted;
      } else {
        // Fallback cleaning - handle Indian introductions
        cleanName = message.replace(/^(hi|hello|hey|sure|yeah|yes|ok|okay)?,?\s*(it'?s\s+|it is\s+|my name is\s+|my name's\s+|this is\s+|i am\s+|myself\s+|this side\s+|speaking\s+|call me\s+|i'm\s+|the name is\s+|the name's\s+|name is\s+)?/i, '').trim();
        cleanName = cleanName.replace(/\s+(here|speaking|calling|this side)$/i, '').trim();
        cleanName = cleanName.replace(/[.,!]/g, '').trim();
      }
    }

    if (!cleanName || cleanName.length < 2 || NON_NAME_WORDS.test(cleanName)) {
      reply = "Sorry, I didn't quite catch that. Could you please tell me your full name, or spell it out?";
    } else {
      ctx.caller_name = cleanName;
      ctx.caller_name_spelled = formatSpelling(cleanName);
      ctx.booking_step = 'confirm_spelling';
      const firstName = cleanName.split(' ')[0];
      reply = `Thanks ${firstName} — let me spell that back. ${ctx.caller_name_spelled}. Is that right?`;
    }
  } else if (ctx.booking_step === 'confirm_spelling') {
    const isNegative = /^(no|nope|not right|incorrect|wrong|nah|wait|it's not|thats not)\b/i.test(lower) ||
      lower.includes("that's not right") || lower.includes("you got it wrong") || lower.includes("spelled wrong");

    if (isNegative) {
      const correctedName = extractNameFromCorrection(message, ctx.caller_name);
      if (correctedName) {
        ctx.caller_name = correctedName;
        ctx.caller_name_spelled = formatSpelling(correctedName);
        ctx.booking_step = 'confirm_spelling'; // stay to confirm the corrected name!
        reply = `My apologies! Got it, ${correctedName} — let me spell that: ${ctx.caller_name_spelled}. Is that right now?`;
      } else {
        ctx.booking_step = 'ask_name';
        reply = `My apologies! Could you please spell out your first and last name for me?`;
      }
    } else {
      // User confirmed spelling — preserve existing caller_name. Only update if caller explicitly provides new name/spelling
      const spelledRestatement = assembleSpelledName(message);
      if (spelledRestatement) {
        ctx.caller_name = spelledRestatement;
        ctx.caller_name_spelled = formatSpelling(ctx.caller_name);
      } else if (/(?:my\s*name\s*is|name's|it'?s\s+[A-Za-z]+|surname\s*is|first\s*name\s*is)/i.test(message)) {
        const restatedName = extractNameFromCorrection(message, ctx.caller_name);
        if (restatedName && !/^(that'?s|that is|it is|sounds|you got|correct|right|perfect|ok|okay)/i.test(restatedName)) {
          ctx.caller_name = restatedName;
          ctx.caller_name_spelled = formatSpelling(ctx.caller_name);
        }
      }
      ctx.booking_step = 'ask_phone';
      const phoneMatch = message.match(/\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/);
      if (phoneMatch) {
        ctx.caller_phone = phoneMatch[0];
        ctx.booking_step = 'ask_email';
        reply = `Got it! And what is the best email address for your written confirmation?`;
      } else {
        reply = `Perfect! And what is the best mobile number for us to reach you on?`;
      }
    }
  } else if (ctx.booking_step === 'ask_phone') {
    const phoneMatch = message.match(/\b\d[\d\s-]{6,14}\d\b/);
    ctx.caller_phone = phoneMatch ? phoneMatch[0] : (message.replace(/[^0-9+-]/g, '') || '555-0106');
    ctx.booking_step = 'ask_email';
    reply = `And what's the best email address for your written confirmation?`;
  } else if (ctx.booking_step === 'ask_email') {
    const spokenEmail = parseSpokenEmail(message);
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    ctx.caller_email = spokenEmail || (emailMatch ? emailMatch[0] : (message.toLowerCase().includes('@') ? message.trim() : 'patient@example.com'));
    // Ensure caller_name is properly formatted if previously had hyphens
    if (ctx.caller_name && assembleSpelledName(ctx.caller_name)) {
      ctx.caller_name = assembleSpelledName(ctx.caller_name);
    }
    ctx.booking_step = 'confirm_booking';
    reply = `Great — so just to confirm: a check-up on ${ctx.selected_time_display} with ${ctx.selected_practitioner_name}, for ${ctx.caller_name}. Shall I go ahead and book that?`;
  } else if (ctx.booking_step === 'confirm_booking') {
    // User confirms booking
    if (lower.includes('yes') || lower.includes('sure') || lower.includes('book') || lower.includes('please') || lower.includes('great') || lower.includes('okay') || lower.includes('ok')) {
      try {
        const bookingResult = executeBooking({
          caller_name: ctx.caller_name || 'Peter Strain',
          caller_phone: ctx.caller_phone || '555-0106',
          caller_email: ctx.caller_email || 'peter.strain@example.com',
          practitioner_name: ctx.selected_practitioner_name,
          start_time: ctx.selected_time,
          reason: ctx.reason || 'Check-up',
          fee: 180,
          call_summary: `AI receptionist Neerja booked check-up with ${ctx.selected_practitioner_name} for ${ctx.caller_name || 'Peter Strain'}`,
          is_after_hours: 1
        }, PRACTICE_ID);

        appointment = bookingResult;
        ctx.booking_completed = true;
        ctx.booking_step = 'booked';
        action = 'appointment_booked';
        action_label = `Appointment booked: ${ctx.caller_name} · Check-up · ${ctx.selected_time_display} · ${ctx.selected_practitioner_name}`;

        reply = `That's all confirmed, ${ctx.caller_name}! You'll get a text message and an email confirming your check-up with ${ctx.selected_practitioner_name} on ${ctx.selected_time_display}, plus a reminder before your visit. Is there anything else I can help you with today?`;
      } catch (err) {
        reply = `I have noted all your details for ${ctx.caller_name}. Our system is reserving your slot on ${ctx.selected_time_display}. Anything else I can assist with?`;
      }
    } else {
      reply = "No problem at all. We can adjust the time, practitioner, or details anytime. What would you prefer?";
    }
  }

  // 4. Check for Pricing Inquiries
  else if (['price', 'cost', 'invisalign', 'whitening', 'crown', 'implant', 'fee', 'how much'].some(k => lower.includes(k))) {
    ctx.intent = 'pricing_inquiry';
    if (lower.includes('invisalign') || lower.includes('align')) {
      reply = "Invisalign starts at $3,200 (or £3,200). That is the starting fee, and the exact cost is confirmed after the dentist assesses your teeth and puts together a custom treatment plan. Would you like to add an Invisalign consult to your booking?";
    } else if (lower.includes('whiten')) {
      reply = "Our in-office professional teeth whitening is $350 to $500 for same-day immediate results, and custom take-home whitening kits start at $250. Would you like more details on either option?";
    } else if (lower.includes('hygiene') || lower.includes('clean')) {
      reply = "A professional hygiene and cleaning visit is $120 with our dental hygienist Helen Styles. Would you like to schedule that?";
    } else {
      reply = "Routine dental check-ups are $150, hygiene cleanings are $120, and consultation fees vary by specialty. We're always upfront about all fees before beginning any treatment. Would you like to book a visit?";
    }
  }

  // 5. Practice Info / Hours / Location
  else if (['hours', 'open', 'location', 'address', 'where are you', 'directions'].some(k => lower.includes(k))) {
    ctx.intent = 'general_inquiry';
    reply = "We are located at 120 Main Street, Downtown. We're open Monday through Friday from 8:00 AM to 6:00 PM, and Saturdays from 9:00 AM to 1:00 PM. Is there an appointment or service I can help you book?";
  }

  // 6. Goodbyes / Wrap-up
  else if (['bye', 'goodbye', 'thank you', 'thanks', "that's all", 'that is all', 'nothing else', 'no thanks'].some(k => lower.includes(k))) {
    action = 'call_completed';
    action_label = 'Call Completed';
    reply = "You're very welcome! Thank you for calling DentalFlow. Have a wonderful day! Goodbye.";
  }

  // 7. General Fallback
  else if (!reply) {
    if (history.length === 0) {
      reply = "Hi! You've reached DentalFlow Downtown. I'm Neerja — the AI receptionist for the dental team, and this call is recorded. Just ask me anything and I'll get it sorted. How can I help you today?";
    } else {
      reply = "I'm right here to help! Whether you'd like to book an appointment, inquire about treatment fees like Invisalign or whitening, or check our hours, just let me know.";
    }
  }

  return res.json({
    reply,
    action,
    action_label,
    appointment,
    alert,
    context: ctx,
    session_id
  });
});


// --- Whisper In-Memory Worker & Speech-to-Text ---
let whisperWorker = null;
let whisperWorkerCrashes = 0;
let whisperAvailable = false;
const pendingTranscriptions = [];

const pythonCmd = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

function startWhisperWorker() {
  if (whisperWorkerCrashes >= 2) {
    console.log('[Whisper Worker] PyTorch/Whisper unavailable in this environment. Local Whisper worker disabled.');
    return;
  }

  const workerScript = path.join(__dirname, 'whisper_worker.py');
  try {
    whisperWorker = spawn(pythonCmd, [workerScript]);

    const rl = readline.createInterface({ input: whisperWorker.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed === 'PRELOADING_WHISPER') {
        console.log('[Whisper AI] Preloading model into RAM...');
        return;
      }
      if (trimmed === 'WHISPER_READY') {
        whisperAvailable = true;
        whisperWorkerCrashes = 0;
        console.log('[Whisper AI] In-memory worker ready! Ultra-fast STT enabled.');
        return;
      }
      if (pendingTranscriptions.length > 0) {
        const { resolve } = pendingTranscriptions.shift();
        try {
          const parsed = JSON.parse(trimmed);
          resolve(parsed);
        } catch (e) {
          resolve({ text: trimmed });
        }
      }
    });

    whisperWorker.stderr.on('data', (d) => {
      const str = d.toString();
      if (str.includes('No module named') || str.includes('ModuleNotFoundError')) {
        whisperWorkerCrashes = 99; // immediately disable to prevent crash loop
      }
      if (!str.includes('FP16') && !str.includes('UserWarning')) {
        console.warn('[Whisper Worker]', str.trim());
      }
    });

    whisperWorker.on('exit', (code) => {
      whisperWorker = null;
      if (code !== 0) {
        whisperWorkerCrashes++;
      }
      if (whisperWorkerCrashes < 2) {
        console.warn('[Whisper Worker] Exited, retrying in 2s...');
        setTimeout(startWhisperWorker, 2000);
      } else {
        console.log('[Whisper AI] Worker disabled (torch/whisper not available in this environment). Local/browser fallback active.');
      }
    });
  } catch (err) {
    whisperWorkerCrashes = 99;
    console.warn('[Whisper Worker] Failed to spawn:', err.message);
  }
}

// Start worker at boot
startWhisperWorker();

async function transcribeAudioFile(filePath) {
  // Option 1: In-memory local worker (CUDA or CPU)
  if (whisperWorker && whisperWorker.stdin && whisperWorker.stdin.writable && whisperAvailable) {
    return new Promise((resolve, reject) => {
      pendingTranscriptions.push({ resolve, reject });
      whisperWorker.stdin.write(JSON.stringify({ path: filePath }) + '\n');
    });
  }

  // Load Groq & OpenAI keys from env OR database
  let groqKey = (process.env.GROQ_API_KEY || '').trim();
  let openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!groqKey || !openaiKey) {
    try {
      const dbSettings = db.prepare('SELECT groq_api_key, openai_api_key FROM ai_settings WHERE practice_id = ?').get(PRACTICE_ID);
      if (dbSettings) {
        if (!groqKey && dbSettings.groq_api_key) groqKey = dbSettings.groq_api_key.trim();
        if (!openaiKey && dbSettings.openai_api_key) openaiKey = dbSettings.openai_api_key.trim();
      }
    } catch (e) {}
  }

  // Option 2: Cloud Groq Whisper API (Ultra-fast ~150ms transcription if key provided)
  if (groqKey) {
    try {
      console.log('[Transcribe] Using Groq Cloud Whisper API...');
      const fileBuffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).replace('.', '') || 'webm';
      const mime = ext === 'mp4' ? 'audio/mp4' : (ext === 'wav' ? 'audio/wav' : 'audio/webm');
      const blob = new Blob([fileBuffer], { type: mime });
      const formData = new FormData();
      formData.append('file', blob, `audio.${ext}`);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      formData.append('prompt', 'Reyan Das, Helen Styles, Dr. Lindsay Wren, dental clinic appointment, booking checkup');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: formData,
      });

      if (response.ok) {
        const json = await response.json();
        console.log('[Transcribe] Groq recognized:', json.text);
        return { text: json.text || '' };
      } else {
        const errBody = await response.text();
        console.warn(`[Transcribe] Groq API returned HTTP ${response.status}:`, errBody);
      }
    } catch (e) {
      console.warn('[Transcribe] Groq API call failed:', e.message);
    }
  }

  // Option 3: Cloud OpenAI Whisper API
  if (openaiKey) {
    try {
      console.log('[Transcribe] Using OpenAI Cloud Whisper API...');
      const fileBuffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).replace('.', '') || 'webm';
      const mime = ext === 'mp4' ? 'audio/mp4' : (ext === 'wav' ? 'audio/wav' : 'audio/webm');
      const blob = new Blob([fileBuffer], { type: mime });
      const formData = new FormData();
      formData.append('file', blob, `audio.${ext}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
      });

      if (response.ok) {
        const json = await response.json();
        return { text: json.text || '' };
      }
    } catch (e) {
      console.warn('[Transcribe] OpenAI API call failed:', e.message);
    }
  }

  // Option 4: Standalone transcribe.py if torch is available
  if (whisperWorkerCrashes < 2) {
    const scriptPath = path.join(__dirname, 'transcribe.py');
    return new Promise((resolve, reject) => {
      execFile(pythonCmd, [scriptPath, filePath], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) return reject(error);
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          resolve({ text: stdout.trim() });
        }
      });
    });
  }

  // Option 5: No backend STT installed (e.g. Render free tier without torch)
  return { 
    error: 'NO_BACKEND_STT', 
    message: 'Local PyTorch Whisper is not installed on this server. Browser SpeechRecognition will be used.' 
  };
}

// --- Text-to-Speech Endpoint (Microsoft Edge Neural Indian Voices) ---
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const cleanText = text.replace(/[*_#`~]/g, '').trim();

    // Lock to ONLY ONE VOICE: Neerja Indian Female Neural Voice
    const voice = 'en-IN-NeerjaExpressiveNeural';

    console.log(`[TTS] Synthesizing Neerja Neural Voice for: "${cleanText.slice(0, 60)}..."`);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    });

    const scriptPath = path.join(__dirname, 'edge_tts_service.py');
    const python = spawn(pythonCmd, [scriptPath, cleanText, voice]);

    python.stdout.pipe(res);

    python.stderr.on('data', (d) => {
      const errStr = d.toString().trim();
      if (errStr) console.warn('[EdgeTTS]', errStr);
    });

    python.on('error', (err) => {
      console.error('[EdgeTTS Spawn Error]', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to spawn TTS service: ' + err.message });
      }
    });

    res.on('close', () => {
      if (!res.writableEnded && !python.killed) {
        try { python.kill(); } catch (e) {}
      }
    });
  } catch (err) {
    console.error('[TTS] Unexpected error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// --- Whisper Speech-to-Text Transcription Endpoint ---
app.post('/api/transcribe', async (req, res) => {
  console.log('[Transcribe] Received transcription request');
  try {
    const { audio, format = 'webm' } = req.body;
    if (!audio) {
      console.error('[Transcribe] No audio data in request body');
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Frontend sends raw base64 (no data URI prefix) — decode directly
    // But also handle legacy data URI format just in case
    const base64Data = audio.includes(';base64,')
      ? audio.split(';base64,').pop()
      : audio.replace(/^data:audio\/[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    console.log(`[Transcribe] Audio buffer size: ${buffer.length} bytes, format: ${format}`);

    if (buffer.length < 100) {
      console.error('[Transcribe] Audio buffer too small:', buffer.length);
      return res.status(400).json({ error: 'Audio data too small — no speech detected' });
    }

    const tempFilename = `temp_voice_${Date.now()}.${format}`;
    const tempFilePath = path.join(__dirname, '..', tempFilename);

    await fs.promises.writeFile(tempFilePath, buffer);
    console.log(`[Transcribe] Wrote temp file: ${tempFilePath} (${buffer.length} bytes)`);

    try {
      console.log('[Transcribe] Starting Whisper transcription...');
      const result = await transcribeAudioFile(tempFilePath);
      fs.unlink(tempFilePath, () => {});
      console.log('[Transcribe] Whisper result:', JSON.stringify(result));

      if (result.error) {
        console.error('[Transcribe] Transcription result notice:', result.error);
        if (result.error === 'NO_BACKEND_STT') {
          return res.json({ error: 'NO_BACKEND_STT', text: '', message: result.message });
        }
        return res.status(500).json({ error: result.error, text: '' });
      }

      res.json({ text: result.text || '' });
    } catch (err) {
      fs.unlink(tempFilePath, () => {});
      console.error('[Transcribe] Transcription error:', err);
      res.status(500).json({ error: 'Transcription failed: ' + err.message, details: err.message });
    }
  } catch (err) {
    console.error('[Transcribe] Endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});




// --- AI Settings ---
app.get('/api/ai-settings', authMiddleware, (req, res) => {
  let settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  if (!settings) {
    db.prepare(`INSERT INTO ai_settings (practice_id) VALUES (?)`).run(PRACTICE_ID);
    settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  }
  // Sanitize secret API keys if request is from a patient
  if (req.user && req.user.role === 'patient') {
    const { groq_api_key, openai_api_key, ...safeSettings } = settings;
    return res.json(safeSettings);
  }
  res.json(settings);
});

app.patch('/api/ai-settings', authMiddleware, staffOnly, (req, res) => {
  const { 
    greeting_script, voice_id, voice_name, language, 
    enable_sms_confirmation, enable_email_confirmation, enable_whatsapp_confirmation, 
    after_hours_enabled, emergency_forward_phone, voice_clone_sample_name,
    groq_api_key, openai_api_key
  } = req.body;
  let settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  if (!settings) {
    db.prepare(`INSERT INTO ai_settings (practice_id) VALUES (?)`).run(PRACTICE_ID);
  }
  db.prepare(
    `UPDATE ai_settings SET
      greeting_script = COALESCE(?, greeting_script),
      voice_id = COALESCE(?, voice_id),
      voice_name = COALESCE(?, voice_name),
      language = COALESCE(?, language),
      enable_sms_confirmation = COALESCE(?, enable_sms_confirmation),
      enable_email_confirmation = COALESCE(?, enable_email_confirmation),
      enable_whatsapp_confirmation = COALESCE(?, enable_whatsapp_confirmation),
      after_hours_enabled = COALESCE(?, after_hours_enabled),
      emergency_forward_phone = COALESCE(?, emergency_forward_phone),
      voice_clone_sample_name = COALESCE(?, voice_clone_sample_name),
      groq_api_key = COALESCE(?, groq_api_key),
      openai_api_key = COALESCE(?, openai_api_key)
    WHERE practice_id = ?`
  ).run(
    greeting_script ?? null, voice_id ?? null, voice_name ?? null, language ?? null,
    enable_sms_confirmation ?? null, enable_email_confirmation ?? null, enable_whatsapp_confirmation ?? null,
    after_hours_enabled ?? null, emergency_forward_phone ?? null, voice_clone_sample_name ?? null,
    groq_api_key !== undefined ? (groq_api_key?.trim() || null) : null,
    openai_api_key !== undefined ? (openai_api_key?.trim() || null) : null,
    PRACTICE_ID
  );
  const updated = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  res.json(updated);
});

// --- Practices list (for dropdown) ---
app.get('/api/practices', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM practices ORDER BY id').all();
  res.json(rows);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Serve frontend in production ---
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DentalFlow API listening on port ${PORT}`));
