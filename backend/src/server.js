// Required env var: ELEVENLABS_API_KEY=<your_elevenlabs_api_key>
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import db from './db.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


const PRACTICE_ID = 1; // single-practice Phase 1 scope

// --- Dashboard summary ---
app.get('/api/dashboard/summary', (req, res) => {
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
  const revenueProtected = revenueRow.total; // COALESCE in SQL guarantees this is always a number (0 when no completed visits)
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
app.get('/api/alerts', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM alerts WHERE practice_id = ? AND status = 'active' ORDER BY
     CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at DESC`
  ).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/alerts/:id/dismiss', (req, res) => {
  db.prepare(`UPDATE alerts SET status = 'dismissed' WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Appointments ---
app.get('/api/appointments', (req, res) => {
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

app.post('/api/appointments', (req, res) => {
  const { patient_id, practitioner_id, start_time, end_time, reason, fee } = req.body;

  // Validate fee: required, must be a finite number >= 0
  const parsedFee = Number(fee);
  if (fee === undefined || fee === null || fee === '' || !Number.isFinite(parsedFee) || parsedFee < 0) {
    return res.status(400).json({ error: 'fee is required and must be a non-negative number' });
  }

  const info = db.prepare(
    `INSERT INTO appointments (practice_id, patient_id, practitioner_id, start_time, end_time, status, reason, fee)
     VALUES (?, ?, ?, ?, ?, 'booked', ?, ?)`
  ).run(PRACTICE_ID, patient_id, practitioner_id, start_time, end_time, reason || null, parsedFee);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch('/api/appointments/:id', (req, res) => {
  const { status, fee } = req.body;

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

  res.json({ ok: true });
});

// --- Patients ---
app.get('/api/patients', (req, res) => {
  const rows = db.prepare(`SELECT * FROM patients WHERE practice_id = ? ORDER BY name`).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/patients', (req, res) => {
  const { name, phone, email } = req.body;
  const info = db.prepare(
    `INSERT INTO patients (practice_id, name, phone, email, status) VALUES (?, ?, ?, ?, 'active')`
  ).run(PRACTICE_ID, name, phone || null, email || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// --- Practitioners ---
app.get('/api/practitioners', (req, res) => {
  const rows = db.prepare(`SELECT * FROM practitioners WHERE practice_id = ? ORDER BY name`).all(PRACTICE_ID);
  res.json(rows);
});

// --- Enquiries / Inbox ---
app.get('/api/enquiries', (req, res) => {
  const rows = db.prepare(
    `SELECT e.*, p.name as patient_name FROM enquiries e
     LEFT JOIN patients p ON p.id = e.patient_id
     WHERE e.practice_id = ? ORDER BY e.created_at DESC`
  ).all(PRACTICE_ID);
  res.json(rows);
});

// --- Follow-ups ---
app.get('/api/follow-ups', (req, res) => {
  const rows = db.prepare(
    `SELECT f.*, p.name as patient_name FROM follow_ups f
     JOIN patients p ON p.id = f.patient_id
     WHERE f.practice_id = ? AND f.status = 'pending'
     ORDER BY CASE f.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.due_date`
  ).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/follow-ups/:id/complete', (req, res) => {
  db.prepare(`UPDATE follow_ups SET status = 'done' WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Suggested actions (derived view, Phase 1: rule-based, not AI yet) ---
app.get('/api/suggested-actions', (req, res) => {
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
app.get('/api/analytics', (req, res) => {
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
app.post('/api/enquiries', (req, res) => {
  const { caller_name, source, status, notes, patient_id } = req.body;
  const info = db.prepare(
    `INSERT INTO enquiries (practice_id, patient_id, caller_name, source, status, notes) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, patient_id || null, caller_name, source || 'phone', status || 'open', notes || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch('/api/enquiries/:id', (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE enquiries SET status = ? WHERE id = ? AND practice_id = ?`).run(status, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Follow-ups: create ---
app.post('/api/follow-ups', (req, res) => {
  const { patient_id, type, priority, due_date, notes } = req.body;
  const info = db.prepare(
    `INSERT INTO follow_ups (practice_id, patient_id, type, priority, status, due_date, notes) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  ).run(PRACTICE_ID, patient_id, type, priority || 'medium', due_date || null, notes || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// --- Patients: edit + delete ---
app.patch('/api/patients/:id', (req, res) => {
  const { name, phone, email, status } = req.body;
  db.prepare(`UPDATE patients SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), status = COALESCE(?, status) WHERE id = ? AND practice_id = ?`)
    .run(name, phone, email, status, req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

app.delete('/api/patients/:id', (req, res) => {
  db.prepare(`DELETE FROM patients WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

app.delete('/api/appointments/:id', (req, res) => {
  db.prepare(`DELETE FROM appointments WHERE id = ? AND practice_id = ?`).run(req.params.id, PRACTICE_ID);
  res.json({ ok: true });
});

// --- Call Logs ---
app.get('/api/call-logs', (req, res) => {
  const rows = db.prepare(
    `SELECT cl.*, p.name as patient_name FROM call_logs cl
     LEFT JOIN patients p ON p.id = cl.patient_id
     WHERE cl.practice_id = ? ORDER BY cl.created_at DESC`
  ).all(PRACTICE_ID);
  res.json(rows);
});

app.post('/api/call-logs', (req, res) => {
  const { caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, patient_id, appointment_id } = req.body;
  const info = db.prepare(
    `INSERT INTO call_logs (practice_id, patient_id, caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(PRACTICE_ID, patient_id || null, caller_name, caller_name_spelled || null, caller_phone || null, caller_email || null, call_type || 'inbound_ai', is_after_hours || 0, duration_seconds || null, intent || 'general_inquiry', ai_summary || null, transcript || null, sentiment || 'neutral', status || 'open', is_won_back || 0, appointment_id || null);

  // Auto-escalate clinical emergencies and patient complaints
  if (intent === 'clinical_emergency' || intent === 'patient_complaint') {
    const severity = intent === 'clinical_emergency' ? 'critical' : 'high';
    const alertType = intent === 'clinical_emergency' ? 'clinical_emergency' : 'patient_complaint';
    const title = intent === 'clinical_emergency'
      ? `Clinical Emergency – ${caller_name || 'Unknown'}`
      : `Patient Complaint – ${caller_name || 'Unknown'}`;
    db.prepare(
      `INSERT INTO alerts (practice_id, type, severity, title, message, status, call_log_id, escalation_type)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(PRACTICE_ID, alertType, severity, title, ai_summary || 'AI escalated this call for human review.', info.lastInsertRowid, alertType);
  }

  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch('/api/call-logs/:id', (req, res) => {
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

  // Calculate start and end time
  const effectiveStartTime = start_time || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(17, 0, 0, 0);
    return d.toISOString().slice(0, 19);
  })();

  // Check time slot availability
  if (effectiveStartTime) {
    const conflict = db.prepare(
      `SELECT id FROM appointments WHERE practice_id = ? AND practitioner_id = ? AND start_time = ? AND status != 'cancelled'`
    ).get(practiceId, practitioner.id, effectiveStartTime);
    if (conflict) {
      const err = new Error('Time slot not available');
      err.conflict_id = conflict.id;
      err.status = 409;
      throw err;
    }
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

  const startDate = new Date(effectiveStartTime);
  const endDate = new Date(startDate.getTime() + 45 * 60000);
  const end_time = endDate.toISOString().slice(0, 19);

  // Book appointment
  const parsedFee = Number(fee) || 150;
  const apptInfo = db.prepare(
    `INSERT INTO appointments (practice_id, patient_id, practitioner_id, start_time, end_time, status, reason, fee, booked_by_ai, call_log_id)
     VALUES (?, ?, ?, ?, ?, 'booked', ?, ?, 1, NULL)`
  ).run(practiceId, patient.id, practitioner.id, effectiveStartTime, end_time, reason || 'Check-up', parsedFee);

  // Create call log
  const spelled = (caller_name || patient.name) ? (caller_name || patient.name).toUpperCase().split('').join('-').replace(/ /g, '  ') : null;
  const clInfo = db.prepare(
    `INSERT INTO call_logs (practice_id, patient_id, caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id)
     VALUES (?, ?, ?, ?, ?, ?, 'inbound_ai', ?, ?, 'appointment_booking', ?, ?, 'positive', 'resolved', ?, ?)`
  ).run(practiceId, patient.id, caller_name || patient.name, spelled, caller_phone || null, caller_email || null, is_after_hours || 0, null, call_summary || `AI booked ${reason || 'appointment'} with ${practitioner.name}`, call_transcript || null, is_after_hours ? 1 : 0, apptInfo.lastInsertRowid);

  // Link call_log_id back to appointment
  db.prepare(`UPDATE appointments SET call_log_id = ? WHERE id = ?`).run(clInfo.lastInsertRowid, apptInfo.lastInsertRowid);

  // Get settings for confirmation info
  const settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(practiceId);
  const confirmations = {
    sms: settings?.enable_sms_confirmation ? true : false,
    email: settings?.enable_email_confirmation ? true : false,
    whatsapp: settings?.enable_whatsapp_confirmation ? true : false,
  };

  return {
    ok: true,
    appointment_id: apptInfo.lastInsertRowid,
    call_log_id: clInfo.lastInsertRowid,
    patient_id: patient.id,
    patient_name: patient.name,
    practitioner: practitioner.name,
    practitioner_id: practitioner.id,
    start_time: effectiveStartTime,
    end_time,
    reason: reason || 'Check-up',
    fee: parsedFee,
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

  // Option 2: Cloud Groq Whisper API (Ultra-fast ~150ms transcription if key provided)
  if (process.env.GROQ_API_KEY) {
    try {
      console.log('[Transcribe] Using Groq Cloud Whisper API...');
      const fileBuffer = await fs.promises.readFile(filePath);
      const blob = new Blob([fileBuffer], { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      formData.append('prompt', 'Reyan Das, Helen Styles, Dr. Lindsay Wren, dental clinic appointment');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: formData,
      });

      if (response.ok) {
        const json = await response.json();
        return { text: json.text || '' };
      }
    } catch (e) {
      console.warn('[Transcribe] Groq API call failed:', e.message);
    }
  }

  // Option 3: Cloud OpenAI Whisper API
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('[Transcribe] Using OpenAI Cloud Whisper API...');
      const fileBuffer = await fs.promises.readFile(filePath);
      const blob = new Blob([fileBuffer], { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
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
app.get('/api/ai-settings', (req, res) => {
  let settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  if (!settings) {
    db.prepare(`INSERT INTO ai_settings (practice_id) VALUES (?)`).run(PRACTICE_ID);
    settings = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  }
  res.json(settings);
});

app.patch('/api/ai-settings', (req, res) => {
  const { greeting_script, voice_id, voice_name, language, enable_sms_confirmation, enable_email_confirmation, enable_whatsapp_confirmation, after_hours_enabled, emergency_forward_phone, voice_clone_sample_name } = req.body;
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
      voice_clone_sample_name = COALESCE(?, voice_clone_sample_name)
    WHERE practice_id = ?`
  ).run(
    greeting_script ?? null, voice_id ?? null, voice_name ?? null, language ?? null,
    enable_sms_confirmation ?? null, enable_email_confirmation ?? null, enable_whatsapp_confirmation ?? null,
    after_hours_enabled ?? null, emergency_forward_phone ?? null, voice_clone_sample_name ?? null,
    PRACTICE_ID
  );
  const updated = db.prepare(`SELECT * FROM ai_settings WHERE practice_id = ?`).get(PRACTICE_ID);
  res.json(updated);
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
