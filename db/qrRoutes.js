const express = require('express');
const router = express.Router();
const qrController = require('./qrController');

/**
 * Route: POST /api/qr/generate
 * Description: Generates dynamic, time-sensitive QR session stored in PostgreSQL.
 */
router.post('/generate', qrController.generateQrCode);

/**
 * Route: GET /api/qr/status/:sessionId
 * Description: Polling status endpoint to detect mobile scan and completion.
 */
router.get('/status/:sessionId', qrController.getQrStatus);

/**
 * Route: POST /api/qr/scan
 * Description: Marks QR code as scanned by camera.
 */
router.post('/scan', qrController.markScanned);

/**
 * Route: POST /api/qr/verify-login
 * Description: Authenticates scanned session and returns authorized JWT.
 */
router.post('/verify-login', qrController.verifyLogin);

/**
 * Route: POST /api/qr/verify-payment
 * Description: Settles scanned payment session and logs transaction receipt.
 */
router.post('/verify-payment', qrController.verifyPayment);

module.exports = router;
