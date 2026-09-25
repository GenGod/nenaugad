import type { DefaultSession, NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUserByEmail } from "./users.ts";
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
      async authorize(credentials) {
        const email = typeof credentials?.email === "string"
          ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (email.length === 0 || password.length === 0) return null;
        const user = await findUserByEmail(snapshotPool(), email);
        if (!user) return null;
        const { verifyPassword } = await import("./password.ts");
        if (!verifyPassword(password, user.passwordHash)) return null;
        return { id: user.id, email: user.email };
      },
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
  return typeof id === "string" && id.length > 0 ? { id, email: session?.user?.email } : null;
}
