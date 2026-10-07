import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type ProfileUpdate = Partial<
  Pick<typeof users.$inferInsert, "firstName" | "lastName" | "name" | "dni">
>;

/** `users` es global (no tiene `tenant_id`), por eso no pasa por tenant-scope;
 * igual vive en `src/lib/` para que nada en `src/app/[domain]/**` toque `db`
 * directo (ver tests/isolation/no-direct-db-import.test.ts). */
export async function updateUserProfile(userId: string, data: ProfileUpdate) {
  await db.update(users).set(data).where(eq(users.id, userId));
}

export async function getUserProfile(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      dni: users.dni,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}
