/**
 * Step 0 Cleanup: Delete non-standard instrument types
 */

import 'dotenv/config';
import { db } from '../lib/db';
import { instruments } from '../lib/db/schema';
import { inArray, notInArray, sql } from 'drizzle-orm';

async function main() {
    console.log('🧹 Cleaning up instruments...\n');

    const result = await db.execute(sql`
        DELETE FROM instruments 
        WHERE "instrumentType" NOT IN ('EQUITY', 'FUTURE', 'OPTION', 'INDEX') 
           OR "instrumentType" IS NULL
    `);

    // Drizzle execute result structure varies, checking safety
    console.log(`Deleted non-standard instruments.`);

    // Check duplicates again
    console.log('\n🔍 Verifying Uniqueness...');
    const duplicateSymbols = await db.execute(sql`
        SELECT tradingsymbol, COUNT(*) 
        FROM instruments 
        WHERE "isActive" = true 
        GROUP BY tradingsymbol 
        HAVING COUNT(*) > 1
    `);

    if (duplicateSymbols.rows.length > 0) {
        console.error('❌ Still have duplicates!');
        console.log(JSON.stringify(duplicateSymbols.rows, null, 2));
    } else {
        console.log('✅ Instruments table is now clean.');
    }

    process.exit(0);
}

main();
