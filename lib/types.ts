export type ResourceCategory = 'DOCTOR' | 'CAR_RENTAL' | 'APARTMENT' | 'HOTEL' | 'SALON' | 'OTHER';
export type BookingMode = 'TIME_SLOT' | 'DATE_RANGE';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'PENDING';

/** Things that can happen to an appointment, kept in its history. */
export type BookingAction =
  | 'CREATED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'RESTORED'
  | 'RESCHEDULED'
  | 'ATTENDED'
  | 'NO_SHOW';

export interface BookingEvent {
  /** ISO timestamp */
  at: string;
  action: BookingAction;
  actor: 'CLIENT' | 'ADMIN';
  /** Staff member's name for ADMIN actions */
  name?: string;
  /** RESCHEDULED: previous and new start ("YYYY-MM-DDTHH:mm") */
  from?: string;
  to?: string;
}

/** A bookable doctor (kept generic as "resource" for compatibility). */
export interface Resource {
  id: string;
  name: string;
  category: ResourceCategory;
  bookingMode: BookingMode;
  /** Length of one appointment slot / grid step in minutes */
  slotDurationMinutes: number;
  price: number;
  priceUnit: 'per_slot' | 'per_hour' | 'per_night' | 'per_day';
  description: string;
  location?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

/** A visit type, e.g. consultation / follow-up. resourceId null = all doctors. */
export interface Service {
  id: string;
  resourceId: string | null;
  name: string;
  /** 0 = same as the doctor's appointment length */
  durationMinutes: number;
  price: number;
  description: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  accessCode: string;
  status: 'ACTIVE' | 'DISABLED';
  /** Private notes for the doctor — never sent to the patient */
  notes?: string;
  selfRegistered?: boolean;
  /** Totals of the visits whose appointments were removed by the weekly cleanup */
  archived?: ArchivedTotals;
  createdAt: string;
}

/** What is kept about a patient's appointments after they are deleted. */
export interface ArchivedTotals {
  /** Past appointments that were not cancelled and not a no-show */
  visits: number;
  noShows: number;
  /** Sum of the prices of those visits */
  paid: number;
  /** Start of the most recent removed past appointment ("YYYY-MM-DDTHH:mm") */
  lastVisit: string | null;
}

export interface AvailabilityRule {
  id: string;
  resourceId: string; // 'ALL' or a doctor id
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  isAvailable: boolean;
}

export interface BlockRule {
  id: string;
  resourceId: string; // 'ALL' or a doctor id
  title: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  startTime: string; // "00:00"
  endTime: string; // "23:59"
  createdAt: string;
}

export interface Booking {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  resourceId: string;
  resourceName: string;
  serviceId: string | null;
  serviceName: string | null;
  bookingMode: BookingMode;
  /** Clinic wall-clock time "YYYY-MM-DDTHH:mm" (no timezone) */
  startDateTime: string;
  endDateTime: string;
  status: BookingStatus;
  /** Internal note, visible to clinic staff only */
  notes: string;
  /** Reason for visit written by the patient */
  patientNote?: string;
  price: number;
  attended?: boolean;
  /** The patient did not come */
  noShow?: boolean;
  source?: 'ADMIN' | 'CLIENT';
  cancelledBy?: 'ADMIN' | 'CLIENT';
  createdByAdmin?: string;
  updatedByAdmin?: string;
  createdAt: string;
  updatedAt: string;
  /** Who did what, oldest first (staff only) */
  log?: BookingEvent[];
}

export interface TimeSlot {
  start: string; // "YYYY-MM-DDTHH:mm"
  end: string;
  startTimeStr: string; // "10:00"
  endTimeStr: string; // "10:30"
  isAvailable: boolean;
  reason?: 'BOOKED' | 'BLOCKED' | 'PAST';
  bookingId?: string;
}

export type DayStatus = 'OPEN' | 'CLOSED' | 'HOLIDAY' | 'OUT_OF_WINDOW';

export interface Settings {
  clinicName: string;
  specialty: string;
  phone: string;
  address: string;
  /** Shown to patients before they confirm */
  notice: string;
  /** How many days ahead patients may book */
  bookingWindowDays: number;
  /** Patients cannot book a slot starting sooner than this */
  minNoticeMinutes: number;
  /** Patients can cancel up to this many hours before the appointment */
  cancelNoticeHours: number;
  maxUpcomingPerPatient: number;
  /** Online bookings wait for the clinic to confirm them */
  requireApproval: boolean;
  timezone: string;
  /**
   * Weekly cleanup: appointments from before the last N weeks are deleted after a 7-day warning.
   * 1 keeps the current week only; 0 never deletes.
   */
  retentionWeeks: number;
}

export type StaffRole = 'SUPER' | 'ADMIN';

/** Clinic staff account. SUPER manages everything, including other accounts and codes. */
export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  codeHash: string;
  codeSalt: string;
  /** Bumped when the code changes or the account is disabled — signs out old sessions */
  sessionVersion: number;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export type PublicStaff = Omit<Staff, 'codeHash' | 'codeSalt' | 'sessionVersion'>;

export interface DaySummary {
  date: string;
  total: number;
  booked: number;
  status: 'OPEN' | 'CLOSED' | 'HOLIDAY';
  holiday?: string;
}

export type WeeklyHours = Record<number, { start: string; end: string }[]>;

export interface PublicDoctor {
  id: string;
  name: string;
  description: string;
  location?: string;
  slotDurationMinutes: number;
  price: number;
  hours: WeeklyHours;
}

export interface DBData {
  settings: Settings;
  resources: Resource[];
  services: Service[];
  clients: Client[];
  availabilityRules: AvailabilityRule[];
  blockRules: BlockRule[];
  bookings: Booking[];
  staff: Staff[];
  meta: {
    secret: string;
    createdAt: string;
    schema?: number;
    /** Old appointments announced to the staff and waiting to be deleted */
    cleanup?: CleanupBatch;
    lastCleanup?: CleanupRecord;
  };
}

/** A batch of old appointments: staff are warned, then it is deleted on `dueOn`. */
export interface CleanupBatch {
  /** Appointments dated before this day ("YYYY-MM-DD") are in the batch */
  before: string;
  /** Clinic date on which the batch is deleted automatically */
  dueOn: string;
  /** ISO timestamp */
  announcedAt: string;
  /** Last download of the list by a staff member (ISO timestamp) */
  downloadedAt?: string;
  downloadedBy?: string;
}

/** The most recent deletion of old appointments. */
export interface CleanupRecord {
  /** ISO timestamp */
  at: string;
  before: string;
  count: number;
  /** Staff member's name, or 'auto' for the scheduled deletion */
  by: string;
}

/** The deleted appointments themselves, kept until the next cleanup replaces them. */
export interface CleanupCopy extends CleanupRecord {
  bookings: Booking[];
}

/** What staff see about the batch waiting to be deleted. */
export interface CleanupNotice {
  before: string;
  dueOn: string;
  daysLeft: number;
  count: number;
  /** Dates of the first and last appointment in the batch */
  from: string;
  to: string;
  /** Set only while the downloaded list is still up to date */
  downloadedAt: string | null;
  downloadedBy: string | null;
  /** The list was downloaded, but an appointment in it changed afterwards */
  changedSinceDownload: boolean;
}

/** A patient action shown to the clinic as a notification. */
export interface FeedEvent {
  id: string;
  bookingId: string;
  action: BookingAction;
  /** ISO timestamp */
  at: string;
  text: string;
}
