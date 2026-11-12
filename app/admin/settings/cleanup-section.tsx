'use client';

import { useState } from 'react';
import { Download, History } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from '../admin-context';
import { SettingsSection } from '../kit';
import { appointmentRows } from '@/app/components/status';
import { Field } from '@/app/components/ui';
import { Select } from '@/app/components/pickers';
import { api, downloadCsv } from '@/lib/web';
import { RETENTION_WEEKS, WARNING_DAYS } from '@/lib/cleanup';
import { NOUNS, arCount, nowIn } from '@/lib/date';
import type { Booking } from '@/lib/types';

const RETENTION_LABEL: Record<number, string> = {
  1: 'أسبوع واحد (الأسبوع الحالي فقط)',
  4: 'شهر واحد',
  13: '3 أشهر',
  52: 'سنة واحدة',
  0: 'عدم الحذف',
};

const stamp = (iso: string) =>
  new Intl.DateTimeFormat('ar-DZ', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** Main admin: how long appointments are kept, and the last deleted list. */
export default function CleanupSection() {
  const { settings, refreshSettings, toast } = useApp();
  const { lastCleanup, refresh } = useAdmin();
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!settings) return null;
  const weeks = settings.retentionWeeks;

  const changeRetention = async (value: number) => {
    setSaving(true);
    try {
      await api('/api/settings', { method: 'PATCH', body: { retentionWeeks: value } });
      await refreshSettings();
      refresh();
      toast(value === 0 ? 'تم إيقاف حذف المواعيد القديمة' : 'تم حفظ مدة الاحتفاظ بالمواعيد');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadLast = async () => {
    setDownloading(true);
    try {
      const data = await api<{ before: string; bookings: Booking[] }>('/api/cleanup?list=last');
      downloadCsv(`deleted-appointments-before-${data.before}.csv`, appointmentRows(data.bookings, nowIn(settings.timezone).dateTime));
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SettingsSection
      title="حذف المواعيد القديمة"
      description={`تُحذف المواعيد الأقدم من المدة المحددة تلقائياً، بعد تنبيه مدته ${arCount(WARNING_DAYS, NOUNS.day)} يظهر لكل الفريق مع زر لتنزيل القائمة. حسابات المرضى وأعداد زياراتهم لا تُحذف.`}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="الاحتفاظ بالمواعيد لمدة"
          hint={
            weeks === 0
              ? 'تبقى كل المواعيد في السجل.'
              : 'بعد الحذف لا تظهر المواعيد الأقدم في التقويم ولا في ملف المريض، وتبقى في القوائم التي تم تنزيلها.'
          }
        >
          <Select
            value={weeks}
            disabled={saving}
            onChange={changeRetention}
            options={[
              ...RETENTION_WEEKS.map(w => ({ value: w, label: RETENTION_LABEL[w] })),
              ...(RETENTION_WEEKS.includes(weeks) ? [] : [{ value: weeks, label: `${weeks} أسابيع` }]),
            ]}
          />
        </Field>
      </div>

      {lastCleanup && (
        <div className="inset mt-4 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[13.5px] leading-relaxed flex items-start gap-2">
            <History className="w-4 h-4 text-tertiary shrink-0 mt-1" />
            <span>
              آخر حذف: {stamp(lastCleanup.at)} · {arCount(lastCleanup.count, NOUNS.appointment)} ·{' '}
              {lastCleanup.by === 'auto' ? 'تلقائي' : lastCleanup.by}
              <span className="block text-secondary text-[12.5px]">تبقى القائمة المحذوفة متاحة للتنزيل حتى الحذف القادم.</span>
            </span>
          </p>
          <button type="button" onClick={downloadLast} disabled={downloading} className="btn btn-sm btn-glass shrink-0">
            <Download />
            {downloading ? 'جاري التنزيل…' : 'تنزيل القائمة المحذوفة'}
          </button>
        </div>
      )}
    </SettingsSection>
  );
}
