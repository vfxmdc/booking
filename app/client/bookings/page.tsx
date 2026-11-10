'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CalendarPlus, Check, Hourglass, MapPin, Phone, Plus, RefreshCw, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import SlotPicker from '@/app/components/SlotPicker';
import { EmptyState, ErrorNote, Sheet, SheetFooter, SkeletonList, Spinner } from '@/app/components/ui';
import { api, downloadIcs, telLink, usePolling } from '@/lib/web';
import { NOUNS, addMinutes, arCount, formatArabicDate, formatDuration, formatMoney, minutesBetween, nowIn, relativeDay, timeOf } from '@/lib/date';
import type { PatientBooking } from '@/lib/bookings';
import type { TimeSlot } from '@/lib/types';

export default function MyBookingsPage() {
  const { settings, toast, confirm } = useApp();
  const now = nowIn(settings?.timezone);
  const [bookings, setBookings] = useState<PatientBooking[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<PatientBooking | null>(null);

  const load = useCallback(() => {
    api<{ bookings: PatientBooking[] }>('/api/bookings')
      .then(d => setBookings(d.bookings))
      .catch(() => null);
  }, []);
  usePolling(load, 60000);

  if (!bookings || !settings) return <div className="pt-4"><SkeletonList rows={3} /></div>;

  const isUpcoming = (b: PatientBooking) => b.status !== 'CANCELLED' && b.endDateTime > now.dateTime;
  const upcoming = bookings.filter(isUpcoming).reverse();
  const history = bookings.filter(b => !isUpcoming(b));
  const hours = settings.cancelNoticeHours;
  const canChange = (b: PatientBooking) => !b.attended && addMinutes(now.dateTime, hours * 60) <= b.startDateTime;

  const cancel = async (b: PatientBooking) => {
    const ok = await confirm({
      title: 'إلغاء الموعد؟',
      message: `${formatArabicDate(b.startDateTime.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })} · ${timeOf(b.startDateTime)}`,
      confirmLabel: 'إلغاء الموعد',
      cancelLabel: 'إبقاء',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(b.id);
    try {
      await api(`/api/bookings/${b.id}`, { method: 'PATCH', body: { status: 'CANCELLED' } });
      toast('تم إلغاء الموعد');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-7 pt-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{upcoming.length ? arCount(upcoming.length, NOUNS.appointment) + ' قادمة' : settings.clinicName}</p>
          <h1 className="page-title">مواعيدي</h1>
        </div>
        <Link href="/client" className="btn btn-primary">
          <Plus />
          موعد جديد
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="لا توجد مواعيد قادمة"
          text="احجز موعدك القادم في أقل من دقيقة."
          action={
            <Link href="/client" className="btn btn-primary btn-sm">
              احجز موعداً
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {upcoming.map(b => {
            const date = b.startDateTime.slice(0, 10);
            const pending = b.status === 'PENDING';
            const changeable = canChange(b);
            return (
              <article key={b.id} className="card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-[60px] h-[64px] shrink-0 rounded-2xl bg-accent/12 text-accent-ink flex flex-col items-center justify-center leading-none">
                      <span className="text-[11.5px] font-semibold">{formatArabicDate(date, { month: 'short' })}</span>
                      <span className="text-[25px] font-bold mt-1 tnum">{Number(date.slice(8))}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-accent-ink">{relativeDay(date, now.date) !== formatArabicDate(date) ? relativeDay(date, now.date) : formatArabicDate(date, { weekday: 'long' })}</p>
                      <p className="text-[26px] font-bold tnum leading-tight">{timeOf(b.startDateTime)}</p>
                      <p className="text-[13px] text-secondary">{formatArabicDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    </div>
                  </div>
                  <span className={`badge badge-dot shrink-0 ${pending ? 'bg-warning/15 text-warning-ink' : 'bg-success/15 text-success-ink'}`}>
                    {pending ? 'بانتظار تأكيد العيادة' : 'مؤكد'}
                  </span>
                </div>

                <p className="text-[14px] text-secondary mt-4">
                  {b.resourceName}
                  {b.serviceName ? ` · ${b.serviceName}` : ''} · {formatDuration(minutesBetween(b.startDateTime, b.endDateTime))} ·{' '}
                  <span className="tnum">{formatMoney(b.price)}</span>
                </p>
                {settings.address && (
                  <p className="text-[13.5px] text-secondary mt-1 flex items-start gap-1.5">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    {settings.address}
                  </p>
                )}
                {pending && (
                  <p className="text-[13px] bg-warning/10 text-warning-ink rounded-xl px-3 py-2 mt-3 flex items-start gap-2 leading-relaxed">
                    <Hourglass className="w-4 h-4 shrink-0 mt-0.5" />
                    طلبك وصل إلى العيادة، وسيتحول إلى «مؤكد» بعد مراجعته.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() =>
                      downloadIcs({
                        title: `موعد في ${settings.clinicName}`,
                        start: b.startDateTime,
                        end: b.endDateTime,
                        location: settings.address,
                        description: `${b.resourceName}${b.serviceName ? ` - ${b.serviceName}` : ''}`,
                      })
                    }
                    className="btn btn-glass btn-sm"
                  >
                    <CalendarPlus />
                    إلى التقويم
                  </button>
                  {changeable ? (
                    <>
                      <button type="button" onClick={() => setMoving(b)} className="btn btn-tinted btn-sm">
                        <RefreshCw />
                        تغيير الموعد
                      </button>
                      <button type="button" onClick={() => cancel(b)} disabled={busy === b.id} className="btn btn-danger btn-sm">
                        <X />
                        إلغاء
                      </button>
                    </>
                  ) : (
                    settings.phone && (
                      <a href={telLink(settings.phone)} className="btn btn-plain btn-sm">
                        <Phone />
                        للتغيير أو الإلغاء اتصل بالعيادة
                      </a>
                    )
                  )}
                </div>
              </article>
            );
          })}
          {hours > 0 && (
            <p className="text-[12.5px] text-tertiary px-2">
              يمكن تغيير الموعد أو إلغاؤه عبر الموقع حتى {hours === 1 ? 'ساعة' : arCount(hours, NOUNS.hour)} قبل موعده.
            </p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-secondary px-2 mb-2">السجل</h2>
          <div className="card overflow-hidden divide-y divide-hairline">
            {history.map(b => {
              const label =
                b.status === 'CANCELLED'
                  ? b.declined
                    ? { text: 'لم يُقبل الطلب', cls: 'bg-danger/12 text-danger-ink' }
                    : b.cancelledBy === 'CLIENT'
                      ? { text: 'ألغيته', cls: 'bg-fill-strong text-secondary' }
                      : { text: 'ألغته العيادة', cls: 'bg-danger/12 text-danger-ink' }
                  : b.noShow
                    ? { text: 'لم تحضر', cls: 'bg-fill-strong text-secondary' }
                    : { text: 'تمت الزيارة', cls: 'bg-success/15 text-success-ink' };
              return (
                <div key={b.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium">
                      {formatArabicDate(b.startDateTime.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })} · <span className="num">{timeOf(b.startDateTime)}</span>
                    </div>
                    <div className="text-[13px] text-secondary truncate">{b.serviceName || b.resourceName}</div>
                  </div>
                  <span className={`badge shrink-0 ${label.cls}`}>{label.text}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {moving && (
        <MoveSheet
          booking={moving}
          onClose={() => setMoving(null)}
          onMoved={pendingAgain => {
            setMoving(null);
            toast(pendingAgain ? 'تم إرسال طلب تغيير الموعد. ستؤكده العيادة قريباً.' : 'تم تغيير موعدك');
            load();
          }}
        />
      )}
    </div>
  );
}

function MoveSheet({ booking, onClose, onMoved }: { booking: PatientBooking; onClose: () => void; onMoved: (pending: boolean) => void }) {
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!slot) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ booking: PatientBooking }>(`/api/bookings/${booking.id}`, { method: 'PATCH', body: { start: slot.start } });
      onMoved(res.booking.status === 'PENDING');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title="تغيير الموعد"
      subtitle={
        <>
          الموعد الحالي: {formatArabicDate(booking.startDateTime.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          <span className="num">{timeOf(booking.startDateTime)}</span>
        </>
      }
    >
      <SlotPicker resourceId={booking.resourceId} serviceId={booking.serviceId || ''} excludeId={booking.id} value={slot} onChange={setSlot} />
      <div className="mt-4">
        <ErrorNote message={error} />
      </div>
      <SheetFooter>
        <button type="button" onClick={save} disabled={!slot || saving} className="btn btn-primary btn-lg w-full">
          {saving ? <Spinner className="w-5 h-5" /> : <Check />}
          {slot ? (
            <>
              نقل الموعد إلى {formatArabicDate(slot.start.slice(0, 10), { weekday: 'long' })} <span className="num">{slot.startTimeStr}</span>
            </>
          ) : (
            'اختر الوقت الجديد'
          )}
        </button>
      </SheetFooter>
    </Sheet>
  );
}
