'use client';

import { createContext, useContext } from 'react';
import type { AdminUser } from '@/lib/app-config';
import type { Booking } from '@/lib/types';

export type StorageKind = 'supabase' | 'file' | 'unconfigured';

export interface AppointmentDefaults {
  date?: string;
  /** "YYYY-MM-DDTHH:mm" picked on the calendar */
  start?: string;
  clientId?: string;
}

export interface AdminContextValue {
  admin: AdminUser;
  isSuper: boolean;
  storage: StorageKind | null;
  /** Increases after every change, so open pages reload their data */
  version: number;
  refresh: () => void;
  /** Online requests waiting for confirmation */
  pending: number;
  openAppointment: (booking: Booking | string) => void;
  newAppointment: (defaults?: AppointmentDefaults) => void;
  openPatient: (clientId: string) => void;
  newPatient: () => void;
  openSearch: () => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside the admin shell');
  return ctx;
}

