const express = require('express');
const router = express.Router();

const { requireAdminSession } = require('../middleware/adminAuth');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const authController = require('../controllers/adminAuthController');

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', requireAdminSession, authController.logout);
router.get('/me', requireAdminSession, authController.me);

module.exports = router;
