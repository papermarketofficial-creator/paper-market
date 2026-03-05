
import { config } from "dotenv";
config();
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
    const query = process.argv[2];
    if (!query) {
        console.error("Please provide a SQL query");
        process.exit(1);
    }
    try {
        const res = await db.execute(sql.raw(query));
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
