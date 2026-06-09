export default function PasswordToggleIcon({ visible }) {
  return (
    <svg
      aria-hidden="true"
      className="password-toggle-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {visible ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c5 0 9 5 10 8a13.4 13.4 0 0 1-2.2 3.7" />
          <path d="M6.6 6.7C4.4 8.2 2.8 10.4 2 12c1 3 5 8 10 8a9.4 9.4 0 0 0 4.5-1.2" />
        </>
      ) : (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
