'use client';

import Link from 'next/link';
import { Moon, Stethoscope, Sun } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';

/** Glass header for the public site and the patient portal. */
export default function PublicHeader({ clinicName, children }: { clinicName?: string; children?: React.ReactNode }) {
  const { theme, setTheme, settings } = useApp();
  const name = clinicName || settings?.clinicName || '';
  return (
    <header className="top-blur no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 shrink-0 rounded-[12px] bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shadow-[0_8px_18px_-8px_rgb(10_132_255/0.8)]">
            <Stethoscope className="w-[18px] h-[18px]" />
          </span>
          <span className="text-[16px] font-semibold truncate">{name || 'حجز المواعيد'}</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {children}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="icon-btn glass"
            title="تغيير المظهر"
            aria-label="تغيير المظهر"
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </div>
      </div>
    </header>
  );
}
