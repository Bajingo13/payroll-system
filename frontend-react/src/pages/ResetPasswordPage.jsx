import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getApiMessage } from '../api/client.js';
import astreaBlueLogo from '../assets/astreablue-logo.png';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setMessageType('');
    setLoading(true);

    try {
      const { data } = await api.post('/password-reset/confirm', {
        token,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword
      });
      if (!data.success) {
        throw new Error(data.message || 'Unable to reset password.');
      }
      setMessage(data.message || 'Password reset successfully. You can now log in.');
      setMessageType('success');
      setForm({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to reset password.'));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <header className="site-header">
        <Link className="site-logo" to="/login" aria-label="AstreaBlue Login">
          <img src={astreaBlueLogo} alt="AstreaBlue" />
          <span>Astreablue Intelligence Inc.</span>
        </Link>
      </header>

      <main className="login-shell reset-login-shell">
        <section className="service-panel">
          <p className="service-kicker">Account Recovery</p>
          <h1>Set a new password.</h1>
          <p className="service-copy">
            Use the reset link sent to your account email to create a new password for the payroll system.
          </p>
        </section>

        <section className="auth-card">
          <div className="auth-brand">
            <p className="auth-kicker">Password reset</p>
            <h2>Astreablue Intelligence Inc.</h2>
            <p>Enter and confirm your new password.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              type="password"
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              placeholder="New password"
              minLength={8}
              required
              disabled={!token}
            />
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              placeholder="Confirm new password"
              minLength={8}
              required
              disabled={!token}
            />
            <button className="primary-btn" type="submit" disabled={loading || !token}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <Link className="forgot-password-btn" to="/login">Back to Login</Link>
          </form>

          {!token && <p className="form-message error">Password reset token is missing.</p>}
          {message && <p className={`form-message ${messageType}`}>{message}</p>}
        </section>
      </main>
    </div>
  );
}
