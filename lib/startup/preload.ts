import { instrumentRepository } from "@/lib/instruments/repository";

export async function preloadCore() {
  await instrumentRepository.initialize();
}

preloadCore().catch((err) => {
  console.error("[FATAL] Instrument repository preload failed:", err);
});
