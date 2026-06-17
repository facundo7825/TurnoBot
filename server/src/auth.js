import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { q } from './database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'turnobot-dev-secret-cambiar-en-produccion';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

/** Middleware: requiere Authorization: Bearer <token>. Adjunta req.user y req.tenant. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await q.one('SELECT id, email, name, created_at FROM users WHERE id = ?', [payload.uid]);
    if (!user) return res.status(401).json({ error: 'Usuario inexistente' });
    const tenant = await q.one('SELECT * FROM tenants WHERE user_id = ?', [user.id]);
    req.user = user;
    req.tenant = tenant;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o vencido' });
  }
}
