import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import { AppError } from "../../errors.js";

const ecbDailyRatesUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const cacheKey = "fx:ecb:daily";
const cacheTtlSeconds = 60 * 60 * 6;
const fetchTimeoutMs = 10_000;

const testSnapshot = {
  provider: "ecb",
  baseCurrency: "EUR",
  asOf: "2026-03-27",
  rates: {
    EUR: 1,
    USD: 1.1517,
    INR: 109.1945,
    GBP: 0.8672,
    SGD: 1.4831,
    AUD: 1.6731,
    CAD: 1.5974,
    JPY: 184.16
  }
} as const;

type ExchangeRateSnapshot = {
  provider: "ecb";
  baseCurrency: "EUR";
  asOf: string;
  rates: Record<string, number>;
};

type CacheRecord = {
  snapshot: ExchangeRateSnapshot;
  expiresAt: number;
};

let inMemoryCache: CacheRecord | null = null;

const parseEcbRatesXml = (xml: string): ExchangeRateSnapshot => {
  const dateMatch = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/);
  if (!dateMatch) {
    throw new AppError(502, "FX_UNAVAILABLE", "Exchange rates are unavailable right now.");
  }

  // Use a null-prototype map to prevent prototype-pollution via keys extracted from
  // the external ECB XML feed (Semgrep: detect-bracket-object-injection).
  const rates = Object.create(null) as Record<string, number>;
  rates["EUR"] = 1;

  const rateMatches = xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g);
  for (const [, currency, rateRaw] of rateMatches) {
    const rate = Number(rateRaw);
    if (Number.isFinite(rate) && rate > 0) {
      rates[currency] = rate;
    }
  }

  return {
    provider: "ecb",
    baseCurrency: "EUR",
    asOf: dateMatch[1],
    rates
  };
};

const readRedisCache = async (redis: Redis | null): Promise<ExchangeRateSnapshot | null> => {
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheRecord;
    if (parsed.expiresAt <= Date.now()) {
      return null;
    }

    inMemoryCache = parsed;
    return parsed.snapshot;
  } catch {
    return null;
  }
};

const readStaleRedisCache = async (redis: Redis | null): Promise<ExchangeRateSnapshot | null> => {
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(cacheKey);
    if (!raw) {
      return null;
    }

    return (JSON.parse(raw) as CacheRecord).snapshot;
  } catch {
    return null;
  }
};

const readStaleCache = async (redis: Redis | null): Promise<ExchangeRateSnapshot | null> =>
  inMemoryCache?.snapshot ?? (await readStaleRedisCache(redis));

const writeRedisCache = async (redis: Redis | null, snapshot: ExchangeRateSnapshot): Promise<void> => {
  const record: CacheRecord = {
    snapshot,
    expiresAt: Date.now() + cacheTtlSeconds * 1000
  };
  inMemoryCache = record;

  if (!redis) {
    return;
  }

  try {
    await redis.set(cacheKey, JSON.stringify(record), "EX", cacheTtlSeconds);
  } catch {
    // In-memory cache is enough when Redis is unavailable.
  }
};

export const getExchangeRateSnapshot = async (input: {
  redis: Redis | null;
  logger: FastifyBaseLogger;
  nodeEnv: "development" | "test" | "production";
  fetchFn?: typeof fetch;
  fetchTimeoutMs?: number;
}): Promise<ExchangeRateSnapshot> => {
  if (input.nodeEnv === "test") {
    return testSnapshot;
  }

  if (inMemoryCache && inMemoryCache.expiresAt > Date.now()) {
    return inMemoryCache.snapshot;
  }

  const cachedSnapshot = await readRedisCache(input.redis);
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  try {
    const response = await (input.fetchFn ?? fetch)(ecbDailyRatesUrl, {
      method: "GET",
      headers: {
        accept: "application/xml,text/xml"
      },
      signal: AbortSignal.timeout(input.fetchTimeoutMs ?? fetchTimeoutMs)
    });

    if (!response.ok) {
      input.logger.warn({ statusCode: response.status }, "ECB FX feed request failed.");
      throw new AppError(502, "FX_UNAVAILABLE", "Exchange rates are unavailable right now.");
    }

    const xml = await response.text();
    const snapshot = parseEcbRatesXml(xml);
    await writeRedisCache(input.redis, snapshot);
    return snapshot;
  } catch (error) {
    const staleSnapshot = await readStaleCache(input.redis);
    if (staleSnapshot) {
      input.logger.warn({ error }, "ECB FX feed unavailable; serving stale exchange rates.");
      return staleSnapshot;
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(502, "FX_UNAVAILABLE", "Exchange rates are unavailable right now.");
  }
};

export const convertAmount = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  snapshot: ExchangeRateSnapshot
): number => {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();

  if (from === to) {
    return Number(amount.toFixed(2));
  }

  const fromRate = from === "EUR" ? 1 : snapshot.rates[from];
  const toRate = to === "EUR" ? 1 : snapshot.rates[to];

  if (!fromRate || !toRate) {
    throw new AppError(400, "UNSUPPORTED_CURRENCY_CONVERSION", `Unable to convert ${from} to ${to} with the current rate feed.`);
  }

  const amountInEur = from === "EUR" ? amount : amount / fromRate;
  const amountInTarget = to === "EUR" ? amountInEur : amountInEur * toRate;
  return Number(amountInTarget.toFixed(2));
};

export const mapRatesFromBaseCurrency = (
  baseCurrency: string,
  snapshot: ExchangeRateSnapshot
): Record<string, number> => {
  const base = baseCurrency.trim().toUpperCase();
  // Use a null-prototype map to prevent prototype-pollution via currency keys derived
  // from the external rate feed or the caller-supplied base currency string.
  const mappedRates = Object.create(null) as Record<string, number>;

  for (const currency of Object.keys(snapshot.rates)) {
    mappedRates[currency] = convertAmount(1, base, currency, snapshot);
  }

  mappedRates[base] = 1;
  return mappedRates;
};

export type { ExchangeRateSnapshot };
