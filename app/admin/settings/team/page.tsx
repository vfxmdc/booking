'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, Eye, EyeOff, KeyRound, Pause, Plus, ShieldCheck, Trash2, UserRound, Wand2 } from 'lucide-react';
import type { PublicStaff, StaffRole } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { SettingsSection } from '../../kit';
import { Avatar, ErrorNote, Field, Segmented, Sheet, SheetFooter, Spinner } from '@/app/components/ui';
import { api } from '@/lib/web';

const MIN_CODE = 6;

function randomCode(): string {
  const digits = new Uint32Array(8);
  crypto.getRandomValues(digits);
  return Array.from(digits, d => String(d % 10)).join('');
}

export default function TeamPage() {
  const { settings } = useApp();
  const [staff, setStaff] = useState<PublicStaff[] | null>(null);
  const [me, setMe] = useState('');
  const [editing, setEditing] = useState<PublicStaff | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ staff: PublicStaff[]; me: string }>('/api/staff')
      .then(d => {
        setStaff(d.staff);
        setMe(d.me);
      })
      .catch(err => setError((err as Error).message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const lastSeen = (iso?: string) =>
    iso
      ? `آخر دخول: ${new Intl.DateTimeFormat('ar-DZ', { timeZone: settings?.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))}`
      : 'لم يدخل بعد';

  return (
    <>
      <SettingsSection
        title="فريق العيادة"
        description="كل شخص يدخل برمز خاص به. المسؤول الرئيسي يدير الإعدادات والأسعار والفريق، والموظف يدير المواعيد والمرضى وأوقات العمل."
        aside={
          <button type="button" onClick={() => setEditing('new')} className="btn btn-primary shrink-0">
            <Plus />
            إضافة عضو
          </button>
        }
      >
        <ErrorNote message={error} />
        {!staff ? (
          !error && <div className="skeleton h-20" />
        ) : (
          <div className="inset divide-y divide-hairline">
            {staff.map(s => (
              <button key={s.id} type="button" onClick={() => setEditing(s)} className="row w-full flex items-center gap-3 px-4 py-3.5 text-start">
                <Avatar name={s.name} size={42} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold">{s.name}</span>
                    {s.id === me && <span className="badge bg-accent/12 text-accent-ink">أنت</span>}
                    {!s.active && <span className="badge bg-danger/12 text-danger-ink">موقوف</span>}
                  </span>
                  <span className="block text-[12.5px] text-secondary mt-0.5">
                    {s.role === 'SUPER' ? 'مسؤول رئيسي' : 'موظف'} · {lastSeen(s.lastLoginAt)}
                  </span>
                </span>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.role === 'SUPER' ? 'bg-violet/15 text-violet-ink' : 'bg-fill text-secondary'}`}>
                  {s.role === 'SUPER' ? <ShieldCheck className="w-[18px] h-[18px]" /> : <UserRound className="w-[18px] h-[18px]" />}
                </span>
                <ChevronLeft className="w-4 h-4 text-tertiary shrink-0" />
              </button>
            ))}
          </div>
        )}
        <p className="text-[12.5px] text-tertiary mt-4 leading-relaxed flex items-start gap-1.5">
          <KeyRound className="w-3.5 h-3.5 shrink-0 mt-1" />
          الرموز محفوظة بشكل مشفّر ولا يمكن عرضها لاحقاً. عند تغيير رمز شخص، يُسجَّل خروجه من كل الأجهزة.
        </p>
      </SettingsSection>

      {editing && (
        <MemberForm
          member={editing === 'new' ? null : editing}
          isMe={editing !== 'new' && editing.id === me}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function MemberForm({ member, isMe, onClose, onSaved }: { member: PublicStaff | null; isMe: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useApp();
  const [name, setName] = useState(member?.name || '');
  const [role, setRole] = useState<StaffRole>(member?.role || 'ADMIN');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(!member);
  const [active, setActive] = useState(member ? (member.active ? 'on' : 'off') : 'on');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) return setError('أدخل الاسم.');
    if (!member && code.trim().length < MIN_CODE) return setError(`اختر رمز دخول من ${MIN_CODE} أحرف أو أرقام على الأقل.`);
    if (member && code && code.trim().length < MIN_CODE) return setError(`الرمز الجديد يجب أن يتكون من ${MIN_CODE} أحرف أو أرقام على الأقل.`);
    setSaving(true);
    setError(null);
    try {
      if (member) {
        const body: Record<string, unknown> = { name, role };
        if (!isMe) body.active = active === 'on';
        if (code) body.code = code.trim();
        await api(`/api/staff/${member.id}`, { method: 'PATCH', body });
        toast(code ? 'تم الحفظ وتغيير الرمز' : 'تم الحفظ');
      } else {
        await api('/api/staff', { method: 'POST', body: { name, role, code: code.trim() } });
        toast(`تمت إضافة ${name}. أعطه الرمز ليتمكن من الدخول.`);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!member) return;
    const ok = await confirm({ title: `حذف ${member.name} من الفريق؟`, message: 'لن يتمكن من الدخول بعد الآن.', confirmLabel: 'حذف', tone: 'danger' });
    if (!ok) return;
    try {
      await api(`/api/staff/${member.id}`, { method: 'DELETE' });
      toast('تم الحذف');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Sheet open onClose={onClose} title={member ? member.name : 'عضو جديد في الفريق'} subtitle={member ? 'تعديل الحساب' : 'مثلاً: موظف الاستقبال أو طبيب آخر'}>
      <div className="space-y-5">
        <Field label="الاسم">
          <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={60} data-autofocus={!member || undefined} />
        </Field>

        <Field
          as="div"
          label="الصلاحية"
          hint={role === 'SUPER' ? 'يدير كل شيء، بما في ذلك الإعدادات والأسعار والفريق.' : 'يدير المواعيد والمرضى وأوقات العمل والعطل.'}
        >
          <Segmented
            full
            label="الصلاحية"
            value={role}
            onChange={setRole}
            options={[
              { value: 'ADMIN', label: 'موظف', icon: <UserRound className="w-4 h-4" /> },
              { value: 'SUPER', label: 'مسؤول رئيسي', icon: <ShieldCheck className="w-4 h-4" /> },
            ]}
          />
        </Field>

        <Field
          label={member ? 'رمز دخول جديد (اختياري)' : 'رمز الدخول'}
          hint={member ? 'اتركه فارغاً للإبقاء على الرمز الحالي.' : `${MIN_CODE} أحرف أو أرقام على الأقل. احفظه قبل الإغلاق: لا يمكن عرضه لاحقاً.`}
          aside={
            <button type="button" onClick={() => { setCode(randomCode()); setShowCode(true); }} className="text-accent-ink text-[13px] font-semibold flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5" />
              توليد رمز
            </button>
          }
        >
          <div className="relative">
            <input
              className="input pe-12 num tracking-wider"
              dir="ltr"
              type={showCode ? 'text' : 'password'}
              autoComplete="new-password"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={64}
            />
            <button
              type="button"
              onClick={() => setShowCode(v => !v)}
              className="absolute top-1/2 -translate-y-1/2 end-1.5 icon-btn text-tertiary"
              aria-label={showCode ? 'إخفاء الرمز' : 'إظهار الرمز'}
            >
              {showCode ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </Field>

        {member && !isMe && (
          <Field as="div" label="الحساب" hint="الحساب الموقوف لا يستطيع الدخول.">
            <Segmented
              full
              label="حالة الحساب"
              value={active}
              onChange={setActive}
              options={[
                { value: 'on', label: 'نشط', icon: <Check className="w-4 h-4" /> },
                { value: 'off', label: 'موقوف', icon: <Pause className="w-4 h-4" /> },
              ]}
            />
          </Field>
        )}
        <ErrorNote message={error} />
      </div>
      <SheetFooter>
        <div className="flex gap-2">
          {member && !isMe && (
            <button type="button" onClick={remove} className="btn btn-danger btn-lg" aria-label="حذف من الفريق" title="حذف من الفريق">
              <Trash2 />
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-plain btn-lg">
            رجوع
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-lg flex-1">
            {saving ? <Spinner className="w-4 h-4" /> : <Check />}
            {member ? 'حفظ' : 'إضافة'}
          </button>
        </div>
      </SheetFooter>
    </Sheet>
  );
}
