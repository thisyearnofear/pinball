/**
 * Per-address rate limiting for score signature requests
 * Prevents spam/abuse from individual players
 */
export class AddressRateLimiter {
    store = new Map();
    maxRequests;
    windowMs;
    /**
     * Create a new address rate limiter
     * @param maxRequests - Maximum requests allowed per window
     * @param windowMs - Time window in milliseconds (default: 5 minutes)
     */
    constructor(maxRequests = 3, windowMs = 5 * 60 * 1000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        // Cleanup old entries every minute to prevent memory leaks
        setInterval(() => this.cleanup(), 60 * 1000);
    }
    /**
     * Check if address is rate limited
     * @returns { allowed: boolean, remaining: number, resetAt: number }
     */
    isAllowed(address) {
        const now = Date.now();
        const entry = this.store.get(address);
        // No entry or window expired - allow new request
        if (!entry || now >= entry.resetTime) {
            this.store.set(address, {
                count: 1,
                resetTime: now + this.windowMs
            });
            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                resetAt: now + this.windowMs
            };
        }
        // Check if limit exceeded
        const remaining = Math.max(0, this.maxRequests - entry.count);
        if (entry.count >= this.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.resetTime
            };
        }
        // Increment count and allow
        entry.count += 1;
        return {
            allowed: true,
            remaining: remaining - 1,
            resetAt: entry.resetTime
        };
    }
    /**
     * Reset rate limit for an address (admin function)
     */
    reset(address) {
        this.store.delete(address);
    }
    /**
     * Get current status for an address
     */
    getStatus(address) {
        const entry = this.store.get(address);
        if (!entry) {
            return null;
        }
        const now = Date.now();
        if (now >= entry.resetTime) {
            return null; // Window expired
        }
        return {
            count: entry.count,
            remaining: Math.max(0, this.maxRequests - entry.count),
            resetAt: entry.resetTime
        };
    }
    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [address, entry] of this.store.entries()) {
            if (now >= entry.resetTime) {
                this.store.delete(address);
            }
        }
    }
    /**
     * Get stats for monitoring
     */
    getStats() {
        // Rough estimate of memory usage
        const memoryPerEntry = 100; // bytes
        return {
            totalTrackedAddresses: this.store.size,
            memoryUsageBytes: this.store.size * memoryPerEntry
        };
    }
}
// Create singleton instance
export const scoreSignatureRateLimiter = new AddressRateLimiter(3, // 3 requests per window
5 * 60 * 1000 // 5 minute window
);
