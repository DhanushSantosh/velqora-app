import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

type AuthResult = { token: string };

const authViaOtp = async (app: FastifyInstance, email: string): Promise<AuthResult> => {
  const requestOtpResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/request-otp",
    payload: { email }
  });
  const code = (requestOtpResponse.json() as { debugOtpCode: string }).debugOtpCode;
  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/verify-otp",
    payload: { email, code }
  });
  expect(verifyResponse.statusCode).toBe(200);
  return { token: (verifyResponse.json() as { token: string }).token };
};

describe("net-worth integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("supports account lifecycle, summary math, archival, and ownership isolation", async () => {
    const owner = await authViaOtp(app, `net-worth-owner-${randomUUID()}@example.com`);
    const intruder = await authViaOtp(app, `net-worth-intruder-${randomUUID()}@example.com`);
    const headers = { authorization: `Bearer ${owner.token}` };

    const assetResponse = await app.inject({
      method: "POST",
      url: "/api/v1/net-worth/accounts",
      headers,
      payload: { name: "Savings", accountType: "asset", subtype: "bank", balance: 1000, currency: "INR" }
    });
    expect(assetResponse.statusCode).toBe(200);
    const assetId = (assetResponse.json() as { item: { id: string } }).item.id;

    const liabilityResponse = await app.inject({
      method: "POST",
      url: "/api/v1/net-worth/accounts",
      headers,
      payload: { name: "Card", accountType: "liability", subtype: "credit_card", balance: 250, currency: "INR" }
    });
    expect(liabilityResponse.statusCode).toBe(200);
    const liabilityId = (liabilityResponse.json() as { item: { id: string } }).item.id;

    const listResponse = await app.inject({ method: "GET", url: "/api/v1/net-worth", headers });
    expect(listResponse.statusCode).toBe(200);
    const listJson = listResponse.json() as {
      accounts: Array<{ id: string; conversionFallback: boolean }>;
      summary: { totalAssets: number; totalLiabilities: number; netWorth: number; currency: string };
    };
    expect(listJson.accounts).toHaveLength(2);
    expect(listJson.summary).toMatchObject({ totalAssets: 1000, totalLiabilities: 250, netWorth: 750, currency: "INR" });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/net-worth/accounts/${assetId}`,
      headers,
      payload: { balance: 1500, notes: "Updated" }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect((updateResponse.json() as { item: { balance: number; notes: string } }).item).toMatchObject({ balance: 1500, notes: "Updated" });

    const crossUserUpdate = await app.inject({
      method: "PATCH",
      url: `/api/v1/net-worth/accounts/${assetId}`,
      headers: { authorization: `Bearer ${intruder.token}` },
      payload: { balance: 1 }
    });
    expect(crossUserUpdate.statusCode).toBe(404);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/net-worth/accounts/${liabilityId}`,
      headers
    });
    expect(deleteResponse.statusCode).toBe(200);

    const afterArchiveResponse = await app.inject({ method: "GET", url: "/api/v1/net-worth", headers });
    expect(afterArchiveResponse.statusCode).toBe(200);
    const afterArchiveJson = afterArchiveResponse.json() as {
      accounts: Array<{ id: string }>;
      summary: { totalAssets: number; totalLiabilities: number; netWorth: number };
    };
    expect(afterArchiveJson.accounts.map((account) => account.id)).toEqual([assetId]);
    expect(afterArchiveJson.summary).toMatchObject({ totalAssets: 1500, totalLiabilities: 0, netWorth: 1500 });
  });
});
