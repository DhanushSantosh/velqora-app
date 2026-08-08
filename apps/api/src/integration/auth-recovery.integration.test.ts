import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("auth recovery OTP", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("full recovery flow: request recovery OTP → verify → receives new session token", async () => {
    const email = `recovery-full-${randomUUID()}@example.com`;

    const requestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/request-otp",
      payload: { email }
    });

    expect(requestResponse.statusCode).toBe(200);
    const requestJson = requestResponse.json() as { message: string; debugOtpCode?: string };
    expect(typeof requestJson.message).toBe("string");
    expect(requestJson.debugOtpCode).toBeTruthy();
    // OTP is a 6-digit code
    expect(/^\d{6}$/.test(requestJson.debugOtpCode as string)).toBe(true);

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: {
        email,
        code: requestJson.debugOtpCode
      }
    });

    expect(verifyResponse.statusCode).toBe(200);
    const verifyJson = verifyResponse.json() as {
      token: string;
      user: { id: string; email: string };
      session: { expiresInDays: number };
    };

    expect(typeof verifyJson.token).toBe("string");
    expect(verifyJson.token.length).toBeGreaterThan(20);
    expect(verifyJson.user.email).toBe(email);
    expect(typeof verifyJson.user.id).toBe("string");
    expect(typeof verifyJson.session.expiresInDays).toBe("number");
    expect(verifyJson.session.expiresInDays).toBeGreaterThan(0);

    // The new token must be usable for authenticated requests
    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${verifyJson.token}` }
    });
    expect(meResponse.statusCode).toBe(200);
    const meJson = meResponse.json() as { id: string; email: string };
    expect(meJson.email).toBe(email);
  });

  it("recovery OTP is separate from regular login OTP — each issues an independent session", async () => {
    const email = `recovery-separate-${randomUUID()}@example.com`;

    // Get a regular login token first
    const regularOtpResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-otp",
      payload: { email }
    });
    expect(regularOtpResponse.statusCode).toBe(200);
    const regularOtpJson = regularOtpResponse.json() as { debugOtpCode?: string };

    const regularVerifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-otp",
      payload: { email, code: regularOtpJson.debugOtpCode }
    });
    expect(regularVerifyResponse.statusCode).toBe(200);
    const regularToken = (regularVerifyResponse.json() as { token: string }).token;

    // Now get a recovery token for the same user
    const recoveryOtpResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/request-otp",
      payload: { email }
    });
    expect(recoveryOtpResponse.statusCode).toBe(200);
    const recoveryOtpJson = recoveryOtpResponse.json() as { debugOtpCode?: string };

    const recoveryVerifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: { email, code: recoveryOtpJson.debugOtpCode }
    });
    expect(recoveryVerifyResponse.statusCode).toBe(200);
    const recoveryToken = (recoveryVerifyResponse.json() as { token: string }).token;

    // Tokens must be distinct
    expect(recoveryToken).not.toBe(regularToken);

    // Both tokens must be independently valid
    const meWithRegular = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${regularToken}` }
    });
    expect(meWithRegular.statusCode).toBe(200);

    const meWithRecovery = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${recoveryToken}` }
    });
    expect(meWithRecovery.statusCode).toBe(200);
  });

  it("verify-otp returns 401 when an invalid OTP code is provided", async () => {
    const email = `recovery-invalid-${randomUUID()}@example.com`;

    // Request a real OTP so there is a pending record in the DB
    const requestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/request-otp",
      payload: { email }
    });
    expect(requestResponse.statusCode).toBe(200);

    // Submit a wrong code
    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: {
        email,
        code: "000000"
      }
    });

    expect(verifyResponse.statusCode).toBe(401);
    const errorJson = verifyResponse.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("INVALID_OTP");
  });

  it("verify-otp returns 401 when no OTP was ever requested for that email", async () => {
    const email = `recovery-never-${randomUUID()}@example.com`;

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: {
        email,
        code: "123456"
      }
    });

    expect(verifyResponse.statusCode).toBe(401);
    const errorJson = verifyResponse.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("INVALID_OTP");
  });

  it("request-otp returns 400 on missing email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/request-otp",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    const errorJson = response.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("VALIDATION_ERROR");
  });

  it("request-otp returns 400 on malformed email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/request-otp",
      payload: { email: "not-an-email" }
    });

    expect(response.statusCode).toBe(400);
    const errorJson = response.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("VALIDATION_ERROR");
  });

  it("verify-otp returns 400 on missing email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: { code: "123456" }
    });

    expect(response.statusCode).toBe(400);
    const errorJson = response.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("VALIDATION_ERROR");
  });

  it("verify-otp returns 400 when code does not match 6-digit format", async () => {
    const email = `recovery-badcode-${randomUUID()}@example.com`;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: { email, code: "12" }
    });

    expect(response.statusCode).toBe(400);
    const errorJson = response.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("VALIDATION_ERROR");
  });

  it("OTP cannot be reused after successful verification", async () => {
    const email = `recovery-reuse-${randomUUID()}@example.com`;

    const requestResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/request-otp",
      payload: { email }
    });
    const { debugOtpCode } = requestResponse.json() as { debugOtpCode: string };

    // First use — should succeed
    const firstVerify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: { email, code: debugOtpCode }
    });
    expect(firstVerify.statusCode).toBe(200);

    // Second use of the same code — should fail
    const secondVerify = await app.inject({
      method: "POST",
      url: "/api/v1/auth/recovery/verify-otp",
      payload: { email, code: debugOtpCode }
    });
    expect(secondVerify.statusCode).toBe(401);
    const errorJson = secondVerify.json() as { error: { code: string } };
    expect(errorJson.error.code).toBe("INVALID_OTP");
  });

  it("invalidates an older OTP when a newer OTP is requested", async () => {
    const email = `otp-replaced-${randomUUID()}@example.com`;

    const firstRequest = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-otp",
      payload: { email }
    });
    const firstCode = (firstRequest.json() as { debugOtpCode: string }).debugOtpCode;

    const secondRequest = await app.inject({
      method: "POST",
      url: "/api/v1/auth/request-otp",
      payload: { email }
    });
    const secondCode = (secondRequest.json() as { debugOtpCode: string }).debugOtpCode;

    const oldCodeVerification = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-otp",
      payload: { email, code: firstCode }
    });
    expect(oldCodeVerification.statusCode).toBe(401);

    const currentCodeVerification = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-otp",
      payload: { email, code: secondCode }
    });
    expect(currentCodeVerification.statusCode).toBe(200);
  });
});
