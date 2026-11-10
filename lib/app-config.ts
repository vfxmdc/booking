import type { StaffRole } from './types';

export type Theme = 'dark' | 'light';

export interface AdminUser {
  id: string;
  name: string;
  role: StaffRole;
}

// Staff login codes are stored hashed in the database; the first one comes from ADMIN_PASSWORD (see README).
