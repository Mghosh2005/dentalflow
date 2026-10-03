import db from './db.js';

db.pragma('foreign_keys = OFF');
const clearAll = db.transaction(() => {
  db.exec(`
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
      ('call_logs','ai_settings','alerts','follow_ups','enquiries','appointments','patients','practitioners','users','practices');
  `);
});
clearAll();
db.pragma('foreign_keys = ON');

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

// --- Seed AI Settings ---
const insertAiSettings = db.prepare(
  `INSERT INTO ai_settings (practice_id, greeting_script, voice_id, voice_name, language, enable_sms_confirmation, enable_email_confirmation, enable_whatsapp_confirmation, after_hours_enabled, emergency_forward_phone)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
insertAiSettings.run(practiceId, 'Thank you for calling DentalFlow Downtown. This is Neerja, your AI receptionist. How can I help you today?', 'en-IN-NeerjaExpressiveNeural', 'Neerja (Expressive Female)', 'en-IN', 1, 1, 0, 1, '555-0199');

// --- Seed Call Logs & AI-booked appointments ---
const insertCallLog = db.prepare(
  `INSERT INTO call_logs (practice_id, patient_id, caller_name, caller_name_spelled, caller_phone, caller_email, call_type, is_after_hours, duration_seconds, intent, ai_summary, transcript, sentiment, status, is_won_back, appointment_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// AI-booked appointment: Peter Strain with Dr Lindsay Wren
const aiAppt1 = insertAppt.run(practiceId, patientIds[5], drWren, '2026-09-01T17:00:00', '2026-09-01T17:45:00', 'booked', 'New patient check-up (AI booked)', 180);
try { db.exec(`UPDATE appointments SET booked_by_ai = 1 WHERE id = ${aiAppt1.lastInsertRowid}`); } catch(e) {}

const cl1 = insertCallLog.run(practiceId, patientIds[5], 'Peter Strain', 'P-E-T-E-R  S-T-R-A-I-N', '555-0106', 'peter.strain@example.com', 'inbound_ai', 1, 187, 'appointment_booking',
  'Patient Peter Strain called after hours to book a new patient check-up. AI successfully scheduled appointment with Dr. Lindsay Wren for September 1st at 5:00 PM. Patient also inquired about Invisalign pricing and was informed a consultation can be arranged.',
  '[{"role":"ai","text":"Thank you for calling DentalFlow Downtown. This is Neerja, your AI receptionist. How can I help you today?"},{"role":"caller","text":"Hi, I would like to book an appointment for a check-up please."},{"role":"ai","text":"Of course! I would be happy to help you book a check-up. Could I have your name please?"},{"role":"caller","text":"Yes, it is Peter Strain. That is P-E-T-E-R, S-T-R-A-I-N."},{"role":"ai","text":"Thank you, Peter. And could I have your phone number?"},{"role":"caller","text":"Sure, it is 555-0106."},{"role":"ai","text":"Perfect. Do you have a preferred practitioner?"},{"role":"caller","text":"I would like to see Dr. Lindsay Wren if possible."},{"role":"ai","text":"Dr. Wren has availability on September 1st at 5:00 PM. Would that work for you?"},{"role":"caller","text":"That is perfect, yes please."},{"role":"ai","text":"Wonderful! I have booked your check-up with Dr. Lindsay Wren on September 1st at 5:00 PM. A confirmation will be sent to your phone. Is there anything else I can help with?"},{"role":"caller","text":"Actually, can you tell me about Invisalign pricing?"},{"role":"ai","text":"Invisalign consultations start at around $220. I can arrange a separate consultation with Dr. Wren if you are interested. Would you like me to do that?"},{"role":"caller","text":"Not right now, but I will think about it. Thank you!"},{"role":"ai","text":"You are welcome, Peter! We look forward to seeing you. Have a great evening!"}]',
  'positive', 'resolved', 1, aiAppt1.lastInsertRowid);

try { db.exec(`UPDATE appointments SET call_log_id = ${cl1.lastInsertRowid} WHERE id = ${aiAppt1.lastInsertRowid}`); } catch(e) {}

// AI-booked appointment: Emma Rodriguez check-up
const aiAppt2 = insertAppt.run(practiceId, patientIds[2], drMitchell, '2026-09-03T10:00:00', '2026-09-03T10:45:00', 'booked', 'Routine check-up (AI booked)', 150);
try { db.exec(`UPDATE appointments SET booked_by_ai = 1 WHERE id = ${aiAppt2.lastInsertRowid}`); } catch(e) {}

const cl2 = insertCallLog.run(practiceId, patientIds[2], 'Emma Rodriguez', 'E-M-M-A  R-O-D-R-I-G-U-E-Z', '555-0103', 'e.rodriguez@example.com', 'inbound_ai', 0, 124, 'appointment_booking',
  'Patient Emma Rodriguez called to reschedule her upcoming check-up. AI booked a new appointment with Dr. Sarah Mitchell on September 3rd at 10:00 AM.',
  '[{"role":"ai","text":"Thank you for calling DentalFlow Downtown. This is Neerja. How can I help you today?"},{"role":"caller","text":"Hi, I need to reschedule my check-up appointment."},{"role":"ai","text":"Of course! May I have your name please?"},{"role":"caller","text":"Emma Rodriguez. E-M-M-A, R-O-D-R-I-G-U-E-Z."},{"role":"ai","text":"Thank you, Emma. I can see your records. Dr. Sarah Mitchell has availability on September 3rd at 10:00 AM. Would that work?"},{"role":"caller","text":"Yes, that works great."},{"role":"ai","text":"Done! Your check-up with Dr. Mitchell is confirmed for September 3rd at 10:00 AM. You will receive a confirmation shortly. Anything else?"},{"role":"caller","text":"No, that is all. Thank you!"},{"role":"ai","text":"You are welcome, Emma. See you then!"}]',
  'positive', 'resolved', 0, aiAppt2.lastInsertRowid);

try { db.exec(`UPDATE appointments SET call_log_id = ${cl2.lastInsertRowid} WHERE id = ${aiAppt2.lastInsertRowid}`); } catch(e) {}

// Clinical Emergency escalation
const cl3 = insertCallLog.run(practiceId, patientIds[3], 'Michael Chen', 'M-I-C-H-A-E-L  C-H-E-N', '555-0104', 'm.chen@example.com', 'inbound_ai', 0, 95, 'clinical_emergency',
  'URGENT: Patient Michael Chen reports severe swelling and pain on lower right jaw since yesterday. Possible abscess. AI escalated to Dr. Mitchell for immediate callback. Patient advised to go to ER if symptoms worsen.',
  '[{"role":"ai","text":"Thank you for calling DentalFlow Downtown. This is Neerja. How can I help you?"},{"role":"caller","text":"I have really bad swelling and pain in my jaw. It started yesterday and it is getting worse."},{"role":"ai","text":"I am sorry to hear that, and I want to make sure you get help right away. Can I have your name please?"},{"role":"caller","text":"Michael Chen."},{"role":"ai","text":"Thank you, Michael. Can you describe the pain? Where exactly is the swelling?"},{"role":"caller","text":"Lower right side. It is really swollen and I can barely open my mouth."},{"role":"ai","text":"Michael, this sounds like it could be urgent. I am flagging this for Dr. Mitchell to call you back as soon as possible. In the meantime, if the swelling gets worse or you develop a fever, please go to your nearest emergency room. Can I confirm your phone number?"},{"role":"caller","text":"Yes, 555-0104."},{"role":"ai","text":"Thank you. Dr. Mitchell or a team member will call you back very shortly. Please do not hesitate to go to the ER if needed."}]',
  'urgent', 'escalated', 0, null);

insertAlert.run(practiceId, 'clinical_emergency', 'critical', 'Clinical Emergency – Michael Chen', 'URGENT: Patient reports severe jaw swelling and pain (possible abscess). Requires immediate callback. AI has advised patient to visit ER if symptoms worsen.', 'active');
try { db.exec(`UPDATE alerts SET call_log_id = ${cl3.lastInsertRowid}, escalation_type = 'clinical_emergency' WHERE id = (SELECT MAX(id) FROM alerts)`); } catch(e) {}

// Patient Complaint escalation
const cl4 = insertCallLog.run(practiceId, patientIds[6], 'Ava Patel', 'A-V-A  P-A-T-E-L', '555-0107', 'ava.patel@example.com', 'inbound_ai', 0, 142, 'patient_complaint',
  'Patient Ava Patel called regarding a billing dispute. She was charged $120 for a hygiene visit but believes the amount should be $80 based on her insurance coverage. Patient is frustrated. AI escalated to practice manager for resolution.',
  '[{"role":"ai","text":"Thank you for calling DentalFlow Downtown. This is Neerja. How can I help you?"},{"role":"caller","text":"I need to speak to someone about my bill. I was overcharged."},{"role":"ai","text":"I am sorry to hear about that. I want to make sure we get this resolved for you. Can I have your name?"},{"role":"caller","text":"Ava Patel."},{"role":"ai","text":"Thank you, Ava. Can you tell me more about the billing concern?"},{"role":"caller","text":"I was charged $120 for my hygiene visit last week, but my insurance should cover most of it. I should only owe $80."},{"role":"ai","text":"I understand your frustration, Ava. Billing questions require our practice manager to review your insurance details. I am going to flag this as a priority so someone can look into it and call you back today. Can I confirm your contact number?"},{"role":"caller","text":"555-0107. I expect a call back today."},{"role":"ai","text":"Absolutely. I have flagged this as high priority. You will hear from our team today. Is there anything else?"},{"role":"caller","text":"No, just please sort this out."},{"role":"ai","text":"We will, Ava. Thank you for your patience."}]',
  'negative', 'escalated', 0, null);

insertAlert.run(practiceId, 'patient_complaint', 'high', 'Patient Complaint – Ava Patel', 'Billing dispute: Patient was charged $120 for hygiene visit but believes insurance covers to $80. Patient is frustrated and expects callback today. Escalated to practice manager.', 'active');
try { db.exec(`UPDATE alerts SET call_log_id = ${cl4.lastInsertRowid}, escalation_type = 'patient_complaint' WHERE id = (SELECT MAX(id) FROM alerts)`); } catch(e) {}

// Won-back missed call
const cl5 = insertCallLog.run(practiceId, patientIds[7], 'Noah Kim', 'N-O-A-H  K-I-M', '555-0108', 'noah.kim@example.com', 'missed_callback', 1, 98, 'pricing_inquiry',
  'Callback to missed after-hours call from Noah Kim. Patient inquired about teeth whitening options and pricing. AI provided pricing info ($350-$500 for in-office, $250 for take-home kit). Patient will consider and call back to book.',
  '[{"role":"ai","text":"Hello Noah, this is Neerja from DentalFlow Downtown returning your call. Thank you for your patience! How can I help you?"},{"role":"caller","text":"Oh hi! I called earlier about teeth whitening."},{"role":"ai","text":"Great question! We offer two whitening options. In-office professional whitening runs between $350 to $500 depending on the treatment, and we also have take-home whitening kits starting at $250. Would you like to book a whitening consultation?"},{"role":"caller","text":"How long does the in-office one take?"},{"role":"ai","text":"The in-office treatment typically takes about 60 to 90 minutes in a single visit. Results are immediate. The take-home kit takes about 2 weeks of daily use."},{"role":"caller","text":"Interesting. Let me think about it and I will call back to book."},{"role":"ai","text":"Of course! Feel free to call us anytime. We would love to help you get a brighter smile. Have a great day, Noah!"}]',
  'positive', 'resolved', 1, null);

// General inquiry
const cl6 = insertCallLog.run(practiceId, null, 'Unknown Caller', null, null, null, 'inbound_ai', 1, 45, 'general_inquiry',
  'After-hours call from unidentified caller asking about practice hours and location. AI provided standard business hours and address. Caller did not leave contact information.',
  '[{"role":"ai","text":"Thank you for calling DentalFlow Downtown. This is Neerja. How can I help you?"},{"role":"caller","text":"What are your opening hours?"},{"role":"ai","text":"We are open Monday through Friday from 8:00 AM to 6:00 PM, and Saturdays from 9:00 AM to 1:00 PM. We are located at 120 Main Street, Downtown."},{"role":"caller","text":"OK, thanks."},{"role":"ai","text":"You are welcome! Would you like to book an appointment?"},{"role":"caller","text":"No, I will just come in. Bye."},{"role":"ai","text":"Sounds great! We look forward to seeing you. Goodbye!"}]',
  'neutral', 'resolved', 0, null);

console.log('Seed complete. Practice ID:', practiceId);
