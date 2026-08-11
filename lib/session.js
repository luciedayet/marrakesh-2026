const crypto = require('crypto');

const COOKIE_NAME = 'carnet_session';
const DEFAULT_MAX_AGE_DAYS = 60;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'SESSION_SECRET env var is missing or too short (need >= 16 chars). ' +
      'Set it in your Vercel project settings (and in .env for local dev).'
    );
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function maxAgeSeconds() {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS) || DEFAULT_MAX_AGE_DAYS;
  return Math.round(days * 24 * 60 * 60);
}

/**
 * Creates a signed, httpOnly session cookie string (for the Set-Cookie header).
 * The payload (name/fullAccess/exp) is base64url-encoded and HMAC-signed so it
 * can't be forged or tampered with client-side; it is not encrypted, so it must
 * not contain secrets (PINs are never stored in it).
 */
function createSessionCookie({ name, fullAccess }) {
  const exp = Date.now() + maxAgeSeconds() * 1000;
  const payload = base64url(JSON.stringify({ name, fullAccess: !!fullAccess, exp }));
  const signature = sign(payload);
  const value = `${payload}.${signature}`;

  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds()}`,
  ];
  return parts.join('; ');
}

function clearSessionCookie() {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

/**
 * Verifies the session cookie from a request's Cookie header.
 * Returns { name, fullAccess } if valid and not expired, otherwise null.
 */
function readSession(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[COOKIE_NAME];
  if (!raw || !raw.includes('.')) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
  if (typeof data.name !== 'string') return null;

  return { name: data.name, fullAccess: !!data.fullAccess };
}

module.exports = { createSessionCookie, clearSessionCookie, readSession, parseCookies, COOKIE_NAME };
