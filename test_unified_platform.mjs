// test_unified_platform.mjs
// Comprehensive Architectural & Clinical Safety Verification Suite for DentalFlow Unified Mother Platform

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:4000';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...(options.headers || {}) };
  if (!headers['Content-Type'] && !(options.body instanceof Buffer) && typeof options.body !== 'string' && !options.isMultipart) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOpts = {
    method: options.method || 'GET',
    headers
  };

  if (options.body) {
    if (typeof options.body === 'string' || options.body instanceof Buffer) {
      fetchOpts.body = options.body;
    } else {
      fetchOpts.body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(url, fetchOpts);
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else if (contentType.includes('image/') || contentType.includes('application/octet-stream') || contentType.includes('application/dicom')) {
    const arrayBuf = await res.arrayBuffer();
    data = Buffer.from(arrayBuf);
  } else {
    data = await res.text().catch(() => '');
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

async function runUnifiedSuite() {
  console.log('\n================================================================');
  console.log('   DENTALFLOW UNIFIED MOTHER PLATFORM - MASTER VERIFICATION SUITE');
  console.log('================================================================\n');

  // --- 1. AUTH SETUP ---
  console.log('--- 1. Authentication & Role Provisioning ---');
  const staffLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  assert(staffLogin.status === 200 && staffLogin.data.token, 'Staff login succeeded with JWT issued');
  const staffToken = staffLogin.data.token;

  // Create isolated test patient account
  const patientUsername = `unified_pat_${Date.now()}`;
  const patientReg = await req('/api/auth/register', {
    method: 'POST',
    body: {
      username: patientUsername,
      password: 'PatientPass123!',
      first_name: 'Arthur',
      last_name: 'Dent',
      phone: '555-4242',
      email: `${patientUsername}@hitchhiker.test`
    }
  });
  assert(patientReg.status === 201, 'Patient self-registration succeeded');
  const patientToken = patientReg.data.token;
  const patientId = patientReg.data.user.patient_id;
  assert(patientId != null, `Patient assigned canonical ID: ${patientId}`);

  // --- 2. SHARED PATIENT INTELLIGENCE LAYER (PHASE 2) ---
  console.log('\n--- 2. Shared Patient Intelligence Layer & Schema Backfill ---');
  const patFetch = await req(`/api/patients/${patientId}`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(patFetch.status === 200, 'Retrieved extended patient record');
  const pat = patFetch.data;
  assert(pat.canonical_uuid != null && pat.canonical_uuid.length === 36, `Canonical UUID populated: ${pat.canonical_uuid}`);
  assert(pat.medical_record_number != null && pat.medical_record_number.startsWith('MRN-1-'), `Collision-safe MRN populated: ${pat.medical_record_number}`);
  assert(pat.matching_status === 'verified', `Patient matching status is '${pat.matching_status}'`);

  // Verify backfilled patients in DB
  const legacyPatient = await req('/api/patients/1', {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(legacyPatient.data.canonical_uuid != null, 'Legacy patient #1 has deterministic canonical_uuid backfilled');
  assert(legacyPatient.data.medical_record_number === 'MRN-1-000001', `Legacy patient #1 has MRN: ${legacyPatient.data.medical_record_number}`);
  assert(legacyPatient.data.allergies_json.includes('Penicillin'), 'Legacy medical notes backfilled to structured allergies_json');

  // --- 3. MULTI-TIER PATIENT MATCHING PROTOCOL (PHASE 8 / PAGE 9) ---
  console.log('\n--- 3. Multi-Tier Patient Matching & Name-Only Prohibition ---');

  // Helper to build multipart payload
  function createMultipartPayload(fields, fileBuffer, filename, contentType = 'image/png') {
    const boundary = '----DentalFlowTestBound' + Math.random().toString(36).substring(2);
    const parts = [];

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined && val !== null) {
        parts.push(
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`)
        );
      }
    }

    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`)
    );
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    return {
      body: Buffer.concat(parts),
      boundary,
      contentType: `multipart/form-data; boundary=${boundary}`
    };
  }

  // Authentic clinical bitewing PNG radiograph
  const samplePngPath = path.resolve('frontend/src/assets/sample_radiographs/bitewing_sample.png');
  const samplePng = fs.readFileSync(samplePngPath);

  // 3.1 Prohibited: Name-only matching must enter QUARANTINE
  const nameOnlyUpload = createMultipartPayload(
    { name: 'Arthur Dent', modality: 'IO' },
    samplePng,
    'unverified_name_only.png'
  );
  const nameOnlyRes = await req('/api/v1/imaging/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': nameOnlyUpload.contentType
    },
    body: nameOnlyUpload.body,
    isMultipart: true
  });
  assert(nameOnlyRes.status === 202, `Name-only upload routed to 202 Quarantine (got ${nameOnlyRes.status})`);
  assert(nameOnlyRes.data.status === 'quarantined', 'Upload explicitly marked as quarantined');
  assert(nameOnlyRes.data.match_tier === 'NAME_ONLY_MATCHING_PROHIBITED', `Enforced safety tier: ${nameOnlyRes.data.match_tier}`);
  assert(nameOnlyRes.data.quarantine_id != null, `Created quarantine record ID: ${nameOnlyRes.data.quarantine_id}`);
  const quarantineId = nameOnlyRes.data.quarantine_id;

  // 3.2 Tier 1: Direct patient context upload succeeds (201)
  const directUpload = createMultipartPayload(
    { patient_id: patientId, modality: 'IO', study_description: 'Annual Bitewing' },
    samplePng,
    'direct_bitewing.png'
  );
  const directRes = await req('/api/v1/imaging/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': directUpload.contentType
    },
    body: directUpload.body,
    isMultipart: true
  });
  assert(directRes.status === 201, `Direct patient context upload succeeded with 201 (got ${directRes.status})`);
  assert(directRes.data.matched_tier === 'DIRECT_PATIENT_ID', `Matched via: ${directRes.data.matched_tier}`);
  assert(directRes.data.file?.id != null, `Ingested file ID: ${directRes.data.file?.id}`);
  assert(directRes.data.file?.sha256 != null, `SHA-256 integrity checksum: ${directRes.data.file?.sha256.slice(0, 16)}...`);
  const uploadedFileId = directRes.data.file.id;

  // 3.3 Corrupt or empty file rejected (400)
  const corruptUpload = createMultipartPayload(
    { patient_id: patientId },
    Buffer.alloc(0),
    'corrupt.png'
  );
  const corruptRes = await req('/api/v1/imaging/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': corruptUpload.contentType
    },
    body: corruptUpload.body,
    isMultipart: true
  });
  assert(corruptRes.status === 400, `Empty/corrupt file rejected with 400 (got ${corruptRes.status})`);

  // --- 4. ASYNCHRONOUS DECOUPLED AI INFERENCE (PHASE 6) ---
  console.log('\n--- 4. Asynchronous Decoupled AI Worker Inference ---');
  const analyzeRes = await req(`/api/v1/imaging/files/${uploadedFileId}/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(analyzeRes.status === 202, `Analysis job dispatched asynchronously (got ${analyzeRes.status})`);
  assert(analyzeRes.data.status === 'queued', `Job status initialized to '${analyzeRes.data.status}'`);
  assert(analyzeRes.data.model_identifier === 'adr/6', `Model identifier tracked: ${analyzeRes.data.model_identifier}`);
  const analysisId = analyzeRes.data.analysis_id;

  // Wait for worker processing to finish
  let analysisPoll = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 400));
    const check = await req(`/api/v1/imaging/analyses/${analysisId}`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    if (check.status === 200 && check.data.analysis?.status === 'completed') {
      analysisPoll = check.data;
      break;
    }
  }

  assert(analysisPoll != null && analysisPoll.analysis.status === 'completed', 'Analysis completed with valid state transition');
  assert(analysisPoll.findings && analysisPoll.findings.length > 0, `Worker returned ${analysisPoll.findings.length} candidate findings`);
  
  const finding1 = analysisPoll.findings[0];
  assert(finding1.initial_status === 'potential', `Finding status invariant: '${finding1.initial_status}' (MUST BE potential)`);
  assert(['cavity', 'periapical_lesion'].includes(finding1.condition_label), `Supported detection class: '${finding1.condition_label}'`);
  assert(finding1.confidence_score >= 0.0 && finding1.confidence_score <= 1.0, `Valid confidence score: ${finding1.confidence_score}`);
  assert(finding1.bbox_width > 0 && finding1.bbox_height > 0, 'Bounding box dimensions populated');

  // --- 5. CLINICIAN REVIEW & TREATMENT PLAN PROMOTION BARRIER (PHASE 7) ---
  console.log('\n--- 5. Clinician Attestation & Treatment Promotion Safety Barrier ---');

  // 5.1 UNREVIEWED FINDING MUST NOT MODIFY TREATMENT PLANS
  const prematurePromote = await req(`/api/v1/imaging/analyses/${analysisId}/promote-treatment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: {
      plan_name: 'Premature Therapy',
      procedure_name: 'Illegal Procedure'
    }
  });
  assert(prematurePromote.status === 400, `Unreviewed analysis promotion blocked with 400 (got ${prematurePromote.status})`);
  assert(prematurePromote.data.error.includes('Safety Barrier'), `Safety barrier diagnostic: "${prematurePromote.data.error}"`);

  // 5.2 Patient cannot submit clinician review (403)
  const patientReviewAttempt = await req(`/api/v1/imaging/analyses/${analysisId}/review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: { review_status: 'accepted_as_is' }
  });
  assert(patientReviewAttempt.status === 403, `Patient prohibited from clinician review with 403 (got ${patientReviewAttempt.status})`);

  // 5.3 Licensed clinician records attestation
  const clinicianReview = await req(`/api/v1/imaging/analyses/${analysisId}/review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: {
      review_status: 'accepted_with_edits',
      clinical_notes: 'Confirmed disto-occlusal caries on tooth #16.',
      decisions: [
        {
          finding_id: finding1.id,
          decision: 'confirmed',
          confirmed_condition: finding1.condition_label,
          treatment_recommended: 'Direct Composite Resin Tooth #16'
        }
      ]
    }
  });
  assert(clinicianReview.status === 200, `Clinician attestation recorded (got ${clinicianReview.status})`);
  assert(clinicianReview.data.review_status === 'accepted_with_edits', 'Review status confirmed in database');

  // 5.4 Clinician explicitly promotes confirmed finding to treatment plan
  const validPromote = await req(`/api/v1/imaging/analyses/${analysisId}/promote-treatment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: {
      plan_name: 'Posterior Restorative Therapy',
      procedure_name: 'Composite Resin - 2 Surfaces (Tooth #16)',
      practitioner_id: 1,
      notes: 'Promoted from attested bitewing radiograph finding.'
    }
  });
  assert(validPromote.status === 201, `Confirmed finding promoted to treatment plan (got ${validPromote.status})`);
  assert(validPromote.data.treatment_plan_id != null, `Created treatment plan ID: ${validPromote.data.treatment_plan_id}`);

  // --- 6. LONGITUDINAL PATIENT TIMELINE & ISOLATION (PHASE 3) ---
  console.log('\n--- 6. Longitudinal Patient Timeline & Permission Filtering ---');

  // 6.1 Staff timeline access
  const staffTimeline = await req(`/api/v1/patients/${patientId}/timeline`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(staffTimeline.status === 200, 'Staff retrieved patient longitudinal timeline');
  assert(staffTimeline.data.timeline && staffTimeline.data.timeline.length > 0, `Timeline compiled ${staffTimeline.data.timeline.length} longitudinal records`);
  
  const timelineTypes = staffTimeline.data.timeline.map(t => t.type);
  assert(timelineTypes.includes('imaging_study'), 'Timeline includes imaging study ingestion');
  assert(timelineTypes.includes('ai_analysis'), 'Staff timeline includes AI condition analysis');
  assert(timelineTypes.includes('clinician_review'), 'Timeline includes clinician review attestation');
  assert(timelineTypes.includes('treatment_plan'), 'Timeline includes attested treatment plan');

  // 6.2 Patient timeline access (Own record)
  const patientTimeline = await req(`/api/v1/patients/${patientId}/timeline`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(patientTimeline.status === 200, 'Patient accessed own timeline');
  
  // 6.3 Patient data isolation (Patient cannot access another patient's timeline)
  const intruderTimeline = await req('/api/v1/patients/1/timeline', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(intruderTimeline.status === 403, `Patient blocked from other patient timeline with 403 (got ${intruderTimeline.status})`);

  // 6.4 Patient cannot download other patient's radiograph file
  const intruderFile = await req('/api/v1/imaging/files/1', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(intruderFile.status === 403, `Patient blocked from other patient radiograph with 403 (got ${intruderFile.status})`);

  // --- 7. QUARANTINE RESOLUTION QUEUE ---
  console.log('\n--- 7. Manual Quarantine Queue & Ambiguity Resolution ---');
  const quarantineList = await req('/api/v1/imaging/quarantine', {
    headers: { Authorization: `Bearer ${staffToken}` }
  });
  assert(quarantineList.status === 200 && Array.isArray(quarantineList.data), 'Staff retrieved quarantine queue');
  const targetRecord = quarantineList.data.find(q => q.id === quarantineId);
  assert(targetRecord != null && targetRecord.status === 'pending_review', 'Found pending quarantined radiograph');

  // Resolve quarantine by explicitly linking to patient
  const resolveRes = await req(`/api/v1/imaging/quarantine/${quarantineId}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: { target_patient_id: patientId }
  });
  assert(resolveRes.status === 200, `Quarantined file successfully resolved and linked (got ${resolveRes.status})`);
  assert(resolveRes.data.file_id != null, `Linked file assigned ID: ${resolveRes.data.file_id}`);

  // --- 8. PATIENT PORTAL PRESERVATION (3 SECTIONS ONLY) ---
  console.log('\n--- 8. Patient Portal Preservation (3 Sections Only) ---');
  const portalDash = await req('/api/patient/dashboard', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(portalDash.status === 200, 'My Portal dashboard works for patient');

  const portalAppts = await req('/api/patient/appointments', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(portalAppts.status === 200, 'My Appointments endpoint works for patient');

  const portalPlans = await req('/api/patient/treatment-plans', {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  assert(portalPlans.status === 200, 'My Treatment Plan endpoint works for patient');
  assert(portalPlans.data.length > 0, `Patient sees attested care plans (${portalPlans.data.length} plan)`);
  assert(portalPlans.data[0].plan_name === 'Posterior Restorative Therapy', 'Only clinician-attested treatment plans are visible to patient');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runUnifiedSuite().catch((err) => {
  console.error('Master Suite Execution Failed:', err);
  process.exit(1);
});
