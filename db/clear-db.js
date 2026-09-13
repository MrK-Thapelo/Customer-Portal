const path = require('path');
// Load env from parent directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('./db');

const clearCustomers = async () => {
    try {
        console.log('Clearing all customer data and related transactions...');
        
        // TRUNCATE with CASCADE removes data from CUSTOMER and all dependent tables (VEHICLE, SESSIONS, etc.)
        // RESTART IDENTITY resets the ID counter to 1
        await pool.query('TRUNCATE TABLE CUSTOMER RESTART IDENTITY CASCADE;');

        console.log('Success: Database reset for testing.');
        process.exit(0);
    } catch (err) {
        console.error('Error clearing database:');
        console.error(err.message);
        process.exit(1);
    }
};

clearCustomers();