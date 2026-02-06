
import { config } from 'dotenv';
import { type Config } from 'drizzle-kit';

config({ path: '.env' });
config({ path: '.env.local' });

export default {
    schema: './lib/db/schema',
    out: './drizzle',
    dbCredentials: {
        connectionString: process.env.DATABASE_URL!,
    },
};
