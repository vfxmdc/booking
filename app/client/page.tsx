'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarPlus, Check, CheckCircle2, Clock, Hourglass, MapPin, Stethoscope } from 'lucide-react';
import type { Service, TimeSlot } from '@/lib/types';
import { useApp } from '../context/AppContext';
import SlotPicker from '../components/SlotPicker';
import { ErrorNote, Sheet, SheetFooter, Spinner } from '../components/ui';
import { api, downloadIcs } from '@/lib/web';
import { formatArabicDate, formatDuration, formatMoney, relativeDay, todayIn } from '@/lib/date';

export default function BookingPage() {
  const { settings, doctors } = useApp();
  const today = todayIn(settings?.timezone);

  const [chosenDoctor, setChosenDoctor] = useState('');
  const doctorId = chosenDoctor || doctors[0]?.id || '';
  const doctor = doctors.find(d => d.id === doctorId) || null;
  const [services, setServices] = useState<{ doctorId: string; list: Service[] } | null>(null);
  const [chosenService, setChosenService] = useState('');
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slot: TimeSlot; pending: boolean; serviceName?: string; price: number } | null>(null);

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    api<{ services: Service[] }>(`/api/services?resourceId=${doctorId}`)
      .then(d => !cancelled && setServices({ doctorId, list: d.services }))
      .catch(() => !cancelled && setServices({ doctorId, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  const serviceList = services?.doctorId === doctorId ? services.list : null;
  const serviceId = serviceList?.some(s => s.id === chosenService) ? chosenService : serviceList?.[0]?.id || '';
  const service = serviceList?.find(s => s.id === serviceId) || null;
  const price = service ? service.price : (doctor?.price ?? 0);
  const length = service?.durationMinutes || doctor?.slotDurationMinutes || 30;

  const book = async () => {
    if (!slot || !doctor) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ booking: { status: string } }>('/api/bookings', {
        method: 'POST',
        body: { resourceId: doctor.id, serviceId: serviceId || null, start: slot.start, patientNote: note },
      });
      setConfirmOpen(false);
      setDone({ slot, pending: res.booking.status === 'PENDING', serviceName: service?.name, price });
      setSlot(null);
      setNote('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!settings) return <div className="skeleton h-72 rounded-[22px] mt-4" />;
  if (doctors.length === 0) {
    return <div className="card p-10 mt-4 text-center text-secondary">الحجز عبر الموقع غير متاح حالياً. يرجى الاتصال بالعيادة.</div>;
  }

  if (done && doctor) {
    const date = done.slot.start.slice(0, 10);
    const rel = relativeDay(date, today);
    return (
      <div className="card p-7 sm:p-10 text-center mt-4 enter">
        <div
          className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
            done.pending ? 'bg-warning/15 text-warning-ink' : 'bg-success/15 text-success-ink'
          }`}
        >
          {done.pending ? <Hourglass className="w-10 h-10" strokeWidth={1.6} /> : <CheckCircle2 className="w-11 h-11" strokeWidth={1.6} />}
        </div>
        <h1 className="text-[26px] font-bold mt-5">{done.pending ? 'تم إرسال طلبك' : 'تم تأكيد موعدك'}</h1>
        <p className="text-secondary text-[15px] mt-1.5 max-w-sm mx-auto leading-relaxed">
          {done.pending
            ? 'ستراجع العيادة طلبك وتؤكده قريباً. تابع حالته من صفحة «مواعيدي».'
            : 'ننتظرك في الموعد. يمكنك إضافته إلى تقويم هاتفك.'}
        </p>

        <div className="inset mt-6 p-5 text-start max-w-sm mx-auto">
          <div className="text-[13px] font-semibold text-accent-ink">{rel !== formatArabicDate(date) ? rel : formatArabicDate(date, { weekday: 'long' })}</div>
          <div className="text-[18px] font-semibold">{formatArabicDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="text-[30px] font-bold tnum leading-tight mt-1">{done.slot.startTimeStr}</div>
          <div className="text-[14px] text-secondary mt-2">
            {doctor.name}
            {done.serviceName ? ` · ${done.serviceName}` : ''} · <span className="tnum">{formatMoney(done.price)}</span>
          </div>
          {settings.address && (
            <div className="text-[13.5px] text-secondary mt-1.5 flex items-start gap-1.5">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
              {settings.address}
            </div>
          )}
        </div>

        {settings.notice && <p className="text-[13.5px] text-secondary mt-5 max-w-sm mx-auto leading-relaxed">{settings.notice}</p>}

        <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() =>
              downloadIcs({
                title: `موعد في ${settings.clinicName}`,
                start: done.slot.start,
                end: done.slot.end,
                location: settings.address,
                description: `${doctor.name}${done.serviceName ? ` - ${done.serviceName}` : ''}`,
              })
            }
            className="btn btn-glass btn-lg"
          >
            <CalendarPlus />
            إضافة إلى التقويم
          </button>
          <Link href="/client/bookings" className="btn btn-primary btn-lg">
            مواعيدي
          </Link>
        </div>
        <button type="button" onClick={() => setDone(null)} className="text-accent-ink text-[14.5px] font-semibold mt-5">
          حجز موعد آخر
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-7 pt-2">
      <div>
        <p className="eyebrow">{settings.clinicName}</p>
        <h1 className="page-title">احجز موعدك</h1>
      </div>

      {doctors.length > 1 && (
        <section>
          <h2 className="section-title mb-3">الطبيب</h2>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {doctors.map(d => {
              const active = d.id === doctorId;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setChosenDoctor(d.id);
                    setSlot(null);
                  }}
                  className={`card card-hover p-4 text-start flex items-center gap-3 border-2 ${active ? '!border-accent' : ''}`}
                >
                  <span className="w-11 h-11 rounded-2xl bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shrink-0">
                    <Stethoscope className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15.5px] font-semibold truncate">{d.name}</span>
                    {d.description && <span className="block text-[13px] text-secondary truncate">{d.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {serviceList && serviceList.length > 1 && (
        <section>
          <h2 className="section-title mb-3">نوع الزيارة</h2>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {serviceList.map(s => {
              const active = s.id === serviceId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setChosenService(s.id);
                    setSlot(null);
                  }}
                  className={`card card-hover p-4 text-start flex items-start justify-between gap-3 border-2 ${active ? '!border-accent' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-accent bg-accent' : 'border-fill-strong'}`}
                        aria-hidden
                      >
                        {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-[15.5px] font-semibold">{s.name}</span>
                    </span>
                    {s.description && <span className="block text-[13px] text-secondary mt-1 leading-relaxed">{s.description}</span>}
                    <span className="flex items-center gap-1 text-[12.5px] text-tertiary mt-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(s.durationMinutes || doctor?.slotDurationMinutes || 30)}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold tnum shrink-0">{formatMoney(s.price)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title mb-3">اختر الوقت</h2>
        {serviceList ? (
          <SlotPicker resourceId={doctorId} serviceId={serviceId} value={slot} onChange={setSlot} />
        ) : (
          <div className="skeleton h-64 rounded-[22px]" />
        )}
      </section>

      {slot && doctor && (
        <div className="fixed z-30 inset-x-3 bottom-[calc(max(12px,env(safe-area-inset-bottom))+74px)] sm:bottom-6 no-print">
          <div className="max-w-3xl mx-auto glass-strong rounded-[24px] ps-5 pe-2.5 py-2.5 flex items-center justify-between gap-4 toast-in">
            <div className="min-w-0">
              <div className="text-[15.5px] font-semibold truncate">
                {relativeDay(slot.start.slice(0, 10), today)} · <span className="num">{slot.startTimeStr}</span>
              </div>
              <div className="text-[13px] text-secondary truncate">
                {service?.name || doctor.name} · {formatDuration(length)} · <span className="tnum">{formatMoney(price)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
              className="btn btn-primary btn-lg shrink-0"
            >
              متابعة
            </button>
          </div>
        </div>
      )}

      <Sheet open={confirmOpen && Boolean(slot && doctor)} onClose={() => setConfirmOpen(false)} title="تأكيد الحجز" subtitle="راجع التفاصيل ثم أكّد.">
        {slot && doctor && (
          <div className="space-y-4">
            <dl className="inset divide-y divide-hairline text-[15px]">
              {[
                ['الطبيب', doctor.name],
                ...(service ? [['نوع الزيارة', service.name]] : []),
                ['التاريخ', formatArabicDate(slot.start.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })],
                ['الساعة', <span key="t" className="num">{slot.startTimeStr}</span>],
                ['المدة', formatDuration(length)],
                ['المبلغ', <span key="p" className="tnum">{formatMoney(price)}</span>],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-secondary">{k}</dt>
                  <dd className="text-end font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <label className="block">
              <span className="text-[13px] font-medium text-secondary block mb-1.5 px-1">سبب الزيارة (اختياري)</span>
              <textarea className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="مثال: حمى منذ يومين" />
            </label>
            {(settings.notice || settings.requireApproval) && (
              <p className="text-[13px] text-secondary flex gap-2 px-1 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                <span>
                  {settings.requireApproval ? 'ستؤكد العيادة موعدك بعد مراجعته. ' : ''}
                  {settings.notice}
                </span>
              </p>
            )}
            <ErrorNote message={error} />
          </div>
        )}
        <SheetFooter>
          <button type="button" disabled={submitting} onClick={book} className="btn btn-primary btn-lg w-full">
            {submitting ? <Spinner className="w-5 h-5" /> : <Check />}
            {settings.requireApproval ? 'إرسال طلب الموعد' : 'تأكيد الموعد'}
          </button>
        </SheetFooter>
      </Sheet>
    </div>
  );
}
