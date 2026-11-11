'use client';

import { useState } from 'react';
import { Copy, Download, ExternalLink, Link2, MessageCircle, ShieldCheck } from 'lucide-react';
import type { Settings } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { SaveBar, SettingsSection } from '../kit';
import CleanupSection from './cleanup-section';
import { ErrorNote, Field } from '@/app/components/ui';
import { api, copyText, useOrigin, whatsappLink } from '@/lib/web';

const TIMEZONES = [
  ['Africa/Algiers', 'الجزائر'],
  ['Africa/Tunis', 'تونس'],
  ['Africa/Casablanca', 'المغرب'],
  ['Africa/Tripoli', 'ليبيا'],
  ['Africa/Cairo', 'مصر'],
  ['Asia/Riyadh', 'السعودية'],
  ['Asia/Dubai', 'الإمارات'],
  ['Europe/Paris', 'فرنسا'],
];

const FIELDS = ['clinicName', 'specialty', 'phone', 'address', 'timezone', 'notice'] as const;

export default function ClinicSettingsPage() {
  const { settings, refreshSettings, toast } = useApp();
  const origin = useOrigin();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return <div className="skeleton h-96 rounded-[22px]" />;
  const form = draft ?? settings;
  const dirty = draft !== null && FIELDS.some(k => draft[k] !== settings[k]);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...form, [key]: value });
  const link = origin ? `${origin}/` : '';

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('/api/settings', { method: 'PATCH', body: Object.fromEntries(FIELDS.map(k => [k, form[k]])) });
      await refreshSettings();
      setDraft(null);
      toast('تم حفظ بيانات العيادة');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-l from-accent/10 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </span>
            <div>
              <h2 className="section-title">رابط الحجز للمرضى</h2>
              <p className="text-[13.5px] text-secondary">شاركه على فيسبوك وإنستغرام وواتساب، أو اطبعه في قاعة الانتظار.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input readOnly value={link} className="input num text-[14.5px] w-full" dir="ltr" onFocus={e => e.target.select()} aria-label="رابط الحجز" />
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={async () => (await copyText(link)) && toast('تم نسخ الرابط')} className="btn btn-glass">
                <Copy />
                نسخ
              </button>
              <a href={whatsappLink('', `احجز موعدك في ${form.clinicName} عبر الرابط: ${link}`)} target="_blank" rel="noreferrer" className="btn btn-glass">
                <MessageCircle />
                واتساب
              </a>
              <a href="/" target="_blank" rel="noreferrer" className="icon-btn glass !w-10 !h-10" title="فتح صفحة الحجز" aria-label="فتح صفحة الحجز">
                <ExternalLink />
              </a>
            </div>
          </div>
        </div>
      </section>

      <SettingsSection title="بيانات العيادة" description="تظهر للمرضى في صفحة الحجز وفي رسائل التأكيد.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="اسم العيادة">
            <input className="input" value={form.clinicName} onChange={e => set('clinicName', e.target.value)} maxLength={80} />
          </Field>
          <Field label="الاختصاص">
            <input className="input" value={form.specialty} onChange={e => set('specialty', e.target.value)} placeholder="طب عام" maxLength={80} />
          </Field>
          <Field label="هاتف العيادة" hint="يظهر زر الاتصال وواتساب للمرضى.">
            <input className="input" type="tel" inputMode="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0550 00 00 00" />
          </Field>
          <Field label="المنطقة الزمنية">
            <select className="input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
              {TIMEZONES.map(([tz, label]) => (
                <option key={tz} value={tz}>
                  {label}
                </option>
              ))}
              {!TIMEZONES.some(([tz]) => tz === form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="العنوان" hint="يظهر مع رابط «فتح في الخرائط».">
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="الشارع، الحي، المدينة" maxLength={200} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="ملاحظة للمرضى" hint="تظهر قبل تأكيد الحجز وفي رسالة التأكيد عبر واتساب.">
              <textarea className="input" value={form.notice} onChange={e => set('notice', e.target.value)} maxLength={400} />
            </Field>
          </div>
        </div>
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="النسخ الاحتياطي"
        description="ملف يحتوي على كل المرضى والمواعيد والإعدادات. نزّله بانتظام واحتفظ به في مكان آمن."
        aside={
          <a href="/api/backup" className="btn btn-glass shrink-0">
            <Download />
            تنزيل نسخة احتياطية
          </a>
        }
      >
        <p className="text-[13px] text-secondary flex items-start gap-2 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
          البيانات محفوظة بشكل خاص، ولا يرى كل مريض إلا مواعيده.
        </p>
      </SettingsSection>

      <CleanupSection />

      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(null)} />
    </>
  );
}
