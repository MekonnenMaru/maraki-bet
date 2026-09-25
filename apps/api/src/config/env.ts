import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(here, "../../../../.env") });
config({ path: resolve(here, "../../.env") });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_ORIGIN: z.string().default("http://localhost:3001"),
  CASHIER_ORIGIN: z.string().default("http://localhost:3002"),
  AGENT_ORIGIN: z.string().default("http://localhost:3003"),
  INTERNAL_TOKEN: z.string().default("change-me"),
  ODDSPAPI_API_KEY: z.string().min(1),
  ODDSPAPI_BASE_URL: z.string().default("https://api.oddspapi.io"),
  ODDSPAPI_WS_URL: z.string().default("wss://v5.oddspapi.io/ws"),
  ODDSPAPI_LANG: z.string().default("en"),
  ODDSPAPI_ENABLE_WS: z
    .string()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  SOURCE_BOOKMAKER: z.string().default("pinnacle+30"),
  HOUSE_MARGIN: z.coerce.number().min(0).max(0.5).default(0.06),
  /** Upcoming fixture horizon in days. Pulled in ≤9-day chunks (OddsPapi sportId limit). */
  FIXTURE_SYNC_DAYS: z.coerce.number().int().min(1).max(60).default(28),
  SPORT_IDS: z
    .string()
    .default("10")
    .transform((value) =>
      value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  CATALOG_SYNC_ON_START: z
    .string()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  ENABLE_ODDSPAPI_POLL: z
    .string()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  ODDSPAPI_POLL_INTERVAL_MS: z.coerce.number().default(30_000),
  MAX_ODDS_TOURNAMENTS: z.coerce.number().default(25),
  ODDS_TOURNAMENT_BATCH_SIZE: z.coerce.number().default(1),
  /** Stop odds pulls after this many consecutive empty bookmaker responses. */
  ODDS_EMPTY_STOP_AFTER: z.coerce.number().default(3),
  ODDS_VERBOSITY: z.coerce.number().default(2),
});

export const env = schema.parse(process.env);
