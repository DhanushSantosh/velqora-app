import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { createAppContext, closeAppContext } from "./context.js";
import { env } from "./env.js";
import { AppError, toClientAppError } from "./errors.js";
import { captureApiException } from "./monitoring/sentry.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerCategoryRoutes } from "./modules/categories/routes.js";
import { registerTransactionRoutes } from "./modules/transactions/routes.js";
import { registerConsentRoutes } from "./modules/consents/routes.js";
import { registerBudgetRoutes } from "./modules/budgets/routes.js";
import { registerGoalRoutes } from "./modules/goals/routes.js";
import { registerReportRoutes } from "./modules/reports/routes.js";
import { registerImportRoutes } from "./modules/imports/routes.js";
import { registerMetricsRoutes } from "./modules/metrics/routes.js";
import { registerProfileRoutes } from "./modules/profile/routes.js";
import { registerFxRoutes } from "./modules/fx/routes.js";
import { registerNetWorthRoutes } from "./modules/net-worth/routes.js";

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
    logger: {
      level: process.env.NODE_ENV === "development" ? "info" : "warn"
    }
  });

  const ctx = await createAppContext(app.log);
  ctx.sloMonitorService.start();

  app.decorateRequest("auth", null);

  const parseOrigins = (raw: string): (string | RegExp)[] =>
    raw.split(",").map((o) => {
      const t = o.trim();
      if (!t.includes("*")) return t;
      // Escape all regex metacharacters except *, then convert * to subdomain wildcard.
      // Input is server-controlled (MOBILE_APP_ORIGIN env var), not user-supplied.
      const escaped = t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]+");
      return new RegExp("^" + escaped + "$"); // nosemgrep: detect-non-literal-regexp
    });

  await app.register(cors, {
    origin: parseOrigins(ctx.env.MOBILE_APP_ORIGIN),
    credentials: true
  });

  // Global rate limit — broad ceiling to satisfy CodeQL's js/missing-rate-limiting rule.
  // Auth and other sensitive routes apply stricter per-key limits in their service layer.
  // allowList bypasses all rate limits (global and per-route) in the test environment so
  // integration tests that call auth endpoints multiple times don't get 429 responses.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    skipOnError: true,
    allowList: (_request, _key) => ctx.env.NODE_ENV === "test"
  });

  await app.register(formbody);

  app.addHook("onRequest", async (request) => {
    request.auth = await ctx.authService.resolveAuth(request.headers.authorization);
  });

  app.addHook("onResponse", async (_, reply) => {
    ctx.sloMonitorService.observeHttpResponse(reply.statusCode);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        captureApiException(error, {
          requestId: request.id,
          method: request.method,
          route: request.routeOptions.url ?? request.url,
          statusCode: error.statusCode,
          userId: request.auth?.userId,
          extras: {
            url: request.url,
            code: error.code
          }
        });
      }

      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        },
        requestId: request.id
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          details: error.flatten()
        },
        requestId: request.id
      });
    }

    const clientError = toClientAppError(error);
    if (clientError) {
      return reply.status(clientError.statusCode).send({
        error: {
          code: clientError.code,
          message: clientError.message,
          details: clientError.details
        },
        requestId: request.id
      });
    }

    request.log.error({ err: error }, "Unhandled request error");
    captureApiException(error, {
      requestId: request.id,
      method: request.method,
      route: request.routeOptions.url ?? request.url,
      statusCode: 500,
      userId: request.auth?.userId,
      extras: {
        url: request.url
      }
    });
    void ctx.alertsService.notify({
      severity: "error",
      title: "Unhandled API error",
      message: "A request failed with an unhandled server error.",
      fingerprint: `http_5xx:${request.method}:${request.routeOptions.url ?? request.url}`,
      metadata: {
        requestId: request.id,
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        statusCode: 500
      }
    });
    return reply.status(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong."
      },
      requestId: request.id
    });
  });

  await registerHealthRoutes(app, ctx);
  await registerAuthRoutes(app, ctx);
  await registerCategoryRoutes(app, ctx);
  await registerTransactionRoutes(app, ctx);
  await registerBudgetRoutes(app, ctx);
  await registerGoalRoutes(app, ctx);
  await registerNetWorthRoutes(app, ctx);
  await registerReportRoutes(app, ctx);
  await registerFxRoutes(app, ctx);
  await registerProfileRoutes(app, ctx);
  await registerConsentRoutes(app, ctx);
  await registerImportRoutes(app, ctx);
  await registerMetricsRoutes(app, ctx.env.METRICS_ENDPOINT_ENABLED);

  app.addHook("onClose", async () => {
    await closeAppContext(ctx);
  });

  return app;
};
