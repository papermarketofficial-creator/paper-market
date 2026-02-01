import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { LoginSchema } from "@/lib/validation/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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
                        
                        await db.insert(users).values({
                            email: emailStr,
                            name: nameStr,
                            image: imageStr,
                            balance: "1000000.00",
                        });
                    }
                } catch (error) {
                    console.error("🔥 Error creating user in DB:", error);
                    return true; 
                }
            }
            return true;
        },
        async jwt({ token, user, trigger, session }) {
            // console.log("🔒 JWT Callback Triggered. Email:", token.email);
            if (token.email) {
                const [dbUser] = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, token.email))
                    .limit(1);
                
                if (dbUser) {
                    // console.log("✅ Found DB User for JWT. ID:", dbUser.id);
                    token.sub = dbUser.id;
                } else {
                    console.log("❌ No DB User found for email:", token.email);
                }
            }
            return token;
        },
    },
});

export const auth = async () => {
    // 🧪 Test Mode Bypass
    if (process.env.TEST_MODE === "true" && process.env.NODE_ENV !== "production") {
        return {
            user: {
                id: process.env.TEST_USER_ID || "mock-user-id",
                email: "test@example.com",
            }
        };
    }
    return nextAuth();
};

export { handlers, signIn, signOut };