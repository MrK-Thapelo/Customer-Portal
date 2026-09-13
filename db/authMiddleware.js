const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Validates the JWT token from the Authorization header and attaches the decoded user payload to req.user.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No authentication token provided.'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            const isExpired = err.name === 'TokenExpiredError';
            return res.status(403).json({
                success: false,
                message: isExpired ? 'Session expired. Please log in again.' : 'Invalid token. Authentication failed.'
            });
        }

        // Attach user identity to request object
        const userId = decoded.customerId || decoded.id;
        req.user = {
            id: userId,
            customerId: userId,
            role: decoded.role || 'customer'
        };

        next();
    });
};

/**
 * Role-based authorization middleware (e.g. for admin routes)
 */
const requireRole = (role) => {
    return (req, res, next) => {
        if (req.user && req.user.role === role) {
            next();
        } else {
            res.status(403).json({
                success: false,
                message: `Access denied. Requires ${role} privileges.`
            });
        }
    };
};

module.exports = {
    authenticateToken,
    requireRole
};
