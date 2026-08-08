import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, BackHandler, Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { apiClient } from "./src/api/client";
import { clearSessionToken, readSessionToken, saveSessionToken } from "./src/auth/sessionStore";
import { configureGoogleSignIn, signInWithApple, signInWithGoogle } from "./src/auth/oauthProviders";
import { BottomTabBar, publishToast, ToastViewport } from "./src/components/ui";
import { deriveAuthStage, getCurrentMonthToken, resolveSmsIntentOutcome } from "./src/flow/mobileFlow";
import { AppTabRoute, defaultTabRoute, emptyModalRoute, ModalRoute } from "./src/navigation/routes";
import { syncSentryUser } from "./src/monitoring/sentry";
import { BudgetFormScreen } from "./src/screens/BudgetFormScreen";
import { BudgetsScreen } from "./src/screens/BudgetsScreen";
import { CategoryFormScreen } from "./src/screens/CategoryFormScreen";
import { CategoryManagerScreen } from "./src/screens/CategoryManagerScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { GoalFormScreen } from "./src/screens/GoalFormScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { NetWorthFormScreen } from "./src/screens/NetWorthFormScreen";
import { NetWorthScreen } from "./src/screens/NetWorthScreen";
import { OtpVerifyScreen } from "./src/screens/OtpVerifyScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { TransactionFormScreen } from "./src/screens/TransactionFormScreen";
import { TransactionsScreen } from "./src/screens/TransactionsScreen";
import { createStyles, theme } from "./src/theme";
import {
  BootstrapPayload,
  Budget,
  Category,
  ExchangeRateSnapshot,
  Goal,
  NetWorthAccount,
  NetWorthOverview,
  ReportSummary,
  Transaction,
  TransactionListQuery,
  User,
  UserProfile
} from "./src/types";
import { calculateBudgetTotals } from "./src/utils/budgetTotals";
import { convertDisplayAmount } from "./src/utils/exchange";
import { shiftMonthToken } from "./src/utils/month";
import { resolveRegionalPreferences } from "./src/utils/regional";

const emptyBudgetTotals = {
  budgeted: 0,
  spent: 0,
  remaining: 0
};

type TransactionFilters = {
  direction: "all" | "debit" | "credit" | "transfer";
  categoryId: "all" | string;
  from: string;
  to: string;
  sortBy: "occurredAt" | "amount";
  sortOrder: "asc" | "desc";
  pageSize: number;
  search: string;
};

const defaultTransactionFilters: TransactionFilters = {
  direction: "all",
  categoryId: "all",
  from: "",
  to: "",
  sortBy: "occurredAt",
  sortOrder: "desc",
  pageSize: 20,
  search: ""
};

const emptyTransactionPagination = {
  page: 1,
  pageSize: defaultTransactionFilters.pageSize,
  hasMore: false,
  nextPage: null as number | null
};

const BACKGROUND_SYNC_INTERVAL_MS = 15_000;
const MUTATION_RECONCILE_DELAY_MS = 700;
const TRANSACTION_FILTER_SYNC_DEBOUNCE_MS = 300;

const dateTokenPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const parseDateToken = (value: string): Date | null => {
  if (!dateTokenPattern.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }

  return parsed;
};

const buildTransactionQuery = (filters: TransactionFilters, page: number): TransactionListQuery => {
  const fromDate = parseDateToken(filters.from);
  const toDate = parseDateToken(filters.to);

  if (toDate) {
    toDate.setUTCHours(23, 59, 59, 999);
  }

  return {
    page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    ...(filters.direction !== "all" ? { direction: filters.direction } : {}),
    ...(filters.categoryId !== "all" ? { categoryId: filters.categoryId } : {}),
    ...(fromDate ? { from: fromDate.toISOString() } : {}),
    ...(toDate ? { to: toDate.toISOString() } : {}),
    ...(filters.search.trim().length > 0 ? { search: filters.search.trim() } : {})
  };
};

const buildTransactionFilterSignature = (filters: TransactionFilters): string =>
  JSON.stringify({
    direction: filters.direction,
    categoryId: filters.categoryId,
    from: filters.from.trim(),
    to: filters.to.trim(),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    pageSize: filters.pageSize,
    search: filters.search.trim()
  });

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
};

const showActionError = (title: string, error: unknown, fallback: string): void => {
  publishToast({
    tone: "error",
    title,
    message: resolveErrorMessage(error, fallback)
  });
};

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [pendingEmail, setPendingEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionFilters, setTransactionFilters] = useState<TransactionFilters>(defaultTransactionFilters);
  const [transactionPagination, setTransactionPagination] = useState(emptyTransactionPagination);
  const [transactionLoadingMore, setTransactionLoadingMore] = useState(false);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetTotals, setBudgetTotals] = useState(emptyBudgetTotals);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthOverview | null>(null);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateSnapshot | null>(null);
  const [reportMonth, setReportMonth] = useState(getCurrentMonthToken());
  const [budgetMonth, setBudgetMonth] = useState(getCurrentMonthToken());
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<AppTabRoute>(defaultTabRoute);
  const [modalRoute, setModalRoute] = useState<ModalRoute>(emptyModalRoute);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editingNetWorthAccount, setEditingNetWorthAccount] = useState<NetWorthAccount | null>(null);
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transactionFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transactionFiltersRef = useRef<TransactionFilters>(defaultTransactionFilters);
  const activeTransactionFilterSignatureRef = useRef<string>(buildTransactionFilterSignature(defaultTransactionFilters));
  const latestTransactionReplaceRequestRef = useRef(0);

  const isAuthenticated = Boolean(token && user);
  const authStage = deriveAuthStage(pendingEmail, isAuthenticated);
  const regionalPreferences = useMemo(() => resolveRegionalPreferences(profile, bootstrap), [bootstrap, profile]);
  const displayBudgetTotals = useMemo(() => {
    if (!exchangeRates) {
      return budgetTotals;
    }

    return budgets.reduce(
      (totals, budget) => {
        const displayAmount = convertDisplayAmount(budget.amount, budget.currency, exchangeRates);
        const displaySpent = convertDisplayAmount(budget.spentAmount, budget.currency, exchangeRates);
        const displayRemaining = convertDisplayAmount(budget.remainingAmount, budget.currency, exchangeRates);

        totals.budgeted += displayAmount ?? budget.amount;
        totals.spent += displaySpent ?? budget.spentAmount;
        totals.remaining += displayRemaining ?? budget.remainingAmount;
        return totals;
      },
      { budgeted: 0, spent: 0, remaining: 0 }
    );
  }, [budgetTotals, budgets, exchangeRates]);

  useEffect(() => {
    const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (googleClientId && process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ENABLED === "true") {
      configureGoogleSignIn(googleClientId);
    }
  }, []);

  useEffect(() => {
    syncSentryUser(user, profile);
  }, [profile, user]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isBooting) {
        return true;
      }

      if (!isAuthenticated) {
        if (pendingEmail.trim().length > 0) {
          setPendingEmail("");
          return true;
        }
        return false;
      }

      if (modalRoute.kind === "categoryForm") {
        setEditingCategory(null);
        setModalRoute({ kind: "categoryManager" });
        return true;
      }

      if (modalRoute.kind === "transactionForm") {
        setEditingTransaction(null);
        setModalRoute(emptyModalRoute);
        return true;
      }

      if (modalRoute.kind === "budgetForm") {
        setEditingBudget(null);
        setModalRoute(emptyModalRoute);
        return true;
      }

      if (modalRoute.kind === "goalForm") {
        setEditingGoal(null);
        setModalRoute(emptyModalRoute);
        return true;
      }

      if (modalRoute.kind === "netWorthForm") {
        setEditingNetWorthAccount(null);
        setModalRoute({ kind: "netWorth" });
        return true;
      }

      if (modalRoute.kind === "netWorth") {
        setModalRoute(emptyModalRoute);
        return true;
      }

      if (modalRoute.kind === "profile") {
        setModalRoute(emptyModalRoute);
        return true;
      }

      if (modalRoute.kind === "categoryManager") {
        setModalRoute(emptyModalRoute);
        return true;
      }

      if (activeTab !== defaultTabRoute) {
        setActiveTab(defaultTabRoute);
        return true;
      }

      return false;
    });

    return () => {
      subscription.remove();
    };
  }, [activeTab, isAuthenticated, isBooting, modalRoute.kind, pendingEmail]);

  const fetchTransactions = async (
    sessionToken: string,
    filters: TransactionFilters,
    page: number,
    append: boolean
  ): Promise<void> => {
    const requestedFilterSignature = buildTransactionFilterSignature(filters);
    const replaceRequestId = append ? latestTransactionReplaceRequestRef.current : latestTransactionReplaceRequestRef.current + 1;

    if (!append) {
      latestTransactionReplaceRequestRef.current = replaceRequestId;
      activeTransactionFilterSignatureRef.current = requestedFilterSignature;
    }

    const replaceGenerationAtStart = latestTransactionReplaceRequestRef.current;
    const response = await apiClient.getTransactions(sessionToken, buildTransactionQuery(filters, page));

    if (append) {
      const hasNewerReplace = replaceGenerationAtStart !== latestTransactionReplaceRequestRef.current;
      const filtersChanged = requestedFilterSignature !== activeTransactionFilterSignatureRef.current;
      if (hasNewerReplace || filtersChanged) {
        return;
      }
    } else if (replaceRequestId !== latestTransactionReplaceRequestRef.current) {
      return;
    }

    setTransactions((previous) => (append ? [...previous, ...response.items] : response.items));
    setTransactionPagination(response.pagination);
  };

  useEffect(() => {
    transactionFiltersRef.current = transactionFilters;
    activeTransactionFilterSignatureRef.current = buildTransactionFilterSignature(transactionFilters);
  }, [transactionFilters]);

  const resolveCategoryName = useCallback(
    (categoryId: string | null, fallbackName?: string | null): string | null => {
      if (fallbackName && fallbackName.trim().length > 0) {
        return fallbackName;
      }
      if (!categoryId) {
        return null;
      }
      return categories.find((category) => category.id === categoryId)?.name ?? null;
    },
    [categories]
  );

  const syncLatestData = useCallback(
    async (sessionToken: string, options?: { showRefreshing?: boolean }) => {
      if (syncInFlightRef.current) {
        syncQueuedRef.current = true;
        return;
      }

      syncInFlightRef.current = true;
      const showRefreshing = options?.showRefreshing ?? false;

      if (showRefreshing) {
        setRefreshing(true);
      }

      try {
        const profileData = await apiClient.getProfile(sessionToken);
        const displayCurrency = resolveRegionalPreferences(profileData, bootstrap).currency;
        const [categoryItems, transactionData, budgetData, goalItems, netWorthData, reportData, rateSnapshot] = await Promise.all([
          apiClient.getCategories(sessionToken),
          apiClient.getTransactions(sessionToken, buildTransactionQuery(transactionFilters, 1)),
          apiClient.getBudgets(sessionToken, budgetMonth),
          apiClient.getGoals(sessionToken),
          apiClient.getNetWorth(sessionToken, displayCurrency),
          apiClient.getReportSummary(sessionToken, reportMonth, displayCurrency),
          apiClient.getExchangeRates(sessionToken, displayCurrency)
        ]);

        setCategories(categoryItems);
        const requestedFilterSignature = buildTransactionFilterSignature(transactionFilters);
        const latestFilterSignature = buildTransactionFilterSignature(transactionFiltersRef.current);
        if (requestedFilterSignature === latestFilterSignature) {
          setTransactions(transactionData.items);
          setTransactionPagination(transactionData.pagination);
        }
        setBudgets(budgetData.items);
        setBudgetTotals(budgetData.totals);
        setGoals(goalItems);
        setNetWorth(netWorthData);
        setReportSummary(reportData);
        setProfile(profileData);
        setExchangeRates(rateSnapshot);
      } finally {
        if (showRefreshing) {
          setRefreshing(false);
        }
        syncInFlightRef.current = false;
        if (syncQueuedRef.current) {
          syncQueuedRef.current = false;
          void syncLatestData(sessionToken);
        }
      }
    },
    [bootstrap, budgetMonth, reportMonth, transactionFilters]
  );

  const enqueueReconcileSync = useCallback(
    (sessionToken: string, delayMs = MUTATION_RECONCILE_DELAY_MS) => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null;
        void syncLatestData(sessionToken);
      }, delayMs);
    },
    [syncLatestData]
  );

  const loadAuthenticatedData = async (sessionToken: string) => {
    const initialFilters = defaultTransactionFilters;

    const [bootstrapPayload, currentUser, profileData, categoryItems, transactionData, goalItems] = await Promise.all([
      apiClient.getBootstrap(),
      apiClient.me(sessionToken),
      apiClient.getProfile(sessionToken),
      apiClient.getCategories(sessionToken),
      apiClient.getTransactions(sessionToken, buildTransactionQuery(initialFilters, 1)),
      apiClient.getGoals(sessionToken)
    ]);
    const monthToken = getCurrentMonthToken(profileData.timezone);
    const displayCurrency = resolveRegionalPreferences(profileData, bootstrapPayload).currency;
    const [budgetData, netWorthData, reportData, rateSnapshot] = await Promise.all([
      apiClient.getBudgets(sessionToken, monthToken),
      apiClient.getNetWorth(sessionToken, displayCurrency),
      apiClient.getReportSummary(sessionToken, monthToken, displayCurrency),
      apiClient.getExchangeRates(sessionToken, displayCurrency)
    ]);

    setBootstrap(bootstrapPayload);
    setUser(currentUser);
    setProfile(profileData);
    setCategories(categoryItems);
    setTransactionFilters(initialFilters);
    setTransactions(transactionData.items);
    setTransactionPagination(transactionData.pagination);
    setBudgets(budgetData.items);
    setBudgetTotals(budgetData.totals);
    setBudgetMonth(budgetData.month);
    setGoals(goalItems);
    setNetWorth(netWorthData);
    setReportSummary(reportData);
    setExchangeRates(rateSnapshot);
    setReportMonth(reportData.month);
  };

  useEffect(() => {
    const bootstrapApp = async () => {
      try {
        const storedToken = await readSessionToken();
        if (!storedToken) {
          setBootstrap(await apiClient.getBootstrap());
          return;
        }

        setToken(storedToken);
        await loadAuthenticatedData(storedToken);
      } catch {
        await clearSessionToken();
        setToken(null);
        setUser(null);
      } finally {
        setIsBooting(false);
      }
    };

    void bootstrapApp();
  }, []);

  useEffect(
    () => () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      if (transactionFilterTimerRef.current) {
        clearTimeout(transactionFilterTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!token || !isAuthenticated) {
      return undefined;
    }

    if (activeTab !== "transactions" || modalRoute.kind !== "none") {
      return undefined;
    }

    if (transactionFilterTimerRef.current) {
      clearTimeout(transactionFilterTimerRef.current);
    }

    const snapshot = transactionFilters;
    transactionFilterTimerRef.current = setTimeout(() => {
      transactionFilterTimerRef.current = null;
      void fetchTransactions(token, snapshot, 1, false).catch(() => {
        // Silent background debounce failure; user can retry via Apply.
      });
    }, TRANSACTION_FILTER_SYNC_DEBOUNCE_MS);

    return () => {
      if (transactionFilterTimerRef.current) {
        clearTimeout(transactionFilterTimerRef.current);
      }
    };
  }, [activeTab, isAuthenticated, modalRoute.kind, token, transactionFilters]);

  const refreshAll = async () => {
    if (!token) return;
    try {
      await syncLatestData(token, { showRefreshing: true });
    } catch (error) {
      showActionError("Sync failed", error, "Unable to refresh data. Please try again.");
    }
  };

  useEffect(() => {
    if (!token || !isAuthenticated) {
      return undefined;
    }

    const runBackgroundSync = () => {
      void syncLatestData(token).catch(() => {
        // Background sync failures should not crash UI flow.
      });
    };

    const intervalId = setInterval(runBackgroundSync, BACKGROUND_SYNC_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        runBackgroundSync();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [isAuthenticated, syncLatestData, token]);

  const handleRequestOtp = async (email: string) => {
    const response = await apiClient.requestOtp(email);
    setPendingEmail(email.trim().toLowerCase());
    if (response.debugOtpCode) {
      publishToast({
        tone: "info",
        title: "Development OTP",
        message: `Use this OTP: ${response.debugOtpCode}`,
        durationMs: 4500
      });
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (!pendingEmail) return;

    const result = await apiClient.verifyOtp(pendingEmail, code);
    await saveSessionToken(result.token);
    setToken(result.token);
    await loadAuthenticatedData(result.token);
    setPendingEmail("");
  };

  const handleGoogleSignIn = async () => {
    const googleResult = await signInWithGoogle();
    const result = await apiClient.authWithGoogle(googleResult.idToken, googleResult.nonce);
    await saveSessionToken(result.token);
    setToken(result.token);
    await loadAuthenticatedData(result.token);
  };

  const handleAppleSignIn = async () => {
    const appleResult = await signInWithApple(apiClient.baseUrl);
    const result = await apiClient.authWithApple(
      appleResult.identityToken,
      appleResult.rawNonce,
      appleResult.user,
      appleResult.audience
    );
    await saveSessionToken(result.token);
    setToken(result.token);
    await loadAuthenticatedData(result.token);
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    if (!token) return;

    Alert.alert("Delete transaction", "Do you want to delete this transaction?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteTransaction(token, transaction.id);
              setTransactions((previous) => previous.filter((item) => item.id !== transaction.id));
              enqueueReconcileSync(token);
              publishToast({
                tone: "success",
                title: "Transactions",
                message: "Transaction deleted."
              });
            } catch (error) {
              publishToast({
                tone: "error",
                title: "Unable to delete transaction",
                message: resolveErrorMessage(error, "Please try again.")
              });
            }
          })();
        }
      }
    ]);
  };

  const handleApplyTransactionFilters = async () => {
    if (!token) return;
    if (transactionFilterTimerRef.current) {
      clearTimeout(transactionFilterTimerRef.current);
      transactionFilterTimerRef.current = null;
    }
    try {
      await fetchTransactions(token, transactionFilters, 1, false);
    } catch (error) {
      showActionError("Unable to apply filters", error, "Please check the filter values and retry.");
    }
  };

  const handleResetTransactionFilters = async () => {
    if (!token) return;
    if (transactionFilterTimerRef.current) {
      clearTimeout(transactionFilterTimerRef.current);
      transactionFilterTimerRef.current = null;
    }
    try {
      setTransactionFilters(defaultTransactionFilters);
      await fetchTransactions(token, defaultTransactionFilters, 1, false);
    } catch (error) {
      showActionError("Unable to reset filters", error, "Please try again.");
    }
  };

  const handleLoadMoreTransactions = async () => {
    if (!token || !transactionPagination.hasMore || !transactionPagination.nextPage) {
      return;
    }

    setTransactionLoadingMore(true);
    try {
      await fetchTransactions(token, transactionFilters, transactionPagination.nextPage, true);
    } catch (error) {
      showActionError("Unable to load more", error, "Please try again.");
    } finally {
      setTransactionLoadingMore(false);
    }
  };

  const handleSaveTransaction = async (payload: {
    categoryId: string | null;
    direction: "debit" | "credit" | "transfer";
    amount: number;
    currency: string;
    counterparty: string;
    note: string;
    occurredAt: string;
  }) => {
    if (!token) return;

    const isFiltering =
      transactionFilters.direction !== "all" ||
      transactionFilters.categoryId !== "all" ||
      transactionFilters.from.trim().length > 0 ||
      transactionFilters.to.trim().length > 0 ||
      transactionFilters.sortBy !== defaultTransactionFilters.sortBy ||
      transactionFilters.sortOrder !== defaultTransactionFilters.sortOrder ||
      transactionFilters.search.trim().length > 0;

    let saved: Transaction;
    if (modalRoute.kind === "transactionForm" && modalRoute.mode === "edit" && editingTransaction) {
      saved = await apiClient.updateTransaction(token, editingTransaction.id, payload);
      const resolved = {
        ...saved,
        categoryName: resolveCategoryName(saved.categoryId, saved.categoryName)
      };
      setTransactions((previous) => previous.map((item) => (item.id === resolved.id ? resolved : item)));
    } else {
      saved = await apiClient.createTransaction(token, payload);
      const resolved = {
        ...saved,
        categoryName: resolveCategoryName(saved.categoryId, saved.categoryName)
      };
      if (!isFiltering) {
        setTransactions((previous) => [resolved, ...previous.filter((item) => item.id !== resolved.id)]);
      }
    }

    setEditingTransaction(null);
    setModalRoute(emptyModalRoute);
    setActiveTab("transactions");
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Transactions",
      message: modalRoute.kind === "transactionForm" && modalRoute.mode === "edit" ? "Transaction updated." : "Transaction created."
    });
  };

  const handleSaveCategory = async (payload: { name: string; direction: "debit" | "credit" | "transfer" }) => {
    if (!token) return;

    let savedCategory: Category;
    if (modalRoute.kind === "categoryForm" && modalRoute.mode === "edit" && editingCategory) {
      savedCategory = await apiClient.updateCategory(token, editingCategory.id, payload);
      setTransactions((previous) =>
        previous.map((item) =>
          item.categoryId === savedCategory.id
            ? {
                ...item,
                categoryName: savedCategory.name
              }
            : item
        )
      );
      setBudgets((previous) =>
        previous.map((item) =>
          item.categoryId === savedCategory.id
            ? {
                ...item,
                categoryName: savedCategory.name
              }
            : item
        )
      );
    } else {
      savedCategory = await apiClient.createCategory(token, payload);
    }

    setCategories((previous) =>
      [...previous.filter((item) => item.id !== savedCategory.id), savedCategory].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      )
    );
    setEditingCategory(null);
    setModalRoute({ kind: "categoryManager" });
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Categories",
      message: modalRoute.kind === "categoryForm" && modalRoute.mode === "edit" ? "Category updated." : "Category created."
    });
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!token) return;

    Alert.alert("Delete category", `Delete "${category.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteCategory(token, category.id);
              setCategories((previous) => previous.filter((item) => item.id !== category.id));
              setTransactions((previous) =>
                previous.map((item) =>
                  item.categoryId === category.id
                    ? {
                        ...item,
                        categoryId: null,
                        categoryName: null
                      }
                    : item
                )
              );
              enqueueReconcileSync(token);
              publishToast({
                tone: "success",
                title: "Categories",
                message: "Category deleted."
              });
            } catch (error) {
              publishToast({
                tone: "error",
                title: "Unable to delete category",
                message: resolveErrorMessage(error, "Please try again.")
              });
            }
          })();
        }
      }
    ]);
  };

  const handleApplyBudgetMonth = async () => {
    if (!token) return;

    try {
      const budgetData = await apiClient.getBudgets(token, budgetMonth);
      setBudgets(budgetData.items);
      setBudgetTotals(budgetData.totals);
      setBudgetMonth(budgetData.month);
    } catch (error) {
      showActionError("Unable to apply month", error, "Month must be in YYYY-MM format.");
    }
  };

  const handleShiftBudgetMonth = async (delta: number) => {
    if (!token) return;

    const nextMonth = shiftMonthToken(budgetMonth, delta);
    try {
      const budgetData = await apiClient.getBudgets(token, nextMonth);
      setBudgets(budgetData.items);
      setBudgetTotals(budgetData.totals);
      setBudgetMonth(budgetData.month);
    } catch (error) {
      showActionError("Unable to change month", error, "Please try again.");
    }
  };

  const handleApplyReportMonth = async () => {
    if (!token) return;

    try {
      const summary = await apiClient.getReportSummary(token, reportMonth, regionalPreferences.currency);
      setReportSummary(summary);
      setReportMonth(summary.month);
    } catch (error) {
      showActionError("Unable to apply month", error, "Month must be in YYYY-MM format.");
    }
  };

  const handleSaveBudget = async (payload: { categoryId: string; month: string; amount: number; currency: string }) => {
    if (!token) return;

    const toOptimisticBudget = (item: {
      id: string;
      categoryId: string;
      month: string;
      amount: number;
      currency: string;
      createdAt: string;
      updatedAt: string;
    }): Budget => {
      const matchedCategory = categories.find((category) => category.id === item.categoryId);
      const fallbackSpent = editingBudget?.id === item.id ? editingBudget.spentAmount : 0;
      const spentAmount = Number(fallbackSpent.toFixed(2));
      const remainingAmount = Number((item.amount - spentAmount).toFixed(2));
      const utilizationPercent = item.amount > 0 ? Number(((spentAmount / item.amount) * 100).toFixed(2)) : 0;

      return {
        id: item.id,
        categoryId: item.categoryId,
        categoryName: matchedCategory?.name ?? "Category",
        month: item.month,
        amount: item.amount,
        spentAmount,
        remainingAmount,
        utilizationPercent,
        currency: item.currency,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    };

    let savedBudget: {
      id: string;
      categoryId: string;
      month: string;
      amount: number;
      currency: string;
      createdAt: string;
      updatedAt: string;
    };
    if (modalRoute.kind === "budgetForm" && modalRoute.mode === "edit" && editingBudget) {
      savedBudget = await apiClient.updateBudget(token, editingBudget.id, payload);
    } else {
      savedBudget = await apiClient.createBudget(token, payload);
    }

    const optimisticBudget = toOptimisticBudget(savedBudget);
    setBudgets((previous) => {
      const next = [optimisticBudget, ...previous.filter((item) => item.id !== optimisticBudget.id)];
      setBudgetTotals(calculateBudgetTotals(next));
      return next;
    });

    setBudgetMonth(payload.month);
    setEditingBudget(null);
    setModalRoute(emptyModalRoute);
    setActiveTab("budgets");
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Budgets",
      message: modalRoute.kind === "budgetForm" && modalRoute.mode === "edit" ? "Budget updated." : "Budget created."
    });
  };

  const handleDeleteBudget = async (budget: Budget) => {
    if (!token) return;

    Alert.alert("Delete budget", "Do you want to delete this budget?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteBudget(token, budget.id);

              setBudgets((previous) => {
                const next = previous.filter((item) => item.id !== budget.id);
                setBudgetTotals(calculateBudgetTotals(next));
                return next;
              });
              enqueueReconcileSync(token);
              publishToast({
                tone: "success",
                title: "Budgets",
                message: "Budget deleted."
              });
            } catch (error) {
              publishToast({
                tone: "error",
                title: "Unable to delete budget",
                message: resolveErrorMessage(error, "Please try again.")
              });
            }
          })();
        }
      }
    ]);
  };

  const handleSaveGoal = async (payload: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    currency: string;
    targetDate: string | null;
  }) => {
    if (!token) return;

    const createPayload: {
      name: string;
      targetAmount: number;
      currentAmount: number;
      currency: string;
      targetDate?: string;
    } = {
      name: payload.name,
      targetAmount: payload.targetAmount,
      currentAmount: payload.currentAmount,
      currency: payload.currency,
      ...(payload.targetDate ? { targetDate: payload.targetDate } : {})
    };

    if (modalRoute.kind === "goalForm" && modalRoute.mode === "edit" && editingGoal) {
      const updatedGoal = await apiClient.updateGoal(token, editingGoal.id, {
        ...createPayload,
        targetDate: payload.targetDate
      });
      setGoals((previous) => previous.map((item) => (item.id === updatedGoal.id ? updatedGoal : item)));
    } else {
      const createdGoal = await apiClient.createGoal(token, createPayload);
      setGoals((previous) => [createdGoal, ...previous.filter((item) => item.id !== createdGoal.id)]);
    }

    setEditingGoal(null);
    setModalRoute(emptyModalRoute);
    setActiveTab("goals");
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Goals",
      message: modalRoute.kind === "goalForm" && modalRoute.mode === "edit" ? "Goal updated." : "Goal created."
    });
  };

  const handleContributeGoal = async (goal: Goal, increment: number) => {
    if (!token) return;

    const nextCurrentAmount = Number((goal.currentAmount + increment).toFixed(2));

    const updatedGoal = await apiClient.updateGoal(token, goal.id, {
      currentAmount: nextCurrentAmount
    });

    setGoals((previous) => previous.map((item) => (item.id === updatedGoal.id ? updatedGoal : item)));
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Goals",
      message: "Contribution applied."
    });
  };

  const handleDeleteGoal = async (goal: Goal) => {
    if (!token) return;

    Alert.alert("Delete goal", "Do you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteGoal(token, goal.id);
              setGoals((previous) => previous.filter((item) => item.id !== goal.id));
              enqueueReconcileSync(token);
              publishToast({
                tone: "success",
                title: "Goals",
                message: "Goal deleted."
              });
            } catch (error) {
              publishToast({
                tone: "error",
                title: "Unable to delete goal",
                message: resolveErrorMessage(error, "Please try again.")
              });
            }
          })();
        }
      }
    ]);
  };

  const handleSaveNetWorthAccount = async (payload: {
    name: string;
    accountType: "asset" | "liability";
    subtype: string;
    balance: number;
    currency: string;
    notes: string | null;
  }) => {
    if (!token) return;

    if (modalRoute.kind === "netWorthForm" && modalRoute.mode === "edit" && editingNetWorthAccount) {
      await apiClient.updateNetWorthAccount(token, editingNetWorthAccount.id, payload);
    } else {
      await apiClient.createNetWorthAccount(token, payload);
    }

    const displayCurrency = regionalPreferences.currency;
    const refreshedNetWorth = await apiClient.getNetWorth(token, displayCurrency);
    setNetWorth(refreshedNetWorth);

    setEditingNetWorthAccount(null);
    setModalRoute({ kind: "netWorth" });
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Net Worth",
      message: modalRoute.kind === "netWorthForm" && modalRoute.mode === "edit" ? "Account updated." : "Account added."
    });
  };

  const handleDeleteNetWorthAccount = async (account: NetWorthAccount) => {
    if (!token) return;

    Alert.alert("Remove account", `Remove "${account.name}" from net worth tracking?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await apiClient.deleteNetWorthAccount(token, account.id);
              const refreshedNetWorth = await apiClient.getNetWorth(token, regionalPreferences.currency);
              setNetWorth(refreshedNetWorth);
              enqueueReconcileSync(token);
              publishToast({
                tone: "success",
                title: "Net Worth",
                message: "Account removed."
              });
            } catch (error) {
              publishToast({
                tone: "error",
                title: "Unable to remove account",
                message: resolveErrorMessage(error, "Please try again.")
              });
            }
          })();
        }
      }
    ]);
  };

  const handleSaveProfile = async (payload: Partial<{
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
  }>) => {
    if (!token) return;

    const updatedProfile = await apiClient.updateProfile(token, payload);
    setProfile(updatedProfile);
    const displayCurrency = resolveRegionalPreferences(updatedProfile, bootstrap).currency;
    const [summary, rateSnapshot] = await Promise.all([
      apiClient.getReportSummary(token, reportMonth, displayCurrency),
      apiClient.getExchangeRates(token, displayCurrency)
    ]);
    setReportSummary(summary);
    setExchangeRates(rateSnapshot);
    enqueueReconcileSync(token);
    publishToast({
      tone: "success",
      title: "Profile",
      message: "Profile updated."
    });
  };

  const handleSaveProfileSettings = async (settings: UserProfile["settings"]) => {
    if (!token) return;

    const updatedProfile = await apiClient.updateProfile(token, { settings });
    setProfile(updatedProfile);
    enqueueReconcileSync(token);
  };

  const handleChangeDisplayCurrency = async (currency: string) => {
    if (!token) {
      return;
    }

    const updatedProfile = await apiClient.updateProfile(token, { currency });
    const displayCurrency = resolveRegionalPreferences(updatedProfile, bootstrap).currency;
    const [summary, rateSnapshot, netWorthData] = await Promise.all([
      apiClient.getReportSummary(token, reportMonth, displayCurrency),
      apiClient.getExchangeRates(token, displayCurrency),
      apiClient.getNetWorth(token, displayCurrency)
    ]);

    setProfile(updatedProfile);
    setReportSummary(summary);
    setExchangeRates(rateSnapshot);
    setNetWorth(netWorthData);
    enqueueReconcileSync(token);
  };

  const handleUploadProfileAvatar = async (payload: { uri: string; fileName: string; mimeType: string }): Promise<string> => {
    if (!token) {
      throw new Error("Sign in again and retry.");
    }

    const updatedProfile = await apiClient.uploadProfileAvatar(token, payload);
    setProfile(updatedProfile);
    enqueueReconcileSync(token);
    return updatedProfile.avatarUrl ?? "";
  };

  const handleRemoveProfileAvatar = async (): Promise<void> => {
    if (!token) {
      throw new Error("Sign in again and retry.");
    }

    const updatedProfile = await apiClient.removeProfileAvatar(token);
    setProfile(updatedProfile);
    enqueueReconcileSync(token);
  };

  const handleSmsIntent = async (enabled: boolean) => {
    if (!token) return;
    await apiClient.logSmsIntent(token, enabled);
    const outcome = resolveSmsIntentOutcome(enabled);
    publishToast({
      tone: "info",
      title: "Request recorded",
      message: `SMS detection remains disabled in this sprint. Requested: ${
        outcome.requestedEnabled ? "enable" : "disable"
      }.`
    });
  };

  const clearAuthenticatedState = () => {
    setToken(null);
    setUser(null);
    setProfile(null);
    setTransactions([]);
    setTransactionFilters(defaultTransactionFilters);
    setTransactionPagination(emptyTransactionPagination);
    setBudgets([]);
    setGoals([]);
    setNetWorth(null);
    setReportSummary(null);
    setExchangeRates(null);
    setReportMonth(getCurrentMonthToken());
    setCategories([]);
    setPendingEmail("");
    setActiveTab(defaultTabRoute);
    setModalRoute(emptyModalRoute);
    setEditingTransaction(null);
    setEditingCategory(null);
    setEditingBudget(null);
    setEditingGoal(null);
    setEditingNetWorthAccount(null);
  };

  const handleSignOut = async () => {
    let remoteLogoutFailed = false;

    if (token) {
      try {
        await apiClient.logout(token);
      } catch {
        remoteLogoutFailed = true;
      }
    }

    await clearSessionToken();
    clearAuthenticatedState();

    if (remoteLogoutFailed) {
      publishToast({
        tone: "warn",
        title: "Signed out locally",
        message: "Could not complete server logout due to a network issue, but this device session is cleared."
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!token) return;

    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all related cloud data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await apiClient.deleteAccount(token);
              } catch {
                publishToast({
                  tone: "error",
                  title: "Delete failed",
                  message: "Could not delete account right now. Please try again."
                });
                return;
              }

              await clearSessionToken();
              clearAuthenticatedState();
            })();
          }
        }
      ]
    );
  };

  const renderActiveContent = () => {
    if (modalRoute.kind === "transactionForm") {
      return (
        <TransactionFormScreen
          categories={categories}
          initial={modalRoute.mode === "edit" ? editingTransaction : null}
          defaultCurrency={regionalPreferences.currency}
          onCancel={() => {
            setEditingTransaction(null);
            setModalRoute(emptyModalRoute);
          }}
          onSubmit={handleSaveTransaction}
        />
      );
    }

    if (modalRoute.kind === "categoryManager") {
      return (
        <CategoryManagerScreen
          categories={categories}
          refreshing={refreshing}
          onRefresh={refreshAll}
          onBack={() => setModalRoute(emptyModalRoute)}
          onAdd={() => {
            setEditingCategory(null);
            setModalRoute({ kind: "categoryForm", mode: "create" });
          }}
          onEdit={(category) => {
            setEditingCategory(category);
            setModalRoute({ kind: "categoryForm", mode: "edit" });
          }}
          onDelete={handleDeleteCategory}
        />
      );
    }

    if (modalRoute.kind === "categoryForm") {
      return (
        <CategoryFormScreen
          initial={modalRoute.mode === "edit" ? editingCategory : null}
          onCancel={() => {
            setEditingCategory(null);
            setModalRoute({ kind: "categoryManager" });
          }}
          onSubmit={handleSaveCategory}
        />
      );
    }

    if (modalRoute.kind === "budgetForm") {
      return (
        <BudgetFormScreen
          categories={categories}
          initial={modalRoute.mode === "edit" ? editingBudget : null}
          month={budgetMonth}
          defaultCurrency={regionalPreferences.currency}
          onCancel={() => {
            setEditingBudget(null);
            setModalRoute(emptyModalRoute);
          }}
          onSubmit={handleSaveBudget}
        />
      );
    }

    if (modalRoute.kind === "goalForm") {
      return (
        <GoalFormScreen
          initial={modalRoute.mode === "edit" ? editingGoal : null}
          defaultCurrency={regionalPreferences.currency}
          onCancel={() => {
            setEditingGoal(null);
            setModalRoute(emptyModalRoute);
          }}
          onSubmit={handleSaveGoal}
        />
      );
    }

    if (modalRoute.kind === "netWorthForm") {
      return (
        <NetWorthFormScreen
          initial={modalRoute.mode === "edit" ? editingNetWorthAccount : null}
          defaultCurrency={regionalPreferences.currency}
          onCancel={() => {
            setEditingNetWorthAccount(null);
            setModalRoute({ kind: "netWorth" });
          }}
          onSubmit={handleSaveNetWorthAccount}
        />
      );
    }

    if (modalRoute.kind === "netWorth") {
      return (
        <NetWorthScreen
          overview={netWorth}
          exchangeRates={exchangeRates}
          regionalPreferences={regionalPreferences}
          refreshing={refreshing}
          onRefresh={refreshAll}
          onBack={() => setModalRoute(emptyModalRoute)}
          onAdd={() => {
            setEditingNetWorthAccount(null);
            setModalRoute({ kind: "netWorthForm", mode: "create" });
          }}
          onEdit={(account) => {
            setEditingNetWorthAccount(account);
            setModalRoute({ kind: "netWorthForm", mode: "edit" });
          }}
          onDelete={handleDeleteNetWorthAccount}
        />
      );
    }

    if (modalRoute.kind === "profile") {
      if (!profile) {
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.color.actionPrimary} />
            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        );
      }

      return (
        <ProfileScreen
          profile={profile}
          onBack={() => setModalRoute(emptyModalRoute)}
          onSave={handleSaveProfile}
          onUploadAvatar={handleUploadProfileAvatar}
          onRemoveAvatar={handleRemoveProfileAvatar}
        />
      );
    }

    if (activeTab === "dashboard") {
      return (
        <DashboardScreen
          month={reportMonth}
          summary={reportSummary}
          profile={profile}
          exchangeRates={exchangeRates}
          regionalPreferences={regionalPreferences}
          refreshing={refreshing}
          onMonthChange={setReportMonth}
          onApplyMonth={handleApplyReportMonth}
          onRefresh={refreshAll}
          onOpenTransactions={() => setActiveTab("transactions")}
        />
      );
    }

    if (activeTab === "transactions") {
      return (
        <TransactionsScreen
          items={transactions}
          categories={categories}
          exchangeRates={exchangeRates}
          regionalPreferences={regionalPreferences}
          filters={transactionFilters}
          pagination={transactionPagination}
          refreshing={refreshing}
          loadingMore={transactionLoadingMore}
          onRefresh={refreshAll}
          onFilterChange={(patch) => setTransactionFilters((current) => ({ ...current, ...patch }))}
          onApplyFilters={handleApplyTransactionFilters}
          onResetFilters={handleResetTransactionFilters}
          onLoadMore={handleLoadMoreTransactions}
          onAdd={() => {
            setEditingTransaction(null);
            setModalRoute({ kind: "transactionForm", mode: "create" });
          }}
          onEdit={(transaction) => {
            setEditingTransaction(transaction);
            setModalRoute({ kind: "transactionForm", mode: "edit" });
          }}
          onDelete={handleDeleteTransaction}
        />
      );
    }

    if (activeTab === "budgets") {
      return (
        <BudgetsScreen
          month={budgetMonth}
          items={budgets}
          totals={displayBudgetTotals}
          exchangeRates={exchangeRates}
          regionalPreferences={regionalPreferences}
          refreshing={refreshing}
          onMonthChange={setBudgetMonth}
          onApplyMonth={handleApplyBudgetMonth}
          onPreviousMonth={() => handleShiftBudgetMonth(-1)}
          onNextMonth={() => handleShiftBudgetMonth(1)}
          onRefresh={refreshAll}
          onAdd={() => {
            setEditingBudget(null);
            setModalRoute({ kind: "budgetForm", mode: "create" });
          }}
          onEdit={(budget) => {
            setEditingBudget(budget);
            setModalRoute({ kind: "budgetForm", mode: "edit" });
          }}
          onDelete={handleDeleteBudget}
        />
      );
    }

    if (activeTab === "goals") {
      return (
        <GoalsScreen
          items={goals}
          exchangeRates={exchangeRates}
          regionalPreferences={regionalPreferences}
          refreshing={refreshing}
          onRefresh={refreshAll}
          onAdd={() => {
            setEditingGoal(null);
            setModalRoute({ kind: "goalForm", mode: "create" });
          }}
          onEdit={(goal) => {
            setEditingGoal(goal);
            setModalRoute({ kind: "goalForm", mode: "edit" });
          }}
          onDelete={handleDeleteGoal}
          onContribute={handleContributeGoal}
        />
      );
    }

    return (
      <SettingsScreen
        profile={profile}
        displayCurrency={regionalPreferences.currency}
        smsDisclosureVersion={bootstrap?.legal.smsDisclosureVersion ?? "sms_disclosure_v1"}
        onOpenProfile={() => {
          setModalRoute({ kind: "profile" });
        }}
        onRequestEnable={handleSmsIntent}
        onOpenCategoryManager={() => {
          setModalRoute({ kind: "categoryManager" });
        }}
        onOpenNetWorth={() => {
          setModalRoute({ kind: "netWorth" });
        }}
        onSaveProfileSettings={handleSaveProfileSettings}
        onChangeDisplayCurrency={handleChangeDisplayCurrency}
        onDeleteAccount={handleDeleteAccount}
        onSignOut={handleSignOut}
      />
    );
  };

  const renderShellContent = () => {
    if (isBooting) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.color.actionPrimary} />
          <Text style={styles.loadingText}>Preparing your workspace...</Text>
        </View>
      );
    }

    if (!isAuthenticated) {
      return (
        <View style={styles.authShell}>
          <View style={styles.flexFill}>
            {authStage === "login" ? (
              <LoginScreen
                onRequestOtp={handleRequestOtp}
                onGoogleSignIn={handleGoogleSignIn}
                onAppleSignIn={handleAppleSignIn}
              />
            ) : (
              <OtpVerifyScreen email={pendingEmail} onBack={() => setPendingEmail("")} onVerify={handleVerifyOtp} />
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.appShell}>
        <View style={styles.flexFill}>{renderActiveContent()}</View>
        {modalRoute.kind === "none" ? <BottomTabBar activeRoute={activeTab} onChange={setActiveTab} userAvatar={profile?.avatarUrl} /> : null}
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <StatusBar style="light" />
          {renderShellContent()}
          <ToastViewport bottomOffset={modalRoute.kind === "none" && isAuthenticated ? 120 : 24} />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = createStyles(() => ({
  root: {
    flex: 1
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#000000" // Force true black for safe area
  },
  flexFill: {
    flex: 1
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md
  },
  loadingText: {
    color: theme.color.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 10
  },
  authShell: {
    flex: 1,
    gap: theme.spacing.sm
  },
  appShell: {
    flex: 1,
    backgroundColor: theme.color.bgBase
  }
}));
