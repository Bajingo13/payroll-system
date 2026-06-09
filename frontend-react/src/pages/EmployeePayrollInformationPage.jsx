import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function money(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export default function EmployeePayrollInformationPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user?.user_id) return;

    api.get('/employee_dashboard', { params: { user_id: user.user_id } })
      .then(({ data }) => {
        if (!data.success) {
          throw new Error(data.message || 'Unable to load payroll information.');
        }
        setSummary(data.payrollSummary || null);
        setHistory(data.payrollHistory || []);
      })
      .catch((err) => setMessage(getApiMessage(err, 'Unable to load payroll information.')));
  }, [user?.user_id]);

  const totals = useMemo(() => {
    return history.reduce((acc, row) => {
      acc.gross += Number(row.gross_pay || 0);
      acc.deductions += Number(row.total_deductions || 0);
      acc.net += Number(row.net_pay || 0);
      return acc;
    }, { gross: 0, deductions: 0, net: 0 });
  }, [history]);

  return (
    <div className="employee-modern-page">
      <header className="employee-hero compact">
        <div>
          <span>Payroll</span>
        <h2>Payroll Information</h2>
        <p>View your latest payroll details and payroll history.</p>
        </div>
      </header>

      <section className="summary employee-modern-summary">
        <div className="card"><span>Payroll Period</span><strong>{summary?.payroll_range || '-'}</strong></div>
        <div className="card"><span>Date Generated</span><strong>{formatDateTime(summary?.date_generated)}</strong></div>
        <div className="card"><span>Gross Pay</span><strong>{money(summary?.gross_pay)}</strong></div>
        <div className="card"><span>Total Deductions</span><strong>{money(summary?.total_deductions)}</strong></div>
        <div className="card"><span>Net Pay</span><strong>{money(summary?.net_pay)}</strong></div>
        <div className="card"><span>Status</span><strong>{summary?.payroll_status || '-'}</strong></div>
      </section>

      <section className="table-section employee-modern-panel">
        <h3>Payroll History</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Generated On</th>
                <th>Payroll Range</th>
                <th>Gross Pay</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan="6">No payroll history found.</td></tr> : null}
              {history.map((row, index) => (
                <tr key={`${row.date_generated}-${index}`}>
                  <td>{formatDateTime(row.date_generated)}</td>
                  <td>{row.payroll_range || '-'}</td>
                  <td>{money(row.gross_pay)}</td>
                  <td>{money(row.total_deductions)}</td>
                  <td>{money(row.net_pay)}</td>
                  <td><span className="status completed">{row.payroll_status || '-'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="summary employee-mini-summary employee-metric-strip">
          <div className="card"><span>History Gross Total</span><strong>{money(totals.gross)}</strong></div>
          <div className="card"><span>History Deductions Total</span><strong>{money(totals.deductions)}</strong></div>
          <div className="card"><span>History Net Total</span><strong>{money(totals.net)}</strong></div>
        </div>

        <p className="message">{message}</p>
      </section>
    </div>
  );
}
