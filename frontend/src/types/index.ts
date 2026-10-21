export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'COURTESY';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export type EventStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface EventSettings {
  id: string;
  eventId: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  backgroundColor: string;
  themeMode: 'dark' | 'light' | 'system';
  currencyCode: string;
  currencySymbol: string;
  logoUrl?: string | null;
  loginLogoUrl?: string | null;
  faviconUrl?: string | null;
  coverImageUrl?: string | null;
  subtitle: string;
  registrationPrefix: string;
  tshirtSizesEnabled?: boolean;
  tshirtSizes?: string[];
  demoModeEnabled?: boolean;
  customCss?: Record<string, any>;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  price: number;
  description?: string;
  isActive: boolean;
  presaleStartDate?: string | null;
  presaleEndDate?: string | null;
  totalCapacity?: number | null;
}

export interface EventEdition {
  id: string;
  slug: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  venue: string;
  description?: string;
  maxCapacity?: number | null;
  status: EventStatus;
  isDefault: boolean;
  settings?: EventSettings;
  ticketTypes?: TicketType[];
  _count?: {
    registrations: number;
    importBatches: number;
  };
}

export interface PaymentMethod {
  id: string;
  eventId: string;
  name: string;
  code?: string;
  isActive: boolean;
}

export interface SalesResponsible {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  role?: string;
  isActive: boolean;
}

export interface Participant {
  id: string;
  documentId?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  institution?: string;
  isDemo?: boolean;
  updatedByUserId?: string;
  updatedByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  registrationId: string;
  amount: number;
  paymentMethodId: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  receivedByUserId?: string;
  receivedByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
}

export interface Registration {
  id: string;
  eventId: string;
  participantId: string;
  registrationNumber: string;
  qrCode?: string;
  qrGeneratedAt?: string;
  qrRevokedAt?: string;
  source: 'EXCEL_IMPORT' | 'MANUAL' | 'ONSITE_SALE';
  importBatchId?: string;
  ticketTypeId?: string;
  ticketType?: TicketType;
  ticketPrice?: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentMethodId?: string;
  totalAmount: number;
  isVerified: boolean;
  isCourtesy: boolean;
  courtesyAuthorizedBy?: string;
  courtesyReason?: string;
  courtesyDate?: string;
  courtesyUserId?: string;
  courtesyUser?: {
    id: string;
    fullName: string;
    email: string;
  };
  isDemo: boolean;
  salesResponsibleId?: string;
  saleTimestamp: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  attended: boolean;
  attendedAt?: string;
  attendedByUserId?: string;
  tshirtSize?: string;
  tshirtSizeUpdatedAt?: string;
  tshirtSizeUpdatedByUserId?: string;
  attendedByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
  updatedByUserId?: string;
  updatedByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
  payments?: Payment[];
  attendanceLogs?: Array<{
    id: string;
    timestamp: string;
    action: string;
    user?: {
      id: string;
      fullName: string;
      email: string;
    };
  }>;
  customFields?: Record<string, any>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  participant: Participant;
  paymentMethod?: PaymentMethod;
  salesResponsible?: SalesResponsible;
  editionHistory?: Array<{
    registrationId: string;
    editionId: string;
    editionName: string;
    year: number;
    registrationNumber: string;
    ticketTypeName?: string;
    status: string;
    paymentStatus?: PaymentStatus;
    attended: boolean;
    isCourtesy: boolean;
    totalAmount: number;
    saleTimestamp: string;
    paymentMethodName: string;
  }>;
}

export interface AuditLog {
  id: string;
  userId?: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    role: Role;
  };
  action: string;
  entity: string;
  entityId?: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface DailySalesSummary {
  date: string;
  totalSalesCount: number;
  onsiteSalesCount: number;
  totalPaymentsCount: number;
  totalAmount: number;
  byMethod: Record<string, { count: number; total: number }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    method: string;
    participantName: string;
    ticket: string;
    time: string;
    operator: string;
  }>;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  message?: string;
  data: T;
}

export interface DemoStatus {
  eventId?: string;
  eventName?: string;
  demoModeEnabled: boolean;
  demoCount?: number;
  realCount?: number;
  totalCount?: number;
  counts?: {
    demoParticipants: number;
    demoRegistrations: number;
    realParticipants: number;
    realRegistrations: number;
    totalRegistrations: number;
  };
}

export interface QrTicketData {
  token: string;
  qrDataUrl: string;
  generatedAt: string;
  registration: {
    id: string;
    registrationNumber: string;
    status: RegistrationStatus;
    paymentStatus: PaymentStatus;
    isCourtesy: boolean;
    attended: boolean;
    attendedAt?: string;
    ticketType: string;
    price: number;
  };
  participant: {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    documentId?: string;
    institution?: string;
  };
  event: {
    id: string;
    name: string;
    year: number;
    venue: string;
    startDate: string;
    endDate: string;
    logoUrl?: string;
    currencySymbol: string;
  };
}

export interface QrScanResult {
  valid: boolean;
  status: 'VALID' | 'ALREADY_CHECKED_IN' | 'CANCELLED' | 'EDITION_MISMATCH' | 'REVOKED' | 'INVALID_CODE';
  message: string;
  canCheckIn: boolean;
  registration?: Registration;
}

export interface EmailConfig {
  id?: string;
  eventId: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  isEnabled: boolean;
}

export interface EmailTemplate {
  id: string;
  eventId: string;
  code: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  variables?: string;
  isSystem: boolean;
}

export type EmailLogStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SIMULATED';

export interface EmailLog {
  id: string;
  eventId: string;
  registrationId?: string;
  recipientEmail: string;
  recipientName: string;
  templateCode: string;
  subject: string;
  status: EmailLogStatus;
  errorMessage?: string;
  sentByUserId?: string;
  sentByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
  sentAt: string;
  registration?: {
    id: string;
    registrationNumber: string;
    participant: {
      fullName: string;
    };
  };
}

export interface FinancialSummary {
  currencySymbol: string;
  currencyCode: string;
  totalRegistrations: number;
  confirmedCount: number;
  courtesyCount: number;
  verifiedPaymentsCount: number;
  totalPaymentsCount: number;
  totalRevenue: number;
  totalExpected: number;
  totalPending: number;
  totalOverpaid: number;
  byMethod: Array<{
    name: string;
    count: number;
    totalAmount: number;
  }>;
  byTicketType: Array<{
    name: string;
    price: number;
    count: number;
    totalRevenue: number;
  }>;
  byResponsible: Array<{
    name: string;
    count: number;
    totalAmount: number;
  }>;
  recentTransactions: Array<{
    id: string;
    amount: number;
    method: string;
    reference: string;
    notes?: string;
    timestamp: string;
    participantName: string;
    ticketNumber: string;
    operator: string;
    isDirectPayment: boolean;
  }>;
}
