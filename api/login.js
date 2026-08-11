const { lookupCode } = require('../lib/accessCodes');
const { createSessionCookie } = require('../lib/session');

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 8;
// Best-effort only: resets on cold start and is per-instance, not shared
// across all Vercel regions/instances. Good enough to blunt casual PIN
// guessing; see README for stronger options if needed.
const attemptsByIp = new Map();

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    attemptsByIp.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'rate_limited' }));
  }

  // Slow down brute-force guessing without noticeably affecting real users.
  await sleep(300);

  const body = await readJsonBody(req);
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

  let user;
  try {
    user = /^[0-9]{4,8}$/.test(pin) ? lookupCode(pin) : null;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'server_misconfigured' }));
  }

  if (!user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'invalid_code' }));
  }

  try {
    res.setHeader('Set-Cookie', createSessionCookie(user));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'server_misconfigured' }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ name: user.name, fullAccess: user.fullAccess }));
};
