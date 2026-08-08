import { describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import { getExchangeRateSnapshot } from "./service.js";

const logger = {
  warn: vi.fn()
} as unknown as FastifyBaseLogger;

describe("getExchangeRateSnapshot", () => {
  it("serves stale Redis rates when the ECB request times out", async () => {
    const staleSnapshot = {
      provider: "ecb" as const,
      baseCurrency: "EUR" as const,
      asOf: "2026-08-07",
      rates: { EUR: 1, INR: 101.25 }
    };
    const redis = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          snapshot: staleSnapshot,
          expiresAt: Date.now() - 1
        })
      )
    } as unknown as Redis;
    const fetchFn: typeof fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
        })
    );

    await expect(
      getExchangeRateSnapshot({
        redis,
        logger,
        nodeEnv: "development",
        fetchFn,
        fetchTimeoutMs: 1
      })
    ).resolves.toEqual(staleSnapshot);
  });
});
