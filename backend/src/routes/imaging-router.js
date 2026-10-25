import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import db from '../db.js';
import { authMiddleware, staffOnly } from '../middleware/auth.js';
import StorageService from '../services/storage-service.js';
import PatientService from '../services/patient-service.js';
import AiOrchestrator from '../services/ai-orchestrator.js';
import ClinicianReviewService from '../services/clinician-review-service.js';
import eventBus from '../events/event-bus.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB limit for high-res panoramic & 3D DICOMs
});

const DEFAULT_PRACTICE_ID = 1;

/**
 * 1. POST /api/v1/imaging/upload
 * Multipart file upload (DICOM / PNG / JPEG)
 * Enforces file validation, SHA-256 integrity, and multi-tier patient matching
 */
router.post('/upload', authMiddleware, staffOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No radiograph file uploaded.' });
    }

    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const {
      patient_id,
      canonical_uuid,
      mrn,
      date_of_birth,
      phone,
      email,
      name,
      modality = 'IO',
      study_date = new Date().toISOString().slice(0, 10),
      study_description = ''
    } = req.body;

    // Validate file integrity, mime type, and compute SHA-256
    let validation;
    try {
      validation = StorageService.validateImageUpload(req.file);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    // Run Multi-tier Patient Matching Protocol
    const matchResult = PatientService.matchPatient({
      patient_id: patient_id ? parseInt(patient_id, 10) : null,
      canonical_uuid,
      mrn,
      date_of_birth,
      phone,
      email,
      name
    }, practiceId);

    // Case A: Unambiguous Match -> Ingest directly into Patient Study
    if (matchResult.matched && matchResult.patient) {
      const patient = matchResult.patient;

      // Persist to encrypted/persistent storage
      const stored = await StorageService.storeFile(req.file, practiceId, patient.id);

      const studyUuid = crypto.randomUUID();
      const fileUuid = crypto.randomUUID();

      const runTx = db.transaction(() => {
        // Create imaging study
        const studyResult = db.prepare(`
          INSERT INTO imaging_studies (
            uuid, practice_id, patient_id, study_date, modality, study_description
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          studyUuid,
          practiceId,
          patient.id,
          study_date,
          modality.toUpperCase(),
          study_description || `Radiograph (${stored.fileFormat.toUpperCase()})`
        );

        const studyId = studyResult.lastInsertRowid;

        // Create imaging file record
        const fileResult = db.prepare(`
          INSERT INTO imaging_files (
            uuid, study_id, practice_id, patient_id, file_storage_key,
            original_filename, file_format, file_size_bytes, sha256_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fileUuid,
          studyId,
          practiceId,
          patient.id,
          stored.storageKey,
          req.file.originalname || 'radiograph',
          stored.fileFormat,
          stored.fileSizeBytes,
          stored.sha256
        );

        return {
          study_id: studyId,
          study_uuid: studyUuid,
          file_id: fileResult.lastInsertRowid,
          file_uuid: fileUuid
        };
      });

      const ids = runTx();

      // Emit domain event
      eventBus.publish('XrayUploaded', {
        file_id: ids.file_id,
        file_uuid: ids.file_uuid,
        study_id: ids.study_id,
        practice_id: practiceId,
        patient_id: patient.id,
        sha256: stored.sha256,
        userId: req.user.id
      });

      return res.status(201).json({
        status: 'ingested',
        message: 'Radiograph verified and attached to patient record.',
        matched_tier: matchResult.matchTier,
        patient: {
          id: patient.id,
          name: patient.name,
          mrn: patient.medical_record_number,
          canonical_uuid: patient.canonical_uuid
        },
        study: {
          id: ids.study_id,
          uuid: ids.study_uuid,
          modality,
          study_date
        },
        file: {
          id: ids.file_id,
          uuid: ids.file_uuid,
          original_filename: req.file.originalname,
          file_format: stored.fileFormat,
          file_size_bytes: stored.fileSizeBytes,
          sha256: stored.sha256
        }
      });
    }

    // Case B: Ambiguous / Name-only match -> Route to Quarantine Queue
    const storedQuarantine = await StorageService.storeFile(req.file, practiceId, null);
    const quarantineInfo = PatientService.quarantineRadiograph({
      practice_id: practiceId,
      file_storage_key: storedQuarantine.storageKey,
      original_filename: req.file.originalname,
      file_format: storedQuarantine.fileFormat,
      file_size_bytes: storedQuarantine.fileSizeBytes,
      sha256_hash: storedQuarantine.sha256,
      candidate_patient_id: null,
      extracted_metadata: { modality, study_date, submittedName: name },
      quarantine_reason: matchResult.reason || 'Identity verification required'
    });

    return res.status(202).json({
      status: 'quarantined',
      message: 'Upload placed in Quarantine Queue due to ambiguous patient identity. Manual clinician review required.',
      match_tier: matchResult.matchTier,
      quarantine_id: quarantineInfo.quarantine_id,
      quarantine_uuid: quarantineInfo.uuid,
      reason: matchResult.reason,
      candidate_patients: matchResult.candidatePatients || []
    });

  } catch (err) {
    console.error('[Imaging Upload Error]', err);
    res.status(500).json({ error: `Upload processing failed: ${err.message}` });
  }
});

/**
 * 2. POST /api/v1/imaging/files/:id/analyze
 * Asynchronously triggers private AI worker inference
 */
router.post('/files/:id/analyze', authMiddleware, staffOnly, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;

    const file = db.prepare('SELECT * FROM imaging_files WHERE id = ? AND practice_id = ?').get(fileId, practiceId);
    if (!file) {
      return res.status(404).json({ error: 'Imaging file not found.' });
    }

    const job = await AiOrchestrator.triggerAnalysis(fileId, practiceId, file.patient_id, req.user.id);
    return res.status(202).json(job);
  } catch (err) {
    console.error('[AI Analysis Dispatch Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. GET /api/v1/imaging/analyses/:id
 * Retrieve analysis status, model identifier, and potential findings
 */
router.get('/analyses/:id', authMiddleware, staffOnly, (req, res) => {
  try {
    const analysisId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;

    const analysis = db.prepare(`
      SELECT a.*, f.original_filename, f.file_format, f.sha256_hash, f.pixel_width, f.pixel_height,
             p.id as patient_id, p.name as patient_name, p.medical_record_number, p.canonical_uuid
      FROM ai_analyses a
      JOIN imaging_files f ON a.imaging_file_id = f.id
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ? AND a.practice_id = ?
    `).get(analysisId, practiceId);

    if (!analysis) {
      return res.status(404).json({ error: 'AI analysis not found.' });
    }

    const findings = db.prepare(`
      SELECT * FROM ai_findings WHERE analysis_id = ? ORDER BY confidence_score DESC
    `).all(analysisId);

    const review = db.prepare(`
      SELECT r.*, u.display_name as reviewer_name
      FROM clinician_reviews r
      LEFT JOIN user_accounts u ON r.reviewer_user_id = u.id
      WHERE r.analysis_id = ?
      ORDER BY r.id DESC LIMIT 1
    `).get(analysisId);

    let decisions = [];
    if (review) {
      decisions = db.prepare(`SELECT * FROM clinician_finding_decisions WHERE review_id = ?`).all(review.id);
    }

    res.json({
      analysis: {
        id: analysis.id,
        uuid: analysis.uuid,
        model_identifier: analysis.model_identifier,
        model_version: analysis.model_version,
        status: analysis.status,
        created_at: analysis.created_at,
        error_message: analysis.error_message
      },
      file: {
        id: analysis.imaging_file_id,
        original_filename: analysis.original_filename,
        file_format: analysis.file_format,
        sha256: analysis.sha256_hash,
        pixel_width: analysis.pixel_width,
        pixel_height: analysis.pixel_height
      },
      patient: {
        id: analysis.patient_id,
        name: analysis.patient_name,
        mrn: analysis.medical_record_number,
        canonical_uuid: analysis.canonical_uuid
      },
      findings,
      review: review ? {
        id: review.id,
        review_status: review.review_status,
        clinical_notes: review.clinical_notes,
        reviewed_at: review.reviewed_at,
        reviewer_name: review.reviewer_name,
        decisions
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. POST /api/v1/imaging/analyses/:id/review
 * Formal Clinician Attestation & Itemized Finding Decisions
 */
router.post('/analyses/:id/review', authMiddleware, staffOnly, (req, res) => {
  try {
    const analysisId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const { review_status, clinical_notes, decisions } = req.body;

    const result = ClinicianReviewService.submitReview(
      analysisId,
      practiceId,
      req.user.id,
      { review_status, clinical_notes, decisions }
    );

    res.json(result);
  } catch (err) {
    console.error('[Clinician Review Error]', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 5. POST /api/v1/imaging/analyses/:id/promote-treatment
 * Explicit promotion of clinician-confirmed findings into patient's treatment plan
 */
router.post('/analyses/:id/promote-treatment', authMiddleware, staffOnly, (req, res) => {
  try {
    const analysisId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const { plan_name, procedure_name, practitioner_id, notes, finding_ids } = req.body;

    const result = ClinicianReviewService.promoteToTreatmentPlan(
      analysisId,
      practiceId,
      req.user.id,
      { plan_name, procedure_name, practitioner_id, notes, finding_ids }
    );

    res.status(201).json(result);
  } catch (err) {
    console.error('[Treatment Promotion Error]', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 6. GET /api/v1/imaging/queue
 * Practice-wide unreviewed radiograph queue for Clinical Imaging Workspace
 */
router.get('/queue', authMiddleware, staffOnly, (req, res) => {
  try {
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const queue = ClinicianReviewService.getImagingQueue(practiceId);
    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. GET /api/v1/imaging/files/:id
 * Secure file stream retrieval with practice isolation and role authorization
 */
router.get('/files/:id', authMiddleware, (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;

    const file = db.prepare('SELECT * FROM imaging_files WHERE id = ? AND practice_id = ?').get(fileId, practiceId);
    if (!file) {
      return res.status(404).json({ error: 'Radiograph file not found.' });
    }

    // Role-based patient data isolation
    if (req.user.role === 'patient') {
      if (req.user.patient_id !== file.patient_id) {
        return res.status(403).json({ error: 'Forbidden: Access to another patient\'s radiograph is denied.' });
      }
    }

    const fileData = StorageService.getFile(file.file_storage_key);
    if (!fileData) {
      return res.status(404).json({ error: 'Physical radiograph file missing from persistent store.' });
    }

    // DICOM display support: If file is DICOM and browser requests display view (default),
    // serve preview JPEG with VOI LUT windowing applied. Raw DICOM is served when format=raw.
    const isDicom = file.file_format === 'dicom' || fileData.contentType === 'application/dicom';
    const wantsRaw = req.query.format === 'raw';

    if (isDicom && !wantsRaw) {
      const previewData = StorageService.getPreviewFile(file.file_storage_key);
      if (previewData) {
        const previewHash = crypto.createHash('sha256').update(previewData.buffer).digest('hex');
        res.set({
          'Content-Type': 'image/jpeg',
          'Content-Length': previewData.size,
          'ETag': `"${previewHash}"`,
          'Cache-Control': 'no-cache, private',
          'Content-Disposition': `inline; filename="${file.original_filename}.jpg"`
        });
        return res.send(previewData.buffer);
      }
    }

    const actualHash = crypto.createHash('sha256').update(fileData.buffer).digest('hex');
    if (file.sha256_hash !== actualHash) {
      db.prepare('UPDATE imaging_files SET sha256_hash = ?, file_size_bytes = ? WHERE id = ?').run(
        actualHash,
        fileData.size,
        file.id
      );
    }

    res.set({
      'Content-Type': fileData.contentType,
      'Content-Length': fileData.size,
      'ETag': `"${actualHash}"`,
      'Cache-Control': 'no-cache, private',
      'Content-Disposition': `inline; filename="${file.original_filename}"`
    });

    res.send(fileData.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. GET /api/v1/imaging/quarantine
 * Staff view of quarantined radiographs
 */
router.get('/quarantine', authMiddleware, staffOnly, (req, res) => {
  try {
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const records = db.prepare(`
      SELECT * FROM quarantine_records
      WHERE practice_id = ?
      ORDER BY id DESC
    `).all(practiceId);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 9. POST /api/v1/imaging/quarantine/:id/resolve
 * Manual staff matching of quarantined radiograph to patient
 */
router.post('/quarantine/:id/resolve', authMiddleware, staffOnly, (req, res) => {
  try {
    const quarantineId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const { target_patient_id } = req.body;

    if (!target_patient_id) {
      return res.status(400).json({ error: 'target_patient_id is required' });
    }

    const result = PatientService.resolveQuarantinedRadiograph(
      quarantineId,
      practiceId,
      parseInt(target_patient_id, 10),
      req.user.id
    );

    res.json({
      status: 'resolved',
      message: 'Quarantined radiograph successfully matched and linked to patient record.',
      ...result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
