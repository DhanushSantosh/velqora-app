import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const transactionDirectionEnum = pgEnum("transaction_direction", ["debit", "credit", "transfer"]);
export const transactionSourceEnum = pgEnum("transaction_source", ["manual", "sms_import", "statement_import"]);
export const authProviderEnum = pgEnum("auth_provider", ["otp", "google", "apple", "merged"]);
export const netWorthAccountTypeEnum = pgEnum("net_worth_account_type", ["asset", "liability"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    googleId: varchar("google_id", { length: 128 }),
    appleId: varchar("apple_id", { length: 128 }),
    authProvider: authProviderEnum("auth_provider").default("otp").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    usersEmailUnique: uniqueIndex("users_email_unique").on(table.email),
    usersGoogleIdUnique: uniqueIndex("users_google_id_unique").on(table.googleId),
    usersAppleIdUnique: uniqueIndex("users_apple_id_unique").on(table.appleId)
  })
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 80 }),
    lastName: varchar("last_name", { length: 80 }),
    displayName: varchar("display_name", { length: 120 }),
    phoneNumber: varchar("phone_number", { length: 24 }),
    dateOfBirth: date("date_of_birth"),
    avatarUrl: varchar("avatar_url", { length: 2048 }),
    city: varchar("city", { length: 120 }),
    country: varchar("country", { length: 120 }),
    timezone: varchar("timezone", { length: 80 }).default("UTC").notNull(),
    locale: varchar("locale", { length: 35 }).default("en-IN").notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    occupation: varchar("occupation", { length: 120 }),
    bio: varchar("bio", { length: 280 }),
    pushNotificationsEnabled: boolean("push_notifications_enabled").default(true).notNull(),
    emailNotificationsEnabled: boolean("email_notifications_enabled").default(true).notNull(),
    weeklySummaryEnabled: boolean("weekly_summary_enabled").default(true).notNull(),
    biometricsEnabled: boolean("biometrics_enabled").default(false).notNull(),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userProfilesTimezoneIndex: index("user_profiles_timezone_idx").on(table.timezone)
  })
);

export const avatarAssets = pgTable(
  "avatar_assets",
  {
    userId: uuid("user_id")
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    avatarKey: varchar("avatar_key", { length: 220 }).notNull(),
    mimeType: varchar("mime_type", { length: 32 }).notNull(),
    contentBase64: text("content_base64").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    avatarAssetsKeyUnique: uniqueIndex("avatar_assets_key_unique").on(table.avatarKey)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    sessionsTokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    sessionsUserIdIndex: index("sessions_user_id_idx").on(table.userId)
  })
);

export const authOtps = pgTable(
  "auth_otps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    requestIp: varchar("request_ip", { length: 80 }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    authOtpsEmailIndex: index("auth_otps_email_idx").on(table.email, table.createdAt)
  })
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    direction: transactionDirectionEnum("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    categoriesUserIdIndex: index("categories_user_id_idx").on(table.userId),
    // Prevents duplicate global (user_id IS NULL) categories when multiple app instances
    // start concurrently (e.g. parallel integration test workers all calling createApp()).
    categoriesGlobalUnique: uniqueIndex("categories_global_name_direction_unique")
      .on(table.name, table.direction)
      .where(sql`"user_id" IS NULL`)
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    direction: transactionDirectionEnum("direction").notNull(),
    source: transactionSourceEnum("source").default("manual").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    counterparty: varchar("counterparty", { length: 160 }),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    transactionsUserIdIndex: index("transactions_user_id_idx").on(table.userId, table.occurredAt),
    transactionsCategoryIndex: index("transactions_category_id_idx").on(table.categoryId)
  })
);

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentKey: varchar("consent_key", { length: 80 }).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    legalTextVersion: varchar("legal_text_version", { length: 60 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    consentsUnique: uniqueIndex("consents_user_key_unique").on(table.userId, table.consentKey)
  })
);

export const budgetPlans = pgTable(
  "budget_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    budgetPlansUserMonthIndex: index("budget_plans_user_month_idx").on(table.userId, table.month),
    budgetPlansCategoryIndex: index("budget_plans_category_idx").on(table.categoryId),
    budgetPlansUnique: uniqueIndex("budget_plans_user_category_month_unique").on(table.userId, table.categoryId, table.month)
  })
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull(),
    currentAmount: numeric("current_amount", { precision: 14, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    savingsGoalsUserIndex: index("savings_goals_user_idx").on(table.userId, table.updatedAt)
  })
);

export const netWorthAccounts = pgTable(
  "net_worth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    accountType: netWorthAccountTypeEnum("account_type").notNull(),
    // Free-form subtype for grouping in the UI (e.g. "bank", "cash", "investment",
    // "property", "vehicle", "other_asset", "credit_card", "loan", "other_liability").
    // Kept as text rather than an enum since new subtypes are a UI/product concern,
    // not a schema migration.
    subtype: varchar("subtype", { length: 40 }).notNull(),
    balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    netWorthAccountsUserIndex: index("net_worth_accounts_user_idx").on(table.userId, table.updatedAt)
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    requestId: varchar("request_id", { length: 80 }),
    ipAddress: varchar("ip_address", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    auditLogsUserIdIndex: index("audit_logs_user_id_idx").on(table.userId, table.createdAt)
  })
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestMethod: varchar("request_method", { length: 10 }).notNull(),
    requestRoute: varchar("request_route", { length: 200 }).notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("idempotency_user_method_route_key_unique").on(
      table.userId,
      table.requestMethod,
      table.requestRoute,
      table.key
    ),
    idempotencyExpiresAtIndex: index("idempotency_expires_at_idx").on(table.expiresAt)
  })
);

export type TransactionDirection = (typeof transactionDirectionEnum.enumValues)[number];
