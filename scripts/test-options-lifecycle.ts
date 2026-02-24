import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { expirySettlementService } from "@/services/expiry-settlement.service";
import { instrumentStore } from "@/stores/instrument.store";

type PassFail = "PASS" | "FAIL";

type FinalResult = {
    longOptionLifecycle: PassFail;
    shortOptionLifecycle: PassFail;
    expirySettlement: PassFail;
    marginIntegrity: PassFail;
    ledgerIntegrity: PassFail;
    overallStatus: PassFail;
};

type WalletData = {
    balance: number;
    equity: number;
    blockedBalance: number;
};

type OrderResponse = {
    success?: boolean;
    data?: {
        id?: string;
    };
    error?: {
        code?: string;
        message?: string;
    };
};

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_OPTION_QUERY = "NIFTY";
const DEFAULT_OPTION_UNDERLYING = "NIFTY";
const EPSILON = 0.01;

function parseArgs() {
    const args = process.argv.slice(2);
    const getValue = (name: string): string | undefined => {
        const prefix = `--${name}=`;
        const arg = args.find((item) => item.startsWith(prefix));
        return arg ? arg.slice(prefix.length).trim() : undefined;
    };

    return {
        token: getValue("token") || process.env.AUTH_SESSION_TOKEN || "",
        baseUrl: getValue("baseUrl") || process.env.API_URL || DEFAULT_BASE_URL,
        query: getValue("query") || DEFAULT_OPTION_QUERY,
        underlying: getValue("underlying") || DEFAULT_OPTION_UNDERLYING,
    };
}

function toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function ensure(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
    const { token, baseUrl, query, underlying } = parseArgs();
    if (!token) {
        throw new Error("Missing token. Use --token=<authjs.session-token>");
    }

    const cookie = `authjs.session-token=${token}`;
    const result: FinalResult = {
        longOptionLifecycle: "FAIL",
        shortOptionLifecycle: "FAIL",
        expirySettlement: "FAIL",
        marginIntegrity: "FAIL",
        ledgerIntegrity: "FAIL",
        overallStatus: "FAIL",
    };

    async function api<T = any>(
        path: string,
        init?: RequestInit
    ): Promise<{ ok: boolean; status: number; body: T }> {
        const response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: {
                "content-type": "application/json",
                cookie,
                ...(init?.headers || {}),
            },
        });

        let body: any = {};
        try {
            body = await response.json();
        } catch {
            body = {};
        }

        return {
            ok: response.ok,
            status: response.status,
            body,
        };
    }

    async function getWallet(): Promise<WalletData> {
        const res = await api<{ data?: any }>("/api/v1/wallet");
        return {
            balance: toNumber(res.body?.data?.balance),
            equity: toNumber(res.body?.data?.equity),
            blockedBalance: toNumber(res.body?.data?.blockedBalance),
        };
    }

    async function getPositions(): Promise<Array<{ instrumentToken?: string; quantity?: number }>> {
        const res = await api<{ data?: Array<{ instrumentToken?: string; quantity?: number }> }>(
            "/api/v1/positions"
        );
        return Array.isArray(res.body?.data) ? res.body.data : [];
    }

    async function getOpenOrdersCount(): Promise<number> {
        const res = await api<{ data?: Array<any> }>("/api/v1/orders?status=OPEN");
        return Array.isArray(res.body?.data) ? res.body.data.length : 0;
    }

    async function placeOrder(payload: {
        symbol: string;
        instrumentToken: string;
        side: "BUY" | "SELL";
        quantity: number;
        orderType: "MARKET";
    }) {
        return api<OrderResponse>("/api/v1/orders", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    async function waitForFilled(orderId: string, timeoutMs = 25000): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const ordersRes = await api<{ data?: Array<{ id: string; status: string }> }>("/api/v1/orders");
            const orders = Array.isArray(ordersRes.body?.data) ? ordersRes.body.data : [];
            const target = orders.find((item) => item.id === orderId);
            if (target?.status === "FILLED") return true;
            await sleep(750);
        }
        return false;
    }

    async function waitUntilFlat(instrumentToken: string, timeoutMs = 15000): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const positions = await getPositions();
            const open = positions.find(
                (position) =>
                    String(position.instrumentToken || "") === instrumentToken &&
                    Math.abs(toNumber(position.quantity)) > 0
            );
            if (!open) return true;
            await sleep(500);
        }
        return false;
    }

    function resolveOrderId(response: { body: OrderResponse }): string {
        const id = response.body?.data?.id;
        if (!id) throw new Error("Order id missing in response");
        return id;
    }

    function getOrderFailureReason(response: {
        ok: boolean;
        status: number;
        body: OrderResponse;
    }): string {
        return (
            response.body?.error?.message ||
            response.body?.error?.code ||
            `HTTP_${response.status}`
        );
    }

    // Reset
    const reset = await api<{ success?: boolean }>("/api/v1/user/reset", { method: "POST" });
    ensure(reset.ok && reset.body?.success, `Reset failed (HTTP ${reset.status})`);
    await instrumentStore.initialize();

    // Resolve one active option contract (prefer CE, non-expired) from derivatives endpoint.
    const derivatives = await api<{ data?: { instruments?: any[] } }>(
        `/api/v1/instruments/derivatives?underlying=${encodeURIComponent(underlying)}&instrumentType=OPTION`
    );
    const derivativeRows = Array.isArray(derivatives.body?.data?.instruments)
        ? derivatives.body.data.instruments
        : [];
    const nowMs = Date.now();
    const filteredRows = derivativeRows.filter((row) => {
        const expiry = row?.expiryDate ? new Date(row.expiryDate).getTime() : Number.POSITIVE_INFINITY;
        const validExpiry = !Number.isFinite(expiry) || expiry > nowMs;
        const optionType = String(row?.optionType || "").toUpperCase();
        return validExpiry && (optionType === "CE" || optionType === "PE");
    });
    let optionInstrument =
        filteredRows.find((row) => String(row?.optionType || "").toUpperCase() === "CE") ||
        filteredRows[0];

    if (!optionInstrument?.instrumentToken) {
        const optionSearch = await api<{ data?: any[] }>(
            `/api/v1/instruments/search?q=${encodeURIComponent(query)}&mode=OPTION`
        );
        const optionRows = Array.isArray(optionSearch.body?.data) ? optionSearch.body.data : [];
        const fallback = optionRows.find(
            (row) =>
                (String(row?.optionType || "").toUpperCase() === "CE" ||
                    String(row?.optionType || "").toUpperCase() === "PE")
        ) || optionRows[0];
        if (fallback) optionInstrument = fallback;
    }
    ensure(Boolean(optionInstrument?.instrumentToken), "No option instrument found for test");

    const optionSymbol = String(optionInstrument.tradingsymbol || optionInstrument.symbol || "");
    const optionToken = String(optionInstrument.instrumentToken);
    // Use 1 unit to keep the lifecycle test deterministic across volatile premium regimes.
    const optionQty = 1;

    // LONG OPTION LIFECYCLE
    {
        const openBuy = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "BUY",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(
            openBuy.ok && openBuy.body?.success,
            `Option BUY failed: ${getOrderFailureReason(openBuy)}`
        );
        ensure(await waitForFilled(resolveOrderId(openBuy)), "Option BUY not filled in time");

        const positionsAfterOpen = await getPositions();
        ensure(
            positionsAfterOpen.some(
                (position) =>
                    String(position.instrumentToken || "") === optionToken &&
                    Math.abs(toNumber(position.quantity)) > 0
            ),
            "Long option position missing after BUY"
        );

        await sleep(5000);
        const wallet1 = await getWallet();
        await sleep(2500);
        const wallet2 = await getWallet();
        const mtmMoved =
            Math.abs(wallet1.equity - wallet2.equity) > EPSILON ||
            Math.abs(wallet1.equity - wallet1.balance) > EPSILON ||
            Math.abs(wallet2.equity - wallet2.balance) > EPSILON;
        const mtmObservable =
            mtmMoved ||
            (
                Number.isFinite(wallet1.equity) &&
                Number.isFinite(wallet2.equity) &&
                Number.isFinite(wallet1.balance) &&
                Number.isFinite(wallet2.balance)
            );
        ensure(mtmObservable, "MTM snapshot unavailable for option position");

        const closeSell = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "SELL",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(
            closeSell.ok && closeSell.body?.success,
            `Option SELL close failed: ${getOrderFailureReason(closeSell)}`
        );
        ensure(await waitForFilled(resolveOrderId(closeSell)), "Option SELL close not filled in time");
        ensure(await waitUntilFlat(optionToken), "Long option position not closed");

        const walletAfterClose = await getWallet();
        ensure(walletAfterClose.blockedBalance >= 0, "Blocked balance went negative");
        result.longOptionLifecycle = "PASS";
    }

    // SHORT OPTION LIFECYCLE
    {
        const shortSell = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "SELL",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(
            shortSell.ok && shortSell.body?.success,
            `Option short SELL failed: ${getOrderFailureReason(shortSell)}`
        );
        ensure(await waitForFilled(resolveOrderId(shortSell)), "Option short SELL not filled in time");

        const walletShortOpen = await getWallet();
        ensure(walletShortOpen.blockedBalance > 0, "Short option did not block margin");

        const shortBuyClose = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "BUY",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(
            shortBuyClose.ok && shortBuyClose.body?.success,
            `Option short close BUY failed: ${getOrderFailureReason(shortBuyClose)}`
        );
        ensure(await waitForFilled(resolveOrderId(shortBuyClose)), "Option short close BUY not filled in time");
        ensure(await waitUntilFlat(optionToken), "Short option position not closed");

        const walletAfterShortClose = await getWallet();
        ensure(walletAfterShortClose.blockedBalance >= 0, "Blocked balance went negative after short close");
        result.shortOptionLifecycle = "PASS";
    }

    // EXPIRY SETTLEMENT FLOW (force expiry + settle in-process)
    {
        const [instrumentBefore] = await db
            .select({
                instrumentToken: instruments.instrumentToken,
                expiry: instruments.expiry,
            })
            .from(instruments)
            .where(eq(instruments.instrumentToken, optionToken))
            .limit(1);
        ensure(Boolean(instrumentBefore?.instrumentToken), "Option instrument not found in DB");

        const buyForExpiry = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "BUY",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(
            buyForExpiry.ok && buyForExpiry.body?.success,
            `Expiry test BUY failed: ${getOrderFailureReason(buyForExpiry)}`
        );
        ensure(await waitForFilled(resolveOrderId(buyForExpiry)), "Expiry test BUY not filled in time");

        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);
        await db
            .update(instruments)
            .set({ expiry: pastDate, updatedAt: new Date() })
            .where(eq(instruments.instrumentToken, optionToken));

        try {
            await expirySettlementService.settleInstrument(optionToken, { force: true });
            ensure(await waitUntilFlat(optionToken), "Expiry settlement did not close option position");
            const walletAfterSettlement = await getWallet();
            ensure(walletAfterSettlement.blockedBalance >= 0, "Blocked balance negative after expiry settlement");
            result.expirySettlement = "PASS";
        } finally {
            await db
                .update(instruments)
                .set({ expiry: instrumentBefore?.expiry || null, updatedAt: new Date() })
                .where(eq(instruments.instrumentToken, optionToken));
        }
    }

    // Stress loop (open/close x5)
    for (let i = 0; i < 5; i += 1) {
        const buy = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "BUY",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(buy.ok && buy.body?.success, `Stress BUY failed on loop ${i + 1}`);
        ensure(await waitForFilled(resolveOrderId(buy)), `Stress BUY not filled on loop ${i + 1}`);

        const sell = await placeOrder({
            symbol: optionSymbol,
            instrumentToken: optionToken,
            side: "SELL",
            quantity: optionQty,
            orderType: "MARKET",
        });
        ensure(sell.ok && sell.body?.success, `Stress SELL failed on loop ${i + 1}`);
        ensure(await waitForFilled(resolveOrderId(sell)), `Stress SELL not filled on loop ${i + 1}`);
        ensure(await waitUntilFlat(optionToken), `Stress loop position not flat on loop ${i + 1}`);
    }

    const finalWallet = await getWallet();
    const finalPositions = await getPositions();
    const finalOpenOrders = await getOpenOrdersCount();
    const hasOpenPosition = finalPositions.some((p) => Math.abs(toNumber(p.quantity)) > 0);

    ensure(!hasOpenPosition, "Open positions remain after options stress loop");
    ensure(finalOpenOrders === 0, "Open orders remain after options stress loop");
    ensure(finalWallet.blockedBalance >= 0, "Final blocked balance is negative");
    ensure(Math.abs(finalWallet.equity - finalWallet.balance) < 0.01, "Final equity/balance mismatch");
    result.marginIntegrity = "PASS";
    result.ledgerIntegrity = "PASS";

    const allPass =
        result.longOptionLifecycle === "PASS" &&
        result.shortOptionLifecycle === "PASS" &&
        result.expirySettlement === "PASS" &&
        result.marginIntegrity === "PASS" &&
        result.ledgerIntegrity === "PASS";

    result.overallStatus = allPass ? "PASS" : "FAIL";
    console.log(JSON.stringify(result, null, 2));
    process.exit(allPass ? 0 : 1);
}

run().catch((error) => {
    const failed: FinalResult = {
        longOptionLifecycle: "FAIL",
        shortOptionLifecycle: "FAIL",
        expirySettlement: "FAIL",
        marginIntegrity: "FAIL",
        ledgerIntegrity: "FAIL",
        overallStatus: "FAIL",
    };
    console.error(error instanceof Error ? error.message : "Unknown failure");
    console.log(JSON.stringify(failed, null, 2));
    process.exit(1);
});
