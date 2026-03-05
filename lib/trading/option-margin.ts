export const OPTION_SHORT_PREMIUM_MULTIPLIER = 1.5;
export const OPTION_SHORT_UNDERLYING_MARGIN_RATIO = 0.15;

type OptionMarginInput = {
    optionPrice: number;
    underlyingPrice: number;
    quantity: number;
};

function clampPositive(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function calculateLongOptionMargin(optionPrice: number, quantity: number): number {
    const safeOption = clampPositive(optionPrice, 0);
    const safeQty = Math.max(0, Number(quantity) || 0);
    return safeOption * safeQty;
}

export function calculateShortOptionMargin(input: OptionMarginInput): number {
    const safeOption = clampPositive(input.optionPrice, 0);
    const safeUnderlying = clampPositive(input.underlyingPrice, safeOption);
    const safeQty = Math.max(0, Number(input.quantity) || 0);

    const premium = safeOption * safeQty;
    const premiumLeg = premium * OPTION_SHORT_PREMIUM_MULTIPLIER;
    const underlyingLeg = safeUnderlying * safeQty * OPTION_SHORT_UNDERLYING_MARGIN_RATIO;

    return Math.max(premiumLeg, underlyingLeg);
}
