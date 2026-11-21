import { z } from "zod";

// World setting, in the same outline as the anify world documents. Every
// field is optional so a half-filled template still saves.
export const dshWorldSchema = z.object({
  name: z.string().max(80).default(""),
  summary: z.string().max(2000).default(""),
  era: z.string().max(2000).default(""),
  geography: z.string().max(4000).default(""),
  factions: z.string().max(4000).default(""),
  rules: z.string().max(4000).default(""),
  arc: z.string().max(4000).default(""),
});
export type DshWorld = z.infer<typeof dshWorldSchema>;

// One inhabitant of that world. The fields mirror the anify character sheets:
// identity, appearance, temperament, voice, ties, and what they hide.
export const dshWorldCharacterSchema = z.object({
  name: z.string().max(80).default(""),
  role: z.string().max(200).default(""),
  appearance: z.string().max(1000).default(""),
  personality: z.string().max(1000).default(""),
  speech: z.string().max(1000).default(""),
  relations: z.string().max(1000).default(""),
  secret: z.string().max(1000).default(""),
});
export type DshWorldCharacter = z.infer<typeof dshWorldCharacterSchema>;

export const EMPTY_WORLD: DshWorld = {
  name: "",
  summary: "",
  era: "",
  geography: "",
  factions: "",
  rules: "",
  arc: "",
};

export const EMPTY_WORLD_CHARACTER: DshWorldCharacter = {
  name: "",
  role: "",
  appearance: "",
  personality: "",
  speech: "",
  relations: "",
  secret: "",
};

export const dshIdentitySchema = z.object({
  name: z.string().min(1).max(80),
  persona: z.string().max(4000),
  personality: z.string().max(2000),
  communicationStyle: z.string().max(1000),
  instructions: z.string().max(8000),
  world: dshWorldSchema.default(EMPTY_WORLD),
  characters: z.array(dshWorldCharacterSchema).max(20).default([]),
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
  // The Drive archive of the DSH home: sessions, profiles and memories.
  history: z
    .object({
      fileId: z.string().nullable(),
      savedAt: z.number().nullable(),
    })
    .default({ fileId: null, savedAt: null }),
  running: z.boolean(),
  hasKey: z.boolean(),
  baseUrl: z.string(),
  model: z.string(),
  // Whether the agent gets the image MCP tool, so it can start the Colab GPU
  // session from a chat message.
  imageGeneration: z.boolean().default(true),
  identity: dshIdentitySchema.default({
    name: "DeepSeek Agent",
    persona: "",
    personality: "",
    communicationStyle: "",
    instructions: "",
    world: EMPTY_WORLD,
    characters: [],
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
