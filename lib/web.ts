'use client';

import { useEffect, useSyncExternalStore } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** JSON fetch helper that surfaces the server's Arabic error message. */
export async function api<T = Record<string, unknown>>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'تعذّر الاتصال. تحقق من الإنترنت ثم حاول مجدداً.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error || 'تعذّر تنفيذ الطلب.';
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** Runs `fn` now, every `ms` while the tab is visible, and when the tab regains focus. */
export function usePolling(fn: () => void, ms: number) {
  useEffect(() => {
    fn();
    const tick = () => {
      if (document.visibilityState === 'visible') fn();
    };
    const timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [fn, ms]);
}

/** wa.me link; Algerian numbers like 0555… become 213555… */
export function whatsappLink(phone: string, text: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith('0')) digits = `213${digits.slice(1)}`;
  return `https://wa.me/${digits.length >= 9 ? digits : ''}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string): string {
  return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV with a BOM so Excel shows Arabic correctly. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadFile(filename, `﻿${csv}`, 'text/csv;charset=utf-8');
}

/** Calendar file for the patient ("floating" local time). */
export function downloadIcs(opts: { title: string; start: string; end: string; location?: string; description?: string }) {
  const fmt = (dt: string) => `${dt.replace(/[-:]/g, '')}00`;
  const esc = (s: string) => s.replace(/[\\,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//clinic-booking//AR',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@clinic-booking`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${fmt(opts.start)}`,
    `DTEND:${fmt(opts.end)}`,
    `SUMMARY:${esc(opts.title)}`,
    opts.location ? `LOCATION:${esc(opts.location)}` : '',
    opts.description ? `DESCRIPTION:${esc(opts.description)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(opts.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  downloadFile('appointment.ics', ics, 'text/calendar;charset=utf-8');
}

const noSubscribe = () => () => {};

/** The site origin ("https://…"), available after hydration (empty on the server). */
export function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => '');
}
