'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole, ArrowLeft, Sun, Moon } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { ErrorNote, Spinner } from '@/app/components/ui';
import { api } from '@/lib/web';

export default function LoginForm() {
  const router = useRouter();
  const { settings, theme, setTheme } = useApp();
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/admin/login', { method: 'POST', body: { code } });
      router.replace('/admin');
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex items-center justify-between px-4 sm:px-6 h-16">
        <Link href="/" className="btn btn-ghost btn-sm text-secondary">
          <ArrowLeft className="rotate-180" />
          صفحة العيادة
        </Link>
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="icon-btn glass"
          aria-label="تغيير المظهر"
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px] enter">
          <div className="card p-7 sm:p-9 text-center">
            <div className="w-16 h-16 mx-auto rounded-[20px] bg-linear-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shadow-[0_14px_30px_-12px_rgb(10_132_255/0.8)]">
              <LockKeyhole className="w-7 h-7" />
            </div>
            <h1 className="text-[24px] font-bold mt-5">دخول فريق العيادة</h1>
            <p className="text-secondary text-[14.5px] mt-1">{settings?.clinicName ? `${settings.clinicName} · ` : ''}أدخل رمز الدخول الخاص بك.</p>

            <form onSubmit={submit} className="mt-7 space-y-3 text-start">
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  autoFocus
                  placeholder="رمز الدخول"
                  value={code}
                  onChange={e => {
                    setCode(e.target.value);
                    setError(null);
                  }}
                  className={`input h-14 text-center text-[18px] tracking-wider ${error ? 'border-danger/60' : ''}`}
                  dir="ltr"
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  className="absolute top-1/2 -translate-y-1/2 end-2 icon-btn text-tertiary"
                  aria-label={show ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <ErrorNote message={error} />
              <button type="submit" disabled={loading || !code} className="btn btn-primary btn-lg w-full">
                {loading ? <Spinner className="w-5 h-5" /> : 'دخول'}
              </button>
            </form>
          </div>

          <p className="text-center mt-6 text-[14px] text-secondary">
            لست من فريق العيادة؟{' '}
            <Link href="/client/login" className="text-accent-ink font-semibold">
              احجز موعداً كمريض
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
