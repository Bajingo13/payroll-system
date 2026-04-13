// ================== server.js ==================

// ----------- IMPORTS AND INITIAL SETUP -----------
require('dotenv').config();

console.log('RUNNING FILE:', __filename);
console.log('DB_HOST FROM ENV:', process.env.DB_HOST);


const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const session = require('express-session');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true
}));

app.use(express.json());

// ----------- SESSION CONFIGURATION -----------
app.use(session({
  secret: process.env.SESSION_SECRET || 'payroll_secret_key',
  resave: false,
  saveUninitialized: true
}));

// ----------- AUTH MIDDLEWARE -----------
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.redirect('/login/login.html');
  }
}

// ----------- STATIC ASSETS -----------
app.use(express.static(path.join(__dirname, 'frontend')));

// ----------- HTML ROUTES -----------
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
);

// ✅ Protected dashboard route
app.get('/dashboard', isAuthenticated, (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard', 'Dashboard.html'))
);

// ----------- MYSQL CONNECTION POOL -----------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: process.env.DB_TIMEZONE || '+08:00',
  dateStrings: true,
});

// ----------- ROUTES -----------
require('./backend/login')(app, pool);
require('./backend/profile_sidebar')(app, pool);
require('./backend/dashboard')(app, pool);
require('./backend/employee_management')(app, pool);
require('./backend/payroll_computation')(app, pool);
require('./backend/payroll_journal')(app, pool);
require('./backend/audit_logs')(app, pool);
require('./backend/utilities')(app, pool);


//--------DB TESTING ONLY--------
app.get('/api/db-test', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT DATABASE() AS db, NOW() AS server_time');
    conn.release();

    res.json({
      success: true,
      message: 'Database connected',
      data: rows[0]
    });
  } catch (err) {
    console.error('DB TEST ERROR:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// ----------- START SERVER -----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ db-test route registered');
});