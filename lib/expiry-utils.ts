/**
 * Utility functions for handling NSE Futures & Options expiry dates.
 * * Assumptions: 
 * - expiryDate represents the trading day of expiry.
 * - Calculations are based on the user's local system time (IST typically).
 */

/**
 * Normalizes a date to the start of the day (00:00:00) to ensure accurate day-diff calculations.
 */
const normalizeDate = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Returns true if the expiry date is strictly before today.
 * (i.e., The trading day has completely passed).
 */
export function isExpired(expiryDate: Date): boolean {
  if (!expiryDate) return false;
  const today = normalizeDate(new Date());
  const target = normalizeDate(expiryDate);
  return target.getTime() < today.getTime();
}

/**
 * Returns the number of full days remaining until expiry.
 * - Returns 0 if expired or if it is "Today".
 * - Returns positive integer for future dates.
 */
export function daysToExpiry(expiryDate: Date): number {
  if (!expiryDate) return 0;

  const today = normalizeDate(new Date());
  const target = normalizeDate(expiryDate);

  // Difference in milliseconds
  const diffTime = target.getTime() - today.getTime();

  // Convert to days (ceil is not needed because we normalized to midnight)
  const days = Math.round(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, days);
}

/**
 * Returns true if expiry is Today (0 days) or Tomorrow (1 day).
 * Useful for highlighting urgent positions.
 */
export function isNearExpiry(expiryDate: Date): boolean {
  if (!expiryDate) return false;
  const days = daysToExpiry(expiryDate);
  return days <= 1 && !isExpired(expiryDate);
}

/**
 * Returns a human-friendly label for the expiry status.
 * * Output examples:
 * - "Expired"
 * - "Expires Today"
 * - "D-1" (Tomorrow)
 * - "D-5" (5 days left)
 */
export function formatExpiryLabel(expiryDate: Date): string {
  if (!expiryDate) return '';

  if (isExpired(expiryDate)) {
    return "EXPIRED";
  }



  // If very close (Today/Tomorrow), we might still want text labels
  // But USER asked for "Standard Trader Format" like "25 JAN" everywhere.
  // Standard apps usually show DATE for everything.
  // Exception: Maybe "Today" is helpful.
  // But strict adherence to "25 JAN" is safer.

  // Format: "25 JAN"
  // Ensure we have a valid date object before formatting
  const d = new Date(expiryDate);
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  const parts = formatter.formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;

  return `${day} ${month?.toUpperCase()}`;
}

/**
 * Helper to get a CSS color class based on expiry urgency.
 * (Pure string return, no UI libraries)
 */
export function getExpiryColorClass(expiryDate: Date): string {
  if (isExpired(expiryDate)) return "text-destructive"; // Red
  if (isNearExpiry(expiryDate)) return "text-orange-500"; // Orange/Warning
  return "text-muted-foreground"; // Gray/Neutral
}