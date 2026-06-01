export default function ContactsPage() {
  return (
    <>
      <header className="header">
        <h2>Contacts</h2>
        <p>How to reach us for support and service requests.</p>
      </header>

      <section className="table-section">
        <h3>Support</h3>
        <div className="card-grid">
          <article className="card">
            <span>Email</span>
            <strong>support@astreablue.example</strong>
            <p className="muted">For bug reports, export issues, and account concerns.</p>
          </article>
          <article className="card">
            <span>Phone</span>
            <strong>(+63) 000 000 0000</strong>
            <p className="muted">Weekdays 8:00 AM – 5:00 PM (Asia/Manila).</p>
          </article>
          <article className="card">
            <span>Address</span>
            <strong>Manila, Philippines</strong>
            <p className="muted">Business hours by appointment.</p>
          </article>
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          You can customize these contact details in your deployment to match your organization.
        </p>
      </section>
    </>
  );
}

