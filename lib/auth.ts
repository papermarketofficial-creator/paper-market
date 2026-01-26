import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { LoginSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

// This file handles server-side auth with JWT strategy
// Database adapter is REMOVED because we're using JWT sessions (not database sessions)
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        ...authConfig.providers,
        Credentials({
            async authorize(credentials) {
                const validated = LoginSchema.safeParse(credentials);
                if (!validated.success) return null;

                const { email, password } = validated.data;

                const [user] = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, email))
                    .limit(1);

                if (!user || !user.password) return null;

                const passwordsMatch = await compare(password, user.password);
                if (!passwordsMatch) return null;

                return user;
            }
        })
    ],
    // REMOVED: adapter configuration (conflicts with JWT strategy)
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user, account, profile }) {
            // For OAuth providers, create user in database if they don't exist
            if (account?.provider === "google" && profile?.email) {
                const emailStr = String(profile.email);
                
                const [existingUser] = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, emailStr))
                    .limit(1);

                if (!existingUser) {
                    // Create new user  
                    const nameStr = profile.name ? String(profile.name) : "User";
                    const imageStr = profile.image ? String(profile.image) : null;
                    
                    await db.insert(users).values({
                        email: emailStr,
                        name: nameStr,
                        image: imageStr,
                        balance: "1000000.00",
                    });
                }
            }
            return true;
        },
    },
});

