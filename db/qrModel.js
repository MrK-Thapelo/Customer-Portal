const pool = require('./db');
const crypto = require('crypto');

/**
 * Initialize qr_sessions table in PostgreSQL if not already present
 */
const initQrTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS qr_sessions (
            session_id VARCHAR(64) PRIMARY KEY,
            token VARCHAR(128) UNIQUE NOT NULL,
            type VARCHAR(30) NOT NULL, -- 'login' or 'payment'
            status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'scanned', 'completed', 'expired'
            customer_id INT,
            metadata JSONB DEFAULT '{}'::jsonb,
            jwt_token TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            scanned_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS idx_qr_sessions_token ON qr_sessions(token);
        CREATE INDEX IF NOT EXISTS idx_qr_sessions_status ON qr_sessions(status);
    `;
    try {
        await pool.query(createTableQuery);
        console.log('[QR SYSTEM] qr_sessions table initialized and verified.');
    } catch (err) {
        console.error('[QR SYSTEM ERROR] Failed to initialize qr_sessions table:', err);
    }
};

// Run initialization
initQrTable();

/**
 * Creates a unique, single-use, time-sensitive QR session in PostgreSQL.
 * @param {Object} params
 * @param {string} params.type - 'login' or 'payment'
 * @param {Object} [params.metadata] - Extra metadata (e.g. amount, vehicle plate)
 * @param {number} [params.expiresInSeconds=120] - Lifetime in seconds (default 2 minutes)
 * @param {number} [params.customerId] - Optional customer ID
 */
const createSession = async ({ type, metadata = {}, expiresInSeconds = 120, customerId = null }) => {
    const sessionId = 'qr_' + crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const query = `
        INSERT INTO qr_sessions (session_id, token, type, status, metadata, customer_id, expires_at)
        VALUES ($1, $2, $3, 'pending', $4, $5, $6)
        RETURNING session_id, token, type, status, metadata, expires_at, created_at
    `;

    const res = await pool.query(query, [
        sessionId,
        token,
        type,
        JSON.stringify(metadata),
        customerId,
        expiresAt
    ]);

    return res.rows[0];
};

/**
 * Retrieves QR session by session ID and checks for expiration.
 */
const getSessionById = async (sessionId) => {
    const res = await pool.query(
        'SELECT * FROM qr_sessions WHERE session_id = $1',
        [sessionId]
    );

    if (res.rows.length === 0) return null;

    const session = res.rows[0];
    const now = new Date();

    // Check expiration if not completed
    if (session.status !== 'completed' && session.status !== 'expired' && now > new Date(session.expires_at)) {
        await pool.query(
            "UPDATE qr_sessions SET status = 'expired' WHERE session_id = $1",
            [sessionId]
        );
        session.status = 'expired';
    }

    return session;
};

/**
 * Retrieves QR session by secret token and checks for expiration.
 */
const getSessionByToken = async (token) => {
    const res = await pool.query(
        'SELECT * FROM qr_sessions WHERE token = $1',
        [token]
    );

    if (res.rows.length === 0) return null;

    const session = res.rows[0];
    const now = new Date();

    if (session.status !== 'completed' && session.status !== 'expired' && now > new Date(session.expires_at)) {
        await pool.query(
            "UPDATE qr_sessions SET status = 'expired' WHERE session_id = $1",
            [session.session_id]
        );
        session.status = 'expired';
    }

    return session;
};

/**
 * Marks session as 'scanned' when a mobile device first captures it.
 */
const markAsScanned = async (token) => {
    const res = await pool.query(
        `UPDATE qr_sessions 
         SET status = 'scanned', scanned_at = NOW() 
         WHERE token = $1 AND status = 'pending' AND expires_at > NOW()
         RETURNING *`,
        [token]
    );
    return res.rows[0] || null;
};

/**
 * Verifies and completes a login QR session, attaching the authenticated user and JWT.
 */
const completeLoginSession = async ({ token, customerId, jwtToken, userDetails }) => {
    const res = await pool.query(
        `UPDATE qr_sessions 
         SET status = 'completed', 
             customer_id = $1, 
             jwt_token = $2, 
             metadata = metadata || $3::jsonb,
             completed_at = NOW()
         WHERE token = $4 AND status IN ('pending', 'scanned') AND expires_at > NOW()
         RETURNING *`,
        [customerId, jwtToken, JSON.stringify({ user: userDetails }), token]
    );
    return res.rows[0] || null;
};

/**
 * Verifies and completes a payment QR session, storing receipt details.
 */
const completePaymentSession = async ({ token, paymentReceipt }) => {
    const res = await pool.query(
        `UPDATE qr_sessions 
         SET status = 'completed', 
             metadata = metadata || $1::jsonb,
             completed_at = NOW()
         WHERE token = $2 AND status IN ('pending', 'scanned') AND expires_at > NOW()
         RETURNING *`,
        [JSON.stringify({ receipt: paymentReceipt }), token]
    );
    return res.rows[0] || null;
};

module.exports = {
    initQrTable,
    createSession,
    getSessionById,
    getSessionByToken,
    markAsScanned,
    completeLoginSession,
    completePaymentSession
};
