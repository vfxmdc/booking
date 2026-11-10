'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Clock, Lock, ShieldCheck, SlidersHorizontal, Stethoscope, Tag } from 'lucide-react';
import { useAdmin } from '../admin-context';
import { EmptyState, PageHeader } from '@/app/components/ui';

const SECTIONS = [
  { href: '/admin/settings', label: 'العيادة', icon: Building2, superOnly: true },
  { href: '/admin/settings/booking', label: 'قواعد الحجز', icon: SlidersHorizontal, superOnly: true },
  { href: '/admin/settings/hours', label: 'أوقات العمل والعطل', icon: Clock, superOnly: false },
  { href: '/admin/settings/services', label: 'الخدمات والأسعار', icon: Tag, superOnly: true },
  { href: '/admin/settings/doctors', label: 'الأطباء', icon: Stethoscope, superOnly: true },
  { href: '/admin/settings/team', label: 'الفريق', icon: ShieldCheck, superOnly: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSuper } = useAdmin();
  const sections = SECTIONS.filter(s => isSuper || !s.superOnly);
  const current = SECTIONS.find(s => s.href === pathname);
  const allowed = isSuper || !current?.superOnly;

  return (
    <div className="space-y-5 pb-16">
      <PageHeader eyebrow="إدارة العيادة" title="الإعدادات" />
      <nav className="segmented segmented-lg max-w-full" aria-label="أقسام الإعدادات">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} data-active={pathname === s.href} aria-current={pathname === s.href ? 'page' : undefined}>
              <Icon className="w-4 h-4" />
              {s.label}
            </Link>
          );
        })}
      </nav>
      {allowed ? (
        <div className="space-y-5 max-w-4xl">{children}</div>
      ) : (
        <EmptyState icon={<Lock />} title="هذا القسم للمسؤول الرئيسي فقط" text="اطلب من المسؤول الرئيسي للعيادة تعديل هذه الإعدادات." />
      )}
    </div>
  );
}
