import { Platform } from "react-native";
import {
  BootstrapPayload,
  BudgetListResponse,
  Category,
  ExchangeRateSnapshot,
  Goal,
  NetWorthAccount,
  NetWorthAccountType,
  NetWorthOverview,
  ProfileSettings,
  ReportSummary,
  Transaction,
  TransactionListQuery,
  TransactionListResponse,
  User,
  UserProfile
} from "../types";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type UploadAvatarPayload = {
  uri: string;
  fileName: string;
  mimeType: string;
};

const rewriteLoopbackForAndroid = (rawUrl: string): string => {
  if (Platform.OS !== "android") {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = "10.0.2.2";
      return parsed.toString().replace(/\/$/, "");
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
};

const resolveApiBaseUrl = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) {
    return rewriteLoopbackForAndroid(fromEnv);
  }
  return rewriteLoopbackForAndroid("http://localhost:4000");
};

const API_BASE_URL = resolveApiBaseUrl();
const avatarRoutePrefix = "/api/v1/profile/avatar/";

const normalizeAvatarUrl = (avatarUrl: string | null): string | null => {
  if (!avatarUrl) {
    return null;
  }

  const normalized = avatarUrl.trim();
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.startsWith(avatarRoutePrefix)) {
    return `${API_BASE_URL}${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const markerIndex = parsed.pathname.indexOf(avatarRoutePrefix);
    if (markerIndex >= 0) {
      const routePath = parsed.pathname.slice(markerIndex);
      return `${API_BASE_URL}${routePath}`;
    }
    return normalized;
  } catch {
    return normalized;
  }
};

const normalizeUserProfile = (profile: UserProfile): UserProfile => ({
  ...profile,
  avatarUrl: normalizeAvatarUrl(profile.avatarUrl)
});

const toQueryString = (query: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, String(value));
  }

  const encoded = params.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
  };
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestInit);

  const json = (await response.json()) as T & ApiErrorPayload;

  if (!response.ok) {
    const message = json.error?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  return json;
};

export const apiClient = {
  baseUrl: API_BASE_URL,

  async getBootstrap(): Promise<BootstrapPayload> {
    return request<BootstrapPayload>("/api/v1/bootstrap");
  },

  async authWithGoogle(idToken: string, nonce?: string): Promise<{ token: string; user: User }> {
    return request<{ token: string; user: User }>("/api/v1/auth/oauth/google", {
      method: "POST",
      body: { idToken, ...(nonce ? { nonce } : {}) }
    });
  },

  async authWithApple(
    identityToken: string,
    rawNonce: string,
    user?: { firstName?: string; lastName?: string; email?: string },
    audience?: "app" | "service"
  ): Promise<{ token: string; user: User }> {
    return request<{ token: string; user: User }>("/api/v1/auth/oauth/apple", {
      method: "POST",
      body: { identityToken, rawNonce, ...(user ? { user } : {}), ...(audience ? { audience } : {}) }
    });
  },

  async requestOtp(email: string): Promise<{ message: string; debugOtpCode?: string }> {
    return request<{ message: string; debugOtpCode?: string }>("/api/v1/auth/request-otp", {
      method: "POST",
      body: { email }
    });
  },

  async verifyOtp(email: string, code: string): Promise<{ token: string; user: User }> {
    const result = await request<{ token: string; user: User }>("/api/v1/auth/verify-otp", {
      method: "POST",
      body: { email, code }
    });

    return result;
  },

  async me(token: string): Promise<User> {
    return request<User>("/api/v1/me", {
      token
    });
  },

  async getProfile(token: string): Promise<UserProfile> {
    const result = await request<{ item: UserProfile }>("/api/v1/profile", {
      token
    });
    return normalizeUserProfile(result.item);
  },

  async updateProfile(
    token: string,
    payload: Partial<{
      firstName: string;
      lastName: string;
      displayName: string;
      phoneNumber: string;
      dateOfBirth: string | null;
      city: string;
      country: string;
      timezone: string;
      locale: string;
      currency: string;
      occupation: string;
      bio: string;
      settings: Partial<ProfileSettings>;
    }>
  ): Promise<UserProfile> {
    const result = await request<{ item: UserProfile }>("/api/v1/profile", {
      method: "PATCH",
      token,
      body: payload
    });
    return normalizeUserProfile(result.item);
  },

  async uploadProfileAvatar(token: string, payload: UploadAvatarPayload): Promise<UserProfile> {
    const formData = new FormData();
    formData.append("file", {
      uri: payload.uri,
      name: payload.fileName,
      type: payload.mimeType
    } as unknown as Blob);

    const response = await fetch(`${API_BASE_URL}/api/v1/profile/avatar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const json = (await response.json()) as { item: UserProfile } & ApiErrorPayload;
    if (!response.ok) {
      const message = json.error?.message ?? `Request failed (${response.status})`;
      throw new Error(message);
    }

    return normalizeUserProfile(json.item);
  },

  async removeProfileAvatar(token: string): Promise<UserProfile> {
    const result = await request<{ item: UserProfile }>("/api/v1/profile/avatar", {
      method: "DELETE",
      token
    });
    return normalizeUserProfile(result.item);
  },

  async logout(token: string): Promise<void> {
    await request<{ success: boolean }>("/api/v1/auth/logout", {
      method: "POST",
      token
    });
  },

  async deleteAccount(token: string): Promise<void> {
    await request<{ success: boolean }>("/api/v1/account", {
      method: "DELETE",
      token
    });
  },

  async getCategories(token: string): Promise<Category[]> {
    const result = await request<{ items: Category[] }>("/api/v1/categories", {
      token
    });
    return result.items;
  },

  async createCategory(
    token: string,
    payload: { name: string; direction: "debit" | "credit" | "transfer" }
  ): Promise<Category> {
    const result = await request<{ item: Category }>("/api/v1/categories", {
      method: "POST",
      token,
      body: payload
    });
    return result.item;
  },

  async updateCategory(
    token: string,
    categoryId: string,
    payload: Partial<{ name: string; direction: "debit" | "credit" | "transfer" }>
  ): Promise<Category> {
    const result = await request<{ item: Category }>(`/api/v1/categories/${categoryId}`, {
      method: "PATCH",
      token,
      body: payload
    });
    return result.item;
  },

  async deleteCategory(token: string, categoryId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/v1/categories/${categoryId}`, {
      method: "DELETE",
      token
    });
  },

  async getTransactions(token: string, query: TransactionListQuery = {}): Promise<TransactionListResponse> {
    const queryString = toQueryString({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      direction: query.direction,
      categoryId: query.categoryId,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search
    });

    const result = await request<TransactionListResponse>(`/api/v1/transactions${queryString}`, {
      token
    });
    return result;
  },

  async createTransaction(
    token: string,
    payload: {
      direction: "debit" | "credit" | "transfer";
      amount: number;
      categoryId?: string | null;
      counterparty?: string;
      note?: string;
      currency?: string;
      occurredAt: string;
    }
  ): Promise<Transaction> {
    const result = await request<{ item: Transaction }>("/api/v1/transactions", {
      method: "POST",
      token,
      body: payload
    });
    return result.item;
  },

  async updateTransaction(
    token: string,
    transactionId: string,
    payload: {
      direction: "debit" | "credit" | "transfer";
      amount: number;
      categoryId?: string | null;
      counterparty?: string;
      note?: string;
      currency?: string;
      occurredAt: string;
    }
  ): Promise<Transaction> {
    const result = await request<{ item: Transaction }>(`/api/v1/transactions/${transactionId}`, {
      method: "PATCH",
      token,
      body: payload
    });
    return result.item;
  },

  async deleteTransaction(token: string, transactionId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/v1/transactions/${transactionId}`, {
      method: "DELETE",
      token
    });
  },

  async logSmsIntent(token: string, enabled: boolean): Promise<void> {
    await request<{ acknowledged: boolean }>("/api/v1/consents/sms-import-intent", {
      method: "POST",
      token,
      body: { enabled }
    });
  },

  async getBudgets(token: string, month?: string): Promise<BudgetListResponse> {
    const query = month ? `?month=${encodeURIComponent(month)}` : "";
    return request<BudgetListResponse>(`/api/v1/budgets${query}`, {
      token
    });
  },

  async createBudget(token: string, payload: { categoryId: string; month: string; amount: number; currency: string }): Promise<{
    id: string;
    categoryId: string;
    month: string;
    amount: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const result = await request<{
      item: {
        id: string;
        categoryId: string;
        month: string;
        amount: number;
        currency: string;
        createdAt: string;
        updatedAt: string;
      };
    }>("/api/v1/budgets", {
      method: "POST",
      token,
      body: payload
    });
    return result.item;
  },

  async updateBudget(
    token: string,
    budgetId: string,
    payload: Partial<{ categoryId: string; month: string; amount: number; currency: string }>
  ): Promise<{
    id: string;
    categoryId: string;
    month: string;
    amount: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const result = await request<{
      item: {
        id: string;
        categoryId: string;
        month: string;
        amount: number;
        currency: string;
        createdAt: string;
        updatedAt: string;
      };
    }>(`/api/v1/budgets/${budgetId}`, {
      method: "PATCH",
      token,
      body: payload
    });
    return result.item;
  },

  async deleteBudget(token: string, budgetId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/v1/budgets/${budgetId}`, {
      method: "DELETE",
      token
    });
  },

  async getGoals(token: string): Promise<Goal[]> {
    const result = await request<{ items: Goal[] }>("/api/v1/goals", {
      token
    });
    return result.items;
  },

  async createGoal(
    token: string,
    payload: { name: string; targetAmount: number; currentAmount: number; currency: string; targetDate?: string }
  ): Promise<Goal> {
    const result = await request<{ item: Goal }>("/api/v1/goals", {
      method: "POST",
      token,
      body: payload
    });
    return result.item;
  },

  async updateGoal(
    token: string,
    goalId: string,
    payload: Partial<{ name: string; targetAmount: number; currentAmount: number; currency: string; targetDate: string | null }>
  ): Promise<Goal> {
    const result = await request<{ item: Goal }>(`/api/v1/goals/${goalId}`, {
      method: "PATCH",
      token,
      body: payload
    });
    return result.item;
  },

  async deleteGoal(token: string, goalId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/v1/goals/${goalId}`, {
      method: "DELETE",
      token
    });
  },

  async getNetWorth(token: string, currency?: string): Promise<NetWorthOverview> {
    const query = currency ? `?currency=${encodeURIComponent(currency)}` : "";
    return request<NetWorthOverview>(`/api/v1/net-worth${query}`, {
      token
    });
  },

  async createNetWorthAccount(
    token: string,
    payload: { name: string; accountType: NetWorthAccountType; subtype: string; balance: number; currency: string; notes?: string | null }
  ): Promise<NetWorthAccount> {
    const result = await request<{ item: NetWorthAccount }>("/api/v1/net-worth/accounts", {
      method: "POST",
      token,
      body: payload
    });
    return result.item;
  },

  async updateNetWorthAccount(
    token: string,
    accountId: string,
    payload: Partial<{ name: string; accountType: NetWorthAccountType; subtype: string; balance: number; currency: string; notes: string | null }>
  ): Promise<NetWorthAccount> {
    const result = await request<{ item: NetWorthAccount }>(`/api/v1/net-worth/accounts/${accountId}`, {
      method: "PATCH",
      token,
      body: payload
    });
    return result.item;
  },

  async deleteNetWorthAccount(token: string, accountId: string): Promise<void> {
    await request<{ success: boolean }>(`/api/v1/net-worth/accounts/${accountId}`, {
      method: "DELETE",
      token
    });
  },

  async getReportSummary(token: string, month?: string, currency?: string): Promise<ReportSummary> {
    const query = toQueryString({
      month,
      currency: currency?.trim().toUpperCase()
    });
    return request<ReportSummary>(`/api/v1/reports/summary${query}`, {
      token
    });
  },

  async getExchangeRates(token: string, baseCurrency: string): Promise<ExchangeRateSnapshot> {
    const query = `?base=${encodeURIComponent(baseCurrency.trim().toUpperCase())}`;
    return request<ExchangeRateSnapshot>(`/api/v1/fx/latest${query}`, {
      token
    });
  }
};
