// ================== server.js ==================

// ----------- IMPORTS AND INITIAL SETUP -----------
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());

// ----------- SESSION CONFIGURATION -----------
app.use(session({
  secret: 'payroll_secret_key',
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
  host: 'mysql.railway.internal',
  user: 'root',
  password: 'pyKVWdEYXvZuFEjzLMbZElLotRmusrOV',
  database: 'payroll_system',
  timezone: '+08:00',  // PH timezone
  dateStrings: true,   // Return DATE/DATETIME as strings
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

// ----------- START SERVER -----------
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));