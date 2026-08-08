export const tabRouteOrder = ["dashboard", "transactions", "budgets", "goals", "settings"] as const;

export type AppTabRoute = (typeof tabRouteOrder)[number];

export type ModalRoute =
  | { kind: "none" }
  | { kind: "categoryManager" }
  | { kind: "categoryForm"; mode: "create" | "edit" }
  | { kind: "transactionForm"; mode: "create" | "edit" }
  | { kind: "budgetForm"; mode: "create" | "edit" }
  | { kind: "goalForm"; mode: "create" | "edit" }
  | { kind: "netWorth" }
  | { kind: "netWorthForm"; mode: "create" | "edit" }
  | { kind: "profile" };

export type TabSpec = {
  route: AppTabRoute;
  label: string;
  shortLabel: string;
};

export const tabSpecs: readonly TabSpec[] = [
  { route: "dashboard", label: "Dashboard", shortLabel: "Dash" },
  { route: "transactions", label: "Transactions", shortLabel: "Txns" },
  { route: "budgets", label: "Budgets", shortLabel: "Budget" },
  { route: "goals", label: "Goals", shortLabel: "Goals" },
  { route: "settings", label: "Settings", shortLabel: "Settings" }
] as const;

export const defaultTabRoute: AppTabRoute = "dashboard";
export const emptyModalRoute: ModalRoute = { kind: "none" };
