function requireAdminSession(req, res, next) {
  if (req.session && req.session.username) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Not authenticated' });
}

function requireAdminHeader(req, res, next) {
  if (req.get('X-Requested-With') === 'admin-ui') {
    return next();
  }
  res.status(403).json({ success: false, error: 'Missing required request header' });
}

module.exports = { requireAdminSession, requireAdminHeader };
