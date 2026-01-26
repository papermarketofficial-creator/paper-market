/**
 * Upstox Token Generator Script
 * 
 * Usage: npx tsx scripts/generate-upstox-token.ts <AUTH_CODE>
 * 
 * This is a dev-only utility that exchanges an Upstox OAuth authorization code
 * for an access token. After running, copy the token to .env as:
 *   UPSTOX_ACCESS_TOKEN=<token>
 * 
 * To get the auth code:
 * 1. Visit: https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_API_KEY&redirect_uri=YOUR_REDIRECT_URI
 * 2. Login with your Upstox credentials
 * 3. Copy the 'code' parameter from the redirect URL
 */

import { z } from "zod";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

// Validate CLI argument
const CodeSchema = z.string().min(10, "Authorization code must be at least 10 characters");

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface ErrorResponse {
    error: string;
    message: string;
}

/**
 * Mask token for safe logging - shows only last 6 characters
 */
function maskToken(token: string): string {
    if (token.length <= 6) return "******";
    return "*".repeat(Math.min(token.length - 6, 20)) + token.slice(-6);
}

async function main(): Promise<void> {
    // 1. Validate required config
    if (!config.upstox.apiKey || !config.upstox.apiSecret || !config.upstox.redirectUri) {
        console.error("❌ ERROR: Upstox credentials not configured in .env");
        console.error("Required: UPSTOX_API_KEY, UPSTOX_API_SECRET, UPSTOX_REDIRECT_URI");
        process.exit(1);
    }

    // 2. Validate CLI argument
    const codeArg = process.argv[2];
    if (!codeArg) {
        console.error("❌ ERROR: Missing authorization code");
        console.error("Usage: npx tsx scripts/generate-upstox-token.ts <AUTH_CODE>");
        console.error("");
        console.error("To get the code, visit:");
        console.error(`https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${config.upstox.apiKey}&redirect_uri=${encodeURIComponent(config.upstox.redirectUri)}`);
        process.exit(1);
    }

    const parseResult = CodeSchema.safeParse(codeArg);
    if (!parseResult.success) {
        console.error("❌ ERROR:", parseResult.error.errors[0].message);
        process.exit(1);
    }

    const code = parseResult.data;

    // 3. Exchange code for token
    logger.info("Exchanging Upstox authorization code...");

    try {
        const tokenUrl = "https://api.upstox.com/v2/login/authorization/token";
        
        const body = new URLSearchParams({
            code,
            client_id: config.upstox.apiKey,
            client_secret: config.upstox.apiSecret,
            redirect_uri: config.upstox.redirectUri,
            grant_type: "authorization_code",
        });

        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorData = await response.json() as ErrorResponse;
            console.error("❌ ERROR: Token exchange failed");
            console.error(`Status: ${response.status}`);
            console.error(`Message: ${errorData.message || errorData.error || "Unknown error"}`);
            process.exit(1);
        }

        const data = await response.json() as TokenResponse;
        const token = data.access_token;

        if (!token) {
            console.error("❌ ERROR: No access_token in response");
            console.error("Response:", JSON.stringify(data, null, 2));
            process.exit(1);
        }

        // 4. Log masked token (safe logging)
        logger.info({ token: maskToken(token) }, "Token received successfully");

        // 5. Print full token for manual copy
        console.log("");
        console.log("✅ SUCCESS: Token obtained!");
        console.log("");
        console.log("Add this to your .env.local file:");
        console.log("─".repeat(50));
        console.log(`UPSTOX_ACCESS_TOKEN=${token}`);
        console.log("─".repeat(50));
        console.log("");
        console.log(`Token expires in: ${Math.floor(data.expires_in / 3600)} hours`);
        console.log("");

    } catch (error) {
        if (error instanceof Error) {
            console.error("❌ ERROR: Network error during token exchange");
            console.error(error.message);
        } else {
            console.error("❌ ERROR: Unknown error occurred");
        }
        process.exit(1);
    }
}

main();
