import { z } from "zod";

const currencySchema = z.string().trim().length(3);
const accountTypeSchema = z.enum(["asset", "liability"]);

export const netWorthAccountCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  accountType: accountTypeSchema,
  subtype: z.string().trim().min(1).max(40),
  balance: z.coerce.number().nonnegative().finite(),
  currency: currencySchema.optional(),
  notes: z.string().trim().max(2_000).nullable().optional()
});

export const netWorthAccountUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    accountType: accountTypeSchema.optional(),
    subtype: z.string().trim().min(1).max(40).optional(),
    balance: z.coerce.number().nonnegative().finite().optional(),
    currency: currencySchema.optional(),
    notes: z.string().trim().max(2_000).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const idParamSchema = z.object({
  id: z.string().uuid()
});
