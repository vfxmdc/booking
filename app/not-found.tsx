import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card p-8 sm:p-10 max-w-md w-full text-center enter">
        <div className="w-16 h-16 mx-auto rounded-[20px] bg-accent/12 text-accent-ink flex items-center justify-center">
          <Compass className="w-8 h-8" />
        </div>
        <p className="text-[13px] font-semibold text-tertiary mt-5 num">404</p>
        <h1 className="text-[24px] font-bold mt-1">الصفحة غير موجودة</h1>
        <p className="text-secondary text-[15px] mt-2 leading-relaxed">ربما تغيّر الرابط أو كُتب بشكل خاطئ.</p>
        <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
          <Link href="/" className="btn btn-primary btn-lg">
            الصفحة الرئيسية
          </Link>
          <Link href="/client" className="btn btn-glass btn-lg">
            حجز موعد
          </Link>
        </div>
      </div>
    </div>
  );
}
