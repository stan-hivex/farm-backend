"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldEncryption = exports.FieldEncryption = void 0;
exports.initializeFieldEncryption = initializeFieldEncryption;
const crypto = __importStar(require("crypto"));
const common_1 = require("@nestjs/common");
const logger = new common_1.Logger('FieldEncryption');
class FieldEncryption {
    constructor(encryptionKeyHex) {
        this.algorithm = 'aes-256-gcm';
        if (!encryptionKeyHex) {
            throw new Error('Encryption key not provided');
        }
        if (encryptionKeyHex.length !== 64) {
            throw new Error('Encryption key must be 64 hex characters (256 bits)');
        }
        this.encryptionKey = Buffer.from(encryptionKeyHex, 'hex');
    }
    encrypt(plaintext) {
        if (!plaintext)
            return '';
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            const combined = Buffer.concat([iv, tag, encrypted]);
            return combined.toString('base64');
        }
        catch (error) {
            logger.error('Encryption failed:', error);
            throw new Error('Encryption error');
        }
    }
    decrypt(encrypted) {
        if (!encrypted)
            return '';
        try {
            const combined = Buffer.from(encrypted, 'base64');
            const iv = combined.slice(0, 16);
            const tag = combined.slice(16, 32);
            const ciphertext = combined.slice(32);
            const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
            decipher.setAuthTag(tag);
            const decrypted = Buffer.concat([
                decipher.update ? decipher.update(ciphertext) : decipher.update(ciphertext),
                decipher.final(),
            ]);
            return decrypted.toString('utf8');
        }
        catch (error) {
            logger.error('Decryption failed:', error);
            throw new Error('Decryption error - data may be corrupted');
        }
    }
    static generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
}
exports.FieldEncryption = FieldEncryption;
function initializeFieldEncryption(encryptionKeyHex) {
    exports.fieldEncryption = new FieldEncryption(encryptionKeyHex);
    logger.log('✅ Field encryption initialized');
}
//# sourceMappingURL=field-encryption.js.map