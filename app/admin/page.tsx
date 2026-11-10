'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, CalendarX2, Check, Hourglass, Inbox, Phone, Plus, Printer, UserCheck, Wallet } from 'lucide-react';
import type { Booking } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from './admin-context';
import { BookingRow, DateStepper, SearchField, matchesQuery, useBookingActions } from './kit';
import { Avatar, EmptyState, PageHeader, Segmented, SkeletonList, StatTile } from '@/app/components/ui';
import { api, telLink, usePolling } from '@/lib/web';
import { NOUNS, addDays, arCount, dayOfWeek, formatArabicDate, formatDuration, formatMoney, isDate, minutesBetween, nowIn, relativeDay, timeOf } from '@/lib/date';

export default function TodayPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <Today />
    </Suspense>
  );
}

function greeting(minutes: number) {
  if (minutes < 12 * 60) return 'صباح الخير';
  if (minutes < 18 * 60) return 'مساء الخير';
  return 'مساء النور';
}

function Today() {
  const router = useRouter();
  const { settings, doctors } = useApp();
  const { admin, version, openAppointment, newAppointment } = useAdmin();
  const { confirmBooking, declineBooking, setOutcome } = useBookingActions();
  const params = useSearchParams();
  const now = nowIn(settings?.timezone);
  const today = now.date;

  const paramDate = params.get('date');
  const [date, setDate] = useState(isDate(paramDate) ? paramDate : today);
  // Follow ?date= when it changes (calendar links, notifications)
  const [seenParam, setSeenParam] = useState(paramDate);
  if (paramDate !== seenParam) {
    setSeenParam(paramDate);
    const target = isDate(paramDate) ? paramDate : today;
    if (target !== date) setDate(target);
  }

  const [day, setDay] = useState<{ date: string; bookings: Booking[] } | null>(null);
  const [requests, setRequests] = useState<Booking[] | null>(null);
  const [resourceId, setResourceId] = useState('ALL');
  const [query, setQuery] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    void version; // reload after changes made anywhere in the dashboard
    api<{ bookings: Booking[] }>(`/api/bookings?from=${date}&to=${date}`)
      .then(d => setDay({ date, bookings: d.bookings }))
      .catch(() => null);
    api<{ bookings: Booking[] }>(`/api/bookings?status=PENDING&from=${today}`)
      .then(d => setRequests(d.bookings))
      .catch(() => null);
  }, [date, today, version]);
  usePolling(load, 20000);

  const changeDate = (d: string) => {
    setDate(d);
    window.history.replaceState(null, '', d === today ? '/admin' : `/admin?date=${d}`);
  };

  const run = async (b: Booking, fn: () => Promise<unknown>) => {
    setBusyId(b.id);
    await fn();
    setBusyId(null);
  };

  const loading = !day || day.date !== date;
  const all = loading ? [] : day.bookings.filter(b => resourceId === 'ALL' || b.resourceId === resourceId);
  const active = all.filter(b => b.status !== 'CANCELLED');
  const visible = (showCancelled ? all : active).filter(b => matchesQuery(b, query));
  const cancelledCount = all.length - active.length;
  const isToday = date === today;
  const attended = active.filter(b => b.attended);
  const noShows = active.filter(b => b.noShow).length;
  const remaining = active.filter(b => !b.attended && !b.noShow && b.endDateTime > now.dateTime).length;
  const revenue = attended.reduce((s, b) => s + (b.price || 0), 0);
  const expected = active.filter(b => !b.noShow).reduce((s, b) => s + (b.price || 0), 0);
  const nextUp = isToday ? active.find(b => !b.attended && !b.noShow && b.endDateTime > now.dateTime) : undefined;
  const openRequests = (requests || []).filter(b => b.endDateTime > now.dateTime);

  const hours = doctors.find(d => resourceId === 'ALL' || d.id === resourceId)?.hours;
  const closedDay = hours ? (hours[dayOfWeek(date)] || []).length === 0 : false;
  const relative = relativeDay(date, today);
  const title = isToday ? 'اليوم' : relative !== formatArabicDate(date) ? relative : formatArabicDate(date, { weekday: 'long' });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${greeting(now.minutes)}، ${admin.name}`}
        title={title}
        subtitle={formatArabicDate(date, { weekday: isToday || relative !== formatArabicDate(date) ? 'long' : undefined, day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            <DateStepper
              onPrev={() => changeDate(addDays(date, -1))}
              onNext={() => changeDate(addDays(date, 1))}
              onToday={() => changeDate(today)}
              todayDisabled={isToday}
              prevLabel="اليوم السابق"
              nextLabel="اليوم التالي"
            />
            <button type="button" onClick={() => window.print()} className="icon-btn glass !w-11 !h-11 hidden sm:inline-flex" title="طباعة قائمة اليوم" aria-label="طباعة قائمة اليوم">
              <Printer />
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 no-print">
        <StatTile
          label={isToday ? 'مواعيد اليوم' : 'المواعيد'}
          value={active.length}
          icon={<CalendarCheck />}
          hint={isToday ? (remaining ? `${arCount(remaining, NOUNS.appointment)} متبقية` : 'لا مواعيد متبقية') : arCount(active.length, NOUNS.appointment)}
        />
        <StatTile
          label="بانتظار التأكيد"
          value={openRequests.length}
          tone="warning"
          icon={<Hourglass />}
          hint={openRequests.length ? 'اضغط للمراجعة' : 'لا طلبات جديدة'}
          onClick={() => router.push('/admin/bookings?tab=requests')}
        />
        <StatTile
          label="الحضور"
          value={attended.length}
          tone="success"
          icon={<UserCheck />}
          hint={noShows ? `لم يحضر: ${noShows}` : active.length ? `من أصل ${active.length}` : '—'}
        />
        <StatTile
          label={attended.length ? 'المداخيل' : 'المداخيل المتوقعة'}
          value={formatMoney(attended.length ? revenue : expected)}
          tone="violet"
          icon={<Wallet />}
          hint={attended.length && expected > revenue ? `المتوقع: ${formatMoney(expected)}` : 'الدفع في العيادة'}
        />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          {nextUp && (
            <div className="card p-5 relative overflow-hidden no-print">
              <div className="absolute inset-0 bg-linear-to-l from-accent/12 via-accent/[0.04] to-transparent pointer-events-none" />
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <button type="button" onClick={() => openAppointment(nextUp)} className="flex items-center gap-4 min-w-0 text-start">
                  <Avatar name={nextUp.clientName} size={56} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-accent-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-success live-dot" />
                      {nextUp.startDateTime <= now.dateTime ? 'الآن' : 'المريض التالي'} · <span className="num">{timeOf(nextUp.startDateTime)}</span>
                      {nextUp.startDateTime > now.dateTime && <span className="font-medium text-secondary">· بعد {formatDuration(minutesBetween(now.dateTime, nextUp.startDateTime))}</span>}
                    </p>
                    <p className="text-[21px] font-semibold leading-snug truncate mt-0.5">{nextUp.clientName}</p>
                    <p className="text-[14px] text-secondary truncate">
                      {nextUp.serviceName || 'موعد'}
                      {nextUp.patientNote ? ` · «${nextUp.patientNote}»` : ''}
                    </p>
                  </div>
                </button>
                <div className="flex gap-2 shrink-0">
                  {nextUp.clientPhone && (
                    <a href={telLink(nextUp.clientPhone)} className="btn btn-glass">
                      <Phone />
                      اتصال
                    </a>
                  )}
                  <button type="button" onClick={() => run(nextUp, () => setOutcome(nextUp, 'ATTENDED'))} disabled={busyId === nextUp.id} className="btn btn-primary">
                    <Check />
                    حضر
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between no-print">
            {doctors.length > 1 ? (
              <Segmented
                label="الطبيب"
                value={resourceId}
                onChange={setResourceId}
                options={[{ value: 'ALL', label: 'كل الأطباء' }, ...doctors.map(d => ({ value: d.id, label: d.name }))]}
              />
            ) : (
              <h2 className="section-title px-1">{isToday ? 'جدول اليوم' : 'جدول اليوم المختار'}</h2>
            )}
            <div className="flex items-center gap-2">
              <SearchField value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الهاتف" className="flex-1 sm:w-60" />
              {cancelledCount > 0 && (
                <button type="button" className="chip h-10" data-active={showCancelled} onClick={() => setShowCancelled(v => !v)}>
                  الملغاة <span className="tnum">({cancelledCount})</span>
                </button>
              )}
            </div>
          </div>

          {closedDay && active.length === 0 && !loading && (
            <p className="text-[14px] text-secondary inset px-4 py-3">العيادة مغلقة في هذا اليوم حسب أوقات العمل. يمكنك رغم ذلك إضافة موعد بوقت مخصص.</p>
          )}

          {loading ? (
            <SkeletonList rows={5} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<CalendarX2 />}
              title={query ? 'لا نتائج مطابقة' : 'لا توجد مواعيد'}
              text={query ? 'جرّب اسماً أو رقماً آخر.' : isToday ? 'جدولك فارغ اليوم.' : 'لا مواعيد في هذا اليوم.'}
              action={
                !query && (
                  <button type="button" onClick={() => newAppointment({ date })} className="btn btn-primary btn-sm">
                    <Plus />
                    إضافة موعد
                  </button>
                )
              }
            />
          ) : (
            <div className="card overflow-hidden divide-y divide-hairline">
              {visible.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  now={now.dateTime}
                  today={today}
                  highlight={nextUp?.id === b.id}
                  busy={busyId === b.id}
                  onOpen={() => openAppointment(b)}
                  onConfirm={() => run(b, () => confirmBooking(b))}
                  onToggleAttended={() => run(b, () => setOutcome(b, b.attended ? 'NONE' : 'ATTENDED'))}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4 no-print">
          <section className="card overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
              <h2 className="section-title flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-[10px] bg-warning/15 text-warning-ink flex items-center justify-center">
                  <Inbox className="w-4 h-4" />
                </span>
                طلبات بانتظار التأكيد
              </h2>
              {openRequests.length > 0 && (
                <Link href="/admin/bookings?tab=requests" className="text-[13px] text-accent-ink font-semibold shrink-0">
                  عرض الكل
                </Link>
              )}
            </div>
            {!requests ? (
              <div className="px-4 pb-4 space-y-2">
                <div className="skeleton h-14" />
                <div className="skeleton h-14" />
              </div>
            ) : openRequests.length === 0 ? (
              <p className="px-4 pb-5 text-[13.5px] text-secondary leading-relaxed">
                لا توجد طلبات جديدة. ستظهر هنا المواعيد التي يحجزها المرضى عبر الموقع لتأكيدها أو رفضها.
              </p>
            ) : (
              <div className="divide-y divide-hairline border-t border-hairline">
                {openRequests.slice(0, 5).map(b => (
                  <div key={b.id} className="px-4 py-3">
                    <button type="button" onClick={() => openAppointment(b)} className="w-full flex items-center gap-3 text-start">
                      <Avatar name={b.clientName} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-semibold truncate">{b.clientName}</span>
                        <span className="block text-[12.5px] text-secondary truncate">
                          {relativeDay(b.startDateTime.slice(0, 10), today)} · <span className="num">{timeOf(b.startDateTime)}</span> · {b.serviceName || 'موعد'}
                        </span>
                      </span>
                    </button>
                    <div className="flex gap-2 mt-2.5 ps-[50px]">
                      <button type="button" disabled={busyId === b.id} onClick={() => run(b, () => confirmBooking(b))} className="btn btn-sm btn-primary flex-1">
                        <Check />
                        تأكيد
                      </button>
                      <button type="button" disabled={busyId === b.id} onClick={() => run(b, () => declineBooking(b))} className="btn btn-sm btn-plain">
                        رفض
                      </button>
                    </div>
                  </div>
                ))}
                {openRequests.length > 5 && (
                  <Link href="/admin/bookings?tab=requests" className="block px-4 py-3 text-[13.5px] text-accent-ink font-semibold">
                    عرض كل الطلبات <span className="tnum">({openRequests.length})</span>
                  </Link>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
