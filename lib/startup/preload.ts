import { prewarmCore } from "@/lib/startup/prewarm";

export async function preloadCore() {
    await prewarmCore();
}

preloadCore().catch((err) => {
    console.error("[FATAL] Core preload failed:", err);
});

