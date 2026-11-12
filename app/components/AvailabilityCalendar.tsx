'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarX2, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { Select, monthCells } from './pickers';
import { api } from '@/lib/web';
import { DAY_SHORT, NOUNS, WEEK_ORDER, addDays, arCount, formatArabicDate, monthLabel, shiftMonth, todayIn } from '@/lib/date';
import type { DayStatus, DaySummary, TimeSlot } from '@/lib/types';

/**
 * Read-only view of the free times, for visitors who are not signed in.
 * Days and times can be looked at but not booked here; booking goes through /client.
 */
export default function AvailabilityCalendar() {
  const { settings, doctors } = useApp();
  const today = todayIn(settings?.timezone);
  const lastDay = addDays(today, settings?.bookingWindowDays ?? 30);
  const [doctorId, setDoctorId] = useState('');
  const resourceId = doctorId || doctors[0]?.id || '';
  const [month, setMonth] = useState(today.slice(0, 7));
  const [chosen, setChosen] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ key: string; days: Record<string, DaySummary> } | null>(null);
  const [day, setDay] = useState<{ key: string; slots: TimeSlot[]; status: DayStatus; holiday?: string } | null>(null);

  const monthKey = `${resourceId}|${month}`;
  useEffect(() => {
    if (!resourceId) return;
    let cancelled = false;
    api<{ days: DaySummary[] }>(`/api/availability/summary?${new URLSearchParams({ resourceId, month })}`)
      .then(d => !cancelled && setSummary({ key: monthKey, days: Object.fromEntries(d.days.map(x => [x.date, x])) }))
      .catch(() => !cancelled && setSummary({ key: monthKey, days: {} }));
    return () => {
      cancelled = true;
    };
  }, [resourceId, month, monthKey]);

  const date = chosen ?? today;
  const dayKey = `${resourceId}|${date}`;
  useEffect(() => {
    if (!resourceId) return;
    let cancelled = false;
    api<{ slots: TimeSlot[]; dayStatus: DayStatus; holidayTitle?: string }>(`/api/availability/slots?${new URLSearchParams({ resourceId, date })}`)
      .then(d => !cancelled && setDay({ key: dayKey, slots: d.slots, status: d.dayStatus, holiday: d.holidayTitle }))
      .catch(() => !cancelled && setDay({ key: dayKey, slots: [], status: 'OPEN' }));
    return () => {
      cancelled = true;
    };
  }, [resourceId, date, dayKey]);

  if (!settings || !doctors.length) return <div className="skeleton h-[420px] rounded-[22px]" />;

  const days = summary?.key === monthKey ? summary.days : null;
  const loadingDay = !day || day.key !== dayKey;
  const free = loadingDay ? [] : day.slots.filter(s => s.isAvailable);
  const canPrev = month > today.slice(0, 7);
  const canNext = month < lastDay.slice(0, 7);

  const group = (title: string, icon: React.ReactNode, list: TimeSlot[]) =>
    list.length > 0 && (
      <div>
        <p className="text-[12.5px] font-medium text-tertiary flex items-center gap-1.5 mb-2">
          {icon}
          {title}
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {list.map(s => (
            <span key={s.start} className="h-10 rounded-xl bg-[var(--input)] border border-hairline flex items-center justify-center text-[14.5px] font-semibold tnum">
              {s.startTimeStr}
            </span>
          ))}
        </div>
      </div>
    );

  return (
    <div className="card p-4 sm:p-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
      {/* Month */}
      <div>
        {doctors.length > 1 && (
          <div className="mb-4">
            <Select ariaLabel="الطبيب" value={resourceId} onChange={setDoctorId} options={doctors.map(d => ({ value: d.id, label: d.name }))} />
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <button type="button" className="icon-btn bg-fill disabled:opacity-30" disabled={!canPrev} onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="الشهر السابق">
            <ChevronRight />
          </button>
          <span className="text-[16px] font-semibold">{monthLabel(month)}</span>
          <button type="button" className="icon-btn bg-fill disabled:opacity-30" disabled={!canNext} onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="الشهر التالي">
            <ChevronLeft />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEK_ORDER.map(d => (
            <span key={d} className="text-[11.5px] text-tertiary font-medium py-1">
              {DAY_SHORT[d]}
            </span>
          ))}
          {monthCells(month).map((d, i) => {
            if (!d) return <span key={i} />;
            const s = days?.[d];
            const outside = d < today || d > lastDay;
            const freeCount = s ? s.total - s.booked : 0;
            const open = !outside && s?.status === 'OPEN' && freeCount > 0;
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                disabled={outside}
                onClick={() => setChosen(d)}
                aria-pressed={selected}
                aria-label={`${formatArabicDate(d)}${open ? ` · ${arCount(freeCount, NOUNS.freeSlot)}` : ''}`}
                className={`relative h-12 rounded-2xl flex flex-col items-center justify-center text-[15px] font-semibold tnum ${
                  selected
                    ? 'bg-accent text-white shadow-[0_8px_20px_-10px_var(--accent)]'
                    : outside
                      ? 'text-tertiary opacity-40'
                      : !days
                        ? 'bg-fill animate-pulse'
                        : open
                          ? 'bg-[var(--input)] border border-hairline hover:border-accent/50'
                          : 'bg-fill text-tertiary'
                }`}
              >
                {Number(d.slice(8))}
                {open && <span className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-success'}`} />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[12.5px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success" />
            فيه أوقات متاحة
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-fill-strong" />
            مغلق أو ممتلئ
          </span>
        </div>
      </div>

      {/* Times of the chosen day (view only) */}
      <div className="lg:border-s lg:border-hairline lg:ps-6">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h3 className="text-[16px] font-semibold">{formatArabicDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {!loadingDay && free.length > 0 && <span className="text-[12.5px] text-success-ink font-medium">{arCount(free.length, NOUNS.freeSlot)}</span>}
        </div>
        {loadingDay ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-xl" />
            ))}
          </div>
        ) : free.length === 0 ? (
          <div className="py-10 text-center">
            <CalendarX2 className="w-9 h-9 text-tertiary mx-auto" />
            <p className="mt-2 text-secondary text-[15px]">
              {day.status === 'CLOSED'
                ? 'العيادة مغلقة في هذا اليوم.'
                : day.status === 'HOLIDAY'
                  ? `العيادة مغلقة: ${day.holiday || 'عطلة'}.`
                  : 'لا توجد أوقات متاحة في هذا اليوم.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {group('صباحاً', <Sun className="w-3.5 h-3.5" />, free.filter(s => s.startTimeStr < '12:00'))}
            {group('مساءً', <Moon className="w-3.5 h-3.5" />, free.filter(s => s.startTimeStr >= '12:00'))}
          </div>
        )}
        <p className="text-[12.5px] text-tertiary mt-5 leading-relaxed">هذه الأوقات للاطلاع فقط. للحجز ادخل برمز الدخول الخاص بك.</p>
        <Link href="/client" className="btn btn-primary w-full mt-3">
          احجز موعداً
        </Link>
      </div>
    </div>
  );
}
