export function toUnixSeconds(timestamp: string | number): number {
    if (typeof timestamp === 'number') {
        return timestamp > 1e12
            ? Math.floor(timestamp / 1000)
            : timestamp;
    }

    return Math.floor(Date.parse(timestamp) / 1000);
}
