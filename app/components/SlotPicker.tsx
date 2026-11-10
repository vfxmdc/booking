'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarX2, Moon, Sparkles, Sun } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { api, usePolling } from '@/lib/web';
import { NOUNS, addDays, arCount, formatArabicDate, relativeDay, todayIn } from '@/lib/date';
import type { DayStatus, DaySummary, TimeSlot } from '@/lib/types';

type Next = { date: string; slot: TimeSlot } | null;

interface Props {
  resourceId: string;
  serviceId: string;
  /** The appointment being moved (its own time does not count as taken) */
  excludeId?: string;
  value: TimeSlot | null;
  onChange: (slot: TimeSlot | null) => void;
}

/** Date strip with availability, then the free times of the chosen day. */
export default function SlotPicker({ resourceId, serviceId, excludeId, value, onChange }: Props) {
  const { settings } = useApp();
  const today = todayIn(settings?.timezone);
  const windowDays = Math.min(settings?.bookingWindowDays ?? 30, 60);
  const lastDay = addDays(today, windowDays);
  const scope = `${resourceId}|${serviceId}|${excludeId ?? ''}`;

  const [chosenDate, setChosenDate] = useState<{ scope: string; date: string } | null>(null);
  const [next, setNext] = useState<{ scope: string; next: Next } | null>(null);
  const [summary, setSummary] = useState<{ scope: string; days: DaySummary[] } | null>(null);
  const [day, setDay] = useState<{ key: string; slots: TimeSlot[]; status: DayStatus; holiday?: string } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const nextKnown = next?.scope === scope;
  const date = chosenDate?.scope === scope ? chosenDate.date : nextKnown ? (next.next?.date ?? today) : null;
  const dayKey = `${scope}|${date}`;

  useEffect(() => {
    if (!resourceId) return;
    let cancelled = false;
    const params = new URLSearchParams({ resourceId, serviceId });
    api<{ next: Next }>(`/api/availability/next?${params}`)
      .then(d => !cancelled && setNext({ scope, next: d.next }))
      .catch(() => !cancelled && setNext({ scope, next: null }));
    api<{ days: DaySummary[] }>(`/api/availability/summary?${new URLSearchParams({ resourceId, serviceId, from: today, to: lastDay })}`)
      .then(d => !cancelled && setSummary({ scope, days: d.days }))
      .catch(() => !cancelled && setSummary({ scope, days: [] }));
    return () => {
      cancelled = true;
    };
  }, [resourceId, serviceId, scope, today, lastDay]);

  const loadDay = useCallback(() => {
    if (!resourceId || !date) return;
    const params = new URLSearchParams({ resourceId, date, serviceId });
    if (excludeId) params.set('exclude', excludeId);
    const key = `${resourceId}|${serviceId}|${excludeId ?? ''}|${date}`;
    api<{ slots: TimeSlot[]; dayStatus: DayStatus; holidayTitle?: string }>(`/api/availability/slots?${params}`)
      .then(d => setDay({ key, slots: d.slots, status: d.dayStatus, holiday: d.holidayTitle }))
      .catch(() => setDay({ key, slots: [], status: 'OPEN' }));
  }, [resourceId, serviceId, excludeId, date]);
  usePolling(loadDay, 30000);

  // Keep the chosen day visible in the strip
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [date, summary]);

  const pick = (d: string) => {
    setChosenDate({ scope, date: d });
    if (value && !value.start.startsWith(d)) onChange(null);
  };

  const loading = !day || day.key !== dayKey;
  const free = loading ? [] : day.slots.filter(s => s.isAvailable);
  const morning = free.filter(s => s.startTimeStr < '12:00');
  const evening = free.filter(s => s.startTimeStr >= '12:00');
  const days = summary?.scope === scope ? summary.days : null;
  const nextSlot = nextKnown ? next.next : null;

  // A chosen time that just got booked by someone else is dropped
  const stale = Boolean(value && !loading && value.start.startsWith(date ?? '') && !free.some(s => s.start === value.start));
  useEffect(() => {
    if (stale) onChange(null);
  }, [stale, onChange]);

  const slotGroup = (title: string, icon: React.ReactNode, list: TimeSlot[]) =>
    list.length === 0 ? null : (
      <div>
        <p className="text-[12.5px] font-medium text-tertiary flex items-center gap-1.5 mb-2 px-1">
          {icon}
          {title}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {list.map(slot => {
            const selected = value?.start === slot.start;
            return (
              <button
                key={slot.start}
                type="button"
                onClick={() => onChange(selected ? null : slot)}
                aria-pressed={selected}
                className={`h-12 rounded-2xl text-[16px] font-semibold tnum ${
                  selected
                    ? 'bg-accent text-white shadow-[0_8px_20px_-8px_var(--accent)]'
                    : 'bg-[var(--input)] border border-hairline hover:border-accent/50 hover:text-accent-ink'
                }`}
              >
                {slot.startTimeStr}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      {nextSlot && !(value && value.start === nextSlot.slot.start) && (
        <button
          type="button"
          onClick={() => {
            setChosenDate({ scope, date: nextSlot.date });
            onChange(nextSlot.slot);
          }}
          className="card card-hover w-full p-4 flex items-center gap-3 text-start"
        >
          <span className="w-10 h-10 rounded-xl bg-accent/12 text-accent-ink flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12.5px] font-semibold text-accent-ink">أقرب موعد متاح</span>
            <span className="block text-[16px] font-semibold">
              {relativeDay(nextSlot.date, today)} · الساعة <span className="num">{nextSlot.slot.startTimeStr}</span>
            </span>
          </span>
          <span className="btn btn-sm btn-tinted shrink-0">اختيار</span>
        </button>
      )}

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3 px-0.5">
          <span className="text-[15px] font-semibold">{date ? formatArabicDate(date, { month: 'long', year: 'numeric' }) : 'اختر اليوم'}</span>
          {!loading && free.length > 0 && <span className="text-[12.5px] text-secondary">{arCount(free.length, NOUNS.freeSlot)}</span>}
        </div>

        <div ref={stripRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 snap-x">
          {!days
            ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="skeleton shrink-0 w-[66px] h-[86px] rounded-2xl" />)
            : days.map(s => {
                const selected = s.date === date;
                const freeCount = s.total - s.booked;
                const unavailable = s.status !== 'OPEN' || freeCount <= 0;
                const label = s.status === 'HOLIDAY' ? 'عطلة' : s.status === 'CLOSED' ? 'مغلق' : freeCount <= 0 ? 'ممتلئ' : `${freeCount} متاح`;
                return (
                  <button
                    key={s.date}
                    type="button"
                    data-selected={selected}
                    onClick={() => pick(s.date)}
                    className={`snap-start shrink-0 w-[66px] py-2.5 rounded-2xl flex flex-col items-center border ${
                      selected
                        ? 'bg-accent border-transparent text-white shadow-[0_10px_24px_-10px_var(--accent)]'
                        : unavailable
                          ? 'border-transparent bg-fill text-tertiary'
                          : 'border-hairline bg-[var(--input)] hover:border-accent/50'
                    }`}
                  >
                    <span className={`text-[12px] ${selected ? 'text-white/85' : 'text-secondary'}`}>
                      {s.date === today ? 'اليوم' : formatArabicDate(s.date, { weekday: 'short' })}
                    </span>
                    <span className="text-[21px] font-semibold leading-tight tnum">{Number(s.date.slice(8))}</span>
                    <span className={`text-[10.5px] font-medium mt-0.5 ${selected ? 'text-white/85' : unavailable ? '' : 'text-success-ink'}`}>{label}</span>
                  </button>
                );
              })}
        </div>

        <div className="mt-5">
          {!date || loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-2xl" />
              ))}
            </div>
          ) : free.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarX2 className="w-9 h-9 text-tertiary mx-auto" />
              <p className="mt-2 text-secondary text-[15px]">
                {day.status === 'CLOSED'
                  ? 'العيادة مغلقة في هذا اليوم.'
                  : day.status === 'HOLIDAY'
                    ? `العيادة مغلقة: ${day.holiday || 'عطلة'}.`
                    : day.status === 'OUT_OF_WINDOW'
                      ? 'لا يمكن الحجز في هذا التاريخ.'
                      : 'لم تعد هناك أوقات متاحة في هذا اليوم.'}
              </p>
              {nextSlot && nextSlot.date !== date && (
                <button type="button" onClick={() => pick(nextSlot.date)} className="btn btn-sm btn-tinted mt-4">
                  الانتقال إلى أقرب يوم متاح ({relativeDay(nextSlot.date, today)})
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {slotGroup('صباحاً', <Sun className="w-3.5 h-3.5" />, morning)}
              {slotGroup('مساءً', <Moon className="w-3.5 h-3.5" />, evening)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
