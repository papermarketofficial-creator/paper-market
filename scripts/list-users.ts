/**
 * List existing users
 */

import 'dotenv/config';
import { db } from '../lib/db/index.js';
import { sql } from 'drizzle-orm';

async function listUsers() {
    const users = await db.execute(sql`SELECT id, email, name FROM users LIMIT 5`);
    console.log('\n📋 Existing Users:\n');
    users.rows.forEach((user, i) => {
        console.log(`${i + 1}. ${user.name || 'No name'} (${user.email}) - ID: ${user.id}`);
    });
    console.log('');
    process.exit(0);
}

listUsers();
