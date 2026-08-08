export type TransactionDirection = "debit" | "credit" | "transfer";

export type User = {
  id: string;
  email: string;
};

export type ProfileSettings = {
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  weeklySummaryEnabled: boolean;
  biometricsEnabled: boolean;
  marketingOptIn: boolean;
};

export type UserProfile = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
  locale: string;
  currency: string;
  occupation: string | null;
  bio: string | null;
  settings: ProfileSettings;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Category = {
  id: string;
  name: string;
  direction: TransactionDirection;
  isDefault: boolean;
};

export type Transaction = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  counterparty: string | null;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TransactionListQuery = {
  page?: number;
  pageSize?: number;
  direction?: TransactionDirection;
  categoryId?: string;
  from?: string;
  to?: string;
  sortBy?: "occurredAt" | "amount";
  sortOrder?: "asc" | "desc";
  search?: string;
};

export type TransactionListResponse = {
  items: Transaction[];
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
    nextPage: number | null;
  };
};

export type BootstrapPayload = {
  appName: string;
  currency: string;
  locale?: string;
  timezone?: string;
  featureFlags: {
    smsImportEnabledByDefault: boolean;
    aiInsightsEnabled: boolean;
  };
  legal: {
    smsDisclosureVersion: string;
  };
};

export type ExchangeRateSnapshot = {
  provider: string;
  asOf: string;
  baseCurrency: string;
  rates: Record<string, number>;
};

export type Budget = {
  id: string;
  categoryId: string;
  categoryName: string;
  month: string;
  amount: number;
  spentAmount: number;
  remainingAmount: number;
  utilizationPercent: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetListResponse = {
  month: string;
  items: Budget[];
  totals: {
    budgeted: number;
    spent: number;
    remaining: number;
  };
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercent: number;
  currency: string;
  targetDate: string | null;
  closedAt: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NetWorthAccountType = "asset" | "liability";

export type NetWorthAccount = {
  id: string;
  name: string;
  accountType: NetWorthAccountType;
  subtype: string;
  balance: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NetWorthSummary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  currency: string;
  asOf: string;
};

export type NetWorthOverview = {
  accounts: NetWorthAccount[];
  summary: NetWorthSummary;
};

export type ReportSummary = {
  month: string;
  period: {
    start: string;
    endExclusive: string;
  };
  totals: {
    income: number;
    expense: number;
    transfer: number;
    net: number;
    transactionCount: number;
    currency: string;
  };
  topCategories: Array<{
    categoryId: string | null;
    categoryName: string;
    amount: number;
    transactionCount: number;
    currency: string;
  }>;
  dailySeries: Array<{
    date: string;
    income: number;
    expense: number;
    net: number;
    currency: string;
  }>;
};
