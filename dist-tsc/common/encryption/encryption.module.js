"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const field_encryption_1 = require("./field-encryption");
const logger = new common_1.Logger('EncryptionModule');
let EncryptionModule = class EncryptionModule {
};
exports.EncryptionModule = EncryptionModule;
exports.EncryptionModule = EncryptionModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: 'FIELD_ENCRYPTION',
                useFactory: (configService) => {
                    const encryptionKey = configService.get('FIELD_ENCRYPTION_KEY');
                    const nodeEnv = configService.get('NODE_ENV') || process.env.NODE_ENV || 'development';
                    const isProduction = nodeEnv === 'production';
                    let keyToUse = encryptionKey;
                    if (!keyToUse) {
                        keyToUse = require('crypto').randomBytes(32).toString('hex');
                        process.env.FIELD_ENCRYPTION_KEY = keyToUse;
                        logger.warn(isProduction
                            ? '⚠️ FIELD_ENCRYPTION_KEY not configured; generated an ephemeral fallback for this process. Set it explicitly in production.'
                            : '⚠️ FIELD_ENCRYPTION_KEY not configured; using temporary development key. Do not use in production.');
                    }
                    (0, field_encryption_1.initializeFieldEncryption)(keyToUse);
                    return field_encryption_1.fieldEncryption;
                },
                inject: [config_1.ConfigService],
            },
        ],
        exports: ['FIELD_ENCRYPTION'],
    })
], EncryptionModule);
//# sourceMappingURL=encryption.module.js.map