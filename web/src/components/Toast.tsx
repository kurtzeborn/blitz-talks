import { useState, useEffect } from 'react';
import type { Toast } from '../hooks/useToast';

export function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[90vw] max-w-sm" role="status" aria-live="polite">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const bgColor = toast.type === 'error' ? 'bg-red-900/90 border-red-700'
    : toast.type === 'success' ? 'bg-green-900/90 border-green-700'
    : 'bg-gray-800/90 border-gray-600';

  return (
    <div
      className={`${bgColor} border rounded-lg px-4 py-3 text-sm text-white shadow-lg flex items-center justify-between gap-2 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <span>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-400 hover:text-white shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
