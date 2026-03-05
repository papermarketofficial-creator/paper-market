import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use direct (non-pooler) URL for migrations — pooler has DDL limitations
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
});
