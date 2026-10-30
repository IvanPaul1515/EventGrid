export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'COURTESY';

export interface User {
  operationalPermissions?:string|null;
  scannerOnly?: boolean;
  assignedEventId?: string | null;
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
  notificationStockThreshold?:number|null;
  timeZone?:string;allowOnsitePayments?:boolean;requirePaymentForEntry?:boolean;
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
  includesTshirt?: boolean;
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
  defaultTicketTypeId?: string | null;
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
  channel?: string;
  externalMethod?: string;
  externalReference?: string;
  recordedByUser?: { id: string; fullName: string; email: string };
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
  participantCategory?: string | null;
  tshirtDeliveryStatus?:string;
  tshirtNonDeliveryReason?:string;
  tshirtNonDeliveryNotes?:string;
  tshirtDecisionAt?:string;
  externalPaymentStatus?: string | null;
  externalReference?: string | null;
  externalPlatform?: string | null;
  buyerName?: string | null;
  originLabel?: string | null;
  createdByUserId?: string | null;
  commercialUserId?: string | null;
  createdByUser?: {id:string;fullName:string} | null;
  commercialUser?: {id:string;fullName:string} | null;
  id: string;
  eventId: string;
  participantId: string;
  registrationNumber: string;
  qrCode?: string;
  qrGeneratedAt?: string;
  qrRevokedAt?: string;
  source: 'EXCEL_IMPORT' | 'MANUAL' | 'ONSITE_SALE' | 'HISTORICAL_ONSITE';
  historicalDates?: string | null;
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
  tshirtDelivered?: boolean;
  tshirtDeliveredAt?: string;
  tshirtDeliveredByUserId?: string;
  tshirtDeliveredByUser?: {
    id: string;
    fullName: string;
    email: string;
  };
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
  result?: 'SUCCESS' | 'REJECTED' | 'FAILED' | string;
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
  eventId?: string | null;
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
  speaker?: {fullName:string;talks:{id:string;title:string;day:string;startTime:string;endTime:string;room?:string|null}[]} | null;
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
  status: 'VALID' | 'ALREADY_CHECKED_IN' | 'CANCELLED' | 'EDITION_MISMATCH' | 'REVOKED' | 'INVALID_CODE' | 'PAIRING_CODE' | 'NETWORK' | 'SCANNER_UNLINKED' | 'SESSION_EXPIRED' | 'ACCESS_DENIED' | 'SERVER_ERROR' | 'REQUEST_ERROR';
  message: string;
  canCheckIn: boolean;
  registration?: Registration;
}

export interface EmailConfig {
  isConfigured?: boolean;
  realEmailBlocked?: boolean;
  realEmailAllowed?: boolean;
  connectionVerified?: boolean;
  passwordInherited?: boolean;
  id?: string;
  eventId?: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  hasPassword?: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  isEnabled: boolean;
  isGlobal?: boolean;
  hasConfig?: boolean;
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

export interface UnifiedEmailRecord {
  id: string;
  source: 'SINGLE' | 'BATCH';
  communicationType: string;
  templateCode: string;
  subject: string;
  date: string | null;
  recipientEmail: string;
  recipientName: string;
  authorizedByUser?: { id: string; fullName: string; email: string } | null;
  deliveryType: 'Individual' | 'Campaña masiva';
  batchId?: string | null;
  batchJobName?: string | null;
  status: string;
  statusLabel: string;
  attempts: number;
  errorMessage?: string | null;
}

export type EmailLogStatus = 'PENDING' | 'PROCESSING' | 'ACCEPTED_BY_SMTP' | 'SENT' | 'DELIVERED' | 'FAILED' | 'REJECTED' | 'SIMULATED' | 'CANCELLED' | 'UNKNOWN_DELIVERY_STATUS';

export interface EmailLog {
  id: string;
  eventId: string;
  registrationId?: string;
  recipientEmail: string;
  recipientName: string;
  templateCode: string;
  subject: string;
  status: EmailLogStatus;
  batchId?: string | null;
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
  reconciliation?: { confirmedPayments: number; externalPayments: number; onsitePayments: number; legacyUnattributed: number; refunded: number; netAccredited: number; netDefinition: string };
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


export type SponsorType = 'SPONSOR' | 'COLLABORATOR';
export type ContributionType = 'MONETARY' | 'IN_KIND' | 'MIXED';
export type SponsorStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type SponsorPaymentMethod = 'TRANSFER' | 'CHECK' | 'CASH' | 'CREDIT_CARD' | 'OTHER';
export type SponsorPaymentStatus = 'ACTIVE' | 'ANNULLED';

export interface SponsorPayment {
  historicalDate?:string|null;
  id: string;
  sponsorId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: SponsorPaymentMethod;
  reference?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
  status: SponsorPaymentStatus;
  annulledAt?: string | null;
  annulledReason?: string | null;
  registeredByUserId: string;
  annulledByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Sponsor {
  legalName?:string|null;
  rnc?:string|null;
  id: string;
  eventId: string;
  name: string;
  type: SponsorType;
  category?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  logoUrl?: string | null;
  notes?: string | null;
  contributionType: ContributionType;
  inKindDescription?: string | null;
  committedAmount: number;
  receivedAmount: number;
  pendingBalance: number;
  commitmentDate: string;
  status: SponsorStatus;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  payments?: SponsorPayment[];
  _count?: {
    payments: number;
  };
  event?: {
    id: string;
    name: string;
    year: number;
  };
}

export interface SponsorSummary {
  byCategory?: { category: string; count: number; committed: number; received: number; pending: number }[];
  totalSponsors: number;
  totalCollaborators: number;
  totalCount: number;
  totalCommitted: number;
  totalReceived: number;
  totalPending: number;
  inKindCount: number;
  paidCount: number;
  partiallyPaidCount: number;
  pendingCount: number;
  cancelledCount: number;
}

export interface SponsorFilterQuery {
  category?: string;
  search?: string;
  type?: 'ALL' | SponsorType;
  status?: 'ALL' | SponsorStatus;
  contributionType?: 'ALL' | ContributionType;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}
