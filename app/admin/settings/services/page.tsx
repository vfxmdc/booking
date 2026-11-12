'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Tag, Trash2 } from 'lucide-react';
import type { Service } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from '../../admin-context';
import { SettingsSection } from '../../kit';
import { EmptyState, ErrorNote, Field, Sheet, SheetFooter, Spinner } from '@/app/components/ui';
import { Select } from '@/app/components/pickers';
import { api } from '@/lib/web';
import { formatDuration, formatMoney } from '@/lib/date';

export default function ServicesPage() {
  const { doctors, toast, confirm, refreshSettings } = useApp();
  const { refresh } = useAdmin();
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  const load = useCallback(() => {
    api<{ services: Service[] }>('/api/services')
      .then(d => setServices(d.services))
      .catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (s: Service) => {
    const ok = await confirm({ title: `حذف «${s.name}»؟`, message: 'المواعيد السابقة بهذه الخدمة لن تتأثر.', confirmLabel: 'حذف', tone: 'danger' });
    if (!ok) return;
    try {
      await api(`/api/services/${s.id}`, { method: 'DELETE' });
      toast('تم حذف الخدمة');
      load();
      refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const defaultLength = doctors[0]?.slotDurationMinutes || 30;

  return (
    <>
      <SettingsSection
        title="الخدمات والأسعار"
        description="يختار المريض نوع الزيارة عند الحجز، ويرى السعر والمدة بوضوح."
        aside={
          <button type="button" onClick={() => setEditing('new')} className="btn btn-primary shrink-0">
            <Plus />
            خدمة جديدة
          </button>
        }
      >
        {!services ? (
          <div className="space-y-2">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
        ) : services.length === 0 ? (
          <EmptyState bare icon={<Tag />} title="لا توجد خدمات" text="بدون خدمات، يُحجز موعد عادي بسعر الطبيب ومدته." />
        ) : (
          <div className="inset divide-y divide-hairline">
            {services.map(s => (
              <div key={s.id} className="row flex items-center gap-3 px-4 py-3.5">
                <button type="button" onClick={() => setEditing(s)} className="flex-1 min-w-0 flex items-center gap-3 text-start">
                  <span className="w-10 h-10 rounded-xl bg-violet/15 text-violet-ink flex items-center justify-center shrink-0">
                    <Tag className="w-[18px] h-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold truncate">{s.name}</span>
                    <span className="block text-[13px] text-secondary truncate">
                      {formatDuration(s.durationMinutes || defaultLength)}
                      {s.description ? ` · ${s.description}` : ''}
                      {doctors.length > 1 && ` · ${s.resourceId ? doctors.find(d => d.id === s.resourceId)?.name || '' : 'كل الأطباء'}`}
                    </span>
                  </span>
                </button>
                <span className="text-[15px] font-semibold tnum shrink-0">{formatMoney(s.price)}</span>
                <button type="button" onClick={() => remove(s)} className="icon-btn text-danger-ink hover:!bg-danger/10" aria-label={`حذف ${s.name}`} title="حذف">
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {editing && (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          defaultLength={defaultLength}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            refresh();
            refreshSettings();
          }}
        />
      )}
    </>
  );
}

function ServiceForm({ service, defaultLength, onClose, onSaved }: { service: Service | null; defaultLength: number; onClose: () => void; onSaved: () => void }) {
  const { doctors, toast } = useApp();
  const [name, setName] = useState(service?.name || '');
  const [description, setDescription] = useState(service?.description || '');
  const [duration, setDuration] = useState(service?.durationMinutes ?? 0);
  const [price, setPrice] = useState(String(service?.price ?? doctors[0]?.price ?? 0));
  const [resourceId, setResourceId] = useState(service?.resourceId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) return setError('أدخل اسم الخدمة.');
    setSaving(true);
    setError(null);
    try {
      const body = { name, description, durationMinutes: duration, price: Number(price) || 0, resourceId: resourceId || null };
      if (service) await api(`/api/services/${service.id}`, { method: 'PATCH', body });
      else await api('/api/services', { method: 'POST', body });
      toast(service ? 'تم حفظ الخدمة' : 'تمت إضافة الخدمة');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const durations = [...new Set([0, 10, 15, 20, 30, 45, 60, 90, 120, duration])].sort((a, b) => a - b);

  return (
    <Sheet open onClose={onClose} title={service ? 'تعديل الخدمة' : 'خدمة جديدة'}>
      <div className="space-y-4">
        <Field label="الاسم">
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: استشارة، متابعة، تخطيط القلب" maxLength={80} data-autofocus />
        </Field>
        <Field label="وصف قصير (اختياري)" hint="يظهر للمريض تحت اسم الخدمة.">
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المدة">
            <Select
              value={duration}
              onChange={setDuration}
              options={durations.map(m => ({ value: m, label: m === 0 ? `المدة العادية (${formatDuration(defaultLength)})` : formatDuration(m) }))}
            />
          </Field>
          <Field label="السعر (دج)">
            <input type="number" inputMode="numeric" min={0} step={100} className="input" value={price} onChange={e => setPrice(e.target.value)} />
          </Field>
        </div>
        {doctors.length > 1 && (
          <Field label="الطبيب">
            <Select value={resourceId} onChange={setResourceId} options={[{ value: '', label: 'كل الأطباء' }, ...doctors.map(d => ({ value: d.id, label: d.name }))]} />
          </Field>
        )}
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
