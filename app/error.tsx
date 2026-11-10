'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, TriangleAlert } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70dvh] flex items-center justify-center px-4">
      <div className="card p-8 sm:p-10 max-w-md w-full text-center enter">
        <div className="w-16 h-16 mx-auto rounded-[20px] bg-warning/15 text-warning-ink flex items-center justify-center">
          <TriangleAlert className="w-8 h-8" />
        </div>
        <h1 className="text-[22px] font-bold mt-5">حدث خطأ غير متوقع</h1>
        <p className="text-secondary text-[15px] mt-2 leading-relaxed">تحقق من الاتصال بالإنترنت ثم حاول مجدداً. لم يتم فقدان أي بيانات.</p>
        <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
          <button type="button" onClick={reset} className="btn btn-primary btn-lg">
            <RotateCcw />
            إعادة المحاولة
          </button>
          <Link href="/" className="btn btn-glass btn-lg">
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
