// ═══════════════════════════════════════════════════════════
// ⏱️ DEBOUNCE UTILITY (PHASE 4: Rate Limit Protection)
// ═══════════════════════════════════════════════════════════
// WHY: Rapid symbol switching triggers burst API calls.
// Without debounce → RELIANCE, INFY, TCS, HDFC = 4 calls in 1s.
// With 300ms debounce → Only HDFC fires (last symbol).
//
// CRITICAL: This protects against broker rate limits and quota exhaustion.
// ═══════════════════════════════════════════════════════════

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}
