const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { hashPassword, comparePassword } = require('./authUtils');
const customerModel = require('./customerModel'); // Import customerModel

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = require('./db');
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * DATA RETRIEVAL
 * GET /api/customers
 * Fetches all customers from the database
 */
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT customerid, firstname, lastname, mobilenumber, carregistration, role FROM customer ORDER BY customerid ASC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Retrieval error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DATA INSERTION
 * POST /api/customers
 * Adds a new customer to the database
 */
app.post('/api/customers', async (req, res) => {
    const { firstName, lastName, email, mobileNumber, carRegistration, password, role } = req.body;

    if (!password || !firstName || !lastName || !mobileNumber) {
        return res.status(400).json({ error: 'Required fields are missing' });
    }

    const sanitizedCarReg = carRegistration ? carRegistration.trim().toUpperCase() : null;
    let sanitizedMobile = mobileNumber.replace(/[^\d]/g, ''); // Remove all non-digits
    if (sanitizedMobile.startsWith('0') && sanitizedMobile.length === 10) { // e.g., 0721234567
        sanitizedMobile = '+27' + sanitizedMobile.substring(1);
    } else if (sanitizedMobile.length === 9 && !sanitizedMobile.startsWith('+')) { // e.g., 721234567
        sanitizedMobile = '+27' + sanitizedMobile;
    }

    try {
        // Check for duplicate mobile number
        const existingMobile = await customerModel.findCustomerByMobile(sanitizedMobile);
        if (existingMobile) {
            return res.status(400).json({ error: 'Mobile number is already registered.' });
        }

        // Check for duplicate car registration if provided
        if (sanitizedCarReg) {
            const existingCar = await customerModel.findCustomerByCarReg(sanitizedCarReg);
            if (existingCar) {
                return res.status(400).json({ error: 'Car registration already in use' });
            }
        }

        const hashedPassword = await hashPassword(password);
        const newCustomer = await customerModel.createCustomer(
            firstName.trim(), 
            lastName.trim(), 
            email,
            sanitizedMobile,
            sanitizedCarReg,
            hashedPassword,
            null, 
            role || 'customer'
        );

        res.status(201).json(newCustomer);
    } catch (err) {
        console.error('Insertion error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * USER LOGIN
 * POST /api/login
 * Validates credentials and returns a JWT token
 */
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        let customer = null;

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Identifier and password are required.' });
        }

        // Try to find customer by Car Registration first
        const carRegIdentifier = identifier.trim().toUpperCase();
        customer = await customerModel.findCustomerByCarReg(carRegIdentifier);

        if (!customer) {
            // If not found by car registration, try by Mobile Number
            const mobileIdentifier = identifier.replace(/[^\d+]/g, '');
            customer = await customerModel.findCustomerByMobile(mobileIdentifier);
        }

        if (!customer || !(await comparePassword(password, customer.passwordhash))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // 3. Generate JWT (using secret from .env)
        const token = jwt.sign(
            { customerId: customer.customerid, role: customer.role }, // Email removed from JWT payload
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({ message: 'Login successful', token, role: customer.role });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://${process.env.SERVER_HOST || 'localhost'}:${PORT}`);
});