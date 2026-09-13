const pool = require('./db');

const customerModel = {
    /**
     * Finds a customer by any valid identifier:
     * - Email (case-insensitive)
     * - Car Registration (case-insensitive, ignoring spaces)
     * - Mobile Number (supporting +27, 0-prefixed, or raw numbers)
     * @param {string} identifier
    /**
     * Finds all customer accounts matching an identifier:
     * - Email (case-insensitive) - supports multiple accounts sharing an email
     * - Car Registration (case-insensitive, ignoring spaces)
     * - Mobile Number (supporting +27, 0-prefixed, or raw numbers)
     * @param {string} identifier
     */
    async findCustomersByIdentifier(identifier) {
        if (!identifier) return [];
        const trimmed = identifier.trim();
        const cleanedDigits = trimmed.replace(/[^\d]/g, '');

        // Generate mobile number variants
        const v1 = trimmed;
        const v2 = cleanedDigits || ' ';
        const v3 = cleanedDigits.startsWith('0') 
            ? '+27' + cleanedDigits.substring(1) 
            : (cleanedDigits.startsWith('27') ? '+' + cleanedDigits : '+27' + cleanedDigits);
        const v4 = cleanedDigits.startsWith('27') 
            ? '0' + cleanedDigits.substring(2) 
            : (cleanedDigits.startsWith('0') ? cleanedDigits : '0' + cleanedDigits);

        const query = `
            SELECT customerid, firstname, lastname, email, mobilenumber, carregistration, passwordhash, role
            FROM customer
            WHERE mobilenumber IN ($1, $2, $3, $4)
               OR LOWER(email) = LOWER($1)
               OR UPPER(REPLACE(COALESCE(carregistration, ''), ' ', '')) = UPPER(REPLACE($1, ' ', ''))
            ORDER BY customerid ASC;
        `;
        const result = await pool.query(query, [v1, v2, v3, v4]);
        return result.rows;
    },

    /**
     * Finds a single customer by identifier.
     */
    async findCustomerByIdentifier(identifier) {
        const rows = await this.findCustomersByIdentifier(identifier);
        return rows[0] || null;
    },

    /**
     * Finds a specific customer by their ID.
     * @param {number|string} id
     */
    async findCustomerById(id) {
        const result = await pool.query('SELECT * FROM customer WHERE customerid = $1', [id]);
        return result.rows[0];
    },

    /**
     * Finds a customer by their mobile number.
     * @param {string} mobileNumber
     */
    async findCustomerByMobile(mobileNumber) {
        const result = await pool.query('SELECT * FROM customer WHERE mobilenumber = $1', [mobileNumber]);
        return result.rows[0];
    },

    /**
     * Finds a customer by their email address.
     * @param {string} email
     */
    async findCustomerByEmail(email) {
        const result = await pool.query('SELECT * FROM customer WHERE email = $1', [email]);
        return result.rows; // Returns an array, as multiple users could theoretically share an email if not unique
    },

    /**
     * Finds a customer by their car registration.
     * @param {string} carReg
     */
    async findCustomerByCarReg(carReg) {
        const result = await pool.query('SELECT * FROM customer WHERE carregistration = $1', [carReg]);
        return result.rows[0];
    },

    /**
     * Creates a new customer in the database.
     */
    async createCustomer(firstName, lastName, email, mobileNumber, carRegistration, passwordHash, profilePhoto, role = 'customer') {
        const query = `
            INSERT INTO customer (firstname, lastname, email, mobilenumber, carregistration, passwordhash, profilephoto, role)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING customerid, firstname, lastname, email, mobilenumber, carregistration, role;
        `;
        const values = [firstName, lastName, email, mobileNumber, carRegistration, passwordHash, profilePhoto, role];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    /**
     * Updates customer profile information.
     */
    async updateCustomer(id, firstName, lastName, mobileNumber, carReg, profilePhoto) {
        const query = `
            UPDATE customer 
            SET firstname = $2, lastname = $3, mobilenumber = $4, carregistration = $5, profilephoto = $6
            WHERE customerid = $1
            RETURNING *;
        `;
        const values = [id, firstName, lastName, mobileNumber, carReg, profilePhoto];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    /**
     * Updates a customer's password.
     */
    async updatePassword(id, passwordHash) {
        await pool.query('UPDATE customer SET passwordhash = $2 WHERE customerid = $1', [id, passwordHash]);
    },

    /**
     * Updates a customer's password reset OTP and its expiry.
     * @param {number} customerId
     * @param {string} otp
     * @param {Date} expiry
     */
    async updateOTP(customerId, otp, expiry) {
        await pool.query(
            'UPDATE CUSTOMER SET ResetOTP = $1, ResetOTPExpiry = $2 WHERE CustomerID = $3',
            [otp, expiry, customerId]
        );
    },

    /**
     * Updates a customer's password reset token and its expiry.
     * @param {number} customerId
     * @param {string} token
     * @param {Date} expiry
     */
    async updateResetToken(customerId, token, expiry) {
        await pool.query(
            'UPDATE CUSTOMER SET ResetToken = $1, ResetTokenExpiry = $2 WHERE CustomerID = $3',
            [token, expiry, customerId]
        );
    },

    async findUserByResetToken(token) {
        const result = await pool.query('SELECT * FROM CUSTOMER WHERE ResetToken = $1', [token]);
        return result.rows[0];
    },

    /**
     * Retrieves all customers.
     */
    async getAllCustomers() {
        const result = await pool.query('SELECT customerid, firstname, lastname, mobilenumber, carregistration, role FROM customer ORDER BY customerid ASC');
        return result.rows;
    },

    /**
     * Deletes a customer by their ID.
     * @param {number|string} customerId - The ID of the customer to delete.
     */
    async deleteCustomer(customerId) {
        const result = await pool.query('DELETE FROM customer WHERE customerid = $1 RETURNING *', [customerId]);
        return result.rows[0];
    },

    /**
     * Securely fetches the authenticated user's profile details using their unique ID.
     * Excludes passwords, tokens, and hashes. Joins loyalty level for rich details.
     * @param {number|string} id - The authenticated user's ID.
     */
    async getUserProfile(id) {
        const query = `
            SELECT 
                c.CustomerID AS id,
                c.FirstName AS "firstName",
                c.LastName AS "lastName",
                c.Email AS email,
                c.MobileNumber AS "mobileNumber",
                c.CarRegistration AS "carRegistration",
                c.ProfilePhoto AS "profilePhoto",
                c.Role AS role,
                COALESCE(c.Status, 'active') AS status,
                COALESCE(c.FreeParkingDuration, 30) AS "freeParkingDuration",
                c.LoyaltyLevelID AS "loyaltyLevelId",
                COALESCE(ll.LevelName, 'Standard') AS "loyaltyLevel"
            FROM CUSTOMER c
            LEFT JOIN LOYALTY_LEVEL ll ON c.LoyaltyLevelID = ll.LoyaltyLevelID
            WHERE c.CustomerID = $1;
        `;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Fetches current active parking session for the user (where exit time is null).
     * @param {number|string} customerId
     */
    async getActiveSessionByCustomerId(customerId) {
        const query = `
            SELECT 
                ps.sessionid AS "sessionId",
                ps.entrytime AS "entryTime",
                ps.sessiontimeout AS "sessionTimeout",
                ps.detectedplate AS "detectedPlate",
                COALESCE(ps.detectedplate, c.carregistration) AS "carRegistration",
                COALESCE(cd.location, 'Main Gate') AS "location"
            FROM parking_session ps
            JOIN customer c ON ps.customerid = c.customerid
            LEFT JOIN camera_device cd ON ps.gatecameradeviceid = cd.cameradeviceid
            WHERE ps.customerid = $1 AND ps.exittime IS NULL
            ORDER BY ps.entrytime DESC
            LIMIT 1;
        `;
        const result = await pool.query(query, [customerId]);
        return result.rows[0];
    },

    /**
     * Fetches recent payment history records for the user.
     * @param {number|string} customerId
     */
    async getPaymentHistoryByCustomerId(customerId) {
        const query = `
            SELECT 
                p.PaymentID AS "paymentId",
                p.Amount AS amount,
                p.PaymentMethod AS "paymentMethod",
                p.Status AS status,
                p.CreatedAt AS "createdAt",
                COALESCE(cd.Location, 'Main Facility') AS "location"
            FROM PAYMENT p
            JOIN PARKING_SESSION ps ON p.SessionID = ps.SessionID
            LEFT JOIN CAMERA_DEVICE cd ON ps.GateCameraDeviceID = cd.CameraDeviceID
            WHERE ps.CustomerID = $1
            ORDER BY p.CreatedAt DESC
            LIMIT 10;
        `;
        const result = await pool.query(query, [customerId]);
        return result.rows;
    },

    /**
     * Extends the active parking session by specified hours.
     * @param {number|string} customerId
     * @param {number} hours
     */
    async extendParkingSession(customerId, hours) {
        // 1. Get current active session
        const findQuery = `
            SELECT 
                ps.sessionid,
                ps.entrytime,
                ps.sessiontimeout,
                ps.detectedplate,
                c.freeparkingduration
            FROM parking_session ps
            JOIN customer c ON ps.customerid = c.customerid
            WHERE ps.customerid = $1 AND ps.exittime IS NULL
            ORDER BY ps.entrytime DESC
            LIMIT 1;
        `;
        const findRes = await pool.query(findQuery, [customerId]);
        if (findRes.rows.length === 0) {
            return null;
        }

        const currentSession = findRes.rows[0];
        const now = new Date();

        // Calculate baseline expiry: if current sessiontimeout is in the future, extend from that; otherwise from now
        let currentExpiry;
        if (currentSession.sessiontimeout && new Date(currentSession.sessiontimeout) > now) {
            currentExpiry = new Date(currentSession.sessiontimeout);
        } else if (currentSession.entrytime) {
            const freeMins = currentSession.freeparkingduration || 30;
            const freeExpiry = new Date(new Date(currentSession.entrytime).getTime() + freeMins * 60 * 1000);
            currentExpiry = freeExpiry > now ? freeExpiry : now;
        } else {
            currentExpiry = now;
        }

        const newTimeout = new Date(currentExpiry.getTime() + hours * 3600 * 1000);

        const updateQuery = `
            UPDATE parking_session
            SET sessiontimeout = $1
            WHERE sessionid = $2
            RETURNING *;
        `;
        await pool.query(updateQuery, [newTimeout, currentSession.sessionid]);

        return this.getActiveSessionByCustomerId(customerId);
    },

    /**
     * Records a payment in the database.
     */
    async recordPayment(sessionId, amount, paymentMethod = 'card') {
        const query = `
            INSERT INTO payment (sessionid, amount, paymentmethod, status, createdat)
            VALUES ($1, $2, $3, 'completed', NOW())
            RETURNING *;
        `;
        const result = await pool.query(query, [sessionId, amount, paymentMethod]);
        return result.rows[0];
    }
};

module.exports = customerModel;