"use server";

import { signIn } from "@/lib/auth";

export async function handleGoogleLogin(callbackUrl?: string) {
    await signIn("google", { redirectTo: callbackUrl || "/dashboard" });
}
