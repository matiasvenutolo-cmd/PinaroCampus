import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isSuperadmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    isSuperadmin: boolean;
    firstName: string | null;
    lastName: string | null;
  }
}
