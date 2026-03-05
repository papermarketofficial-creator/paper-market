const HOLIDAY_ENV_KEYS = ["NSE_TRADING_HOLIDAYS_IST", "NSE_CLOSED_DATES_IST"] as const;

function parseHolidayList(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
}

function loadHolidaySet(): Set<string> {
    const holidays = new Set<string>();
    for (const key of HOLIDAY_ENV_KEYS) {
        const raw = process.env[key];
        for (const dateKey of parseHolidayList(raw)) {
            holidays.add(dateKey);
        }
    }
    return holidays;
}

const MARKET_HOLIDAYS_IST = loadHolidaySet();

export function getIstDateKey(now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);

    const year = parts.find((p) => p.type === "year")?.value ?? "0000";
    const month = parts.find((p) => p.type === "month")?.value ?? "00";
    const day = parts.find((p) => p.type === "day")?.value ?? "00";

    return `${year}-${month}-${day}`;
}

export function isTradingHolidayIST(now: Date = new Date()): boolean {
    return MARKET_HOLIDAYS_IST.has(getIstDateKey(now));
}

/**
 * Returns true when regular NSE cash market session is open in IST.
 * Window: Mon-Fri, 09:15 to 15:30 (Asia/Kolkata), excluding configured holidays.
 */
export function isMarketOpenIST(now: Date = new Date()): boolean {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === "weekday")?.value || "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");

    if (weekday === "Sat" || weekday === "Sun") return false;
    if (isTradingHolidayIST(now)) return false;

    const totalMinutes = hour * 60 + minute;
    const openMinutes = 9 * 60 + 15;
    const closeMinutes = 15 * 60 + 30;

    return totalMinutes >= openMinutes && totalMinutes <= closeMinutes;
}
