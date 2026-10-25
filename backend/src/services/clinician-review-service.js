import crypto from 'crypto';
import db from '../db.js';
import eventBus from '../events/event-bus.js';

export class ClinicianReviewService {
  /**
   * Submit formal clinician review and attestation for an AI analysis
   */
  static submitReview(analysisId, practiceId, reviewerUserId, { review_status, clinical_notes = '', decisions = [] }) {
    const analysis = db.prepare(`
      SELECT a.*, f.original_filename, f.sha256_hash, p.name as patient_name
      FROM ai_analyses a
      JOIN imaging_files f ON a.imaging_file_id = f.id
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ? AND a.practice_id = ?
    `).get(analysisId, practiceId);

    if (!analysis) {
      throw new Error(`AI analysis #${analysisId} not found or practice unauthorized.`);
    }

    if (analysis.status !== 'completed') {
      throw new Error(`Cannot review an analysis with status '${analysis.status}'. Processing must be complete.`);
    }

    const validStatuses = ['accepted_as_is', 'accepted_with_edits', 'rejected_false_positive'];
    if (!validStatuses.includes(review_status)) {
      throw new Error(`Invalid review status '${review_status}'. Must be one of: ${validStatuses.join(', ')}`);
    }

    const reviewUuid = crypto.randomUUID();
    const reviewedAt = new Date().toISOString();

    const runTx = db.transaction(() => {
      // 1. Create clinician_reviews entry
      const reviewResult = db.prepare(`
        INSERT INTO clinician_reviews (
          uuid, analysis_id, practice_id, patient_id, reviewer_user_id,
          review_status, clinical_notes, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reviewUuid,
        analysisId,
        practiceId,
        analysis.patient_id,
        reviewerUserId,
        review_status,
        clinical_notes,
        reviewedAt
      );

      const reviewId = reviewResult.lastInsertRowid;

      // 2. Record itemized finding decisions
      const insertDecision = db.prepare(`
        INSERT INTO clinician_finding_decisions (
          review_id, finding_id, decision, confirmed_condition, treatment_recommended
        ) VALUES (?, ?, ?, ?, ?)
      `);

      for (const d of decisions) {
        // Validate finding belongs to this analysis
        const finding = db.prepare(`SELECT * FROM ai_findings WHERE id = ? AND analysis_id = ?`).get(d.finding_id, analysisId);
        if (finding) {
          insertDecision.run(
            reviewId,
            d.finding_id,
            d.decision || 'confirmed', // confirmed, rejected, adjusted
            d.confirmed_condition || finding.condition_label,
            d.treatment_recommended || null
          );
        }
      }

      return reviewId;
    });

    const reviewId = runTx();

    // 3. Emit legally binding clinical attestation event
    eventBus.publish('AIFindingReviewed', {
      review_id: reviewId,
      review_uuid: reviewUuid,
      analysis_id: analysisId,
      practice_id: practiceId,
      patient_id: analysis.patient_id,
      reviewer_user_id: reviewerUserId,
      review_status,
      decision_count: decisions.length
    });

    return {
      review_id: reviewId,
      review_uuid: reviewUuid,
      review_status,
      reviewed_at: reviewedAt,
      message: 'Clinician review and clinical attestation recorded successfully.'
    };
  }

  /**
   * Explicitly promote confirmed findings into the patient's treatment plan
   * INVARIANT: Machine-generated findings CANNOT create a treatment plan without clinician attestation!
   */
  static promoteToTreatmentPlan(analysisId, practiceId, clinicianUserId, { plan_name, procedure_name, practitioner_id = null, notes = '', finding_ids = [] }) {
    // 1. Verify that an authorized clinician review exists for this analysis
    const review = db.prepare(`
      SELECT r.*, a.patient_id
      FROM clinician_reviews r
      JOIN ai_analyses a ON r.analysis_id = a.id
      WHERE r.analysis_id = ? AND r.practice_id = ?
      ORDER BY r.id DESC LIMIT 1
    `).get(analysisId, practiceId);

    if (!review) {
      throw new Error('Clinical Safety Barrier: This analysis has NOT been attested by a clinician. Treatment plans cannot be generated from unreviewed findings.');
    }

    if (review.review_status === 'rejected_false_positive') {
      throw new Error('Clinical Safety Barrier: The findings in this analysis were marked as false positives by the reviewing clinician.');
    }

    // 2. Verify that at least one finding was confirmed
    const confirmedDecisions = db.prepare(`
      SELECT * FROM clinician_finding_decisions
      WHERE review_id = ? AND decision IN ('confirmed', 'adjusted')
    `).all(review.id);

    if (confirmedDecisions.length === 0) {
      throw new Error('No confirmed or adjusted findings exist in this clinician review to promote to treatment.');
    }

    // 3. Create treatment plan entry
    const effectivePlanName = plan_name || `Care Plan: ${confirmedDecisions.map(d => d.confirmed_condition).join(', ')}`;
    const effectiveProcedure = procedure_name || (confirmedDecisions[0].treatment_recommended || 'Dental Restoration');

    const insertPlan = db.prepare(`
      INSERT INTO treatment_plans (
        practice_id, patient_id, plan_name, procedure_name, practitioner_id,
        status, notes, start_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'planned', ?, CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertPlan.run(
      practiceId,
      review.patient_id,
      effectivePlanName,
      effectiveProcedure,
      practitioner_id,
      notes || `Promoted from Clinician-Attested Radiograph Review #${review.id}.`
    );

    const treatmentPlanId = result.lastInsertRowid;

    // 4. Emit domain event
    eventBus.publish('TreatmentPlanUpdated', {
      treatment_plan_id: treatmentPlanId,
      practice_id: practiceId,
      patient_id: review.patient_id,
      procedure_name: effectiveProcedure,
      userId: clinicianUserId
    });

    return {
      treatment_plan_id: treatmentPlanId,
      plan_name: effectivePlanName,
      procedure_name: effectiveProcedure,
      status: 'planned',
      message: 'Confirmed findings promoted to treatment plan successfully.'
    };
  }

  /**
   * Practice-wide pending imaging review queue for staff
   */
  static getImagingQueue(practiceId) {
    return db.prepare(`
      SELECT f.id as file_id, f.uuid as file_uuid, f.original_filename, f.file_format,
             f.file_size_bytes, f.sha256_hash, f.created_at,
             s.id as study_id, s.study_date, s.modality,
             p.id as patient_id, p.canonical_uuid, p.medical_record_number, p.name as patient_name,
             a.id as analysis_id, a.uuid as analysis_uuid, a.status as analysis_status,
             (SELECT COUNT(*) FROM ai_findings WHERE analysis_id = a.id) as potential_findings_count,
             r.id as review_id, r.review_status, r.reviewed_at,
             u.display_name as reviewer_name
      FROM imaging_files f
      JOIN imaging_studies s ON f.study_id = s.id
      JOIN patients p ON f.patient_id = p.id
      LEFT JOIN ai_analyses a ON a.imaging_file_id = f.id
      LEFT JOIN clinician_reviews r ON r.id = (SELECT MAX(id) FROM clinician_reviews WHERE analysis_id = a.id)
      LEFT JOIN user_accounts u ON r.reviewer_user_id = u.id
      WHERE f.practice_id = ?
      ORDER BY f.id DESC
    `).all(practiceId);
  }
}

export default ClinicianReviewService;
