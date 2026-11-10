'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Booking, BlockRule, WeeklyHours } from '@/lib/types';
import { DAY_NAMES, DAY_SHORT, WEEK_ORDER, addDays, dayOfWeek, fromMinutes, minutesOf, timeOf, toMinutes } from '@/lib/date';
import { STATE_META, visitState } from './status';

const HOUR_PX = 64;

interface Placed {
  booking: Booking;
  start: number;
  end: number;
  col: number;
  cols: number;
}

/** Side-by-side columns for overlapping appointments (e.g. two doctors at once). */
function layoutDay(bookings: Booking[]): Placed[] {
  const items = bookings
    .map(b => ({
      booking: b,
      start: minutesOf(b.startDateTime),
      end: b.endDateTime.slice(0, 10) === b.startDateTime.slice(0, 10) ? minutesOf(b.endDateTime) : 1440,
      col: 0,
      cols: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columns: number[] = [];
    for (const item of group) {
      let col = columns.findIndex(end => end <= item.start);
      if (col === -1) {
        col = columns.length;
        columns.push(item.end);
      } else columns[col] = item.end;
      item.col = col;
    }
    for (const item of group) item.cols = columns.length;
    placed.push(...group);
    group = [];
    groupEnd = -1;
  };
  for (const item of items) {
    if (group.length && item.start >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return placed;
}

const blocksOn = (blocks: BlockRule[], date: string) => blocks.filter(b => date >= b.startDate && date <= b.endDate);

interface WeekProps {
  weekStart: string;
  today: string;
  /** Clinic "now", "YYYY-MM-DDTHH:mm" */
  now: string;
  bookings: Booking[];
  blocks: BlockRule[];
  hours?: WeeklyHours;
  /** Click on empty time snaps to this many minutes */
  step: number;
  onOpen: (booking: Booking) => void;
  onCreate: (start: string) => void;
}

/** Week time grid, Saturday first (RTL: Saturday on the right). */
export function WeekView({ weekStart, today, now, bookings, blocks, hours, step, onOpen, onCreate }: WeekProps) {
  const [hover, setHover] = useState<{ date: string; minute: number } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const visible = bookings.filter(b => b.status !== 'CANCELLED');

  // Visible hours: the working day, stretched to include any appointment outside it
  let first = 24 * 60;
  let last = 0;
  for (const d of days) {
    for (const r of hours?.[dayOfWeek(d)] || []) {
      first = Math.min(first, toMinutes(r.start));
      last = Math.max(last, toMinutes(r.end));
    }
  }
  for (const b of visible) {
    first = Math.min(first, minutesOf(b.startDateTime));
    last = Math.max(last, b.endDateTime.slice(0, 10) === b.startDateTime.slice(0, 10) ? minutesOf(b.endDateTime) : 1440);
  }
  if (first >= last) {
    first = 8 * 60;
    last = 18 * 60;
  }
  const startHour = Math.max(0, Math.floor(first / 60) - (first % 60 === 0 ? 1 : 0));
  const endHour = Math.min(24, Math.ceil(last / 60) + 1);
  const span = (endHour - startHour) * 60;
  const y = (minute: number) => ((minute - startHour * 60) / 60) * HOUR_PX;
  const nowMinute = minutesOf(now);

  const minuteAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = startHour * 60 + ((e.clientY - rect.top) / HOUR_PX) * 60;
    return Math.min(endHour * 60 - step, Math.max(startHour * 60, Math.floor(raw / step) * step));
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[780px]">
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-hairline">
            <div />
            {days.map(d => {
              const isToday = d === today;
              const count = visible.filter(b => b.startDateTime.startsWith(d)).length;
              return (
                <Link key={d} href={`/admin?date=${d}`} className="py-3 text-center hover:bg-fill rounded-t-xl" title="فتح جدول اليوم">
                  <div className={`text-[12px] font-medium ${isToday ? 'text-accent-ink' : 'text-secondary'}`}>{DAY_SHORT[dayOfWeek(d)]}</div>
                  <div
                    className={`mx-auto mt-1 w-9 h-9 rounded-full flex items-center justify-center text-[16px] font-semibold tnum ${
                      isToday ? 'bg-accent text-white shadow-[0_6px_16px_-6px_var(--accent)]' : d < today ? 'text-tertiary' : ''
                    }`}
                  >
                    {Number(d.slice(8))}
                  </div>
                  <div className="text-[11px] text-tertiary mt-1 h-4">{count ? `${count} موعد` : ''}</div>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))]" style={{ height: (span / 60) * HOUR_PX }}>
            <div className="relative">
              {Array.from({ length: endHour - startHour }, (_, i) => startHour + i).map(h => (
                <span key={h} className="absolute end-2.5 -translate-y-1/2 text-[11px] text-tertiary tnum" style={{ top: y(h * 60) }}>
                  {h > startHour ? `${String(h).padStart(2, '0')}:00` : ''}
                </span>
              ))}
            </div>

            {days.map(d => {
              const ranges = hours?.[dayOfWeek(d)] || [];
              const dayBlocks = blocksOn(blocks, d);
              const placed = layoutDay(visible.filter(b => b.startDateTime.startsWith(d)));
              const ghost = hover && hover.date === d ? hover.minute : null;
              return (
                <div
                  key={d}
                  className="relative border-s border-hairline cursor-pointer week-col"
                  onMouseMove={e => {
                    const minute = minuteAt(e);
                    if (!hover || hover.date !== d || hover.minute !== minute) setHover({ date: d, minute });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={e => onCreate(`${d}T${fromMinutes(minuteAt(e))}`)}
                >
                  {/* Working hours look open; the rest of the day is hatched */}
                  {ranges.map(r => (
                    <div
                      key={r.start}
                      className="absolute inset-x-0 bg-[var(--glass-strong)] dark:bg-white/[0.03]"
                      style={{ top: y(toMinutes(r.start)), height: y(toMinutes(r.end)) - y(toMinutes(r.start)) }}
                    />
                  ))}
                  <div className="hour-lines" aria-hidden />
                  {dayBlocks.map(b => {
                    const fullDay = b.startDate < d || b.endDate > d || (b.startTime === '00:00' && b.endTime === '23:59');
                    const top = fullDay ? 0 : y(toMinutes(b.startTime));
                    const bottom = fullDay ? y(endHour * 60) : y(toMinutes(b.endTime));
                    return (
                      <div key={b.id} className="absolute inset-x-0 bg-danger/[0.07] border-y border-danger/20 px-1.5 pt-1" style={{ top: Math.max(0, top), height: Math.max(18, bottom - Math.max(0, top)) }}>
                        <span className="block text-[11px] font-medium text-danger-ink truncate">{b.title}</span>
                      </div>
                    );
                  })}

                  {ghost !== null && (
                    <div
                      className="absolute inset-x-1 rounded-lg border border-dashed border-accent/60 bg-accent/8 text-[11px] font-semibold text-accent-ink px-1.5 flex items-center pointer-events-none"
                      style={{ top: y(ghost), height: Math.max(20, (step / 60) * HOUR_PX - 2) }}
                    >
                      + <span className="num ms-1">{fromMinutes(ghost)}</span>
                    </div>
                  )}

                  {placed.map(({ booking: b, start, end, col, cols }) => {
                    const meta = STATE_META[visitState(b, now)];
                    const height = Math.max(22, y(end) - y(start) - 2);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onOpen(b);
                        }}
                        onMouseMove={e => e.stopPropagation()}
                        className={`absolute rounded-lg border-s-[3px] px-1.5 py-1 text-start overflow-hidden shadow-[0_1px_2px_rgb(0_0_0/0.06)] hover:z-10 hover:shadow-md ${meta.block}`}
                        style={{
                          top: y(start) + 1,
                          height,
                          insetInlineStart: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                        }}
                        title={`${timeOf(b.startDateTime)} ${b.clientName}`}
                      >
                        <span className="block text-[11px] font-semibold tnum leading-tight opacity-80">{timeOf(b.startDateTime)}</span>
                        <span className="block text-[12.5px] font-semibold leading-tight truncate">{b.clientName}</span>
                        {height > 54 && <span className="block text-[11px] opacity-70 truncate">{b.serviceName || ''}</span>}
                      </button>
                    );
                  })}

                  {d === today && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 && (
                    <div className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: y(nowMinute) }}>
                      <div className="h-[2px] bg-danger" />
                      <div className="absolute -top-[4px] -start-[5px] w-2.5 h-2.5 rounded-full bg-danger" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MonthProps {
  month: string;
  today: string;
  now: string;
  bookings: Booking[];
  blocks: BlockRule[];
  hours?: WeeklyHours;
  onOpen: (booking: Booking) => void;
}

/** Month grid (Saturday first). Each day opens its agenda; each appointment opens its details. */
export function MonthView({ month, today, now, bookings, blocks, hours, onOpen }: MonthProps) {
  const first = `${month}-01`;
  const lead = WEEK_ORDER.indexOf(dayOfWeek(first));
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);

  const byDay = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (b.status === 'CANCELLED') continue;
    const d = b.startDateTime.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(b);
  }

  return (
    <div className="card p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1">
        {WEEK_ORDER.map(d => (
          <div key={d} className="text-center text-[12px] sm:text-[13px] font-medium text-secondary py-1.5">
            <span className="sm:hidden">{DAY_SHORT[d]}</span>
            <span className="hidden sm:inline">{DAY_NAMES[d]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const list = (byDay.get(d) || []).sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
          const pending = list.filter(b => b.status === 'PENDING').length;
          const holiday = blocksOn(blocks, d)[0];
          const closed = hours ? (hours[dayOfWeek(d)] || []).length === 0 : false;
          const isToday = d === today;
          return (
            <div
              key={d}
              className={`min-h-[68px] sm:min-h-[118px] rounded-2xl p-1.5 sm:p-2 flex flex-col gap-1 border transition-colors ${
                isToday ? 'border-accent/50 bg-accent/[0.06]' : 'border-hairline hover:bg-fill'
              } ${closed && !list.length ? 'opacity-50' : ''}`}
            >
              <Link href={`/admin?date=${d}`} className="flex items-center justify-between gap-1" title="فتح جدول اليوم">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[13.5px] font-semibold tnum ${
                    isToday ? 'bg-accent text-white' : d < today ? 'text-tertiary' : ''
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                {pending > 0 && <span className="w-2 h-2 rounded-full bg-warning sm:hidden" aria-label="طلبات بانتظار التأكيد" />}
                {list.length > 0 && <span className="sm:hidden text-[11px] font-semibold text-accent-ink tnum">{list.length}</span>}
              </Link>
              {holiday && (
                <span className="text-[11px] rounded-md px-1.5 py-0.5 bg-danger/10 text-danger-ink truncate" title={holiday.title}>
                  {holiday.title}
                </span>
              )}
              <div className="hidden sm:flex flex-col gap-0.5">
                {list.slice(0, 3).map(b => {
                  const meta = STATE_META[visitState(b, now)];
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpen(b)}
                      className="flex items-center gap-1.5 text-[11.5px] leading-tight rounded-md px-1 py-[3px] hover:bg-fill-strong text-start min-w-0"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.bar}`} />
                      <span className="tnum text-secondary shrink-0">{timeOf(b.startDateTime)}</span>
                      <span className="truncate font-medium">{b.clientName}</span>
                    </button>
                  );
                })}
                {list.length > 3 && (
                  <Link href={`/admin?date=${d}`} className="text-[11.5px] font-semibold text-accent-ink px-1">
                    +{list.length - 3} أخرى
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
