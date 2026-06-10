import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function ContactsPage() {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get('/company_settings')
      .then(({ data }) => { if (data.data) setCompany(data.data); })
      .catch(() => {});
  }, []);

  const name    = company?.company_name || 'Astreablue Intelligence Inc.';
  const address = company?.address      || 'Batangas City, Batangas, Philippines';
  const email   = company?.email        || 'astreablueintelligenceinc@gmail.com';
  const phone   = company?.phone        || '';
  const website = company?.website      || '';

  return (
    <>
      <header className="header">
        <h2>Contacts</h2>
        <p>Reach out to {name} for support, inquiries, and service requests.</p>
      </header>

      <section className="table-section">
        <h3>Get in Touch</h3>
        <div className="card-grid">
          {email && (
            <article className="card">
              <span>Email</span>
              <strong>
                <a href={`mailto:${email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{email}</a>
              </strong>
              <p className="muted">For payroll inquiries, HR concerns, system support, and account issues.</p>
            </article>
          )}
          {phone && (
            <article className="card">
              <span>Phone</span>
              <strong>{phone}</strong>
              <p className="muted">Weekdays 8:00 AM – 5:00 PM (Asia/Manila).</p>
            </article>
          )}
          {address && (
            <article className="card">
              <span>Address</span>
              <strong>{address}</strong>
              <p className="muted">Business hours by appointment only.</p>
            </article>
          )}
          {website && (
            <article className="card">
              <span>Website</span>
              <strong>
                <a href={website} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{website}</a>
              </strong>
              <p className="muted">Visit our website for more information and resources.</p>
            </article>
          )}
        </div>
      </section>

      <section className="table-section">
        <h3>HR Department</h3>
        <div className="card-grid">
          <article className="card">
            <span>Payroll Concerns</span>
            <strong>HR / Payroll Team</strong>
            <p className="muted">For payslip disputes, salary adjustments, loan deductions, and government contribution queries.</p>
          </article>
          <article className="card">
            <span>Leave & Attendance</span>
            <strong>HR Department</strong>
            <p className="muted">For leave balance inquiries, attendance corrections, and overtime approval concerns.</p>
          </article>
          <article className="card">
            <span>System Support</span>
            <strong>System Administrator</strong>
            <p className="muted">For login issues, access requests, system errors, and configuration concerns.</p>
          </article>
        </div>

        <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          Office hours: Monday to Friday, 8:00 AM – 5:00 PM (Philippine Standard Time).
          All concerns submitted outside business hours will be addressed on the next working day.
        </p>
      </section>
    </>
  );
}
