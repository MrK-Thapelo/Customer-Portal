const express = require('express');
const router = express.Router();
const userController = require('./userController');
const authController = require('./authController');
const { authenticateToken } = require('./authMiddleware');

/**
 * Route: GET /profile, /dashboard, and /
 * Description: Retrieves logged-in customer's live profile, session, and stats.
 * Access: Protected (Requires valid JWT)
 */
router.get('/profile', authenticateToken, userController.getProfile);
router.get('/dashboard', authenticateToken, userController.getProfile);
router.get('/', authenticateToken, userController.getProfile);

/**
 * Route: PUT /profile
 * Description: Updates the logged-in customer's profile information.
 * Access: Protected (Requires valid JWT)
 */
router.put('/profile', authenticateToken, userController.updateProfile);

/**
 * Route: POST /extend-session and GET /session-status
 * Description: Session tracking and extension endpoints
 */
router.post('/extend-session', authenticateToken, authController.extendSession);
router.get('/session-status', authenticateToken, authController.getSessionStatus);

/**
 * Route: POST /extend-parking
 * Description: Extends active vehicle parking session duration in hours
 */
router.post('/extend-parking', authenticateToken, userController.extendParking);

/**
 * Route: POST /record-payment
 * Description: Records completed parking payment in database
 */
router.post('/record-payment', authenticateToken, userController.recordPayment);

module.exports = router;
