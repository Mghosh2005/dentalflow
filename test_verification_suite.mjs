// test_verification_suite.mjs
// Automated verification suite for DentalFlow critical bug fixes
import http from 'http';

const BASE_URL = 'http://localhost:4000';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const fetchOpts = {
    method: options.method || 'GET',
    headers,
  };
  if (options.body) {
    fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOpts);
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== RUNNING DENTALFLOW CRITICAL VERIFICATION SUITE ===\n');

  // 1. AUTHENTICATION & AUTHORIZATION TESTS
  console.log('--- 1. Authentication & Authorization ---');
  
  // 1.1 Public staff registration must be disabled (403)
  const staffRegRes = await req('/api/auth/register', {
    method: 'POST',
    body: {
      username: `malicious_staff_${Date.now()}`,
      password: 'StrongPassword123!',
      role: 'staff'
    }
  });
  assert(staffRegRes.status === 403, `Public staff registration returns 403 Forbidden (got ${staffRegRes.status})`);

  // 1.2 Prevent public registration from linking an arbitrary patient ID (400)
  const arbitraryPatientReg = await req('/api/auth/register', {
    method: 'POST',
    body: {
      username: `patient_hacker_${Date.now()}`,
      password: 'StrongPassword123!',
      role: 'patient',
      patient_id: 1 // Attempting to link to existing patient 1
    }
  });
  assert(arbitraryPatientReg.status === 400, `Public registration with arbitrary patient_id returns 400 Bad Request (got ${arbitraryPatientReg.status})`);

  // 1.3 Public patient self-registration works and creates isolated patient record
  const patientUsername = `test_pat_${Date.now()}`;
  const validPatientReg = await req('/api/auth/register', {
    method: 'POST',
    body: {
      username: patientUsername,
      password: 'PatientPass123!',
      first_name: 'Alice',
      last_name: 'Wonderland',
      phone: '555-0199',
      email: `${patientUsername}@example.com`
    }
  });
  assert(validPatientReg.status === 201, `Public patient registration succeeds (got ${validPatientReg.status})`);
  assert(validPatientReg.data.token && validPatientReg.data.user.role === 'patient', 'Issued valid JWT with patient role');
  assert(validPatientReg.data.user.patient_id != null, `Created isolated patient ID: ${validPatientReg.data.user.patient_id}`);
  const patientToken = validPatientReg.data.token;
  const patient1Id = validPatientReg.data.user.patient_id;

  // 1.4 Login as staff admin (seeded or dev default)
  const staffLoginRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  assert(staffLoginRes.status === 200, `Staff login succeeds (got ${staffLoginRes.status})`);
  const staffToken = staffLoginRes.data.token;

  // 1.5 Authorized staff account creation (Staff only)
  const newStaffUsername = `authorized_staff_${Date.now()}`;
  const authStaffRes = await req('/api/auth/staff-accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: {
      username: newStaffUsername,
      password: 'StaffSecretPass123!',
      display_name: 'Dr. Sarah Connor',
      email: 'sarah@dentalflow.test'
    }
  });
  assert(authStaffRes.status === 201, `Authorized staff account creation succeeds (got ${authStaffRes.status})`);

  // Patient attempting to create staff account fails (403)
  const unauthStaffRes = await req('/api/auth/staff-accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: {
      username: `unauth_staff_${Date.now()}`,
      password: 'StaffSecretPass123!',
      display_name: 'Imposter'
    }
  });
  assert(unauthStaffRes.status === 403, `Patient cannot create staff account (got ${unauthStaffRes.status})`);

  // 1.6 Authorized verified patient account provisioning (Staff only)
  // Provision portal account for an existing patient without an account
  const newPatientAccRes = await req('/api/auth/patient-accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: {
      patient_id: 2, // Bob Green in default db
      username: `bob_portal_${Date.now()}`,
      password: 'BobSecurePassword123!',
      display_name: 'Bob Green'
    }
  });
  assert(newPatientAccRes.status === 201 || newPatientAccRes.status === 409, `Verified patient provisioning returned valid status (got ${newPatientAccRes.status})`);

  // 1.7 Login Rate Limiting (5 failed attempts -> 429)
  console.log('\n--- 2. Login Rate Limiting ---');
  const rateLimitUser = `bruteforce_target_${Date.now()}`;
  let rateLimited = false;
  for (let i = 1; i <= 6; i++) {
    const attempt = await req('/api/auth/login', {
      method: 'POST',
      body: { username: rateLimitUser, password: 'WrongPassword!' }
    });
    if (i <= 5) {
      assert(attempt.status === 401, `Failed attempt #${i} returns 401`);
    } else {
      assert(attempt.status === 429, `Attempt #${i} blocked with 429 Too Many Requests (got ${attempt.status})`);
      assert(attempt.headers.get('retry-after') != null, 'Retry-After header present');
      rateLimited = (attempt.status === 429);
    }
  }

  // 2. PATIENT DATA ISOLATION TESTS
  console.log('\n--- 3. Patient Data Isolation & Authorization ---');
  
  // 3.1 Patient cannot access staff endpoints
  const staffApptsAccess = await req('/api/appointments', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(staffApptsAccess.status === 403, `Patient blocked from staff /api/appointments (got ${staffApptsAccess.status})`);

  const staffAlertsAccess = await req('/api/alerts', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(staffAlertsAccess.status === 403, `Patient blocked from staff /api/alerts (got ${staffAlertsAccess.status})`);

  const staffFollowUpsAccess = await req('/api/follow-up-messages', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(staffFollowUpsAccess.status === 403, `Patient blocked from /api/follow-up-messages (got ${staffFollowUpsAccess.status})`);

  // 3.2 Patient dashboard returns only their own data
  const patientDash = await req('/api/patient/dashboard', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(patientDash.status === 200, `Patient dashboard accessible (got ${patientDash.status})`);
  assert(patientDash.data.patient.id === patient1Id, `Dashboard scoped to patient ID ${patient1Id}`);

  // 4. APPOINTMENT BOOKING & OVERLAP CONFLICTS
  console.log('\n--- 4. Appointment Booking & Overlap Conflicts ---');

  // 4.1 Pick dynamic future date (e.g. 20+ days out, Monday-Friday)
  const d = new Date();
  const offsetDays = 20 + Math.floor(Math.random() * 200);
  d.setDate(d.getDate() + offsetDays);
  // Ensure Monday-Friday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  const dateStr = d.toISOString().slice(0, 10);
  const startSlot = `${dateStr}T10:00:00`;

  // First booking by patient
  const book1 = await req('/api/patient/appointments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: {
      practitioner_id: 1,
      start_time: startSlot,
      appointment_type: 'checkup',
      fee: 1 // Tamper attempt! Client sends $1
    }
  });
  assert(book1.status === 201, `First booking created successfully (got ${book1.status})`);
  assert(book1.data.fee === 150, `Server enforced catalog fee ($150), client fee tampering rejected (got $${book1.data.fee})`);
  assert(book1.data.end_time != null, `Calculated effective end time: ${book1.data.end_time}`);

  // 4.2 Overlapping booking (IDENTICAL start time) must be rejected with 409
  const bookDuplicate = await req('/api/patient/appointments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: {
      practitioner_id: 1,
      start_time: startSlot,
      appointment_type: 'hygiene'
    }
  });
  assert(bookDuplicate.status === 409, `Identical start time rejected with 409 Conflict (got ${bookDuplicate.status})`);

  // 4.3 Overlapping booking (PARTIAL OVERLAP: starts at 10:15, while checkup runs 10:00 - 10:30)
  const partialOverlapSlot = `${dateStr}T10:15:00`;
  const bookOverlap = await req('/api/patient/appointments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: {
      practitioner_id: 1,
      start_time: partialOverlapSlot,
      appointment_type: 'hygiene'
    }
  });
  assert(bookOverlap.status === 409, `Overlapping interval [10:15, 10:45) rejected with 409 Conflict (got ${bookOverlap.status})`);

  // 4.4 Non-overlapping booking (Starts at 10:30 right after the first finishes)
  const adjacentSlot = `${dateStr}T10:30:00`;
  const bookAdjacent = await req('/api/patient/appointments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: {
      practitioner_id: 1,
      start_time: adjacentSlot,
      appointment_type: 'hygiene'
    }
  });
  assert(bookAdjacent.status === 201, `Non-overlapping adjacent slot booked successfully (got ${bookAdjacent.status})`);

  // 4.5 Booking in the past must be rejected
  const pastSlot = '2020-01-01T10:00:00';
  const bookPast = await req('/api/patient/appointments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: {
      practitioner_id: 1,
      start_time: pastSlot,
      appointment_type: 'hygiene'
    }
  });
  assert(bookPast.status === 400, `Past appointment rejected with 400 (got ${bookPast.status})`);

  // 5. FOLLOW-UP DELIVERY & REAL PROVIDER INTEGRATION
  console.log('\n--- 5. Follow-Up Delivery & Provider Verification ---');

  // 5.1 Patient cannot trigger approve and send
  const patientSendRes = await req('/api/follow-up-messages/1/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(patientSendRes.status === 403, `Patient cannot approve and send follow-ups (got ${patientSendRes.status})`);

  // 5.2 Fetch list of follow-up messages
  const followUpsList = await req('/api/follow-up-messages', {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(followUpsList.status === 200 && Array.isArray(followUpsList.data), 'Staff retrieved follow-up messages');
  
  // Find a pending message or create one
  let testMsg = followUpsList.data.find(m => m.status === 'pending_approval');
  if (!testMsg) {
    // Generate one by updating appointment status to missed
    testMsg = followUpsList.data[0];
  }

  if (testMsg) {
    // 5.3 Attempting to send without configured Twilio/SendGrid must return 503 and NEVER mark 'sent'
    const sendRes = await req(`/api/follow-up-messages/${testMsg.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert(sendRes.status === 503, `Unconfigured provider returned 503 Service Unavailable (got ${sendRes.status})`);

    // Verify database record status is 'failed', NOT 'sent'
    const updatedList = await req('/api/follow-up-messages', {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    const reloadedMsg = updatedList.data.find(m => m.id === testMsg.id);
    assert(reloadedMsg.status === 'failed', `Message marked as 'failed' in database (got '${reloadedMsg.status}')`);
    assert(reloadedMsg.delivery_result && reloadedMsg.delivery_result.includes('configured'), `Recorded delivery failure diagnostic: "${reloadedMsg.delivery_result}"`);

    // 5.4 Bypass protection: PATCHing status to 'sent' is rejected (400)
    const patchBypass = await req(`/api/follow-up-messages/${testMsg.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { status: 'sent' }
    });
    assert(patchBypass.status === 400, `Direct PATCHing of status to 'sent' is blocked with 400 (got ${patchBypass.status})`);
  }

  // 6. INBOX & AI CALL SUMMARY PRESERVATION
  console.log('\n--- 6. Inbox & AI Call Summary Preservation ---');
  const callLogs = await req('/api/call-logs', {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(callLogs.status === 200 && Array.isArray(callLogs.data), `Call logs fetched successfully (${callLogs.data.length} logs)`);

  if (callLogs.data.length > 0) {
    const firstCall = callLogs.data[0];
    const callDetail = await req(`/api/call-logs/${firstCall.id}`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert(callDetail.status === 200, `Call detail retrieved for call ${firstCall.id}`);
    assert(callDetail.data.ai_summary != null, 'AI Call summary preserved and populated');
  }

  // 7. DASHBOARD SUMMARY & ANALYTICS
  console.log('\n--- 7. Dashboard Summary & Analytics ---');
  const dashSummary = await req('/api/dashboard/summary', {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(dashSummary.status === 200, `Dashboard summary endpoint works (got ${dashSummary.status})`);
  assert(dashSummary.data.revenueProtected !== undefined, 'Dashboard metrics preserved');

  console.log(`\n======================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
