import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
    const isOnProfile = req.nextUrl.pathname.startsWith("/profile");
    const isOnAuth = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/signup");

    if (isOnDashboard || isOnProfile) {
        if (isLoggedIn) return NextResponse.next();
        return NextResponse.redirect(new URL("/login", req.nextUrl));
    }

    if (isOnAuth) {
        if (isLoggedIn) return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
        return NextResponse.next();
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
