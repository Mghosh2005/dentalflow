/**
 * Fix and populate authentic clinical radiographs for sample patients
 * Replaces test dummy 67-byte buffers with authentic clinical radiographs
 * and calibrates AI detection bounding boxes to exact anatomical coordinates.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const Database = require(path.join(rootDir, 'backend', 'node_modules', 'better-sqlite3'));
const db = new Database(path.join(rootDir, 'backend', 'dentalflow.db'));

const uploadsDir = path.join(rootDir, 'backend', 'uploads', 'imaging');
const bitewingSrc = path.join(rootDir, 'frontend', 'src', 'assets', 'sample_radiographs', 'bitewing_sample.jpg');
const periapicalSrc = path.join(rootDir, 'frontend', 'src', 'assets', 'sample_radiographs', 'periapical_sample.jpg');
const dicomSrc = path.join(rootDir, 'backend', 'uploads', 'imaging', 'sample_bitewing.dcm');

if (!fs.existsSync(bitewingSrc) || !fs.existsSync(periapicalSrc)) {
  console.error('Source radiographs missing!');
  process.exit(1);
}

const bitewingBuf = fs.readFileSync(bitewingSrc);
const periapicalBuf = fs.readFileSync(periapicalSrc);
const bitewingHash = crypto.createHash('sha256').update(bitewingBuf).digest('hex');
const periapicalHash = crypto.createHash('sha256').update(periapicalBuf).digest('hex');

console.log('[1] Updating File #3 (Arthur Dent - Currently open in screenshot)...');
// File #3: replace dummy file with real bitewing
const file3Key = 'practice_1_pat_quarantine_beef95386328f7e1_1792643439266.png';
fs.writeFileSync(path.join(uploadsDir, file3Key), bitewingBuf);

db.prepare(`
  UPDATE imaging_files
  SET original_filename = 'arthur_dent_bitewing.jpg',
      file_format = 'jpeg',
      file_size_bytes = ?,
      sha256_hash = ?,
      pixel_width = 1200,
      pixel_height = 896
  WHERE id = 3
`).run(bitewingBuf.length, bitewingHash);

// Calibrate findings for Analysis #3 to align with bitewing anatomy
db.prepare(`
  UPDATE ai_findings
  SET bbox_x = 440, bbox_y = 530, bbox_width = 85, bbox_height = 80, tooth_number_fdi = '16'
  WHERE analysis_id = 3 AND condition_label = 'cavity'
`).run();
db.prepare(`
  UPDATE ai_findings
  SET bbox_x = 780, bbox_y = 620, bbox_width = 110, bbox_height = 95, tooth_number_fdi = '19'
  WHERE analysis_id = 3 AND condition_label = 'periapical_lesion'
`).run();

console.log('[2] Updating File #2 (Arthur Dent - Direct)...');
const file2Key = 'practice_1_pat_27_beef95386328f7e1_1792643439270.png';
fs.writeFileSync(path.join(uploadsDir, file2Key), bitewingBuf);

db.prepare(`
  UPDATE imaging_files
  SET original_filename = 'arthur_dent_bitewing_dx.jpg',
      file_format = 'jpeg',
      file_size_bytes = ?,
      sha256_hash = ?,
      pixel_width = 1200,
      pixel_height = 896
  WHERE id = 2
`).run(bitewingBuf.length, bitewingHash);

db.prepare(`
  UPDATE ai_findings
  SET bbox_x = 440, bbox_y = 530, bbox_width = 85, bbox_height = 80, tooth_number_fdi = '16'
  WHERE analysis_id = 2 AND condition_label = 'cavity'
`).run();
db.prepare(`
  UPDATE ai_findings
  SET bbox_x = 780, bbox_y = 620, bbox_width = 110, bbox_height = 95, tooth_number_fdi = '19'
  WHERE analysis_id = 2 AND condition_label = 'periapical_lesion'
`).run();

console.log('[3] Updating File #1 (Eleanor Vance - Periapical)...');
const file1Key = 'practice_1_pat_1_beef95386328f7e1_1792642961197.png';
fs.writeFileSync(path.join(uploadsDir, file1Key), periapicalBuf);

db.prepare(`
  UPDATE imaging_files
  SET original_filename = 'eleanor_vance_periapical.jpg',
      file_format = 'jpeg',
      file_size_bytes = ?,
      sha256_hash = ?,
      pixel_width = 896,
      pixel_height = 1200
  WHERE id = 1
`).run(periapicalBuf.length, periapicalHash);

db.prepare(`
  UPDATE ai_findings
  SET bbox_x = 545, bbox_y = 760, bbox_width = 165, bbox_height = 160, tooth_number_fdi = '19'
  WHERE analysis_id = 1 AND condition_label = 'periapical_lesion'
`).run();
db.prepare(`
  UPDATE ai_findings
  SET bbox_x = 435, bbox_y = 210, bbox_width = 120, bbox_height = 90, tooth_number_fdi = '18'
  WHERE analysis_id = 1 AND condition_label = 'cavity'
`).run();

console.log('[4] Ensuring DICOM sample study is populated...');
if (fs.existsSync(dicomSrc)) {
  const dicomBuf = fs.readFileSync(dicomSrc);
  const dicomHash = crypto.createHash('sha256').update(dicomBuf).digest('hex');
  const dicomKey = `practice_1_pat_1_${dicomHash.slice(0, 16)}_dicom.dcm`;
  fs.writeFileSync(path.join(uploadsDir, dicomKey), dicomBuf);

  // Store DICOM preview
  const previewKey = `preview_${dicomKey}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, previewKey), bitewingBuf);

  // Check if study already exists
  const existingDicom = db.prepare(`SELECT id FROM imaging_files WHERE file_format = 'dicom'`).get();
  if (!existingDicom) {
    const studyRes = db.prepare(`
      INSERT INTO imaging_studies (uuid, practice_id, patient_id, modality, study_description, study_date)
      VALUES (?, 1, 1, 'IO', 'Bitewing DICOM Study', date('now'))
    `).run(crypto.randomUUID());

    const fileRes = db.prepare(`
      INSERT INTO imaging_files (uuid, study_id, practice_id, patient_id, file_storage_key, original_filename, file_format, file_size_bytes, sha256_hash, pixel_width, pixel_height, dicom_metadata_json)
      VALUES (?, ?, 1, 1, ?, 'mandibular_molar_dicom.dcm', 'dicom', ?, ?, 1200, 896, ?)
    `).run(crypto.randomUUID(), studyRes.lastInsertRowid, dicomKey, dicomBuf.length, dicomHash, JSON.stringify({
      modality: 'IO',
      study_date: '20261025',
      rows: 896,
      columns: 1200,
      photometric_interpretation: 'MONOCHROME2'
    }));

    const analysisRes = db.prepare(`
      INSERT INTO ai_analyses (uuid, imaging_file_id, practice_id, patient_id, model_identifier, model_version, status)
      VALUES (?, ?, 1, 1, 'adr/6', '6.0.0', 'completed')
    `).run(crypto.randomUUID(), fileRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO ai_findings (analysis_id, condition_label, confidence_score, bbox_x, bbox_y, bbox_width, bbox_height, tooth_number_fdi, initial_status)
      VALUES (?, 'cavity', 0.94, 440, 530, 85, 80, '16', 'potential')
    `).run(analysisRes.lastInsertRowid);
  }
}

db.close();
console.log('Authentic clinical radiographs seeded and calibrated successfully!');
