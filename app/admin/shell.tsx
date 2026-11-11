'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  ListChecks,
  Users,
  Settings as SettingsIcon,
  Bell,
  BellOff,
  Plus,
  Search,
  Sun,
  Moon,
  LogOut,
  ExternalLink,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { AdminContext, type AdminContextValue, type AppointmentDefaults, type StorageKind } from './admin-context';
import CleanupBanner, { CLEANUP_SEEN_KEY } from './cleanup-banner';
import { useApp } from '@/app/context/AppContext';
import AppointmentSheet, { type AppointmentSheetState } from '@/app/components/AppointmentSheet';
import PatientSheet, { type PatientSheetState } from '@/app/components/PatientSheet';
import CommandSearch from '@/app/components/CommandSearch';
import { Avatar, LoadingScreen, Menu, MenuItem } from '@/app/components/ui';
import { api, usePolling } from '@/lib/web';
import { NOUNS, arCount } from '@/lib/date';
import type { AdminUser, Theme } from '@/lib/app-config';
import type { Booking, CleanupNotice, CleanupRecord, FeedEvent } from '@/lib/types';

const LAST_CHECK_KEY = 'clinic_last_check';

interface Feed {
  serverTime: string;
  pending: number;
  events: FeedEvent[];
  cleanup: CleanupNotice | null;
  lastCleanup: CleanupRecord | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: (path: string) => boolean;
  showPending?: boolean;
}

function navFor(isSuper: boolean): NavItem[] {
  return [
    { href: '/admin', label: 'اليوم', icon: CalendarCheck, active: p => p === '/admin' },
    { href: '/admin/calendar', label: 'التقويم', icon: CalendarDays, active: p => p.startsWith('/admin/calendar') },
    { href: '/admin/bookings', label: 'المواعيد', icon: ListChecks, active: p => p.startsWith('/admin/bookings'), showPending: true },
    { href: '/admin/clients', label: 'المرضى', icon: Users, active: p => p.startsWith('/admin/clients') },
    {
      href: isSuper ? '/admin/settings' : '/admin/settings/hours',
      label: 'الإعدادات',
      icon: SettingsIcon,
      active: p => p.startsWith('/admin/settings'),
    },
  ];
}

/** Checks the staff session, then renders the workspace (or the bare login page). */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin';
  const isLoginPage = pathname === '/admin/login';
  const router = useRouter();
  const [session, setSession] = useState<{ admin: AdminUser | null; storage: StorageKind; forLogin: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ admin: AdminUser | null; storage: StorageKind }>('/api/auth/admin/me')
      .then(d => !cancelled && setSession({ admin: d.admin, storage: d.storage, forLogin: isLoginPage }))
      .catch(() => !cancelled && setSession({ admin: null, storage: 'file', forLogin: isLoginPage }));
    return () => {
      cancelled = true;
    };
  }, [isLoginPage]);

  // A check made for the other page (before/after signing in) is stale
  const current = session && session.forLogin === isLoginPage ? session : null;

  useEffect(() => {
    if (!current) return;
    if (!current.admin && !isLoginPage) router.replace('/admin/login');
    if (current.admin && isLoginPage) router.replace('/admin');
  }, [current, isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;
  if (!current?.admin) return <LoadingScreen />;
  return (
    <Workspace admin={current.admin} storage={current.storage} pathname={pathname}>
      {children}
    </Workspace>
  );
}

function Workspace({ admin, storage, pathname, children }: { admin: AdminUser; storage: StorageKind; pathname: string; children: React.ReactNode }) {
  const router = useRouter();
  const { settings, theme, setTheme, toast } = useApp();
  const isSuper = admin.role === 'SUPER';
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const [notifications, setNotifications] = useState<FeedEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [cleanup, setCleanup] = useState<CleanupNotice | null>(null);
  const [lastCleanup, setLastCleanup] = useState<CleanupRecord | null>(null);
  const [appointment, setAppointment] = useState<AppointmentSheetState>(null);
  const [patient, setPatient] = useState<PatientSheetState>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const lastCheck = useRef<string | null>(null);
  const known = useRef(new Set<string>());

  const openAppointment = useCallback((b: Booking | string) => {
    setPatient(null);
    setAppointment(typeof b === 'string' ? { mode: 'view', id: b } : { mode: 'view', id: b.id, booking: b });
  }, []);
  const newAppointment = useCallback((defaults?: AppointmentDefaults) => {
    setPatient(null);
    setAppointment({ mode: 'new', ...defaults });
  }, []);
  const openPatient = useCallback((id: string) => {
    setAppointment(null);
    setPatient({ mode: 'view', id });
  }, []);
  const newPatient = useCallback(() => {
    setAppointment(null);
    setPatient({ mode: 'new' });
  }, []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // What patients did online (new requests, changes, cancellations) since the last check.
  const pollFeed = useCallback(() => {
    if (!lastCheck.current) {
      try {
        lastCheck.current = localStorage.getItem(LAST_CHECK_KEY);
      } catch {
        /* storage blocked */
      }
      lastCheck.current ??= new Date(Date.now() - 12 * 3600_000).toISOString();
    }
    api<Feed>(`/api/feed?since=${encodeURIComponent(lastCheck.current)}`)
      .then(({ serverTime, pending, events, cleanup, lastCleanup }) => {
        setPending(pending);
        setCleanup(cleanup);
        setLastCleanup(lastCleanup);
        // Tell each browser once when old appointments were deleted (by the schedule or by a colleague)
        try {
          const stamp = lastCleanup?.at ?? 'none';
          const seen = localStorage.getItem(CLEANUP_SEEN_KEY);
          if (seen !== stamp) {
            localStorage.setItem(CLEANUP_SEEN_KEY, stamp);
            if (seen !== null && lastCleanup) {
              const count = arCount(lastCleanup.count, NOUNS.appointment);
              toast(
                lastCleanup.by === 'auto' ? `تم حذف المواعيد القديمة تلقائياً (${count})` : `حذف ${lastCleanup.by} المواعيد القديمة (${count})`,
                'info'
              );
              setVersion(v => v + 1);
            }
          }
        } catch {
          /* storage blocked */
        }
        const fresh = events.filter(e => !known.current.has(e.id));
        if (fresh.length) {
          fresh.forEach(e => known.current.add(e.id));
          setNotifications(prev => [...fresh, ...prev].slice(0, 40));
          setUnread(u => u + fresh.length);
          setVersion(v => v + 1);
          const single = fresh.length === 1 ? fresh[0] : null;
          toast(single ? single.text : `${arCount(fresh.length, NOUNS.update)} من المرضى`, {
            tone: 'info',
            action: single ? { label: 'عرض', onClick: () => openAppointment(single.bookingId) } : undefined,
          });
        }
        lastCheck.current = serverTime;
        try {
          localStorage.setItem(LAST_CHECK_KEY, serverTime);
        } catch {
          /* storage blocked */
        }
      })
      .catch(() => null);
  }, [toast, openAppointment]);
  usePolling(pollFeed, 30000);

  const refresh = useCallback(() => {
    setVersion(v => v + 1);
    pollFeed();
  }, [pollFeed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/admin/logout', { method: 'POST' }).catch(() => null);
    router.replace('/admin/login');
  }, [router]);

  const value = useMemo<AdminContextValue>(
    () => ({ admin, isSuper, storage, version, refresh, pending, lastCleanup, openAppointment, newAppointment, openPatient, newPatient, openSearch }),
    [admin, isSuper, storage, version, refresh, pending, lastCleanup, openAppointment, newAppointment, openPatient, newPatient, openSearch]
  );

  const nav = navFor(isSuper);
  const clinicName = settings?.clinicName || 'العيادة';
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <AdminContext.Provider value={value}>
      {/* Compact glass rail (tablets and desktops) */}
      <aside
        className="hidden md:flex fixed top-3 bottom-3 start-3 z-40 w-[84px] glass-strong rounded-[28px] flex-col items-center py-4 no-print"
        aria-label="القائمة الرئيسية"
      >
        <Link
          href="/admin"
          title={clinicName}
          className="w-11 h-11 rounded-[14px] bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shadow-[0_8px_20px_-8px_rgb(10_132_255/0.8)]"
        >
          <Stethoscope className="w-5 h-5" />
        </Link>
        <nav className="mt-6 flex flex-col items-stretch gap-1 w-full px-2">
          {nav.map(item => {
            const active = item.active(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[11px] font-semibold ${
                  active ? 'text-accent-ink' : 'text-secondary hover:text-label'
                }`}
              >
                <span
                  className={`relative w-12 h-9 rounded-full flex items-center justify-center transition-colors ${
                    active ? 'bg-accent text-white shadow-[0_6px_18px_-6px_var(--accent)]' : 'group-hover:bg-fill'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.showPending && pending > 0 && <PendingBubble count={pending} />}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <button type="button" onClick={toggleTheme} className="icon-btn" title="تغيير المظهر" aria-label="تغيير المظهر">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <AccountMenu admin={admin} isSuper={isSuper} placement="side" onLogout={logout} />
        </div>
      </aside>

      <div className="md:ps-[96px] flex-1 flex flex-col min-w-0">
        <header className="top-blur no-print">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-[68px] md:h-[78px] flex items-center gap-3">
            <Link href="/admin" className="md:hidden flex items-center gap-2.5 min-w-0 flex-1">
              <span className="w-9 h-9 shrink-0 rounded-[12px] bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center">
                <Stethoscope className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[16px] font-semibold truncate">{clinicName}</span>
            </Link>
            <button
              type="button"
              onClick={openSearch}
              className="hidden md:flex items-center gap-3 h-11 flex-1 max-w-[440px] ps-4 pe-2 rounded-full glass text-tertiary text-[14.5px] hover:text-secondary"
            >
              <Search className="w-[18px] h-[18px]" />
              <span className="flex-1 text-start">ابحث عن مريض أو موعد…</span>
              <span className="kbd">Ctrl K</span>
            </button>
            <div className="hidden md:block flex-1" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={openSearch} className="md:hidden icon-btn glass !w-11 !h-11" aria-label="بحث">
                <Search />
              </button>
              <NotificationBell
                items={notifications}
                unread={unread}
                onOpen={() => setUnread(0)}
                onPick={id => openAppointment(id)}
              />
              <button type="button" onClick={() => newAppointment()} className="btn btn-primary h-11 px-3.5 sm:px-5" aria-label="موعد جديد">
                <Plus className="!w-5 !h-5" />
                <span className="hidden sm:inline">موعد جديد</span>
              </button>
              <div className="md:hidden">
                <AccountMenu admin={admin} isSuper={isSuper} placement="bottom" onLogout={logout} theme={theme} onToggleTheme={toggleTheme} />
              </div>
            </div>
          </div>
        </header>

        {storage === 'unconfigured' && (
          <div className="max-w-[1240px] mx-auto w-full px-4 sm:px-6 lg:px-8 mb-2 no-print">
            <div className="card px-4 py-3 flex items-start gap-3 text-[14px] leading-relaxed">
              <TriangleAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <span>
                <b>التخزين غير مربوط:</b> لن يتم حفظ أي تغيير. أضف المتغيرين NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SECRET_KEY في إعدادات المشروع على Vercel ثم أعد النشر.
              </span>
            </div>
          </div>
        )}

        {cleanup && <CleanupBanner notice={cleanup} isSuper={isSuper} onChanged={refresh} />}

        <main key={pathname} className="enter flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 pt-1 pb-32 md:pb-14">
          {children}
        </main>
      </div>

      {/* Floating tab bar (phones) */}
      <nav
        className="md:hidden fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 glass-strong rounded-[26px] no-print"
        aria-label="التنقل"
      >
        <div className="flex items-stretch h-[62px] px-1">
          {nav.map(item => {
            const active = item.active(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${active ? 'text-accent-ink' : 'text-secondary'}`}
              >
                <span className={`relative w-12 h-7 rounded-full flex items-center justify-center ${active ? 'bg-accent/14' : ''}`}>
                  <Icon className="w-5 h-5" />
                  {item.showPending && pending > 0 && <PendingBubble count={pending} />}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <AppointmentSheet state={appointment} onClose={() => setAppointment(null)} onChanged={refresh} onOpenPatient={openPatient} />
      <PatientSheet
        state={patient}
        onClose={() => setPatient(null)}
        onChanged={refresh}
        onShow={openPatient}
        onOpenAppointment={openAppointment}
        onNewAppointment={clientId => newAppointment({ clientId })}
      />
      <CommandSearch open={searchOpen} onClose={closeSearch} onOpenPatient={openPatient} onOpenAppointment={openAppointment} timezone={settings?.timezone} />
    </AdminContext.Provider>
  );
}

function PendingBubble({ count }: { count: number }) {
  return (
    <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-warning text-white text-[10.5px] font-bold flex items-center justify-center tnum ring-2 ring-[var(--surface)]">
      {count > 99 ? '99+' : count}
    </span>
  );
}

const ACTION_DOT: Record<string, string> = {
  CREATED: 'bg-accent',
  RESCHEDULED: 'bg-violet',
  CANCELLED: 'bg-danger',
};

function NotificationBell({
  items,
  unread,
  onOpen,
  onPick,
}: {
  items: FeedEvent[];
  unread: number;
  onOpen: () => void;
  onPick: (bookingId: string) => void;
}) {
  const stamp = (iso: string) =>
    new Intl.DateTimeFormat('ar-DZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return (
    <Menu
      width={360}
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={() => {
            toggle();
            if (!open) onOpen();
          }}
          className="icon-btn glass relative !w-11 !h-11"
          aria-label={unread ? `الإشعارات (${unread} جديدة)` : 'الإشعارات'}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10.5px] font-bold flex items-center justify-center tnum">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {close => (
        <div>
          <div className="px-3 pt-2 pb-1.5 text-[15px] font-semibold">الإشعارات</div>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13.5px] text-secondary leading-relaxed">
              <BellOff className="w-6 h-6 mx-auto mb-2 text-tertiary" />
              ستظهر هنا الحجوزات والتغييرات التي يقوم بها المرضى عبر الموقع.
            </div>
          ) : (
            <div className="max-h-[min(380px,60vh)] overflow-y-auto">
              {items.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    close();
                    onPick(n.bookingId);
                  }}
                  className="w-full text-start px-3 py-2.5 rounded-[14px] hover:bg-fill flex items-start gap-3"
                >
                  <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${ACTION_DOT[n.action] || 'bg-tertiary'}`} />
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-snug">{n.text}</span>
                    <span className="block text-[12px] text-tertiary mt-0.5">{stamp(n.at)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Menu>
  );
}

function AccountMenu({
  admin,
  isSuper,
  placement,
  onLogout,
  theme,
  onToggleTheme,
}: {
  admin: AdminUser;
  isSuper: boolean;
  placement: 'side' | 'bottom';
  onLogout: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}) {
  return (
    <Menu
      width={250}
      placement={placement}
      align="end"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="rounded-full ring-2 ring-white/70 dark:ring-white/10" aria-label="الحساب">
          <Avatar name={admin.name} size={placement === 'side' ? 40 : 38} />
        </button>
      )}
    >
      {close => (
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={admin.name} size={36} />
            <div className="min-w-0">
              <div className="font-semibold text-[14.5px] truncate">{admin.name}</div>
              <div className="text-[12.5px] text-secondary">{isSuper ? 'المسؤول الرئيسي' : 'عضو في الفريق'}</div>
            </div>
          </div>
          <div className="h-px bg-hairline my-1 mx-2" />
          {onToggleTheme && (
            <MenuItem
              icon={theme === 'dark' ? <Sun /> : <Moon />}
              onClick={() => {
                onToggleTheme();
                close();
              }}
            >
              {theme === 'dark' ? 'المظهر الفاتح' : 'المظهر الداكن'}
            </MenuItem>
          )}
          <MenuItem icon={<ExternalLink />} href="/" newTab onClick={close}>
            صفحة الحجز للمرضى
          </MenuItem>
          <MenuItem
            icon={<LogOut />}
            tone="danger"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            تسجيل الخروج
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
