import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
} from 'lucide-react';
import PublicHeader from './components/PublicHeader';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import TiltCard from './components/TiltCard';
import { readDb } from '@/lib/db';
import { activeDoctors, generateSlots, nextAvailable, publicDoctor } from '@/lib/availability';
import { DAY_NAMES, WEEK_ORDER, addDays, dayOfWeek, formatArabicDate, formatDuration, formatMoney, nowIn, relativeDay, toMinutes } from '@/lib/date';
import type { WeeklyHours } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await readDb();
  return {
    title: { absolute: `${settings.clinicName} · حجز موعد` },
    description: `احجز موعدك في ${settings.clinicName}${settings.specialty ? ` (${settings.specialty})` : ''} عبر الإنترنت في أقل من دقيقة.`,
  };
}

function openStatus(hours: WeeklyHours, tz: string): { open: boolean; text: string } {
  const now = nowIn(tz);
  const todayRanges = hours[dayOfWeek(now.date)] || [];
  const current = todayRanges.find(r => now.minutes >= toMinutes(r.start) && now.minutes < toMinutes(r.end));
  if (current) return { open: true, text: `مفتوح الآن حتى ${current.end}` };
  const laterToday = todayRanges.find(r => toMinutes(r.start) > now.minutes);
  if (laterToday) return { open: false, text: `مغلق الآن · يفتح اليوم ${laterToday.start}` };
  for (let i = 1; i <= 7; i++) {
    const d = addDays(now.date, i);
    const first = (hours[dayOfWeek(d)] || [])[0];
    if (first) return { open: false, text: `مغلق الآن · يفتح ${i === 1 ? 'غداً' : DAY_NAMES[dayOfWeek(d)]} ${first.start}` };
  }
  return { open: false, text: 'مغلق حالياً' };
}

export default async function Home() {
  const db = await readDb();
  const { settings } = db;
  const doctors = activeDoctors(db).map(r => publicDoctor(db, r));
  const doctor = doctors[0];
  const hours = doctor?.hours;
  const now = nowIn(settings.timezone);
  const status = hours ? openStatus(hours, settings.timezone) : null;
  const todayDow = dayOfWeek(now.date);
  const tel = settings.phone.replace(/[^\d+]/g, '');
  const waDigits = (() => {
    let d = settings.phone.replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.length === 10 && d.startsWith('0')) d = `213${d.slice(1)}`;
    return d.length >= 9 ? d : '';
  })();
  const services = doctor ? db.services.filter(s => !s.resourceId || s.resourceId === doctor.id) : [];
  const next = doctor ? nextAvailable(db, doctor.id, now.date) : null;
  const nextSlots = next ? generateSlots(db, doctor!.id, next.date).slots.filter(s => s.isAvailable).slice(0, 6) : [];

  const steps = [
    { icon: KeyRound, title: 'احصل على رمزك', text: 'تعطيك العيادة رمز دخول خاصاً بك عبر واتساب أو عند زيارتك، مرة واحدة فقط.' },
    { icon: CalendarClock, title: 'اختر الوقت', text: 'اختر نوع الزيارة واليوم والساعة من الأوقات المتاحة فعلاً.' },
    {
      icon: CalendarCheck2,
      title: 'احضر في موعدك',
      text: settings.requireApproval ? 'تؤكد العيادة موعدك، ويمكنك تغييره أو إلغاؤه بنفسك.' : 'يُؤكَّد موعدك فوراً، ويمكنك تغييره أو إلغاؤه بنفسك.',
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader clinicName={settings.clinicName}>
        <Link href="/client/bookings" className="btn btn-ghost btn-sm hidden sm:inline-flex">
          مواعيدي
        </Link>
        <Link href="/client" className="btn btn-primary btn-sm">
          احجز موعداً
        </Link>
      </PublicHeader>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-10 items-center">
          <div className="enter">
            {settings.specialty && (
              <span className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full glass text-[13.5px] font-semibold text-accent-ink">
                <Stethoscope className="w-4 h-4" />
                {settings.specialty}
              </span>
            )}
            <h1 className="text-[38px] sm:text-[56px] font-bold leading-[1.25] mt-5">{settings.clinicName}</h1>
            <p className="mt-4 text-[17px] sm:text-[19px] text-secondary leading-relaxed max-w-xl">
              احجز موعدك في أقل من دقيقة، واختر الوقت الذي يناسبك دون انتظار على الهاتف.
            </p>
            {status && (
              <p className={`mt-5 inline-flex items-center gap-2 text-[14.5px] font-medium ${status.open ? 'text-success-ink' : 'text-secondary'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${status.open ? 'bg-success live-dot' : 'bg-tertiary'}`} />
                {status.text}
              </p>
            )}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/client" className="btn btn-primary btn-lg px-8">
                احجز موعداً
                <ArrowLeft />
              </Link>
              <a href="#availability" className="btn btn-glass btn-lg">
                <CalendarClock />
                عرض المواعيد المتاحة
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-secondary">
              {['اختر الوقت بنفسك', 'تغيير أو إلغاء بسهولة', 'بياناتك تبقى خاصة'].map(t => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="enter [animation-delay:120ms]">
            <TiltCard className="card p-6 sm:p-7 relative overflow-hidden">
              <div className="absolute -top-24 -start-24 w-64 h-64 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-accent-ink">
                  <Sparkles className="w-4 h-4" />
                  أقرب موعد متاح
                </div>
                {next ? (
                  <>
                    <p className="text-[15px] text-secondary mt-3">
                      {relativeDay(next.date, now.date) !== formatArabicDate(next.date)
                        ? `${relativeDay(next.date, now.date)} · ${formatArabicDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' })}`
                        : formatArabicDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-[44px] font-bold tnum leading-tight">{next.slot.startTimeStr}</p>
                    {doctor && <p className="text-[14px] text-secondary">{doctor.name}</p>}
                    {nextSlots.length > 1 && (
                      <div className="mt-5">
                        <p className="text-[12.5px] text-tertiary mb-2">أوقات أخرى متاحة في نفس اليوم</p>
                        <div className="grid grid-cols-3 gap-2">
                          {nextSlots.map(s => (
                            <Link key={s.start} href="/client" className="h-10 rounded-xl bg-[var(--input)] border border-hairline flex items-center justify-center text-[14.5px] font-semibold tnum hover:border-accent/50">
                              {s.startTimeStr}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <Link href="/client" className="btn btn-primary w-full mt-6">
                      احجز هذا الموعد
                    </Link>
                  </>
                ) : (
                  <p className="text-[15px] text-secondary mt-3 leading-relaxed">لا توجد أوقات متاحة للحجز عبر الموقع حالياً. يرجى الاتصال بالعيادة.</p>
                )}
              </div>
            </TiltCard>
          </div>
        </section>

        {/* Free times, view only */}
        <section id="availability" className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 scroll-mt-20">
          <h2 className="text-[24px] sm:text-[28px] font-bold mb-2">المواعيد المتاحة</h2>
          <p className="text-[15px] text-secondary mb-6">اطّلع على الأيام والأوقات الفارغة قبل الحجز.</p>
          <AvailabilityCalendar />
        </section>

        {/* Info */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {hours && (
            <div className="card p-6">
              <h2 className="section-title flex items-center gap-2.5 mb-3">
                <span className="w-8 h-8 rounded-[10px] bg-accent/12 text-accent-ink flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </span>
                أوقات العمل
              </h2>
              <div className="divide-y divide-hairline">
                {WEEK_ORDER.map(d => {
                  const ranges = hours[d] || [];
                  const isToday = d === todayDow;
                  return (
                    <div key={d} className={`flex justify-between gap-4 py-2 text-[14.5px] ${isToday ? 'font-semibold' : ''}`}>
                      <span className="flex items-center gap-2">
                        {DAY_NAMES[d]}
                        {isToday && <span className="badge bg-accent/12 text-accent-ink h-5 text-[11px]">اليوم</span>}
                      </span>
                      <span className={ranges.length ? 'text-label' : 'text-tertiary'}>
                        {ranges.length
                          ? ranges.map((r, i) => (
                              <span key={r.start}>
                                {i > 0 && <span className="text-tertiary"> · </span>}
                                <span className="num">{r.start}</span>–<span className="num">{r.end}</span>
                              </span>
                            ))
                          : 'مغلق'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(settings.address || tel) && (
            <div className="card p-6 flex flex-col">
              <h2 className="section-title flex items-center gap-2.5 mb-4">
                <span className="w-8 h-8 rounded-[10px] bg-teal/15 text-teal flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </span>
                العنوان والتواصل
              </h2>
              {settings.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inset p-4 block hover:bg-fill"
                >
                  <span className="block text-[15px] leading-relaxed">{settings.address}</span>
                  <span className="block text-[13px] text-accent-ink font-semibold mt-1">فتح في الخرائط</span>
                </a>
              )}
              {tel && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <a href={`tel:${tel}`} className="btn btn-plain">
                    <Phone />
                    اتصال
                  </a>
                  {waDigits && (
                    <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" className="btn btn-success">
                      <MessageCircle />
                      واتساب
                    </a>
                  )}
                </div>
              )}
              {tel && <p className="text-[13px] text-secondary mt-3 num self-start">{settings.phone}</p>}
            </div>
          )}

          {services.length > 0 && (
            <div className="card p-6">
              <h2 className="section-title flex items-center gap-2.5 mb-3">
                <span className="w-8 h-8 rounded-[10px] bg-violet/15 text-violet-ink flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </span>
                الخدمات والأسعار
              </h2>
              <div className="divide-y divide-hairline">
                {services.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-medium">{s.name}</div>
                      <div className="text-[12.5px] text-tertiary">{formatDuration(s.durationMinutes || doctor?.slotDurationMinutes || 30)}</div>
                    </div>
                    <span className="text-[14.5px] font-semibold tnum shrink-0">{formatMoney(s.price)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] text-tertiary mt-3">الدفع في العيادة عند الحضور.</p>
            </div>
          )}

          {doctors.length > 1 && (
            <div className="card p-6 md:col-span-2 lg:col-span-3">
              <h2 className="section-title mb-4">الأطباء</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {doctors.map(d => (
                  <div key={d.id} className="inset p-4 flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shrink-0">
                      <Stethoscope className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold truncate">{d.name}</span>
                      {d.description && <span className="block text-[13px] text-secondary truncate">{d.description}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <h2 className="text-[24px] sm:text-[28px] font-bold text-center">كيف يعمل الحجز؟</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="card p-6">
                  <div className="flex items-center justify-between">
                    <span className="w-11 h-11 rounded-2xl bg-accent/12 text-accent-ink flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-[34px] font-bold text-fill-strong tnum leading-none">{i + 1}</span>
                  </div>
                  <h3 className="text-[17px] font-semibold mt-4">{s.title}</h3>
                  <p className="text-[14px] text-secondary mt-1.5 leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-[13.5px] text-secondary flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-success" />
            لا يرى أي مريض إلا مواعيده، والملاحظات الطبية تبقى خاصة بالعيادة.
          </p>
        </section>
      </main>

      <footer className="border-t border-hairline py-6 px-4 text-center text-[13px] text-secondary flex flex-col sm:flex-row items-center justify-center gap-2 no-print">
        <span>
          © {now.date.slice(0, 4)} {settings.clinicName}
        </span>
        <span className="hidden sm:inline text-tertiary">·</span>
        <Link href="/admin/login" className="hover:text-label">
          دخول فريق العيادة
        </Link>
      </footer>
    </div>
  );
}
