import db from './db.js';

const clearAll = db.transaction(() => {
  db.exec(`
    DELETE FROM alerts;
    DELETE FROM follow_ups;
    DELETE FROM enquiries;
    DELETE FROM appointments;
    DELETE FROM patients;
    DELETE FROM practitioners;
    DELETE FROM users;
    DELETE FROM practices;
    DELETE FROM sqlite_sequence WHERE name IN
      ('alerts','follow_ups','enquiries','appointments','patients','practitioners','users','practices');
  `);
});
clearAll();

const insertPractice = db.prepare(`INSERT INTO practices (name, address, timezone) VALUES (?, ?, ?)`);
const practiceId = insertPractice.run('DentalFlow – Downtown', '120 Main Street, Downtown', 'America/New_York').lastInsertRowid;

const insertUser = db.prepare(`INSERT INTO users (practice_id, name, role, email) VALUES (?, ?, ?, ?)`);
insertUser.run(practiceId, 'Dr. Sarah Mitchell', 'owner_admin', 'sarah.mitchell@dentalflow.example');

const insertPractitioner = db.prepare(`INSERT INTO practitioners (practice_id, name, specialty) VALUES (?, ?, ?)`);
const drMitchell = insertPractitioner.run(practiceId, 'Dr. Sarah Mitchell', 'General Dentistry').lastInsertRowid;
const drWren = insertPractitioner.run(practiceId, 'Dr. Lindsay Wren', 'Orthodontics').lastInsertRowid;
const msStyles = insertPractitioner.run(practiceId, 'Helen Styles', 'Dental Hygienist').lastInsertRowid;

const insertPatient = db.prepare(`INSERT INTO patients (practice_id, name, phone, email, status, last_visit_date) VALUES (?, ?, ?, ?, ?, ?)`);
const patients = [
  ['Christopher White', '555-0101', 'c.white@example.com', 'active', '2026-06-10'],
  ['James Thomas', '555-0102', 'j.thomas@example.com', 'active', '2026-05-02'],
  ['Emma Rodriguez', '555-0103', 'e.rodriguez@example.com', 'active', '2026-08-01'],
  ['Michael Chen', '555-0104', 'm.chen@example.com', 'active', '2026-02-14'],
  ['Olivia Bennett', '555-0105', 'o.bennett@example.com', 'active', '2026-01-20'],
  ['Peter Strain', '555-0106', 'peter.strain@example.com', 'active', null],
  ['Ava Patel', '555-0107', 'ava.patel@example.com', 'active', '2026-07-18'],
  ['Noah Kim', '555-0108', 'noah.kim@example.com', 'active', '2026-08-15'],
];
const patientIds = patients.map(p => insertPatient.run(practiceId, ...p).lastInsertRowid);

const insertAppt = db.prepare(`INSERT INTO appointments (practice_id, patient_id, practitioner_id, start_time, end_time, status, reason, fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
insertAppt.run(practiceId, patientIds[2], drMitchell, '2026-08-22T09:00:00', '2026-08-22T09:30:00', 'booked', 'Checkup', 150);
insertAppt.run(practiceId, patientIds[3], drWren, '2026-08-22T11:00:00', '2026-08-22T11:45:00', 'booked', 'Ortho consult', 220);
insertAppt.run(practiceId, patientIds[0], drMitchell, '2026-08-18T10:00:00', '2026-08-18T10:30:00', 'missed', 'Checkup', 150);
insertAppt.run(practiceId, patientIds[6], msStyles, '2026-08-25T14:00:00', '2026-08-25T14:30:00', 'booked', 'Hygiene', 120);
insertAppt.run(practiceId, patientIds[5], drWren, '2026-09-01T17:00:00', '2026-09-01T17:45:00', 'booked', 'New patient checkup', 180);

// Historical completed appointments (past 6 months) so Analytics has real trend data
const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
let count = 0;
for (const m of months) {
  const visitsThisMonth = 6 + (count % 4); // vary volume a bit
  for (let i = 0; i < visitsThisMonth; i++) {
    const day = String(2 + ((i * 4) % 26)).padStart(2, '0');
    const patient = patientIds[(count + i) % patientIds.length];
    const practitioner = [drMitchell, drWren, msStyles][(count + i) % 3];
    const fee = [120, 150, 180, 220][(count + i) % 4];
    const status = i % 9 === 0 ? 'missed' : 'completed';
    insertAppt.run(practiceId, patient, practitioner, `${m}-${day}T10:00:00`, `${m}-${day}T10:30:00`, status, 'Checkup', fee);
  }
  count++;
}

const insertEnquiry = db.prepare(`INSERT INTO enquiries (practice_id, patient_id, caller_name, source, status, notes) VALUES (?, ?, ?, ?, ?, ?)`);
insertEnquiry.run(practiceId, patientIds[5], 'Peter Strain', 'phone', 'resolved', 'Booked checkup with Dr Lindsay Wren; also asked about Invisalign pricing.');
insertEnquiry.run(practiceId, patientIds[1], 'James Thomas', 'phone', 'missed', 'Missed call, no voicemail left. Reason for call unknown.');
insertEnquiry.run(practiceId, null, 'Unknown caller', 'phone', 'open', 'New patient enquiry about availability.');
insertEnquiry.run(practiceId, patientIds[7], 'Noah Kim', 'web', 'open', 'Web enquiry about teeth whitening.');

const insertFollowUp = db.prepare(`INSERT INTO follow_ups (practice_id, patient_id, type, priority, status, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insertFollowUp.run(practiceId, patientIds[3], 'recall', 'high', 'pending', '2026-08-25', 'No visit in 6 months');
insertFollowUp.run(practiceId, patientIds[4], 'recall', 'high', 'pending', '2026-08-25', 'No visit in 6 months');
insertFollowUp.run(practiceId, patientIds[0], 'no_show_rebook', 'high', 'pending', '2026-08-23', 'Missed Monday checkup, rebooking follow-up sent, no response yet');
insertFollowUp.run(practiceId, patientIds[5], 'consult_followup', 'medium', 'pending', '2026-08-30', 'Invisalign pricing lead from live call');
for (let i = 0; i < 5; i++) {
  insertFollowUp.run(practiceId, patientIds[i % patientIds.length], 'pending_message', 'medium', 'pending', '2026-08-23', `Follow-up message #${i + 1} awaiting approval`);
}

const insertAlert = db.prepare(`INSERT INTO alerts (practice_id, type, severity, title, message, status) VALUES (?, ?, ?, ?, ?, ?)`);
insertAlert.run(practiceId, 'revenue_target', 'critical', 'Revenue Alert – Below Weekly Target', "This week's confirmed revenue is 18% below the weekly target. Review cancellations and unfilled slots.", 'active');
insertAlert.run(practiceId, 'missed_appointment', 'high', 'Missed Appointment – Christopher White', 'Christopher White did not attend his scheduled check-up on Monday. Rebooking follow-up has been sent but no response yet.', 'active');
insertAlert.run(practiceId, 'missed_call', 'high', 'Missed Call – James Thomas', 'Missed call from James Thomas. No voicemail left. Reason for call unknown. Call back required urgently.', 'active');
insertAlert.run(practiceId, 'missed_call', 'high', 'Missed Call – Unknown Caller', 'A new-patient enquiry call went unanswered after hours.', 'active');

console.log('Seed complete. Practice ID:', practiceId);
