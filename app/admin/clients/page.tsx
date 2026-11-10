'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, Globe, ShieldOff, UserPlus, Users } from 'lucide-react';
import type { Client } from '@/lib/types';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from '../admin-context';
import { SearchField } from '../kit';
import { Avatar, EmptyState, PageHeader, Segmented, SkeletonList } from '@/app/components/ui';
import { api, usePolling } from '@/lib/web';
import { NOUNS, arCount, formatArabicDate, nowIn, relativeDay, timeOf } from '@/lib/date';

type Row = Client & { stats: { visits: number; lastVisit: string | null; nextVisit: string | null; upcoming: number } };
type Filter = 'all' | 'upcoming' | 'disabled';

export default function PatientsPage() {
  const { settings } = useApp();
  const { version, openPatient, newPatient, newAppointment } = useAdmin();
  const today = nowIn(settings?.timezone).date;
  const [clients, setClients] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    void version;
    api<{ clients: Row[] }>('/api/clients')
      .then(d => setClients(d.clients))
      .catch(() => null);
  }, [version]);
  usePolling(load, 60000);

  const disabledCount = (clients || []).filter(c => c.status === 'DISABLED').length;
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const code = q.replace(/[^a-z0-9]/g, '');
    return (clients || []).filter(c => {
      if (filter === 'upcoming' && !c.stats.upcoming) return false;
      if (filter === 'disabled' && c.status !== 'DISABLED') return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)) ||
        (code.length >= 3 && c.accessCode.toLowerCase().replace(/[^a-z0-9]/g, '').includes(code))
      );
    });
  }, [clients, query, filter]);

  const visit = (dt: string) => `${relativeDay(dt.slice(0, 10), today)} · ${timeOf(dt)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={clients ? `${arCount(clients.length, NOUNS.patient)} مسجّل` : 'المرضى'}
        title="المرضى"
        actions={
          <button type="button" onClick={newPatient} className="btn btn-primary">
            <UserPlus />
            مريض جديد
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <Segmented
          label="تصفية المرضى"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'upcoming', label: 'لديهم موعد قادم' },
            ...(disabledCount ? [{ value: 'disabled' as const, label: 'موقوفون' }] : []),
          ]}
        />
        <SearchField value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الهاتف أو الرمز" className="sm:w-80" />
      </div>

      {!clients ? (
        <SkeletonList rows={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={query || filter !== 'all' ? 'لا نتائج مطابقة' : 'لا يوجد مرضى بعد'}
          text={query || filter !== 'all' ? undefined : 'يُضاف المرضى تلقائياً عند حجز موعد لهم، أو يمكنك إضافتهم هنا وإرسال رمز الدخول لهم.'}
          action={
            !query && filter === 'all' ? (
              <button type="button" onClick={newPatient} className="btn btn-primary btn-sm">
                <UserPlus />
                إضافة مريض
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_80px_minmax(0,1.3fr)_88px] gap-4 px-4 py-2.5 text-[12.5px] font-medium text-tertiary border-b border-hairline">
            <span>المريض</span>
            <span>الهاتف</span>
            <span>الزيارات</span>
            <span>الموعد</span>
            <span />
          </div>
          <div className="divide-y divide-hairline">
            {list.map(c => (
              <div
                key={c.id}
                className={`row grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_80px_minmax(0,1.3fr)_88px] gap-4 items-center px-4 py-3 ${
                  c.status === 'DISABLED' ? 'opacity-60' : ''
                }`}
              >
                <button type="button" onClick={() => openPatient(c.id)} className="flex items-center gap-3 min-w-0 text-start md:col-span-4 md:grid md:grid-cols-subgrid">
                  <span className="flex items-center gap-3 min-w-0">
                    <Avatar name={c.name} size={40} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[15px] font-semibold truncate">{c.name}</span>
                        {c.status === 'DISABLED' && <ShieldOff className="w-3.5 h-3.5 text-danger shrink-0" aria-label="موقوف" />}
                        {c.selfRegistered && <Globe className="w-3.5 h-3.5 text-tertiary shrink-0" aria-label="سجّل عبر الموقع" />}
                      </span>
                      <span className="block text-[12.5px] text-secondary md:hidden truncate">
                        {c.phone && <span className="num">{c.phone}</span>}
                        {c.stats.nextVisit ? <span className="text-accent-ink"> · {visit(c.stats.nextVisit)}</span> : null}
                      </span>
                      {c.notes && <span className="hidden md:block text-[12px] text-warning-ink truncate max-w-[260px]">{c.notes}</span>}
                    </span>
                  </span>
                  <span className="hidden md:block text-[14px] text-secondary">{c.phone ? <span className="num">{c.phone}</span> : '—'}</span>
                  <span className="hidden md:block text-[14px] tnum">{c.stats.visits}</span>
                  <span className="hidden md:block text-[13.5px] min-w-0 truncate">
                    {c.stats.nextVisit ? (
                      <span className="text-accent-ink font-medium">{visit(c.stats.nextVisit)}</span>
                    ) : c.stats.lastVisit ? (
                      <span className="text-secondary">آخر زيارة: {formatArabicDate(c.stats.lastVisit.slice(0, 10), { day: 'numeric', month: 'short' })}</span>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </span>
                </button>
                <span className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => newAppointment({ clientId: c.id })}
                    className="icon-btn bg-accent/10 text-accent-ink hover:!bg-accent/18"
                    title="حجز موعد"
                    aria-label={`حجز موعد لـ ${c.name}`}
                  >
                    <CalendarPlus />
                  </button>
                  <ChevronLeft className="w-4 h-4 text-tertiary hidden md:block" aria-hidden />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
