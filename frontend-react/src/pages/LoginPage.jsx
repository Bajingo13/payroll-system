import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import astreaBlueLogo from '../assets/astreablue-logo.png';
import Modal from '../components/Modal.jsx';
import { AboutUsContent, ContactsContent, HelpContent } from '../components/InfoPopups.jsx';

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (role === 'employee') return 'employee';
  if (role === 'hr' || role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role === 'admin' || role.includes('admin')) return 'admin';
  return 'unknown';
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoModal, setInfoModal] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('');
    setMessageType('');
    setLoading(true);

    try {
      const user = await login(loginForm.username.trim(), loginForm.password);

      toast.success('Login successful!', {
        position: 'bottom-center',
        autoClose: 1500,
        hideProgressBar: true,
        closeButton: false,
        theme: 'colored'
      });

      setTimeout(() => {
        const role = normalizeRole(user.role);

        if (role === 'employee') {
          navigate('/employee-dashboard', { replace: true });
        } else if (role === 'hr') {
          navigate('/hr-dashboard', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      }, 1500);

    } catch (err) {
      setMessage(getApiMessage(err, 'Invalid username or password.'));
      setMessageType('error');
      setLoading(false);
    }
  }

  async function handlePasswordResetRequest(event) {
    event.preventDefault();
    setResetMessage('');
    setResetLoading(true);

    try {
      const { data } = await api.post('/password-reset/request', { username: resetUsername.trim() });
      setResetMessage(data.message || 'Password reset instructions will be sent to the email linked to that username.');
      setResetUsername('');
    } catch (err) {
      setResetMessage(getApiMessage(err, 'Unable to request password reset.'));
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="login-page">
      <header className="site-header">
        <Link className="site-logo" to="/login" aria-label="AstreaBlue Login">
          <img src={astreaBlueLogo} alt="AstreaBlue" />
          <span>Astreablue Intelligence Inc.</span>
        </Link>

        <nav className="site-nav">
          <button type="button" className="link-btn" onClick={() => setInfoModal('contacts')}>Contacts</button>
          <button type="button" className="link-btn" onClick={() => setInfoModal('about')}>About Us</button>
          <button type="button" className="link-btn" onClick={() => setInfoModal('help')}>Help</button>
        </nav>
      </header>

      <main className="login-shell">
        <section className="service-panel">
          <p className="service-kicker">HRIS & Payroll Services</p>
          <h1>Smarter workforce and payroll management.</h1>

          <p className="service-copy">
            Astreablue Intelligence Inc. helps teams manage employee records,
            attendance, payroll computation, payslips, audit logs, and HR
            operations from one secure system.
          </p>

          <div className="service-list">
            <article>
              <span>01</span>
              <div>
                <h2>Human Resource Information System</h2>
                <p>
                  Keep employee profiles, schedules, leave records, and
                  employment details organized.
                </p>
              </div>
            </article>

            <article>
              <span>02</span>
              <div>
                <h2>Payroll Processing</h2>
                <p>
                  Compute gross pay, deductions, net pay, payroll journals, and
                  employee payslips.
                </p>
              </div>
            </article>

            <article>
              <span>03</span>
              <div>
                <h2>Attendance and Audit Monitoring</h2>
                <p>
                  Track time logs, payroll activity, and system actions with
                  reliable audit history.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-brand">
            <p className="auth-kicker">Welcome to</p>
            <h2>Astreablue Intelligence Inc.</h2>
            <p>Securely manage payroll, attendance, and employee records.</p>
          </div>

          <form className="auth-form" onSubmit={handleLogin}>
            <input
              value={loginForm.username}
              onChange={(e) =>
                setLoginForm({ ...loginForm, username: e.target.value })
              }
              placeholder="Username"
              required
            />

            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                placeholder="Password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>

            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>

            <button
              type="button"
              className="forgot-password-btn"
              onClick={() => {
                setResetOpen(true);
                setResetMessage('');
              }}
            >
              Forgot password?
            </button>
          </form>

          {message && (
            <p className={`form-message ${messageType}`}>
              {message}
            </p>
          )}
        </section>
      </main>

      <Modal
        open={Boolean(infoModal)}
        title={infoModal === 'contacts' ? 'Contacts' : infoModal === 'help' ? 'Help' : 'About Us'}
        onClose={() => setInfoModal('')}
      >
        {infoModal === 'contacts' ? <ContactsContent /> : null}
        {infoModal === 'help' ? <HelpContent /> : null}
        {infoModal === 'about' ? <AboutUsContent /> : null}
      </Modal>

      <Modal
        open={resetOpen}
        title="Reset Password"
        onClose={() => {
          setResetOpen(false);
          setResetMessage('');
        }}
      >
        <form className="modal-form" onSubmit={handlePasswordResetRequest}>
          <label>
            Username
            <input
              type="text"
              value={resetUsername}
              onChange={(event) => setResetUsername(event.target.value)}
              placeholder="Enter your username"
              required
            />
          </label>
          <button className="primary-btn" type="submit" disabled={resetLoading}>
            {resetLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
          {resetMessage && <p className="form-message">{resetMessage}</p>}
        </form>
      </Modal>
    </div>
  );
}
