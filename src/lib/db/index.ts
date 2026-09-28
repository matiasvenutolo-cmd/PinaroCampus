import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";

// `prepare: false` es necesario porque DATABASE_URL apunta al pooler de Neon
// (pgbouncer en modo transacción), que no soporta prepared statements.
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
