'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CheckCheck, Download, Inbox, ListChecks, MessageSquareText, Plus } from 'lucide-react';
import type { Booking } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from '../admin-context';
import { BookingRow, SearchField, matchesQuery, useBookingActions } from '../kit';
import { STATE_META, visitState } from '@/app/components/status';
import { Avatar, EmptyState, PageHeader, Segmented, SkeletonList } from '@/app/components/ui';
import { api, downloadCsv, usePolling } from '@/lib/web';
import { NOUNS, arCount, formatArabicDate, formatMoney, nowIn, relativeDay, timeOf } from '@/lib/date';

type Tab = 'requests' | 'upcoming' | 'past' | 'cancelled' | 'all';
const TABS: Tab[] = ['requests', 'upcoming', 'past', 'cancelled', 'all'];
const PAGE = 120;

export default function BookingsPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <Bookings />
    </Suspense>
  );
}

function Bookings() {
  const { settings, doctors, toast, confirm } = useApp();
  const { version, pending, refresh, openAppointment, newAppointment } = useAdmin();
  const { confirmBooking, declineBooking, setOutcome } = useBookingActions();
  const params = useSearchParams();
  const now = nowIn(settings?.timezone);

  const paramTab = params.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(paramTab && TABS.includes(paramTab) ? paramTab : pending > 0 ? 'requests' : 'upcoming');
  const [seenParam, setSeenParam] = useState(paramTab);
  if (paramTab !== seenParam) {
    setSeenParam(paramTab);
    if (paramTab && TABS.includes(paramTab)) setTab(paramTab);
  }

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [query, setQuery] = useState('');
  const [resourceId, setResourceId] = useState('ALL');
  const [limit, setLimit] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const load = useCallback(() => {
    void version;
    api<{ bookings: Booking[] }>('/api/bookings')
      .then(d => setBookings(d.bookings))
      .catch(() => null);
  }, [version]);
  usePolling(load, 30000);

  const scoped = useMemo(
    () => (bookings || []).filter(b => (resourceId === 'ALL' || b.resourceId === resourceId) && matchesQuery(b, query)),
    [bookings, resourceId, query]
  );
  const requests = scoped.filter(b => b.status === 'PENDING' && b.endDateTime > now.dateTime);

  const list = useMemo(() => {
    const items = scoped.filter(b => {
      if (tab === 'requests') return b.status === 'PENDING' && b.endDateTime > now.dateTime;
      if (tab === 'cancelled') return b.status === 'CANCELLED';
      if (tab === 'upcoming') return b.status !== 'CANCELLED' && b.endDateTime > now.dateTime;
      if (tab === 'past') return b.status !== 'CANCELLED' && b.endDateTime <= now.dateTime;
      return true;
    });
    return tab === 'requests' || tab === 'upcoming' ? items : [...items].reverse();
  }, [scoped, tab, now.dateTime]);

  const groups = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of list.slice(0, limit)) {
      const d = b.startDateTime.slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(b);
    }
    return [...map.entries()];
  }, [list, limit]);

  const run = async (b: Booking, fn: () => Promise<unknown>) => {
    setBusyId(b.id);
    await fn();
    setBusyId(null);
  };

  const confirmAll = async () => {
    const ok = await confirm({
      title: `تأكيد ${arCount(requests.length, NOUNS.request)}؟`,
      message: 'ستظهر هذه المواعيد للمرضى كمواعيد مؤكدة.',
      confirmLabel: 'تأكيد الكل',
    });
    if (!ok) return;
    setBulk(true);
    let done = 0;
    for (const b of requests) {
      try {
        await api(`/api/bookings/${b.id}`, { method: 'PATCH', body: { status: 'CONFIRMED' } });
        done++;
      } catch {
        /* reported below */
      }
    }
    setBulk(false);
    refresh();
    toast(done === requests.length ? `تم تأكيد ${arCount(done, NOUNS.appointment)}` : `تم تأكيد ${done} من ${requests.length}. حاول مجدداً للباقي.`, done === requests.length ? 'success' : 'error');
  };

  const exportCsv = () => {
    downloadCsv(`appointments-${now.date}.csv`, [
      ['التاريخ', 'الوقت', 'المريض', 'الهاتف', 'الطبيب', 'نوع الزيارة', 'الحالة', 'السعر', 'المصدر', 'سبب الزيارة', 'ملاحظة داخلية'],
      ...list.map(b => [
        b.startDateTime.slice(0, 10),
        timeOf(b.startDateTime),
        b.clientName,
        b.clientPhone,
        b.resourceName,
        b.serviceName || '',
        STATE_META[visitState(b, now.dateTime)].label,
        b.price,
        b.source === 'CLIENT' ? 'عبر الموقع' : 'العيادة',
        b.patientNote || '',
        b.notes || '',
      ]),
    ]);
  };

  const dayLabel = (d: string) => {
    const rel = relativeDay(d, now.date);
    const full = formatArabicDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
    return rel === formatArabicDate(d) ? full : `${rel} · ${full}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={bookings ? `${arCount(scoped.filter(b => b.status !== 'CANCELLED' && b.endDateTime > now.dateTime).length, NOUNS.appointment)} قادمة` : 'سجل المواعيد'}
        title="المواعيد"
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={!list.length} className="btn btn-glass" title="تنزيل ملف Excel">
              <Download />
              تصدير
            </button>
            <button type="button" onClick={() => newAppointment()} className="btn btn-primary hidden sm:inline-flex">
              <Plus />
              موعد جديد
            </button>
          </>
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <Segmented
          label="تصفية المواعيد"
          value={tab}
          onChange={t => {
            setTab(t);
            setLimit(PAGE);
          }}
          options={[
            { value: 'requests', label: 'طلبات جديدة', count: requests.length },
            { value: 'upcoming', label: 'القادمة' },
            { value: 'past', label: 'السابقة' },
            { value: 'cancelled', label: 'الملغاة' },
            { value: 'all', label: 'الكل' },
          ]}
        />
        <div className="flex items-center gap-2">
          {doctors.length > 1 && (
            <select className="input h-10 rounded-full w-auto text-[14px]" value={resourceId} onChange={e => setResourceId(e.target.value)} aria-label="الطبيب">
              <option value="ALL">كل الأطباء</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <SearchField value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الهاتف أو الخدمة" className="flex-1 lg:w-72" />
        </div>
      </div>

      {!bookings ? (
        <SkeletonList rows={6} />
      ) : tab === 'requests' ? (
        requests.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={query ? 'لا نتائج مطابقة' : 'لا توجد طلبات جديدة'}
            text={
              settings?.requireApproval
                ? 'عندما يحجز مريض عبر الموقع، يظهر طلبه هنا لتأكيده أو رفضه.'
                : 'التأكيد التلقائي مفعّل: تُؤكَّد حجوزات المرضى مباشرة. يمكن تغيير ذلك من الإعدادات ← قواعد الحجز.'
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[14px] text-secondary">مواعيد حجزها المرضى عبر الموقع وتنتظر موافقتك.</p>
              {requests.length > 1 && (
                <button type="button" onClick={confirmAll} disabled={bulk} className="btn btn-sm btn-tinted shrink-0">
                  <CheckCheck />
                  {bulk ? 'جاري التأكيد…' : 'تأكيد الكل'}
                </button>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {requests.map(b => (
                <div key={b.id} className="card p-4 flex flex-col gap-3">
                  <button type="button" onClick={() => openAppointment(b)} className="flex items-start gap-3 text-start">
                    <Avatar name={b.clientName} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold truncate">{b.clientName}</span>
                      <span className="block text-[13.5px] text-secondary">
                        {dayLabel(b.startDateTime.slice(0, 10))} · <span className="num">{timeOf(b.startDateTime)}</span>
                      </span>
                      <span className="block text-[13px] text-tertiary">
                        {b.serviceName || 'موعد'} · <span className="tnum">{formatMoney(b.price)}</span>
                        {b.clientPhone && (
                          <>
                            {' '}
                            · <span className="num">{b.clientPhone}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                  {b.patientNote && (
                    <p className="text-[13.5px] bg-fill rounded-xl px-3 py-2 flex items-start gap-2 leading-relaxed">
                      <MessageSquareText className="w-4 h-4 mt-0.5 text-accent shrink-0" />
                      {b.patientNote}
                    </p>
                  )}
                  <div className="flex gap-2 mt-auto">
                    <button type="button" disabled={busyId === b.id || bulk} onClick={() => run(b, () => confirmBooking(b))} className="btn btn-primary flex-1">
                      <Check />
                      تأكيد
                    </button>
                    <button type="button" disabled={busyId === b.id || bulk} onClick={() => run(b, () => declineBooking(b))} className="btn btn-plain">
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={query ? 'لا نتائج مطابقة' : 'لا توجد مواعيد هنا'}
          text={query ? 'جرّب اسماً أو رقماً آخر.' : undefined}
          action={
            !query && tab === 'upcoming' ? (
              <button type="button" onClick={() => newAppointment()} className="btn btn-primary btn-sm">
                <Plus />
                إضافة موعد
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="text-[13px] font-semibold text-secondary px-2 mb-2 flex items-center justify-between">
                <span>{dayLabel(day)}</span>
                <span className="text-tertiary font-medium">{arCount(items.length, NOUNS.appointment)}</span>
              </h2>
              <div className="card overflow-hidden divide-y divide-hairline">
                {items.map(b => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    now={now.dateTime}
                    today={now.date}
                    busy={busyId === b.id}
                    onOpen={() => openAppointment(b)}
                    onConfirm={() => run(b, () => confirmBooking(b))}
                    onToggleAttended={() => run(b, () => setOutcome(b, b.attended ? 'NONE' : 'ATTENDED'))}
                  />
                ))}
              </div>
            </section>
          ))}
          {list.length > limit && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setLimit(l => l + PAGE)} className="btn btn-glass">
                عرض المزيد
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
