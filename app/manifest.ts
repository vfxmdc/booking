import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'حجز المواعيد',
    short_name: 'المواعيد',
    start_url: '/',
    display: 'standalone',
    background_color: '#edf0f6',
    theme_color: '#2563eb',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
