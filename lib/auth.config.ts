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

            // Redirect logged-in users away from auth pages
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
