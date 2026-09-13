const express = require('express');
const router = express.Router();
const pool = require('../db'); // Assuming pool is exported from your db config

// POST /api/payments/process
router.post('/process', async (req, res) => {
    const { amount, sessionID, paymentMethod } = req.body;

    try {
        // 1. Record the payment
        const paymentResult = await pool.query(
            'INSERT INTO PAYMENT (SessionID, Amount, PaymentMethod, CreatedAt, Status) VALUES ($1, $2, $3, NOW(), $4) RETURNING PaymentID',
            [sessionID, amount, paymentMethod || 'card', 'completed']
        );

        const paymentID = paymentResult.rows[0].paymentid;

        // 2. Generate a receipt
        await pool.query(
            'INSERT INTO RECEIPT (PaymentID) VALUES ($1)',
            [paymentID]
        );

        // 3. Authorize exit for the parking session
        await pool.query(
            'UPDATE PARKING_SESSION SET ExitAuthorization = TRUE WHERE SessionID = $1',
            [sessionID]
        );

        res.status(200).json({ 
            success: true, 
            message: 'Payment processed successfully',
            paymentID: paymentID
        });

    } catch (err) {
        console.error('Payment Error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;