'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Phone, MessageCircle, Copy, RefreshCw, Pencil, Trash2, KeyRound, Check, ShieldOff, Globe, ChevronLeft } from 'lucide-react';
import { Sheet, SheetFooter, Field, ErrorNote, Segmented, Avatar, Spinner } from './ui';
import { StateBadge, visitState } from './status';
import { useApp } from '@/app/context/AppContext';
import { api, copyText, telLink, useOrigin, whatsappLink } from '@/lib/web';
import { NOUNS, arCount, formatArabicDate, formatMoney, nowIn, timeOf } from '@/lib/date';
import type { Booking, Client } from '@/lib/types';

export type PatientSheetState = { mode: 'view'; id: string } | { mode: 'new' } | null;

interface Props {
  state: PatientSheetState;
  onClose: () => void;
  onChanged: () => void;
  /** Show a patient (e.g. right after creating one) */
  onShow: (clientId: string) => void;
  onOpenAppointment: (booking: Booking) => void;
  onNewAppointment: (clientId: string) => void;
}

export default function PatientSheet({ state, onClose, onChanged, onShow, onOpenAppointment, onNewAppointment }: Props) {
  if (!state) return null;
  if (state.mode === 'new') {
    return (
      <Sheet open onClose={onClose} title="مريض جديد" subtitle="يحصل المريض على رمز دخول لحجز مواعيده" variant="drawer">
        <PatientForm
          onSaved={client => {
            onChanged();
            onShow(client.id);
          }}
          onCancel={onClose}
        />
      </Sheet>
    );
  }
  return (
    <PatientProfile
      key={state.id}
      id={state.id}
      onClose={onClose}
      onChanged={onChanged}
      onOpenAppointment={onOpenAppointment}
      onNewAppointment={onNewAppointment}
    />
  );
}

function shareText(c: Client, clinicName: string | undefined, origin: string) {
  return `مرحباً ${c.name}،\nرمز الدخول لحجز مواعيدك في ${clinicName || 'العيادة'}: ${c.accessCode}\n${origin}/client/login`;
}

// ───────────────────────── Profile ─────────────────────────

function PatientProfile({
  id,
  onClose,
  onChanged,
  onOpenAppointment,
  onNewAppointment,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenAppointment: (booking: Booking) => void;
  onNewAppointment: (clientId: string) => void;
}) {
  const { settings, toast, confirm } = useApp();
  const origin = useOrigin();
  const [data, setData] = useState<{ client: Client; bookings: Booking[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ client: Client; bookings: Booking[] }>(`/api/clients/${id}`)
      .then(d => !cancelled && setData(d))
      .catch(err => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [id, nonce]);

  if (!data) {
    return (
      <Sheet open onClose={onClose} title="ملف المريض" variant="drawer">
        {error ? <ErrorNote message={error} /> : <div className="py-16 flex justify-center text-accent"><Spinner className="w-6 h-6" /></div>}
      </Sheet>
    );
  }

  const { client, bookings } = data;
  const now = nowIn(settings?.timezone).dateTime;
  const active = bookings.filter(b => b.status !== 'CANCELLED');
  const upcoming = active.filter(b => b.endDateTime > now).sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
  const past = bookings.filter(b => !upcoming.includes(b));
  const visits = active.filter(b => b.endDateTime <= now && !b.noShow);
  // Older appointments are deleted by the weekly cleanup; their totals stay on the patient
  const older = client.archived;
  const olderCount = older ? older.visits + older.noShows : 0;
  const noShows = active.filter(b => b.noShow).length + (older?.noShows ?? 0);
  const paid = visits.reduce((sum, b) => sum + (b.price || 0), 0) + (older?.paid ?? 0);
  const notesDraft = notes ?? client.notes ?? '';
  const notesDirty = notes !== null && notes !== (client.notes ?? '');
  const message = shareText(client, settings?.clinicName, origin);

  const reload = () => {
    setNonce(n => n + 1);
    onChanged();
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}`, { method: 'PATCH', body: { notes: notesDraft } });
      setNotes(null);
      toast('تم حفظ الملاحظات');
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    const ok = await confirm({
      title: 'إنشاء رمز دخول جديد؟',
      message: 'لن يعمل الرمز الحالي بعد الآن، وسيُطلب من المريض إدخال الرمز الجديد.',
      confirmLabel: 'رمز جديد',
    });
    if (!ok) return;
    try {
      await api(`/api/clients/${client.id}`, { method: 'PATCH', body: { action: 'REGENERATE_CODE' } });
      toast('تم إنشاء رمز جديد');
      reload();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `حذف ${client.name}؟`,
      message: upcoming.length
        ? `سيتم إلغاء ${arCount(upcoming.length, NOUNS.appointment)} قادمة. تبقى الزيارات السابقة في السجل.`
        : 'تبقى زياراته السابقة في سجل المواعيد.',
      confirmLabel: 'حذف المريض',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/clients/${client.id}`, { method: 'DELETE' });
      toast('تم حذف المريض');
      onChanged();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  if (editing) {
    return (
      <Sheet open onClose={onClose} title="تعديل بيانات المريض" subtitle={client.name} variant="drawer">
        <PatientForm
          client={client}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </Sheet>
    );
  }

  const appointmentRow = (b: Booking) => {
    const state = visitState(b, now);
    return (
      <button key={b.id} type="button" onClick={() => onOpenAppointment(b)} className="row w-full flex items-center gap-3 px-4 py-3 text-start">
        <div className="w-12 shrink-0 text-center leading-tight">
          <div className="text-[11px] text-tertiary">{formatArabicDate(b.startDateTime.slice(0, 10), { month: 'short' })}</div>
          <div className="text-[18px] font-semibold tnum">{Number(b.startDateTime.slice(8, 10))}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-medium truncate">
            <span className="num">{timeOf(b.startDateTime)}</span> · {b.serviceName || 'موعد'}
          </div>
          <div className="text-[12.5px] text-secondary">{formatArabicDate(b.startDateTime.slice(0, 10), { weekday: 'long', year: 'numeric' })}</div>
        </div>
        <StateBadge state={state} />
        <ChevronLeft className="w-4 h-4 text-tertiary shrink-0" />
      </button>
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={client.name}
      variant="drawer"
      header={
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={client.name} size={52} />
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold leading-snug truncate">{client.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {client.phone && <span className="text-[13.5px] text-secondary num">{client.phone}</span>}
              {client.status === 'DISABLED' && (
                <span className="badge bg-danger/12 text-danger-ink">
                  <ShieldOff className="w-3 h-3" />
                  موقوف
                </span>
              )}
              {client.selfRegistered && (
                <span className="badge bg-fill text-secondary">
                  <Globe className="w-3 h-3" />
                  سجّل عبر الموقع
                </span>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => onNewAppointment(client.id)} className="btn btn-tinted h-auto py-3 flex-col gap-1.5 rounded-2xl text-[13px]">
            <CalendarPlus className="!w-5 !h-5" />
            حجز موعد
          </button>
          {client.phone ? (
            <a href={telLink(client.phone)} className="btn btn-plain h-auto py-3 flex-col gap-1.5 rounded-2xl text-[13px]">
              <Phone className="!w-5 !h-5" />
              اتصال
            </a>
          ) : (
            <span className="btn btn-plain h-auto py-3 flex-col gap-1.5 rounded-2xl text-[13px] opacity-40">
              <Phone className="!w-5 !h-5" />
              اتصال
            </span>
          )}
          <a href={whatsappLink(client.phone, `مرحباً ${client.name}، `)} target="_blank" rel="noreferrer" className="btn btn-plain h-auto py-3 flex-col gap-1.5 rounded-2xl text-[13px]">
            <MessageCircle className="!w-5 !h-5" />
            واتساب
          </a>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'زيارات', value: visits.length + (older?.visits ?? 0) },
            { label: 'قادمة', value: upcoming.length },
            { label: 'لم يحضر', value: noShows },
          ].map(s => (
            <div key={s.label} className="inset py-3">
              <div className="text-[22px] font-semibold tnum leading-none">{s.value}</div>
              <div className="text-[12px] text-secondary mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
        {paid > 0 && (
          <p className="text-[13px] text-secondary px-1 -mt-2">
            مجموع الزيارات: <span className="text-label font-medium tnum">{formatMoney(paid)}</span>
          </p>
        )}

        {/* Access code */}
        <section className="inset p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[12.5px] text-secondary flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                رمز الدخول لحجز المواعيد
              </div>
              <div className="num text-[22px] font-semibold tracking-[0.12em] text-accent-ink mt-1">{client.accessCode}</div>
            </div>
            <button type="button" onClick={regenerate} className="icon-btn bg-fill" title="إنشاء رمز جديد" aria-label="إنشاء رمز جديد">
              <RefreshCw />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a href={whatsappLink(client.phone, message)} target="_blank" rel="noreferrer" className="btn btn-sm btn-success">
              <MessageCircle />
              إرسال عبر واتساب
            </a>
            <button type="button" onClick={async () => (await copyText(message)) && toast('تم نسخ الرمز ورابط الدخول')} className="btn btn-sm btn-plain">
              <Copy />
              نسخ مع الرابط
            </button>
          </div>
        </section>

        <Field
          label="ملاحظات طبية خاصة"
          hint="لا يراها المريض. مثال: حساسية من البنسلين، ضغط دم مرتفع."
          aside={
            notesDirty && (
              <button type="button" onClick={saveNotes} disabled={busy} className="text-accent-ink text-[13px] font-semibold">
                {busy ? 'جاري الحفظ…' : 'حفظ'}
              </button>
            )
          }
        >
          <textarea className="input" value={notesDraft} onChange={e => setNotes(e.target.value)} maxLength={2000} />
        </Field>

        <section>
          <h3 className="text-[13px] font-medium text-secondary px-1 mb-2">المواعيد القادمة</h3>
          {upcoming.length ? (
            <div className="inset overflow-hidden divide-y divide-hairline">{upcoming.map(appointmentRow)}</div>
          ) : (
            <div className="inset px-4 py-4 text-[14px] text-secondary flex items-center justify-between gap-3">
              لا توجد مواعيد قادمة.
              <button onClick={() => onNewAppointment(client.id)} className="text-accent-ink font-semibold text-[13.5px]">
                حجز موعد
              </button>
            </div>
          )}
        </section>

        {(past.length > 0 || olderCount > 0) && (
          <section>
            <h3 className="text-[13px] font-medium text-secondary px-1 mb-2">
              السجل{past.length > 0 ? ` (${arCount(past.length, NOUNS.appointment)})` : ''}
            </h3>
            {past.length > 0 && <div className="inset overflow-hidden divide-y divide-hairline">{past.slice(0, 30).map(appointmentRow)}</div>}
            {olderCount > 0 && (
              <p className="text-[12.5px] text-tertiary px-1 mt-2 leading-relaxed">
                + {arCount(olderCount, NOUNS.appointment)} أقدم حُذفت تفاصيلها من السجل
                {older?.lastVisit ? ` (آخرها ${formatArabicDate(older.lastVisit.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })})` : ''}. تجدها
                في قوائم المواعيد التي تم تنزيلها.
              </p>
            )}
          </section>
        )}

        <ErrorNote message={error} />
      </div>

      <SheetFooter>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="btn btn-glass btn-lg flex-1">
            <Pencil />
            تعديل البيانات
          </button>
          <button onClick={remove} className="btn btn-danger btn-lg" aria-label="حذف المريض" title="حذف المريض">
            <Trash2 />
          </button>
        </div>
      </SheetFooter>
    </Sheet>
  );
}

// ───────────────────────── Form ─────────────────────────

function PatientForm({ client, onSaved, onCancel }: { client?: Client; onSaved: (client: Client) => void; onCancel: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(client?.name || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [email, setEmail] = useState(client?.email || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [access, setAccess] = useState<'ACTIVE' | 'DISABLED'>(client?.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) return setError('أدخل اسم المريض.');
    setSaving(true);
    setError(null);
    try {
      const body = { name, phone, email, notes, status: access };
      const res = client
        ? await api<{ client: Client }>(`/api/clients/${client.id}`, { method: 'PATCH', body })
        : await api<{ client: Client }>('/api/clients', { method: 'POST', body });
      toast(client ? 'تم حفظ بيانات المريض' : 'تمت إضافة المريض');
      onSaved(res.client);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="الاسم الكامل">
        <input className="input" value={name} onChange={e => setName(e.target.value)} data-autofocus={!client || undefined} autoComplete="off" />
      </Field>
      <Field label="رقم الهاتف" hint="يُستعمل للاتصال وإرسال الرمز عبر واتساب.">
        <input className="input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0555 12 34 56" />
      </Field>
      <Field label="البريد الإلكتروني (اختياري)">
        <input className="input" type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} />
      </Field>
      <Field label="ملاحظات طبية خاصة" hint="لا يراها المريض.">
        <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
      </Field>
      {client && (
        <Field as="div" label="الحجز عبر الموقع" hint="أوقف الحساب لمنع المريض من الدخول والحجز عبر الموقع.">
          <Segmented
            full
            label="الحجز عبر الموقع"
            value={access}
            onChange={setAccess}
            options={[
              { value: 'ACTIVE', label: 'مسموح', icon: <Check className="w-4 h-4" /> },
              { value: 'DISABLED', label: 'موقوف', icon: <ShieldOff className="w-4 h-4" /> },
            ]}
          />
        </Field>
      )}
      <ErrorNote message={error} />
      <SheetFooter>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-plain btn-lg">
            رجوع
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-lg flex-1">
            {saving ? <Spinner className="w-4 h-4" /> : <Check />}
            {client ? 'حفظ' : 'إضافة المريض'}
          </button>
        </div>
      </SheetFooter>
    </div>
  );
}

