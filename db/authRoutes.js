const express = require('express');
const router = express.Router();
const authController = require('./authController');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const customerModel = require('./customerModel');

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access denied. Please log in.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Session expired. Please log in again.' });
        req.user = user;
        next();
    });
};

// Middleware to restrict access to admins only
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admins only.' });
    }
};

// Validation rules for registration
const registerValidation = [
    // 2.4.3/2.4.4 Include valid characters and block symbols in names
    body('firstName').trim().notEmpty().withMessage('First name is required')
        .isAlpha('en-US', { ignore: ' ' }).withMessage('First name should only contain letters'),
    body('lastName').trim().notEmpty().withMessage('Last name is required')
        .isAlpha('en-US', { ignore: ' ' }).withMessage('Last name should only contain letters'),
    body('mobileNumber')
        .notEmpty().withMessage('Mobile number is required')
        .customSanitizer(value => {
            let cleaned = value.replace(/[^\d]/g, ''); // Remove all non-digits
            if (cleaned.startsWith('0') && cleaned.length === 10) { // e.g., 0721234567
                cleaned = '+27' + cleaned.substring(1);
            } else if (cleaned.length === 9 && !cleaned.startsWith('+')) { // e.g., 721234567
                cleaned = '+27' + cleaned;
            }
            return cleaned; // Should be in +27... format or other international format
        })
        .custom(async (value) => {
            const user = await customerModel.findCustomerByMobile(value);
            if (user) {
                throw new Error('Mobile number is already in use');
            }
            return true;
        }),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('carRegistration')
        .optional({ checkFalsy: true })
        .trim()
        .custom(async (value) => {
            if (value && value.length > 0) {
                const user = await customerModel.findCustomerByCarReg(value.toUpperCase());
                if (user) {
                    throw new Error('Car registration number is already in use');
                }
            }
            return true;
        })
];

// POST /api/auth/register
router.post('/register', registerValidation, authController.register);
// POST /api/auth/login
router.post('/login', authController.login);
// POST /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);
// POST /api/auth/verify-otp
router.post('/verify-otp', authController.verifyOTP);
// POST /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);
// GET /api/auth/me (Protected)
router.get('/me', authenticateToken, authController.getProfile);
// PUT /api/auth/update-profile (Protected)
router.put('/update-profile', authenticateToken, authController.updateProfile);
// PUT /api/auth/change-password (Protected)
router.put('/change-password', authenticateToken, authController.changePassword);
// GET /api/auth/users (Protected)
router.get('/users', authenticateToken, isAdmin, authController.getAllUsers);
// DELETE /api/auth/users/:id (Protected - Admin Only)
router.delete('/users/:id', authenticateToken, isAdmin, authController.deleteUser);
// POST /api/auth/extend-session (Protected)
router.post('/extend-session', authenticateToken, authController.extendSession);
// GET /api/auth/session-status (Protected)
router.get('/session-status', authenticateToken, authController.getSessionStatus);

module.exports = router;