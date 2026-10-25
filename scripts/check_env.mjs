/**
 * DentalFlow Unified - Environment & Health Diagnostic Tool
 * Inspects system runtimes, Python/Node packages, database tables,
 * storage directories, environment variables, and active service ports.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('='.repeat(70));
console.log('       DENTALFLOW UNIFIED — SYSTEM & ENVIRONMENT DIAGNOSTIC       ');
console.log('='.repeat(70));

// 1. Runtimes
console.log('\n[1] SYSTEM RUNTIMES');
try {
  const nodeVer = process.version;
  console.log(`  * Node.js:  ${nodeVer} (OK)`);
} catch (e) {
  console.log(`  * Node.js:  ERROR (${e.message})`);
}

try {
  const npmVer = execSync('npm -v', { encoding: 'utf8' }).trim();
  console.log(`  * npm:      v${npmVer} (OK)`);
} catch (e) {
  console.log(`  * npm:      ERROR (${e.message})`);
}

try {
  const pyVer = execSync('python --version', { encoding: 'utf8' }).trim();
  console.log(`  * Python:   ${pyVer} (OK)`);
} catch (e) {
  console.log(`  * Python:   Not found in PATH or error (${e.message})`);
}

// 2. Python Packages for AI Worker
console.log('\n[2] PYTHON AI PACKAGES');
const pyPackages = ['fastapi', 'uvicorn', 'pydicom', 'PIL', 'numpy', 'requests'];
for (const pkg of pyPackages) {
  try {
    execSync(`python -c "import ${pkg}; print('${pkg} ok')"`, { stdio: 'pipe' });
    console.log(`  * ${pkg.padEnd(10)}: Installed (OK)`);
  } catch {
    console.log(`  * ${pkg.padEnd(10)}: NOT INSTALLED (Run: pip install -r ai-worker/requirements.txt)`);
  }
}

// 3. Environment Variables
console.log('\n[3] ENVIRONMENT VARIABLES CONFIGURATION');
const envVars = [
  { name: 'NODE_ENV', defaultVal: 'development (dev fallback)', secret: false },
  { name: 'PORT', defaultVal: '4000', secret: false },
  { name: 'JWT_SECRET', defaultVal: 'Auto-generated 64-char persistent key', secret: true },
  { name: 'AI_WORKER_URL', defaultVal: 'http://127.0.0.1:8000', secret: false },
  { name: 'AI_WORKER_SECRET', defaultVal: 'dentalflow_internal_secret_dev_2026', secret: true },
  { name: 'ROBOFLOW_API_KEY', defaultVal: '(Empty - using deterministic resilient fallback)', secret: true },
  { name: 'STORAGE_ADAPTER', defaultVal: 'local (backend/uploads/imaging)', secret: false },
  { name: 'ELEVENLABS_API_KEY', defaultVal: '(Optional - for voice receptionist)', secret: true },
];

for (const v of envVars) {
  const val = process.env[v.name];
  if (val) {
    const displayVal = v.secret ? (val.substring(0, 4) + '****' + val.substring(val.length - 2)) : val;
    console.log(`  * ${v.name.padEnd(20)}: SET -> ${displayVal}`);
  } else {
    console.log(`  * ${v.name.padEnd(20)}: NOT SET -> Using default: ${v.defaultVal}`);
  }
}

// 4. Database Status
console.log('\n[4] DATABASE & MIGRATION STATUS');
const dbPath = path.join(rootDir, 'backend', 'dentalflow.db');
if (fs.existsSync(dbPath)) {
  const stats = fs.statSync(dbPath);
  console.log(`  * Database File:   ${dbPath}`);
  console.log(`  * File Size:       ${(stats.size / 1024).toFixed(1)} KB`);

  try {
    const Database = require(path.join(rootDir, 'backend', 'node_modules', 'better-sqlite3'));
    const db = new Database(dbPath, { readonly: true });
    
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map(r => r.name);
    console.log(`  * Total Tables:    ${tables.length}`);
    
    // Check key Unified platform tables
    const requiredTables = [
      'patients', 'appointments', 'treatment_plans',
      'imaging_studies', 'imaging_files', 'ai_analyses',
      'ai_findings', 'clinician_reviews', 'audit_events'
    ];
    
    const missing = requiredTables.filter(t => !tables.includes(t));
    if (missing.length === 0) {
      console.log(`  * Schema Integrity: ALL 9 Unified tables present (OK)`);
    } else {
      console.log(`  * Schema Warning:   Missing tables: ${missing.join(', ')}`);
    }

    const patientCount = db.prepare('SELECT COUNT(*) as c FROM patients').get().c;
    const canonicalCount = db.prepare('SELECT COUNT(*) as c FROM patients WHERE canonical_uuid IS NOT NULL').get().c;
    const mrnCount = db.prepare('SELECT COUNT(*) as c FROM patients WHERE medical_record_number IS NOT NULL').get().c;
    const studyCount = db.prepare('SELECT COUNT(*) as c FROM imaging_studies').get().c;
    const auditCount = db.prepare('SELECT COUNT(*) as c FROM audit_events').get().c;

    console.log(`  * Patients Count:  ${patientCount} (${canonicalCount} with canonical UUIDs, ${mrnCount} with MRNs)`);
    console.log(`  * Imaging Studies: ${studyCount} studies recorded`);
    console.log(`  * Audit Events:    ${auditCount} compliance records logged`);
    db.close();
  } catch (e) {
    console.log(`  * Database Query:  Could not query database (${e.message})`);
  }
} else {
  console.log(`  * Database File:   MISSING at ${dbPath}`);
}

// 5. Storage Directories
console.log('\n[5] PERSISTENT STORAGE');
const uploadDir = path.join(rootDir, 'backend', 'uploads', 'imaging');
if (fs.existsSync(uploadDir)) {
  console.log(`  * Radiograph Dir:  ${uploadDir} (EXISTS)`);
} else {
  console.log(`  * Radiograph Dir:  ${uploadDir} (Will be created automatically on upload)`);
}

// 6. Active Service Connectivity Checks
console.log('\n[6] SERVICE CONNECTIVITY CHECKS');

function checkHttp(name, host, port, pathUrl) {
  return new Promise((resolve) => {
    const req = http.request({
      host,
      port,
      path: pathUrl,
      method: 'GET',
      timeout: 1500
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ name, host, port, status: 'RUNNING', code: res.statusCode, body: data.trim() });
      });
    });

    req.on('error', () => {
      resolve({ name, host, port, status: 'STOPPED / NOT LISTENING' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ name, host, port, status: 'TIMEOUT' });
    });

    req.end();
  });
}

const checks = await Promise.all([
  checkHttp('Backend Express Gateway', '127.0.0.1', 4000, '/api/health'),
  checkHttp('Decoupled AI Worker', '127.0.0.1', 8000, '/health'),
  checkHttp('Frontend Web App', 'localhost', 5173, '/'),
]);

for (const res of checks) {
  if (res.status === 'RUNNING') {
    console.log(`  * ${res.name.padEnd(25)}: [ONLINE] HTTP ${res.code} on port ${res.port}`);
  } else {
    console.log(`  * ${res.name.padEnd(25)}: [${res.status}] (port ${res.port})`);
  }
}

console.log('\n' + '='.repeat(70) + '\n');
