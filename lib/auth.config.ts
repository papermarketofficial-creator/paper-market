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
            if (session.user) {
                const tokenId = typeof (token as any).id === "string" ? (token as any).id : token.sub;
                if (tokenId) {
                    session.user.id = tokenId;
                }
                const tokenRole = (token as any).role;
                if (typeof tokenRole === "string" && tokenRole.length > 0) {
                    (session.user as any).role = tokenRole;
                }
            }
            return session;
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
            } else if (!(token as any).id && token.sub) {
                (token as any).id = token.sub;
            }
            return token;
        },
    },
} satisfies NextAuthConfig;
