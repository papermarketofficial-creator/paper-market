import 'dotenv/config';
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const query = `SELECT "tradingsymbol", "name", "instrumentType", "expiry"
FROM instruments
WHERE "tradingsymbol" ILIKE 'NIFTY%'
  AND "isActive" = true
  AND "segment" = 'NSE_FO'
  AND "instrumentType" = 'FUTURE'
ORDER BY expiry ASC
LIMIT 5;`;

const res = await client.query(query);
console.log(JSON.stringify(res.rows, null, 2));

await client.end();
