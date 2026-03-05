import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const { auth } = NextAuth(authConfig);

// Define protected routes that require authentication
const PROTECTED_ROUTES = [
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

// Define auth routes that should redirect to dashboard if already logged in
const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const path = nextUrl.pathname;

  // 1. API Route Protection (Keep existing logic)
  if (path.startsWith("/api/v1")) {
      if (!isLoggedIn) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const requestHeaders = new Headers(req.headers);
      if (req.auth?.user?.id) {
          requestHeaders.set("x-user-id", req.auth.user.id);
      }

      return NextResponse.next({
          request: {
              headers: requestHeaders,
          },
      });
  }

  // 2. Protected Routes (Redirect to login)
  const isProtectedRoute = PROTECTED_ROUTES.some(route => path.startsWith(route));
  if (isProtectedRoute && !isLoggedIn) {
    const redirectUrl = new URL("/login", nextUrl);
    redirectUrl.searchParams.set("callbackUrl", path); // Remembers where to go back
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Auth Routes (Redirect to trade/dashboard if already logged in)
  const isAuthRoute = AUTH_ROUTES.some(route => path.startsWith(route));
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/trade", nextUrl));
  }

  // Allow all other routes
  return NextResponse.next();
});

export const config = {
    // Include API routes in middleware
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
