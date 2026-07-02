import { lazy, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import astreaBlueLogo from '../assets/astreablue-logo.png';
import Modal from '../components/Modal.jsx';
import ToastPanel from '../components/ToastPanel.jsx';
import { AboutUsContent, ContactsContent, HelpContent } from '../components/InfoPopups.jsx';
import PasswordToggleIcon from '../components/PasswordToggleIcon.jsx';
import AppIcon from '../components/AppIcon.jsx';

const PrivacyPolicyPage = lazy(() => import('./PrivacyPolicyPage.jsx'));

const POST_LOGIN_REDIRECT_MS = 500;
const OTP_EXPIRY_MINUTES = 5;

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim().toLowerCase();
  if (role === 'employee') return 'employee';
  if (role.includes('hr') || role.includes('human resource')) return 'hr';
  if (role.includes('admin')) return 'admin';
  return 'unknown';
}

// ── OTP digit input ───────────────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled }) {
  const inputs = useRef([]);
  const digits = (value + '      ').slice(0, 6).split('');

  function handleKey(i, e) {
    if (e.key === 'Backspace') {
      if (!digits[i].trim() && i > 0) inputs.current[i - 1]?.focus();
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) inputs.current[i + 1]?.focus();
  }

  function handleChange(i, e) {
    const digit = String(e.target.value || '').replace(/\D/g, '').slice(-1);
    const next = (value + '      ').split('');
    next[i] = digit || ' ';
    onChange(next.join('').trim().slice(0, 6));
    if (digit && i < 5) inputs.current[i + 1]?.focus();
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted); inputs.current[Math.min(pasted.length, 5)]?.focus(); }
    e.preventDefault();
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i].trim()}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onChange={e => handleChange(i, e)}
          disabled={disabled}
          style={{
            width: 44, height: 52, textAlign: 'center', fontSize: '1.4rem', fontWeight: 700,
            border: '2px solid var(--border,#d1d5db)', borderRadius: 8,
            outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary,#2563eb)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border,#d1d5db)'; }}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function LoginPage() {
  const { login, setAuthUser } = useAuth();
  const navigate  = useNavigate();

  // Steps: 'credentials' | 'otp'
  const [step,        setStep]        = useState('credentials');
  const [loading,     setLoading]     = useState(false);
  const [infoModal,   setInfoModal]   = useState('');
  const [showPw,      setShowPw]      = useState(false);

  // Credentials step
  const [loginForm,     setLoginForm]     = useState({ username: '', password: '' });
  const [credError,     setCredError]     = useState('');
  const [attemptsLeft,  setAttemptsLeft]  = useState(null);

  // OTP step
  const [otpUserId,   setOtpUserId]   = useState(null);
  const [otp,         setOtp]         = useState('');
  const [otpError,    setOtpError]    = useState('');
  const [otpInfo,     setOtpInfo]     = useState({ channels: [], maskedEmail: null, maskedPhone: null });
  const [otpLeft,     setOtpLeft]     = useState(null);
  const [resending,   setResending]   = useState(false);
  const [isTempPw,    setIsTempPw]    = useState(false);

  // Locked modal
  const [lockedModal,       setLockedModal]       = useState(false);
  const [unlockView,        setUnlockView]        = useState('info'); // 'info' | 'request' | 'success'
  const [unlockReason,      setUnlockReason]      = useState('');
  const [unlockLoading,     setUnlockLoading]     = useState(false);
  const [unlockMessage,     setUnlockMessage]     = useState('');

  // Password reset modal
  const [resetOpen,    setResetOpen]    = useState(false);
  const [resetUser,    setResetUser]    = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [privacyOpen,  setPrivacyOpen]  = useState(false);

  // ── Step 1: submit credentials ──────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setCredError('');
    setAttemptsLeft(null);
    setLoading(true);

    try {
      const { data } = await api.post('/login', {
        username: loginForm.username.trim(),
        password: loginForm.password,
      });

      if (!data.success) {
        setCredError(data.message || 'Login failed.');
        if (data.locked) setLockedModal(true);
        if (data.attemptsLeft !== undefined) setAttemptsLeft(data.attemptsLeft);
        return;
      }

      // 2FA not needed (no channel configured) — direct login
      if (!data.requiresOtp) {
        setAuthUser({ user_id: data.user_id, full_name: data.full_name, role: data.role });
        const isTempPwDirect = Boolean(data.isTempPassword);
        toast.success(
          isTempPwDirect ? 'Logged in with temporary password. Please change it now.' : 'Login successful!',
          { position: 'bottom-center', autoClose: 2500, hideProgressBar: true, closeButton: false, theme: 'colored' }
        );
        setTimeout(() => navigate(isTempPwDirect ? '/account-settings' : '/dashboard', { replace: true, state: isTempPwDirect ? { forcedPasswordChange: true } : undefined }), POST_LOGIN_REDIRECT_MS);
        return;
      }

      // Move to OTP step
      setOtpUserId(data.userId);
      setOtpInfo({ channels: data.channels || [], maskedEmail: data.maskedEmail, maskedPhone: data.maskedPhone });
      setIsTempPw(Boolean(data.isTempPassword));
      setStep('otp');
      toast.info(data.message, { position: 'bottom-center', autoClose: 4000 });

    } catch (err) {
      const msg = getApiMessage(err, 'Invalid username or password.');
      setCredError(msg);
      const resp = err?.response?.data;
      if (resp?.locked) setLockedModal(true);
      if (resp?.attemptsLeft !== undefined) setAttemptsLeft(resp.attemptsLeft);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  async function handleOtpVerify(e) {
    e.preventDefault();
    if (otp.length < 6) { setOtpError('Please enter the complete 6-digit code.'); return; }
    setOtpError('');
    setLoading(true);

    try {
      const { data } = await api.post('/login/verify-otp', { userId: otpUserId, otp });

      if (!data.success) {
        setOtpError(data.message || 'Incorrect code.');
        if (data.attemptsLeft !== undefined) setOtpLeft(data.attemptsLeft);
        if (data.expired) { setStep('credentials'); setOtp(''); setOtpError(''); toast.warning('Session expired. Please log in again.'); }
        return;
      }

      // OTP verified — session established on server. Set auth context from
      // the verify-otp response directly (avoids a second /login that would
      // trigger another OTP challenge and clear the role/user_id).
      setAuthUser({ user_id: data.user_id, full_name: data.full_name, role: data.role });
      toast.success(isTempPw ? 'Logged in with temporary password. Please change it now.' : 'Login successful!', {
        position: 'bottom-center', autoClose: 2500, hideProgressBar: true, closeButton: false, theme: 'colored'
      });
      setTimeout(() => navigate(isTempPw ? '/account-settings' : '/dashboard', { replace: true, state: isTempPw ? { forcedPasswordChange: true } : undefined }), POST_LOGIN_REDIRECT_MS);

    } catch (err) {
      const resp = err?.response?.data;
      setOtpError(getApiMessage(err, 'Incorrect code.'));
      if (resp?.attemptsLeft !== undefined) setOtpLeft(resp.attemptsLeft);
      if (resp?.expired) { setStep('credentials'); setOtp(''); toast.warning('Session expired. Please log in again.'); }
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  async function handleResend() {
    if (resending) return;
    setResending(true);
    setOtpError('');
    try {
      const { data } = await api.post('/login/resend-otp', { userId: otpUserId });
      toast.info(data.message || 'New code sent.', { position: 'bottom-center', autoClose: 3000 });
      setOtp('');
      setOtpLeft(null);
    } catch (err) {
      toast.error(getApiMessage(err, 'Could not resend code.'));
    } finally {
      setResending(false);
    }
  }

  // ── Password reset ─────────────────────────────────────────────────────────
  async function handleResetRequest(e) {
    e.preventDefault();
    setResetMessage('');
    setResetLoading(true);
    try {
      const { data } = await api.post('/password-reset/request', { username: resetUser.trim() });
      setResetMessage(data.message || 'Reset instructions sent.');
      setResetUser('');
    } catch (err) {
      setResetMessage(getApiMessage(err, 'Unable to send reset link.'));
    } finally {
      setResetLoading(false);
    }
  }

  // ── Request unlock ─────────────────────────────────────────────────────────
  async function handleUnlockRequest(e) {
    e.preventDefault();
    setUnlockMessage('');
    setUnlockLoading(true);
    try {
      const { data } = await api.post('/login/request-unlock', {
        username: loginForm.username.trim(),
        reason: unlockReason.trim(),
      });
      setUnlockView('success');
      setUnlockMessage(data.message || 'Request sent.');
    } catch (err) {
      setUnlockMessage(getApiMessage(err, 'Unable to send request.'));
    } finally {
      setUnlockLoading(false);
    }
  }

  function closeLockedModal() {
    setLockedModal(false);
    setUnlockView('info');
    setUnlockReason('');
    setUnlockMessage('');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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
        {/* Left panel */}
        <section className="service-panel">
          <p className="service-kicker">HRIS & Payroll Services</p>
          <h1>Smarter workforce and payroll management.</h1>
          <p className="service-copy">
            Astreablue Intelligence Inc. helps teams manage employee records,
            attendance, payroll computation, payslips, audit logs, and HR
            operations from one secure system.
          </p>
          <div className="service-list">
            <article><span>01</span><div><h2>Human Resource Information System</h2><p>Keep employee profiles, schedules, leave records, and employment details organized.</p></div></article>
            <article><span>02</span><div><h2>Payroll Processing</h2><p>Automate gross pay, statutory deductions, withholding tax, other deductions, net pay, and 13th month computation.</p></div></article>
            <article><span>03</span><div><h2>Attendance and Audit Monitoring</h2><p>Track time logs, payroll activity, and system actions with reliable audit history.</p></div></article>
          </div>
        </section>

        {/* Right card */}
        <section className="auth-card">
          <div className="auth-brand">
            <p className="auth-kicker">Welcome to</p>
            <h2>Astreablue Intelligence Inc.</h2>
            <p>Securely manage payroll, attendance, and employee records.</p>
          </div>

          {/* ── Step 1: Credentials ── */}
          {step === 'credentials' && (
            <form className="auth-form" onSubmit={handleLogin}>
              <input
                value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Username"
                autoComplete="username"
                required
              />

              <div className="password-field">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <PasswordToggleIcon visible={showPw} />
                </button>
              </div>

              {attemptsLeft !== null && (
                <p style={{ fontSize: '0.82rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '0.4rem 0.65rem', margin: 0 }}>
                  <AppIcon name="alert" size={14} /> {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before your account is locked.
                </p>
              )}

              {credError && !lockedModal && (
                <p className="form-message error">{credError}</p>
              )}

              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Login'}
              </button>

              <button type="button" className="forgot-password-btn" onClick={() => { setResetOpen(true); setResetMessage(''); }}>
                Forgot password?
              </button>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <form className="auth-form" onSubmit={handleOtpVerify}>
              <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                <div style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#1e40af', alignItems: 'center', justifyContent: 'center', marginBottom: '0.25rem' }}><AppIcon name="lock" size={22} /></div>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>Verification Required</h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--muted,#6b7280)', margin: 0 }}>
                  A 6-digit code was sent to{' '}
                  {[otpInfo.maskedEmail, otpInfo.maskedPhone].filter(Boolean).join(' and ')}.
                  <br />Enter it below. Expires in {OTP_EXPIRY_MINUTES} minutes.
                </p>
              </div>

              <OtpInput value={otp} onChange={setOtp} disabled={loading} />

              {otpLeft !== null && (
                <p style={{ fontSize: '0.82rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '0.4rem 0.65rem', margin: 0, textAlign: 'center' }}>
                  <AppIcon name="alert" size={14} /> {otpLeft} attempt{otpLeft !== 1 ? 's' : ''} remaining.
                </p>
              )}

              {otpError && <p className="form-message error" style={{ textAlign: 'center' }}>{otpError}</p>}

              <button className="primary-btn" type="submit" disabled={loading || otp.length < 6}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem' }}>
                <button
                  type="button"
                  className="forgot-password-btn"
                  onClick={() => { setStep('credentials'); setOtp(''); setCredError(''); setAttemptsLeft(null); }}
                >
                  ← Back to login
                </button>
                <button
                  type="button"
                  className="forgot-password-btn"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? 'Sending...' : 'Resend code'}
                </button>
              </div>
            </form>
          )}

        </section>
      </main>

      <footer className="login-privacy-note">
        <span>© 2026 Astreablue Intelligence Inc.</span>
        <span aria-hidden="true">•</span>
        <button type="button" onClick={() => setPrivacyOpen(true)}>Privacy Policy</button>
      </footer>

      <Modal
        open={privacyOpen}
        title="Privacy Policy"
        className="privacy-policy-modal"
        onClose={() => setPrivacyOpen(false)}
      >
        <PrivacyPolicyPage />
      </Modal>

      {/* ── Locked account modal ── */}
      <Modal
        open={lockedModal}
        title={unlockView === 'request' ? 'Request Account Unlock' : unlockView === 'success' ? 'Request Sent' : 'Account Locked'}
        onClose={closeLockedModal}
      >
        {/* ── Info view ── */}
        {unlockView === 'info' && (
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{ display: 'inline-flex', width: 58, height: 58, borderRadius: 18, background: '#fee2e2', color: '#b91c1c', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}><AppIcon name="lock" size={30} /></div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#b91c1c' }}>Account Temporarily Locked</h3>
            <p style={{ color: 'var(--muted,#6b7280)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Your account has been locked after <strong>3 failed login attempts</strong> as a security measure.
              You can request the administrator to unlock your account, or contact HR directly.
            </p>
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem', textAlign: 'left' }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: '#991b1b' }}>What to do next:</p>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#7f1d1d', lineHeight: 1.8 }}>
                <li>Click <strong>Request Unlock</strong> below to notify the admin</li>
                <li>Wait for admin approval — you will receive a temporary password via email</li>
                <li>Log in with the temporary password and change it immediately</li>
              </ol>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-btn"
                style={{ flex: 1, minWidth: 140 }}
                onClick={() => { setUnlockView('request'); setUnlockMessage(''); }}
              >
                <AppIcon name="lock" size={16} /> Request Unlock
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1, minWidth: 140 }}
                onClick={() => { closeLockedModal(); setInfoModal('contacts'); }}
              >
                <AppIcon name="phone" size={16} /> View Contacts
              </button>
            </div>
            <button type="button" className="forgot-password-btn" style={{ marginTop: '0.75rem' }} onClick={closeLockedModal}>
              Close
            </button>
          </div>
        )}

        {/* ── Request form view ── */}
        {unlockView === 'request' && (
          <form className="modal-form" onSubmit={handleUnlockRequest} style={{ padding: '0.25rem 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'inline-flex', width: 50, height: 50, borderRadius: 14, background: '#eff6ff', color: '#1e40af', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}><AppIcon name="bell" size={24} /></div>
              <p style={{ color: 'var(--muted,#6b7280)', fontSize: '0.88rem', margin: 0 }}>
                Submit a request and the admin will be notified to unlock your account.
              </p>
            </div>
            <label>
              Username
              <input
                type="text"
                value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Your username"
                required
              />
            </label>
            <label>
              Reason (optional)
              <textarea
                value={unlockReason}
                onChange={e => setUnlockReason(e.target.value)}
                placeholder="Briefly describe what happened..."
                rows={3}
                maxLength={500}
                style={{ resize: 'vertical', minHeight: 72 }}
              />
            </label>
            {unlockMessage && <p className="form-message error">{unlockMessage}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setUnlockView('info')}>
                Back
              </button>
              <button className="primary-btn" type="submit" disabled={unlockLoading} style={{ flex: 2 }}>
                {unlockLoading ? 'Sending...' : 'Send Request to Admin'}
              </button>
            </div>
          </form>
        )}

        {/* ── Success view ── */}
        {unlockView === 'success' && (
          <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
            <div style={{ display: 'inline-flex', width: 58, height: 58, borderRadius: 18, background: '#dcfce7', color: '#16a34a', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <AppIcon name="check" size={30} />
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#15803d' }}>Request Sent!</h3>
            <p style={{ color: 'var(--muted,#6b7280)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              {unlockMessage}
            </p>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '0.85rem', marginBottom: '1.25rem', fontSize: '0.85rem', textAlign: 'left', color: '#166534' }}>
              The administrator has been notified. Once your account is unlocked, you will receive a <strong>temporary password</strong> via email.
            </div>
            <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={closeLockedModal}>
              Close
            </button>
          </div>
        )}
      </Modal>

      {/* ── Password reset modal ── */}
      <Modal open={resetOpen} title="Reset Password" onClose={() => { setResetOpen(false); setResetMessage(''); }}>
        <form className="modal-form password-reset-form" onSubmit={handleResetRequest}>
          <p className="modal-form-intro">
            Enter your username and we will send reset instructions to the email linked to your account.
          </p>
          <label>
            Username
            <input type="text" value={resetUser} onChange={e => setResetUser(e.target.value)} placeholder="Enter your username" required />
          </label>
          <button className="primary-btn" type="submit" disabled={resetLoading}>
            {resetLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
          {resetMessage && <p className="form-message">{resetMessage}</p>}
        </form>
      </Modal>

      {/* ── Info panels ── */}
      <ToastPanel
        open={Boolean(infoModal)}
        title={infoModal === 'contacts' ? 'Contacts' : infoModal === 'help' ? 'Help' : 'About Us'}
        onClose={() => setInfoModal('')}
      >
        {infoModal === 'contacts' && <ContactsContent />}
        {infoModal === 'help'     && <HelpContent />}
        {infoModal === 'about'    && <AboutUsContent />}
      </ToastPanel>
    </div>
  );
}
