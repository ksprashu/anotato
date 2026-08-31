import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
  altText?: string;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number; // In ms, default 3000ms. 0 for persistent.
  action?: ToastAction;
  createdAt: number;
}

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
  success: (message: string, options?: ToastOptions | string) => string;
  error: (message: string, options?: ToastOptions | string) => string;
  info: (message: string, options?: ToastOptions | string) => string;
  warning: (message: string, options?: ToastOptions | string) => string;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  className?: string;
}

export const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss, className = '' }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTimeRef = useRef<number>(toast.duration ?? 3000);
  const startTimeRef = useRef<number>(Date.now());

  const startTimer = useCallback(() => {
    if (toast.duration && toast.duration > 0) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, remainingTimeRef.current);
    }
  }, [toast.duration, toast.id, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  const variantStyles = {
    success: {
      border: 'border-emerald-500/40',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" data-testid="toast-icon-success" />,
      bgGlow: 'shadow-emerald-500/10',
    },
    error: {
      border: 'border-red-500/40',
      icon: <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" data-testid="toast-icon-error" />,
      bgGlow: 'shadow-red-500/10',
    },
    info: {
      border: 'border-cyan-500/40',
      icon: <Info className="w-5 h-5 text-cyan-500 dark:text-cyan-400 shrink-0" data-testid="toast-icon-info" />,
      bgGlow: 'shadow-cyan-500/10',
    },
    warning: {
      border: 'border-amber-500/40',
      icon: <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" data-testid="toast-icon-warning" />,
      bgGlow: 'shadow-amber-500/10',
    },
  }[toast.type];

  const role = toast.type === 'error' ? 'alert' : 'status';
  const ariaLive = toast.type === 'error' ? 'assertive' : 'polite';

  return (
    <div
      role={role}
      aria-live={ariaLive}
      data-testid="toast-item"
      data-toast-id={toast.id}
      data-toast-type={toast.type}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      className={`pointer-events-auto flex items-start gap-3 p-3.5 bg-white/95 dark:bg-slate-900/95 border ${variantStyles.border} ${variantStyles.bgGlow} shadow-xl backdrop-blur-md rounded-xl text-slate-900 dark:text-slate-100 min-w-[280px] max-w-[420px] transition-all duration-200 select-none ${className}`}
    >
      {variantStyles.icon}
      <div className="flex-1 min-w-0 pt-0.5">
        <p data-testid="toast-message" className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
          {toast.message}
        </p>
        {toast.description && (
          <p data-testid="toast-description" className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
            {toast.description}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            data-testid="toast-action-btn"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        data-testid="toast-close-btn"
        onClick={() => onDismiss(toast.id)}
        aria-label="Close notification"
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export interface ToastContainerProps {
  toasts?: ToastItem[];
  onDismiss?: (id: string) => void;
  className?: string;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts: propsToasts,
  onDismiss: propsOnDismiss,
  className = '',
}) => {
  const context = useContext(ToastContext);
  const toasts = propsToasts ?? context?.toasts ?? [];
  const onDismiss = propsOnDismiss ?? context?.dismissToast ?? (() => {});

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-container"
      aria-label="Notifications"
      className={`fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none max-w-sm w-full sm:w-auto ${className}`}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode; defaultDuration?: number }> = ({
  children,
  defaultDuration = 3000,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = {
        id,
        type,
        message,
        description: options?.description,
        duration: options?.duration !== undefined ? options?.duration : defaultDuration,
        action: options?.action,
        createdAt: Date.now(),
      };
      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    [defaultDuration]
  );

  const success = useCallback(
    (message: string, options?: ToastOptions | string) => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return showToast('success', message, opts);
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, options?: ToastOptions | string) => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return showToast('error', message, opts);
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, options?: ToastOptions | string) => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return showToast('info', message, opts);
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, options?: ToastOptions | string) => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return showToast('warning', message, opts);
    },
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        dismissToast,
        clearAllToasts,
        success,
        error,
        info,
        warning,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback for isolated components/tests
    return {
      toasts: [],
      showToast: () => '',
      dismissToast: () => {},
      clearAllToasts: () => {},
      success: () => '',
      error: () => '',
      info: () => '',
      warning: () => '',
    };
  }
  return context;
}

export default ToastProvider;
