/**
 * Access codes (PIN -> { name, fullAccess }) live only in the ACCESS_CODES
 * environment variable (set in the Vercel dashboard / `vercel env add`),
 * never in the repository. This keeps real names/PINs out of git history.
 */
let cached = null;

function loadAccessCodes() {
  if (cached) return cached;

  const raw = process.env.ACCESS_CODES;
  if (!raw) {
    throw new Error(
      'ACCESS_CODES env var is not set. Define it as JSON, e.g. ' +
      '{"1234":{"name":"Alex","fullAccess":true}} — see .env.example.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('ACCESS_CODES env var is not valid JSON: ' + err.message);
  }

  const codes = {};
  for (const [pin, info] of Object.entries(parsed)) {
    if (!/^[0-9]{4,8}$/.test(pin)) continue;
    if (!info || typeof info.name !== 'string') continue;
    codes[pin] = { name: info.name, fullAccess: !!info.fullAccess };
  }

  cached = codes;
  return cached;
}

function lookupCode(pin) {
  const codes = loadAccessCodes();
  return codes[pin] || null;
}

module.exports = { loadAccessCodes, lookupCode };
