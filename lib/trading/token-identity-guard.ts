type IdentityLookupInput = {
    context: string;
    instrumentToken?: string | null;
    symbol?: string | null;
};

/**
 * Enforces token-only identity lookups on trading-critical paths.
 * In development this throws a descriptive error to catch regressions early.
 */
export function requireInstrumentTokenForIdentityLookup(input: IdentityLookupInput): string {
    const token = String(input.instrumentToken ?? "").trim();
    if (token) return token;

    const symbol = String(input.symbol ?? "").trim();
    const details = symbol ? ` for symbol "${symbol}"` : "";
    const message = `[TOKEN_IDENTITY_GUARD] ${input.context}: symbol-based identity lookup blocked${details}. instrumentToken is required.`;

    if (process.env.NODE_ENV !== "production") {
        throw new Error(message);
    }

    throw new Error("instrumentToken is required for identity lookup");
}
