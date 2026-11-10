import type { Metadata } from 'next';
import PatientShell from './shell';

export const metadata: Metadata = {
  title: 'مواعيدي',
  robots: { index: false, follow: false },
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <PatientShell>{children}</PatientShell>;
}
