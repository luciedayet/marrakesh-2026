const { clearSessionCookie } = require('../lib/session');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end();
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.statusCode = 204;
  res.end();
};
