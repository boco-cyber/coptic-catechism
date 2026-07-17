const { User } = require('../models');
const { verifyPassword } = require('../utils/password');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ success: false, error: 'username and password are required' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() }).lean();
    const valid = user && await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    req.session.username = user.username;
    res.json({ success: true, data: { username: user.username } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
};

exports.me = (req, res) => {
  res.json({ success: true, data: { username: req.session.username } });
};
