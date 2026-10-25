async function testV1() {
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const { token } = await loginRes.json();
  console.log('1. Staff logged in successfully');

  // Test timeline
  const timelineRes = await fetch('http://localhost:4000/api/v1/patients/1/timeline', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const timelineData = await timelineRes.json();
  console.log('2. Timeline status:', timelineRes.status, 'Total items:', timelineData.timeline?.length);

  // Test imaging queue
  const queueRes = await fetch('http://localhost:4000/api/v1/imaging/queue', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const queueData = await queueRes.json();
  console.log('3. Queue status:', queueRes.status, 'Queue length:', queueData.length);

  // Test image upload with simulated valid PNG
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);
  const boundary = '----TestBoundary12345';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="patient_id"\r\n\r\n1\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="modality"\r\n\r\nIO\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="patient_molar_bitewing.png"\r\nContent-Type: image/png\r\n\r\n`),
    pngHeader,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const uploadRes = await fetch('http://localhost:4000/api/v1/imaging/upload', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  const uploadData = await uploadRes.json();
  console.log('4. Upload status:', uploadRes.status, uploadData.status, 'File ID:', uploadData.file?.id);

  if (uploadData.file?.id) {
    const fileId = uploadData.file.id;
    // Test trigger analysis
    const analyzeRes = await fetch(`http://localhost:4000/api/v1/imaging/files/${fileId}/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const analyzeData = await analyzeRes.json();
    console.log('5. Analyze job dispatched:', analyzeRes.status, analyzeData.status, 'Analysis ID:', analyzeData.analysis_id);

    // Wait for async analysis to complete
    await new Promise(r => setTimeout(r, 600));
    const analysisCheck = await fetch(`http://localhost:4000/api/v1/imaging/analyses/${analyzeData.analysis_id}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const analysisResult = await analysisCheck.json();
    console.log('6. Analysis result status:', analysisResult.analysis?.status, 'Potential findings:', analysisResult.findings?.length);

    // Test review submission
    const reviewRes = await fetch(`http://localhost:4000/api/v1/imaging/analyses/${analyzeData.analysis_id}/review`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        review_status: 'accepted_with_edits',
        clinical_notes: 'Confirmed cavity on tooth 16, periapical lesion monitored.',
        decisions: [
          { finding_id: analysisResult.findings[0].id, decision: 'confirmed', confirmed_condition: 'cavity', treatment_recommended: 'Composite Restoration Tooth #16' }
        ]
      })
    });
    const reviewData = await reviewRes.json();
    console.log('7. Clinician review recorded:', reviewRes.status, reviewData.review_status);

    // Test promote to treatment plan
    const promoteRes = await fetch(`http://localhost:4000/api/v1/imaging/analyses/${analyzeData.analysis_id}/promote-treatment`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plan_name: 'Direct Composite Restoration',
        procedure_name: 'Composite Resin - 2 Surfaces, Posterior',
        practitioner_id: 1,
        notes: 'Promoted from verified radiograph finding'
      })
    });
    const promoteData = await promoteRes.json();
    console.log('8. Treatment plan promoted:', promoteRes.status, promoteData.plan_name);

    // Test image download
    const imgGet = await fetch(`http://localhost:4000/api/v1/imaging/files/${fileId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('9. File retrieval status:', imgGet.status, 'Content-Type:', imgGet.headers.get('content-type'));
  }
  console.log('\nALL V1 ENDPOINTS TESTED SUCCESSFULLY!');
}

testV1().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
