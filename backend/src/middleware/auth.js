import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  const secretFilename = isProduction ? '.jwt_secret_prod' : '.jwt_secret_dev';
  const secretFile = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), secretFilename);
  try {
    if (fs.existsSync(secretFile)) {
      JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
    } else {
      JWT_SECRET = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFile, JWT_SECRET, 'utf8');
    }
  } catch {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
  }
}

export { JWT_SECRET };

export function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function staffOnly(req, res, next) {
  if (!req.user || req.user.role !== 'staff') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
}

export function patientOnly(req, res, next) {
  if (!req.user || req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Patient access required' });
  }
  next();
}
