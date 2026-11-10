'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import type { Theme } from '@/lib/app-config';
import type { PublicDoctor, Settings } from '@/lib/types';
import { api } from '@/lib/web';

type ToastTone = 'success' | 'error' | 'info';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
}
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

interface AppContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  settings: Settings | null;
  doctors: PublicDoctor[];
  refreshSettings: () => Promise<void>;
  toast: (message: string, options?: ToastTone | ToastOptions) => void;
  /** Styled replacement for window.confirm */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// The theme lives on <html class="dark|light"> (set before paint by the root layout).
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
const readTheme = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

const TONE_ICON = {
  success: <CheckCircle2 className="w-5 h-5 text-success shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-danger shrink-0" />,
  info: <Info className="w-5 h-5 text-accent shrink-0" />,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => 'light');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const toastId = useRef(0);

  const setTheme = useCallback((th: Theme) => {
    document.documentElement.classList.toggle('dark', th === 'dark');
    document.documentElement.classList.toggle('light', th === 'light');
    try {
      localStorage.setItem('app_theme', th);
    } catch {
      /* private mode */
    }
  }, []);

  const refreshSettings = useCallback(
    () =>
      api<{ settings: Settings; doctors: PublicDoctor[] }>('/api/settings')
        .then(data => {
          setSettings(data.settings);
          setDoctors(data.doctors);
        })
        .catch(() => undefined),
    []
  );

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const dismiss = useCallback((id: number) => setToasts(prev => prev.filter(x => x.id !== id)), []);

  const toast = useCallback(
    (message: string, options?: ToastTone | ToastOptions) => {
      const opts = typeof options === 'string' ? { tone: options } : options || {};
      const id = ++toastId.current;
      setToasts(prev => [...prev.slice(-2), { id, message, tone: opts.tone || 'success', action: opts.action }]);
      setTimeout(() => dismiss(id), opts.action ? 5500 : 3400);
    },
    [dismiss]
  );

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setDialog({ ...options, resolve })), []);

  const closeDialog = useCallback(
    (ok: boolean) => {
      dialog?.resolve(ok);
      setDialog(null);
    },
    [dialog]
  );

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, closeDialog]);

  return (
    <AppContext.Provider value={{ theme, setTheme, settings, doctors, refreshSettings, toast, confirm }}>
      <div className="app-root">{children}</div>

      {dialog && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-black/25 dark:bg-black/50 backdrop-blur-[2px] fade"
          onMouseDown={e => e.target === e.currentTarget && closeDialog(false)}
        >
          <div role="alertdialog" aria-modal="true" aria-label={dialog.title} className="glass-strong rounded-[28px] w-full max-w-[360px] p-6 text-center dialog-in">
            <h2 className="text-[17px] font-semibold leading-snug">{dialog.title}</h2>
            {dialog.message && <p className="text-[14px] text-secondary mt-2 leading-relaxed whitespace-pre-line">{dialog.message}</p>}
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button className="btn btn-plain" onClick={() => closeDialog(false)}>
                {dialog.cancelLabel || 'تراجع'}
              </button>
              <button
                autoFocus
                className={`btn ${dialog.tone === 'danger' ? 'btn-destructive' : 'btn-primary'}`}
                onClick={() => closeDialog(true)}
              >
                {dialog.confirmLabel || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] md:bottom-6 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none no-print"
        aria-live="polite"
      >
        {toasts.map(x => (
          <div
            key={x.id}
            role="status"
            className={`toast-in pointer-events-auto glass-strong rounded-full ps-3.5 py-2 flex items-center gap-2.5 text-[14.5px] max-w-[min(94vw,540px)] ${x.action ? 'pe-2' : 'pe-5'}`}
          >
            {TONE_ICON[x.tone]}
            <span className="min-w-0 leading-snug">{x.message}</span>
            {x.action && (
              <button
                className="btn btn-sm btn-tinted ms-1"
                onClick={() => {
                  x.action?.onClick();
                  dismiss(x.id);
                }}
              >
                {x.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
