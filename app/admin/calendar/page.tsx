'use client';

import { useCallback, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { MonthView, WeekView } from '@/app/components/CalendarView';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from '../admin-context';
import { DateStepper } from '../kit';
import { PageHeader, Segmented } from '@/app/components/ui';
import { api, usePolling } from '@/lib/web';
import { NOUNS, addDays, arCount, formatArabicDate, monthLabel, nowIn, shiftMonth, startOfWeek } from '@/lib/date';
import type { BlockRule, Booking, WeeklyHours } from '@/lib/types';

type View = 'week' | 'month';
const VIEW_KEY = 'clinic_calendar_view';

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

export default function CalendarPage() {
  const { settings, doctors } = useApp();
  const { version, openAppointment, newAppointment } = useAdmin();
  const now = nowIn(settings?.timezone);
  const today = now.date;
  // Rendered only in the browser (after the staff session check), so localStorage is available
  const [view, setView] = useState<View>(savedView);
  const [anchor, setAnchor] = useState(today);
  const [resourceId, setResourceId] = useState('ALL');
  const [data, setData] = useState<{ key: string; bookings: Booking[] } | null>(null);
  const [blocks, setBlocks] = useState<BlockRule[]>([]);

  const weekStart = startOfWeek(anchor);
  const month = anchor.slice(0, 7);
  const from = view === 'week' ? weekStart : `${month}-01`;
  const to = view === 'week' ? addDays(weekStart, 6) : addDays(`${shiftMonth(month, 1)}-01`, -1);
  const key = `${from}|${to}`;

  const load = useCallback(() => {
    void version;
    api<{ bookings: Booking[] }>(`/api/bookings?from=${from}&to=${to}`)
      .then(d => setData({ key: `${from}|${to}`, bookings: d.bookings }))
      .catch(() => null);
    api<{ blockRules: BlockRule[] }>('/api/availability')
      .then(d => setBlocks(d.blockRules))
      .catch(() => null);
  }, [from, to, version]);
  usePolling(load, 30000);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const bookings = data?.key === key ? data.bookings : [];
  const filtered = resourceId === 'ALL' ? bookings : bookings.filter(b => b.resourceId === resourceId);
  const filteredBlocks = resourceId === 'ALL' ? blocks : blocks.filter(b => b.resourceId === 'ALL' || b.resourceId === resourceId);
  const shown = doctors.filter(d => resourceId === 'ALL' || d.id === resourceId);
  const hours: WeeklyHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const d of shown) for (let day = 0; day < 7; day++) hours[day].push(...(d.hours[day] || []));
  const step = Math.min(30, ...shown.map(d => d.slotDurationMinutes || 30));
  const count = filtered.filter(b => b.status !== 'CANCELLED').length;

  const weekEnd = addDays(weekStart, 6);
  const title =
    view === 'month'
      ? monthLabel(month)
      : weekStart.slice(0, 7) === weekEnd.slice(0, 7)
        ? `${Number(weekStart.slice(8))} – ${formatArabicDate(weekEnd, { day: 'numeric', month: 'long', year: 'numeric' })}`
        : `${formatArabicDate(weekStart, { day: 'numeric', month: 'long' })} – ${formatArabicDate(weekEnd, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const inCurrent = view === 'week' ? startOfWeek(today) === weekStart : today.slice(0, 7) === month;

  const move = (delta: number) =>
    setAnchor(view === 'week' ? addDays(weekStart, delta * 7) : `${shiftMonth(month, delta)}-01`);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={data?.key === key ? `${arCount(count, NOUNS.appointment)} ${view === 'week' ? 'هذا الأسبوع' : 'هذا الشهر'}` : 'التقويم'}
        title={title}
        actions={
          <>
            {doctors.length > 1 && (
              <Segmented
                label="الطبيب"
                value={resourceId}
                onChange={setResourceId}
                options={[{ value: 'ALL', label: 'الكل' }, ...doctors.map(d => ({ value: d.id, label: d.name }))]}
              />
            )}
            <Segmented
              label="طريقة العرض"
              value={view}
              onChange={changeView}
              options={[
                { value: 'week', label: 'أسبوع', icon: <CalendarRange className="w-4 h-4" /> },
                { value: 'month', label: 'شهر', icon: <CalendarDays className="w-4 h-4" /> },
              ]}
            />
            <DateStepper
              onPrev={() => move(-1)}
              onNext={() => move(1)}
              onToday={() => setAnchor(today)}
              todayDisabled={inCurrent}
              prevLabel={view === 'week' ? 'الأسبوع السابق' : 'الشهر السابق'}
              nextLabel={view === 'week' ? 'الأسبوع التالي' : 'الشهر التالي'}
            />
          </>
        }
      />

      {view === 'week' ? (
        <WeekView
          weekStart={weekStart}
          today={today}
          now={now.dateTime}
          bookings={filtered}
          blocks={filteredBlocks}
          hours={hours}
          step={step}
          onOpen={openAppointment}
          onCreate={start => newAppointment({ start })}
        />
      ) : (
        <MonthView month={month} today={today} now={now.dateTime} bookings={filtered} blocks={filteredBlocks} hours={hours} onOpen={openAppointment} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12.5px] text-secondary">
        {[
          ['bg-warning', 'بانتظار التأكيد'],
          ['bg-accent', 'مؤكد'],
          ['bg-success', 'حضر'],
          ['bg-danger', 'لم يحضر'],
        ].map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cls}`} />
            {label}
          </span>
        ))}
        <span className="text-tertiary">{view === 'week' ? 'اضغط على وقت فارغ لإضافة موعد.' : 'اضغط على رقم اليوم لفتح جدوله.'}</span>
      </div>
    </div>
  );
}
