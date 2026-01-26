import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { config as appConfig } from "@/lib/config";

// This file must be Edge-compatible (no database adapters here!)
export const authConfig = {
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
    ],
    // Force JWT strategy for performance and Edge compatibility
    session: {
        strategy: "jwt",
    },
    secret: appConfig.auth.secret,
    trustHost: true,
    cookies: {
        sessionToken: {
            name: appConfig.isDev ? "next-auth.session-token" : "__Secure-next-auth.session-token",
            options: {
                httpOnly: true,
                sameSite: "lax",
                path: "/",
                secure: !appConfig.isDev,
            },
        },
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
            const isOnProfile = nextUrl.pathname.startsWith("/profile");
            const isOnAuth = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/signup");

            if (isOnDashboard || isOnProfile) {
                if (isLoggedIn) return true;
                return false; // Redirect to login
            }

            if (isOnAuth) {
                if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
                return true;
            }

            return true;
        },
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        },
    },
} satisfies NextAuthConfig;
