"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseLoginDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class FirebaseLoginDto {
}
exports.FirebaseLoginDto = FirebaseLoginDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Phone number or identifier linked to the account' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FirebaseLoginDto.prototype, "identifier", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Firebase ID token returned after phone verification' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FirebaseLoginDto.prototype, "firebase_token", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Alternate Firebase ID token field used by the Flutter client' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FirebaseLoginDto.prototype, "firebaseIdToken", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Country code such as +254 or 254' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FirebaseLoginDto.prototype, "country_code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Cloudflare Turnstile token' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FirebaseLoginDto.prototype, "cf_turnstile_response", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Alternate Turnstile token field' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FirebaseLoginDto.prototype, "turnstile_token", void 0);
//# sourceMappingURL=firebase-login.dto.js.map