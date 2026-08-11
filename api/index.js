const { readSession } = require('../lib/session');
const { renderLoggedOut, renderLoggedIn } = require('../lib/renderPage');

module.exports = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }

  const session = readSession(req.headers.cookie);

  let html;
  try {
    html = session ? renderLoggedIn(session) : renderLoggedOut();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Server misconfigured: ' + err.message);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // This page's content depends on the session cookie and can contain
  // private trip/budget data — never let a shared cache serve it twice.
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(html);
};
