import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { config as appConfig } from "@/lib/config";

// This file must be Edge-compatible (no database adapters here!)
export const authConfig = {
    providers: [
        Google({
            clientId: appConfig.auth.google.clientId,
            clientSecret: appConfig.auth.google.clientSecret,
        }),
    ],
    // Force JWT strategy for performance and Edge compatibility
    session: {
        strategy: "jwt",
    },
    secret: appConfig.auth.secret,
    trustHost: true,
    // Let Auth.js v5 use its default cookie names to avoid version conflicts
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnAuth = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/signup");

            // Define all protected routes (requires authentication)
            const protectedRoutes = [
                "/dashboard",
                "/profile",
                "/trade",
                "/wallet",
                "/orders",
                "/positions",
                "/analytics",
                "/watchlist",
                "/journal",
                "/settings",
                "/admin",
            ];

            const isProtectedRoute = protectedRoutes.some(route => 
                nextUrl.pathname.startsWith(route)
            );

            // Protect authenticated routes
            if (isProtectedRoute) {
                if (isLoggedIn) return true;
                return false; // Redirect to login
            }

            return true;
        },
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub;
            }
            return session;
        },
        async jwt({ token, user, profile }) {
            // Initial sign in
            if (user) {
                // If we have a user object, it might come from the 'authorize' credential flow
                // OR it might be the initial Google object. 
                // We need to ensure we have the DB ID.
                token.sub = user.id; 
            }
            
            // For subsequent requests, or if user.id was the Google ID, we should ensure we have the DB ID.
            // But we can't easily access DB here in edge-compatible auth.config.ts?
            // Wait, auth.config.ts is for edge, but we are running Node.js.
            // Actually, we must allow DB access here or we have a problem.
            // 
            // Better approach: In `auth.ts` (which is node-only), we can override the jwt callback?
            // No, `auth.ts` spreads `...authConfig`.
            return token;
        },
    },
} satisfies NextAuthConfig;
