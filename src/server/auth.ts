import type { DefaultSession, NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { accountExists, authorizeCredentials } from "./users.ts";
import { snapshotPool } from "./storage/snapshots.ts";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "email-password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // The attempt limit and the fixed error codes live in authorizeCredentials (B53).
      authorize: credentials => authorizeCredentials(credentials, snapshotPool),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) {
        session.user = { ...(session.user ?? {}), id: token.sub };
      }
      return session;
    },
  },
};

export type SessionUser = Readonly<{ id: string; email?: string | null }>;

// The single ownership source: every private route resolves the user here.
export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (typeof id !== "string" || id.length === 0) return null;
  // A session is a stateless token that outlives a deleted account: the account is
  // checked on every request, and a lookup that fails counts as no account (B11, owner
  // decision 2026-10-13).
  try {
    if (!await accountExists(snapshotPool(), id)) return null;
  } catch {
    console.error(JSON.stringify({ code: "SESSION_ACCOUNT_CHECK_FAILED" }));
    return null;
  }
  return { id, email: session?.user?.email };
}
