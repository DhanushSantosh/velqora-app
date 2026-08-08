import { describe, expect, it } from "vitest";
import { netWorthAccountCreateSchema, netWorthAccountUpdateSchema } from "./validation.js";

describe("net-worth validation", () => {
  it("validates an asset account payload", () => {
    const payload = netWorthAccountCreateSchema.parse({
      name: "Primary account",
      accountType: "asset",
      subtype: "bank",
      balance: 1250.5,
      currency: "INR"
    });

    expect(payload.balance).toBe(1250.5);
  });

  it("rejects an empty update payload", () => {
    expect(netWorthAccountUpdateSchema.safeParse({}).success).toBe(false);
  });
});
