const express = require('express');
const multer = require('multer');
const router = express.Router();

const { requireAdminSession, requireAdminHeader } = require('../middleware/adminAuth');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const authController = require('../controllers/adminAuthController');
const questionController = require('../controllers/adminQuestionController');
const exportController = require('../controllers/adminExportController');
const importController = require('../controllers/adminImportController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/login', loginRateLimiter, authController.login);
router.post('/logout', requireAdminSession, authController.logout);
router.get('/me', requireAdminSession, authController.me);

router.get('/questions', requireAdminSession, questionController.listQuestions);
router.get('/questions/:questionNumber', requireAdminSession, questionController.getQuestion);
router.put('/questions/:questionNumber', requireAdminSession, requireAdminHeader, questionController.updateQuestion);
router.get('/stats', requireAdminSession, questionController.getStats);
router.get('/export', requireAdminSession, exportController.exportQuestions);
router.post('/import', requireAdminSession, requireAdminHeader, upload.single('file'), importController.importQuestions);

module.exports = router;
