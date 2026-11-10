'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pause, Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react';
import type { Resource } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from '../../admin-context';
import { SettingsSection } from '../../kit';
import { ErrorNote, Field, Segmented, Sheet, SheetFooter, Spinner } from '@/app/components/ui';
import { api } from '@/lib/web';
import { formatDuration, formatMoney } from '@/lib/date';

export default function DoctorsPage() {
  const { refreshSettings, toast, confirm } = useApp();
  const { refresh } = useAdmin();
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);

  const load = useCallback(() => {
    api<{ resources: Resource[] }>('/api/resources')
      .then(d => setResources(d.resources.filter(r => r.bookingMode === 'TIME_SLOT')))
      .catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const afterChange = () => {
    load();
    refreshSettings();
    refresh();
  };

  const setActive = async (r: Resource, isActive: boolean) => {
    setResources(list => (list || []).map(x => (x.id === r.id ? { ...x, isActive } : x)));
    try {
      await api(`/api/resources/${r.id}`, { method: 'PATCH', body: { isActive } });
      toast(isActive ? `الحجز عبر الموقع متاح لدى ${r.name}` : `تم إيقاف الحجز عبر الموقع لدى ${r.name}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    afterChange();
  };

  const remove = async (r: Resource) => {
    const ok = await confirm({ title: `حذف ${r.name}؟`, message: 'تُحذف أوقات عمله وخدماته الخاصة أيضاً.', confirmLabel: 'حذف', tone: 'danger' });
    if (!ok) return;
    try {
      await api(`/api/resources/${r.id}`, { method: 'DELETE' });
      toast('تم الحذف');
      afterChange();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <>
      <SettingsSection
        title="الأطباء"
        description="لكل طبيب أوقات عمل وجدول مواعيد خاص. أوقف الحجز مؤقتاً عند الغياب الطويل دون حذف المواعيد."
        aside={
          <button type="button" onClick={() => setEditing('new')} className="btn btn-primary shrink-0">
            <Plus />
            إضافة طبيب
          </button>
        }
      >
        {!resources ? (
          <div className="skeleton h-20" />
        ) : (
          <div className="inset divide-y divide-hairline">
            {resources.map(r => (
              <div key={r.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <button type="button" onClick={() => setEditing(r)} className="flex-1 min-w-0 flex items-center gap-3 text-start">
                  <span className="w-11 h-11 rounded-2xl bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shrink-0">
                    <Stethoscope className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15.5px] font-semibold truncate">{r.name}</span>
                    <span className="block text-[13px] text-secondary truncate">
                      {r.description || 'بدون اختصاص'} · {formatDuration(r.slotDurationMinutes)} · <span className="tnum">{formatMoney(r.price)}</span>
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Segmented
                    label={`الحجز عبر الموقع لدى ${r.name}`}
                    value={r.isActive ? 'on' : 'off'}
                    onChange={v => setActive(r, v === 'on')}
                    options={[
                      { value: 'on', label: 'متاح للحجز', icon: <Check className="w-3.5 h-3.5" /> },
                      { value: 'off', label: 'متوقف', icon: <Pause className="w-3.5 h-3.5" /> },
                    ]}
                  />
                  <button type="button" onClick={() => setEditing(r)} className="icon-btn" aria-label={`تعديل ${r.name}`} title="تعديل">
                    <Pencil />
                  </button>
                  {resources.length > 1 && (
                    <button type="button" onClick={() => remove(r)} className="icon-btn text-danger-ink hover:!bg-danger/10" aria-label={`حذف ${r.name}`} title="حذف">
                      <Trash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {editing && (
        <DoctorForm
          resource={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            afterChange();
          }}
        />
      )}
    </>
  );
}

function DoctorForm({ resource, onClose, onSaved }: { resource: Resource | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(resource?.name || '');
  const [description, setDescription] = useState(resource?.description || '');
  const [location, setLocation] = useState(resource?.location || '');
  const [slot, setSlot] = useState(resource?.slotDurationMinutes || 30);
  const [price, setPrice] = useState(String(resource?.price ?? 2000));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) return setError('أدخل اسم الطبيب.');
    setSaving(true);
    setError(null);
    try {
      const body = { name, description, location, slotDurationMinutes: slot, price: Number(price) || 0 };
      if (resource) await api(`/api/resources/${resource.id}`, { method: 'PATCH', body });
      else await api('/api/resources', { method: 'POST', body });
      toast(resource ? 'تم حفظ بيانات الطبيب' : 'تمت إضافة الطبيب');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={resource ? 'بيانات الطبيب' : 'طبيب جديد'} subtitle={resource ? undefined : 'يبدأ بنفس أوقات عمل الطبيب الأول، ويمكن تعديلها لاحقاً.'}>
      <div className="space-y-4">
        <Field label="الاسم كما يظهر للمرضى">
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="د. أحمد بن علي" maxLength={80} data-autofocus />
        </Field>
        <Field label="الاختصاص">
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="طب عام، طب الأطفال، أمراض القلب…" maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="مدة الموعد" hint="الفاصل بين المواعيد.">
            <select className="input" value={slot} onChange={e => setSlot(Number(e.target.value))}>
              {[...new Set([10, 15, 20, 30, 45, 60, slot])]
                .sort((a, b) => a - b)
                .map(m => (
                  <option key={m} value={m}>
                    {formatDuration(m)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="سعر الموعد (دج)" hint="عند عدم وجود خدمات.">
            <input type="number" inputMode="numeric" min={0} step={100} className="input" value={price} onChange={e => setPrice(e.target.value)} />
          </Field>
        </div>
        <Field label="المكتب أو الطابق (اختياري)">
          <input className="input" value={location} onChange={e => setLocation(e.target.value)} maxLength={200} />
        </Field>
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
