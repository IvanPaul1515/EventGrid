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
