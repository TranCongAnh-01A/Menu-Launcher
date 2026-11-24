import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Warning, CheckCircle, Info } from '@phosphor-icons/react';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

interface NotificationContextType {
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  showActionToast: (message: string, actionLabel: string, onAction: () => void, duration?: number) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    title: string;
    confirmText: string;
    cancelText: string;
  } | null>(null);

  // Hàm resolve của hộp thoại đang chờ. Giữ ngoài state vì việc gọi nó là một
  // side effect — không được đặt trong updater của setState (updater phải thuần
  // khiết và bị React StrictMode gọi hai lần ở môi trường dev).
  const pendingConfirmRef = useRef<((value: boolean) => void) | null>(null);

  // Hàm hiển thị Toast thông thường
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Hàm hiển thị Toast có nút Action (ví dụ: Hoàn tác)
  const showActionToast = useCallback((message: string, actionLabel: string, onAction: () => void, duration: number = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type: 'info', action: { label: actionLabel, onClick: onAction } }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  // Hàm xác nhận dạng Promise
  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // Hủy hộp thoại đang chờ (nếu có) trước khi mở cái mới.
      pendingConfirmRef.current?.(false);
      pendingConfirmRef.current = resolve;

      setConfirmState({
        message,
        title: options?.title || 'Xác nhận',
        confirmText: options?.confirmText || 'Đồng ý',
        cancelText: options?.cancelText || 'Hủy',
      });
    });
  }, []);

  const handleConfirmClose = (value: boolean) => {
    pendingConfirmRef.current?.(value);
    pendingConfirmRef.current = null;
    setConfirmState(null);
  };

  // Không để lại Promise treo vĩnh viễn nếu provider bị gỡ khi hộp thoại còn mở.
  useEffect(() => {
    return () => {
      pendingConfirmRef.current?.(false);
      pendingConfirmRef.current = null;
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, showActionToast, confirm }}>
      {children}

      {/* Render Toast container */}
      {createPortal(
        <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-40px)] pointer-events-none">
          {toasts.map((toast) => {
            const isWarning = toast.type === 'warning' || toast.type === 'error';
            const isSuccess = toast.type === 'success';

            return (
              <div
                key={toast.id}
                className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-modal animate-slide-in-right max-w-full overflow-hidden"
              >
                <div className="flex-shrink-0">
                  {isWarning ? (
                    <Warning size={18} className="text-destructive" weight="regular" />
                  ) : isSuccess ? (
                    <CheckCircle size={18} className="text-primary" weight="regular" />
                  ) : (
                    <Info size={18} className="text-muted-foreground" weight="regular" />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm text-foreground font-medium truncate" title={toast.message}>
                  {toast.message}
                </div>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                    }}
                    className="btn-primary flex-shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-lg"
                  >
                    {toast.action.label}
                  </button>
                )}
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="flex-shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                >
                  <X size={14} weight="regular" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Render Confirm Modal */}
      {confirmState &&
        createPortal(
          <div className="modal-backdrop flex items-center justify-center p-4" onClick={() => handleConfirmClose(false)}>
            <div className="modal-panel w-full max-w-sm p-6 animate-modal-in" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-serif text-xl font-bold tracking-tight text-foreground mb-3">
                {confirmState.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                {confirmState.message}
              </p>
              <div className="flex justify-end gap-2.5">
                <button
                  onClick={() => handleConfirmClose(false)}
                  className="btn-ghost text-xs px-4 py-2 border border-border"
                >
                  {confirmState.cancelText}
                </button>
                <button
                  onClick={() => handleConfirmClose(true)}
                  className="btn-primary text-xs px-4 py-2"
                >
                  {confirmState.confirmText}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
