'use client';

import { useState } from 'react';
import { Archive, CheckCircle2, Download, Trash2, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { appointmentRows } from '@/app/components/status';
import { api, downloadCsv } from '@/lib/web';
import { NOUNS, arCount, formatArabicDate, nowIn } from '@/lib/date';
import type { Booking, CleanupNotice, CleanupRecord } from '@/lib/types';

/** localStorage: the last deletion this browser has already been told about */
export const CLEANUP_SEEN_KEY = 'clinic_cleanup_seen';
/** localStorage: the batch whose "already downloaded" line this viewer has closed */
const HIDDEN_KEY = 'clinic_cleanup_hidden';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

/**
 * Warning shown to every staff member while old appointments wait to be deleted:
 * anyone can download the list, the main admin can delete right away, and otherwise
 * the deletion happens by itself on the due date.
 */
export default function CleanupBanner({ notice, isSuper, onChanged }: { notice: CleanupNotice; isSuper: boolean; onChanged: () => void }) {
  const { settings, toast, confirm } = useApp();
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);
  const [hidden, setHidden] = useState(() => stored(HIDDEN_KEY));

  const year = notice.from.slice(0, 4) !== notice.dueOn.slice(0, 4) ? ({ year: 'numeric' } as const) : {};
  const day = (d: string) => formatArabicDate(d, { day: 'numeric', month: 'long', ...year });
  const range = notice.from === notice.to ? `مواعيد ${day(notice.from)}` : `المواعيد من ${day(notice.from)} إلى ${day(notice.to)}`;
  const due = notice.daysLeft === 0 ? 'اليوم' : notice.daysLeft === 1 ? 'غداً' : `بعد ${arCount(notice.daysLeft, NOUNS.day)}`;
  const dueDay = formatArabicDate(notice.dueOn, { weekday: 'long', day: 'numeric', month: 'long' });
  const count = arCount(notice.count, NOUNS.appointment);
  const downloaded = Boolean(notice.downloadedAt);

  const download = async () => {
    setBusy('download');
    try {
      const data = await api<{ notice: CleanupNotice; bookings: Booking[]; asOf: string }>('/api/cleanup?list=batch');
      downloadCsv(`appointments-${data.notice.from}_${data.notice.to}.csv`, appointmentRows(data.bookings, nowIn(settings?.timezone).dateTime));
      await api('/api/cleanup', { method: 'POST', body: { action: 'DOWNLOADED', before: data.notice.before, asOf: data.asOf } });
      toast('تم تنزيل قائمة المواعيد القديمة. احتفظ بالملف في مكان آمن.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `حذف ${count} الآن؟`,
      message: `${range}.\n${downloaded ? 'تم تنزيل القائمة.' : 'لم يُنزّل أحد القائمة بعد!'}\nالحذف نهائي، ولا يشمل حسابات المرضى.`,
      confirmLabel: 'حذف المواعيد',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      const res = await api<{ record: CleanupRecord | null }>('/api/cleanup', {
        method: 'POST',
        body: { action: 'DELETE', before: notice.before, expected: notice.count },
      });
      if (res.record) store(CLEANUP_SEEN_KEY, res.record.at);
      toast('تم حذف المواعيد القديمة. تبقى قائمتها متاحة في الإعدادات حتى التنظيف القادم.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const deleteButton = isSuper && (
    <button type="button" onClick={remove} disabled={busy !== null} className="btn btn-sm btn-danger">
      <Trash2 />
      {busy === 'delete' ? 'جاري الحذف…' : 'حذف الآن'}
    </button>
  );

  // Already downloaded and nothing changed since: one quiet line, which each viewer may close
  if (downloaded) {
    if (hidden === notice.before) return null;
    return (
      <div className="max-w-[1240px] mx-auto w-full px-4 sm:px-6 lg:px-8 mb-2 no-print">
        <div className="card px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px]">
          <CheckCircle2 className="w-[18px] h-[18px] text-success shrink-0" />
          <span className="flex-1 min-w-[200px] leading-relaxed">
            نزّل {notice.downloadedBy || 'أحد أعضاء الفريق'} قائمة المواعيد القديمة ({count}). تُحذف تلقائياً {due}، يوم {dueDay}.
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={download} disabled={busy !== null} className="btn btn-sm btn-plain">
              <Download />
              {busy === 'download' ? 'جاري التنزيل…' : 'تنزيل مرة أخرى'}
            </button>
            {deleteButton}
            <button
              type="button"
              onClick={() => {
                store(HIDDEN_KEY, notice.before);
                setHidden(notice.before);
              }}
              className="icon-btn"
              title="إخفاء"
              aria-label="إخفاء التنبيه"
            >
              <X />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto w-full px-4 sm:px-6 lg:px-8 mb-2 no-print">
      <div className="card px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3" role="status">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-9 h-9 rounded-[11px] bg-warning/15 text-warning-ink flex items-center justify-center shrink-0">
            <Archive className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 text-[14px] leading-relaxed">
            <p className="font-semibold">
              حذف المواعيد القديمة {due}: {count}
            </p>
            <p className="text-secondary text-[13.5px]">
              {range} ستُحذف تلقائياً يوم {dueDay}. نزّل القائمة واحتفظ بها قبل ذلك. حسابات المرضى لا تُحذف.
            </p>
            {notice.changedSinceDownload && (
              <p className="text-warning-ink text-[13px] mt-0.5">تغيّرت مواعيد في القائمة بعد آخر تنزيل. نزّلها من جديد.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ps-12 sm:ps-0">
          <button type="button" onClick={download} disabled={busy !== null} className="btn btn-sm btn-tinted">
            <Download />
            {busy === 'download' ? 'جاري التنزيل…' : 'تنزيل القائمة'}
          </button>
          {deleteButton}
        </div>
      </div>
    </div>
  );
}
