"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetRateLimiter = void 0;
exports.generatePasswordResetToken = generatePasswordResetToken;
const crypto_1 = require("crypto");
class PasswordResetRateLimiter {
    constructor(windowMs = 15 * 60 * 1000, maxAttempts = 3) {
        this.windowMs = windowMs;
        this.maxAttempts = maxAttempts;
        this.buckets = new Map();
    }
    allowRequest(key, now = Date.now()) {
        const bucket = this.buckets.get(key);
        if (!bucket || now - bucket.windowStart >= this.windowMs) {
            this.buckets.set(key, { count: 1, windowStart: now });
            return true;
        }
        bucket.count += 1;
        if (bucket.count > this.maxAttempts) {
            return false;
        }
        return true;
    }
    reset(key) {
        this.buckets.delete(key);
    }
}
exports.PasswordResetRateLimiter = PasswordResetRateLimiter;
function generatePasswordResetToken(bytes = 32) {
    return (0, crypto_1.randomBytes)(bytes).toString('hex');
}
//# sourceMappingURL=password-reset.util.js.map