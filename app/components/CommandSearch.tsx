'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, CornerDownLeft, CalendarClock, Users } from 'lucide-react';
import { Avatar, Spinner } from './ui';
import { StateBadge, visitState } from './status';
import { api } from '@/lib/web';
import { addDays, nowIn, relativeDay, timeOf } from '@/lib/date';
import type { Booking, Client } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenPatient: (clientId: string) => void;
  onOpenAppointment: (booking: Booking) => void;
  timezone?: string;
}

/** Spotlight-style search over patients and appointments (Ctrl / ⌘ + K). */
export default function CommandSearch(props: Props) {
  return props.open ? <SearchDialog {...props} /> : null;
}

type Item = { kind: 'patient'; client: Client } | { kind: 'booking'; booking: Booking };

function SearchDialog({ onClose, onOpenPatient, onOpenAppointment, timezone }: Props) {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [active, setActive] = useState(0);
  const now = nowIn(timezone);

  useEffect(() => {
    let cancelled = false;
    const today = nowIn(timezone).date;
    Promise.all([
      api<{ clients: Client[] }>('/api/clients'),
      api<{ bookings: Booking[] }>(`/api/bookings?from=${addDays(today, -90)}&to=${addDays(today, 180)}`),
    ])
      .then(([c, b]) => {
        if (cancelled) return;
        setClients(c.clients);
        setBookings(b.bookings);
      })
      .catch(() => {
        if (cancelled) return;
        setClients([]);
        setBookings([]);
      });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
    };
  }, [timezone, onClose]);

  const items = useMemo<Item[]>(() => {
    if (!clients || !bookings) return [];
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const code = q.replace(/[^a-z0-9]/g, '');
    if (!q) {
      // Suggestions: what is coming up next
      return bookings
        .filter(b => b.status !== 'CANCELLED' && b.endDateTime > now.dateTime)
        .slice(0, 6)
        .map(booking => ({ kind: 'booking' as const, booking }));
    }
    const patients = clients
      .filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)) ||
          (code.length >= 3 && c.accessCode.toLowerCase().replace(/[^a-z0-9]/g, '').includes(code))
      )
      .slice(0, 6)
      .map(client => ({ kind: 'patient' as const, client }));
    const upcomingFirst = [...bookings].sort((a, b) => {
      const af = a.endDateTime > now.dateTime ? 0 : 1;
      const bf = b.endDateTime > now.dateTime ? 0 : 1;
      return af - bf || (af === 0 ? a.startDateTime.localeCompare(b.startDateTime) : b.startDateTime.localeCompare(a.startDateTime));
    });
    const appointments = upcomingFirst
      .filter(b => b.clientName.toLowerCase().includes(q) || (digits.length >= 3 && (b.clientPhone || '').replace(/\D/g, '').includes(digits)))
      .slice(0, 6)
      .map(booking => ({ kind: 'booking' as const, booking }));
    return [...patients, ...appointments];
  }, [clients, bookings, query, now.dateTime]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === 'patient') onOpenPatient(item.client.id);
    else onOpenAppointment(item.booking);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    }
  };

  const loading = !clients || !bookings;
  const firstBooking = items.findIndex(i => i.kind === 'booking');

  return (
    <div className="fixed inset-0 z-[60] bg-black/25 dark:bg-black/55 backdrop-blur-[2px] fade px-3 pt-[9vh]" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="بحث" className="glass-strong rounded-[26px] w-full max-w-xl mx-auto overflow-hidden dialog-in">
        <div className="flex items-center gap-3 px-5 h-[60px] border-b border-hairline">
          <Search className="w-5 h-5 text-tertiary shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن مريض بالاسم أو الهاتف أو الرمز…"
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-tertiary"
            aria-label="بحث"
          />
          <span className="kbd hidden sm:inline-flex">Esc</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading ? (
            <div className="py-10 flex justify-center text-accent">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-secondary">{query.trim() ? 'لا نتائج مطابقة.' : 'لا توجد مواعيد قادمة.'}</p>
          ) : (
            items.map((item, i) => (
              <div key={item.kind === 'patient' ? item.client.id : item.booking.id}>
                {(i === 0 || i === firstBooking) && (
                  <div className="px-3 pt-2 pb-1.5 text-[12px] font-medium text-tertiary flex items-center gap-1.5">
                    {item.kind === 'patient' ? <Users className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    {item.kind === 'patient' ? 'المرضى' : query.trim() ? 'المواعيد' : 'القادم'}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-start ${active === i ? 'bg-accent/12' : ''}`}
                >
                  {item.kind === 'patient' ? (
                    <>
                      <Avatar name={item.client.name} size={34} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium truncate">{item.client.name}</span>
                        <span className="block text-[12.5px] text-secondary">
                          <span className="num">{item.client.phone || '—'}</span> · <span className="num">{item.client.accessCode}</span>
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-[34px] min-w-[50px] px-1.5 rounded-xl bg-fill flex items-center justify-center text-[12.5px] font-semibold tnum shrink-0">
                        {timeOf(item.booking.startDateTime)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium truncate">{item.booking.clientName}</span>
                        <span className="block text-[12.5px] text-secondary truncate">
                          {relativeDay(item.booking.startDateTime.slice(0, 10), now.date)} · {item.booking.serviceName || 'موعد'}
                        </span>
                      </span>
                      <StateBadge state={visitState(item.booking, now.dateTime)} />
                    </>
                  )}
                  {active === i && <CornerDownLeft className="w-4 h-4 text-tertiary shrink-0 hidden sm:block" />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
