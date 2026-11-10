'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Copy, Plus, Trash2, X } from 'lucide-react';
import type { BlockRule, WeeklyHours } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { SaveBar, SettingsSection } from '../../kit';
import BlockModal from '@/app/components/BlockModal';
import { ErrorNote, Segmented } from '@/app/components/ui';
import { api } from '@/lib/web';
import { DAY_NAMES, WEEK_ORDER, formatArabicDate, formatDuration, toMinutes, todayIn } from '@/lib/date';

type Range = { start: string; end: string };
const emptyWeek = (): WeeklyHours => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

export default function HoursPage() {
  const { settings, doctors, refreshSettings, toast, confirm } = useApp();
  const today = todayIn(settings?.timezone);
  const [selectedId, setSelectedId] = useState('');
  const [allHours, setAllHours] = useState<Record<string, WeeklyHours> | null>(null);
  const [draft, setDraft] = useState<{ id: string; week: WeeklyHours } | null>(null);
  const [blocks, setBlocks] = useState<BlockRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  const load = useCallback(() => {
    api<{ hours: Record<string, WeeklyHours>; blockRules: BlockRule[] }>('/api/availability')
      .then(d => {
        setAllHours(d.hours);
        setBlocks(d.blockRules);
      })
      .catch(err => setError((err as Error).message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resourceId = selectedId || doctors[0]?.id || '';
  const dirty = draft !== null && draft.id === resourceId;
  const week: WeeklyHours = dirty ? draft.week : (allHours?.[resourceId] ?? emptyWeek());
  const update = (day: number, ranges: Range[]) => setDraft({ id: resourceId, week: { ...week, [day]: ranges } });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ hours: WeeklyHours }>('/api/availability', { method: 'PUT', body: { resourceId, days: week } });
      setAllHours(h => ({ ...(h || {}), [resourceId]: res.hours }));
      setDraft(null);
      refreshSettings();
      toast('تم حفظ أوقات العمل');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copyToWorkdays = (day: number) => {
    const next = { ...week };
    for (const d of WEEK_ORDER) if (d !== day && next[d].length > 0) next[d] = structuredClone(week[day]);
    setDraft({ id: resourceId, week: next });
    toast('تم تطبيق نفس الأوقات على باقي أيام العمل', 'info');
  };

  const removeBlock = async (b: BlockRule) => {
    const ok = await confirm({ title: `حذف «${b.title}»؟`, message: 'سيتمكن المرضى من الحجز في هذه الفترة من جديد.', confirmLabel: 'حذف', tone: 'danger' });
    if (!ok) return;
    try {
      await api(`/api/availability/blocks/${b.id}`, { method: 'DELETE' });
      toast('تم حذف العطلة');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const upcomingBlocks = blocks.filter(b => b.endDate >= today);

  return (
    <>
      <SettingsSection
        title="أوقات العمل الأسبوعية"
        description="يحجز المرضى داخل هذه الأوقات فقط. يمكن تقسيم اليوم إلى فترتين، صباحية ومسائية مثلاً."
        aside={
          doctors.length > 1 ? (
            <Segmented
              label="الطبيب"
              value={resourceId}
              onChange={async id => {
                if (dirty && !(await confirm({ title: 'تجاهل التغييرات غير المحفوظة؟', confirmLabel: 'متابعة' }))) return;
                setSelectedId(id);
                setDraft(null);
              }}
              options={doctors.map(d => ({ value: d.id, label: d.name }))}
            />
          ) : undefined
        }
      >
        {!allHours ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14" />
            ))}
          </div>
        ) : (
          <div className="inset divide-y divide-hairline">
            {WEEK_ORDER.map(day => {
              const ranges = week[day] || [];
              const open = ranges.length > 0;
              const total = ranges.reduce((s, r) => s + Math.max(0, toMinutes(r.end) - toMinutes(r.start)), 0);
              return (
                <div key={day} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="sm:w-36 shrink-0 flex items-baseline justify-between gap-2 sm:block sm:pt-1.5">
                    <div className={`text-[15.5px] font-semibold ${open ? '' : 'text-secondary'}`}>{DAY_NAMES[day]}</div>
                    <div className={`text-[12.5px] ${open ? 'text-tertiary' : 'text-danger-ink'}`}>{open ? formatDuration(total) : 'مغلق'}</div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="time"
                          aria-label={`بداية الفترة ${i + 1}`}
                          className="input h-10 w-[124px]"
                          value={r.start}
                          onChange={e => update(day, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                        />
                        <span className="text-[13px] text-tertiary">إلى</span>
                        <input
                          type="time"
                          aria-label={`نهاية الفترة ${i + 1}`}
                          className="input h-10 w-[124px]"
                          value={r.end}
                          onChange={e => update(day, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                        />
                        <button
                          type="button"
                          onClick={() => update(day, ranges.filter((_, j) => j !== i))}
                          className="icon-btn text-danger-ink hover:!bg-danger/10"
                          aria-label="حذف الفترة"
                          title="حذف الفترة"
                        >
                          <X />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-1.5">
                      {open ? (
                        <>
                          <button
                            type="button"
                            onClick={() => update(day, [...ranges, { start: ranges.at(-1)?.end || '14:00', end: '17:00' }])}
                            className="btn btn-sm btn-ghost text-accent-ink"
                          >
                            <Plus />
                            فترة أخرى
                          </button>
                          <button type="button" onClick={() => copyToWorkdays(day)} className="btn btn-sm btn-ghost text-secondary">
                            <Copy />
                            نفس الأوقات لباقي الأيام
                          </button>
                          <button type="button" onClick={() => update(day, [])} className="btn btn-sm btn-ghost text-secondary">
                            <CalendarOff />
                            إغلاق اليوم
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => update(day, [{ start: '09:00', end: '12:00' }])} className="btn btn-sm btn-tinted">
                          <Plus />
                          فتح هذا اليوم
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="العطل والإغلاق"
        description="أيام أو ساعات لا تستقبل فيها مواعيد، مثل الأعياد والإجازات والمؤتمرات."
        aside={
          <button type="button" onClick={() => setBlockOpen(true)} className="btn btn-glass shrink-0">
            <Plus />
            إضافة عطلة
          </button>
        }
      >
        {upcomingBlocks.length === 0 ? (
          <div className="inset px-4 py-8 text-center text-secondary text-[14px]">
            <CalendarOff className="w-7 h-7 mx-auto mb-2 text-tertiary" />
            لا توجد عطل قادمة.
          </div>
        ) : (
          <div className="inset divide-y divide-hairline">
            {upcomingBlocks.map(b => {
              const sameDay = b.startDate === b.endDate;
              const fullDay = b.startTime === '00:00' && b.endTime === '23:59';
              const doctor = b.resourceId === 'ALL' ? null : doctors.find(d => d.id === b.resourceId)?.name;
              return (
                <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-danger/10 text-danger-ink flex items-center justify-center shrink-0">
                      <CalendarOff className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold truncate">{b.title}</div>
                      <div className="text-[13px] text-secondary">
                        {sameDay
                          ? formatArabicDate(b.startDate, { weekday: 'long', day: 'numeric', month: 'long' })
                          : `${formatArabicDate(b.startDate, { day: 'numeric', month: 'long' })} – ${formatArabicDate(b.endDate, { day: 'numeric', month: 'long' })}`}
                        {!fullDay && (
                          <>
                            {' '}
                            · <span className="num">{b.startTime}</span> – <span className="num">{b.endTime}</span>
                          </>
                        )}
                        {doctor && ` · ${doctor}`}
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeBlock(b)} className="icon-btn text-danger-ink hover:!bg-danger/10" aria-label="حذف" title="حذف">
                    <Trash2 />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>

      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(null)} label="حفظ أوقات العمل" />

      <BlockModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onSaved={affected => {
          load();
          toast(affected ? `تمت الإضافة. انتبه: لديك ${affected} موعد في هذه الفترة.` : 'تمت إضافة العطلة', affected ? 'info' : 'success');
        }}
      />
    </>
  );
}
