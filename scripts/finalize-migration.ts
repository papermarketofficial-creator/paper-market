/**
 * Finalize migration - set NOT NULL and update constraints
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { sql } from 'drizzle-orm';

async function finalizeMigration() {
    console.log('\n🔧 Finalizing Migration...\n');
    
    try {
        // Step 1: Drop old unique constraint
        console.log('1️⃣ Dropping old unique constraint...');
        await db.execute(sql`DROP INDEX IF EXISTS "positions_userId_symbol_unique"`);
        console.log('✅ Old constraint dropped\n');
        
        // Step 2: Create new unique constraint
        console.log('2️⃣ Creating new unique constraint on (userId, instrumentToken)...');
        await db.execute(sql`
            CREATE UNIQUE INDEX IF NOT EXISTS "positions_userId_instrumentToken_unique" 
            ON positions("userId", "instrumentToken")
        `);
        console.log('✅ New constraint created\n');
        
        // Step 3: Set NOT NULL constraints
        console.log('3️⃣ Setting NOT NULL constraints...');
        await db.execute(sql`ALTER TABLE orders ALTER COLUMN "instrumentToken" SET NOT NULL`);
        console.log('   ✅ orders.instrumentToken NOT NULL');
        
        await db.execute(sql`ALTER TABLE trades ALTER COLUMN "instrumentToken" SET NOT NULL`);
        console.log('   ✅ trades.instrumentToken NOT NULL');
        
        await db.execute(sql`ALTER TABLE positions ALTER COLUMN "instrumentToken" SET NOT NULL`);
        console.log('   ✅ positions.instrumentToken NOT NULL\n');
        
        console.log('🎉 Migration finalized successfully!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Finalization failed:', error.message);
        process.exit(1);
    }
}

finalizeMigration();
