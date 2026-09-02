"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyHashService = void 0;
class ApiKeyHashService {
    static generateAndHashKey() {
        const raw_key = require('crypto').randomBytes(32).toString('hex');
        const key_hash = require('crypto')
            .createHash('sha256')
            .update(raw_key)
            .digest('hex');
        return { raw_key, key_hash };
    }
    static hashKey(key) {
        return require('crypto')
            .createHash('sha256')
            .update(key)
            .digest('hex');
    }
    static async compareKeys(incomingKey, storedHash) {
        try {
            const incomingHash = this.hashKey(incomingKey);
            return incomingHash === storedHash;
        }
        catch (error) {
            return false;
        }
    }
}
exports.ApiKeyHashService = ApiKeyHashService;
ApiKeyHashService.BCRYPT_ROUNDS = 12;
//# sourceMappingURL=api-key-hash.service.js.map