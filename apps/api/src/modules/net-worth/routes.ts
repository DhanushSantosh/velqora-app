import { and, desc, eq, isNull } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { AppContext } from "../../context.js";
import { netWorthAccounts } from "../../db/schema.js";
import { AppError } from "../../errors.js";
import { requireAuth } from "../../utils/auth.js";
import { executeIdempotent } from "../../utils/idempotency.js";
import { isSupportedCurrency, resolveUserRegionalPreferences } from "../../utils/regional.js";
import { parseOrThrow } from "../../utils/validation.js";
import { convertAmount, getExchangeRateSnapshot } from "../fx/service.js";
import { idParamSchema, netWorthAccountCreateSchema, netWorthAccountUpdateSchema } from "./validation.js";

const parseMoney = (value: string): number => Number(value);

const buildAccountResponse = (row: {
  id: string;
  name: string;
  accountType: "asset" | "liability";
  subtype: string;
  balance: string;
  currency: string;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  name: row.name,
  accountType: row.accountType,
  subtype: row.subtype,
  balance: parseMoney(row.balance),
  currency: row.currency,
  notes: row.notes,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const accountSelection = {
  id: netWorthAccounts.id,
  name: netWorthAccounts.name,
  accountType: netWorthAccounts.accountType,
  subtype: netWorthAccounts.subtype,
  balance: netWorthAccounts.balance,
  currency: netWorthAccounts.currency,
  notes: netWorthAccounts.notes,
  archivedAt: netWorthAccounts.archivedAt,
  createdAt: netWorthAccounts.createdAt,
  updatedAt: netWorthAccounts.updatedAt
};

export const registerNetWorthRoutes = async (app: FastifyInstance, ctx: AppContext): Promise<void> => {
  app.get("/api/v1/net-worth", async (request) => {
    const identity = requireAuth(request);
    const regionalPreferences = await resolveUserRegionalPreferences(ctx.db, identity.userId, {
      timezone: "UTC",
      locale: "en-IN",
      currency: ctx.env.APP_CURRENCY
    });
    const rows = await ctx.db
      .select(accountSelection)
      .from(netWorthAccounts)
      .where(and(eq(netWorthAccounts.userId, identity.userId), isNull(netWorthAccounts.archivedAt)))
      .orderBy(desc(netWorthAccounts.updatedAt));

    const snapshot = rows.length
      ? await getExchangeRateSnapshot({ redis: ctx.redis, logger: request.log, nodeEnv: ctx.env.NODE_ENV })
      : null;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let hasConversionFallback = false;

    const accounts = rows.map((row) => {
      const account = buildAccountResponse(row);
      let baseCurrencyBalance = account.balance;
      let conversionFallback = false;

      if (snapshot) {
        try {
          baseCurrencyBalance = convertAmount(account.balance, account.currency, regionalPreferences.currency, snapshot);
        } catch (error) {
          conversionFallback = true;
          hasConversionFallback = true;
          request.log.warn({ error, accountId: account.id, currency: account.currency }, "Net-worth currency conversion failed; using raw balance.");
        }
      }

      if (account.accountType === "asset") {
        totalAssets += baseCurrencyBalance;
      } else {
        totalLiabilities += baseCurrencyBalance;
      }

      return {
        ...account,
        baseCurrencyBalance: Number(baseCurrencyBalance.toFixed(2)),
        conversionFallback
      };
    });

    totalAssets = Number(totalAssets.toFixed(2));
    totalLiabilities = Number(totalLiabilities.toFixed(2));
    return {
      accounts,
      summary: {
        totalAssets,
        totalLiabilities,
        netWorth: Number((totalAssets - totalLiabilities).toFixed(2)),
        currency: regionalPreferences.currency,
        asOf: new Date().toISOString(),
        hasConversionFallback
      }
    };
  });

  app.post("/api/v1/net-worth/accounts", async (request, reply) => {
    const identity = requireAuth(request);
    return executeIdempotent({
      ctx,
      request,
      reply,
      userId: identity.userId,
      execute: async () => {
        const body = parseOrThrow(netWorthAccountCreateSchema, request.body);
        const regionalPreferences = await resolveUserRegionalPreferences(ctx.db, identity.userId, {
          timezone: "UTC",
          locale: "en-IN",
          currency: ctx.env.APP_CURRENCY
        });
        const currency = (body.currency ?? regionalPreferences.currency).toUpperCase();
        if (!isSupportedCurrency(currency)) {
          throw new AppError(400, "INVALID_CURRENCY", "Currency must be a supported 3-letter ISO code.");
        }

        const rows = await ctx.db
          .insert(netWorthAccounts)
          .values({
            userId: identity.userId,
            name: body.name,
            accountType: body.accountType,
            subtype: body.subtype,
            balance: body.balance.toFixed(2),
            currency,
            notes: body.notes ?? null,
            updatedAt: new Date()
          })
          .returning(accountSelection);

        await ctx.auditService.log({
          userId: identity.userId,
          action: "net_worth.account.create",
          entityType: "net_worth_account",
          entityId: rows[0].id,
          requestId: request.id,
          ipAddress: request.ip
        });

        return { item: buildAccountResponse(rows[0]) };
      }
    });
  });

  app.patch("/api/v1/net-worth/accounts/:id", async (request, reply) => {
    const identity = requireAuth(request);
    return executeIdempotent({
      ctx,
      request,
      reply,
      userId: identity.userId,
      execute: async () => {
        const params = parseOrThrow(idParamSchema, request.params);
        const body = parseOrThrow(netWorthAccountUpdateSchema, request.body);
        const existingRows = await ctx.db
          .select()
          .from(netWorthAccounts)
          .where(and(eq(netWorthAccounts.id, params.id), eq(netWorthAccounts.userId, identity.userId), isNull(netWorthAccounts.archivedAt)))
          .limit(1);
        const existing = existingRows[0];
        if (!existing) {
          throw new AppError(404, "NET_WORTH_ACCOUNT_NOT_FOUND", "Net worth account not found.");
        }

        const currency = body.currency ? body.currency.toUpperCase() : existing.currency;
        if (!isSupportedCurrency(currency)) {
          throw new AppError(400, "INVALID_CURRENCY", "Currency must be a supported 3-letter ISO code.");
        }

        const rows = await ctx.db
          .update(netWorthAccounts)
          .set({
            name: body.name ?? existing.name,
            accountType: body.accountType ?? existing.accountType,
            subtype: body.subtype ?? existing.subtype,
            balance: body.balance === undefined ? existing.balance : body.balance.toFixed(2),
            currency,
            notes: body.notes === undefined ? existing.notes : body.notes,
            updatedAt: new Date()
          })
          .where(and(eq(netWorthAccounts.id, params.id), eq(netWorthAccounts.userId, identity.userId), isNull(netWorthAccounts.archivedAt)))
          .returning(accountSelection);

        await ctx.auditService.log({
          userId: identity.userId,
          action: "net_worth.account.update",
          entityType: "net_worth_account",
          entityId: params.id,
          requestId: request.id,
          ipAddress: request.ip
        });

        return { item: buildAccountResponse(rows[0]) };
      }
    });
  });

  app.delete("/api/v1/net-worth/accounts/:id", async (request, reply) => {
    const identity = requireAuth(request);
    return executeIdempotent({
      ctx,
      request,
      reply,
      userId: identity.userId,
      execute: async () => {
        const params = parseOrThrow(idParamSchema, request.params);
        const rows = await ctx.db
          .update(netWorthAccounts)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(netWorthAccounts.id, params.id), eq(netWorthAccounts.userId, identity.userId), isNull(netWorthAccounts.archivedAt)))
          .returning({ id: netWorthAccounts.id });
        if (!rows[0]) {
          throw new AppError(404, "NET_WORTH_ACCOUNT_NOT_FOUND", "Net worth account not found.");
        }

        await ctx.auditService.log({
          userId: identity.userId,
          action: "net_worth.account.delete",
          entityType: "net_worth_account",
          entityId: params.id,
          requestId: request.id,
          ipAddress: request.ip
        });

        return { success: true };
      }
    });
  });
};
