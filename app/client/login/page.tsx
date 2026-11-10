'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, MessageCircle, Phone } from 'lucide-react';
import PublicHeader from '@/app/components/PublicHeader';
import { useApp } from '@/app/context/AppContext';
import { ErrorNote, Spinner } from '@/app/components/ui';
import { usePatient } from '../patient-context';
import { api, telLink, whatsappLink } from '@/lib/web';

/** "abcd1234" → "ABCD-1234" while typing */
function formatCode(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export default function ClientLoginPage() {
  const router = useRouter();
  const { settings } = useApp();
  const { refresh } = usePatient();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/client/login', { method: 'POST', body: { accessCode: code } });
      await refresh();
      router.replace('/client');
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const clinic = settings?.clinicName || 'العيادة';
  const phone = settings?.phone || '';

  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-[420px] space-y-4 enter">
          <div className="card p-7 sm:p-9 text-center">
            <div className="w-16 h-16 mx-auto rounded-[20px] bg-linear-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center shadow-[0_14px_30px_-12px_rgb(20_184_166/0.8)]">
              <KeyRound className="w-7 h-7" />
            </div>
            <h1 className="text-[24px] font-bold mt-5">احجز موعدك</h1>
            <p className="text-secondary text-[14.5px] mt-1">أدخل رمز الدخول الذي أرسلته لك {clinic}.</p>

            <form onSubmit={submit} className="mt-7 space-y-3">
              <input
                type="text"
                required
                autoFocus
                autoCapitalize="characters"
                autoComplete="one-time-code"
                spellCheck={false}
                placeholder="ABCD-1234"
                value={code}
                onChange={e => {
                  setCode(formatCode(e.target.value));
                  setError(null);
                }}
                className={`input h-16 text-center text-[24px] font-semibold num w-full tracking-[0.18em] ${error ? 'border-danger/60' : ''}`}
                dir="ltr"
                aria-label="رمز الدخول"
                aria-invalid={Boolean(error)}
              />
              <ErrorNote message={error} />
              <button type="submit" disabled={loading || code.replace('-', '').length < 8} className="btn btn-primary btn-lg w-full">
                {loading ? <Spinner className="w-5 h-5" /> : 'متابعة'}
              </button>
            </form>
          </div>

          <div className="card p-5">
            <p className="text-[15px] font-semibold">ليس لديك رمز؟</p>
            <p className="text-[13.5px] text-secondary mt-1 leading-relaxed">
              اطلبه من العيادة مرة واحدة فقط، ثم احجز وغيّر مواعيدك بنفسك في أي وقت.
            </p>
            {phone ? (
              <div className="grid grid-cols-2 gap-2 mt-4">
                <a
                  href={whatsappLink(phone, `مرحباً، أريد رمز الدخول لحجز موعد في ${clinic}.\nالاسم: `)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-success"
                >
                  <MessageCircle />
                  واتساب
                </a>
                <a href={telLink(phone)} className="btn btn-plain">
                  <Phone />
                  اتصال
                </a>
              </div>
            ) : (
              <p className="text-[13.5px] text-secondary mt-3">يمكنك الحصول عليه عند زيارتك القادمة للعيادة.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
