const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('./db');

async function activateSession() {
    try {
        console.log('Connecting to database...');
        
        // 1. Ensure columns exist
        await pool.query(`
            ALTER TABLE customer ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
            ALTER TABLE parking_session ADD COLUMN IF NOT EXISTS sessiontimeout TIMESTAMP;
            ALTER TABLE parking_session ADD COLUMN IF NOT EXISTS exitauthorization BOOLEAN DEFAULT FALSE;
        `);
        console.log('Schema verified/updated with required columns.');

        // 2. Find customer Collen (or ID 1)
        const custRes = await pool.query("SELECT * FROM customer WHERE carregistration = 'SNB 123 GP' OR customerid = 1 LIMIT 1;");
        if (custRes.rows.length === 0) {
            console.error('Customer not found!');
            process.exit(1);
        }
        const customer = custRes.rows[0];
        console.log(`Found customer: ID=${customer.customerid}, Name=${customer.firstname} ${customer.lastname}, Plate=${customer.carregistration}`);

        // 3. Ensure camera device exists
        let camRes = await pool.query('SELECT cameradeviceid FROM camera_device LIMIT 1;');
        let camId;
        if (camRes.rows.length === 0) {
            const insCam = await pool.query("INSERT INTO camera_device (location) VALUES ('Facility Gate A') RETURNING cameradeviceid;");
            camId = insCam.rows[0].cameradeviceid;
            console.log('Created camera_device:', camId);
        } else {
            camId = camRes.rows[0].cameradeviceid;
            console.log('Using camera_device:', camId);
        }

        // 4. Ensure vehicle exists for customer
        let vehRes = await pool.query('SELECT vehicleid FROM vehicle WHERE customerid = $1 LIMIT 1;', [customer.customerid]);
        let vehId;
        if (vehRes.rows.length === 0) {
            const insVeh = await pool.query(
                "INSERT INTO vehicle (customerid, licenseplate, make, model, color) VALUES ($1, $2, 'Toyota', 'Corolla', 'White') RETURNING vehicleid;",
                [customer.customerid, customer.carregistration || 'SNB 123 GP']
            );
            vehId = insVeh.rows[0].vehicleid;
            console.log('Created vehicle record:', vehId);
        } else {
            vehId = vehRes.rows[0].vehicleid;
            console.log('Using vehicle record:', vehId);
        }

        // 5. Close any existing active sessions first to avoid duplicates
        await pool.query('UPDATE parking_session SET exittime = NOW() WHERE customerid = $1 AND exittime IS NULL;', [customer.customerid]);

        // 6. Create a fresh active parking session entered 5 minutes ago with 25 minutes left of free allowance
        const sessionRes = await pool.query(`
            INSERT INTO parking_session (
                customerid,
                vehicleid,
                gatecameradeviceid,
                entrytime,
                exittime,
                detectedplate,
                confidencescore,
                sessiontimeout,
                exitauthorization
            ) VALUES (
                $1,
                $2,
                $3,
                NOW() - INTERVAL '5 minutes',
                NULL,
                $4,
                99.5,
                NOW() + INTERVAL '25 minutes',
                FALSE
            ) RETURNING *;
        `, [customer.customerid, vehId, camId, customer.carregistration || 'SNB 123 GP']);

        console.log('SUCCESS: Active parking session created!');
        console.log(sessionRes.rows[0]);

    } catch (err) {
        console.error('Error activating session:', err);
    } finally {
        await pool.end();
    }
}

activateSession();
