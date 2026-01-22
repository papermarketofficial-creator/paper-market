"use server";

import { signIn } from "@/lib/auth";

export async function handleGoogleLogin() {
    await signIn("google", { redirectTo: "/dashboard" });
}
