// ================== server.js ==================
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const session = require('express-session');
const cors = require('cors');

const app = express();

// ----------- HELPERS -----------
function isRunningOnRailway() {
  return (
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_PROJECT_ID ||
    !!process.env.RAILWAY_SERVICE_ID ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN
  );
}

function getAllowedOrigins() {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const defaults = [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000'
  ];

  const railwayOrigins = [];

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    railwayOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }

  return [...new Set([...defaults, ...configured, ...railwayOrigins])];
}

function isRailwayAppOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.hostname.endsWith('.up.railway.app');
  } catch {
    return false;
  }
}

function buildLocalDbConfig() {
  return {
    host: process.env.LOCAL_DB_HOST || '127.0.0.1',
    port: Number(process.env.LOCAL_DB_PORT || 3306),
    user: process.env.LOCAL_DB_USER || 'root',
    password: process.env.LOCAL_DB_PASSWORD || '',
    database: process.env.LOCAL_DB_NAME || 'payroll_system',
    timezone: process.env.DB_TIMEZONE || '+08:00',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000)
  };
}

function buildPrimaryDbConfig() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: process.env.DB_TIMEZONE || '+08:00',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 15000)
  };
}

function buildRailwayInternalFallbackConfig() {
  return {
    host: 'mysql.railway.internal',
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'railway',
    timezone: process.env.DB_TIMEZONE || '+08:00',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 15000)
  };
}

async function testPool(pool, label, config) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT DATABASE() AS db, NOW() AS server_time');
    console.log(`✅ DATABASE CONNECTED USING ${label}`);
    console.log('✅ DB HOST:', config.host);
    console.log('✅ DB PORT:', config.port);
    console.log('✅ ACTIVE DATABASE:', rows[0].db);
    console.log('✅ SERVER TIME:', rows[0].server_time);
    return rows[0];
  } finally {
    conn.release();
  }
}

async function tryConnect(label, config) {
  const pool = mysql.createPool(config);
  await testPool(pool, label, config);
  return pool;
}

async function createWorkingPool() {
  const onRailway = isRunningOnRailway();

  if (!onRailway) {
    // 1) Try local MySQL first
    const localConfig = buildLocalDbConfig();
    try {
      const localPool = await tryConnect('LOCAL MYSQL', localConfig);
      return { pool: localPool, dbMode: 'local-mysql' };
    } catch (localErr) {
      console.error('❌ LOCAL MYSQL CONNECTION FAILED:', localErr.message);
    }

    // 2) If local fails, try Railway public DB from local machine
    const primaryConfig = buildPrimaryDbConfig();
    try {
      const primaryPool = await tryConnect('RAILWAY PUBLIC DB FROM LOCAL', primaryConfig);
      return { pool: primaryPool, dbMode: 'railway-public-from-local' };
    } catch (primaryErr) {
      console.error('❌ RAILWAY PUBLIC DB FROM LOCAL FAILED:', primaryErr.message);
      throw primaryErr;
    }
  }

  // Running on Railway
  const primaryConfig = buildPrimaryDbConfig();
  try {
    const primaryPool = await tryConnect('PRIMARY CONFIG', primaryConfig);
    return { pool: primaryPool, dbMode: 'primary' };
  } catch (primaryErr) {
    console.error('❌ PRIMARY DB CONNECTION FAILED:', primaryErr.message);
  }

  const fallbackConfig = buildRailwayInternalFallbackConfig();
  try {
    const fallbackPool = await tryConnect('RAILWAY INTERNAL FALLBACK', fallbackConfig);
    return { pool: fallbackPool, dbMode: 'railway-internal-fallback' };
  } catch (fallbackErr) {
    console.error('❌ RAILWAY INTERNAL FALLBACK FAILED:', fallbackErr.message);
    throw fallbackErr;
  }
}

// ----------- MIDDLEWARE -----------
const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Automatically allow Railway app domains
    if (isRailwayAppOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// ----------- SESSION CONFIGURATION -----------
app.use(session({
  secret: process.env.SESSION_SECRET || 'payroll_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isRunningOnRailway(), // true on Railway, false locally
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ----------- AUTH MIDDLEWARE -----------
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login/login.html');
}

// ----------- STATIC ASSETS -----------
app.use(express.static(path.join(__dirname, 'frontend')));

// ----------- HTML ROUTES -----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard', 'dashboard.html'));
});

// ----------- START APP AFTER DB CONNECTS -----------
(async () => {
  try {
    console.log('RUNNING FILE:', __filename);
    console.log('RAILWAY DETECTED:', isRunningOnRailway());

    const { pool, dbMode } = await createWorkingPool();

    require('./backend/login')(app, pool);
    require('./backend/profile_sidebar')(app, pool);
    require('./backend/dashboard')(app, pool);
    require('./backend/employee_management')(app, pool);
    require('./backend/payroll_computation')(app, pool);
    require('./backend/payroll_journal')(app, pool);
    require('./backend/audit_logs')(app, pool);
    require('./backend/utilities')(app, pool);

    app.get('/api/db-test', async (req, res) => {
      let conn;
      try {
        conn = await pool.getConnection();
        const [rows] = await conn.query('SELECT DATABASE() AS db, NOW() AS server_time');

        res.json({
          success: true,
          mode: dbMode,
          message: 'Database connected',
          data: rows[0]
        });
      } catch (err) {
        console.error('DB TEST ERROR:', err);
        res.status(500).json({
          success: false,
          mode: dbMode,
          message: err.message
        });
      } finally {
        if (conn) conn.release();
      }
    });

    app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        app: 'payroll-system',
        mode: dbMode
      });
    });

    app.use((err, req, res, next) => {
      console.error('SERVER ERROR:', err.message);
      res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
      });
    });

    const PORT = Number(process.env.PORT || 3000);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`✅ Active DB mode: ${dbMode}`);
      console.log('✅ db-test route registered');
    });
  } catch (err) {
    console.error('❌ APP START FAILED:', err);
    process.exit(1);
  }
})();