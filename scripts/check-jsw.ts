// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

async function checkJSWToken() {
    try {
        const result = await db.select().from(instruments).where(eq(instruments.tradingsymbol, "JSWSTEEL"));
        logger.info({ result }, "JSWSTEEL Record");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkJSWToken();
