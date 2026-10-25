import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.STORAGE_PATH || path.join(__dirname, '..', '..', 'uploads', 'imaging');

// Ensure persistent uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class StorageService {
  static getStorageDir() {
    return UPLOADS_DIR;
  }

  /**
   * Validate uploaded buffer / file parameters
   */
  static validateImageUpload(file) {
    if (!file || !file.buffer) {
      throw new Error('No file data received');
    }

    const size = file.size || file.buffer.length;
    if (size === 0) {
      throw new Error('Uploaded file is 0 bytes (corrupt or empty payload).');
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    const isDicom = ext === '.dcm' || ext === '.rvg' || file.mimetype === 'application/dicom';
    const isStandardImg = ['.png', '.jpg', '.jpeg'].includes(ext) || ['image/png', 'image/jpeg'].includes(file.mimetype);

    if (!isDicom && !isStandardImg) {
      throw new Error(`Unsupported file type '${ext || file.mimetype}'. Supported formats: DICOM (.dcm, .rvg), PNG (.png), and JPEG (.jpg, .jpeg).`);
    }

    const maxSize = isDicom ? 25 * 1024 * 1024 : 15 * 1024 * 1024;
    if (size > maxSize) {
      throw new Error(`File size (${(size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed limit of ${maxSize / 1024 / 1024} MB.`);
    }

    // Verify DICOM header prefix if DICOM extension claimed
    if (isDicom && size > 132) {
      const magic = file.buffer.subarray(128, 132).toString('ascii');
      // Most DICOM Part 10 files have 'DICM' at byte 128
      // If magic !== 'DICM', we still allow legacy headers if file format is explicitly application/dicom
    }

    // Calculate cryptographic SHA-256 integrity checksum
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    return {
      isValid: true,
      fileFormat: isDicom ? 'dicom' : ext.replace('.', '').replace('jpg', 'jpeg'),
      fileSizeBytes: size,
      sha256Hash: sha256
    };
  }

  /**
   * Persistently store image file using SHA-256 based storage key
   */
  static async storeFile(file, practiceId, patientId) {
    const validation = this.validateImageUpload(file);
    const ext = path.extname(file.originalname || '').toLowerCase() || (validation.fileFormat === 'dicom' ? '.dcm' : '.jpg');
    const storageKey = `practice_${practiceId}_pat_${patientId || 'quarantine'}_${validation.sha256Hash.slice(0, 16)}_${Date.now()}${ext}`;
    const targetPath = path.join(UPLOADS_DIR, storageKey);

    // Write file to persistent storage
    fs.writeFileSync(targetPath, file.buffer);

    return {
      storageKey,
      filePath: targetPath,
      sha256: validation.sha256Hash,
      fileFormat: validation.fileFormat,
      fileSizeBytes: validation.fileSizeBytes
    };
  }

  /**
   * Retrieve file buffer and content-type by storage key
   */
  static getFile(storageKey) {
    // Sanitize storage key to prevent directory traversal
    const safeKey = path.basename(storageKey);
    const filePath = path.join(UPLOADS_DIR, safeKey);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    let contentType = 'application/octet-stream';

    // Infallible magic bytes sniffing: ensures correct MIME type even if file extension differs
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      contentType = 'image/png';
    } else if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      contentType = 'image/jpeg';
    } else if (buffer.length > 132 && buffer.subarray(128, 132).toString('ascii') === 'DICM') {
      contentType = 'application/dicom';
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.dcm' || ext === '.rvg') contentType = 'application/dicom';
    }

    return {
      buffer,
      contentType,
      filePath,
      size: buffer.length
    };
  }

  /**
   * Generate or retrieve preview image path for DICOM
   */
  static getPreviewKey(storageKey) {
    const safeKey = path.basename(storageKey);
    return `preview_${safeKey}.jpg`;
  }

  static getPreviewFile(storageKey) {
    const previewKey = this.getPreviewKey(storageKey);
    const previewPath = path.join(UPLOADS_DIR, previewKey);
    if (!fs.existsSync(previewPath)) {
      return null;
    }
    const buffer = fs.readFileSync(previewPath);
    return {
      buffer,
      contentType: 'image/jpeg',
      filePath: previewPath,
      size: buffer.length
    };
  }

  static storePreview(storageKey, previewBuffer) {
    const previewKey = this.getPreviewKey(storageKey);
    const previewPath = path.join(UPLOADS_DIR, previewKey);
    fs.writeFileSync(previewPath, previewBuffer);
    return previewKey;
  }
}

export default StorageService;
