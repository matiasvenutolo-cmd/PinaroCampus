"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireSuperadmin } from "@/lib/auth/permissions";

import {
  PREVIEW_COOKIE_MAX_AGE_SECONDS,
  PREVIEW_COOKIE_NAME,
  signPreviewCookie,
} from "./preview-cookie";

/** Usado desde `/superadmin` ("ver como") y desde el banner de preview en
 * `[domain]/layout.tsx` ("salir"). */
export async function startPreview(slug: string) {
  await requireSuperadmin();
  const token = await signPreviewCookie(slug);
  (await cookies()).set(PREVIEW_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS,
  });
  redirect("/");
}

export async function stopPreview() {
  await requireSuperadmin();
  (await cookies()).delete(PREVIEW_COOKIE_NAME);
  redirect("/superadmin");
}
