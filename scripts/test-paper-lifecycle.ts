import "dotenv/config";

type PassFail = "PASS" | "FAIL";

type FinalResult = {
    equityPartialExitGuard: PassFail;
    equityLifecycle: PassFail;
    futuresPartialExitGuard: PassFail;
    futuresLifecycle: PassFail;
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

type Position = {
    instrumentToken?: string;
    quantity?: number;
};

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_FUTURES_UNDERLYING = "ITC LTD";
const DEFAULT_FUTURES_TOKEN = "NSE_FO|59383";
const DEFAULT_FUTURES_SYMBOL = "ITC FUT 24 FEB 26";
const DEFAULT_EQUITY_QUERY = "RELIANCE";
const DEFAULT_EQUITY_QTY = 10;
const STRESS_LOOPS = 5;

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
    };
}

function toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
    const { token, baseUrl } = parseArgs();
    if (!token) {
        throw new Error("Missing token. Use --token=<authjs.session-token>");
    }

    const cookie = `authjs.session-token=${token}`;
    const result: FinalResult = {
        equityPartialExitGuard: "FAIL",
        equityLifecycle: "FAIL",
        futuresPartialExitGuard: "FAIL",
        futuresLifecycle: "FAIL",
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

    async function getPositions(): Promise<Position[]> {
        const res = await api<{ data?: Position[] }>("/api/v1/positions");
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

    function ensure(condition: boolean, message: string): void {
        if (!condition) throw new Error(message);
    }

    function resolveOrderId(response: { body: OrderResponse }): string {
        const id = response.body?.data?.id;
        if (!id) throw new Error("Order id missing in response");
        return id;
    }

    function isPartialExitRejected(response: {
        ok: boolean;
        status: number;
        body: OrderResponse;
    }): boolean {
        return (
            !response.ok &&
            response.status === 400 &&
            String(response.body?.error?.code || "") === "PARTIAL_EXIT_NOT_ALLOWED"
        );
    }

    // RESET baseline
    const reset = await api<{ success?: boolean }>("/api/v1/user/reset", { method: "POST" });
    ensure(reset.ok && reset.body?.success, `Reset failed (HTTP ${reset.status})`);

    // Resolve equity instrument
    const equitySearch = await api<{ data?: any[] }>(
        `/api/v1/instruments/search?q=${encodeURIComponent(DEFAULT_EQUITY_QUERY)}&mode=EQUITY`
    );
    const equityRows = Array.isArray(equitySearch.body?.data) ? equitySearch.body.data : [];
    const equityInstrument =
        equityRows.find(
            (row) =>
                String(row?.instrumentType || "").toUpperCase() === "EQUITY" &&
                String(row?.segment || "").toUpperCase() === "NSE_EQ"
        ) || equityRows[0];
    ensure(Boolean(equityInstrument?.instrumentToken), "No equity instrument found for test");

    const equitySymbol = String(equityInstrument.symbol || DEFAULT_EQUITY_QUERY);
    const equityToken = String(equityInstrument.instrumentToken);
    const equityQty = DEFAULT_EQUITY_QTY;

    // Resolve futures contract
    const derivativesRes = await api<{ data?: { instruments?: any[] } }>(
        `/api/v1/instruments/derivatives?underlying=${encodeURIComponent(
            DEFAULT_FUTURES_UNDERLYING
        )}&instrumentType=FUTURE`
    );
    const futuresList = Array.isArray(derivativesRes.body?.data?.instruments)
        ? derivativesRes.body.data.instruments
        : [];
    const futuresContract =
        futuresList.find((row) => String(row?.instrumentToken || "") === DEFAULT_FUTURES_TOKEN) ||
        futuresList[0];
    ensure(Boolean(futuresContract?.instrumentToken), "No futures contract found for test");

    const futuresSymbol = String(futuresContract.symbol || DEFAULT_FUTURES_SYMBOL);
    const futuresToken = String(futuresContract.instrumentToken || DEFAULT_FUTURES_TOKEN);
    const futuresQty = Math.max(1, toNumber(futuresContract.lotSize) || 1600);

    // EQUITY FLOW
    {
        const equityBuy = await placeOrder({
            symbol: equitySymbol,
            instrumentToken: equityToken,
            side: "BUY",
            quantity: equityQty,
            orderType: "MARKET",
        });
        ensure(equityBuy.ok && equityBuy.body?.success, "Equity BUY failed");
        ensure(await waitForFilled(resolveOrderId(equityBuy)), "Equity BUY not filled in time");

        const partialSellQty = Math.max(1, Math.floor(equityQty / 2));
        const equityPartial = await placeOrder({
            symbol: equitySymbol,
            instrumentToken: equityToken,
            side: "SELL",
            quantity: partialSellQty,
            orderType: "MARKET",
        });
        ensure(isPartialExitRejected(equityPartial), "Equity partial exit was not rejected");
        result.equityPartialExitGuard = "PASS";

        const equitySell = await placeOrder({
            symbol: equitySymbol,
            instrumentToken: equityToken,
            side: "SELL",
            quantity: equityQty,
            orderType: "MARKET",
        });
        ensure(equitySell.ok && equitySell.body?.success, "Equity full exit order failed");
        ensure(await waitForFilled(resolveOrderId(equitySell)), "Equity full exit not filled in time");
        ensure(await waitUntilFlat(equityToken), "Equity position not closed");

        const wallet = await getWallet();
        ensure(wallet.blockedBalance === 0, "Equity blocked balance not zero after close");
        ensure(Math.abs(wallet.equity - wallet.balance) < 0.01, "Equity wallet not flat after close");
        result.equityLifecycle = "PASS";
    }

    // FUTURES FLOW
    {
        const futuresBuy = await placeOrder({
            symbol: futuresSymbol,
            instrumentToken: futuresToken,
            side: "BUY",
            quantity: futuresQty,
            orderType: "MARKET",
        });
        ensure(futuresBuy.ok && futuresBuy.body?.success, "Futures BUY failed");
        ensure(await waitForFilled(resolveOrderId(futuresBuy)), "Futures BUY not filled in time");

        const partialSellQty = Math.max(1, Math.floor(futuresQty / 2));
        const futuresPartial = await placeOrder({
            symbol: futuresSymbol,
            instrumentToken: futuresToken,
            side: "SELL",
            quantity: partialSellQty,
            orderType: "MARKET",
        });
        ensure(isPartialExitRejected(futuresPartial), "Futures partial exit was not rejected");
        result.futuresPartialExitGuard = "PASS";

        const futuresSell = await placeOrder({
            symbol: futuresSymbol,
            instrumentToken: futuresToken,
            side: "SELL",
            quantity: futuresQty,
            orderType: "MARKET",
        });
        ensure(futuresSell.ok && futuresSell.body?.success, "Futures full exit order failed");
        ensure(await waitForFilled(resolveOrderId(futuresSell)), "Futures full exit not filled in time");
        ensure(await waitUntilFlat(futuresToken), "Futures position not closed");

        const wallet = await getWallet();
        ensure(wallet.blockedBalance === 0, "Futures blocked balance not zero after close");
        ensure(Math.abs(wallet.equity - wallet.balance) < 0.01, "Futures wallet not flat after close");
        result.futuresLifecycle = "PASS";
    }

    // STRESS LOOP: equity + futures
    for (let i = 0; i < STRESS_LOOPS; i += 1) {
        const eqBuy = await placeOrder({
            symbol: equitySymbol,
            instrumentToken: equityToken,
            side: "BUY",
            quantity: equityQty,
            orderType: "MARKET",
        });
        ensure(eqBuy.ok && eqBuy.body?.success, `Stress equity BUY failed on loop ${i + 1}`);
        ensure(await waitForFilled(resolveOrderId(eqBuy)), `Stress equity BUY not filled on loop ${i + 1}`);

        const eqSell = await placeOrder({
            symbol: equitySymbol,
            instrumentToken: equityToken,
            side: "SELL",
            quantity: equityQty,
            orderType: "MARKET",
        });
        ensure(eqSell.ok && eqSell.body?.success, `Stress equity SELL failed on loop ${i + 1}`);
        ensure(await waitForFilled(resolveOrderId(eqSell)), `Stress equity SELL not filled on loop ${i + 1}`);
        ensure(await waitUntilFlat(equityToken), `Stress equity not flat on loop ${i + 1}`);
    }

    for (let i = 0; i < STRESS_LOOPS; i += 1) {
        const fuBuy = await placeOrder({
            symbol: futuresSymbol,
            instrumentToken: futuresToken,
            side: "BUY",
            quantity: futuresQty,
            orderType: "MARKET",
        });
        ensure(fuBuy.ok && fuBuy.body?.success, `Stress futures BUY failed on loop ${i + 1}`);
        ensure(await waitForFilled(resolveOrderId(fuBuy)), `Stress futures BUY not filled on loop ${i + 1}`);

        const fuSell = await placeOrder({
            symbol: futuresSymbol,
            instrumentToken: futuresToken,
            side: "SELL",
            quantity: futuresQty,
            orderType: "MARKET",
        });
        ensure(fuSell.ok && fuSell.body?.success, `Stress futures SELL failed on loop ${i + 1}`);
        ensure(await waitForFilled(resolveOrderId(fuSell)), `Stress futures SELL not filled on loop ${i + 1}`);
        ensure(await waitUntilFlat(futuresToken), `Stress futures not flat on loop ${i + 1}`);
    }

    // FINAL INTEGRITY
    const finalPositions = await getPositions();
    const finalWallet = await getWallet();
    const openOrdersCount = await getOpenOrdersCount();
    const hasOpenPosition = finalPositions.some((p) => Math.abs(toNumber(p.quantity)) > 0);
    const balanceDrift = Math.abs(finalWallet.equity - finalWallet.balance);

    ensure(!hasOpenPosition, "Open positions remain after stress loop");
    ensure(openOrdersCount === 0, "Open orders remain after stress loop");
    ensure(finalWallet.blockedBalance === 0, "Blocked balance not zero after stress loop");
    ensure(balanceDrift < 0.01, `Balance drift too high (${balanceDrift})`);
    result.ledgerIntegrity = "PASS";

    const allPass =
        result.equityPartialExitGuard === "PASS" &&
        result.equityLifecycle === "PASS" &&
        result.futuresPartialExitGuard === "PASS" &&
        result.futuresLifecycle === "PASS" &&
        result.ledgerIntegrity === "PASS";
    result.overallStatus = allPass ? "PASS" : "FAIL";

    console.log(JSON.stringify(result, null, 2));
    process.exit(allPass ? 0 : 1);
}

run().catch((error) => {
    const failed: FinalResult = {
        equityPartialExitGuard: "FAIL",
        equityLifecycle: "FAIL",
        futuresPartialExitGuard: "FAIL",
        futuresLifecycle: "FAIL",
        ledgerIntegrity: "FAIL",
        overallStatus: "FAIL",
    };
    console.error(error instanceof Error ? error.message : "Unknown failure");
    console.log(JSON.stringify(failed, null, 2));
    process.exit(1);
});
