import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import './globals.css';
import { AppProvider } from './context/AppContext';

// Latin digits and letters use Inter, Arabic uses IBM Plex Sans Arabic.
// No generated fallback faces: an Arial-based fallback would also catch Arabic letters.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap', adjustFontFallback: false });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: 'حجز المواعيد', template: '%s · حجز المواعيد' },
  description: 'احجز موعدك عبر الإنترنت في أقل من دقيقة.',
  applicationName: 'حجز المواعيد',
  appleWebApp: { capable: true, title: 'المواعيد', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#edf0f6' },
    { media: '(prefers-color-scheme: dark)', color: '#06080f' },
  ],
};

// Applies the saved (or system) theme before the first paint, so there is no flash.
const themeScript = `try{var t=localStorage.getItem('app_theme');if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.add(t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${inter.variable} ${arabic.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="ambient" aria-hidden />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
