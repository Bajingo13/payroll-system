import { useEffect } from 'react';

export default function Modal({ open, title, children, onClose, className = '' }) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="app-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
      onMouseDown={onClose}
    >
      <div className={`app-modal${className ? ` ${className}` : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="app-modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            x
          </button>
        </div>

        <div className="app-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
