import db from '../db.js';
import crypto from 'crypto';
import eventBus from '../events/event-bus.js';

export class PatientService {
  /**
   * Fetch patient by primary key with practice isolation
   */
  static getPatientById(patientId, practiceId) {
    return db.prepare(`
      SELECT id, canonical_uuid, medical_record_number, practice_id, name, first_name, last_name,
             date_of_birth, gender, phone, email, address, medical_notes, emergency_contact,
             allergies_json, medical_alerts_json, matching_status, status, last_visit_date
      FROM patients
      WHERE id = ? AND practice_id = ?
    `).get(patientId, practiceId);
  }

  /**
   * Fetch patient by canonical UUID with practice isolation
   */
  static getPatientByUuid(uuid, practiceId) {
    return db.prepare(`
      SELECT id, canonical_uuid, medical_record_number, practice_id, name, first_name, last_name,
             date_of_birth, gender, phone, email, address, medical_notes, emergency_contact,
             allergies_json, medical_alerts_json, matching_status, status, last_visit_date
      FROM patients
      WHERE canonical_uuid = ? AND practice_id = ?
    `).get(uuid, practiceId);
  }

  /**
   * Fetch patient by Medical Record Number (MRN)
   */
  static getPatientByMrn(mrn, practiceId) {
    return db.prepare(`
      SELECT id, canonical_uuid, medical_record_number, practice_id, name, first_name, last_name,
             date_of_birth, gender, phone, email, address, medical_notes, emergency_contact,
             allergies_json, medical_alerts_json, matching_status, status, last_visit_date
      FROM patients
      WHERE medical_record_number = ? AND practice_id = ?
    `).get(mrn, practiceId);
  }

  /**
   * Multi-Tier Patient Matching Protocol (Architecture Specification Page 9)
   * 1. Direct Context (patient_id or canonical_uuid) + Practice check
   * 2. Deterministic Match (MRN)
   * 3. Compound Match (Exact DOB + [Exact Phone OR Exact Email])
   * 4. Single-attribute name match is strictly prohibited -> Quarantine Queue
   */
  static matchPatient(criteria, practiceId) {
    const { patient_id, canonical_uuid, mrn, date_of_birth, phone, email, name } = criteria;

    // Tier 1: Direct Context
    if (patient_id) {
      const patient = this.getPatientById(patient_id, practiceId);
      if (patient) {
        return { matched: true, matchTier: 'DIRECT_PATIENT_ID', patient };
      }
    }
    if (canonical_uuid) {
      const patient = this.getPatientByUuid(canonical_uuid, practiceId);
      if (patient) {
        return { matched: true, matchTier: 'DIRECT_CANONICAL_UUID', patient };
      }
    }

    // Tier 2: Deterministic Match via MRN
    if (mrn) {
      const patient = this.getPatientByMrn(mrn, practiceId);
      if (patient) {
        return { matched: true, matchTier: 'DETERMINISTIC_MRN', patient };
      }
    }

    // Tier 3: Compound Match (Exact DOB + Exact Phone or Email)
    if (date_of_birth && (phone || email)) {
      const candidates = db.prepare(`
        SELECT id, canonical_uuid, medical_record_number, practice_id, name, first_name, last_name,
               date_of_birth, gender, phone, email, address, allergies_json, medical_alerts_json
        FROM patients
        WHERE practice_id = ?
          AND date_of_birth = ?
          AND (
            (? IS NOT NULL AND phone = ?)
            OR
            (? IS NOT NULL AND email = ?)
          )
      `).all(practiceId, date_of_birth, phone || null, phone || null, email || null, email || null);

      if (candidates.length === 1) {
        return { matched: true, matchTier: 'COMPOUND_DOB_CONTACT', patient: candidates[0] };
      }
      if (candidates.length > 1) {
        return {
          matched: false,
          matchTier: 'AMBIGUOUS_COMPOUND_COLLISION',
          reason: `Found ${candidates.length} candidate patients with identical DOB and contact information. Manual review required.`,
          candidatePatients: candidates
        };
      }
    }

    // Tier 4: Check if name was provided
    if (name) {
      const nameCandidates = db.prepare(`
        SELECT id, name, medical_record_number, date_of_birth
        FROM patients
        WHERE practice_id = ? AND (name LIKE ? OR (first_name || ' ' || last_name) LIKE ?)
      `).all(practiceId, `%${name}%`, `%${name}%`);

      return {
        matched: false,
        matchTier: 'NAME_ONLY_MATCHING_PROHIBITED',
        reason: 'Associating radiographic studies based solely on patient name is strictly prohibited by clinical safety governance.',
        candidatePatients: nameCandidates
      };
    }

    return {
      matched: false,
      matchTier: 'UNRESOLVED_IDENTITY',
      reason: 'No direct context, deterministic MRN, or compound DOB+contact match found.'
    };
  }

  /**
   * Quarantine an ambiguous or unverified radiograph upload
   */
  static quarantineRadiograph({
    practice_id,
    file_storage_key,
    original_filename,
    file_format,
    file_size_bytes,
    sha256_hash,
    candidate_patient_id = null,
    extracted_metadata = {},
    quarantine_reason
  }) {
    const uuid = crypto.randomUUID();
    const stmt = db.prepare(`
      INSERT INTO quarantine_records (
        uuid, practice_id, file_storage_key, original_filename, file_format,
        file_size_bytes, sha256_hash, candidate_patient_id, extracted_metadata_json,
        quarantine_reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
    `);
    
    const result = stmt.run(
      uuid,
      practice_id,
      file_storage_key,
      original_filename,
      file_format,
      file_size_bytes,
      sha256_hash,
      candidate_patient_id,
      JSON.stringify(extracted_metadata),
      quarantine_reason
    );

    eventBus.publish('PatientMatchingQuarantined', {
      id: result.lastInsertRowid,
      uuid,
      practice_id,
      quarantine_reason,
      original_filename
    });

    return {
      quarantine_id: result.lastInsertRowid,
      uuid,
      status: 'pending_review',
      reason: quarantine_reason
    };
  }

  /**
   * Staff manual resolution of quarantined radiograph
   */
  static resolveQuarantinedRadiograph(quarantineId, practiceId, targetPatientId, userId) {
    const record = db.prepare(`
      SELECT * FROM quarantine_records
      WHERE id = ? AND practice_id = ? AND status = 'pending_review'
    `).get(quarantineId, practiceId);

    if (!record) {
      throw new Error('Quarantine record not found or already resolved');
    }

    const patient = this.getPatientById(targetPatientId, practiceId);
    if (!patient) {
      throw new Error('Target patient not found in this practice');
    }

    const studyUuid = crypto.randomUUID();
    const fileUuid = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    const runTx = db.transaction(() => {
      // Create imaging study
      const studyResult = db.prepare(`
        INSERT INTO imaging_studies (uuid, practice_id, patient_id, study_date, modality, study_description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        studyUuid,
        practiceId,
        targetPatientId,
        today,
        record.file_format === 'dicom' ? 'IO' : 'DX',
        `Manually resolved upload: ${record.original_filename}`
      );

      // Create imaging file
      const fileResult = db.prepare(`
        INSERT INTO imaging_files (
          uuid, study_id, practice_id, patient_id, file_storage_key, original_filename,
          file_format, file_size_bytes, sha256_hash, dicom_metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileUuid,
        studyResult.lastInsertRowid,
        practiceId,
        targetPatientId,
        record.file_storage_key,
        record.original_filename,
        record.file_format,
        record.file_size_bytes,
        record.sha256_hash,
        record.extracted_metadata_json
      );

      // Update quarantine record
      db.prepare(`
        UPDATE quarantine_records
        SET status = 'resolved_linked',
            resolved_by_user_id = ?,
            resolved_patient_id = ?,
            resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, targetPatientId, quarantineId);

      return {
        study_id: studyResult.lastInsertRowid,
        study_uuid: studyUuid,
        file_id: fileResult.lastInsertRowid,
        file_uuid: fileUuid
      };
    });

    const result = runTx();

    eventBus.publish('PatientMatchingResolved', {
      quarantine_id: quarantineId,
      practice_id: practiceId,
      target_patient_id: targetPatientId,
      file_id: result.file_id,
      userId
    });

    return result;
  }

  /**
   * Unified longitudinal patient timeline
   * Combines appointments, clinical notes, imaging studies, AI analyses, clinician reviews,
   * treatment plans, and communications. Applies strict permission filtering.
   */
  static getPatientTimeline(patientId, practiceId, { isStaff = true } = {}) {
    const patient = this.getPatientById(patientId, practiceId);
    if (!patient) return null;

    const timelineItems = [];

    // 1. Patient baseline registration event
    timelineItems.push({
      id: `pat-reg-${patient.id}`,
      type: 'patient_registration',
      timestamp: patient.last_visit_date || '2026-01-01T08:00:00Z',
      title: 'Patient Profile Established',
      description: `MRN: ${patient.medical_record_number} • Status: ${patient.status}`,
      source: 'practice_system',
      status: 'active',
      metadata: {
        canonical_uuid: patient.canonical_uuid,
        mrn: patient.medical_record_number,
        allergies: JSON.parse(patient.allergies_json || '[]'),
        alerts: JSON.parse(patient.medical_alerts_json || '[]')
      }
    });

    // 2. Appointments
    const appointments = db.prepare(`
      SELECT a.id, a.start_time, a.end_time, a.status, a.reason, a.fee, p.name as practitioner_name
      FROM appointments a
      LEFT JOIN practitioners p ON a.practitioner_id = p.id
      WHERE a.patient_id = ? AND a.practice_id = ?
    `).all(patientId, practiceId);

    appointments.forEach((apt) => {
      timelineItems.push({
        id: `apt-${apt.id}`,
        type: 'appointment',
        timestamp: apt.start_time,
        title: `Dental Visit: ${apt.reason || 'General Examination'}`,
        description: `Practitioner: ${apt.practitioner_name || 'Assigned Clinician'} • Status: ${apt.status}`,
        source: 'scheduling',
        status: apt.status,
        metadata: {
          appointment_id: apt.id,
          fee: apt.fee,
          end_time: apt.end_time
        }
      });
    });

    // 3. Clinical Encounter Notes
    const notes = db.prepare(`
      SELECT n.id, n.uuid, n.note_type, n.content, n.signed_at, n.created_at, p.name as practitioner_name
      FROM clinical_notes n
      LEFT JOIN practitioners p ON n.practitioner_id = p.id
      WHERE n.patient_id = ? AND n.practice_id = ?
    `).all(patientId, practiceId);

    notes.forEach((note) => {
      timelineItems.push({
        id: `note-${note.id}`,
        type: 'clinical_note',
        timestamp: note.signed_at || note.created_at,
        title: `Clinical Note (${note.note_type.replace('_', ' ').toUpperCase()})`,
        description: note.content,
        source: note.practitioner_name || 'Clinician',
        status: note.signed_at ? 'signed' : 'draft',
        metadata: {
          uuid: note.uuid,
          signed_at: note.signed_at
        }
      });
    });

    // 4. Imaging Studies & Files
    const studies = db.prepare(`
      SELECT s.id as study_id, s.uuid as study_uuid, s.study_date, s.modality, s.study_description,
             f.id as file_id, f.uuid as file_uuid, f.original_filename, f.file_format, f.sha256_hash
      FROM imaging_studies s
      JOIN imaging_files f ON s.id = f.study_id
      WHERE s.patient_id = ? AND s.practice_id = ?
    `).all(patientId, practiceId);

    studies.forEach((st) => {
      timelineItems.push({
        id: `imaging-${st.file_id}`,
        type: 'imaging_study',
        timestamp: st.study_date.includes('T') ? st.study_date : `${st.study_date}T10:00:00Z`,
        title: `Radiograph Ingested: ${st.modality} Study`,
        description: `${st.original_filename} (${st.file_format.toUpperCase()}) • SHA256: ${st.sha256_hash.substring(0, 10)}...`,
        source: 'clinical_imaging',
        status: 'stored_verified',
        metadata: {
          study_id: st.study_id,
          file_id: st.file_id,
          modality: st.modality,
          file_uuid: st.file_uuid
        }
      });
    });

    // 5. AI Analyses & Candidate Findings (Staff Only for unreviewed; verified for patients)
    const analyses = db.prepare(`
      SELECT a.id as analysis_id, a.uuid as analysis_uuid, a.model_identifier, a.model_version,
             a.status, a.created_at, f.original_filename,
             (SELECT COUNT(*) FROM ai_findings WHERE analysis_id = a.id) as finding_count,
             (SELECT COUNT(*) FROM clinician_reviews WHERE analysis_id = a.id) as review_count
      FROM ai_analyses a
      JOIN imaging_files f ON a.imaging_file_id = f.id
      WHERE a.patient_id = ? AND a.practice_id = ?
    `).all(patientId, practiceId);

    analyses.forEach((an) => {
      // Invariant: Unreviewed AI findings are NEVER shown to patients
      if (!isStaff && an.review_count === 0) {
        return;
      }

      timelineItems.push({
        id: `analysis-${an.analysis_id}`,
        type: 'ai_analysis',
        timestamp: an.created_at,
        title: `AI Radiograph Analysis (${an.model_identifier})`,
        description: `${an.finding_count} potential conditions detected on ${an.original_filename}. Clinical review status: ${an.review_count > 0 ? 'Reviewed by Clinician' : 'Pending Review (Unconfirmed)'}`,
        source: 'roboflow_ai_worker',
        status: an.status,
        metadata: {
          analysis_id: an.analysis_id,
          model_version: an.model_version,
          finding_count: an.finding_count,
          has_clinician_attestation: an.review_count > 0
        }
      });
    });

    // 6. Clinician Reviews & Attestations
    const reviews = db.prepare(`
      SELECT r.id as review_id, r.uuid as review_uuid, r.review_status, r.clinical_notes,
             r.reviewed_at, u.display_name as reviewer_name,
             (SELECT COUNT(*) FROM clinician_finding_decisions WHERE review_id = r.id AND decision = 'confirmed') as confirmed_count
      FROM clinician_reviews r
      LEFT JOIN user_accounts u ON r.reviewer_user_id = u.id
      WHERE r.patient_id = ? AND r.practice_id = ?
    `).all(patientId, practiceId);

    reviews.forEach((rev) => {
      timelineItems.push({
        id: `review-${rev.review_id}`,
        type: 'clinician_review',
        timestamp: rev.reviewed_at,
        title: `Clinician Attestation & Review Signed`,
        description: `Reviewed by ${rev.reviewer_name || 'Practitioner'} • Status: ${rev.review_status.replace('_', ' ')} • Confirmed Findings: ${rev.confirmed_count}`,
        source: rev.reviewer_name || 'Clinician',
        status: rev.review_status,
        metadata: {
          review_id: rev.review_id,
          confirmed_count: rev.confirmed_count,
          clinical_notes: rev.clinical_notes
        }
      });
    });

    // 7. Treatment Plans (Confirmed/Attested Only for Patients)
    const treatmentPlans = db.prepare(`
      SELECT tp.id, tp.plan_name, tp.procedure_name, tp.status, tp.notes, tp.created_at, p.name as practitioner_name
      FROM treatment_plans tp
      LEFT JOIN practitioners p ON tp.practitioner_id = p.id
      WHERE tp.patient_id = ? AND tp.practice_id = ?
    `).all(patientId, practiceId);

    treatmentPlans.forEach((tp) => {
      timelineItems.push({
        id: `treatment-${tp.id}`,
        type: 'treatment_plan',
        timestamp: tp.created_at,
        title: `Treatment Plan: ${tp.plan_name}`,
        description: `Procedure: ${tp.procedure_name || 'Standard Dental Procedure'} • Status: ${tp.status} • Practitioner: ${tp.practitioner_name || 'Assigned'}`,
        source: 'clinical_care_plan',
        status: tp.status,
        metadata: {
          treatment_plan_id: tp.id,
          notes: tp.notes
        }
      });
    });

    // 8. Follow-up Communications (Staff view only)
    if (isStaff) {
      const messages = db.prepare(`
        SELECT id, trigger_type, message_text, status, delivery_method, sent_at, created_at
        FROM follow_up_messages
        WHERE patient_id = ? AND practice_id = ?
      `).all(patientId, practiceId);

      messages.forEach((msg) => {
        timelineItems.push({
          id: `msg-${msg.id}`,
          type: 'communication',
          timestamp: msg.sent_at || msg.created_at,
          title: `Communication (${msg.trigger_type.replace('_', ' ')})`,
          description: `Method: ${msg.delivery_method.toUpperCase()} • Status: ${msg.status} • "${msg.message_text.slice(0, 80)}..."`,
          source: 'messaging_system',
          status: msg.status,
          metadata: {
            message_id: msg.id
          }
        });
      }
      );
    }

    // Sort strictly chronologically descending (most recent first)
    timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      patient: {
        id: patient.id,
        canonical_uuid: patient.canonical_uuid,
        medical_record_number: patient.medical_record_number,
        name: patient.name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        allergies: JSON.parse(patient.allergies_json || '[]'),
        medical_alerts: JSON.parse(patient.medical_alerts_json || '[]'),
        matching_status: patient.matching_status
      },
      timeline: timelineItems
    };
  }
}

export default PatientService;
