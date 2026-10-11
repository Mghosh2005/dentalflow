import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-xl',
  isDirty = false,
  confirmCloseIfDirty = false,
}) {
  const modalBoxRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Lock background body scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Auto-focus the close button for keyboard accessibility
  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  const handleSafeClose = useCallback(() => {
    if (confirmCloseIfDirty && isDirty) {
      if (!window.confirm('You have unsaved changes in this form. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  }, [onClose, confirmCloseIfDirty, isDirty]);

  // Close on backdrop click (outside the modal box)
  const handleBackdropClick = useCallback((e) => {
    if (modalBoxRef.current && !modalBoxRef.current.contains(e.target)) {
      handleSafeClose();
    }
  }, [handleSafeClose]);

  // Keyboard navigation: Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSafeClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSafeClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalBoxRef}
        className={`bg-white rounded-2xl w-full ${maxWidth} shadow-2xl border border-slate-200/90 flex flex-col max-h-[90vh] my-auto overflow-hidden animate-scaleUp`}
      >
        {/* Modal Header - Stays fixed and accessible */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <h3 id="modal-heading" className="font-display font-bold text-lg text-slate-900 tracking-tight">
            {title}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleSafeClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Independently scrollable */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

