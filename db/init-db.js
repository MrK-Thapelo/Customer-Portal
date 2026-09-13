const fs = require('fs');
const path = require('path');
// Load env from parent directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('./db');

const setupDatabase = async () => {
    try {
        console.log('Reading schema.sql...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema into database:', process.env.DB_NAME);
        await pool.query(sql);

        console.log('Database schema applied successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error initializing database:');
        console.error(err.message);
        if (err.message.includes('does not exist')) {
            console.error('\nTIP: Make sure you have created the database "AI_PMS_DB" in pgAdmin first.');
        }
        process.exit(1);
    }
};

setupDatabase();