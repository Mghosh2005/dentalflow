import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

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

  res.json({
    todaysAppointments,
    activePatients,
    revenueProtected,
    conversionRate,
    missedCalls,
    missedAppointments,
    pendingFollowUps,
    date: today,
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

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Serve frontend in production ---
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DentalFlow API listening on port ${PORT}`));
