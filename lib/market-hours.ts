/**
 * Returns true when regular NSE cash market session is open in IST.
 * Window: Mon-Fri, 09:15 to 15:30 (Asia/Kolkata).
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

    const totalMinutes = hour * 60 + minute;
    const openMinutes = 9 * 60 + 15;
    const closeMinutes = 15 * 60 + 30;

    return totalMinutes >= openMinutes && totalMinutes <= closeMinutes;
}
