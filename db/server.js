const path = require('path');
// Load environment variables from .env file located in the parent directory
const result = require('dotenv').config({ path: path.join(__dirname, '../.env') });

if (result.error) {
    console.error('Warning: .env file not found or could not be loaded');
}

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const host = process.env.SERVER_HOST || 'localhost'; // Use the IP address from .env or default to localhost

// Database connection (for testing, actual connection will be in config/db.js)
const pool = require('./db');

// Middleware
app.use(express.json()); // For parsing application/json

// Enable CORS for cross-origin frontend requests (e.g. Live Server on port 5500)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Root URL directly loads the authentication/login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../HTML/login.html'));
});

// Redirect any legacy index.html requests to root
app.get('/index.html', (req, res) => {
    res.redirect('/');
});

app.use(express.static(path.join(__dirname, '../HTML'))); // Serve HTML files from the HTML folder
app.use(express.static(__dirname)); // Serve client-side JS from the db folder
app.use('/css', express.static(path.join(__dirname, '../css'))); // Serve CSS files

// Routes
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const qrRoutes = require('./qrRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/customer', userRoutes); // Supports /api/customer/profile and /api/customer/dashboard
app.use('/api/dashboard', userRoutes); // Supports /api/dashboard directly
app.use('/api/qr', qrRoutes);

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server successfully started!`);
    console.log(` - Local access:   http://localhost:${port}`);
    console.log(` - Loopback:       http://127.0.0.1:${port}`);
});