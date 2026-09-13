const customerModel = require('./customerModel');

/**
 * GET /api/user/profile
 * Retrieves the currently authenticated user's profile and dynamic session data.
 * Protected by authenticateToken middleware.
 */
const getProfile = async (req, res) => {
    try {
        const userId = req.user && (req.user.id || req.user.customerId);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: User identifier missing from session token.'
            });
        }

        // 1. Fetch user profile from database with parameterized query
        const user = await customerModel.getUserProfile(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User record not found in database.'
            });
        }

        // 2. Fetch active session if any (gracefully handle if none)
        let activeSession = null;
        try {
            activeSession = await customerModel.getActiveSessionByCustomerId(userId);
        } catch (sessionErr) {
            console.warn('Notice: Could not load active session:', sessionErr.message);
        }

        // 3. Fetch recent payment history
        let paymentHistory = [];
        try {
            paymentHistory = await customerModel.getPaymentHistoryByCustomerId(userId);
        } catch (paymentErr) {
            console.warn('Notice: Could not load payment history:', paymentErr.message);
        }

        return res.status(200).json({
            success: true,
            user: {
                ...user,
                activeSession: activeSession || null,
                paymentHistory: paymentHistory || []
            }
        });
    } catch (error) {
        console.error('Error in getProfile controller:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error occurred while retrieving user details.'
        });
    }
};

/**
 * PUT /api/user/profile
 * Updates profile information for the currently authenticated user.
 */
const updateProfile = async (req, res) => {
    try {
        const userId = req.user && (req.user.id || req.user.customerId);
        const { firstName, lastName, mobileNumber, carRegistration, profilePhoto } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        if (!firstName || !lastName) {
            return res.status(400).json({
                success: false,
                message: 'First name and last name are required.'
            });
        }

        // Format and sanitize mobile number
        let cleanedMobile = mobileNumber ? mobileNumber.replace(/[^\d+]/g, '') : '';
        if (cleanedMobile.startsWith('0') && cleanedMobile.length === 10) {
            cleanedMobile = '+27' + cleanedMobile.substring(1);
        }

        const sanitizedCarReg = carRegistration ? carRegistration.trim().toUpperCase() : null;

        await customerModel.updateCustomer(
            userId,
            firstName.trim(),
            lastName.trim(),
            cleanedMobile,
            sanitizedCarReg,
            profilePhoto || null
        );

        const updatedProfile = await customerModel.getUserProfile(userId);

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            user: updatedProfile
        });
    } catch (error) {
        console.error('Error in updateProfile controller:', error);
        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                message: 'The mobile number or car registration is already assigned to another account.'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Failed to update profile due to a server error.'
        });
    }
};

/**
 * POST /api/customer/extend-parking (or /api/user/extend-parking)
 * Extends active parking session duration by specified hours.
 */
const extendParking = async (req, res) => {
    try {
        const userId = req.user && (req.user.id || req.user.customerId);
        const { hours, amount } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        const numHours = parseInt(hours, 10);
        if (!numHours || numHours <= 0) {
            return res.status(400).json({ success: false, message: 'Please specify a valid number of hours to extend.' });
        }

        const updatedSession = await customerModel.extendParkingSession(userId, numHours);

        if (!updatedSession) {
            return res.status(404).json({
                success: false,
                message: 'No active parking session found to extend.'
            });
        }

        return res.status(200).json({
            success: true,
            message: `Parking session extended by ${numHours} hour(s).`,
            session: updatedSession
        });
    } catch (error) {
        console.error('Error in extendParking controller:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while extending parking session.'
        });
    }
};

/**
 * POST /api/customer/record-payment
 * Records a payment against the active session.
 */
const recordPayment = async (req, res) => {
    try {
        const userId = req.user && (req.user.id || req.user.customerId);
        const { amount, paymentMethod } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        const activeSession = await customerModel.getActiveSessionByCustomerId(userId);
        if (!activeSession) {
            return res.status(400).json({ success: false, message: 'No active session found for payment.' });
        }

        const payment = await customerModel.recordPayment(activeSession.sessionId, amount, paymentMethod || 'card');

        return res.status(200).json({
            success: true,
            message: 'Payment recorded successfully.',
            payment
        });
    } catch (error) {
        console.error('Error in recordPayment controller:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to record payment.'
        });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    extendParking,
    recordPayment
};

