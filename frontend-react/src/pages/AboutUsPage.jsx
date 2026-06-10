import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function AboutUsPage() {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get('/company_settings')
      .then(({ data }) => { if (data.data) setCompany(data.data); })
      .catch(() => {});
  }, []);

  const name    = company?.company_name || 'Astreablue Intelligence Inc.';
  const address = company?.address      || '';
  const email   = company?.email        || '';
  const phone   = company?.phone        || '';
  const website = company?.website      || '';
  const industry= company?.industry     || 'Information Technology';
  const regNo   = company?.registration_no || '';
  const founded = company?.founded_year || '';
  const logo    = company?.logo_main    || company?.logo_url || '';

  return (
    <>
      <header className="header">
        <h2>About Us</h2>
        <p>Learn more about {name} and the Payroll + HRIS platform.</p>
      </header>

      <section className="table-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {logo && (
            <img
              src={logo}
              alt={name}
              style={{ maxHeight: '72px', maxWidth: '220px', objectFit: 'contain' }}
            />
          )}
          <div>
            <h3 style={{ margin: 0 }}>{name}</h3>
            {industry && <p className="muted" style={{ margin: '0.2rem 0 0' }}>{industry}</p>}
          </div>
        </div>

        <p style={{ lineHeight: 1.7 }}>
          {name} provides a comprehensive HRIS and Payroll platform designed to streamline
          employee records, attendance tracking, leave and overtime management, payroll
          computation, and statutory government reporting — all in one integrated system.
        </p>

        {(address || email || phone || website || regNo || founded) && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem 1.5rem' }}>
            {address && (
              <div>
                <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Address</span>
                <strong style={{ fontSize: '0.92rem' }}>{address}</strong>
              </div>
            )}
            {email && (
              <div>
                <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Email</span>
                <strong style={{ fontSize: '0.92rem' }}>
                  <a href={`mailto:${email}`} style={{ color: 'inherit' }}>{email}</a>
                </strong>
              </div>
            )}
            {phone && (
              <div>
                <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Phone</span>
                <strong style={{ fontSize: '0.92rem' }}>{phone}</strong>
              </div>
            )}
            {website && (
              <div>
                <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Website</span>
                <strong style={{ fontSize: '0.92rem' }}>
                  <a href={website} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{website}</a>
                </strong>
              </div>
            )}
            {regNo && (
              <div>
                <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Registration No.</span>
                <strong style={{ fontSize: '0.92rem' }}>{regNo}</strong>
              </div>
            )}
            {founded && (
              <div>
                <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>Founded</span>
                <strong style={{ fontSize: '0.92rem' }}>{founded}</strong>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="table-section">
        <h3>Platform Capabilities</h3>
        <div className="card-grid" style={{ marginTop: '0.75rem' }}>
          <article className="card">
            <span>HRIS</span>
            <strong>Employee Records</strong>
            <p className="muted">Complete employee profiles, government IDs, 201 files, and organizational setup.</p>
          </article>
          <article className="card">
            <span>Time & Attendance</span>
            <strong>Timekeeping</strong>
            <p className="muted">Attendance monitoring, leave management, overtime tracking, and schedule management.</p>
          </article>
          <article className="card">
            <span>Payroll</span>
            <strong>Computation & Processing</strong>
            <p className="muted">Automated payroll computation with BIR, SSS, PhilHealth, and Pag-IBIG deductions.</p>
          </article>
          <article className="card">
            <span>Reports</span>
            <strong>Operational + Compliance</strong>
            <p className="muted">Payslips, payroll summaries, government reports, audit logs, and year-end payroll.</p>
          </article>
          <article className="card">
            <span>Security</span>
            <strong>Data Protection</strong>
            <p className="muted">Role-based access control and encrypted storage for sensitive employee data.</p>
          </article>
          <article className="card">
            <span>Loans & Deductions</span>
            <strong>Loan Management</strong>
            <p className="muted">Track and auto-deduct employee loans and other recurring deductions each payroll period.</p>
          </article>
        </div>
      </section>
    </>
  );
}
