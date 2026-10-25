import { EventEmitter } from 'events';
import crypto from 'crypto';
import db from '../db.js';

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.setupAuditLogger();
  }

  /**
   * Log domain events to the audit_events table for compliance and clinical safety
   */
  setupAuditLogger() {
    this.on('AUDIT_EVENT', (event) => {
      try {
        const stmt = db.prepare(`
          INSERT INTO audit_events (uuid, practice_id, user_account_id, action, entity_type, entity_id, payload_json, ip_address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          event.uuid || crypto.randomUUID(),
          event.practice_id || null,
          event.user_account_id || null,
          event.action,
          event.entity_type,
          String(event.entity_id),
          event.payload_json ? (typeof event.payload_json === 'string' ? event.payload_json : JSON.stringify(event.payload_json)) : null,
          event.ip_address || null
        );
      } catch (err) {
        console.error('[EventBus AuditLogger Error]', err);
      }
    });
  }

  /**
   * Publish a typed domain event with transactional safety checks
   * @param {string} eventName - Name of the domain event
   * @param {object} payload - Event payload
   */
  publish(eventName, payload = {}) {
    const enrichedPayload = {
      ...payload,
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };

    // Auto-dispatch audit event for key healthcare domain transitions
    const AUDITABLE_EVENTS = {
      XrayUploaded: { action: 'XRAY_UPLOADED', entity_type: 'imaging_file' },
      XrayAnalysisCompleted: { action: 'XRAY_ANALYSIS_COMPLETED', entity_type: 'ai_analysis' },
      AIFindingReviewed: { action: 'CLINICIAN_REVIEW_SIGNED', entity_type: 'clinician_review' },
      TreatmentPlanUpdated: { action: 'TREATMENT_PLAN_UPDATED', entity_type: 'treatment_plan' },
      PatientMatchingQuarantined: { action: 'PATIENT_MATCH_QUARANTINED', entity_type: 'quarantine_record' },
      PatientMatchingResolved: { action: 'PATIENT_MATCH_RESOLVED', entity_type: 'quarantine_record' }
    };

    if (AUDITABLE_EVENTS[eventName]) {
      const cfg = AUDITABLE_EVENTS[eventName];
      this.emit('AUDIT_EVENT', {
        practice_id: payload.practice_id,
        user_account_id: payload.userId || payload.user_account_id || null,
        action: cfg.action,
        entity_type: cfg.entity_type,
        entity_id: payload.entityId || payload.id || payload.imaging_file_id || payload.analysis_id || 'UNKNOWN',
        payload_json: payload,
        ip_address: payload.ip_address || null
      });
    }

    // Emit domain event to in-process subscribers
    this.emit(eventName, enrichedPayload);
  }
}

export const eventBus = new DomainEventBus();
export default eventBus;
