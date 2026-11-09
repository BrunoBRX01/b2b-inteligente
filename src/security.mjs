import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const localPlainHttp = process.env.COOKIE_TRANSPORT === 'http-local';

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validCorporateEmail(value) {
  if (!validEmail(value)) return false;
  const domains = String(process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  if (!domains.length) return true;
  return domains.includes(value.slice(value.lastIndexOf('@') + 1).toLowerCase());
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, n, r, p, saltHex, keyHex] = String(storedHash ?? '').split('$');
  if (algorithm !== 'scrypt' || Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P || !/^[0-9a-f]{32}$/.test(saltHex ?? '') || !/^[0-9a-f]{128}$/.test(keyHex ?? '')) {
    return false;
  }
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY
  }));
  const expected = Buffer.from(keyHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieAttributes({ httpOnly = true, maxAge = 43200 } = {}) {
  const secure = !localPlainHttp;
  const parts = ['Path=/', `Max-Age=${maxAge}`, `SameSite=${secure ? 'None' : 'Lax'}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(res, token) {
  res.append('Set-Cookie', `b2b_session=${token}; ${cookieAttributes({ httpOnly: true, maxAge: 43200 })}`);
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `b2b_session=; ${cookieAttributes({ httpOnly: true, maxAge: 0 })}`);
}

export function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { return [key, decodeURIComponent(value)]; } catch { return [key, value]; }
  }).filter(([key]) => key));
}

export function createCsrfToken() {
  return randomBytes(32).toString('hex');
}

export function setCsrfCookie(res, token) {
  const secure = !localPlainHttp;
  const parts = ['Path=/', 'Max-Age=21600', `SameSite=${secure ? 'None' : 'Lax'}`];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', `b2b_csrf=${token}; ${parts.join('; ')}`);
}

export function validCsrf(req) {
  const cookies = parseCookies(req.headers.cookie);
  const cookie = cookies.b2b_csrf || '';
  const header = String(req.headers['x-csrf-token'] || '');
  if (!cookie || !header || cookie.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}
