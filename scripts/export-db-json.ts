import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

// Helper to handle BigInt serialization (common in DBs)
const replacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
};

async function exportData() {
  console.log('⏳ Starting database dump...');
  
  const fullDump: Record<string, any> = {};

  try {
    // 1. Identify all tables from the schema
    // Filter for actual Drizzle table objects
    const tables = Object.entries(schema).filter(([key, value]) => {
      return is(value, PgTable);
    });

    console.log(`📋 Found ${tables.length} tables to export\n`);

    // 2. Export each table
    for (const [tableName, table] of tables) {

      if (table && typeof table === 'object' && 'config' in table) {
         console.log(`📊 Reading table: ${tableName}`);
         // @ts-expect-error
         const data = await db.select().from(table);
         fullDump[tableName] = data;
         console.log(`   ✓ Exported ${data.length} rows`);
      }
    }

    // 3. Write to JSON file
    const outputPath = 'db-dump.json';
    fs.writeFileSync(outputPath, JSON.stringify(fullDump, replacer, 2));

    console.log(`\n✅ Success! Data saved to ${outputPath}`);
    console.log(`📦 Total tables exported: ${Object.keys(fullDump).length}`);
    
    // Print summary
    console.log('\n📊 Export Summary:');
    for (const [tableName, data] of Object.entries(fullDump)) {
      console.log(`   ${tableName}: ${(data as any[]).length} rows`);
    }
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Error exporting data:', error);
    process.exit(1);
  }
}

exportData();
