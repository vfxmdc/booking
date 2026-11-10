'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet, SheetFooter, Field, ErrorNote, Segmented, Spinner } from './ui';
import { useApp } from '@/app/context/AppContext';
import { api } from '@/lib/web';
import { todayIn } from '@/lib/date';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (affected: number) => void;
}

const PRESETS = ['عطلة', 'إجازة سنوية', 'عيد', 'مؤتمر طبي', 'سفر', 'استراحة'];

/** Close the clinic for whole days or for a few hours on one day. */
export default function BlockModal(props: Props) {
  return props.open ? <BlockForm {...props} /> : null;
}

function BlockForm({ onClose, onSaved }: Props) {
  const { settings, doctors } = useApp();
  const today = todayIn(settings?.timezone);
  const [mode, setMode] = useState<'DAYS' | 'HOURS'>('DAYS');
  const [title, setTitle] = useState('عطلة');
  const [resourceId, setResourceId] = useState('ALL');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body =
        mode === 'DAYS'
          ? { type: 'BLOCK', resourceId, title, startDate, endDate: endDate < startDate ? startDate : endDate, startTime: '00:00', endTime: '23:59' }
          : { type: 'BLOCK', resourceId, title, startDate, endDate: startDate, startTime, endTime };
      const res = await api<{ affected: number }>('/api/availability', { method: 'POST', body });
      onSaved(res.affected);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="إضافة عطلة أو إغلاق" subtitle="لن يتمكن المرضى من الحجز خلال هذه الفترة.">
      <div className="space-y-5">
        <Segmented
          full
          size="lg"
          label="المدة"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'DAYS', label: 'يوم أو عدة أيام' },
            { value: 'HOURS', label: 'بضع ساعات' },
          ]}
        />

        <Field label="السبب">
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <div className="flex flex-wrap gap-2 -mt-2">
          {PRESETS.map(p => (
            <button key={p} type="button" data-active={title === p} onClick={() => setTitle(p)} className="chip h-8 text-[13px]">
              {p}
            </button>
          ))}
        </div>

        {doctors.length > 1 && (
          <Field label="ينطبق على">
            <select className="input" value={resourceId} onChange={e => setResourceId(e.target.value)}>
              <option value="ALL">كل الأطباء</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {mode === 'DAYS' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="من">
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="إلى">
              <input type="date" className="input" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Field label="اليوم">
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="من">
              <input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </Field>
            <Field label="إلى">
              <input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </Field>
          </div>
        )}
        <p className="text-[13px] text-tertiary px-1 leading-relaxed">المواعيد الموجودة في هذه الفترة لا تُلغى تلقائياً. ستظهر لك رسالة إن وُجدت.</p>
        <ErrorNote message={error} />
      </div>
      <SheetFooter>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-plain btn-lg">
            رجوع
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-lg flex-1">
            {saving ? <Spinner className="w-4 h-4" /> : <Check />}
            حفظ
          </button>
        </div>
      </SheetFooter>
    </Sheet>
  );
}
