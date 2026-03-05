import 'dotenv/config';
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const query = `SELECT "tradingsymbol", "name", "instrumentType", "segment", "expiry"
FROM instruments
WHERE "tradingsymbol" ILIKE 'NIFTY%'
  AND "isActive" = true
  AND "segment" = 'NSE_FO'
ORDER BY expiry ASC
LIMIT 10;`;

const res = await client.query(query);
console.log(JSON.stringify(res.rows, null, 2));

await client.end();
