import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import StorageService from './services/storage-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function seedDefaultRadiographs(db) {
  try {
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM imaging_files').get().c;
    if (existingCount > 0) {
      console.log(`[SeedRadiographs] Database already contains ${existingCount} radiographs. Skipping.`);
      return false;
    }

    console.log('[SeedRadiographs] No radiographs found. Bootstrapping clinical PACS sample studies...');

    const practice = db.prepare('SELECT id FROM practices LIMIT 1').get();
    if (!practice) {
      console.warn('[SeedRadiographs] No practice record exists. Aborting radiograph seed.');
      return false;
    }
    const practiceId = practice.id;

    // Get staff reviewer user
    const reviewer = db.prepare('SELECT id FROM user_accounts WHERE role = ? LIMIT 1').get('staff');
    const reviewerId = reviewer ? reviewer.id : 1;

    // Retrieve or find patients
    let patArthur = db.prepare('SELECT id FROM patients WHERE name LIKE ? LIMIT 1').get('%Arthur Dent%');
    let patChris = db.prepare('SELECT id FROM patients WHERE name LIKE ? LIMIT 1').get('%Christopher White%');

    if (!patArthur) {
      const anyPat = db.prepare('SELECT id FROM patients LIMIT 1').get();
      patArthur = anyPat || { id: 1 };
    }
    if (!patChris) {
      patChris = patArthur;
    }

    const storageDir = StorageService.getStorageDir();
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const assetsDir = path.join(__dirname, 'assets', 'sample_radiographs');

    const sampleDefinitions = [
      {
        fileName: 'bitewing_sample.png',
        originalName: 'arthur_dent_bitewing_dx.png',
        modality: 'DX',
        studyDesc: 'Bilateral Diagnostic Bitewings',
        format: 'png',
        patientId: patArthur.id,
        studyDate: '2026-10-25',
        pixelWidth: 1200,
        pixelHeight: 896,
        findings: [
          {
            condition: 'cavity',
            conf: 0.94,
            bbox_x: 440,
            bbox_y: 530,
            bbox_w: 85,
            bbox_h: 80,
            tooth: '16',
            decision: 'confirmed',
            treatment: 'Direct Composite Restoration Tooth #16'
          },
          {
            condition: 'periapical_lesion',
            conf: 0.92,
            bbox_x: 780,
            bbox_y: 620,
            bbox_w: 110,
            bbox_h: 95,
            tooth: '19',
            decision: 'adjusted',
            treatment: 'Endodontic Therapy Tooth #19'
          }
        ]
      },
      {
        fileName: 'periapical_sample.png',
        originalName: 'eleanor_vance_periapical.png',
        modality: 'IO',
        studyDesc: 'Periapical Radiograph Molar Region',
        format: 'png',
        patientId: patChris.id,
        studyDate: '2026-10-22',
        pixelWidth: 896,
        pixelHeight: 1200,
        findings: [
          {
            condition: 'cavity',
            conf: 0.95,
            bbox_x: 435,
            bbox_y: 210,
            bbox_w: 120,
            bbox_h: 90,
            tooth: '18',
            decision: 'confirmed',
            treatment: 'Composite Resin Occlusal Tooth #18'
          },
          {
            condition: 'periapical_lesion',
            conf: 0.91,
            bbox_x: 545,
            bbox_y: 760,
            bbox_w: 165,
            bbox_h: 160,
            tooth: '19',
            decision: 'confirmed',
            treatment: 'Endodontic Evaluation Tooth #19'
          }
        ]
      },
      {
        fileName: 'sample_bitewing.dcm',
        previewName: 'bitewing_sample.jpg',
        originalName: 'mandibular_molar_dicom.dcm',
        modality: 'IO',
        studyDesc: 'Digital Secondary Capture DICOM',
        format: 'dicom',
        patientId: patChris.id,
        studyDate: '2026-10-25',
        pixelWidth: 1200,
        pixelHeight: 896,
        findings: [
          {
            condition: 'cavity',
            conf: 0.94,
            bbox_x: 440,
            bbox_y: 530,
            bbox_w: 85,
            bbox_h: 80,
            tooth: '16',
            decision: 'confirmed',
            treatment: 'Direct Composite Restoration Tooth #16'
          }
        ]
      }
    ];

    const insertStudy = db.prepare(`
      INSERT INTO imaging_studies (
        uuid, practice_id, patient_id, modality, study_date, study_description
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertFile = db.prepare(`
      INSERT INTO imaging_files (
        uuid, study_id, practice_id, patient_id, file_storage_key,
        original_filename, file_format, file_size_bytes, sha256_hash,
        pixel_width, pixel_height, dicom_metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAnalysis = db.prepare(`
      INSERT INTO ai_analyses (
        uuid, imaging_file_id, practice_id, patient_id, model_identifier,
        model_version, status, raw_inference_json
      ) VALUES (?, ?, ?, ?, 'adr/6', '6.0.0', 'completed', ?)
    `);

    const insertFinding = db.prepare(`
      INSERT INTO ai_findings (
        analysis_id, condition_label, confidence_score, bbox_x, bbox_y,
        bbox_width, bbox_height, tooth_number_fdi, initial_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'potential')
    `);

    const insertReview = db.prepare(`
      INSERT INTO clinician_reviews (
        analysis_id, practice_id, reviewer_user_id, review_status,
        clinical_notes, reviewed_at
      ) VALUES (?, ?, ?, 'accepted_with_edits', ?, CURRENT_TIMESTAMP)
    `);

    const insertDecision = db.prepare(`
      INSERT INTO clinician_finding_decisions (
        review_id, finding_id, decision, confirmed_condition, treatment_recommended
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const runSeedTx = db.transaction(() => {
      for (const def of sampleDefinitions) {
        const srcPath = path.join(assetsDir, def.fileName);
        if (!fs.existsSync(srcPath)) {
          console.warn(`[SeedRadiographs] Source asset ${srcPath} not found. Skipping.`);
          continue;
        }

        const buf = fs.readFileSync(srcPath);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        const storageKey = `practice_${practiceId}_pat_${def.patientId}_${hash.slice(0, 16)}_${def.fileName}`;
        const targetPath = path.join(storageDir, storageKey);

        fs.writeFileSync(targetPath, buf);

        // For DICOM, copy preview JPEG
        if (def.format === 'dicom' && def.previewName) {
          const previewSrc = path.join(assetsDir, def.previewName);
          if (fs.existsSync(previewSrc)) {
            const previewBuf = fs.readFileSync(previewSrc);
            const previewKey = `preview_${storageKey}.jpg`;
            fs.writeFileSync(path.join(storageDir, previewKey), previewBuf);
          }
        }

        const studyUuid = crypto.randomUUID();
        const studyResult = insertStudy.run(
          studyUuid,
          practiceId,
          def.patientId,
          def.modality,
          def.studyDate,
          def.studyDesc
        );
        const studyId = studyResult.lastInsertRowid;

        const fileUuid = crypto.randomUUID();
        const fileResult = insertFile.run(
          fileUuid,
          studyId,
          practiceId,
          def.patientId,
          storageKey,
          def.originalName,
          def.format,
          buf.length,
          hash,
          def.pixelWidth,
          def.pixelHeight,
          JSON.stringify({ modality: def.modality, study_date: def.studyDate })
        );
        const fileId = fileResult.lastInsertRowid;

        const analysisUuid = crypto.randomUUID();
        const analysisResult = insertAnalysis.run(
          analysisUuid,
          fileId,
          practiceId,
          def.patientId,
          JSON.stringify({ model: 'Roboflow adr/6', findings_count: def.findings.length })
        );
        const analysisId = analysisResult.lastInsertRowid;

        const reviewResult = insertReview.run(
          analysisId,
          practiceId,
          reviewerId,
          'Clinician review completed. Confirmed diagnostic caries & apical periodontitis.'
        );
        const reviewId = reviewResult.lastInsertRowid;

        for (const finding of def.findings) {
          const findingResult = insertFinding.run(
            analysisId,
            finding.condition,
            finding.conf,
            finding.bbox_x,
            finding.bbox_y,
            finding.bbox_w,
            finding.bbox_h,
            finding.tooth
          );
          const findingId = findingResult.lastInsertRowid;

          insertDecision.run(
            reviewId,
            findingId,
            finding.decision,
            finding.condition,
            finding.treatment
          );
        }
      }
    });

    runSeedTx();
    console.log('[SeedRadiographs] Successfully seeded default clinical radiographs and AI analyses.');
    return true;
  } catch (err) {
    console.error('[SeedRadiographs] Error bootstrapping radiographs:', err);
    return false;
  }
}
