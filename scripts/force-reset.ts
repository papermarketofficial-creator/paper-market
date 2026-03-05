
import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import ws from 'ws';

// Polyfill WebSocket
if (!globalThis.WebSocket) globalThis.WebSocket = ws as any;

// Manual .env.local parsing to override ANY shell junk
try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const dbLine = envContent.split('\n').find(line => line.trim().startsWith('DATABASE_URL='));
        if (dbLine) {
            // Simple parse: remove 'DATABASE_URL=' and quotes
            let url = dbLine.split('=')[1].trim();
            if (url.startsWith('"') && url.endsWith('"')) {
                url = url.slice(1, -1);
            }
            process.env.DATABASE_URL = url;
        }
    }
} catch (e) {
    console.warn("Could not read .env.local directly, falling back to process.env");
}

async function forceReset() {
    console.log('☢️  Initiating Standalone Nuclear Reset...');
    console.log(`Connecting to: ${process.env.DATABASE_URL?.slice(0, 20)}...`);

    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
        console.error('❌ DATABASE_URL is missing or invalid (still mock?).');
        process.exit(1);
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        console.log('Dropping public schema...');
        // Use tagged template literal syntax
        await sql`DROP SCHEMA public CASCADE`;

        console.log('Recreating public schema...');
        await sql`CREATE SCHEMA public`;
        await sql`GRANT ALL ON SCHEMA public TO postgres`;
        await sql`GRANT ALL ON SCHEMA public TO public`;

        console.log('✅ Database Wiped Successfully.');
        process.exit(0);

    } catch (err: any) {
        console.error('❌ Reset Error:', err);
        process.exit(1);
    }
}

forceReset();
