import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";

// Force JWT strategy for performance, unless we specifically want DB sessions
// The Drizzle adapter supports both.
export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    }),
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID, // Use process.env directly for optionality/laziness or config.auth
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
    ],
    session: {
        strategy: "jwt",
    },
    secret: config.auth.secret,
});
