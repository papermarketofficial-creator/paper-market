import "dotenv/config";
import { db } from "@/lib/db";
import { instruments, orders, positions, wallets, trades } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";

async function run() {
    const [instTotal] = await db.select({ n: sql`count(*)` }).from(instruments);
    const [optsTotal] = await db.select({ n: sql`count(*)` }).from(instruments)
        .where(sql`"instrumentType" = 'OPTION' AND "isActive" = true`);
    const [niftyOpts] = await db.select({ n: sql`count(*)` }).from(instruments)
        .where(sql`"underlying" = 'NIFTY' AND "instrumentType" = 'OPTION' AND "isActive" = true`);
    const [bnOpts] = await db.select({ n: sql`count(*)` }).from(instruments)
        .where(sql`"underlying" = 'BANKNIFTY' AND "instrumentType" = 'OPTION' AND "isActive" = true`);
    const [niftyCE] = await db.select({ n: sql`count(*)` }).from(instruments)
        .where(sql`"underlying" = 'NIFTY' AND "optionType" = 'CE' AND "isActive" = true`);
    const [niftyPE] = await db.select({ n: sql`count(*)` }).from(instruments)
        .where(sql`"underlying" = 'NIFTY' AND "optionType" = 'PE' AND "isActive" = true`);

    const expiries = await db.selectDistinct({ expiry: instruments.expiry })
        .from(instruments)
        .where(sql`"underlying" = 'NIFTY' AND "instrumentType" = 'OPTION' AND "isActive" = true AND "expiry" > NOW() + interval '1 day'`)
        .orderBy(instruments.expiry).limit(5);

    const sampleContracts = await db.select({
        sym: instruments.tradingsymbol,
        token: instruments.instrumentToken,
        strike: instruments.strike,
        type: instruments.optionType,
        expiry: instruments.expiry,
        lot: instruments.lotSize
    }).from(instruments)
        .where(sql`"underlying" = 'NIFTY' AND "instrumentType" = 'OPTION' AND "isActive" = true AND "expiry" > NOW() + interval '1 day'`)
        .orderBy(instruments.expiry, instruments.strike)
        .limit(4);

    const [wallet] = await db.select().from(wallets).limit(1);

    const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10);
    const filledOrders = recentOrders.filter((o) => o.status === "FILLED");
    const openOrders = recentOrders.filter((o) => o.status === "OPEN");
    const optionOrders = recentOrders.filter((o) =>
        o.symbol?.includes(" CE ") || o.symbol?.includes(" PE ")
    );

    const [optOrdersFilled] = await db.select({ n: sql`count(*)` }).from(orders)
        .where(sql`status = 'FILLED' AND (symbol LIKE '% CE %' OR symbol LIKE '% PE %')`);

    const activePositions = await db.select().from(positions)
        .where(sql`"quantity" != 0`).limit(5);
    const closedPositions = await db.select().from(positions)
        .where(sql`"quantity" = 0 AND "realizedPnL" IS NOT NULL`).limit(5);

    const recentTrades = await db.select().from(trades).orderBy(desc(trades.executedAt)).limit(5);

    const snapshot = {
        instruments: {
            total: Number(instTotal.n),
            activeOptions: Number(optsTotal.n),
            niftyOptions: Number(niftyOpts.n),
            bankNiftyOptions: Number(bnOpts.n),
            niftyCalled: Number(niftyCE.n),
            niftyPut: Number(niftyPE.n),
            niftyFutureExpiries: expiries.map((e) => e.expiry?.toISOString().slice(0, 10)),
            sampleFutureContracts: sampleContracts.map((c) => ({
                sym: c.sym,
                token: c.token,
                strike: c.strike,
                type: c.type,
                expiry: c.expiry?.toISOString().slice(0, 10),
                lot: c.lot,
            })),
        },
        wallet: wallet
            ? {
                balance: Number(wallet.balance),
                equity: Number(wallet.equity),
                blockedBalance: Number(wallet.blockedBalance),
                marginStatus: wallet.marginStatus,
            }
            : null,
        orders: {
            recentTotal: recentOrders.length,
            filled: filledOrders.length,
            open: openOrders.length,
            optionOrdersFilled: Number(optOrdersFilled.n),
            recentOptionOrders: optionOrders.slice(0, 3).map((o) => ({
                sym: o.symbol,
                side: o.side,
                status: o.status,
                type: o.orderType,
                price: o.executionPrice,
            })),
        },
        positions: {
            active: activePositions.length,
            closedWithPnL: closedPositions.length,
            activeSample: activePositions.slice(0, 3).map((p) => ({
                sym: p.symbol,
                qty: p.quantity,
                avg: p.averagePrice,
                realizedPnL: p.realizedPnL,
            })),
        },
        trades: {
            count: recentTrades.length,
            sample: recentTrades.slice(0, 3).map((t) => ({
                sym: t.symbol,
                side: t.side,
                qty: t.quantity,
                price: t.price,
                execAt: t.executedAt?.toISOString().slice(0, 19),
            })),
        },
    };

    console.log(JSON.stringify(snapshot, null, 2));
    process.exit(0);
}

run().catch((e) => {
    console.error("FAIL:", e.message);
    process.exit(1);
});
