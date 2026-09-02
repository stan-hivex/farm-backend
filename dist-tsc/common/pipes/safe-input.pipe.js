"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeInputValidationPipe = void 0;
const common_1 = require("@nestjs/common");
let SafeInputValidationPipe = class SafeInputValidationPipe {
    constructor() {
        this.suspiciousPatterns = [
            /[\u0000-\u001f\u007f]/,
            /--/,
            /\/\*/,
            /\*\//,
            /;/,
            /\b(?:union|select|insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|waitfor|declare|benchmark|sleep)\b/i,
            /(?:\bor\b|\band\b)\s+\d+\s*=\s*\d+/i,
        ];
        this.allowRawStringFields = new Set([
            'deviceFingerprint',
            'device_fingerprint',
            'frontImageUrl',
            'front_image_url',
            'backImageUrl',
            'back_image_url',
            'selfieImageUrl',
            'selfie_image_url',
            'paymentMethod',
            'payment_method',
            'method',
        ]);
    }
    transform(value, metadata) {
        if (value === null || value === undefined) {
            return value;
        }
        if (typeof value === 'string') {
            if (this.containsSuspiciousPayload(value)) {
                throw new common_1.BadRequestException(`Rejected suspicious input in ${metadata.type ?? 'request'}${metadata.data ? ` for ${metadata.data}` : ''}`);
            }
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.transform(item, metadata));
        }
        if (value && typeof value === 'object') {
            const result = value;
            for (const [key, entryValue] of Object.entries(result)) {
                if (typeof entryValue === 'string' && this.allowRawStringFields.has(key)) {
                    result[key] = entryValue;
                    continue;
                }
                result[key] = this.transform(entryValue, { ...metadata, data: key });
            }
            return result;
        }
        return value;
    }
    containsSuspiciousPayload(input) {
        const trimmed = input.trim();
        if (!trimmed) {
            return false;
        }
        return this.suspiciousPatterns.some((pattern) => pattern.test(trimmed));
    }
};
exports.SafeInputValidationPipe = SafeInputValidationPipe;
exports.SafeInputValidationPipe = SafeInputValidationPipe = __decorate([
    (0, common_1.Injectable)()
], SafeInputValidationPipe);
//# sourceMappingURL=safe-input.pipe.js.map