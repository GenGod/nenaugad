import NextAuth from "next-auth";
import { authOptions } from "../../../../server/auth.ts";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
