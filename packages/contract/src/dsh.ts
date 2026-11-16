import { z } from "zod";

export const dshIdentitySchema = z.object({
  name: z.string().min(1).max(80),
  persona: z.string().max(4000),
  personality: z.string().max(2000),
  communicationStyle: z.string().max(1000),
  instructions: z.string().max(8000),
});
export type DshIdentity = z.infer<typeof dshIdentitySchema>;

// State returned by the local DeepSeek Agent bridge.
export const dshStateSchema = z.object({
  session: z.object({
    name: z.string(),
    found: z.boolean(),
    hardware: z.string().nullable(),
    status: z.string().nullable(),
  }),
  installed: z.boolean(),
  snapshot: z.boolean(),
  drive: z.boolean(),
  running: z.boolean(),
  hasKey: z.boolean(),
  baseUrl: z.string(),
  model: z.string(),
  identity: dshIdentitySchema.default({
    name: "DeepSeek Agent",
    persona: "",
    personality: "",
    communicationStyle: "",
    instructions: "",
  }),
  url: z.string().nullable(),
});
export type DshState = z.infer<typeof dshStateSchema>;

export const dshQqbotStateSchema = z.object({
  phase: z.enum(["starting", "waiting", "saving", "failed", "bound"]),
  url: z.string().optional(),
  qrSvg: z.string().optional(),
  issuedAt: z.number().optional(),
  appId: z.string().optional(),
  reason: z.string().optional(),
  health: z
    .object({
      bound: z.boolean(),
      appId: z.string().optional(),
      valid: z.boolean(),
      online: z.boolean(),
      error: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type DshQqbotState = z.infer<typeof dshQqbotStateSchema>;
