import express from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { authMiddleware, staffOnly } from '../middleware/auth.js';
import PatientService from '../services/patient-service.js';
import eventBus from '../events/event-bus.js';

const router = express.Router();
const DEFAULT_PRACTICE_ID = 1;

/**
 * 1. GET /api/v1/patients/:id/timeline
 * Master unified longitudinal patient timeline
 * Aggregates appointments, clinical notes, radiographs, AI analyses, clinician reviews,
 * treatment plans, and communications.
 * Enforces strict role isolation: patients cannot see unreviewed AI machine predictions.
 */
router.get('/:id/timeline', authMiddleware, (req, res) => {
  try {
    const patientId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const isStaff = req.user.role === 'staff';

    // Verify patient access boundary
    if (!isStaff) {
      if (req.user.patient_id !== patientId) {
        return res.status(403).json({ error: 'Forbidden: Access to another patient\'s timeline is strictly prohibited.' });
      }
    }

    const data = PatientService.getPatientTimeline(patientId, practiceId, { isStaff });
    if (!data) {
      return res.status(404).json({ error: 'Patient not found in this practice.' });
    }

    res.json(data);
  } catch (err) {
    console.error('[Patient Timeline Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /api/v1/patients/:id/imaging-studies
 * Retrieve all radiographic studies and physical files for a patient
 */
router.get('/:id/imaging-studies', authMiddleware, (req, res) => {
  try {
    const patientId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const isStaff = req.user.role === 'staff';

    if (!isStaff && req.user.patient_id !== patientId) {
      return res.status(403).json({ error: 'Forbidden: Cannot view another patient\'s imaging studies.' });
    }

    const studies = db.prepare(`
      SELECT s.id as study_id, s.uuid as study_uuid, s.study_date, s.modality, s.study_description,
             f.id as file_id, f.uuid as file_uuid, f.original_filename, f.file_format, f.file_size_bytes,
             f.sha256_hash, f.pixel_width, f.pixel_height, f.created_at as file_created_at,
             a.id as analysis_id, a.uuid as analysis_uuid, a.status as analysis_status,
             (SELECT COUNT(*) FROM ai_findings WHERE analysis_id = a.id) as potential_finding_count,
             r.id as review_id, r.review_status, r.reviewed_at,
             u.display_name as reviewer_name
      FROM imaging_studies s
      JOIN imaging_files f ON s.id = f.study_id
      LEFT JOIN ai_analyses a ON a.imaging_file_id = f.id
      LEFT JOIN clinician_reviews r ON r.analysis_id = a.id
      LEFT JOIN user_accounts u ON r.reviewer_user_id = u.id
      WHERE s.patient_id = ? AND s.practice_id = ?
      ORDER BY s.study_date DESC, f.id DESC
    `).all(patientId, practiceId);

    // Filter out unreviewed machine output for patients
    const filteredStudies = studies.map(s => {
      if (!isStaff && !s.review_id) {
        // Obfuscate unreviewed analysis for patient view
        return {
          ...s,
          analysis_id: null,
          analysis_uuid: null,
          analysis_status: 'pending_clinician_evaluation',
          potential_finding_count: 0
        };
      }
      return s;
    });

    res.json(filteredStudies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. POST /api/v1/patients/:id/clinical-notes
 * Record clinician-entered encounter note
 */
router.post('/:id/clinical-notes', authMiddleware, staffOnly, (req, res) => {
  try {
    const patientId = parseInt(req.params.id, 10);
    const practiceId = req.user.practice_id || DEFAULT_PRACTICE_ID;
    const { note_type = 'general_encounter', content, practitioner_id = null, appointment_id = null } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Clinical note content is required.' });
    }

    const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND practice_id = ?').get(patientId, practiceId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const noteUuid = crypto.randomUUID();
    const signedAt = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO clinical_notes (
        uuid, practice_id, patient_id, practitioner_id, appointment_id,
        note_type, content, signed_by_practitioner_id, signed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      noteUuid,
      practiceId,
      patientId,
      practitioner_id,
      appointment_id,
      note_type,
      content.trim(),
      practitioner_id,
      signedAt
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      uuid: noteUuid,
      note_type,
      signed_at: signedAt,
      message: 'Clinical note recorded and signed.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
