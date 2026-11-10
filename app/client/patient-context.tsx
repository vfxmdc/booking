'use client';

import { createContext, useContext } from 'react';

/** Patients only ever receive their own id and access code (no name or phone). */
export interface Patient {
  id: string;
  accessCode: string;
}

export const PatientContext = createContext<{ patient: Patient | null; refresh: () => Promise<void> }>({
  patient: null,
  refresh: async () => {},
});

export const usePatient = () => useContext(PatientContext);
