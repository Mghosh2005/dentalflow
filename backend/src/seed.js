import db from './db.js';
import bcrypt from 'bcryptjs';

db.pragma('foreign_keys = OFF');
const clearAll = db.transaction(() => {
  db.exec(`
    DELETE FROM follow_up_messages;
    DELETE FROM message_templates;
    DELETE FROM treatment_plans;
    DELETE FROM practitioner_availability;
    DELETE FROM user_accounts;
    DELETE FROM call_logs;
    DELETE FROM ai_settings;
    DELETE FROM alerts;
    DELETE FROM follow_ups;
    DELETE FROM enquiries;
    DELETE FROM appointments;
    DELETE FROM patients;
    DELETE FROM practitioners;
    DELETE FROM users;
    DELETE FROM practices;
    DELETE FROM sqlite_sequence WHERE name IN
      ('follow_up_messages','message_templates','treatment_plans','practitioner_availability',
       'user_accounts','call_logs','ai_settings','alerts','follow_ups','enquiries',
       'appointments','patients','practitioners','users','practices');
  `);
});
clearAll();
db.pragma('foreign_keys = ON');

// 1. Practices
const insertPractice = db.prepare(`INSERT INTO practices (name, address, timezone) VALUES (?, ?, ?)`);
const p1 = insertPractice.run('DentalFlow – Downtown', '120 Main Street, Downtown', 'America/New_York').lastInsertRowid;
const p2 = insertPractice.run('DentalFlow – Westside Plaza', '450 West Avenue, Suite 200', 'America/New_York').lastInsertRowid;
const p3 = insertPractice.run('DentalFlow – North Hills', '88 North Hills Blvd', 'America/New_York').lastInsertRowid;
const practiceId = p1;

// 2. Staff user
const insertUser = db.prepare(`INSERT INTO users (practice_id, name, role, email) VALUES (?, ?, ?, ?)`);
const staffUserId = insertUser.run(practiceId, 'Dr. Sarah Mitchell', 'owner_admin', 'sarah.mitchell@dentalflow.example').lastInsertRowid;

// 3. Practitioners
const insertPractitioner = db.prepare(`
  INSERT INTO practitioners (practice_id, name, specialty, phone, email, title)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const drMitchell = insertPractitioner.run(practiceId, 'Dr. Sarah Mitchell', 'General Dentistry', '555-0201', 'dr.mitchell@dentalflow.com', 'DMD, Lead Clinician').lastInsertRowid;
const drWren = insertPractitioner.run(practiceId, 'Dr. Lindsay Wren', 'Orthodontics', '555-0202', 'dr.wren@dentalflow.com', 'DDS, Orthodontic Specialist').lastInsertRowid;
const msStyles = insertPractitioner.run(practiceId, 'Helen Styles', 'Dental Hygienist', '555-0203', 'helen.styles@dentalflow.com', 'RDH, Senior Hygienist').lastInsertRowid;

// 4. Practitioner availability (Mon - Fri 8am - 6pm)
const insertAvail = db.prepare(`
  INSERT INTO practitioner_availability (practitioner_id, day_of_week, start_time, end_time, slot_duration_minutes)
  VALUES (?, ?, ?, ?, ?)
`);
for (const pid of [drMitchell, drWren, msStyles]) {
  for (let day = 1; day <= 5; day++) {
    insertAvail.run(pid, day, '08:00', '18:00', 30);
  }
}

// 5. Patients with all 9 fields
const insertPatient = db.prepare(`
  INSERT INTO patients (practice_id, name, first_name, last_name, date_of_birth, gender, phone, email, address, medical_notes, emergency_contact, status, last_visit_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const patientsData = [
  {
    name: 'Christopher White',
    first_name: 'Christopher',
    last_name: 'White',
    dob: '1985-04-12',
    gender: 'Male',
    phone: '555-0101',
    email: 'c.white@example.com',
    address: '742 Evergreen Terrace, Downtown',
    medical_notes: 'Allergic to Penicillin. Mild hypertension (controlled). Sensitive to cold on upper left premolar.',
    emergency_contact: '555-0191 (Sarah White - Spouse)',
    status: 'active',
    last_visit: '2026-06-10'
  },
  {
    name: 'James Thomas',
    first_name: 'James',
    last_name: 'Thomas',
    dob: '1990-11-23',
    gender: 'Male',
    phone: '555-0102',
    email: 'j.thomas@example.com',
    address: '124 Conch Street, Downtown',
    medical_notes: 'Asthma (carries Albuterol inhaler). No known drug allergies.',
    emergency_contact: '555-0192 (Linda Thomas - Mother)',
    status: 'active',
    last_visit: '2026-05-02'
  },
  {
    name: 'Emma Rodriguez',
    first_name: 'Emma',
    last_name: 'Rodriguez',
    dob: '1993-07-15',
    gender: 'Female',
    phone: '555-0103',
    email: 'e.rodriguez@example.com',
    address: '350 Fifth Ave, Apt 4B, Downtown',
    medical_notes: 'Undergoing Invisalign aligner treatment (Tray 6/24). Nil allergies.',
    emergency_contact: '555-0193 (Carlos Rodriguez - Brother)',
    status: 'active',
    last_visit: '2026-08-01'
  },
  {
    name: 'Michael Chen',
    first_name: 'Michael',
    last_name: 'Chen',
    dob: '1982-02-18',
    gender: 'Male',
    phone: '555-0104',
    email: 'm.chen@example.com',
    address: '89 Maple Street, Downtown',
    medical_notes: 'Type 2 Diabetes (HbA1c 6.8). Requires prophylactic antibiotic prior to extensive surgery.',
    emergency_contact: '555-0194 (Amy Chen - Spouse)',
    status: 'active',
    last_visit: '2026-02-14'
  },
  {
    name: 'Olivia Bennett',
    first_name: 'Olivia',
    last_name: 'Bennett',
    dob: '1998-09-05',
    gender: 'Female',
    phone: '555-0105',
    email: 'o.bennett@example.com',
    address: '42 Wallaby Way, Downtown',
    medical_notes: 'Latex sensitivity (use nitrile gloves only). Regular 6-month cleaning patient.',
    emergency_contact: '555-0195 (David Bennett - Father)',
    status: 'active',
    last_visit: '2026-01-20'
  },
  {
    name: 'Peter Strain',
    first_name: 'Peter',
    last_name: 'Strain',
    dob: '1979-12-30',
    gender: 'Male',
    phone: '555-0106',
    email: 'peter.strain@example.com',
    address: '15 Highfield Road, Downtown',
    medical_notes: 'Bruxism / teeth grinding (wears occlusal night guard). Interested in Invisalign.',
    emergency_contact: '555-0196 (Karen Strain - Spouse)',
    status: 'active',
    last_visit: null
  },
  {
    name: 'Ava Patel',
    first_name: 'Ava',
    last_name: 'Patel',
    dob: '1995-03-28',
    gender: 'Female',
    phone: '555-0107',
    email: 'ava.patel@example.com',
    address: '22 Elm Street, Downtown',
    medical_notes: 'No medical alerts. Enjoys preventative hygiene treatments.',
    emergency_contact: '555-0197 (Rohan Patel - Brother)',
    status: 'active',
    last_visit: '2026-07-18'
  },
  {
    name: 'Noah Kim',
    first_name: 'Noah',
    last_name: 'Kim',
    dob: '2001-08-14',
    gender: 'Male',
    phone: '555-0108',
    email: 'noah.kim@example.com',
    address: '601 Pine Street, Downtown',
    medical_notes: 'Mild enamel hypoplasia. Inquired about professional teeth whitening.',
    emergency_contact: '555-0198 (Grace Kim - Mother)',
    status: 'active',
    last_visit: '2026-08-15'
  },
];

const patientIds = patientsData.map((p) =>
  insertPatient.run(
    practiceId,
    p.name,
    p.first_name,
    p.last_name,
    p.dob,
    p.gender,
    p.phone,
    p.email,
    p.address,
    p.medical_notes,
    p.emergency_contact,
    p.status,
    p.last_visit
  ).lastInsertRowid
);

// 6. Appointments
const insertAppt = db.prepare(`
  INSERT INTO appointments (practice_id, patient_id, practitioner_id, start_time, end_time, status, reason, fee, booked_by_ai)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Upcoming & recent appointments
const appt1 = insertAppt.run(practiceId, patientIds[2], drMitchell, '2026-08-22T09:00:00', '2026-08-22T09:30:00', 'booked', 'Routine Check-up', 150, 0).lastInsertRowid;
const appt2 = insertAppt.run(practiceId, patientIds[3], drWren, '2026-08-22T11:00:00', '2026-08-22T11:45:00', 'booked', 'Ortho Consultation', 220, 0).lastInsertRowid;
const apptMissed = insertAppt.run(practiceId, patientIds[0], drMitchell, '2026-08-18T10:00:00', '2026-08-18T10:30:00', 'missed', 'Dental Hygiene & Cleaning', 150, 0).lastInsertRowid;
const appt4 = insertAppt.run(practiceId, patientIds[6], msStyles, '2026-08-25T14:00:00', '2026-08-25T14:30:00', 'booked', 'Hygiene & Cleaning', 120, 0).lastInsertRowid;
const apptCancelled = insertAppt.run(practiceId, patientIds[1], drMitchell, '2026-08-19T15:30:00', '2026-08-19T16:00:00', 'cancelled', 'Tooth Restoration (Cavity)', 180, 0).lastInsertRowid;
const apptChristopherNext = insertAppt.run(practiceId, patientIds[0], drMitchell, '2026-09-02T10:00:00', '2026-09-00:45:00', 'booked', 'Deep Scaling & Root Planing (Quadrant 3-4)', 220, 0).lastInsertRowid;

// Historical completed appointments (past 6 months)
const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
let count = 0;
for (const m of months) {
  const visitsThisMonth = 7 + (count % 4);
  for (let i = 0; i < visitsThisMonth; i++) {
    const day = String(2 + ((i * 4) % 26)).padStart(2, '0');
    const patient = patientIds[(count + i) % patientIds.length];
    const practitioner = [drMitchell, drWren, msStyles][(count + i) % 3];
    const reasons = ['Routine Check-up', 'Teeth Whitening', 'Hygiene & Cleaning', 'Ortho Assessment', 'Cavity Filling'];
    const reason = reasons[(count + i) % reasons.length];
    const fee = [120, 150, 180, 220, 350][(count + i) % 5];
    const status = i % 8 === 0 ? 'missed' : 'completed';
    insertAppt.run(practiceId, patient, practitioner, `${m}-${day}T10:00:00`, `${m}-${day}T10:30:00`, status, reason, fee, 0);
  }
  count++;
}

// 7. Enquiries
const insertEnquiry = db.prepare(`INSERT INTO enquiries (practice_id, patient_id, caller_name, source, status, notes) VALUES (?, ?, ?, ?, ?, ?)`);
insertEnquiry.run(practiceId, patientIds[5], 'Peter Strain', 'phone', 'resolved', 'Booked checkup with Dr Lindsay Wren; also asked about Invisalign pricing.');
const missedCallEnquiry = insertEnquiry.run(practiceId, patientIds[1], 'James Thomas', 'phone', 'missed', 'Missed call, no voicemail left. Reason for call unknown.').lastInsertRowid;
insertEnquiry.run(practiceId, null, 'Unknown caller', 'phone', 'open', 'New patient enquiry about availability.');
insertEnquiry.run(practiceId, patientIds[7], 'Noah Kim', 'web', 'open', 'Web enquiry about teeth whitening.');

// 8. Follow-ups (tasks)
const insertFollowUp = db.prepare(`INSERT INTO follow_ups (practice_id, patient_id, type, priority, status, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insertFollowUp.run(practiceId, patientIds[3], 'recall', 'high', 'pending', '2026-08-25', 'No visit in 6 months');
insertFollowUp.run(practiceId, patientIds[4], 'recall', 'high', 'pending', '2026-08-25', 'No visit in 6 months');
insertFollowUp.run(practiceId, patientIds[0], 'no_show_rebook', 'high', 'pending', '2026-08-23', 'Missed Monday checkup, follow-up message pending approval');
insertFollowUp.run(practiceId, patientIds[5], 'consult_followup', 'medium', 'pending', '2026-08-30', 'Invisalign pricing lead from live call');

// 9. Alerts
const insertAlert = db.prepare(`INSERT INTO alerts (practice_id, type, severity, title, message, status) VALUES (?, ?, ?, ?, ?, ?)`);
insertAlert.run(practiceId, 'revenue_target', 'critical', 'Revenue Alert – Below Weekly Target', "This week's confirmed revenue is 18% below the weekly target. Review cancellations and unfilled slots.", 'active');
insertAlert.run(practiceId, 'missed_appointment', 'high', 'Missed Appointment – Christopher White', 'Christopher White did not attend his scheduled hygiene visit on Monday. Automated follow-up message prepared and awaiting approval.', 'active');
insertAlert.run(practiceId, 'missed_call', 'high', 'Missed Call – James Thomas', 'Missed call from James Thomas. Automated callback message prepared for staff approval.', 'active');
insertAlert.run(practiceId, 'missed_call', 'high', 'Missed Call – Unknown Caller', 'A new-patient enquiry call went unanswered after hours.', 'active');

// 10. AI Settings
const insertAiSettings = db.prepare(
  `INSERT INTO ai_settings (practice_id, greeting_script, voice_id, voice_name, language, enable_sms_confirmation, enable_email_confirmation, enable_whatsapp_confirmation, after_hours_enabled, emergency_forward_phone)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
insertAiSettings.run(practiceId, 'Thank you for calling DentalFlow Downtown. This is Neerja, your AI receptionist. How can I help you today?', 'en-IN-NeerjaExpressiveNeural', 'Neerja (Expressive Female)', 'en-IN', 1, 1, 0, 1, '555-0199');

// 11. Call Logs
const insertCallLog = db.prepare(
  `INSERT INTO call_logs (practice_id, patient_id, caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const aiAppt1 = insertAppt.run(practiceId, patientIds[5], drWren, '2026-09-01T17:00:00', '2026-09-01T17:45:00', 'booked', 'New Patient Check-up (AI Booked)', 180, 1).lastInsertRowid;
const cl1 = insertCallLog.run(practiceId, patientIds[5], 'Peter Strain', 'P-E-T-E-R  S-T-R-A-I-N', '555-0106', 'peter.strain@example.com', 'inbound_ai', 1, 187, 'appointment_booking',
  'Patient Peter Strain called after hours to book a new patient check-up. AI successfully scheduled appointment with Dr. Lindsay Wren for September 1st at 5:00 PM. Patient also inquired about Invisalign pricing.',
  '[{"role":"ai","text":"Thank you for calling DentalFlow Downtown. This is Neerja, your AI receptionist. How can I help you today?"},{"role":"caller","text":"Hi, I would like to book an appointment for a check-up please."},{"role":"ai","text":"Of course! Could I have your name please?"},{"role":"caller","text":"Peter Strain. P-E-T-E-R  S-T-R-A-I-N."},{"role":"ai","text":"Thank you, Peter. And your phone number?"},{"role":"caller","text":"555-0106."},{"role":"ai","text":"Dr. Wren has availability on September 1st at 5:00 PM. Would that work?"},{"role":"caller","text":"That is perfect, yes please."},{"role":"ai","text":"Wonderful! I have booked your check-up with Dr. Lindsay Wren on September 1st at 5:00 PM."}]',
  'positive', 'resolved', 1, aiAppt1);

const clMissed = insertCallLog.run(practiceId, patientIds[1], 'James Thomas', null, '555-0102', 'j.thomas@example.com', 'missed_call', 0, 0, 'missed_call',
  'Incoming call from James Thomas was unanswered during lunch hour. System generated missed-call follow-up for staff approval.',
  '[]', 'neutral', 'open', 0, null).lastInsertRowid;

// 12. Message Templates
const insertTmpl = db.prepare(
  `INSERT INTO message_templates (practice_id, trigger_type, name, template_text) VALUES (?, ?, ?, ?)`
);
const tmplReminder = insertTmpl.run(
  practiceId,
  'appointment_reminder',
  'Appointment Reminder (30 min)',
  'Hello {{patient_name}}, this is a friendly reminder that your appointment with {{practitioner_name}} is in 30 minutes at {{appointment_time}} at DentalFlow Downtown. Please let us know if you need parking or directions!'
).lastInsertRowid;

const tmplNoShow = insertTmpl.run(
  practiceId,
  'no_show',
  'No-Show Follow-up',
  'Hello {{patient_name}}, we missed seeing you for your appointment with {{practitioner_name}} at {{appointment_time}}. We hope everything is okay! Please give us a call or reply to this message so we can easily reschedule your visit.'
).lastInsertRowid;

const tmplCancelled = insertTmpl.run(
  practiceId,
  'cancellation',
  'Cancelled Appointment Follow-up',
  'Hello {{patient_name}}, we received your cancellation for your appointment on {{appointment_date}}. When you are ready to rebook with {{practitioner_name}}, you can reply here or visit your DentalFlow patient portal anytime!'
).lastInsertRowid;

const tmplMissedCall = insertTmpl.run(
  practiceId,
  'missed_call',
  'Missed-Call Follow-up',
  'Hello {{patient_name}}, we noticed we missed your call earlier today at DentalFlow Downtown. We apologize for the wait! How can we assist you today? Feel free to reply to this message or call us back at 555-0100.'
).lastInsertRowid;

// 13. Pre-populated Follow-Up Messages (ready for "Approve & Send")
const insertFm = db.prepare(`
  INSERT INTO follow_up_messages (practice_id, patient_id, appointment_id, call_log_id, trigger_type, trigger_event_id, message_text, template_id, status, delivery_method)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// 1. Appointment reminder (30 min before upcoming check-up)
insertFm.run(
  practiceId,
  patientIds[2], // Emma Rodriguez
  appt1,
  null,
  'appointment_reminder',
  `reminder_seed_${appt1}`,
  'Hello Emma Rodriguez, this is a friendly reminder that your appointment with Dr. Sarah Mitchell is in 30 minutes at 9:00 AM at DentalFlow Downtown. Please let us know if you need parking or directions!',
  tmplReminder,
  'pending_approval',
  'sms'
);

// 2. No-show follow-up
insertFm.run(
  practiceId,
  patientIds[0], // Christopher White
  apptMissed,
  null,
  'no_show',
  `noshow_seed_${apptMissed}`,
  'Hello Christopher White, we missed seeing you for your hygiene appointment with Dr. Sarah Mitchell at 10:00 AM on Monday. We hope everything is okay! Please give us a call or reply to this message so we can easily reschedule your visit.',
  tmplNoShow,
  'pending_approval',
  'sms'
);

// 3. Cancelled appointment follow-up
insertFm.run(
  practiceId,
  patientIds[1], // James Thomas
  apptCancelled,
  null,
  'cancellation',
  `cancel_seed_${apptCancelled}`,
  'Hello James Thomas, we received your cancellation for your appointment on August 19th. When you are ready to rebook with Dr. Sarah Mitchell, you can reply here or visit your DentalFlow patient portal anytime!',
  tmplCancelled,
  'pending_approval',
  'sms'
);

// 4. Missed-call follow-up
insertFm.run(
  practiceId,
  patientIds[1], // James Thomas
  null,
  clMissed,
  'missed_call',
  `missedcall_seed_${clMissed}`,
  'Hello James Thomas, we noticed we missed your call earlier today at DentalFlow Downtown. We apologize for the wait! How can we assist you today? Feel free to reply to this message or call us back at 555-0100.',
  tmplMissedCall,
  'pending_approval',
  'sms'
);

// 14. Treatment Plans
const insertTp = db.prepare(`
  INSERT INTO treatment_plans (practice_id, patient_id, plan_name, procedure_name, practitioner_id, status, notes, start_date, end_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Christopher White treatment plans
insertTp.run(
  practiceId,
  patientIds[0],
  'Comprehensive Periodontal Therapy',
  'Scaling & Root Planing (Full Mouth, 4 Quads)',
  drMitchell,
  'in_progress',
  'Quadrants 1 & 2 completed on Aug 18. Quadrants 3 & 4 scheduled for next visit. Chlorhexidine 0.12% oral rinse prescribed twice daily.',
  '2026-08-01',
  '2026-10-15'
);

insertTp.run(
  practiceId,
  patientIds[0],
  'Restorative Dental Treatment',
  'Tooth #14 MOD Composite Resin Restoration',
  drMitchell,
  'planned',
  'Moderate recurrent decay observed beneath fractured restoration. Scheduled following completion of periodontal treatment.',
  '2026-10-20',
  '2026-11-05'
);

// Emma Rodriguez treatment plan
insertTp.run(
  practiceId,
  patientIds[2],
  'Clear Aligner Orthodontics',
  'Invisalign Comprehensive Tier (24 Aligner Trays)',
  drWren,
  'in_progress',
  'Currently wearing Aligner #6 of 24. Tracking is excellent, interproximal reduction (IPR) completed on lower anteriors.',
  '2026-07-15',
  '2027-04-30'
);

// Michael Chen treatment plan
insertTp.run(
  practiceId,
  patientIds[3],
  'Endodontic & Prosthodontic Rehabilitation',
  'Root Canal Treatment & Zirconia Crown Tooth #19',
  drMitchell,
  'planned',
  'Acute apical periodontitis present. Prescribed amoxicillin 500mg. Scheduled for pulpectomy and obturation upon resolution of acute symptoms.',
  '2026-09-05',
  '2026-09-30'
);

// 15. User Accounts for Authentication (password: admin123 for staff, patient123 for patients)
const insertAccount = db.prepare(`
  INSERT INTO user_accounts (practice_id, username, password_hash, role, staff_user_id, patient_id, display_name)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const staffHash = bcrypt.hashSync('admin123', 10);
const patientHash = bcrypt.hashSync('patient123', 10);

insertAccount.run(practiceId, 'admin', staffHash, 'staff', staffUserId, null, 'Dr. Sarah Mitchell');
insertAccount.run(practiceId, 'c.white', patientHash, 'patient', null, patientIds[0], 'Christopher White');
insertAccount.run(practiceId, 'j.thomas', patientHash, 'patient', null, patientIds[1], 'James Thomas');
insertAccount.run(practiceId, 'e.rodriguez', patientHash, 'patient', null, patientIds[2], 'Emma Rodriguez');
insertAccount.run(practiceId, 'm.chen', patientHash, 'patient', null, patientIds[3], 'Michael Chen');

console.log('Seed completed successfully!');
console.log('Credentials:');
console.log(' - Staff: admin / admin123');
console.log(' - Patient: c.white / patient123');
