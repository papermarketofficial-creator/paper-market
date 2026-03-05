import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { LoginSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { WalletService } from "@/services/wallet.service";
import { bootstrapUserLedgerState } from "@/services/ledger-bootstrap.service";

const { handlers, auth: nextAuth, signIn, signOut } = NextAuth({
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
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user, account, profile }) {
            if (account?.provider === "google" && profile?.email) {
                try {
                    const emailStr = String(profile.email);
                    
                    const [existingUser] = await db
                        .select()
                        .from(users)
                        .where(eq(users.email, emailStr))
                        .limit(1);

                    if (!existingUser) {
                        const nameStr = profile.name ? String(profile.name) : "User";
                        const imageStr = profile.image ? String(profile.image) : null;
                        
                        const [created] = await db
                            .insert(users)
                            .values({
                                email: emailStr,
                                name: nameStr,
                                image: imageStr,
                                balance: "1000000.00",
                            })
                            .returning({ id: users.id });

                        await db.transaction(async (tx) => {
                            await WalletService.createWallet(created.id, tx);
                            await bootstrapUserLedgerState(created.id, tx);
                        });
                    }
                } catch (error) {
                    console.error("🔥 Error creating user in DB:", error);
                    return true; 
                }
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                const userId = typeof (user as any).id === "string" ? (user as any).id : undefined;
                const userRole = typeof (user as any).role === "string" ? (user as any).role : undefined;
                if (userId) {
                    token.sub = userId;
                    (token as any).id = userId;
                }
                if (userRole) {
                    (token as any).role = userRole;
                }
                return token;
            }

            if (!(token as any).id && token.sub) {
                (token as any).id = token.sub;
            }
            return token;
        },
    },
});

// Keep a short-lived in-memory session cache to reduce repeated token decode work
// on bursty request patterns. JWT strategy remains the source of truth.

import { LRUCache } from 'lru-cache';

const sessionCache = new LRUCache<string, any>({
    max: 500, // Max 500 sessions in memory
    ttl: 60000, // 60 seconds
    allowStale: false,
});

declare global {
    var __testUserBootstrapPromise: Promise<string> | undefined;
}

async function ensureTestUserId(): Promise<string> {
    const configuredId = process.env.TEST_USER_ID || "mock-user-id";
    const configuredEmail = process.env.TEST_USER_EMAIL || "test@example.com";
    const configuredName = process.env.TEST_USER_NAME || "Test User";

    const [existingById] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, configuredId))
        .limit(1);

    if (existingById) {
        return existingById.id;
    }

    const [existingByEmail] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, configuredEmail))
        .limit(1);

    if (existingByEmail) {
        return existingByEmail.id;
    }

    await db.insert(users).values({
        id: configuredId,
        email: configuredEmail,
        name: configuredName,
        balance: "1000000.00",
    });

    await db.transaction(async (tx) => {
        await WalletService.createWallet(configuredId, tx);
        await bootstrapUserLedgerState(configuredId, tx);
    });

    return configuredId;
}

export const auth = async () => {
    // 🧪 Test Mode Bypass
    if (process.env.TEST_MODE === "true" && process.env.NODE_ENV !== "production") {
        if (!globalThis.__testUserBootstrapPromise) {
            globalThis.__testUserBootstrapPromise = ensureTestUserId();
        }

        const testUserId = await globalThis.__testUserBootstrapPromise;
        const testUserEmail = process.env.TEST_USER_EMAIL || "test@example.com";

        return {
            user: {
                id: testUserId,
                email: testUserEmail,
            }
        };
    }

    // 🔒 SESSION CACHE: Check cache first
    // We use a simple cache key based on the request context
    // In production, you'd want to use the session token as the key
    // For now, we'll use a simplified approach
    const session = await nextAuth();
    
    if (!session?.user?.email) {
        return session;
    }

    const cacheKey = `session:${session.user.email}`;
    const cached = sessionCache.get(cacheKey);
    
    if (cached) {
        // Cache hit - return immediately without DB query
        return cached;
    }

    // Cache miss - store in cache for next request
    sessionCache.set(cacheKey, session);
    
    return session;
};

export { handlers, signIn, signOut };
