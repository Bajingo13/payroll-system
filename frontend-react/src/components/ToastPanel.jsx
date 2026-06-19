import { useEffect } from 'react';

export default function ToastPanel({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      right: 28,
      width: 'min(380px, calc(100vw - 32px))',
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 24px 64px rgba(10,20,50,0.35), 0 4px 16px rgba(10,20,50,0.15)',
      zIndex: 999,
      animation: 'toastSlideIn 0.28s cubic-bezier(0.34,1.56,0.64,1)',
      border: '1px solid rgba(255,255,255,0.12)',
    }}>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(32px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f2044 0%, #1e40af 100%)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{title}</span>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
      </div>

      {/* Scrollable body */}
      <div style={{
        background: '#fff',
        overflowY: 'auto',
        padding: 16,
        flex: 1,
      }}>
        {children}
      </div>
    </div>
  );
}
