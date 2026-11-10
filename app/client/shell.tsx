'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarPlus, LogOut } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';
import { LoadingScreen } from '../components/ui';
import { useApp } from '../context/AppContext';
import { PatientContext, type Patient } from './patient-context';
import { api } from '@/lib/web';

const TABS = [
  { href: '/client', label: 'حجز موعد', icon: CalendarPlus },
  { href: '/client/bookings', label: 'مواعيدي', icon: CalendarClock },
];

export default function PatientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { confirm } = useApp();
  const isLoginPage = pathname === '/client/login';
  const [state, setState] = useState<{ patient: Patient | null; forLogin: boolean } | null>(null);

  const refresh = useCallback(
    () =>
      api<{ client: Patient | null }>('/api/auth/client/me')
        .then(d => setState({ patient: d.client, forLogin: isLoginPage }))
        .catch(() => undefined),
    [isLoginPage]
  );

  useEffect(() => {
    let cancelled = false;
    api<{ client: Patient | null }>('/api/auth/client/me')
      .then(d => !cancelled && setState({ patient: d.client, forLogin: isLoginPage }))
      .catch(() => !cancelled && setState({ patient: null, forLogin: isLoginPage }));
    return () => {
      cancelled = true;
    };
  }, [isLoginPage]);

  const current = state && state.forLogin === isLoginPage ? state : null;

  useEffect(() => {
    if (current && !current.patient && !isLoginPage) router.replace('/client/login');
  }, [current, isLoginPage, router]);

  const logout = async () => {
    const ok = await confirm({ title: 'تسجيل الخروج؟', message: 'ستحتاج إلى رمز الدخول للعودة إلى مواعيدك.', confirmLabel: 'خروج' });
    if (!ok) return;
    await api('/api/auth/client/logout', { method: 'POST' }).catch(() => null);
    router.replace('/client/login');
  };

  if (isLoginPage) {
    return <PatientContext.Provider value={{ patient: current?.patient ?? null, refresh }}>{children}</PatientContext.Provider>;
  }
  if (!current?.patient) return <LoadingScreen />;

  return (
    <PatientContext.Provider value={{ patient: current.patient, refresh }}>
      <PublicHeader>
        <nav className="segmented hidden sm:inline-flex" aria-label="التنقل">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} data-active={active} aria-current={active ? 'page' : undefined}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={logout} className="icon-btn glass" title="تسجيل الخروج" aria-label="تسجيل الخروج">
          <LogOut />
        </button>
      </PublicHeader>

      <main key={pathname} className="enter flex-1 max-w-3xl w-full mx-auto px-4 pt-2 pb-36 sm:pb-16">
        {children}
      </main>

      <nav
        className="sm:hidden fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 glass-strong rounded-[26px] no-print"
        aria-label="التنقل"
      >
        <div className="flex h-[62px] px-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? 'text-accent-ink' : 'text-secondary'}`}
              >
                <span className={`w-14 h-7 rounded-full flex items-center justify-center ${active ? 'bg-accent/14' : ''}`}>
                  <Icon className="w-5 h-5" />
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </PatientContext.Provider>
  );
}
