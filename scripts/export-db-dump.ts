
import 'dotenv/config';
import fs from 'fs';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

async function exportAllTables() {
  const fullDump: Record<string, any[]> = {};

  console.log("⏳ Starting export...");

  // Iterate over all keys in your schema object
  for (const [key, value] of Object.entries(schema)) {
    // Check if the exported value is actually a Drizzle table definition
    // Simple heuristic: check if it has 'pgTable' related properties or we can try to select from it
    try {
      // @ts-ignore - We are dynamically querying
      if (value && typeof value === 'object' && 'title' in value === false) { // Basic check to avoid types/helpers
        const tableData = await db.select().from(value as any);
         if (tableData) {
            fullDump[key] = tableData;
            console.log(`✅ Exported table: ${key} (${tableData.length} rows)`);
         }
      }
    } catch (error) {
      // Ignore relations or non-table exports
      // console.log(`⚠️ Skipping ${key} (not a standard table or error: ${error})`);
    }
  }

  // Write to a single JSON file
  fs.writeFileSync('full_database_dump.json', JSON.stringify(fullDump, null, 2));
  console.log("🎉 Done! Saved to full_database_dump.json");
  process.exit(0);
}

exportAllTables();
