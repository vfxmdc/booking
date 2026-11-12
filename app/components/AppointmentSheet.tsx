'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  X,
  Phone,
  MessageCircle,
  Pencil,
  RotateCcw,
  Search,
  UserPlus,
  Sun,
  Moon,
  Globe,
  MessageSquareText,
  History,
  Stethoscope,
  Tag,
  Wallet,
  CalendarClock,
} from 'lucide-react';
import { Sheet, SheetFooter, Field, ErrorNote, Segmented, Avatar, Spinner } from './ui';
import { DatePicker, Select } from './pickers';
import { StateBadge, visitState, describeEvent, appointmentMessage } from './status';
import { useApp } from '@/app/context/AppContext';
import { api, telLink, whatsappLink } from '@/lib/web';
import {
  addDays,
  formatArabicDate,
  formatDuration,
  formatMoney,
  minutesBetween,
  nowIn,
  relativeDay,
  timeOf,
  todayIn,
} from '@/lib/date';
import type { Booking, Client, DayStatus, Resource, Service, TimeSlot } from '@/lib/types';

export type AppointmentSheetState =
  | { mode: 'view'; id: string; booking?: Booking }
  | { mode: 'new'; date?: string; start?: string; clientId?: string }
  | null;

interface Props {
  state: AppointmentSheetState;
  onClose: () => void;
  /** Called after any change so open pages reload */
  onChanged: () => void;
  onOpenPatient: (clientId: string) => void;
}

/** One drawer for everything about an appointment: details, confirm/decline, attendance, edit, new. */
export default function AppointmentSheet({ state, onClose, onChanged, onOpenPatient }: Props) {
  if (!state) return null;
  if (state.mode === 'new') {
    return (
      <Sheet open onClose={onClose} title="موعد جديد" subtitle="اختر المريض والوقت" variant="drawer" size="lg">
        <AppointmentForm
          defaults={state}
          onSaved={() => {
            onChanged();
            onClose();
          }}
          onCancel={onClose}
        />
      </Sheet>
    );
  }
  return <AppointmentDetails key={state.id} id={state.id} initial={state.booking} onClose={onClose} onChanged={onChanged} onOpenPatient={onOpenPatient} />;
}

// ───────────────────────── Details ─────────────────────────

function AppointmentDetails({
  id,
  initial,
  onClose,
  onChanged,
  onOpenPatient,
}: {
  id: string;
  initial?: Booking;
  onClose: () => void;
  onChanged: () => void;
  onOpenPatient: (clientId: string) => void;
}) {
  const { settings, doctors, toast, confirm } = useApp();
  const [booking, setBooking] = useState<Booking | null>(initial ?? null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ booking: Booking }>(`/api/bookings/${id}`)
      .then(d => !cancelled && setBooking(d.booking))
      .catch(err => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!booking) {
    return (
      <Sheet open onClose={onClose} title="الموعد" variant="drawer">
        {error ? <ErrorNote message={error} /> : <div className="py-16 flex justify-center text-accent"><Spinner className="w-6 h-6" /></div>}
      </Sheet>
    );
  }

  const tz = settings?.timezone;
  const now = nowIn(tz);
  const state = visitState(booking, now.dateTime);
  const date = booking.startDateTime.slice(0, 10);
  const relative = relativeDay(date, now.date);
  const duration = minutesBetween(booking.startDateTime, booking.endDateTime);
  const cancelled = booking.status === 'CANCELLED';
  const canRecordVisit = !cancelled && date <= now.date;
  const noteDraft = note ?? booking.notes;
  const noteDirty = note !== null && note !== booking.notes;

  const patch = async (body: Record<string, unknown>, key: string): Promise<Booking | null> => {
    setBusy(key);
    setError(null);
    try {
      const res = await api<{ booking: Booking }>(`/api/bookings/${booking.id}`, { method: 'PATCH', body });
      setBooking(res.booking);
      onChanged();
      return res.booking;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** Undo for cancel / decline, from the toast. Only clashes are checked when restoring. */
  const restore = async (status: Booking['status']) => {
    try {
      const res = await api<{ booking: Booking }>(`/api/bookings/${booking.id}`, { method: 'PATCH', body: { status, custom: true } });
      setBooking(res.booking);
      onChanged();
      toast('تمت استعادة الموعد');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const confirmBooking = async () => {
    const updated = await patch({ status: 'CONFIRMED' }, 'confirm');
    if (!updated) return;
    toast(
      'تم تأكيد الموعد',
      updated.clientPhone
        ? {
            action: {
              label: 'إبلاغ عبر واتساب',
              onClick: () => window.open(whatsappLink(updated.clientPhone, appointmentMessage(updated, settings)), '_blank', 'noopener'),
            },
          }
        : undefined
    );
  };

  const decline = async () => {
    const ok = await confirm({
      title: 'رفض طلب الموعد؟',
      message: `${booking.clientName} · ${formatArabicDate(date)} ${timeOf(booking.startDateTime)}\nسيظهر للمريض أن الطلب لم يُقبل، ويصبح الوقت متاحاً من جديد.`,
      confirmLabel: 'رفض الطلب',
      tone: 'danger',
    });
    if (!ok) return;
    if (await patch({ status: 'CANCELLED' }, 'decline')) {
      toast('تم رفض الطلب', { action: { label: 'تراجع', onClick: () => restore('PENDING') } });
    }
  };

  const cancelBooking = async () => {
    const previous = booking.status;
    const ok = await confirm({
      title: 'إلغاء هذا الموعد؟',
      message: `${booking.clientName} · ${formatArabicDate(date)} ${timeOf(booking.startDateTime)}`,
      confirmLabel: 'إلغاء الموعد',
      cancelLabel: 'إبقاء',
      tone: 'danger',
    });
    if (!ok) return;
    if (await patch({ status: 'CANCELLED' }, 'cancel')) {
      toast('تم إلغاء الموعد', { action: { label: 'تراجع', onClick: () => restore(previous) } });
    }
  };

  const setOutcome = async (outcome: 'NONE' | 'ATTENDED' | 'NO_SHOW') => {
    const updated = await patch({ outcome }, 'outcome');
    if (updated && outcome === 'ATTENDED') toast(`تم تسجيل حضور ${updated.clientName}`);
  };

  const saveNote = async () => {
    if (await patch({ notes: noteDraft }, 'note')) {
      setNote(null);
      toast('تم حفظ الملاحظة');
    }
  };

  const stamp = (iso: string) =>
    new Intl.DateTimeFormat('ar-DZ', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
      new Date(iso)
    );

  if (editing) {
    return (
      <Sheet open onClose={onClose} title="تعديل الموعد" subtitle={booking.clientName} variant="drawer" size="lg">
        <AppointmentForm
          booking={booking}
          onSaved={saved => {
            setBooking(saved);
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`موعد ${booking.clientName}`}
      variant="drawer"
      header={
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={booking.clientName} size={46} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpenPatient(booking.clientId)}
              className="block max-w-full truncate text-start text-[18px] font-semibold leading-snug hover:text-accent-ink"
              title="فتح ملف المريض"
            >
              {booking.clientName}
            </button>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <StateBadge state={state} />
              {booking.source === 'CLIENT' && (
                <span className="badge bg-fill text-secondary">
                  <Globe className="w-3 h-3" />
                  عبر الموقع
                </span>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* When */}
        <div className="inset p-4 flex items-center gap-4">
          <div className="w-[58px] h-[58px] shrink-0 rounded-2xl bg-accent/12 text-accent-ink flex flex-col items-center justify-center leading-none">
            <span className="text-[11px] font-semibold">{formatArabicDate(date, { month: 'short' })}</span>
            <span className="text-[23px] font-bold mt-1 tnum">{Number(date.slice(8))}</span>
          </div>
          <div className="min-w-0">
            {relative !== formatArabicDate(date) && <div className="text-[12.5px] font-semibold text-accent-ink">{relative}</div>}
            <div className="text-[16px] font-semibold">{formatArabicDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="text-[14.5px] text-secondary mt-0.5">
              <span className="num">{timeOf(booking.startDateTime)}</span> – <span className="num">{timeOf(booking.endDateTime)}</span> ·{' '}
              {formatDuration(duration)}
            </div>
          </div>
        </div>

        {state === 'PENDING' && (
          <p className="text-[13.5px] bg-warning/12 text-warning-ink rounded-2xl px-4 py-3 leading-relaxed">
            طلب جديد من المريض عبر الموقع. أكّده ليظهر له كموعد مؤكد، أو ارفضه ليصبح الوقت متاحاً.
          </p>
        )}

        {canRecordVisit && (
          <Field as="div" label="الحضور">
            <Segmented
              full
              label="الحضور"
              value={booking.attended ? 'ATTENDED' : booking.noShow ? 'NO_SHOW' : 'NONE'}
              onChange={setOutcome}
              options={[
                { value: 'NONE', label: 'لم يُسجَّل' },
                { value: 'ATTENDED', label: 'حضر', icon: <Check className="w-4 h-4" /> },
                { value: 'NO_SHOW', label: 'لم يحضر', icon: <X className="w-4 h-4" /> },
              ]}
            />
          </Field>
        )}

        {booking.clientPhone && (
          <div className="grid grid-cols-2 gap-2">
            <a href={telLink(booking.clientPhone)} className="btn btn-plain">
              <Phone />
              اتصال
            </a>
            <a href={whatsappLink(booking.clientPhone, appointmentMessage(booking, settings))} target="_blank" rel="noreferrer" className="btn btn-plain">
              <MessageCircle />
              واتساب
            </a>
          </div>
        )}

        <dl className="inset divide-y divide-hairline text-[14.5px]">
          <DetailRow icon={<Tag />} label="نوع الزيارة" value={booking.serviceName || 'موعد عادي'} />
          {doctors.length > 1 && <DetailRow icon={<Stethoscope />} label="الطبيب" value={booking.resourceName} />}
          <DetailRow icon={<Wallet />} label="السعر" value={<span className="tnum">{formatMoney(booking.price)}</span>} />
          <DetailRow icon={<Phone />} label="الهاتف" value={booking.clientPhone ? <span className="num">{booking.clientPhone}</span> : '—'} />
        </dl>

        {booking.patientNote && (
          <div className="rounded-2xl bg-accent/8 border border-accent/15 px-4 py-3">
            <div className="text-[12.5px] font-semibold text-accent-ink flex items-center gap-1.5">
              <MessageSquareText className="w-3.5 h-3.5" />
              سبب الزيارة كما كتبه المريض
            </div>
            <p className="mt-1 text-[15px] leading-relaxed">{booking.patientNote}</p>
          </div>
        )}

        <Field
          label="ملاحظة داخلية"
          hint="لا يراها المريض."
          aside={
            noteDirty && (
              <button type="button" onClick={saveNote} disabled={busy === 'note'} className="text-accent-ink text-[13px] font-semibold">
                {busy === 'note' ? 'جاري الحفظ…' : 'حفظ الملاحظة'}
              </button>
            )
          }
        >
          <textarea className="input" value={noteDraft} onChange={e => setNote(e.target.value)} placeholder="مثال: يحضر نتائج التحاليل" maxLength={1000} />
        </Field>

        {booking.log && booking.log.length > 0 && (
          <section>
            <h3 className="text-[13px] font-medium text-secondary px-1 mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4" />
              سجل الموعد
            </h3>
            <ol className="ms-2 border-s border-hairline space-y-3.5">
              {[...booking.log].reverse().map(e => (
                <li key={`${e.at}-${e.action}`} className="relative ps-5">
                  <span className="absolute -start-[5px] top-2 w-2.5 h-2.5 rounded-full bg-accent/70 ring-4 ring-[var(--glass-strong)]" />
                  <div className="text-[14px] leading-snug">{describeEvent(e)}</div>
                  <div className="text-[12px] text-tertiary mt-0.5">{stamp(e.at)}</div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <ErrorNote message={error} />
      </div>

      <SheetFooter>
        {state === 'PENDING' ? (
          <div className="flex gap-2">
            <button onClick={confirmBooking} disabled={Boolean(busy)} className="btn btn-primary btn-lg flex-1">
              {busy === 'confirm' ? <Spinner className="w-4 h-4" /> : <Check />}
              تأكيد الموعد
            </button>
            <button onClick={decline} disabled={Boolean(busy)} className="btn btn-danger btn-lg">
              رفض
            </button>
            <button onClick={() => setEditing(true)} className="btn btn-plain btn-lg px-4" aria-label="تعديل" title="تعديل">
              <Pencil />
            </button>
          </div>
        ) : cancelled ? (
          <div className="flex gap-2">
            <button onClick={() => restore('CONFIRMED')} disabled={Boolean(busy)} className="btn btn-primary btn-lg flex-1">
              <RotateCcw />
              إعادة تفعيل الموعد
            </button>
            <button onClick={() => setEditing(true)} className="btn btn-plain btn-lg">
              <CalendarClock />
              وقت آخر
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="btn btn-glass btn-lg flex-1">
              <Pencil />
              تعديل الموعد
            </button>
            <button onClick={cancelBooking} disabled={Boolean(busy)} className="btn btn-danger btn-lg">
              إلغاء
            </button>
          </div>
        )}
      </SheetFooter>
    </Sheet>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="flex items-center gap-2.5 text-secondary [&>svg]:w-4 [&>svg]:h-4 [&>svg]:text-tertiary">
        {icon}
        {label}
      </dt>
      <dd className="text-end font-medium min-w-0 truncate">{value}</dd>
    </div>
  );
}

// ───────────────────────── Create / edit ─────────────────────────

type ClientRow = Client & { stats?: { visits: number } };

function AppointmentForm({
  booking,
  defaults,
  onSaved,
  onCancel,
}: {
  booking?: Booking;
  defaults?: { date?: string; start?: string; clientId?: string };
  onSaved: (booking: Booking) => void;
  onCancel: () => void;
}) {
  const { settings, toast } = useApp();
  const today = todayIn(settings?.timezone);

  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [clientId, setClientId] = useState(booking?.clientId ?? defaults?.clientId ?? '');
  const [query, setQuery] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const [resourceId, setResourceId] = useState(booking?.resourceId ?? '');
  const [serviceId, setServiceId] = useState(booking?.serviceId ?? '');
  const [date, setDate] = useState(() => {
    if (booking) return booking.startDateTime.slice(0, 10);
    const d = defaults?.start?.slice(0, 10) ?? defaults?.date;
    return d && d >= today ? d : today;
  });
  const [start, setStart] = useState(booking?.startDateTime ?? defaults?.start ?? '');
  const [timeMode, setTimeMode] = useState<'SLOTS' | 'CUSTOM'>('SLOTS');
  const [customTime, setCustomTime] = useState(defaults?.start ? timeOf(defaults.start) : booking ? timeOf(booking.startDateTime) : '');
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [notes, setNotes] = useState(booking?.notes ?? '');
  const [status, setStatus] = useState<'CONFIRMED' | 'PENDING'>(booking?.status === 'PENDING' ? 'PENDING' : 'CONFIRMED');

  const [slotData, setSlotData] = useState<{ key: string; slots: TimeSlot[]; dayStatus: DayStatus } | null>(null);
  const [slotNonce, setSlotNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ clients: ClientRow[] }>('/api/clients'),
      api<{ resources: Resource[] }>('/api/resources'),
      api<{ services: Service[] }>('/api/services'),
    ])
      .then(([c, r, s]) => {
        if (cancelled) return;
        const doctors = r.resources.filter(x => x.bookingMode === 'TIME_SLOT');
        setClients(c.clients);
        setResources(doctors);
        setServices(s.services);
        const doctor = doctors.find(d => d.isActive) || doctors[0];
        setResourceId(id => id || doctor?.id || '');
        if (!booking) setServiceId(id => id || s.services.find(x => !x.resourceId || x.resourceId === doctor?.id)?.id || '');
      })
      .catch(err => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [booking]);

  const doctorServices = useMemo(() => services.filter(s => !s.resourceId || s.resourceId === resourceId), [services, resourceId]);
  const resource = resources.find(r => r.id === resourceId);
  const service = doctorServices.find(s => s.id === serviceId) || null;
  const selectedClient = clients?.find(c => c.id === clientId);
  const baseDuration = service?.durationMinutes || resource?.slotDurationMinutes || 30;
  const customDuration = durationOverride ?? (booking ? minutesBetween(booking.startDateTime, booking.endDateTime) : baseDuration);

  const slotKey = `${resourceId}|${date}|${serviceId}|${slotNonce}`;
  useEffect(() => {
    if (!resourceId || !date) return;
    let cancelled = false;
    const params = new URLSearchParams({ resourceId, date, serviceId });
    if (booking) params.set('exclude', booking.id);
    api<{ slots: TimeSlot[]; dayStatus: DayStatus }>(`/api/availability/slots?${params}`)
      .then(d => !cancelled && setSlotData({ key: slotKey, slots: d.slots, dayStatus: d.dayStatus }))
      .catch(() => !cancelled && setSlotData({ key: slotKey, slots: [], dayStatus: 'OPEN' }));
    return () => {
      cancelled = true;
    };
  }, [resourceId, date, serviceId, booking, slotKey]);

  const loadingSlots = !slotData || slotData.key !== slotKey;
  const slots = loadingSlots ? [] : slotData.slots;
  const dayStatus = loadingSlots ? 'OPEN' : slotData.dayStatus;
  const free = slots.filter(s => s.isAvailable);
  const keepsCurrentTime = Boolean(booking && start === booking.startDateTime && date === booking.startDateTime.slice(0, 10));
  const currentOffGrid = keepsCurrentTime && !free.some(s => s.start === start);
  const morning = free.filter(s => s.startTimeStr < '12:00');
  const evening = free.filter(s => s.startTimeStr >= '12:00');

  const finalStart =
    timeMode === 'CUSTOM'
      ? customTime
        ? `${date}T${customTime}`
        : ''
      : start.startsWith(date) && (free.some(s => s.start === start) || keepsCurrentTime)
        ? start
        : '';

  const matches = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 6);
    const digits = q.replace(/\D/g, '');
    return clients
      .filter(c => c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
      .slice(0, 8);
  }, [clients, query]);

  const pickDate = (d: string) => {
    setDate(d);
    if (booking && d === booking.startDateTime.slice(0, 10)) setStart(booking.startDateTime);
  };

  const save = async () => {
    setError(null);
    if (!isNew && !clientId) return setError('اختر المريض أو أضف مريضاً جديداً.');
    if (isNew && newName.trim().length < 2) return setError('أدخل اسم المريض.');
    if (!finalStart) return setError('اختر وقت الموعد.');
    setSaving(true);
    try {
      const body: Record<string, unknown> = { notes, status };
      const timeChanged =
        !booking ||
        timeMode === 'CUSTOM' ||
        finalStart !== booking.startDateTime ||
        resourceId !== booking.resourceId ||
        (serviceId || null) !== booking.serviceId;
      if (timeChanged) {
        Object.assign(body, { resourceId, serviceId: serviceId || null, start: finalStart, custom: timeMode === 'CUSTOM' });
        if (timeMode === 'CUSTOM') body.durationMinutes = customDuration;
      }
      if (isNew) body.newClient = { name: newName, phone: newPhone };
      else if (!booking || clientId !== booking.clientId) body.clientId = clientId;

      const res = booking
        ? await api<{ booking: Booking }>(`/api/bookings/${booking.id}`, { method: 'PATCH', body })
        : await api<{ booking: Booking }>('/api/bookings', { method: 'POST', body });
      toast(booking ? 'تم حفظ التعديلات' : 'تمت إضافة الموعد');
      onSaved(res.booking);
    } catch (err) {
      setError((err as Error).message);
      setSlotNonce(n => n + 1);
    } finally {
      setSaving(false);
    }
  };

  const slotGrid = (title: string, icon: React.ReactNode, list: TimeSlot[]) =>
    list.length === 0 ? null : (
      <div>
        <p className="text-[12.5px] font-medium text-tertiary flex items-center gap-1.5 mb-2 px-1">
          {icon}
          {title}
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
          {list.map(s => (
            <button
              key={s.start}
              type="button"
              onClick={() => setStart(s.start)}
              aria-pressed={start === s.start}
              className={`h-10 rounded-xl text-[14.5px] font-medium tnum ${
                start === s.start
                  ? 'bg-accent text-white shadow-[0_6px_16px_-8px_var(--accent)]'
                  : 'bg-[var(--input)] border border-hairline hover:border-accent/50'
              }`}
            >
              {s.startTimeStr}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Patient */}
      <section>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[13px] font-medium text-secondary">المريض</span>
          {!booking && (
            <button type="button" onClick={() => setIsNew(v => !v)} className="text-accent-ink text-[13.5px] font-semibold flex items-center gap-1">
              {isNew ? (
                'اختيار مريض مسجّل'
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  مريض جديد
                </>
              )}
            </button>
          )}
        </div>

        {isNew ? (
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="input" placeholder="الاسم الكامل" value={newName} onChange={e => setNewName(e.target.value)} data-autofocus />
            <input className="input" placeholder="رقم الهاتف" type="tel" inputMode="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
          </div>
        ) : selectedClient ? (
          <div className="inset px-3 py-2.5 flex items-center gap-3">
            <Avatar name={selectedClient.name} size={38} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold truncate">{selectedClient.name}</div>
              <div className="text-[13px] text-secondary">
                <span className="num">{selectedClient.phone || '—'}</span>
              </div>
            </div>
            <button type="button" onClick={() => setClientId('')} className="btn btn-sm btn-plain">
              تغيير
            </button>
          </div>
        ) : clientId && !clients ? (
          <div className="skeleton h-[60px] rounded-[18px]" />
        ) : (
          <div>
            <div className="relative">
              <Search className="w-4 h-4 text-tertiary absolute top-1/2 -translate-y-1/2 start-3.5" />
              <input
                className="input ps-10"
                placeholder="ابحث بالاسم أو رقم الهاتف"
                value={query}
                onChange={e => setQuery(e.target.value)}
                data-autofocus
              />
            </div>
            <div className="inset mt-2 overflow-hidden max-h-60 overflow-y-auto divide-y divide-hairline">
              {!clients ? (
                <div className="p-3 space-y-2">
                  <div className="skeleton h-9" />
                  <div className="skeleton h-9" />
                </div>
              ) : matches.length === 0 ? (
                query.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(true);
                      setNewName(query.trim());
                    }}
                    className="w-full px-4 py-3 text-start text-accent-ink text-[14.5px] font-medium"
                  >
                    + إضافة «{query.trim()}» كمريض جديد
                  </button>
                ) : (
                  <p className="px-4 py-3 text-[14px] text-secondary">لا يوجد مرضى بعد. اضغط «مريض جديد».</p>
                )
              ) : (
                matches.map(c => (
                  <button key={c.id} type="button" onClick={() => setClientId(c.id)} className="row w-full px-3 py-2.5 flex items-center gap-3 text-start">
                    <Avatar name={c.name} size={32} />
                    <span className="flex-1 min-w-0 text-[14.5px] truncate">{c.name}</span>
                    <span className="num text-[13px] text-secondary">{c.phone}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {resources.length > 1 && (
        <Field as="div" label="الطبيب">
          <Segmented
            label="الطبيب"
            value={resourceId}
            onChange={v => {
              setResourceId(v);
              setStart('');
            }}
            options={resources.map(r => ({ value: r.id, label: r.name }))}
          />
        </Field>
      )}

      {doctorServices.length > 0 && (
        <Field as="div" label="نوع الزيارة">
          <div className="flex flex-wrap gap-2">
            {doctorServices.map(s => (
              <button key={s.id} type="button" data-active={serviceId === s.id} onClick={() => setServiceId(s.id)} className="chip">
                {s.name}
                <span className="opacity-70 tnum">· {formatMoney(s.price)}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Day */}
      <Field as="div" label="اليوم" hint={formatArabicDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
        <div className="flex flex-wrap items-center gap-2">
          {[0, 1, 2].map(i => {
            const d = addDays(today, i);
            return (
              <button key={d} type="button" data-active={date === d} onClick={() => pickDate(d)} className="chip">
                {i === 0 ? 'اليوم' : i === 1 ? 'غداً' : formatArabicDate(d, { weekday: 'long' })}
              </button>
            );
          })}
          <div className="w-56">
            <DatePicker ariaLabel="تاريخ آخر" className="h-9 rounded-full text-[14px]" value={date} onChange={d => d && pickDate(d)} />
          </div>
        </div>
      </Field>

      {/* Time */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[13px] font-medium text-secondary">الوقت</span>
          <Segmented
            label="طريقة اختيار الوقت"
            value={timeMode}
            onChange={setTimeMode}
            options={[
              { value: 'SLOTS', label: 'الأوقات المتاحة' },
              { value: 'CUSTOM', label: 'وقت مخصص' },
            ]}
          />
        </div>

        {timeMode === 'CUSTOM' ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="البداية">
              <input type="time" className="input" value={customTime} onChange={e => setCustomTime(e.target.value)} />
            </Field>
            <Field label="المدة">
              <Select
                value={customDuration}
                onChange={setDurationOverride}
                options={[...new Set([10, 15, 20, 30, 45, 60, 90, 120, 180, customDuration])].sort((a, b) => a - b).map(m => ({ value: m, label: formatDuration(m) }))}
              />
            </Field>
            <p className="col-span-2 text-[12.5px] text-tertiary px-1 leading-relaxed">
              لإضافة موعد خارج أوقات العمل، كحالة مستعجلة. لا يُسمح بالتداخل مع موعد آخر.
            </p>
          </div>
        ) : loadingSlots ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton h-10" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {currentOffGrid && (
              <div className="flex items-center gap-2 text-[13.5px] text-secondary px-1">
                <span className="chip" data-active="true">
                  <span className="num">{timeOf(start)}</span>
                </span>
                الوقت الحالي للموعد
              </div>
            )}
            {free.length === 0 ? (
              <div className="inset px-4 py-4 text-[14px] text-secondary leading-relaxed">
                {dayStatus === 'CLOSED'
                  ? 'العيادة مغلقة في هذا اليوم حسب أوقات العمل.'
                  : dayStatus === 'HOLIDAY'
                    ? 'هذا اليوم عطلة.'
                    : 'لا توجد أوقات فارغة في هذا اليوم.'}{' '}
                <button type="button" className="text-accent-ink font-semibold" onClick={() => setTimeMode('CUSTOM')}>
                  إضافة وقت مخصص
                </button>
              </div>
            ) : (
              <>
                {slotGrid('صباحاً', <Sun className="w-3.5 h-3.5" />, morning)}
                {slotGrid('مساءً', <Moon className="w-3.5 h-3.5" />, evening)}
              </>
            )}
          </div>
        )}
      </section>

      <Field as="div" label="الحالة">
        <Segmented
          full
          label="الحالة"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'CONFIRMED', label: 'مؤكد', icon: <Check className="w-4 h-4" /> },
            { value: 'PENDING', label: 'بانتظار التأكيد' },
          ]}
        />
      </Field>

      <Field label="ملاحظة داخلية" hint="لا يراها المريض.">
        <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="مثال: يحضر نتائج التحاليل" maxLength={1000} />
      </Field>

      <ErrorNote message={error} />

      <SheetFooter>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block min-w-0 flex-1 text-[13.5px] text-secondary truncate">
            {finalStart ? (
              <>
                {relativeDay(date, today)} · <span className="num">{timeOf(finalStart)}</span>
                {service ? ` · ${service.name}` : ''}
              </>
            ) : (
              'لم يُختر وقت بعد'
            )}
          </div>
          <button onClick={onCancel} className="btn btn-plain btn-lg">
            رجوع
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-lg flex-1 sm:flex-none sm:min-w-44">
            {saving ? <Spinner className="w-4 h-4" /> : <Check />}
            {!booking ? 'إضافة الموعد' : booking.status === 'CANCELLED' ? 'إعادة تفعيل بهذا الوقت' : 'حفظ التعديلات'}
          </button>
        </div>
      </SheetFooter>
    </div>
  );
}
