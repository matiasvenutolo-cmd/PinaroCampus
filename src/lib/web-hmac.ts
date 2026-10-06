import { env } from "@/env";

// HMAC-SHA256 con Web Crypto (no Node `crypto`/`Buffer`): se usa desde el
// proxy, que también tiene que poder verificar firmas.
function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.PREVIEW_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function hmacBase64Url(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload),
  );
  return toBase64Url(signature);
}
