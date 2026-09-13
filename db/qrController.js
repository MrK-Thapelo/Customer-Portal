const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const qrModel = require('./qrModel');
const customerModel = require('./customerModel');

/**
 * Generates a dynamic, time-sensitive, single-use QR session.
 * Returns the session ID, secret token, and Base64 QR code image.
 */
const generateQrCode = async (req, res) => {
    try {
        const { type = 'login', metadata = {}, expiresInSeconds = 120 } = req.body;

        if (!['login', 'payment'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid QR session type. Must be "login" or "payment".'
            });
        }

        // 1. Create DB entry in qr_sessions table
        const session = await qrModel.createSession({
            type,
            metadata,
            expiresInSeconds: parseInt(expiresInSeconds, 10) || 120
        });

        // 2. Prepare payload to embed in QR code
        const host = req.get('host') || 'localhost:3000';
        const protocol = req.protocol || 'http';
        const qrPayload = JSON.stringify({
            app: 'AI_PARKING_MONITOR',
            type: session.type,
            sessionId: session.session_id,
            token: session.token,
            expiresAt: session.expires_at,
            scanUrl: `${protocol}://${host}/api/qr/verify-${type}?token=${session.token}`
        });

        // 3. Render high-contrast QR code as Base64 Data URL
        const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
            errorCorrectionLevel: 'M',
            margin: 2,
            scale: 8,
            color: {
                dark: '#0d0f14',
                light: '#ffffff'
            }
        });

        console.log(`[QR GENERATED] Type: ${type} | Session: ${session.session_id} | Expires: ${new Date(session.expires_at).toLocaleTimeString()}`);

        return res.status(201).json({
            success: true,
            sessionId: session.session_id,
            token: session.token,
            type: session.type,
            qrCodeDataUrl,
            expiresAt: session.expires_at,
            expiresInSeconds: parseInt(expiresInSeconds, 10) || 120
        });

    } catch (error) {
        console.error('[QR ERROR] generateQrCode failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate dynamic QR code: ' + error.message
        });
    }
};

/**
 * Polling endpoint: returns the active state of a QR session.
 * Used by desktop browsers to detect when mobile scan/approval occurs.
 */
const getQrStatus = async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'Session ID required.' });
        }

        const session = await qrModel.getSessionById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                status: 'not_found',
                message: 'QR session not found or invalid.'
            });
        }

        // Return status specific payload
        if (session.status === 'completed') {
            const meta = typeof session.metadata === 'string' ? JSON.parse(session.metadata) : (session.metadata || {});

            if (session.type === 'login') {
                return res.status(200).json({
                    success: true,
                    status: 'completed',
                    type: 'login',
                    token: session.jwt_token,
                    user: meta.user || null
                });
            } else if (session.type === 'payment') {
                return res.status(200).json({
                    success: true,
                    status: 'completed',
                    type: 'payment',
                    receipt: meta.receipt || null
                });
            }
        }

        return res.status(200).json({
            success: true,
            status: session.status,
            type: session.type,
            expiresAt: session.expires_at
        });

    } catch (error) {
        console.error('[QR ERROR] getQrStatus failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal error checking QR session status.'
        });
    }
};

/**
 * Marks QR code as scanned when camera initially scans it.
 */
const markScanned = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required.' });
        }

        const updated = await qrModel.markAsScanned(token);
        if (!updated) {
            return res.status(400).json({
                success: false,
                message: 'QR session is expired, invalid, or already processed.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'QR code marked as scanned.',
            sessionId: updated.session_id
        });
    } catch (error) {
        console.error('[QR ERROR] markScanned failed:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Mobile / Scanner verification route for QR Login.
 * Verifies token, authenticates target user, and signs JWT.
 */
const verifyLogin = async (req, res) => {
    try {
        const token = req.body.token || req.body.qrToken;
        const { customerId, identifier } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'QR session token is required.'
            });
        }

        // 1. Verify QR session in PostgreSQL
        const session = await qrModel.getSessionByToken(token);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Invalid QR session token.'
            });
        }

        if (session.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'This QR code has already been used.'
            });
        }

        if (session.status === 'expired' || new Date() > new Date(session.expires_at)) {
            return res.status(410).json({
                success: false,
                message: 'This QR code has expired. Please refresh the QR code on your screen.'
            });
        }

        // 2. Resolve Customer Account
        let customer = null;
        if (customerId) {
            customer = await customerModel.findCustomerById(customerId);
        } else if (identifier) {
            const candidates = await customerModel.findCustomersByIdentifier(identifier);
            customer = candidates?.[0];
        } else {
            // Default test customer from database (User 2 or User 1)
            const fallback = await pool.query('SELECT * FROM customer ORDER BY customerid ASC LIMIT 1');
            customer = fallback.rows[0];
        }

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Target customer account not found in database.'
            });
        }

        // 3. Issue Fresh JWT
        const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_key';
        const role = customer.role || 'customer';
        const jwtToken = jwt.sign(
            {
                id: customer.customerid,
                customerId: customer.customerid,
                role: role
            },
            jwtSecret,
            { expiresIn: '24h' }
        );

        const userDetails = {
            id: customer.customerid,
            firstName: customer.firstname,
            lastName: customer.lastname,
            email: customer.email,
            mobileNumber: customer.mobilenumber,
            carRegistration: customer.carregistration,
            role: role
        };

        // 4. Complete QR Session in PostgreSQL
        await qrModel.completeLoginSession({
            token,
            customerId: customer.customerid,
            jwtToken,
            userDetails
        });

        // Update last login
        await pool.query('UPDATE customer SET lastlogin = NOW() WHERE customerid = $1', [customer.customerid]).catch(() => null);

        console.log(`[QR LOGIN AUTHORIZED] User ${customer.customerid} (${customer.firstname}) authorized via QR.`);

        return res.status(200).json({
            success: true,
            message: 'QR Login successfully verified and authorized.',
            sessionId: session.session_id,
            user: userDetails
        });

    } catch (error) {
        console.error('[QR ERROR] verifyLogin failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during QR login verification: ' + error.message
        });
    }
};

/**
 * Mobile / Scanner verification route for QR Payment.
 * Verifies token, generates receipt, and updates session to completed.
 */
const verifyPayment = async (req, res) => {
    try {
        const token = req.body.token || req.body.qrToken;
        const { paymentMethod = 'qr_instant' } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'QR session token is required.'
            });
        }

        // 1. Verify QR session in PostgreSQL
        const session = await qrModel.getSessionByToken(token);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Invalid QR session token.'
            });
        }

        if (session.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'This payment QR code has already been settled.'
            });
        }

        if (session.status === 'expired' || new Date() > new Date(session.expires_at)) {
            return res.status(410).json({
                success: false,
                message: 'This payment QR code has expired. Please generate a new code.'
            });
        }

        const meta = typeof session.metadata === 'string' ? JSON.parse(session.metadata) : (session.metadata || {});
        const amount = parseFloat(meta.amount || 35.00);
        const plate = meta.plate || 'GP 619 HHH';
        const txnId = `TXN-QR-2026-${Math.floor(100000 + Math.random() * 900000)}`;
        const now = new Date();

        const receipt = {
            transactionId: txnId,
            amount: amount,
            plate: plate,
            paymentMethod: 'Dynamic QR (' + paymentMethod + ')',
            timestamp: now.toISOString(),
            status: 'COMPLETED',
            exitWindowMinutes: 15
        };

        // 2. Complete payment session in PostgreSQL
        await qrModel.completePaymentSession({
            token,
            paymentReceipt: receipt
        });

        // 3. Optional insert into PAYMENT table for audit
        await pool.query(
            `INSERT INTO payment (sessionid, amount, paymentmethod, status, createdat) 
             VALUES ($1, $2, $3, 'completed', NOW())`,
            [meta.parkingSessionId || 1, amount, 'qr_scan']
        ).catch(e => console.warn('[QR PAYMENT DB] Non-critical payment log notice:', e.message));

        console.log(`[QR PAYMENT SETTLED] Txn: ${txnId} | Amount: R${amount} | Plate: ${plate}`);

        return res.status(200).json({
            success: true,
            message: 'Payment successfully verified and authorized.',
            receipt
        });

    } catch (error) {
        console.error('[QR ERROR] verifyPayment failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during QR payment verification: ' + error.message
        });
    }
};

module.exports = {
    generateQrCode,
    getQrStatus,
    markScanned,
    verifyLogin,
    verifyPayment
};
