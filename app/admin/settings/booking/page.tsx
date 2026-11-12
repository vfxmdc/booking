'use client';

import { useState } from 'react';
import { BadgeCheck, Inbox } from 'lucide-react';
import type { Settings } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { SaveBar, SettingsSection } from '../../kit';
import { ErrorNote } from '@/app/components/ui';
import { Select } from '@/app/components/pickers';
import { api } from '@/lib/web';
import { NOUNS, arCount, formatDuration } from '@/lib/date';

const FIELDS = ['requireApproval', 'bookingWindowDays', 'minNoticeMinutes', 'cancelNoticeHours', 'maxUpcomingPerPatient'] as const;

type NumericKey = 'bookingWindowDays' | 'minNoticeMinutes' | 'cancelNoticeHours' | 'maxUpcomingPerPatient';

const RULES: { key: NumericKey; label: string; hint: string; options: number[]; format: (n: number) => string }[] = [
  {
    key: 'bookingWindowDays',
    label: 'يمكن الحجز مسبقاً حتى',
    hint: 'أبعد تاريخ يظهر للمرضى.',
    options: [7, 14, 21, 30, 45, 60, 90, 180],
    format: n => arCount(n, NOUNS.day),
  },
  {
    key: 'minNoticeMinutes',
    label: 'أقل مدة بين الحجز والموعد',
    hint: 'مثلاً: لا يمكن حجز موعد يبدأ بعد أقل من ساعة.',
    options: [0, 15, 30, 60, 120, 180, 360, 720, 1440, 2880],
    format: n => (n === 0 ? 'بدون حد' : formatDuration(n)),
  },
  {
    key: 'cancelNoticeHours',
    label: 'يمكن للمريض الإلغاء أو التغيير حتى',
    hint: 'بعد هذا الحد يطلب منه الموقع الاتصال بالعيادة.',
    options: [0, 1, 2, 3, 6, 12, 24, 48, 72],
    format: n => (n === 0 ? 'حتى بداية الموعد' : `${n === 1 ? 'ساعة' : arCount(n, NOUNS.hour)} قبل الموعد`),
  },
  {
    key: 'maxUpcomingPerPatient',
    label: 'أقصى عدد مواعيد قادمة لكل مريض',
    hint: 'يمنع حجز عدة مواعيد من نفس الحساب.',
    options: [1, 2, 3, 4, 5, 10],
    format: n => arCount(n, NOUNS.appointment),
  },
];

export default function BookingRulesPage() {
  const { settings, refreshSettings, toast } = useApp();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return <div className="skeleton h-96 rounded-[22px]" />;
  const form = draft ?? settings;
  const dirty = draft !== null && FIELDS.some(k => draft[k] !== settings[k]);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...form, [key]: value });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('/api/settings', { method: 'PATCH', body: Object.fromEntries(FIELDS.map(k => [k, form[k]])) });
      await refreshSettings();
      setDraft(null);
      toast('تم حفظ قواعد الحجز');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const modes = [
    {
      value: true,
      icon: <Inbox className="w-5 h-5" />,
      title: 'مراجعة يدوية',
      text: 'كل حجز عبر الموقع يصلك كطلب. تؤكده أو ترفضه، ويرى المريض الحالة في صفحة مواعيده.',
    },
    {
      value: false,
      icon: <BadgeCheck className="w-5 h-5" />,
      title: 'تأكيد تلقائي',
      text: 'يُؤكَّد الحجز فوراً إذا كان الوقت متاحاً. مناسب عندما تريد أقل تدخل ممكن.',
    },
  ];

  return (
    <>
      <SettingsSection title="تأكيد المواعيد المحجوزة عبر الموقع" description="المواعيد التي تضيفها أنت أو الاستقبال تكون مؤكدة دائماً.">
        <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="طريقة التأكيد">
          {modes.map(m => {
            const active = form.requireApproval === m.value;
            return (
              <button
                key={m.title}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set('requireApproval', m.value)}
                className={`text-start rounded-[20px] p-4 border-2 transition-colors ${
                  active ? 'border-accent bg-accent/[0.07]' : 'border-hairline bg-[var(--input)] hover:border-accent/40'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-accent text-white' : 'bg-fill text-secondary'}`}>{m.icon}</span>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-accent' : 'border-fill-strong'}`}
                    aria-hidden
                  >
                    {active && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
                  </span>
                </span>
                <span className="block text-[16px] font-semibold mt-3">{m.title}</span>
                <span className="block text-[13.5px] text-secondary mt-1 leading-relaxed">{m.text}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="حدود الحجز عبر الموقع" description="تنطبق على المرضى فقط. الفريق يمكنه دائماً إضافة أي موعد.">
        <div className="inset divide-y divide-hairline">
          {RULES.map(rule => {
            const value = form[rule.key];
            const options = rule.options.includes(value) ? rule.options : [...rule.options, value].sort((a, b) => a - b);
            return (
              <div key={rule.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-6 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{rule.label}</div>
                  <div className="text-[12.5px] text-tertiary">{rule.hint}</div>
                </div>
                <div className="sm:w-56 shrink-0">
                  <Select
                    className="h-10"
                    value={value}
                    onChange={n => set(rule.key, n)}
                    ariaLabel={rule.label}
                    options={options.map(n => ({ value: n, label: rule.format(n) }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      </SettingsSection>

      <SessionLengthSection />

      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(null)} />
    </>
  );
}

const LENGTHS = [10, 15, 20, 25, 30, 40, 45, 60];

/** Length of one appointment, i.e. the step between times shown to patients (10:00, 10:30 …). Saved per doctor. */
function SessionLengthSection() {
  const { doctors, refreshSettings, toast } = useApp();
  const [saving, setSaving] = useState<string | null>(null);

  const change = async (id: string, minutes: number) => {
    setSaving(id);
    try {
      await api(`/api/resources/${id}`, { method: 'PATCH', body: { slotDurationMinutes: minutes } });
      await refreshSettings();
      toast(`أصبحت مدة الموعد ${formatDuration(minutes)}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(null);
    }
  };

  if (!doctors.length) return null;
  return (
    <SettingsSection
      title="مدة الموعد"
      description="الفاصل بين الأوقات المعروضة للحجز. مثلاً 30 دقيقة: 10:00 ثم 10:30، و15 دقيقة: 10:00 ثم 10:15. المواعيد المحجوزة سابقاً لا تتغير."
    >
      <div className="inset divide-y divide-hairline">
        {doctors.map(d => (
          <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-6 px-4 py-3.5">
            <div className="text-[15px] font-medium">{doctors.length > 1 ? d.name : 'مدة كل موعد'}</div>
            <div className="sm:w-56 shrink-0">
              <Select
                className="h-10"
                ariaLabel={`مدة الموعد · ${d.name}`}
                value={d.slotDurationMinutes}
                disabled={saving === d.id}
                onChange={m => m !== d.slotDurationMinutes && change(d.id, m)}
                options={[...new Set([...LENGTHS, d.slotDurationMinutes])].sort((a, b) => a - b).map(m => ({ value: m, label: formatDuration(m) }))}
              />
            </div>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
