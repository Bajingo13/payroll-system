// ================== server.js ==================
require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Manila';

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');
const cloudStorage = require('./backend/cloud_storage');

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

  const port = Number(process.env.PORT || 3000);

  const defaults = [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
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

function getDbTimezone() {
  const timezone = String(process.env.DB_TIMEZONE || '+08:00').trim();
  return /^[-+]\d{2}:\d{2}$/.test(timezone) ? timezone : '+08:00';
}

function applyDbSessionTimezone(pool) {
  const timezone = getDbTimezone();

  pool.on('connection', (connection) => {
    connection.query(`SET time_zone = '${timezone}'`, (err) => {
      if (err) {
        console.error('FAILED TO SET DB SESSION TIMEZONE:', err.message);
      }
    });
  });
}

function buildLocalDbConfig() {
  return {
    host: process.env.LOCAL_DB_HOST || '127.0.0.1',
    port: Number(process.env.LOCAL_DB_PORT || 3306),
    user: process.env.LOCAL_DB_USER || 'root',
    password: process.env.LOCAL_DB_PASSWORD || '',
    database: process.env.LOCAL_DB_NAME || 'payroll_system',
    timezone: getDbTimezone(),
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000)
  };
}

function buildPrimaryDbConfig() {
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE,
    timezone: getDbTimezone(),
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 15000)
  };
}

function buildRailwayInternalFallbackConfig() {
  return {
    host: process.env.MYSQLHOST || 'mysql.railway.internal',
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'railway',
    timezone: getDbTimezone(),
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
    console.log(`OK > DATABASE CONNECTED USING ${label}`);
    console.log('OK > DB HOST:', config.host);
    console.log('OK > DB PORT:', config.port);
    console.log('OK > ACTIVE DATABASE:', rows[0].db);
    console.log('OK > SERVER TIME:', rows[0].server_time);
    return rows[0];
  } finally {
    conn.release();
  }
}

async function tryConnect(label, config) {
  const pool = mysql.createPool(config);
  applyDbSessionTimezone(pool);
  await testPool(pool, label, config);
  return pool;
}

function parseMysqlUrl(mysqlUrl) {
  try {
    const parsed = new URL(mysqlUrl);
    if (!process.env.DB_HOST)     process.env.DB_HOST     = parsed.hostname;
    if (!process.env.DB_PORT)     process.env.DB_PORT     = parsed.port || '3306';
    if (!process.env.DB_USER)     process.env.DB_USER     = decodeURIComponent(parsed.username);
    if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
    if (!process.env.DB_NAME)     process.env.DB_NAME     = parsed.pathname.replace(/^\//, '');
    console.log('OK > Parsed MYSQL_URL into DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME');
  } catch (err) {
    console.error('FAILED TO PARSE MYSQL_URL:', err.message);
  }
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
      console.error('LOCAL MYSQL CONNECTION FAILED FULL ERROR:', localErr);
    }

    // 2) If local fails, try Railway public DB from local machine
    const primaryConfig = buildPrimaryDbConfig();
    try {
      const primaryPool = await tryConnect('RAILWAY PUBLIC DB FROM LOCAL', primaryConfig);
      return { pool: primaryPool, dbMode: 'railway-public-from-local' };
    } catch (primaryErr) {
      console.error('RAILWAY PUBLIC DB FROM LOCAL FAILED FULL ERROR:', primaryErr);
      throw primaryErr;
    }
  }

  // Running on Railway
  const primaryConfig = buildPrimaryDbConfig();
  try {
    const primaryPool = await tryConnect('PRIMARY CONFIG', primaryConfig);
    return { pool: primaryPool, dbMode: 'primary' };
  } catch (primaryErr) {
    console.error('PRIMARY DB CONNECTION FAILED FULL ERROR:', primaryErr);
  }

  const fallbackConfig = buildRailwayInternalFallbackConfig();
  try {
    const fallbackPool = await tryConnect('RAILWAY INTERNAL FALLBACK', fallbackConfig);
    return { pool: fallbackPool, dbMode: 'railway-internal-fallback' };
  } catch (fallbackErr) {
    console.error('RAILWAY INTERNAL FALLBACK FAILED FULL ERROR:', fallbackErr);
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

    if (isRailwayAppOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Session middleware is initialized after the database connects so sessions
// can be persisted in MySQL instead of process memory.
let sessionMiddleware;

// ----------- AUTH MIDDLEWARE -----------
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

// ----------- STATIC ASSETS -----------
const reactDistPath = path.join(__dirname, 'frontend-react', 'dist');
const reactIndexPath = path.join(reactDistPath, 'index.html');
const reactFrontendSetting = String(process.env.USE_REACT_FRONTEND || 'auto').trim().toLowerCase();
const useReactFrontend =
  fs.existsSync(reactIndexPath) &&
  reactFrontendSetting !== 'false';

const legacyReactRedirects = {
  '/login/login.html': '/login',
  '/dashboard/dashboard.html': '/dashboard',
  '/dashboard/hr_dashboard.html': '/dashboard',
  '/dashboard/employee_dashboard.html': '/dashboard',
  '/dashboard/employee_attendance.html': '/employee-attendance',
  '/dashboard/admin_leave_management.html': '/leave-management',
  '/dashboard/employee_leave_management.html': '/employee-leave-request',
  '/dashboard/admin_overtime_management.html': '/overtime-management',
  '/dashboard/employee_overtime_management.html': '/employee-overtime-request',
  '/dashboard/employee_management.html': '/employee-management',
  '/dashboard/employee_payroll_information.html': '/employee-payroll-information',
  '/dashboard/employee_profile_edit.html': '/personal-management',
  '/dashboard/employee_schedule.html': '/employee-schedule',
  '/dashboard/payroll_computation.html': '/payroll-computation',
  '/dashboard/auditing.html': '/auditing',
  '/dashboard/payroll_journal.html': '/reports/payroll-journal',
  '/dashboard/gross_pay.html': '/reports/gross-pay',
  '/dashboard/net_pay.html': '/reports/net-pay',
  '/dashboard/payslip.html': '/reports/payslip',
  '/dashboard/payslip_print.html': '/reports/payslip',
  '/dashboard/reconciliation_details.html': '/reports/reconciliation-details',
  '/dashboard/utilities.html': '/utilities',
  '/dashboard/utilities/system_settings.html': '/utilities',
  '/dashboard/utilities/list_manager.html': '/utilities',
  '/dashboard/utilities/employee_benefits.html': '/utilities',
  '/dashboard/employee_documents.html': '/employee-documents',
  '/dashboard/organization_setup.html': '/organization-setup',
  '/dashboard/loan_deduction_management.html': '/loan-deduction-management',
  '/dashboard/government_reports.html': '/government-reports',
  '/dashboard/leave_calendar.html': '/leave-calendar',
  '/dashboard/performance_management.html': '/performance-management',
  '/dashboard/report_builder.html': '/report-builder',
  '/dashboard/security_backup.html': '/security-backup',
  '/dashboard/analytics_dashboard.html': '/analytics-dashboard',
  '/dashboard/year_end_payroll.html': '/year-end-payroll'
};

if (fs.existsSync(reactDistPath)) {
  app.use('/assets', express.static(path.join(reactDistPath, 'assets')));
}

app.use('/uploads', (req, res, next) => {
  if (!sessionMiddleware) return res.status(503).send('Server is starting.');
  return sessionMiddleware(req, res, () => {
    if (!req.session?.user?.user_id) return res.status(401).send('Authentication required.');
    return next();
  });
}, express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', (_req, res) => {
  res.status(404).send('Uploaded file not found.');
});

async function serveCloudFileRef(ref, res) {
  if (!cloudStorage.isCloudRef(ref)) {
    return res.status(404).send('File not found.');
  }

  try {
    return await cloudStorage.sendObjectToResponse(ref, res);
  } catch (err) {
    console.error('Cloud file serve error:', err.message);
    return res.status(500).send('Error serving file.');
  }
}

app.get('/api/cloud-file', (req, res) => {
  if (!sessionMiddleware) return res.status(503).json({ success: false, message: 'Server is starting.' });
  return sessionMiddleware(req, res, () => {
    if (!req.session?.user?.user_id) return res.status(401).json({ success: false, message: 'Authentication required.' });
    return serveCloudFileRef(String(req.query.ref || '').trim(), res);
  });
});

app.get('/api/cloud-file/:ref', (req, res) => {
  if (!sessionMiddleware) return res.status(503).json({ success: false, message: 'Server is starting.' });
  return sessionMiddleware(req, res, () => {
    if (!req.session?.user?.user_id) return res.status(401).json({ success: false, message: 'Authentication required.' });
    return serveCloudFileRef(String(req.params.ref || '').trim(), res);
  });
});

if (useReactFrontend) {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/assets/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  app.use(express.static(reactDistPath));

  Object.entries(legacyReactRedirects).forEach(([legacyPath, reactPath]) => {
    app.get(legacyPath, (req, res) => {
      res.redirect(302, reactPath);
    });
  });

  [
    '/',
    '/login',
    '/reset-password',
    '/dashboard',
    '/employee-dashboard',
    '/personal-management',
    '/employee-leave-request',
    '/employee-overtime-request',
    '/employee-payroll-information',
    '/employee-schedule',
    '/user-settings',
    '/profile-management',
    '/employee-management',
    '/schedule-management',
    '/employee-attendance',
    '/leave-management',
    '/overtime-management',
    '/payroll-computation',
    '/auditing',
    '/advanced-modules',
    '/employee-documents',
    '/organization-setup',
    '/year-end-payroll',
    '/loan-deduction-management',
    '/government-reports',
    '/leave-calendar',
    '/performance-management',
    '/report-builder',
    '/security-backup',
    '/analytics-dashboard',
    '/reports',
    '/reports/:reportType',
    '/utilities',
    '/system-config',
    '/company-settings',
    '/about-us',
    '/help',
    '/contacts'
  ].forEach((route) => {
    app.get(route, (req, res) => {
      res.sendFile(path.join(reactDistPath, 'index.html'));
    });
  });

  app.get(/^\/(employee-dashboard|personal-management|employee-leave-request|employee-overtime-request|employee-payroll-information|employee-schedule|schedule-management)\/?$/, (req, res) => {
    res.sendFile(path.join(reactDistPath, 'index.html'));
  });

  app.get(/^\/reports\/.+$/, (req, res) => {
    res.sendFile(path.join(reactDistPath, 'index.html'));
  });
}

app.use('/dashboard', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'frontend'), {
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}frontend${path.sep}dashboard${path.sep}`)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

function sendReactIndex(res) {
  if (fs.existsSync(reactIndexPath)) {
    return res.sendFile(reactIndexPath);
  }
  return res.status(404).send('React build not found. Please run npm run build.');
}

// ----------- HTML ROUTES -----------
if (useReactFrontend) {
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(reactIndexPath);
  });
} else {
  app.get('/advanced-modules', isAuthenticated, (req, res) => {
    res.redirect('/dashboard/employee_documents.html');
  });

  app.get('/', (req, res) => {
    res.redirect('/login/login.html');
  });

  app.get('/login', (req, res) => {
    res.redirect('/login/login.html');
  });

  app.get('/login/', (req, res) => {
    res.redirect('/login/login.html');
  });

  app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'dashboard', 'dashboard.html'));
  });
}

// ----------- START APP AFTER DB CONNECTS -----------
(async () => {
  try {
    console.log('RUNNING FILE:', __filename);
    console.log('RAILWAY DETECTED:', isRunningOnRailway());
    console.log('APP TIMEZONE:', process.env.TZ);
    console.log('DB SESSION TIMEZONE:', getDbTimezone());

    if (process.env.MYSQL_URL) {
      parseMysqlUrl(process.env.MYSQL_URL);
    }

    const { pool, dbMode } = await createWorkingPool();

    const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
    if (!sessionSecret && (process.env.NODE_ENV === 'production' || isRunningOnRailway())) {
      throw new Error('SESSION_SECRET is required in production.');
    }

    const MySqlSessionStore = require('./backend/session_store');
    const sessionStore = new MySqlSessionStore(pool);
    await sessionStore.init();
    sessionMiddleware = session({
      name: 'payroll.sid',
      secret: sessionSecret || 'local-development-only-change-me',
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: isRunningOnRailway(),
        httpOnly: true,
        sameSite: 'lax',
        maxAge: Number(process.env.SESSION_MAX_AGE_MS || 15 * 60 * 1000)
      }
    });
    app.use(sessionMiddleware);

    const { apiSecurity } = require('./backend/api_security');
    app.use('/api', apiSecurity);

    require('./backend/notifications')(app, pool);
    require('./backend/login')(app, pool);
    require('./backend/profile_sidebar')(app, pool);
    require('./backend/dashboard')(app, pool);
    require('./backend/ai_analytics')(app, pool);
    require('./backend/employee_profile_edit')(app, pool);
    require('./backend/employee_leave')(app, pool);
    require('./backend/overtime_requests')(app, pool);
    require('./backend/attendance_correction')(app, pool);
    require('./backend/employee_management')(app, pool);
    require('./backend/loan_deductions')(app, pool);
    require('./backend/payroll_computation')(app, pool);
    require('./backend/payroll_journal')(app, pool);
    require('./backend/government_reports')(app, pool);
    require('./backend/report_builder')(app, pool);
    require('./backend/audit_logs')(app, pool);
    require('./backend/utilities')(app, pool);
    require('./backend/employee_documents')(app, pool);
    require('./backend/company_calendar')(app, pool);
    require('./backend/thirteenth_month')(app, pool);
    require('./backend/year_end_payroll')(app, pool);
    require('./backend/system_config')(app, pool);
    require('./backend/organization_setup')(app, pool);
    require('./backend/payslip_email')(app, pool);

    app.get('/api/db-test', async (req, res) => {
      let conn;
      try {
        conn = await pool.getConnection();
        const [rows] = await conn.query('SELECT DATABASE() AS db, NOW() AS server_time, @@session.time_zone AS db_time_zone');

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

    const http = require('http');
    const { Server: SocketServer } = require('socket.io');
    const httpServer = http.createServer(app);

    const io = new SocketServer(httpServer, {
      cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
    });

    io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
    io.use((socket, next) => {
      const sessionUserId = Number(socket.request.session?.user?.user_id || 0);
      const requestedUserId = Number(socket.handshake.query.user_id || 0);
      if (!sessionUserId || sessionUserId !== requestedUserId) return next(new Error('Unauthorized'));
      return next();
    });

    // Each user joins their own room so we can push to specific users
    io.on('connection', (socket) => {
      const userId = socket.request.session.user.user_id;
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    // Expose io globally so notificationHelper can emit events
    global._io = io;

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`OK > Server running on port ${PORT}`);
      console.log(`OK > Active DB mode: ${dbMode}`);
      console.log('OK > db-test route registered');
      console.log('OK > Socket.io ready');
    });
  } catch (err) {
    console.error('❌ APP START FAILED:', err);
    process.exit(1);
  }
})();
