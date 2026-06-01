import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

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

  const [mode, setMode] = useState('login');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    username: '',
    password: '',
    confirm: '',
    role: ''
  });

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

  async function handleRegister(event) {
    event.preventDefault();
    setMessage('');
    setMessageType('');

    if (registerForm.password !== registerForm.confirm) {
      setMessage('Passwords do not match.');
      setMessageType('error');
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/register', {
        username: registerForm.username.trim(),
        password: registerForm.password,
        full_name: registerForm.full_name.trim(),
        role: registerForm.role
      });

      if (!data.success) throw new Error(data.message || 'Registration failed.');

      setRegisterForm({
        full_name: '',
        username: '',
        password: '',
        confirm: '',
        role: ''
      });

      setMode('login');
      setMessage('Registration successful. You can now log in.');
      setMessageType('success');
    } catch (err) {
      setMessage(getApiMessage(err, 'Registration failed.'));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <header className="site-header">
        <a className="site-logo" href="/login">
          Astreablue Intelligence Inc.
        </a>

        <nav className="site-nav">
          <a href="#contact">Contacts</a>
          <a href="#about">About Us</a>
          <a href="#help">Help</a>
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

          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'active' : ''}
              type="button"
              onClick={() => {
                setMode('login');
                setMessage('');
                setMessageType('');
              }}
            >
              Login
            </button>

            <button
              className={mode === 'register' ? 'active' : ''}
              type="button"
              onClick={() => {
                setMode('register');
                setMessage('');
                setMessageType('');
              }}
            >
              Register
            </button>
          </div>

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <input
                value={loginForm.username}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, username: e.target.value })
                }
                placeholder="Username"
                required
              />

              <input
                type="password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                placeholder="Password"
                required
              />

              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              <input
                value={registerForm.full_name}
                onChange={(e) =>
                  setRegisterForm({
                    ...registerForm,
                    full_name: e.target.value
                  })
                }
                placeholder="Full Name"
                required
              />

              <input
                value={registerForm.username}
                onChange={(e) =>
                  setRegisterForm({
                    ...registerForm,
                    username: e.target.value
                  })
                }
                placeholder="Username"
                required
              />

              <input
                type="password"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm({
                    ...registerForm,
                    password: e.target.value
                  })
                }
                placeholder="Password"
                required
              />

              <input
                type="password"
                value={registerForm.confirm}
                onChange={(e) =>
                  setRegisterForm({
                    ...registerForm,
                    confirm: e.target.value
                  })
                }
                placeholder="Confirm Password"
                required
              />

              <select
                value={registerForm.role}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, role: e.target.value })
                }
                required
              >
                <option value="">Select Role</option>
                <option value="Employee">Employee</option>
                <option value="HR">HR</option>
                <option value="Admin">Admin</option>
              </select>

              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Register'}
              </button>
            </form>
          )}

          {message && (
            <p className={`form-message ${messageType}`}>
              {message}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
