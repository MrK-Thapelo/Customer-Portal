const customerModel = require('./customerModel');
const { hashPassword, comparePassword } = require('./authUtils');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const pool = require('./db');
const { sendWelcomeEmail, sendOTPEmail, sendResetEmail, sendPasswordResetSuccessEmail } = require('./emailUtils');

const register = async (req, res) => {
    console.log('====== REGISTER REQUEST ======');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.warn(`[REJECTED] Validation failed: ${errors.array()[0].msg}`);
        return res.status(400).json({ 
            message: 'Validation failed: ' + errors.array()[0].msg, 
            errors: errors.array() 
        });
    }

    let { firstName, lastName, email, mobileNumber, carRegistration, password, profilePhoto, inviteCode } = req.body;

    try {
        // Sanitize inputs
        const sanitizedCarReg = carRegistration ? carRegistration.trim().toUpperCase() : null;
        // Check if car registration already exists (if provided)
        if (sanitizedCarReg) {
            const existingCar = await customerModel.findCustomerByCarReg(sanitizedCarReg);
            if (existingCar) {
                console.warn(`[REJECTED] Duplicate Car Reg: ${sanitizedCarReg}`);
                return res.status(400).json({ message: 'Car registration number is already registered.' });
            }
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Determine role based on secret invite code
        const role = (inviteCode && inviteCode === process.env.ADMIN_INVITE_CODE) ? 'admin' : 'customer';

        // Create new customer
        const newCustomer = await customerModel.createCustomer(firstName.trim(), lastName.trim(), email, mobileNumber, sanitizedCarReg, hashedPassword, profilePhoto, role);

        console.log(`[SUCCESS] User Registered: ${newCustomer.firstname} ${newCustomer.lastname}`);

        // Send welcome email
        if (email) {
            try {
                await sendWelcomeEmail(email, firstName);
            } catch (err) {
                console.error('[EMAIL ERROR]: Welcome email failed:', err.message);
            }
        }
        
        const token = jwt.sign({ customerId: newCustomer.customerid, role: role }, process.env.JWT_SECRET, { expiresIn: '24h' }); // Email removed from JWT payload

        return res.status(201).json({ 
            message: 'Registration successful', 
            token,
            customer: {
                id: newCustomer.customerid,
                firstName: newCustomer.firstname,
                lastName: newCustomer.lastname,
                mobileNumber: newCustomer.mobilenumber,
                carRegistration: newCustomer.carregistration
            }
        });
    } catch (error) {
        console.error('[DATABASE ERROR]:', error.message, error.detail || '');
        
        if (error.code === '23505') {
            const detail = error.detail ? error.detail.toLowerCase() : '';
            if (detail.includes('mobilenumber')) {
                console.warn(`[REJECTED] DB Constraint: Mobile number ${mobileNumber} already in use.`);
                return res.status(400).json({ message: 'Mobile number is already in use.' });
            }
            if (detail.includes('carregistration')) {
                console.warn(`[REJECTED] DB Constraint: Car Reg ${carRegistration} already in use.`);
                return res.status(400).json({ message: 'Car registration is already in use.' });
            }
            return res.status(400).json({ message: 'A unique field (Mobile or Car Reg) already exists in the database.' });
        }
        res.status(500).json({ message: 'Internal Server Error: ' + error.message });
    }
};

const login = async (req, res) => {
    const { identifier, password } = req.body;
    console.log(`[AUTH] Login attempt received for identifier: "${identifier || ''}"`);

    try {
        if (!identifier || !password) {
            console.warn('[AUTH] Missing identifier or password in request body.');
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide both your identifier (mobile, car reg, or email) and password.' 
            });
        }

        // 1. Query database for all candidate accounts matching the identifier
        const candidates = await customerModel.findCustomersByIdentifier(identifier);

        if (!candidates || candidates.length === 0) {
            console.warn(`[AUTH REJECTED] No account found in database matching: "${identifier}"`);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials. No account found matching your details.' 
            });
        }

        console.log(`[AUTH] Found ${candidates.length} candidate account(s) for "${identifier}":`, 
            candidates.map(c => `ID:${c.customerid} (${c.firstname} ${c.lastname}, ${c.role})`));

        // 2. Verify password hash using bcrypt against matching candidate(s)
        let customer = null;
        for (const candidate of candidates) {
            if (candidate.passwordhash) {
                const isPasswordValid = await comparePassword(password, candidate.passwordhash);
                if (isPasswordValid) {
                    customer = candidate;
                    break;
                }
            }
        }

        if (!customer) {
            console.warn(`[AUTH REJECTED] Password mismatch for candidate(s) matching identifier: "${identifier}"`);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials. Incorrect password.' 
            });
        }

        // 3. Generate JWT token
        const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_key';
        const role = customer.role || 'customer';
        const token = jwt.sign(
            { 
                id: customer.customerid, 
                customerId: customer.customerid, 
                role: role 
            }, 
            jwtSecret, 
            { expiresIn: '24h' }
        );

        const decoded = jwt.decode(token);
        const expiresAt = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + 24 * 3600 * 1000;

        console.log(`[AUTH SUCCESS] User ${customer.customerid} (${customer.firstname} ${customer.lastname}) logged in as ${role}. Session expires at ${new Date(expiresAt).toLocaleTimeString()}`);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            role,
            expiresAt,
            user: {
                id: customer.customerid,
                firstName: customer.firstname,
                lastName: customer.lastname,
                email: customer.email,
                mobileNumber: customer.mobilenumber,
                carRegistration: customer.carregistration,
                role: role
            }
        });
    } catch (error) {
        console.error('[AUTH EXCEPTION] Unexpected error during login:', error.message, error.stack);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error during authentication: ' + (error.message || 'Unknown error') 
        });
    }
};

const validatePassword = (password) => {
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    return null;
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const normalizedEmail = email?.toLowerCase().trim();
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const expiry = new Date(Date.now() + 15 * 60 * 1000);

        const users = await customerModel.findCustomerByEmail(normalizedEmail);
        if (!users || users.length === 0) return res.status(404).json({ error: 'User does not exist.' });

        const user = users[0];
        await customerModel.updateOTP(user.customerid, otp, expiry);

        await sendOTPEmail(normalizedEmail, otp);
        res.json({ message: 'A reset code has been sent to your email.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const verifyOTP = async (req, res) => {
    const { email, code } = req.body;
    try {
        const normalizedEmail = email?.toLowerCase().trim();
        const users = await customerModel.findCustomerByEmail(normalizedEmail);
        const user = users?.[0];

        if (!user || user.resetotp !== code || new Date() > new Date(user.resetotpexpiry)) {
            return res.status(400).json({ error: 'Invalid or expired code.' });
        }
        res.json({ message: 'Code verified.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const resetPassword = async (req, res) => {
    const { email, code, new_password } = req.body;
    try {
        const normalizedEmail = email?.toLowerCase().trim();
        const users = await customerModel.findCustomerByEmail(normalizedEmail);
        const user = users?.[0];

        if (!user || user.resetotp !== code || new Date() > new Date(user.resetotpexpiry)) {
            return res.status(400).json({ error: 'Invalid or expired code.' });
        }

        const pwError = validatePassword(new_password);
        if (pwError) return res.status(400).json({ error: pwError });

        const hashedPassword = await hashPassword(new_password);
        await customerModel.updatePassword(user.customerid, hashedPassword);
        await customerModel.updateOTP(user.customerid, null, null);

        await sendPasswordResetSuccessEmail(normalizedEmail);
        res.json({ message: 'Password updated successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const getProfile = async (req, res) => {
    try {
        // Use customerId from JWT instead of email to find the specific account
        const customer = await customerModel.findCustomerById(req.user.customerId);
        
        if (!customer) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Exclude sensitive data like passwordhash before sending to frontend
        const { passwordhash, ...profileData } = customer; // Email is no longer directly part of customer object
        res.status(200).json(profileData);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Error fetching profile.' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, mobileNumber, carRegistration, profilePhoto } = req.body;
        const customerId = req.user.customerId;

        const updatedCustomer = await customerModel.updateCustomer(
            customerId,
            firstName.trim(),
            lastName.trim(),
            mobileNumber ? (() => {
                let cleaned = mobileNumber.replace(/[^\d]/g, '');
                if (cleaned.startsWith('0') && cleaned.length === 10) {
                    cleaned = '+27' + cleaned.substring(1);
                } else if (cleaned.length === 9 && !cleaned.startsWith('+')) {
                    cleaned = '+27' + cleaned;
                }
                return cleaned;
            })() : '',
            carRegistration ? carRegistration.trim().toUpperCase() : null,
            profilePhoto
        );

        const { passwordhash, ...profileData } = updatedCustomer;
        res.status(200).json({ message: 'Profile updated successfully', user: profileData });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Error updating profile.' });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const customerId = req.user.customerId;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Both current and new passwords are required.' });
        }

        const customer = await customerModel.findCustomerById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isMatch = await comparePassword(currentPassword, customer.passwordhash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password.' });
        }

        const hashedPassword = await hashPassword(newPassword);
        await customerModel.updatePassword(customerId, hashedPassword);

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ message: 'Error updating password.' });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const users = await customerModel.getAllCustomers();
        res.status(200).json(users);
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ message: 'Error fetching users.' });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedUser = await customerModel.deleteCustomer(id);
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.status(200).json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Error deleting user.' });
    }
};

/**
 * POST /api/auth/extend-session
 * Verifies active session, checks PostgreSQL user status, updates last login,
 * and issues a freshly signed token with extended expiration.
 */
const extendSession = async (req, res) => {
    try {
        const userId = req.user && (req.user.id || req.user.customerId);
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: User ID missing from session.'
            });
        }

        // 1. Verify user exists and is active in database
        const result = await pool.query(
            'SELECT customerid, firstname, lastname, role, COALESCE(status, \'active\') AS status FROM customer WHERE customerid = $1',
            [userId]
        );
        const customer = result.rows[0];

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'User account not found in database.'
            });
        }

        if (customer.status && customer.status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'Account is suspended. Cannot extend session.'
            });
        }

        // 2. Issue fresh token with new 2-hour validity
        const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_key';
        const role = customer.role || 'customer';
        const token = jwt.sign(
            {
                id: customer.customerid,
                customerId: customer.customerid,
                role: role
            },
            jwtSecret,
            { expiresIn: '2h' }
        );

        const decoded = jwt.decode(token);
        const expiresAt = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + 2 * 3600 * 1000;

        // 3. Update last login / active timestamp in PostgreSQL
        await pool.query(
            'UPDATE customer SET lastlogin = NOW() WHERE customerid = $1',
            [userId]
        ).catch(() => null);

        console.log(`[AUTH] Session extended for user ID ${userId} (${customer.firstname}). New expiry: ${new Date(expiresAt).toLocaleTimeString()}`);

        return res.status(200).json({
            success: true,
            message: 'Session successfully extended.',
            token,
            role,
            expiresAt
        });
    } catch (error) {
        console.error('[AUTH ERROR] extendSession failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while extending session.'
        });
    }
};

/**
 * GET /api/auth/session-status
 * Returns current authenticated state and user info.
 */
const getSessionStatus = async (req, res) => {
    try {
        const userId = req.user && (req.user.id || req.user.customerId);
        return res.status(200).json({
            success: true,
            authenticated: true,
            userId,
            role: req.user.role || 'customer'
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to retrieve session status.' });
    }
};

module.exports = { 
    register, 
    login, 
    forgotPassword, 
    verifyOTP, 
    resetPassword, 
    validatePassword, 
    getProfile, 
    updateProfile, 
    changePassword, 
    getAllUsers, 
    deleteUser,
    extendSession,
    getSessionStatus
};