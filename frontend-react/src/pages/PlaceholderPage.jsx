export default function PlaceholderPage({ title }) {
  return (
    <>
      <header className="header">
        <h2>{title}</h2>
        <p>This page is ready to be migrated into React.</p>
      </header>
      <section className="table-section">
        <h3>{title}</h3>
        <p className="muted">The backend APIs remain available while this module is migrated.</p>
      </section>
    </>
  );
}
